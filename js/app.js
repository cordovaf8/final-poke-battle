(() => {
  const MAX_TEAM = 3;
  // Team building rules: no shared types, and a points budget so teams can't stack legendaries.
  // A Pokémon costs a tenth of its base stat total (e.g. 525 BST = 53 pts).
  const MAX_POINTS = 150;
  const costOf = bst => Math.round(bst / 10);
  const STAT_LABELS = {
    hp: 'HP', attack: 'Atk', defense: 'Def',
    'special-attack': 'Sp. Atk', 'special-defense': 'Sp. Def', speed: 'Speed',
  };
  const STORAGE = { team: 'pokemonTeam', draft: 'pokemonTeamDraft', muted: 'pokemonMuted' };

  const $ = sel => document.querySelector(sel);
  const els = {
    topbar: $('.topbar'), team: $('#team'), slots: [...document.querySelectorAll('.slot')],
    random: $('#randomBtn'), mute: $('#muteBtn'), confirm: $('#confirmBtn'),
    search: $('#search'), typeFilter: $('#typeFilter'), gens: $('#gens'), status: $('#status'), grid: $('#grid'),
    detail: $('#detail'), detailClose: $('#detailClose'), sheetBackdrop: $('#sheetBackdrop'),
    sprite: $('#detailSprite'), num: $('#detailNum'), name: $('#detailName'), genus: $('#detailGenus'),
    types: $('#detailTypes'), flavor: $('#detailFlavor'), height: $('#detailHeight'), weight: $('#detailWeight'),
    abilities: $('#detailAbilities'), stats: $('#detailStats'), add: $('#detailAdd'),
    cost: $('#detailCost'), note: $('#detailNote'), budgetText: $('#budgetText'), budgetBar: $('#budgetBar'),
    toast: $('#toast'), overlay: $('#overlay'), podium: $('#podium'), editBtn: $('#editBtn'), battleBtn: $('#battleBtn'),
  };

  const state = {
    index: [], byId: new Map(), list: [],
    gen: 0, type: '', query: '',
    team: [], removing: new Set(), adding: new Set(), randomizing: false,
    focusedId: null, muted: false,
  };

  const compact = matchMedia('(max-width: 900px)');

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    },
  };

  const pad = id => '#' + String(id).padStart(4, '0');
  const typeBadge = t => `<span class="type" style="--type: var(--${t})">${t}</span>`;
  const isInTeam = id => state.team.some(p => p.id === id);
  const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
  const costFor = id => {
    const bst = PokeAPI.cachedBst(id);
    return bst == null ? null : costOf(bst);
  };
  const teamPoints = () => state.team.reduce((sum, p) => sum + (costFor(p.id) ?? 0), 0);

  // Why p can't join the current team, or '' if it can. Cost is only checked once it's known.
  function ruleViolation(p) {
    const clash = state.team.find(m => m.id !== p.id && m.types.some(t => p.types.includes(t)));
    if (clash) {
      const shared = p.types.find(t => clash.types.includes(t));
      return `${p.displayName} shares the ${capitalize(shared)} type with ${clash.displayName}`;
    }
    const cost = costFor(p.id);
    const left = MAX_POINTS - teamPoints();
    if (cost != null && cost > left) return `${p.displayName} costs ${cost} pts — only ${left} left`;
    return '';
  }

  // Walks the sprite fallback chain; a static PNG gets the CSS idle bob instead of a GIF animation.
  function setSprite(img, id) {
    const sources = PokeAPI.spriteSources(id);
    let i = 0;
    img.parentElement.classList.remove('is-static');
    img.onerror = () => {
      i += 1;
      if (i >= sources.length) { img.onerror = null; return; }
      img.src = sources[i];
      img.parentElement.classList.toggle('is-static', i === sources.length - 1);
    };
    img.src = sources[0];
  }

  // ---------- Animations ----------

  // Classic two-frame party-menu bob.
  function bob(img, i = 0) {
    gsap.to(img, { y: -5, duration: 0.26, ease: 'steps(1)', repeat: -1, yoyo: true, delay: i * 0.13 });
  }

  function hop(img) {
    gsap.fromTo(img, { y: 0 }, { y: -10, duration: 0.14, ease: 'power2.out', yoyo: true, repeat: 1, overwrite: 'auto' });
  }

  function popSlot(index, delay = 0) {
    const slot = els.slots[index];
    const img = slot.querySelector('.slot-sprite');
    gsap.fromTo(img, { scale: 0 }, { scale: 1, duration: 0.5, delay, ease: 'back.out(3)' });
    gsap.fromTo(slot, { scale: 1.1 }, { scale: 1, duration: 0.45, delay, ease: 'elastic.out(1, 0.5)' });
  }

  // Clones the sprite and arcs it into the team slot.
  function flyToSlot(fromImg, index) {
    const target = els.slots[index].querySelector('.slot-sprite');
    const a = fromImg.getBoundingClientRect();
    const b = target.parentElement.getBoundingClientRect();
    const ghost = fromImg.cloneNode();
    ghost.removeAttribute('id');
    ghost.className = 'ghost';
    Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    document.body.appendChild(ghost);
    gsap.set(target, { opacity: 0 });

    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.bottom - a.height / 2 - (a.top + a.height / 2);
    const scale = Math.min(1, 64 / Math.max(a.height, 1));

    gsap.timeline({
      onComplete() {
        ghost.remove();
        gsap.set(target, { opacity: 1 });
        popSlot(index);
      },
    })
      .to(ghost, { x: dx, duration: 0.6, ease: 'power1.inOut' }, 0)
      .to(ghost, { y: dy, duration: 0.6, ease: 'back.in(1.6)' }, 0)
      .to(ghost, { scale, rotation: 360, duration: 0.6, ease: 'power2.in' }, 0);
  }

  function shakeTeam() {
    gsap.fromTo(els.team, { x: -10 }, { x: 0, duration: 0.6, ease: 'elastic.out(1.2, 0.25)' });
  }

  function toast(message) {
    els.toast.textContent = message;
    gsap.killTweensOf(els.toast);
    gsap.timeline()
      .fromTo(els.toast, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: 'back.out(2)' })
      .to(els.toast, { y: 20, opacity: 0, duration: 0.25, delay: 1.8 });
  }

  let confirmPulse = null;
  function updateConfirm() {
    const full = state.team.length === MAX_TEAM;
    els.confirm.disabled = !full;
    els.confirm.textContent = full ? 'Confirm team' : `${state.team.length}/${MAX_TEAM} chosen`;
    if (full && !confirmPulse) {
      confirmPulse = gsap.to(els.confirm, { scale: 1.07, duration: 0.6, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    } else if (!full && confirmPulse) {
      confirmPulse.kill();
      confirmPulse = null;
      gsap.set(els.confirm, { scale: 1 });
    }
  }

  // ---------- Audio ----------

  async function playCry(id) {
    if (state.muted) return;
    try {
      const info = await PokeAPI.loadDetails(id);
      if (!info.cry) return;
      const audio = new Audio(info.cry);
      audio.volume = 0.3;
      await audio.play();
    } catch { /* cries are optional */ }
  }

  function updateMute() {
    els.mute.setAttribute('aria-pressed', String(state.muted));
    els.mute.setAttribute('aria-label', state.muted ? 'Unmute cries' : 'Mute cries');
  }

  // ---------- Grid ----------

  function renderGens() {
    const tabs = [...PokeAPI.GENERATIONS.map((g, i) => ({ label: `Gen ${g.label}`, value: i })), { label: 'All', value: -1 }];
    els.gens.innerHTML = tabs.map(t => `<button type="button" class="gen" data-gen="${t.value}">${t.label}</button>`).join('');
  }

  function updateGenTabs() {
    els.gens.classList.toggle('dimmed', !!state.query.trim());
    els.gens.querySelectorAll('.gen').forEach(btn => {
      const active = Number(btn.dataset.gen) === state.gen;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function renderTypeOptions() {
    els.typeFilter.insertAdjacentHTML('beforeend',
      PokeAPI.TYPES.map(t => `<option value="${t}">${PokeAPI.prettyName(t)}</option>`).join(''));
  }

  function createCard(p) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.id = p.id;
    card.setAttribute('aria-pressed', 'false');
    card.setAttribute('aria-label', `${p.displayName}, ${p.types.join(' and ')} type`);
    card.style.setProperty('--t1', `var(--${p.types[0]})`);
    card.innerHTML = `
      <span class="card-num">${pad(p.id)}</span>
      <span class="card-badge"></span>
      <span class="card-sprite"><img alt="" loading="lazy" decoding="async"></span>
      <span class="card-name">${p.displayName}</span>
      <span class="card-types">${p.types.map(typeBadge).join('')}</span>
      <span class="card-cost">… pts</span>`;
    setSprite(card.querySelector('img'), p.id);
    paintCost(card, p.id);
    return card;
  }

  function paintCost(card, id) {
    const cost = costFor(id);
    const el = card.querySelector('.card-cost');
    if (cost == null) return;
    el.textContent = `${cost} pts`;
    el.className = `card-cost ${cost >= 60 ? 'high' : cost >= 45 ? 'mid' : 'low'}`;
  }

  // Costs need each Pokémon's stats, so they're fetched as cards scroll into view (a few at a time).
  const costQueue = [];
  const costQueued = new Set();
  let costInFlight = 0;
  function queueCost(id) {
    if (costFor(id) != null || costQueued.has(id)) return;
    costQueued.add(id);
    costQueue.push(id);
    pumpCosts();
  }
  function pumpCosts() {
    while (costInFlight < 6 && costQueue.length) {
      const id = costQueue.shift();
      costInFlight += 1;
      PokeAPI.loadBst(id)
        .then(() => {
          const card = els.grid.querySelector(`.card[data-id="${id}"]`);
          if (card) paintCost(card, id);
          if (card && !isInTeam(id)) markBlocked(card);
        })
        .catch(() => costQueued.delete(id))
        .finally(() => {
          costInFlight -= 1;
          pumpCosts();
        });
    }
  }
  const costObserver = new IntersectionObserver(entries => {
    entries.forEach(e => e.isIntersecting && queueCost(Number(e.target.dataset.id)));
  }, { rootMargin: '200px' });

  function renderGrid() {
    const frag = document.createDocumentFragment();
    state.list.forEach(p => frag.appendChild(createCard(p)));
    costObserver.disconnect();
    els.grid.replaceChildren(frag);
    [...els.grid.children].forEach(card => costObserver.observe(card));
    syncCards();
    const visible = [...els.grid.children].slice(0, 48);
    gsap.from(visible, { y: 18, opacity: 0, duration: 0.4, stagger: 0.012, ease: 'power2.out', clearProps: 'transform,opacity' });
  }

  // Dims cards that would break a team rule, with the reason as a tooltip.
  function markBlocked(card) {
    const reason = ruleViolation(state.byId.get(Number(card.dataset.id)));
    card.classList.toggle('blocked', !!reason);
    card.title = reason;
  }

  function syncCards() {
    els.grid.querySelectorAll('.card.selected').forEach(card => {
      card.classList.remove('selected');
      card.setAttribute('aria-pressed', 'false');
      card.querySelector('.card-badge').textContent = '';
    });
    els.grid.querySelectorAll('.card').forEach(markBlocked);
    state.team.forEach((p, i) => {
      const card = els.grid.querySelector(`.card[data-id="${p.id}"]`);
      if (!card) return;
      card.classList.add('selected');
      card.classList.remove('blocked');
      card.title = '';
      card.setAttribute('aria-pressed', 'true');
      card.querySelector('.card-badge').textContent = i + 1;
    });
  }

  function applyFilters() {
    const q = state.query.trim().toLowerCase().replace(/^#/, '');
    const qId = q.replace(/^0+/, '');
    const gen = PokeAPI.GENERATIONS[state.gen];

    // A search looks across every generation so you never have to guess where a Pokémon lives.
    state.list = state.index.filter(p => {
      if (state.type && !p.types.includes(state.type)) return false;
      if (q) return p.name.includes(q) || p.displayName.toLowerCase().includes(q) || String(p.id) === qId;
      return !gen || (p.id >= gen.start && p.id <= gen.end);
    });

    const n = state.list.length;
    els.status.textContent = n === 0
      ? 'No Pokémon match that search.'
      : `${n} Pokémon${q ? ' found across all generations' : ''}`;
    updateGenTabs();
    renderGrid();
  }

  // ---------- Detail panel ----------

  function renderStatRows() {
    els.stats.innerHTML = Object.entries(STAT_LABELS).map(([key, label]) => `
      <div class="stat" data-stat="${key}">
        <span class="stat-label">${label}</span>
        <span class="stat-value">0</span>
        <span class="stat-bar"><i></i></span>
      </div>`).join('') + `
      <div class="stat total">
        <span class="stat-label">Total</span>
        <span class="stat-value">0</span>
        <span></span>
      </div>`;
  }

  function statColor(v) {
    if (v < 50) return '#ff6b6b';
    if (v < 80) return '#ffb347';
    if (v < 100) return '#ffd93d';
    if (v < 130) return '#6bd96b';
    return '#4fd1c5';
  }

  function fillStats(stats) {
    let total = 0;
    els.stats.querySelectorAll('.stat[data-stat]').forEach((row, i) => {
      const value = stats[row.dataset.stat] ?? 0;
      total += value;
      const bar = row.querySelector('i');
      bar.style.background = statColor(value);
      gsap.fromTo(bar, { scaleX: 0 }, { scaleX: Math.min(value / 180, 1), duration: 0.8, delay: i * 0.05, ease: 'power3.out' });
      gsap.fromTo(row.querySelector('.stat-value'), { textContent: 0 },
        { textContent: value, snap: { textContent: 1 }, duration: 0.8, delay: i * 0.05, ease: 'power2.out' });
    });
    gsap.fromTo(els.stats.querySelector('.total .stat-value'), { textContent: 0 },
      { textContent: total, snap: { textContent: 1 }, duration: 1, ease: 'power2.out' });
  }

  function resetStats() {
    els.stats.querySelectorAll('.stat').forEach(row => {
      const bar = row.querySelector('i');
      if (bar) gsap.set(bar, { scaleX: 0 });
      gsap.killTweensOf(row.querySelector('.stat-value'));
      row.querySelector('.stat-value').textContent = '–';
    });
  }

  els.sprite.addEventListener('load', () => {
    const w = els.sprite.naturalWidth;
    if (w) els.sprite.style.width = `${Math.min(w * 2, 260)}px`;
    // Squash-and-stretch landing.
    gsap.fromTo(els.sprite,
      { opacity: 0, scaleX: 1.3, scaleY: 0.65, y: 14 },
      { opacity: 1, scaleX: 1, scaleY: 1, y: 0, duration: 0.75, ease: 'elastic.out(1, 0.45)' });
  });

  async function showDetail(id) {
    if (state.focusedId === id) return;
    state.focusedId = id;
    const p = state.byId.get(id);
    if (!p) return;

    // Paint what the index already knows, then fill in the fetched details.
    els.detail.style.setProperty('--t1', `var(--${p.types[0]})`);
    els.detail.style.setProperty('--t2', `var(--${p.types[1] || p.types[0]})`);
    els.num.textContent = pad(id);
    els.name.textContent = p.displayName;
    els.types.innerHTML = p.types.map(typeBadge).join('');
    els.genus.textContent = '';
    els.flavor.textContent = 'Loading…';
    els.height.textContent = els.weight.textContent = els.abilities.textContent = '—';
    paintDetailCost(id);
    gsap.killTweensOf(els.sprite);
    gsap.set(els.sprite, { opacity: 0 });
    els.sprite.style.width = '';
    setSprite(els.sprite, id);
    resetStats();
    updateDetailButton();
    gsap.fromTo('.detail-head', { x: 12, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: 'power2.out' });

    try {
      const info = await PokeAPI.loadDetails(id);
      if (state.focusedId !== id) return;
      els.name.textContent = info.name;
      els.genus.textContent = info.genus;
      els.flavor.textContent = info.flavor;
      els.height.textContent = `${info.height.toFixed(1)} m`;
      els.weight.textContent = `${info.weight.toFixed(1)} kg`;
      els.abilities.innerHTML = info.abilities
        .map(a => a.hidden ? `${a.name} <span class="hidden-tag">hidden</span>` : a.name)
        .join(', ');
      fillStats(info.stats);
      paintDetailCost(id);
      updateDetailButton();
      const card = els.grid.querySelector(`.card[data-id="${id}"]`);
      if (card) {
        paintCost(card, id);
        if (!isInTeam(id)) markBlocked(card);
      }
    } catch {
      if (state.focusedId === id) els.flavor.textContent = 'Could not load details. Check your connection.';
    }
  }

  let hoverTimer;
  function previewSoon(id) {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => showDetail(id), 80);
  }

  function paintDetailCost(id) {
    const bst = PokeAPI.cachedBst(id);
    els.cost.textContent = bst == null ? '—' : `${costOf(bst)} pts`;
    els.cost.title = bst == null ? '' : `Base stat total ${bst}`;
  }

  function updateDetailButton() {
    const id = state.focusedId;
    if (id == null) return;
    const inTeam = isInTeam(id);
    const full = state.team.length >= MAX_TEAM;
    const reason = inTeam ? '' : ruleViolation(state.byId.get(id));
    els.add.textContent = inTeam ? 'Remove from team' : full ? 'Team is full' : reason ? "Can't add" : 'Add to team';
    els.add.classList.toggle('danger', inTeam);
    els.add.disabled = !inTeam && (full || !!reason);
    els.note.textContent = full && !inTeam ? '' : reason;
  }

  function updateBudget() {
    const points = teamPoints();
    els.budgetText.textContent = `${points} / ${MAX_POINTS} pts`;
    gsap.to(els.budgetBar, { scaleX: Math.min(points / MAX_POINTS, 1), duration: 0.4, ease: 'power2.out' });
    els.budgetBar.parentElement.classList.toggle('near', points > MAX_POINTS * 0.8);
  }

  function openSheet() {
    els.detail.classList.add('open');
    els.sheetBackdrop.classList.add('open');
  }
  function closeSheet() {
    els.detail.classList.remove('open');
    els.sheetBackdrop.classList.remove('open');
  }

  // ---------- Team ----------

  function renderTeam() {
    els.slots.forEach((slot, i) => {
      const p = state.team[i];
      const img = slot.querySelector('.slot-sprite');
      const key = p ? String(p.id) : '';
      slot.classList.toggle('filled', !!p);
      if (slot.dataset.id === key) return;

      slot.dataset.id = key;
      gsap.killTweensOf(img);
      gsap.set(img, { clearProps: 'all' });
      slot.querySelector('.slot-name').textContent = p ? p.displayName : 'Empty';
      slot.style.setProperty('--t1', p ? `var(--${p.types[0]})` : 'transparent');
      slot.setAttribute('aria-label', p ? `Remove ${p.displayName} from team` : `Slot ${i + 1}, empty`);
      if (p) {
        setSprite(img, p.id);
        bob(img, i);
      } else {
        img.onerror = null;
        img.removeAttribute('src');
      }
    });
    syncCards();
    updateConfirm();
    updateDetailButton();
    updateBudget();
    store.set(STORAGE.draft, state.team.map(p => p.id));
  }

  function rejectAdd(message) {
    shakeTeam();
    toast(message);
  }

  async function addToTeam(id, sourceImg, { quiet = false } = {}) {
    if (isInTeam(id) || state.adding.has(id)) return;
    const p = state.byId.get(id);
    if (state.team.length >= MAX_TEAM) return rejectAdd('Your team is full — remove one first');
    let reason = ruleViolation(p);
    if (reason) return rejectAdd(reason);

    // The cost needs this Pokémon's stats; fetch them if this card hasn't loaded them yet.
    if (costFor(id) == null) {
      state.adding.add(id);
      try {
        await PokeAPI.loadBst(id);
      } catch {
        return rejectAdd('Could not load its stats — check your connection');
      } finally {
        state.adding.delete(id);
      }
      // The team may have changed while we waited.
      if (isInTeam(id)) return;
      if (state.team.length >= MAX_TEAM) return rejectAdd('Your team is full — remove one first');
      reason = ruleViolation(p);
      if (reason) return rejectAdd(reason);
    }

    const index = state.team.length;
    state.team.push(p);
    renderTeam();
    if (sourceImg && sourceImg.isConnected && sourceImg.complete && sourceImg.naturalWidth) flyToSlot(sourceImg, index);
    else popSlot(index);
    if (!quiet) playCry(id);
  }

  function removeFromTeam(id) {
    const index = state.team.findIndex(p => p.id === id);
    if (index < 0 || state.removing.has(id)) return;
    state.removing.add(id);
    const img = els.slots[index].querySelector('.slot-sprite');
    gsap.killTweensOf(img);
    gsap.to(img, {
      scale: 0, opacity: 0, duration: 0.22, ease: 'back.in(2)',
      onComplete() {
        state.removing.delete(id);
        state.team = state.team.filter(p => p.id !== id);
        renderTeam();
      },
    });
  }

  function toggleTeam(id, sourceImg) {
    if (isInTeam(id)) removeFromTeam(id);
    else addToTeam(id, sourceImg);
  }

  // Builds a legal random team: no shared types and within the points budget.
  async function randomTeam() {
    if (state.randomizing) return;
    state.randomizing = true;
    els.random.disabled = true;
    const pool = gsap.utils.shuffle([...(state.list.length >= 12 ? state.list : state.index)]);
    const picks = [];
    let points = 0;
    try {
      for (let start = 0; start < pool.length && picks.length < MAX_TEAM; start += 12) {
        const batch = pool.slice(start, start + 12);
        await Promise.allSettled(batch.map(p => PokeAPI.loadBst(p.id)));
        for (const p of batch) {
          const cost = costFor(p.id);
          if (picks.length === MAX_TEAM || cost == null) continue;
          if (picks.some(q => q.types.some(t => p.types.includes(t)))) continue;
          // Leave at least ~30 pts per remaining slot so the team can still be finished.
          const slotsAfter = MAX_TEAM - picks.length - 1;
          if (points + cost + slotsAfter * 30 > MAX_POINTS) continue;
          picks.push(p);
          points += cost;
        }
      }
    } finally {
      state.randomizing = false;
      els.random.disabled = false;
    }
    if (picks.length < MAX_TEAM) {
      toast('Could not build a legal team from this list');
      return;
    }
    state.team = picks;
    renderTeam();
    picks.forEach((_, i) => popSlot(i, i * 0.15));
    playCry(picks[MAX_TEAM - 1].id);
  }

  // ---------- Confirm ----------

  let overlayTimeline = null;

  async function confirmTeam() {
    if (state.team.length !== MAX_TEAM) return;
    els.confirm.disabled = true;
    let details;
    try {
      details = await Promise.all(state.team.map(p => PokeAPI.loadDetails(p.id)));
    } catch {
      toast('Could not reach PokéAPI — try again');
      updateConfirm();
      return;
    }
    const team = details.map(d => ({
      id: d.id, name: d.name, types: d.types, stats: d.stats, abilities: d.abilities,
      height: d.height, weight: d.weight, sprite: PokeAPI.spriteSources(d.id)[0], cry: d.cry,
    }));
    store.set(STORAGE.team, team);
    // Hook for the next screen of the game.
    window.dispatchEvent(new CustomEvent('team:confirmed', { detail: team }));
    updateConfirm();
    showOverlay(team);
  }

  function showOverlay(team) {
    els.podium.innerHTML = team.map(p => `
      <figure class="podium-spot" style="--t1: var(--${p.types[0]})">
        <div class="podium-sprite"><img alt=""></div>
        <figcaption>${p.name}</figcaption>
        <div class="podium-types">${p.types.map(typeBadge).join('')}</div>
      </figure>`).join('');
    const imgs = els.podium.querySelectorAll('img');
    imgs.forEach((img, i) => setSprite(img, team[i].id));
    els.overlay.hidden = false;
    els.editBtn.focus();

    overlayTimeline?.kill();
    overlayTimeline = gsap.timeline()
      .fromTo(els.overlay, { opacity: 0 }, { opacity: 1, duration: 0.2 })
      .fromTo('.overlay-flash', { opacity: 1 }, { opacity: 0, duration: 0.7, ease: 'power2.out' }, 0)
      .fromTo('.overlay-card', { scale: 0.85, y: 24 }, { scale: 1, y: 0, duration: 0.55, ease: 'back.out(1.6)' }, 0.1)
      .fromTo('.podium-spot', { y: -140, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.18, ease: 'bounce.out' }, 0.3)
      .add(() => imgs.forEach((img, i) => bob(img, i)))
      // Straight into battle unless "Edit team" is pressed first.
      .add(goToBattle, '+=1.4');
  }

  function goToBattle() {
    overlayTimeline?.kill();
    gsap.to('.overlay-flash', { opacity: 1, duration: 0.35, ease: 'power2.in', onComplete: () => { location.href = 'battle.html'; } });
  }

  function hideOverlay() {
    overlayTimeline?.kill();
    gsap.to(els.overlay, {
      opacity: 0, duration: 0.2,
      onComplete() {
        els.overlay.hidden = true;
        gsap.killTweensOf(els.podium.querySelectorAll('img'));
      },
    });
  }

  // ---------- Events ----------

  function bindEvents() {
    let lastHover = null;
    els.grid.addEventListener('mouseover', e => {
      const card = e.target.closest('.card');
      if (!card || card === lastHover || compact.matches) return;
      lastHover = card;
      hop(card.querySelector('img'));
      previewSoon(Number(card.dataset.id));
    });
    els.grid.addEventListener('focusin', e => {
      const card = e.target.closest('.card');
      if (card && !compact.matches) previewSoon(Number(card.dataset.id));
    });
    els.grid.addEventListener('click', e => {
      const card = e.target.closest('.card');
      if (!card) return;
      const id = Number(card.dataset.id);
      if (compact.matches) {
        // On phones a tap opens the info sheet; the sheet's button adds to the team.
        showDetail(id);
        openSheet();
        return;
      }
      clearTimeout(hoverTimer);
      showDetail(id);
      toggleTeam(id, card.querySelector('img'));
    });

    els.slots.forEach((slot, i) => slot.addEventListener('click', () => {
      const p = state.team[i];
      if (p) removeFromTeam(p.id);
    }));

    els.add.addEventListener('click', () => {
      const id = state.focusedId;
      if (id == null) return;
      const adding = !isInTeam(id);
      toggleTeam(id, els.sprite);
      if (adding && compact.matches) setTimeout(closeSheet, 350);
    });

    els.detailClose.addEventListener('click', closeSheet);
    els.sheetBackdrop.addEventListener('click', closeSheet);
    compact.addEventListener('change', closeSheet);

    let searchTimer;
    els.search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.query = els.search.value; applyFilters(); }, 150);
    });
    els.typeFilter.addEventListener('change', () => { state.type = els.typeFilter.value; applyFilters(); });
    els.gens.addEventListener('click', e => {
      const btn = e.target.closest('.gen');
      if (!btn) return;
      state.gen = Number(btn.dataset.gen);
      if (state.query) { state.query = ''; els.search.value = ''; }
      applyFilters();
    });

    els.random.addEventListener('click', randomTeam);
    els.confirm.addEventListener('click', confirmTeam);
    els.editBtn.addEventListener('click', hideOverlay);
    els.battleBtn.addEventListener('click', goToBattle);
    els.mute.addEventListener('click', () => {
      state.muted = !state.muted;
      store.set(STORAGE.muted, state.muted);
      updateMute();
    });

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!els.overlay.hidden) hideOverlay();
      else closeSheet();
    });

    const setHeaderHeight = () =>
      document.documentElement.style.setProperty('--header-h', `${els.topbar.offsetHeight}px`);
    new ResizeObserver(setHeaderHeight).observe(els.topbar);
  }

  // ---------- Boot ----------

  async function loadData() {
    els.status.innerHTML = 'Loading Pokédex<span class="dots"></span>';
    try {
      state.index = await PokeAPI.loadIndex();
    } catch {
      els.status.innerHTML = 'Could not reach PokéAPI. <button type="button" class="link" id="retryBtn">Try again</button>';
      $('#retryBtn').addEventListener('click', loadData);
      return;
    }
    state.byId = new Map(state.index.map(p => [p.id, p]));
    // Restore the last draft, dropping anyone who breaks the team rules (e.g. a team saved before they existed).
    const draft = store.get(STORAGE.draft, []).map(id => state.byId.get(id)).filter(Boolean).slice(0, MAX_TEAM);
    await Promise.allSettled(draft.map(p => PokeAPI.loadBst(p.id)));
    state.team = [];
    for (const p of draft) {
      if (costFor(p.id) != null && !ruleViolation(p)) state.team.push(p);
    }
    applyFilters();
    renderTeam();
    showDetail(state.team[0]?.id ?? 1);
  }

  renderGens();
  renderTypeOptions();
  renderStatRows();
  state.muted = store.get(STORAGE.muted, false);
  updateMute();
  updateConfirm();
  bindEvents();
  loadData();
})();
