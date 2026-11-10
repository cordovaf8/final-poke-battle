// The title menu: pick a game mode first, then build a team for it on team.html.
// Modes with progress to pick up again (a tower climb, a Rogue run, an Adventure) also offer to continue.
(() => {
  const $ = sel => document.querySelector(sel);
  const els = { modes: $('#modes'), lastTeam: $('#lastTeam'), motes: $('#motes'), flash: $('#flash'), music: $('#musicBtn') };

  const rand = (min, max) => min + Math.random() * (max - min);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function readTeam() {
    try {
      const team = JSON.parse(localStorage.getItem('pokemonTeam'));
      return Array.isArray(team) && team.length === 3 ? team : null;
    } catch {
      return null;
    }
  }

  // What each mode shows under its description, and a shortcut to pick up where you left off.
  // continueTo: { label, url } or null.
  function progress(id, team) {
    if (id === 'wild') {
      return {
        status: team ? `Last team: ${team.map(p => p.name).join(', ')}` : 'No team yet',
        continueTo: team && { label: 'Battle with last team', url: 'battle.html' },
      };
    }
    if (id === 'tower') {
      const best = Tower.best();
      const floor = team ? Tower.getRun().floor : 0;
      const top = Tower.FLOORS.length;
      return {
        status: best ? `Best: ${best >= top ? 'conquered the tower' : `cleared Floor ${Tower.ROMAN[best - 1]}`}` : 'No floors cleared yet',
        continueTo: team && floor > 0 && {
          label: floor >= top ? 'Back to the summit' : `Continue at Floor ${Tower.ROMAN[floor]}`, url: 'tower.html',
        },
      };
    }
    if (id === 'rogue') {
      const run = Rogue.getRun();
      return {
        status: `Best run: ${plural(Rogue.best(), 'win')}`,
        continueTo: run && !run.over && { label: `Continue run (${plural(run.wins, 'win')})`, url: 'rogue.html' },
      };
    }
    const run = Adventure.getRun();
    const clears = Adventure.clears();
    return {
      status: clears ? `Adventures completed: ${clears}` : 'No adventures completed yet',
      continueTo: run && !run.over && {
        label: run.path.length ? `Continue (stop ${run.path.length} of ${Adventure.ROWS + 1})` : 'Continue adventure', url: 'adventure.html',
      },
    };
  }

  function renderModes() {
    const team = readTeam();
    els.modes.innerHTML = Modes.LIST.map(mode => {
      const { status, continueTo } = progress(mode.id, team);
      return `
        <article class="mn-mode" style="--c: ${mode.color}">
          <span class="mn-icon" aria-hidden="true">${mode.icon}</span>
          <h2>${mode.name}</h2>
          <p class="mn-text">${mode.text}</p>
          <p class="mn-status">${status}</p>
          <div class="mn-actions">
            <button type="button" class="btn primary ${mode.cls}" data-url="${Modes.teamUrl(mode.id)}">${mode.id === 'rogue' ? 'Pick 1★ team' : 'Choose team'}</button>
            ${continueTo ? `<button type="button" class="btn" data-url="${continueTo.url}">${continueTo.label}</button>` : ''}
          </div>
        </article>`;
    }).join('');
  }

  function renderLastTeam() {
    const team = readTeam();
    if (!team) return;
    els.lastTeam.innerHTML = team.map(() => '<img alt="">').join('');
    els.lastTeam.querySelectorAll('img').forEach((img, i) => {
      const sources = PokeAPI.spriteSources(team[i].id);
      let k = 0;
      img.onerror = () => {
        k += 1;
        if (k < sources.length) img.src = sources[k];
      };
      img.src = sources[0];
      img.alt = team[i].name;
      gsap.to(img, { y: -6, duration: 0.45, repeat: -1, yoyo: true, ease: 'steps(1)', delay: i * 0.15 });
    });
  }

  // Poké Ball outlines drifting up behind everything.
  function buildMotes() {
    const motes = Array.from({ length: 16 }, () => {
      const m = document.createElement('span');
      m.className = 'mn-mote';
      const size = rand(14, 40);
      Object.assign(m.style, { left: `${rand(0, 100)}%`, top: `${rand(10, 110)}%`, width: `${size}px`, height: `${size}px` });
      return m;
    });
    els.motes.replaceChildren(...motes);
    motes.forEach(m => gsap.to(m, {
      y: () => rand(-260, -120), rotation: () => rand(-180, 180), opacity: () => rand(0.05, 0.25),
      duration: () => rand(8, 14), repeat: -1, yoyo: true, ease: 'sine.inOut', repeatRefresh: true,
    }));
  }

  function go(url) {
    gsap.to(els.flash, { opacity: 1, duration: 0.3, ease: 'power2.in', onComplete: () => { location.href = url; } });
  }

  function updateMusicButton() {
    const on = Music.isEnabled();
    els.music.setAttribute('aria-pressed', String(on));
    els.music.textContent = on ? '♫ Music on' : '♫ Music off';
  }

  function bind() {
    els.modes.addEventListener('click', e => {
      const button = e.target.closest('[data-url]');
      if (button) go(button.dataset.url);
    });
    els.music.addEventListener('click', () => {
      Music.toggle();
      updateMusicButton();
    });
    // Controller: the D-pad steps through the mode buttons; A presses one.
    Gamepad.on(action => {
      if (action === 'select') {
        els.music.click();
        return;
      }
      const targets = [...els.modes.querySelectorAll('.btn')];
      const index = targets.indexOf(document.activeElement);
      if (action === 'confirm' || action === 'start') (targets[index] || targets[0]).click();
      else if (['left', 'right', 'up', 'down'].includes(action)) {
        const step = action === 'left' || action === 'up' ? -1 : 1;
        targets[index < 0 ? 0 : (index + step + targets.length) % targets.length].focus();
      }
    });
  }

  buildMotes();
  renderModes();
  renderLastTeam();
  bind();
  updateMusicButton();
  Music.play('menu');
  gsap.timeline()
    .fromTo(els.flash, { opacity: 1 }, { opacity: 0, duration: 0.5 })
    .from('.mn-title h1', { y: -40, opacity: 0, duration: 0.6, ease: 'back.out(1.8)' }, 0.1)
    .from('.mn-title p, .mn-team', { opacity: 0, duration: 0.4 }, 0.4)
    .from('.mn-mode', { y: 40, opacity: 0, duration: 0.5, stagger: 0.1, ease: 'back.out(1.6)' }, 0.35);
})();
