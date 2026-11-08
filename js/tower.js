(() => {
  const $ = sel => document.querySelector(sel);
  const els = {
    scene: $('#scene'), tower: $('#tower'), floors: $('#floors'), roof: $('#roof'), beacon: $('#beacon'),
    climbers: $('#climbers'), stars: $('#stars'), clouds: $('#clouds'), card: $('#card'),
    kicker: $('#cardKicker'), title: $('#cardTitle'), trainer: $('#cardTrainer'), pips: $('#pips'),
    stars2: $('#cardStars'), bst: $('#cardBst'), team: $('#cardTeam'), enter: $('#enterBtn'), reset: $('#resetBtn'),
    best: $('#cardBest'), banner: $('#banner'), again: $('#againBtn'), toast: $('#toast'),
    fireworks: $('#fireworks'), flash: $('#flash'), music: $('#musicBtn'), beams: $('.beams'),
  };
  const FLOORS = Tower.FLOORS;
  const TOP = FLOORS.length; // run.floor === TOP means conquered

  const params = new URLSearchParams(location.search);
  const cleared = Number(params.get('cleared')) || 0; // floor number (1–4) just won
  const fell = Number(params.get('fell')) || 0; // floor number (1–4) just lost
  // Don't replay the climb/fall animation on a refresh.
  if (cleared || fell) history.replaceState(null, '', 'tower.html');

  let team = [];
  try { team = JSON.parse(localStorage.getItem('pokemonTeam')) || []; } catch { /* no team */ }
  let run = Tower.getRun();
  let busy = false;

  const rand = (min, max) => min + Math.random() * (max - min);
  const floorEl = i => els.floors.querySelector(`.floor[data-floor="${i}"]`);

  function setSprite(img, id) {
    const sources = PokeAPI.spriteSources(id);
    let i = 0;
    img.onerror = () => {
      i += 1;
      if (i < sources.length) img.src = sources[i];
    };
    img.src = sources[0];
  }

  function toast(message) {
    els.toast.textContent = message;
    gsap.killTweensOf(els.toast);
    gsap.timeline()
      .fromTo(els.toast, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25 })
      .to(els.toast, { y: 20, opacity: 0, duration: 0.3, delay: 3.2 });
  }

  // ---------- Sky ----------

  function buildSky() {
    const stars = Array.from({ length: 110 }, () => {
      const s = document.createElement('span');
      s.className = `star${Math.random() < 0.15 ? ' big' : ''}`;
      s.style.left = `${rand(0, 100)}%`;
      s.style.top = `${rand(0, 70)}%`;
      return s;
    });
    els.stars.replaceChildren(...stars);
    stars.forEach(s => gsap.fromTo(s, { opacity: rand(0.1, 0.5) }, {
      opacity: rand(0.6, 1), duration: rand(0.8, 2.6), repeat: -1, yoyo: true, ease: 'sine.inOut', delay: rand(0, 2),
    }));

    const clouds = Array.from({ length: 5 }, (_, i) => {
      const c = document.createElement('div');
      c.className = 'cloud';
      c.style.top = `${12 + i * 13}%`;
      c.style.width = `${rand(180, 380)}px`;
      return c;
    });
    els.clouds.replaceChildren(...clouds);
    clouds.forEach(c => gsap.fromTo(c, { x: '-40vw' }, { x: '120vw', duration: rand(70, 140), repeat: -1, ease: 'none' }).progress(Math.random()));

    const shootingStar = () => {
      const s = document.createElement('div');
      s.className = 'shooting-star';
      s.style.left = `${rand(10, 70)}%`;
      s.style.top = `${rand(5, 35)}%`;
      els.stars.appendChild(s);
      gsap.timeline({ onComplete: () => s.remove() })
        .to(s, { opacity: 1, duration: 0.1 })
        .to(s, { x: 260, y: 120, opacity: 0, duration: 0.9, ease: 'power1.in' }, 0);
      gsap.delayedCall(rand(4, 9), shootingStar);
    };
    gsap.delayedCall(2, shootingStar);
  }

  // ---------- Tower ----------

  function renderFloors() {
    // Highest floor first so it stacks on top.
    els.floors.innerHTML = FLOORS.map((floor, i) => `
      <div class="floor" data-floor="${i}" style="--accent: ${floor.color}; --w: ${100 - i * 7}%">
        <div class="floor-windows">${'<span class="win"></span>'.repeat(3)}</div>
        <div class="floor-plate"><b>${Tower.ROMAN[i]}</b>${floor.name}</div>
      </div>`).reverse().join('');
  }

  function paintFloors(next) {
    els.floors.querySelectorAll('.floor').forEach(el => {
      const i = Number(el.dataset.floor);
      el.classList.toggle('cleared', i < next);
      el.classList.toggle('current', i === next);
      el.classList.toggle('locked', i > next);
    });
    els.tower.classList.toggle('conquered', next >= TOP);
  }

  // Where the team stands: the base of a floor, or the roof once conquered.
  function standPoint(index) {
    const wrap = els.climbers.parentElement.getBoundingClientRect();
    const target = (index >= TOP ? els.roof : floorEl(index)).getBoundingClientRect();
    return {
      left: target.left + target.width / 2 - wrap.left,
      top: (index >= TOP ? target.bottom - 4 : target.bottom - 6) - wrap.top,
    };
  }

  function placeClimbers(index) {
    const { left, top } = standPoint(index);
    gsap.set(els.climbers, { left, top });
  }

  function hopTo(index) {
    const from = { left: gsap.getProperty(els.climbers, 'left'), top: gsap.getProperty(els.climbers, 'top') };
    const to = standPoint(index);
    return gsap.timeline()
      .to(els.climbers, { top: Math.min(from.top, to.top) - 70, left: (from.left + to.left) / 2, duration: 0.38, ease: 'power2.out' })
      .to(els.climbers, { top: to.top, left: to.left, duration: 0.42, ease: 'bounce.out' });
  }

  function sparkles(el, count = 18) {
    const wrap = els.climbers.parentElement.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'sparkle';
      s.style.left = `${r.left - wrap.left + rand(0, r.width)}px`;
      s.style.top = `${r.top - wrap.top + rand(0, r.height)}px`;
      els.climbers.parentElement.appendChild(s);
      gsap.fromTo(s, { scale: 0, opacity: 1 }, {
        scale: rand(0.8, 1.6), y: rand(-60, -20), x: rand(-30, 30), opacity: 0, duration: rand(0.7, 1.3), ease: 'power2.out',
        onComplete: () => s.remove(),
      });
    }
  }

  // ---------- Card ----------

  function renderCard() {
    const next = run.floor;
    const pipHtml = FLOORS.map((_, i) => `<span class="pip${i < next ? ' done' : i === next ? ' now' : ''}"></span>`).join('');
    els.pips.innerHTML = pipHtml;
    const best = Tower.best();
    els.best.textContent = best ? `Best: ${best >= TOP ? 'conquered the tower' : `cleared Floor ${Tower.ROMAN[best - 1]}`}` : 'No floors cleared yet';

    if (next >= TOP) {
      els.card.style.setProperty('--card-accent', '#ffd23f');
      els.kicker.textContent = 'Summit reached';
      els.title.textContent = 'Tower conquered!';
      els.trainer.textContent = 'Every floor has fallen to your team.';
      els.stars2.textContent = '★★★★';
      els.bst.textContent = '—';
      els.enter.textContent = 'Climb again';
      els.reset.hidden = true;
      return;
    }
    const floor = FLOORS[next];
    els.card.style.setProperty('--card-accent', floor.color);
    els.kicker.textContent = next === 0 ? 'The climb begins' : 'Next challenge';
    els.title.textContent = `Floor ${Tower.ROMAN[next]} · ${floor.name}`;
    els.trainer.textContent = `${floor.trainer} awaits${floor.stars === 4 ? ' at the top.' : '.'}`;
    els.stars2.innerHTML = `${'★'.repeat(floor.stars)}<span class="dim">${'★'.repeat(4 - floor.stars)}</span>`;
    els.stars2.setAttribute('aria-label', `${floor.stars} of 4`);
    els.bst.textContent = `BST ${floor.bst[0]}–${floor.bst[1]}`;
    els.enter.textContent = `Enter Floor ${Tower.ROMAN[next]}`;
    els.reset.hidden = next === 0;
  }

  function renderTeam() {
    const imgs = team.map(p => {
      const img = document.createElement('img');
      img.alt = p.name;
      setSprite(img, p.id);
      return img;
    });
    els.team.replaceChildren(...imgs);
    els.climbers.replaceChildren(...imgs.map(img => img.cloneNode()));
    els.climbers.querySelectorAll('img').forEach((img, i) => {
      setSprite(img, team[i].id);
      gsap.to(img, { y: -4, duration: 0.3, ease: 'steps(1)', repeat: -1, yoyo: true, delay: i * 0.12 });
    });
  }

  // ---------- Actions ----------

  function enterFloor() {
    if (busy) return;
    if (!team.length) {
      location.href = 'index.html';
      return;
    }
    if (run.floor >= TOP) {
      restart();
      return;
    }
    busy = true;
    // Zoom into the floor, flash, then into battle.
    const target = floorEl(run.floor).getBoundingClientRect();
    const tower = els.tower.getBoundingClientRect();
    const origin = `${target.left + target.width / 2 - tower.left}px ${target.top + target.height / 2 - tower.top}px`;
    gsap.timeline({ onComplete: () => { location.href = `battle.html?mode=tower&floor=${run.floor + 1}`; } })
      .to(els.card, { x: 60, opacity: 0, duration: 0.3, ease: 'power2.in' })
      .to([els.tower, els.climbers], { scale: 2.6, transformOrigin: origin, duration: 0.8, ease: 'power3.in' }, 0.1)
      .to(els.flash, { opacity: 1, duration: 0.25 }, 0.7);
  }

  function restart() {
    Tower.setFloor(0);
    run = Tower.getRun();
    hideBanner();
    paintFloors(0);
    renderCard();
    hopTo(0);
    gsap.to(els.beams, { opacity: 0, duration: 0.6 });
    toast('A fresh climb begins at Floor I.');
  }

  // ---------- Celebrations ----------

  function fireworks(duration = 7000) {
    const canvas = els.fireworks;
    const ctx = canvas.getContext('2d');
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    const particles = [];
    const end = performance.now() + duration;
    let lastBurst = 0;

    const burst = () => {
      const x = rand(0.15, 0.85) * canvas.width;
      const y = rand(0.1, 0.45) * canvas.height;
      const hue = rand(0, 360);
      for (let i = 0; i < 80; i++) {
        const angle = (Math.PI * 2 * i) / 80;
        const speed = rand(1.5, 5.5);
        particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, hue: hue + rand(-20, 20) });
      }
    };

    const frame = now => {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';
      if (now < end && now - lastBurst > 420) {
        burst();
        lastBurst = now;
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.05;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.011;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${p.life})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (particles.length || now < end) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    requestAnimationFrame(frame);
  }

  function showBanner() {
    els.banner.hidden = false;
    gsap.fromTo('.banner-card', { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(1.8)' });
    els.again.focus();
  }

  function hideBanner() {
    els.banner.hidden = true;
  }

  function celebrateSummit() {
    gsap.to(els.beams, { opacity: 1, duration: 1 });
    gsap.to(els.beams, { rotation: 360, duration: 24, repeat: -1, ease: 'none' });
    gsap.fromTo(els.beacon, { scale: 1 }, { scale: 1.5, duration: 0.6, yoyo: true, repeat: 3, ease: 'sine.inOut' });
    fireworks();
    Music.play('victory');
    gsap.delayedCall(1.2, showBanner);
  }

  // ---------- Story beats after a battle ----------

  function playCleared(n) {
    const index = n - 1;
    paintFloors(index);
    placeClimbers(index);
    const floor = floorEl(index);
    gsap.timeline({ delay: 1.1, onComplete: () => { busy = false; } })
      .add(() => { busy = true; })
      .to(floor, { filter: 'brightness(2.2)', duration: 0.15, yoyo: true, repeat: 1 })
      .add(() => {
        paintFloors(index + 1);
        sparkles(floor, 24);
      })
      // Measured when the hop starts, not while the intro still has the tower offset.
      .add(() => hopTo(index + 1), '+=0.2')
      .to({}, { duration: 0.85 })
      .add(() => {
        renderCard();
        if (index + 1 >= TOP) celebrateSummit();
        else toast(`Floor ${Tower.ROMAN[index]} cleared! Onward to ${FLOORS[index + 1].name}.`);
      });
  }

  function playFell(n) {
    const index = n - 1;
    paintFloors(index);
    placeClimbers(index);
    const floor = floorEl(index);
    const base = standPoint(0);
    gsap.timeline({ delay: 1.1, onComplete: () => { busy = false; } })
      .add(() => { busy = true; })
      .to(floor, { x: -8, duration: 0.06, repeat: 5, yoyo: true, ease: 'none' })
      .to(floor, { x: 0, duration: 0.06 })
      .to(floor, { filter: 'sepia(1) saturate(6) hue-rotate(-40deg) brightness(0.8)', duration: 0.2, yoyo: true, repeat: 1 }, '<')
      .to(els.climbers, { top: base.top + 40, rotation: 200, opacity: 0, duration: 0.7, ease: 'power2.in' })
      .add(() => {
        paintFloors(0);
        gsap.set(els.climbers, { rotation: 0, left: base.left, top: base.top - 60 });
      })
      .to(els.climbers, { opacity: 1, top: base.top, duration: 0.6, ease: 'bounce.out' })
      .add(() => {
        renderCard();
        toast(`Your team fell on Floor ${Tower.ROMAN[index]}. The climb starts over.`);
      });
  }

  // ---------- Input ----------

  function updateMusicButton() {
    const on = Music.isEnabled();
    els.music.setAttribute('aria-pressed', String(on));
    els.music.textContent = on ? '♫ Music on' : '♫ Music off';
  }

  function bind() {
    els.enter.addEventListener('click', enterFloor);
    els.reset.addEventListener('click', () => !busy && restart());
    els.again.addEventListener('click', restart);
    els.music.addEventListener('click', () => {
      Music.toggle();
      updateMusicButton();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') location.href = 'index.html';
    });
    Gamepad.on(action => {
      if (action === 'confirm' || action === 'start') (els.banner.hidden ? enterFloor : restart)();
      else if (action === 'back') location.href = 'index.html';
      else if (action === 'select') els.music.click();
    });
    addEventListener('resize', () => {
      if (!busy) placeClimbers(Math.min(run.floor, TOP));
    });
  }

  // ---------- Boot ----------

  function init() {
    // Anchor the team by its bottom-centre (set through GSAP so its own y tweens don't override it).
    gsap.set(els.climbers, { xPercent: -50, yPercent: -100 });
    buildSky();
    renderFloors();
    renderTeam();
    renderCard();
    updateMusicButton();
    bind();
    Music.play('tower');

    if (!team.length) {
      els.title.textContent = 'No team yet';
      els.trainer.textContent = 'Pick your 3 Pokémon on the team select screen first.';
      els.enter.textContent = 'Go to team select';
    }

    // Lay out the floors and the team first; the intro below temporarily offsets the tower.
    if (cleared) {
      busy = true;
      playCleared(cleared);
    } else if (fell) {
      busy = true;
      playFell(fell);
    } else {
      paintFloors(run.floor);
      placeClimbers(Math.min(run.floor, TOP));
      if (run.floor >= TOP) {
        gsap.set(els.beams, { opacity: 1 });
        gsap.to(els.beams, { rotation: 360, duration: 24, repeat: -1, ease: 'none' });
      }
    }

    // The tower rises into view, the floors light up, then the card slides in.
    gsap.timeline()
      .from(els.tower, { y: '60vh', duration: 1.1, ease: 'power3.out' })
      .from('.floor', { opacity: 0, duration: 0.3, stagger: -0.12 }, '-=0.4')
      .from(els.card, { x: 80, opacity: 0, duration: 0.5, ease: 'power3.out' }, '-=0.3');
    gsap.from(els.climbers, { opacity: 0, y: -30, duration: 0.6, delay: 1.1, ease: 'bounce.out' });
  }

  init();
})();
