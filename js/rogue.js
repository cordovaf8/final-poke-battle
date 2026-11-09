(() => {
  const $ = sel => document.querySelector(sel);
  const els = {
    backdrop: $('#backdrop'), wins: $('#wins'), foes: $('#foes'), best: $('#best'), team: $('#team'),
    startPanel: $('#startPanel'), readyPanel: $('#readyPanel'), rollPanel: $('#rollPanel'),
    offerPanel: $('#offerPanel'), overPanel: $('#overPanel'),
    readyKicker: $('#readyKicker'), readyTitle: $('#readyTitle'), readyText: $('#readyText'),
    fight: $('#fightBtn'), quit: $('#quitBtn'),
    rollKicker: $('#rollKicker'), rollTitle: $('#rollTitle'), rollText: $('#rollText'), rollBtn: $('#rollBtn'),
    die: $('#die'), dieGlow: $('#dieGlow'), dieResult: $('#dieResult'),
    offerKicker: $('#offerKicker'), offerCard: $('#offerCard'), offerBurst: $('#offerBurst'), offerSprite: $('#offerSprite'),
    offerName: $('#offerName'), offerTypes: $('#offerTypes'), offerStats: $('#offerStats'), keep: $('#keepBtn'),
    offerHelp: $('#offerHelp'),
    overTitle: $('#overTitle'), overText: $('#overText'),
    toast: $('#toast'), flash: $('#flash'), music: $('#musicBtn'),
  };
  const PANELS = ['startPanel', 'readyPanel', 'rollPanel', 'offerPanel', 'overPanel'];
  // Pip positions on a 3×3 grid for each face. The die only goes up to 5, one face per star rating.
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8] };
  const ROLL_COLORS = { 1: '#9aa2d6', 2: '#6bd96b', 3: '#4fb8ff', 4: '#c77dff', 5: '#ffd23f' };
  const STAT_LABELS = { hp: 'HP', attack: 'Atk', defense: 'Def', 'special-attack': 'SpA', 'special-defense': 'SpD', speed: 'Spe' };

  let run = Rogue.getRun();
  let team = []; // details for run.team, in slot order
  let offer = null; // details of the offered Pokémon
  let busy = false;

  const rand = (min, max) => min + Math.random() * (max - min);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const typeBadge = t => `<span class="type" style="--type: var(--${t})">${t}</span>`;
  const bstOf = d => Object.values(d.stats).reduce((a, b) => a + b, 0);
  // Team slots lost in the last battle that still need a rolled replacement.
  const fallen = () => run?.fallen || [];
  const starRow = n => `<span class="stars">${'★'.repeat(n)}<span class="stars-dim">${'★'.repeat(5 - n)}</span></span>`;

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
      .to(els.toast, { y: 20, opacity: 0, duration: 0.3, delay: 3 });
  }

  // Little dice drift up behind everything.
  function buildBackdrop() {
    const dice = Array.from({ length: 22 }, () => {
      const d = document.createElement('span');
      d.className = 'rg-mote';
      d.style.left = `${rand(0, 100)}%`;
      d.style.top = `${rand(0, 100)}%`;
      const size = rand(8, 22);
      d.style.width = d.style.height = `${size}px`;
      return d;
    });
    els.backdrop.replaceChildren(...dice);
    dice.forEach(d => gsap.to(d, {
      y: () => rand(-220, -80), rotation: () => rand(-180, 180), opacity: () => rand(0.05, 0.35),
      duration: () => rand(6, 12), repeat: -1, yoyo: true, ease: 'sine.inOut', repeatRefresh: true,
    }));
  }

  // ---------- Team ----------

  function monCard(d, slot) {
    const lost = fallen().includes(slot);
    return `
      <button type="button" class="rg-mon${lost ? ' fallen' : ''}" data-slot="${slot}" style="--t1: var(--${d.types[0]})" aria-label="${d.name}">
        <span class="rg-mon-stage"><img alt=""></span>
        <span class="rg-mon-name">${d.name}</span>
        <span class="rg-mon-types">${d.types.map(typeBadge).join('')}</span>
        <span class="rg-mon-stars">${PokeAPI.starsHtml(bstOf(d))}</span>
        <span class="rg-swap-tag">Swap out</span>
        ${lost ? '<span class="rg-fallen-tag">Fainted</span>' : ''}
      </button>`;
  }

  function renderTeam() {
    els.team.innerHTML = team.map(monCard).join('');
    els.team.querySelectorAll('img').forEach((img, i) => {
      setSprite(img, team[i].id);
      gsap.to(img, { y: -4, duration: 0.5, repeat: -1, yoyo: true, ease: 'steps(1)', delay: i * 0.17 });
    });
  }

  async function loadTeam() {
    team = await Promise.all(run.team.map(id => PokeAPI.loadDetails(id)));
  }

  // ---------- Panels ----------

  function showPanel(name) {
    PANELS.forEach(p => { els[p].hidden = p !== name; });
    gsap.fromTo(els[name], { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'power2.out' });
    // Team members are only swap targets for a free offer, not a replacement for a fallen one.
    document.body.classList.toggle('choosing', name === 'offerPanel' && !fallen().length);
    document.body.classList.toggle('run-over', name === 'overPanel');
  }

  function render() {
    els.best.textContent = Rogue.best();
    els.team.hidden = !run;
    if (!run) {
      els.wins.textContent = '—';
      els.foes.textContent = '—';
      showPanel('startPanel');
      return;
    }
    els.wins.textContent = run.wins;
    els.foes.innerHTML = run.over ? '—' : starRow(Rogue.foeStars(run.wins));
    if (run.over) {
      els.overTitle.textContent = `Your team fell in battle ${run.wins + 1}`;
      els.overText.textContent = `You won ${plural(run.wins, 'battle')}. Best run: ${plural(Rogue.best(), 'win')}.`;
      showPanel('overPanel');
    } else if (run.offer) {
      showPanel('offerPanel');
      paintOfferMode();
      paintOffer(run.offer.roll);
    } else if (run.pendingRoll) {
      const lost = fallen();
      els.rollKicker.textContent = `Battle ${run.wins} won!`;
      if (lost.length) {
        const name = team[lost[0]].name;
        els.rollTitle.textContent = `Replace ${name}`;
        els.rollText.textContent = `${name} fainted and left your team. The Pokémon you roll takes its place.`
          + (lost.length > 1 ? ` ${team[lost[1]].name} fell too, so a second roll follows.` : '');
      } else {
        els.rollTitle.textContent = 'Roll the die';
        els.rollText.textContent = "The roll sets the star rating of the Pokémon you're offered.";
      }
      els.dieResult.innerHTML = '';
      gsap.set(els.dieGlow, { opacity: 0 });
      paintDie(run.roll || 5);
      els.rollBtn.disabled = false;
      showPanel('rollPanel');
      // Idle wobble until it's thrown.
      gsap.fromTo(els.die, { rotation: -6 }, { rotation: 6, duration: 0.8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    } else {
      const n = run.wins + 1;
      const stars = Rogue.foeStars(run.wins);
      els.readyKicker.textContent = run.wins ? 'Next up' : 'Your run begins';
      els.readyTitle.textContent = `Battle ${n}`;
      els.readyText.innerHTML = `Three wild ${starRow(stars)} Pokémon stand in your way.`
        + (stars < 5 ? ` Foes get a star tougher every two wins.` : ' From here on, every foe is a 5★ powerhouse.');
      showPanel('readyPanel');
    }
  }

  // ---------- The die ----------

  function paintDie(n) {
    els.die.innerHTML = Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('');
  }

  // Tumbles the die, flicking between faces more and more slowly, and lands on the result.
  function tumble(result) {
    gsap.killTweensOf(els.die);
    return new Promise(resolve => {
      const tl = gsap.timeline({ onComplete: resolve });
      let t = 0;
      let face = 0;
      for (let gap = 0.05; t < 1.5; t += gap, gap *= 1.13) {
        let next;
        do { next = 1 + Math.floor(Math.random() * 5); } while (next === face);
        face = next;
        tl.add(() => paintDie(next), t);
      }
      tl.add(() => paintDie(result), t)
        .fromTo(els.die, { rotation: 0 }, { rotation: 1080, duration: t, ease: 'power3.out' }, 0)
        .to(els.die, { keyframes: { y: [0, -110, 0, -50, 0, -16, 0] }, duration: t, ease: 'none' }, 0)
        .to(els.die, { scaleX: 1.2, scaleY: 0.82, duration: 0.08, yoyo: true, repeat: 1 }, t)
        .add(() => revealRoll(result), t);
    });
  }

  function revealRoll(n) {
    const color = ROLL_COLORS[n];
    els.dieGlow.style.setProperty('--glow', color);
    gsap.fromTo(els.dieGlow, { opacity: 1, scale: 0.4 }, { opacity: 0.55, scale: 1.3, duration: 0.6, ease: 'power2.out' });
    els.dieResult.innerHTML = `${starRow(n)} <b>${n}-star Pokémon!</b>`;
    gsap.fromTo(els.dieResult, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2.4)' });
    sparkle(els.die, color, n * 6);
  }

  function sparkle(el, color, count) {
    const box = el.getBoundingClientRect();
    for (let i = 0; i < count; i += 1) {
      const s = document.createElement('i');
      s.className = 'rg-spark';
      s.style.setProperty('--c', color);
      s.style.left = `${box.left + box.width / 2}px`;
      s.style.top = `${box.top + box.height / 2}px`;
      document.body.appendChild(s);
      const a = rand(0, Math.PI * 2);
      const d = rand(60, 150);
      gsap.to(s, {
        x: Math.cos(a) * d, y: Math.sin(a) * d, scale: 0, rotation: rand(-180, 180),
        duration: rand(0.6, 1.1), ease: 'power2.out', onComplete: () => s.remove(),
      });
    }
  }

  async function roll() {
    if (busy || !run?.pendingRoll) return;
    busy = true;
    els.rollBtn.disabled = true;
    const result = Rogue.roll(); // saved at once, so a refresh can't reroll
    // Draw the Pokémon while the die is still tumbling.
    const drawing = PokeAPI.pickByBst(1, PokeAPI.starRange(result), run.team)
      .then(([id]) => id && PokeAPI.loadDetails(id));
    await tumble(result);
    let drawn;
    try {
      drawn = await drawing;
    } catch {
      drawn = null;
    }
    busy = false;
    if (!drawn) {
      toast('Could not reach PokéAPI. Your roll is saved, try again.');
      els.rollBtn.disabled = false;
      return;
    }
    await new Promise(r => setTimeout(r, 700));
    Rogue.setOffer({ roll: result, id: drawn.id });
    run = Rogue.getRun();
    offer = drawn;
    showPanel('offerPanel');
    paintOfferMode();
    paintOffer(result, true);
  }

  // A free offer can be swapped in or turned down; a replacement for a fallen Pokémon must join.
  function paintOfferMode() {
    const lost = fallen();
    if (lost.length) {
      els.offerHelp.textContent = `It takes ${team[lost[0]].name}'s place on your team.`;
      els.keep.textContent = 'Add to team';
      els.keep.classList.add('primary');
    } else {
      els.offerHelp.textContent = 'Click a team member above to swap it out, or keep your team.';
      els.keep.textContent = 'Keep my team';
      els.keep.classList.remove('primary');
    }
  }

  // ---------- The offer ----------

  async function paintOffer(rolled, fanfare = false) {
    if (!offer || offer.id !== run.offer.id) {
      try {
        offer = await PokeAPI.loadDetails(run.offer.id);
      } catch {
        toast('Could not load the offered Pokémon. Check your connection.');
        return;
      }
    }
    const bst = bstOf(offer);
    els.offerKicker.innerHTML = `You rolled a ${rolled} · ${starRow(rolled)}`;
    els.offerName.textContent = offer.name;
    els.offerTypes.innerHTML = offer.types.map(typeBadge).join('') + PokeAPI.starsHtml(bst);
    els.offerStats.innerHTML = Object.entries(offer.stats).map(([k, v]) => `
      <span class="offer-stat"><b>${STAT_LABELS[k] || k}</b><i style="--v: ${Math.min(v / 160, 1)}"></i><em>${v}</em></span>`).join('')
      + `<span class="offer-total">Total <b>${bst}</b></span>`;
    els.offerCard.style.setProperty('--t1', `var(--${offer.types[0]})`);
    setSprite(els.offerSprite, offer.id);
    gsap.killTweensOf(els.offerSprite);
    if (fanfare) {
      gsap.timeline()
        .fromTo(els.offerBurst, { scale: 0.2, opacity: 1 }, { scale: 1.6, opacity: 0, duration: 0.8, ease: 'power2.out' })
        .fromTo(els.offerSprite, { y: -120, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'bounce.out' }, 0.05)
        .fromTo('.offer-stat', { opacity: 0, x: 10 }, { opacity: 1, x: 0, duration: 0.25, stagger: 0.05 }, 0.3);
    }
    gsap.to(els.offerSprite, { y: -5, duration: 0.45, repeat: -1, yoyo: true, ease: 'steps(1)', delay: fanfare ? 0.8 : 0 });
  }

  // Flies a copy of the offered sprite into the team slot, then commits the swap.
  async function swap(slot) {
    if (busy || !run.offer || !offer) return;
    busy = true;
    const card = els.team.querySelector(`.rg-mon[data-slot="${slot}"]`);
    const oldImg = card.querySelector('img');
    const leaving = team[slot].name;
    const from = els.offerSprite.getBoundingClientRect();
    const to = card.querySelector('.rg-mon-stage').getBoundingClientRect();

    gsap.killTweensOf(oldImg);
    await gsap.to(oldImg, { scale: 0, opacity: 0, filter: 'brightness(3)', duration: 0.35, ease: 'back.in(2)' });
    const ghost = els.offerSprite.cloneNode();
    ghost.className = 'rg-ghost';
    Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.appendChild(ghost);
    await gsap.to(ghost, {
      x: to.left + to.width / 2 - (from.left + from.width / 2),
      y: to.top + to.height / 2 - (from.top + from.height / 2),
      scale: Math.min(1, to.height / from.height), duration: 0.55, ease: 'power2.inOut',
    });
    ghost.remove();

    Rogue.resolveOffer(slot);
    run = Rogue.getRun();
    team[slot] = offer;
    const joined = offer.name;
    offer = null;
    renderTeam();
    const fresh = els.team.querySelector(`.rg-mon[data-slot="${slot}"]`);
    gsap.fromTo(fresh, { scale: 1.15 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
    sparkle(fresh, '#5ff0c2', 18);
    toast(card.classList.contains('fallen') ? `${joined} takes ${leaving}'s place!` : `${joined} joins your team in place of ${leaving}!`);
    busy = false;
    render();
  }

  async function keepTeam() {
    if (busy || !run.offer) return;
    busy = true;
    await gsap.to(els.offerCard, { y: 40, opacity: 0, duration: 0.3, ease: 'power2.in' });
    gsap.set(els.offerCard, { clearProps: 'all' });
    Rogue.resolveOffer(null);
    run = Rogue.getRun();
    offer = null;
    busy = false;
    render();
  }

  // ---------- Run actions ----------

  function fight() {
    if (busy) return;
    busy = true;
    gsap.to(els.flash, { opacity: 1, duration: 0.35, ease: 'power2.in', onComplete: () => { location.href = 'battle.html?mode=rogue'; } });
  }

  // Giving up takes a second click, so a stray click can't end a long run.
  let quitArmed = null;
  function quit() {
    if (!quitArmed) {
      els.quit.textContent = 'Click again to give up';
      els.quit.classList.add('armed');
      quitArmed = setTimeout(() => {
        quitArmed = null;
        els.quit.textContent = 'Give up run';
        els.quit.classList.remove('armed');
      }, 3000);
      return;
    }
    clearTimeout(quitArmed);
    quitArmed = null;
    Rogue.endRun();
    run = Rogue.getRun();
    render();
  }

  // ---------- Controls ----------

  function updateMusicButton() {
    const on = Music.isEnabled();
    els.music.setAttribute('aria-pressed', String(on));
    els.music.textContent = on ? '♫ Music on' : '♫ Music off';
  }

  // Controller: the D-pad steps through whatever can be pressed right now; A presses it.
  function padTargets() {
    const choosing = document.body.classList.contains('choosing');
    return [...document.querySelectorAll('.rg-team .rg-mon, .rg-panel:not([hidden]) .btn')]
      .filter(el => !el.disabled && (choosing || !el.matches('.rg-mon')));
  }

  function bind() {
    els.rollBtn.addEventListener('click', roll);
    els.keep.addEventListener('click', () => (fallen().length ? swap(fallen()[0]) : keepTeam()));
    els.fight.addEventListener('click', fight);
    els.quit.addEventListener('click', quit);
    els.team.addEventListener('click', e => {
      const card = e.target.closest('.rg-mon');
      if (card && document.body.classList.contains('choosing')) swap(Number(card.dataset.slot));
    });
    els.music.addEventListener('click', () => {
      Music.toggle();
      updateMusicButton();
    });
    Gamepad.on(action => {
      if (action === 'select') {
        els.music.click();
        return;
      }
      if (action === 'back') {
        if (!run?.offer && !busy) location.href = 'index.html';
        return;
      }
      const targets = padTargets();
      if (!targets.length) return;
      const index = targets.indexOf(document.activeElement);
      if (action === 'confirm' || action === 'start') {
        (targets[index] || targets[0]).click();
      } else if (['left', 'right', 'up', 'down'].includes(action)) {
        const step = action === 'left' || action === 'up' ? -1 : 1;
        targets[index < 0 ? 0 : (index + step + targets.length) % targets.length].focus();
      }
    });
  }

  async function init() {
    buildBackdrop();
    bind();
    updateMusicButton();
    Music.play('menu');
    if (run) {
      try {
        await loadTeam();
      } catch {
        toast('Could not reach PokéAPI. Check your connection and refresh.');
        return;
      }
      renderTeam();
      gsap.from('.rg-mon', { y: 30, opacity: 0, duration: 0.5, stagger: 0.1, ease: 'back.out(1.7)' });
    }
    render();
    gsap.fromTo(els.flash, { opacity: 1 }, { opacity: 0, duration: 0.5 });
  }

  init();
})();
