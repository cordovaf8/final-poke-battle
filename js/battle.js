(() => {
  const MAX_ID = 1025;
  // Feet positions as % of the field; lower on screen = closer to the camera.
  const PLAYER_SPOTS = [{ x: 26, y: 60 }, { x: 34, y: 75 }, { x: 18, y: 90 }];
  const ENEMY_SPOTS = [{ x: 74, y: 60 }, { x: 66, y: 75 }, { x: 82, y: 90 }];
  const BIOMES = ['forest', 'autumn', 'night'];
  // Gen V pixel sprites are small, so they get scaled up more than the HD Showdown ones.
  const KIND_SCALE = { pixel: 2, hd: 1.3, still: 1.6 };
  // battle.html?mode=tower&floor=N fights a Battle Tower floor instead of wild Pokémon.
  const params = new URLSearchParams(location.search);
  const towerFloor = params.get('mode') === 'tower'
    ? Math.min(Math.max(Number(params.get('floor')) || 1, 1), Tower.FLOORS.length)
    : 0;
  const floorInfo = towerFloor ? Tower.FLOORS[towerFloor - 1] : null;
  // Foe gauges fill a little slower than yours, since you need time to work the menus; tower floors speed them up.
  const ENEMY_ATB_SCALE = floorInfo ? floorInfo.atbScale : 1.3;
  const ITEM_SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items';
  const ITEMS = [
    { id: 'potion', name: 'Potion', qty: 5, target: 'ally', heal: 20, text: 'Restores 20 HP to one Pokémon.' },
    { id: 'super-potion', name: 'Super Potion', qty: 3, target: 'ally', heal: 60, text: 'Restores 60 HP to one Pokémon.' },
    { id: 'full-heal', name: 'Full Heal', qty: 2, target: 'afflicted', text: 'Cures any status condition and confusion.' },
    { id: 'revive', name: 'Revive', qty: 2, target: 'fainted', text: 'Revives a fainted Pokémon with half its HP.' },
    { id: 'ether', name: 'Ether', qty: 2, target: 'self', text: "Restores 10 PP to each of the user's attacks." },
    { id: 'x-attack', name: 'X Attack', qty: 2, target: 'self', text: "Sharply raises the user's Attack for the rest of the battle." },
  ];
  // Used by wild Pokémon that know no damaging attacks.
  const TACKLE = {
    name: 'Tackle', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 35, target: 'selected-pokemon',
    ailment: 'none', ailmentChance: 0, statChanges: [], statChance: 0, effectCategory: 'damage', healing: 0, drain: 0,
    effect: '',
  };

  // Status conditions: HUD tag, sprite icon and the message when one is inflicted.
  const STATUS_INFO = {
    burn: { tag: 'BRN', icon: '🔥', text: 'was burned!' },
    poison: { tag: 'PSN', icon: '☠️', text: 'was poisoned!' },
    paralysis: { tag: 'PAR', icon: '⚡', text: 'is paralyzed! It may be unable to move!' },
    sleep: { tag: 'SLP', icon: '💤', text: 'fell asleep!' },
    freeze: { tag: 'FRZ', icon: '❄️', text: 'was frozen solid!' },
  };
  const SUPPORTED_AILMENTS = new Set([...Combat.STATUSES, 'confusion']);
  const STAT_LABELS = {
    attack: 'Atk', defense: 'Def', 'special-attack': 'SpA', 'special-defense': 'SpD',
    speed: 'Spe', accuracy: 'Acc', evasion: 'Eva',
  };
  // Who a status move affects, from PokéAPI's move.target.
  const SELF_TARGETS = new Set(['user', 'users-field', 'user-and-allies', 'ally', 'user-or-ally', 'all-allies']);
  const FOE_TARGETS = new Set(['selected-pokemon', 'selected-pokemon-me-first', 'random-opponent', 'all-other-pokemon', 'specific-move']);
  const moveScope = move => {
    if (move.category !== 'status') return 'foe';
    if (SELF_TARGETS.has(move.target)) return 'self';
    if (move.target === 'all-opponents') return 'foes';
    return FOE_TARGETS.has(move.target) ? 'foe' : 'none';
  };
  // Field effects, switching and the like aren't modeled, so those status moves do nothing yet.
  const statusMoveWorks = m => moveScope(m) !== 'none'
    && (m.statChanges.length > 0 || SUPPORTED_AILMENTS.has(m.ailment) || m.healing > 0);

  const $ = sel => document.querySelector(sel);
  const els = {
    field: $('#field'), backdrop: $('#backdrop'), frame: $('#frame'), motes: $('#motes'), units: $('#units'),
    message: $('#message'), help: $('#help'), loading: $('#loading'), hud: $('#hud'),
    partyRows: $('#partyRows'), enemyRows: $('#enemyRows'), commandPanel: $('#commandPanel'),
    command: $('#command'), commandTitle: $('#commandTitle'), attackMenu: $('#attackMenu'),
    moveList: $('#moveList'), itemMenu: $('#itemMenu'), itemList: $('#itemList'), flash: $('#flash'),
    result: $('#result'), resultTitle: $('#resultTitle'), resultText: $('#resultText'), againBtn: $('#againBtn'),
    music: $('#musicBtn'), viewBtn: $('#viewBtn'), plates: $('#plates'), enemyWindow: $('.enemy-window'),
    floorTitle: $('#floorTitle'), backBtn: $('.back-btn'), enemyTitle: $('.enemy-window .hud-head span'),
  };
  const VIEW_KEY = 'battleView';
  // How far the commanded Pokémon steps toward the enemy (px).
  const STEP_FORWARD = 28;

  // party / enemies hold fighters (see Combat.createFighter). ready: party indexes with a full gauge, in fill order.
  const battle = {
    party: [], enemies: [], units: [], enemyUnits: [],
    ready: [], active: null, targeting: null, over: false,
    // paused: ATB gauges freeze while an Attack/Items menu is open; pending holds enemy turns that came due meanwhile.
    paused: false, pending: [],
    items: ITEMS.map(item => ({ ...item })),
  };

  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
  const article = word => (/^[aeiou]/i.test(word) ? 'an' : 'a');
  const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const typeBadge = t => `<span class="type" style="--type: var(--${t})">${t}</span>`;
  // Seconds for a full gauge: base Speed sets it, then Speed stages and paralysis adjust it.
  const atbDuration = (f, scale = 1) => (gsap.utils.clamp(2, 7, 300 / (f.base.speed || 50)) * scale) / Combat.speedFactor(f);
  // Heavier attacks take longer to recover from: the gauge refills slower afterwards
  // (40 power ≈ ×0.87, 90 ≈ ×1.2, 150 ≈ ×1.6).
  const RECOVERY = { defend: 0.7, item: 1, status: 0.8 };
  const recoveryFactor = move => (move.category === 'status'
    ? RECOVERY.status
    : gsap.utils.clamp(0.8, 1.8, 0.6 + (move.power ?? 60) / 150));
  const living = list => list.filter(f => !f.fainted);

  // A fighter's HUD row moves between the bottom panel and its nameplate depending on the view.
  const rowOf = f => f.row;
  const unitOf = f => (f.side === 'party' ? battle.units : battle.enemyUnits)[f.index];
  const innerOf = unit => unit.querySelector('.unit-inner');
  const imgOf = f => unitOf(f).querySelector('img');
  const displayName = f => (f.side === 'enemy' ? `${floorInfo ? 'Foe' : 'Wild'} ${f.name}` : f.name);
  // Maps a clicked unit sprite or HUD row back to its fighter.
  function fighterOf(el) {
    const node = el.closest('.unit, .unit-row');
    if (!node) return null;
    const list = node.matches('.player, .party-row') ? battle.party : battle.enemies;
    return list[Number(node.dataset.i)];
  }

  function readTeam() {
    try {
      const team = JSON.parse(localStorage.getItem('pokemonTeam'));
      return Array.isArray(team) && team.length === 3 ? team : null;
    } catch {
      return null;
    }
  }

  function randomIds(count, exclude = []) {
    const ids = new Set();
    while (ids.size < count) {
      const id = 1 + Math.floor(Math.random() * MAX_ID);
      if (!exclude.includes(id)) ids.add(id);
    }
    return [...ids];
  }

  async function loadTeams() {
    // Opening battle.html directly (no saved team) still gives you a party to look at.
    // The saved team is re-fetched so it includes learnsets.
    const partyIds = readTeam()?.map(p => p.id) || randomIds(3);
    const party = await Promise.all(partyIds.map(id => PokeAPI.loadDetails(id)));
    const enemyIds = floorInfo ? await pickByStrength(3, floorInfo.bst, partyIds) : randomIds(3, partyIds);
    const enemies = await Promise.all(enemyIds.map(id => PokeAPI.loadDetails(id)));
    return { party, enemies };
  }

  // Random Pokémon whose base stat total falls in [min, max]. Stat totals already cached
  // from the team select screen are used first; the rest are looked up a batch at a time.
  async function pickByStrength(count, [min, max], exclude) {
    const ids = gsap.utils.shuffle(Array.from({ length: MAX_ID }, (_, i) => i + 1)).filter(id => !exclude.includes(id));
    const inRange = id => {
      const bst = PokeAPI.cachedBst(id);
      return bst != null && bst >= min && bst <= max;
    };
    const picks = ids.filter(inRange).slice(0, count);
    for (let i = 0; picks.length < count && i < ids.length && i < 240; i += 12) {
      const batch = ids.slice(i, i + 12).filter(id => PokeAPI.cachedBst(id) == null);
      await Promise.allSettled(batch.map(id => PokeAPI.loadBst(id)));
      batch.forEach(id => picks.length < count && inRange(id) && picks.push(id));
    }
    // Should never be needed, but never leave a floor without foes.
    if (picks.length < count) picks.push(...randomIds(count - picks.length, [...exclude, ...picks]));
    return picks;
  }

  // Level-up attacks learned by the battle level, with PP tracked per fighter.
  function loadMoves(f) {
    f.movesReady ||= Promise.allSettled(
      f.learnset.filter(m => m.level <= Combat.LEVEL).map(m => PokeAPI.loadMove(m.name)),
    ).then(results => {
      f.moves = results
        .filter(r => r.status === 'fulfilled')
        .map(r => ({ ...r.value, pp: r.value.pp ?? 10, ppLeft: r.value.pp ?? 10 }));
      return f.moves;
    });
    return f.movesReady;
  }

  // ---------- Scenery ----------

  function svgLayer(className, content) {
    return `<svg class="${className}" viewBox="0 0 1600 500" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${content}</svg>`;
  }

  function buildScenery() {
    let far = '<rect class="f-far" x="0" y="230" width="1600" height="270"/>';
    for (let x = -60; x < 1680; x += rand(55, 85)) {
      far += `<circle class="f-far" cx="${x}" cy="${rand(170, 250)}" r="${rand(60, 100)}"/>`;
    }

    let mid = '';
    for (let x = 30; x < 1600; x += rand(150, 230)) {
      const w = rand(22, 38);
      mid += `<rect class="f-trunk" x="${x}" y="${rand(60, 140)}" width="${w}" height="500"/>`;
      for (let i = 0; i < 4; i++) {
        mid += `<circle class="f-mid" cx="${x + w / 2 + rand(-90, 90)}" cy="${rand(20, 130)}" r="${rand(55, 95)}"/>`;
      }
    }
    for (let x = -40; x < 1680; x += rand(40, 70)) {
      mid += `<circle class="f-bush" cx="${x}" cy="${rand(475, 500)}" r="${rand(30, 55)}"/>`;
    }

    els.backdrop.innerHTML = svgLayer('layer far', far) + svgLayer('layer mid', mid);

    // Big framing trees at the edges of the screen, like a forest clearing.
    let near = '';
    for (const x of [rand(-40, 20), rand(1540, 1600)]) {
      near += `<rect class="f-near" x="${x}" y="0" width="${rand(70, 100)}" height="900"/>`;
      for (let i = 0; i < 5; i++) near += `<circle class="f-near" cx="${x + rand(-120, 160)}" cy="${rand(-40, 90)}" r="${rand(90, 140)}"/>`;
    }
    els.frame.innerHTML = `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${near}</svg>`;
  }

  // Battle Tower arena: a moonlit hall of arched windows and pillars hung with the floor's banners,
  // framed by two big torch-lit pillars.
  function buildTowerScenery() {
    let wall = `
      <defs>
        <linearGradient id="moonlight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#cfd8ff" stop-opacity="0.55"/>
          <stop offset="1" stop-color="#6b74c9" stop-opacity="0.12"/>
        </linearGradient>
      </defs>
      <rect class="t-wall" x="0" y="0" width="1600" height="500"/>`;
    for (let x = -40; x < 1640; x += 280) {
      wall += `<path d="M${x + 90},470 V170 a55,55 0 0 1 110,0 V470 Z" fill="url(#moonlight)"/>`;
      wall += `<path class="t-mullion" d="M${x + 145},115 V470 M${x + 90},300 H${x + 200}"/>`;
      wall += `<rect class="t-pillar" x="${x + 225}" y="0" width="70" height="500"/>`;
      wall += `<rect class="t-cap" x="${x + 213}" y="60" width="94" height="24"/>`;
      wall += `<rect class="t-cap" x="${x + 213}" y="470" width="94" height="30"/>`;
      wall += `<path class="t-banner" d="M${x + 240},90 h40 v150 l-20,-18 l-20,18 Z"/>`;
    }
    els.backdrop.innerHTML = svgLayer('layer mid', wall);

    let near = '';
    for (const x of [30, 1460]) {
      near += `<rect class="t-near" x="${x}" y="0" width="110" height="900"/>`;
      near += `<rect class="t-near-cap" x="${x - 14}" y="120" width="138" height="26"/>`;
      near += `<path class="t-bracket" d="M${x + 41},420 l14,-40 l14,40 Z"/>`;
      near += `<circle class="t-glow" cx="${x + 55}" cy="362" r="70"/>`;
      near += `<ellipse class="t-flame" cx="${x + 55}" cy="366" rx="12" ry="20"/>`;
    }
    els.frame.innerHTML = `
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id="torchglow">
            <stop offset="0" stop-color="#ffb347" stop-opacity="0.55"/>
            <stop offset="1" stop-color="#ffb347" stop-opacity="0"/>
          </radialGradient>
        </defs>
        ${near}
      </svg>`;
    els.frame.querySelectorAll('.t-flame, .t-glow').forEach(el => gsap.to(el, {
      opacity: 'random(0.65, 1)', scale: 'random(0.9, 1.12)', transformOrigin: '50% 100%',
      duration: 'random(0.08, 0.2)', repeat: -1, yoyo: true, repeatRefresh: true,
    }));
  }

  function buildMotes(rising = false) {
    const motes = Array.from({ length: 18 }, () => {
      const m = document.createElement('span');
      m.className = 'mote';
      m.style.left = `${rand(5, 95)}%`;
      m.style.top = `${rand(10, 85)}%`;
      return m;
    });
    els.motes.replaceChildren(...motes);
    // Embers drift up in the tower; elsewhere the specks wander.
    motes.forEach(m => gsap.to(m, {
      x: 'random(-70, 70)', y: rising ? 'random(-160, -60)' : 'random(-50, 50)', opacity: 'random(0.15, 0.9)',
      duration: 'random(3, 6)', repeat: -1, yoyo: !rising, repeatRefresh: true, ease: 'sine.inOut',
    }));
  }

  // ---------- Units ----------

  function loadSprite(img, id) {
    const sources = PokeAPI.spriteSources(id);
    let i = 0;
    const loaded = new Promise(resolve => {
      img.onload = () => {
        const src = sources[i];
        img.dataset.kind = src.includes('black-white') ? 'pixel' : src.endsWith('.png') ? 'still' : 'hd';
        sizeSprite(img);
        resolve();
      };
      img.onerror = () => {
        i += 1;
        if (i < sources.length) img.src = sources[i];
        else resolve();
      };
    });
    img.src = sources[0];
    // Never let one slow sprite hold up the whole intro.
    return Promise.race([loaded, new Promise(r => setTimeout(r, 5000))]);
  }

  function sizeSprite(img) {
    if (!img.naturalWidth) return;
    const depth = Number(img.closest('.unit').dataset.depth);
    const fieldScale = gsap.utils.clamp(0.55, 1.35, els.field.clientHeight / 520);
    img.style.width = `${img.naturalWidth * (KIND_SCALE[img.dataset.kind] || 2) * depth * fieldScale}px`;
  }

  function createUnit(f, spot) {
    const unit = document.createElement('div');
    unit.className = `unit ${f.side === 'party' ? 'player' : 'enemy'}`;
    unit.style.left = `${spot.x}%`;
    unit.style.top = `${spot.y}%`;
    unit.style.zIndex = spot.y;
    unit.dataset.i = f.index;
    unit.dataset.depth = 0.85 + ((spot.y - 60) / 30) * 0.25;
    unit.innerHTML = `
      <div class="unit-inner">
        <span class="unit-cursor"></span>
        <span class="unit-target"></span>
        <span class="unit-shadow"></span>
        <span class="unit-shield"></span>
        <span class="unit-status"></span>
        <span class="unit-types">${f.types.map(typeBadge).join('')}</span>
        <img class="unit-sprite" alt="${f.name}">
      </div>`;
    return unit;
  }

  function blink(img) {
    gsap.fromTo(img, { opacity: 0.15 }, { opacity: 1, duration: 0.07, repeat: 4, yoyo: true });
  }

  function shake(f) {
    const dir = f.side === 'enemy' ? 1 : -1;
    gsap.fromTo(unitOf(f), { x: 10 * dir }, { x: 0, duration: 0.45, ease: 'elastic.out(1.4, 0.3)' });
  }

  function glow(f) {
    gsap.fromTo(imgOf(f), { filter: 'brightness(2.4)' }, { filter: 'brightness(1)', duration: 0.7, ease: 'power2.out', clearProps: 'filter' });
  }

  // Floating damage / heal numbers, bounced like a classic RPG.
  function popup(f, text, kind = 'damage', note = '') {
    const el = document.createElement('div');
    el.className = `popup ${kind}`;
    el.innerHTML = `<b>${text}</b>${note ? `<small>${note}</small>` : ''}`;
    unitOf(f).appendChild(el);
    gsap.timeline({ onComplete: () => el.remove() })
      .fromTo(el, { y: 0, opacity: 0, scale: 0.6 }, { y: -38, opacity: 1, scale: 1, duration: 0.22, ease: 'power2.out' })
      .to(el, { y: -18, duration: 0.4, ease: 'bounce.out' })
      .to(el, { y: -30, opacity: 0, duration: 0.3, delay: 0.7 });
  }

  // ---------- HUD ----------

  function unitRow(f) {
    // Party rows are buttons: clicking one with a full gauge takes command of it.
    const party = f.side === 'party';
    const open = party ? 'button type="button"' : 'div';
    return `
      <${open} class="unit-row ${f.side}-row unit-grid" data-i="${f.index}">
        <span class="row-name">${f.name}<span class="row-guard"></span></span>
        <span class="row-types">${f.types.map(typeBadge).join('')}</span>
        <span class="row-hp">
          <span class="num-line">
            <span class="num"><b>${f.hp}</b>/${f.maxHp}</span>
            <span class="row-status"></span>
            <span class="row-stages"></span>
          </span>
          <span class="bar hp"><i></i></span>
        </span>
        <span class="bar atb"><i></i></span>
      </${party ? 'button' : 'div'}>`;
  }

  function renderHud() {
    els.partyRows.innerHTML = battle.party.map(unitRow).join('');
    els.enemyRows.innerHTML = battle.enemies.map(unitRow).join('');
    battle.party.forEach((f, i) => { f.row = els.partyRows.children[i]; });
    battle.enemies.forEach((f, i) => { f.row = els.enemyRows.children[i]; });
  }

  // ---------- Views ----------
  // Traditional: info and commands live in the bottom panel.
  // Advanced: no panel; each Pokémon has a floating nameplate and the menu pops up beside the active one.

  const isAdvanced = () => battle.view === 'advanced';

  function setView(view) {
    battle.view = view;
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* storage unavailable */ }
    document.body.classList.toggle('view-advanced', isAdvanced());
    els.viewBtn.textContent = `View: ${capitalize(view)}`;

    for (const f of [...battle.party, ...battle.enemies]) {
      if (isAdvanced()) {
        if (!f.plate) {
          f.plate = document.createElement('div');
          f.plate.className = `plate ${f.side}-plate`;
        }
        f.plate.appendChild(f.row);
        els.plates.appendChild(f.plate);
      } else {
        // Appending in index order rebuilds the panel lists in their original order.
        (f.side === 'party' ? els.partyRows : els.enemyRows).appendChild(f.row);
      }
    }
    if (isAdvanced()) {
      els.field.appendChild(els.commandPanel);
    } else {
      // Drop the floating position, or it would shift the panel out of its slot in the bottom bar.
      els.commandPanel.style.left = '';
      els.commandPanel.style.top = '';
      els.hud.insertBefore(els.commandPanel, els.enemyWindow);
    }
    relayout();
  }

  // The field changes size between views, so sprites, nameplates and the menu are re-placed.
  function relayout() {
    els.units.querySelectorAll('img').forEach(sizeSprite);
    positionPlates();
    positionPanel();
  }

  const PLATE_LIFT = 30; // gap between a nameplate and the sprite, room for the cursor arrow

  function positionPlates() {
    if (!isAdvanced()) return;
    const field = els.field.getBoundingClientRect();
    const plates = [...battle.party, ...battle.enemies].map(f => {
      const img = imgOf(f).getBoundingClientRect();
      const box = img.width ? img : unitOf(f).getBoundingClientRect();
      return { el: f.plate, x: box.left + box.width / 2 - field.left, y: box.top - field.top, w: f.plate.offsetWidth, h: f.plate.offsetHeight };
    });
    // Neighbouring Pokémon can stack their plates; place front-row plates first and lift any back-row plate that collides.
    plates.sort((a, b) => b.y - a.y);
    plates.forEach((p, i) => {
      for (const q of plates.slice(0, i)) {
        const overlapX = Math.abs(p.x - q.x) < (p.w + q.w) / 2 + 4;
        const pBottom = p.y - PLATE_LIFT;
        const qTop = q.y - PLATE_LIFT - q.h;
        if (overlapX && pBottom > qTop - 4 && pBottom - p.h < q.y - PLATE_LIFT + 4) p.y = qTop - 4 + PLATE_LIFT;
      }
      p.el.style.left = `${p.x}px`;
      p.el.style.top = `${Math.max(p.y, p.h + PLATE_LIFT + 52)}px`;
    });
  }

  // Puts the floating menu beside the commanded Pokémon, kept inside the field.
  function positionPanel() {
    if (!isAdvanced() || battle.active == null) return;
    const field = els.field.getBoundingClientRect();
    const f = battle.party[battle.active];
    const sprite = imgOf(f).getBoundingClientRect();
    const panel = els.commandPanel;
    // Measured before the step-forward finishes, so add whatever of it is still to come.
    const stepLeft = STEP_FORWARD - gsap.getProperty(innerOf(unitOf(f)), 'x');
    const left = sprite.right - field.left + 20 + stepLeft;
    const top = sprite.top - field.top + sprite.height / 2 - panel.offsetHeight / 2;
    panel.style.left = `${gsap.utils.clamp(8, field.width - panel.offsetWidth - 8, left)}px`;
    panel.style.top = `${gsap.utils.clamp(56, field.height - panel.offsetHeight - 8, top)}px`;
  }

  function updateHp(f) {
    const row = rowOf(f);
    const ratio = f.hp / f.maxHp;
    gsap.to(row.querySelector('.bar.hp i'), { scaleX: ratio, duration: 0.5, ease: 'power2.out' });
    gsap.to(row.querySelector('.num b'), { textContent: f.hp, snap: { textContent: 1 }, duration: 0.5, ease: 'power2.out' });
    row.classList.toggle('hp-mid', ratio <= 0.5 && ratio > 0.2);
    row.classList.toggle('hp-low', ratio <= 0.2);
  }

  function setHp(f, hp) {
    f.hp = Math.round(gsap.utils.clamp(0, f.maxHp, hp));
    updateHp(f);
    if (f.hp === 0 && !f.fainted) faint(f);
  }

  let messageTimeline = null;
  function showMessage(text) {
    messageTimeline?.kill();
    els.message.textContent = text;
    messageTimeline = gsap.timeline()
      .fromTo(els.message, { scaleY: 0, opacity: 1 }, { scaleY: 1, duration: 0.18, ease: 'power2.out' })
      .to(els.message, { scaleY: 0, duration: 0.18, ease: 'power2.in', delay: 1.6 });
  }

  // ---------- Real-time ATB ----------

  function fillAtb(f, duration, from, onFull) {
    const bar = rowOf(f).querySelector('.atb');
    bar.classList.remove('full');
    f.atbTween = gsap.fromTo(bar.firstElementChild, { scaleX: from }, {
      scaleX: 1,
      duration: duration * (1 - from),
      ease: 'none',
      paused: battle.paused,
      onComplete() {
        bar.classList.add('full');
        onFull();
      },
    });
  }

  function setPaused(paused) {
    if (battle.paused === paused) return;
    battle.paused = paused;
    document.body.classList.toggle('atb-paused', paused);
    [...battle.party, ...battle.enemies].forEach(f => (paused ? f.atbTween?.pause() : f.atbTween?.resume()));
    if (!paused) battle.pending.splice(0).forEach(enemyAct);
  }

  function drainAtb(row) {
    const bar = row.querySelector('.atb');
    const fill = bar.firstElementChild;
    bar.classList.remove('full');
    gsap.killTweensOf(fill);
    gsap.to(fill, { scaleX: 0, duration: 0.25, ease: 'power2.in' });
  }

  function fillPartyAtb(i, from = 0, factor = 1) {
    const f = battle.party[i];
    if (f.fainted || battle.over) return;
    const row = rowOf(f);
    row.classList.remove('ready');
    fillAtb(f, atbDuration(f, factor), from, () => {
      if (f.fainted || battle.over || !startTurn(f)) return;
      row.classList.add('ready');
      battle.ready.push(i);
      if (battle.active == null) activate(i);
    });
  }

  function fillEnemyAtb(j, from = 0, factor = 1) {
    const f = battle.enemies[j];
    if (f.fainted || battle.over) return;
    fillAtb(f, atbDuration(f, ENEMY_ATB_SCALE * factor), from, () => gsap.delayedCall(rand(0.2, 0.7), () => enemyAct(j)));
  }

  const refillAtb = (f, factor = 1) => (f.side === 'party' ? fillPartyAtb(f.index, 0, factor) : fillEnemyAtb(f.index, 0, factor));

  // Runs each time a gauge fills: poison/burn damage, then sleep, freeze or paralysis may cost the turn.
  function startTurn(f) {
    if (f.status === 'burn' || f.status === 'poison') {
      const burn = f.status === 'burn';
      const damage = Math.max(1, Math.floor(f.maxHp / (burn ? 16 : 8)));
      blink(imgOf(f));
      popup(f, damage, 'damage', burn ? 'Burn' : 'Poison');
      setHp(f, f.hp - damage);
      if (f.fainted) return false;
    }
    if (f.status === 'sleep') {
      f.sleepTurns -= 1;
      if (f.sleepTurns > 0) return loseTurn(f, `${displayName(f)} is fast asleep.`);
      cure(f, `${displayName(f)} woke up!`);
    } else if (f.status === 'freeze') {
      if (Math.random() >= 0.2) return loseTurn(f, `${displayName(f)} is frozen solid!`);
      cure(f, `${displayName(f)} thawed out!`);
    } else if (f.status === 'paralysis' && Math.random() < 0.25) {
      return loseTurn(f, `${displayName(f)} is paralyzed! It can't move!`);
    }
    return true;
  }

  function loseTurn(f, text) {
    showMessage(text);
    popup(f, STATUS_INFO[f.status].tag, 'status');
    drainAtb(rowOf(f));
    gsap.delayedCall(0.8, () => refillAtb(f));
    return false;
  }

  // Sleep or freeze landing on a party member who's waiting for orders takes the turn away.
  function interruptTurn(f) {
    if (f.side !== 'party' || !battle.ready.includes(f.index)) return;
    battle.ready = battle.ready.filter(r => r !== f.index);
    rowOf(f).classList.remove('ready');
    if (battle.active === f.index) {
      standDown(f.index, true);
      battle.active = null;
      closeMenus();
    }
    drainAtb(rowOf(f));
    refillAtb(f);
    activateNext();
  }

  // Take command of a ready party member. Switching away doesn't spend the other one's turn.
  function activate(i) {
    const f = battle.party[i];
    if (battle.over || f.fainted || !battle.ready.includes(i) || battle.active === i) return;
    if (battle.active != null) standDown(battle.active, true);
    battle.active = i;
    const unit = unitOf(f);
    rowOf(f).classList.add('active');
    unit.classList.add('active');
    gsap.to(innerOf(unit), { x: STEP_FORWARD, duration: 0.3, ease: 'power2.out' });
    gsap.fromTo(unit.querySelector('.unit-cursor'), { y: 0 }, { y: -6, duration: 0.3, ease: 'steps(1)', repeat: -1, yoyo: true });
    els.commandTitle.textContent = f.name;
    renderMoves(i);
    closeMenus();
    openCommand();
  }

  function activateNext() {
    if (battle.active == null && battle.ready.length) activate(battle.ready[0]);
  }

  function standDown(i, stepBack) {
    const f = battle.party[i];
    const unit = unitOf(f);
    rowOf(f).classList.remove('active');
    unit.classList.remove('active');
    gsap.killTweensOf(unit.querySelector('.unit-cursor'));
    if (stepBack) gsap.to(innerOf(unit), { x: 0, duration: 0.25, ease: 'power2.out' });
  }

  function rejectRow(f) {
    gsap.fromTo(rowOf(f), { x: -6 }, { x: 0, duration: 0.45, ease: 'elastic.out(1.2, 0.3)' });
  }

  // Spends the active Pokémon's turn: plays its animation, then its gauge refills
  // at a speed scaled by how heavy the action was.
  function endTurn(text, factor, animate) {
    const i = battle.active;
    if (i == null) return;
    const f = battle.party[i];
    battle.active = null;
    battle.ready = battle.ready.filter(r => r !== i);
    closeMenus();
    showMessage(text);
    standDown(i, false);
    rowOf(f).classList.remove('ready');
    drainAtb(rowOf(f));

    const unit = unitOf(f);
    const tl = gsap.timeline({ onComplete: () => fillPartyAtb(i, 0, factor) });
    animate?.(tl, unit);
    tl.to(innerOf(unit), { x: 0, duration: 0.3, ease: 'power2.inOut' });

    // Real time: the next ready Pokémon gets the menu straight away.
    activateNext();
  }

  function lunge(tl, unit, dir, onHit) {
    const inner = innerOf(unit);
    tl.to(inner, { x: 120 * dir, duration: 0.18, ease: 'power2.in' })
      .add(onHit)
      .to(inner, { x: 100 * dir, duration: 0.12 })
      .to({}, { duration: 0.3 });
  }

  // A small hop for moves aimed at the user (Swords Dance, Recover…).
  function cast(tl, unit, onHit) {
    tl.to(innerOf(unit), { y: -16, duration: 0.15, yoyo: true, repeat: 1, ease: 'power2.out' })
      .add(onHit)
      .to({}, { duration: 0.4 });
  }

  // Resolves a move at the moment it lands: confusion first, then damage or the status effect.
  function resolveMove(attacker, target, move) {
    if (battle.over || attacker.fainted) return;
    if (confusedSelfHit(attacker)) return;
    const foes = attacker.side === 'party' ? battle.enemies : battle.party;
    const scope = moveScope(move);
    // Real time: the chosen target may have fainted mid-swing.
    if (scope === 'foe' && (!target || target.fainted)) target = pick(living(foes));
    if (scope === 'foe' && !target) return;

    if (move.category !== 'status') {
      strike(attacker, target, move);
    } else if (!statusMoveWorks(move)) {
      popup(attacker, 'No effect', 'miss');
    } else if (scope === 'self') {
      if (!applyStatusMove(attacker, attacker, move)) popup(attacker, 'Failed', 'miss');
    } else {
      for (const t of scope === 'foes' ? living(foes) : [target]) {
        if (!Combat.hits(attacker, t, move)) popup(t, 'Miss', 'miss');
        else if (!applyStatusMove(attacker, t, move)) popup(t, 'Failed', 'miss');
      }
    }
  }

  function applyStatusMove(user, target, move) {
    let worked = false;
    if (move.statChanges.length) worked = changeStats(target, move.statChanges) || worked;
    if (SUPPORTED_AILMENTS.has(move.ailment) && (!move.ailmentChance || Math.random() * 100 < move.ailmentChance)) {
      worked = inflict(target, move.ailment) || worked;
    }
    if (move.healing > 0 && user.hp < user.maxHp) {
      heal(user, Math.floor((user.maxHp * move.healing) / 100));
      worked = true;
    }
    return worked;
  }

  // Extra effects of damaging attacks: drain/recoil, status chances, stat changes.
  function applySecondary(user, target, move, damage) {
    if (move.drain) {
      const amount = Math.max(1, Math.round((damage * Math.abs(move.drain)) / 100));
      if (move.drain > 0) {
        heal(user, amount, 'Drain');
      } else {
        popup(user, amount, 'damage', 'Recoil');
        setHp(user, user.hp - amount);
      }
    }
    if (!target.fainted && SUPPORTED_AILMENTS.has(move.ailment) && Math.random() * 100 < move.ailmentChance) {
      inflict(target, move.ailment);
    }
    if (move.statChanges.length && Math.random() * 100 < (move.statChance || 100)) {
      // "damage-raise" moves change the user's stats (Flame Charge, Close Combat); the rest hit the target's.
      const who = move.effectCategory === 'damage-raise' ? user : target;
      if (!who.fainted) changeStats(who, move.statChanges);
    }
  }

  function confusedSelfHit(f) {
    if (!f.confused) return false;
    f.confused -= 1;
    if (f.confused === 0) {
      showMessage(`${displayName(f)} snapped out of confusion!`);
      paintConditions(f);
      return false;
    }
    if (Math.random() >= 1 / 3) return false;
    const damage = Combat.confusionDamage(f);
    showMessage(`${displayName(f)} hurt itself in confusion!`);
    blink(imgOf(f));
    popup(f, damage, 'damage', 'Confused');
    setHp(f, f.hp - damage);
    return true;
  }

  function heal(f, amount, note = '') {
    const healed = Math.min(amount, f.maxHp - f.hp);
    glow(f);
    popup(f, `+${healed}`, 'heal', note);
    setHp(f, f.hp + healed);
  }

  function inflict(f, ailment) {
    if (ailment === 'confusion') {
      if (f.fainted || f.confused) return false;
      f.confused = 2 + Math.floor(Math.random() * 4); // lasts 2–5 actions
      popup(f, 'CNF', 'status');
      showMessage(`${displayName(f)} became confused!`);
    } else {
      if (!Combat.canReceiveStatus(f, ailment)) return false;
      f.status = ailment;
      if (ailment === 'sleep') f.sleepTurns = 2 + Math.floor(Math.random() * 3); // sleeps through 1–3 turns
      popup(f, STATUS_INFO[ailment].tag, 'status');
      showMessage(`${displayName(f)} ${STATUS_INFO[ailment].text}`);
      if (ailment === 'sleep' || ailment === 'freeze') interruptTurn(f);
    }
    paintConditions(f);
    return true;
  }

  function cure(f, text) {
    f.status = null;
    f.sleepTurns = 0;
    paintConditions(f);
    if (text) showMessage(text);
  }

  function changeStats(f, changes) {
    const applied = Combat.changeStages(f, changes);
    if (!applied.length) return false;
    const parts = applied.map(({ stat, delta }) => {
      const label = STAT_LABELS[stat];
      return delta ? `${label} ${(delta > 0 ? '↑' : '↓').repeat(Math.min(Math.abs(delta), 3))}` : `${label} max`;
    });
    popup(f, parts.join(' '), applied.some(a => a.delta > 0) ? 'buff' : 'debuff');
    paintConditions(f);
    return applied.some(a => a.delta !== 0);
  }

  function conditionSummary(f) {
    const parts = [];
    if (f.status) parts.push(STATUS_INFO[f.status].tag);
    if (f.confused) parts.push('CNF');
    Object.entries(f.stages).forEach(([stat, s]) => {
      if (s) parts.push(`${STAT_LABELS[stat]} ${s > 0 ? '+' : '−'}${Math.abs(s)}`);
    });
    return parts.join(' · ');
  }

  // Status icon and glow on the sprite, tags and stat stages on the HUD row.
  function paintConditions(f) {
    const unit = unitOf(f);
    Combat.STATUSES.forEach(s => unit.classList.toggle(`st-${s}`, f.status === s));
    unit.querySelector('.unit-status').textContent = [STATUS_INFO[f.status]?.icon, f.confused ? '💫' : ''].filter(Boolean).join('');
    const row = rowOf(f);
    const tags = [f.status && STATUS_INFO[f.status].tag, f.confused && 'CNF'].filter(Boolean);
    row.querySelector('.row-status').innerHTML = tags.map(t => `<i class="tag tag-${t.toLowerCase()}">${t}</i>`).join('');
    row.querySelector('.row-stages').textContent = Object.entries(f.stages)
      .filter(([, s]) => s)
      .map(([stat, s]) => `${STAT_LABELS[stat]}${s > 0 ? '+' : ''}${s}`)
      .join(' ');
    row.title = conditionSummary(f);
  }

  function strike(attacker, target, move) {
    const result = Combat.calcDamage(attacker, target, move);
    if (result.missed) {
      popup(target, 'Miss', 'miss');
      return;
    }
    if (result.multiplier === 0) {
      popup(target, 'Immune', 'miss');
      return;
    }
    const { damage, reduced } = Combat.applyGuard(target, result.damage);
    const notes = [
      result.crit ? 'Critical hit!' : result.multiplier > 1 ? 'Super effective!' : result.multiplier < 1 ? 'Not very effective' : '',
      reduced ? `Guarded −${Math.round(reduced * 100)}%` : '',
    ].filter(Boolean);
    if (reduced) showGuard(target, true);
    else blink(imgOf(target));
    shake(target);
    popup(target, damage, result.crit ? 'damage crit' : 'damage', notes.join(' · '));
    setHp(target, target.hp - damage);
    applySecondary(attacker, target, move, damage);
  }

  // The shield bubble stays up while guard charges remain, fading as they're used.
  function showGuard(f, blocked = false) {
    const unit = unitOf(f);
    unit.classList.toggle('defending', f.guards > 0);
    unit.dataset.guards = f.guards;
    if (blocked) {
      gsap.fromTo(unit.querySelector('.unit-shield'), { opacity: 1, scale: 1.12 },
        { opacity: f.guards > 0 ? 0.45 : 0, scale: 1, duration: 0.5, ease: 'power2.out', clearProps: 'opacity,transform' });
    }
    const row = rowOf(f);
    row.querySelector('.row-guard').textContent = f.guards > 0 ? `🛡${f.guards}` : '';
  }

  function enemyAct(j) {
    const f = battle.enemies[j];
    if (f.fainted || battle.over) return;
    if (battle.paused) {
      battle.pending.push(j);
      return;
    }
    if (!startTurn(f)) return;
    const move = chooseEnemyMove(f);
    const scope = moveScope(move);
    const target = scope === 'self' ? f : pick(living(battle.party));
    if (!target) return;
    const row = rowOf(f);
    showMessage(`${displayName(f)} used ${move.name}!`);
    row.classList.add('acting');
    drainAtb(row);

    const unit = unitOf(f);
    const tl = gsap.timeline({
      onComplete() {
        row.classList.remove('acting');
        fillEnemyAtb(j, 0, recoveryFactor(move));
      },
    });
    if (scope === 'self') cast(tl, unit, () => resolveMove(f, f, move));
    else lunge(tl, unit, -1, () => resolveMove(f, target, move));
    tl.to(innerOf(unit), { x: 0, duration: 0.3, ease: 'power2.inOut' });
  }

  // Wild Pokémon mostly attack, but sometimes use a status move that would actually do something.
  function chooseEnemyMove(f) {
    const moves = f.moves || [];
    const attacks = moves.filter(m => m.category !== 'status');
    const support = moves.filter(m => m.category === 'status' && statusMoveWorks(m) && !(m.healing && f.hp > f.maxHp / 2));
    if (support.length && (!attacks.length || Math.random() < 0.3)) return pick(support);
    return attacks.length ? pick(attacks) : TACKLE;
  }

  function faint(f) {
    f.fainted = true;
    Combat.clearConditions(f);
    showGuard(f);
    paintConditions(f);
    const row = rowOf(f);
    const unit = unitOf(f);
    row.classList.add('fainted');
    row.classList.remove('ready', 'active', 'acting');
    unit.classList.remove('active');
    unit.classList.add('fainted');
    drainAtb(row);
    showMessage(`${displayName(f)} fainted!`);

    if (f.side === 'enemy') {
      gsap.timeline()
        .to(imgOf(f), { filter: 'brightness(0.4) sepia(1) saturate(6) hue-rotate(-40deg)', duration: 0.15, delay: 0.3 })
        .to(unit, { opacity: 0, y: 24, duration: 0.7, ease: 'power2.in' });
    } else {
      battle.ready = battle.ready.filter(r => r !== f.index);
      gsap.killTweensOf(unit.querySelector('.unit-cursor'));
      gsap.to(imgOf(f), { filter: 'grayscale(1) brightness(0.7)', opacity: 0.45, duration: 0.5, delay: 0.3 });
      if (battle.active === f.index) {
        battle.active = null;
        closeMenus();
        gsap.to(innerOf(unit), { x: 0, duration: 0.3 });
      }
    }

    refreshTargets();
    checkBattleEnd();
    activateNext();
  }

  function revive(f) {
    f.fainted = false;
    unitOf(f).classList.remove('fainted');
    rowOf(f).classList.remove('fainted');
    gsap.to(imgOf(f), { filter: 'grayscale(0) brightness(1)', opacity: 1, duration: 0.5, clearProps: 'filter' });
    setHp(f, Math.floor(f.maxHp / 2));
    fillPartyAtb(f.index);
  }

  // ---------- Commands ----------

  async function chooseMove(index) {
    const f = battle.party[battle.active];
    const move = f.moves?.[index];
    if (!move) return;
    if (move.ppLeft <= 0) {
      showMessage(`${move.name} is out of PP!`);
      return;
    }
    const text = `${f.name} used ${move.name}!`;
    const scope = moveScope(move);
    // Only single-target moves need a target picked; self and all-foe moves go straight off.
    if (scope !== 'foe') {
      move.ppLeft -= 1;
      endTurn(text, recoveryFactor(move), (tl, unit) => (scope === 'foes'
        ? lunge(tl, unit, 1, () => resolveMove(f, null, move))
        : cast(tl, unit, () => resolveMove(f, f, move))));
      return;
    }
    beginTargeting({
      label: move.name,
      candidates: () => living(battle.enemies),
      onConfirm(target) {
        move.ppLeft -= 1;
        endTurn(text, recoveryFactor(move), (tl, unit) => lunge(tl, unit, 1, () => resolveMove(f, target, move)));
      },
    });
  }

  function itemTargets(item, user) {
    if (item.target === 'ally') return living(battle.party);
    if (item.target === 'fainted') return battle.party.filter(p => p.fainted);
    if (item.target === 'afflicted') return living(battle.party).filter(p => p.status || p.confused);
    return [user];
  }

  function useItem(item, user, target) {
    item.qty -= 1;
    const text = target === user
      ? `${user.name} used ${article(item.name)} ${item.name}!`
      : `Used ${article(item.name)} ${item.name} on ${target.name}!`;
    endTurn(text, RECOVERY.item, tl => tl.add(() => {
      if (item.heal) {
        heal(target, item.heal);
      } else if (item.id === 'full-heal') {
        target.confused = 0;
        cure(target);
        glow(target);
        popup(target, 'Cured', 'heal');
      } else if (item.id === 'revive') {
        if (!target.fainted) return;
        revive(target);
        popup(target, `+${target.hp}`, 'heal', 'Revived!');
      } else if (item.id === 'ether') {
        user.moves?.forEach(m => { m.ppLeft = Math.min(m.pp, m.ppLeft + 10); });
        glow(user);
        popup(user, 'PP +10', 'heal');
      } else if (item.id === 'x-attack') {
        glow(user);
        changeStats(user, [{ stat: 'attack', change: 2 }]);
      }
    }).to({}, { duration: 0.5 }));
  }

  function chooseItem(index) {
    const user = battle.party[battle.active];
    const item = battle.items[index];
    if (!item || item.qty <= 0 || !itemTargets(item, user).length) return;
    if (item.target === 'self') {
      useItem(item, user, user);
      return;
    }
    beginTargeting({
      label: item.name,
      candidates: () => itemTargets(item, user),
      onConfirm: target => useItem(item, user, target),
    });
  }

  function defend() {
    const f = battle.party[battle.active];
    // Resets (doesn't stack) to a fresh set of guarded hits.
    f.guards = Combat.GUARD_CHARGES;
    showGuard(f);
    endTurn(`${f.name} braces for the next ${Combat.GUARD_CHARGES} hits!`, RECOVERY.defend, (tl, unit) => {
      const shield = unit.querySelector('.unit-shield');
      tl.fromTo(shield, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(2)' })
        .to(shield, { opacity: 0.45, duration: 0.4, clearProps: 'opacity,transform' });
    });
  }

  function commandUnit(f) {
    if (battle.ready.includes(f.index) && !f.fainted) activate(f.index);
    else rejectRow(f);
  }

  // ---------- Target selection ----------

  function beginTargeting({ label, candidates, onConfirm }) {
    const list = candidates();
    if (!list.length) return;
    battle.targeting = { label, candidates, onConfirm, target: null };
    document.body.classList.add('targeting');
    els.help.classList.add('open');
    markTarget(list[0]);
  }

  function markTarget(f) {
    const t = battle.targeting;
    document.querySelectorAll('.targeted').forEach(el => el.classList.remove('targeted'));
    t.target = f;
    unitOf(f).classList.add('targeted');
    rowOf(f).classList.add('targeted');
    const title = document.createElement('strong');
    const conditions = conditionSummary(f);
    title.textContent = `${t.label} → ${displayName(f)}  (HP ${f.hp}/${f.maxHp}${conditions ? ` · ${conditions}` : ''})`;
    els.help.replaceChildren(title, 'Arrow keys or hover to switch target · Enter or click to confirm · Esc to cancel');
  }

  function cycleTarget(step) {
    const t = battle.targeting;
    const list = t.candidates();
    const index = list.indexOf(t.target);
    markTarget(list[(index + step + list.length) % list.length]);
  }

  function confirmTarget(f) {
    const t = battle.targeting;
    if (!t || !f || !t.candidates().includes(f)) return;
    cancelTargeting();
    t.onConfirm(f);
  }

  function cancelTargeting() {
    if (!battle.targeting) return false;
    battle.targeting = null;
    document.body.classList.remove('targeting');
    document.querySelectorAll('.targeted').forEach(el => el.classList.remove('targeted'));
    const item = currentItem();
    if (item) pointTo(item);
    return true;
  }

  function refreshTargets() {
    const t = battle.targeting;
    if (!t) return;
    const list = t.candidates();
    if (!list.length) cancelTargeting();
    else if (!list.includes(t.target)) markTarget(list[0]);
  }

  // ---------- Menus ----------

  function bobPointer(pointer) {
    gsap.to(pointer, { x: -5, duration: 0.3, ease: 'steps(1)', repeat: -1, yoyo: true });
  }

  function focusItem(menu, index = 0) {
    const items = menu.querySelectorAll('.menu-item');
    select(items[Math.min(index, items.length - 1)]);
  }

  // The highlighted item is tracked with a class so the cursor works even when the page lacks focus.
  function select(item) {
    if (!item) return;
    const list = item.closest('.menu-list');
    list.querySelectorAll('.current').forEach(el => el.classList.remove('current'));
    item.classList.add('current');
    if (document.activeElement !== item) item.focus({ preventScroll: true });
    pointTo(item);
  }

  function currentItem() {
    const menu = document.querySelector('.submenu.open') || document.querySelector('.command.open');
    return menu?.querySelector('.menu-item.current');
  }

  function pointTo(item) {
    const list = item.closest('.menu-list');
    gsap.to(list.querySelector('.pointer'), {
      left: item.offsetLeft - 18, top: item.offsetTop + item.offsetHeight / 2, duration: 0.12, ease: 'power2.out',
    });
    item.scrollIntoView({ block: 'nearest' });
    if (!item.dataset.help || battle.targeting) return;
    const title = document.createElement('strong');
    title.textContent = item.dataset.meta;
    els.help.replaceChildren(title, ` ${item.dataset.help}`);
  }

  function openCommand() {
    els.commandPanel.classList.add('engaged');
    els.command.classList.add('open');
    positionPanel();
    gsap.fromTo(els.command, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.2, ease: 'power2.out' });
    focusItem(els.command);
  }

  function openSubmenu(menu) {
    if (menu === els.itemMenu) renderItems();
    setPaused(true);
    menu.classList.add('open');
    els.commandPanel.classList.add('expanded');
    positionPanel();
    els.help.classList.add('open');
    els.help.textContent = '';
    gsap.fromTo(menu, { opacity: 0, x: 16 }, { opacity: 1, x: 0, duration: 0.2, ease: 'power2.out' });
    focusItem(menu);
  }

  function closeSubmenu() {
    const open = document.querySelector('.submenu.open');
    if (!open) return false;
    open.classList.remove('open');
    els.commandPanel.classList.remove('expanded');
    positionPanel();
    els.help.classList.remove('open');
    setPaused(false);
    const action = open === els.attackMenu ? 'attack' : 'items';
    select(els.command.querySelector(`[data-action="${action}"]`));
    return true;
  }

  function closeMenus() {
    cancelTargeting();
    document.querySelectorAll('.command, .submenu').forEach(m => m.classList.remove('open'));
    els.commandPanel.classList.remove('engaged', 'expanded');
    els.help.classList.remove('open');
    setPaused(false);
    if (document.activeElement?.closest('.command-panel')) document.activeElement.blur();
  }

  async function renderMoves(i) {
    els.moveList.innerHTML = '<p class="menu-empty">Loading attacks…</p>';
    const moves = await loadMoves(battle.party[i]);
    if (battle.active !== i) return;
    if (!moves.length) {
      els.moveList.innerHTML = '<p class="menu-empty">No attacks known.</p>';
      return;
    }
    els.moveList.innerHTML = moves.map((m, index) => {
      const factor = recoveryFactor(m);
      const meta = [
        capitalize(m.type), capitalize(m.category), `Power ${m.power ?? '—'}`,
        `Acc ${m.accuracy ? `${m.accuracy}%` : '—'}`, `ATB refill ×${factor.toFixed(2)}`,
        m.category === 'status' && !statusMoveWorks(m) ? 'No effect in battle yet' : '',
      ].filter(Boolean).join(' · ');
      return `
        <button type="button" class="menu-item move${m.ppLeft <= 0 ? ' disabled' : ''}" role="menuitem"
          data-action="move" data-index="${index}" data-meta="${attr(`${m.name} — ${meta}`)}" data-help="${attr(m.effect)}">
          <span class="mv-name">${m.name}</span>${typeBadge(m.type)}
          <span class="mv-pow${factor > 1.2 ? ' heavy' : ''}">${m.power ?? '—'}</span>
          <span class="mv-pp">${m.ppLeft}/${m.pp}</span>
        </button>`;
    }).join('') + '<span class="pointer"></span>';
    bobPointer(els.moveList.querySelector('.pointer'));
    if (els.attackMenu.classList.contains('open')) focusItem(els.attackMenu);
  }

  function renderItems() {
    const user = battle.party[battle.active];
    els.itemList.innerHTML = battle.items.map((item, index) => {
      const usable = item.qty > 0 && (!user || itemTargets(item, user).length > 0);
      return `
        <button type="button" class="menu-item bag-item${usable ? '' : ' disabled'}" role="menuitem"
          data-action="item" data-index="${index}" data-meta="${attr(item.name)}" data-help="${attr(item.text)}">
          <img src="${ITEM_SPRITES}/${item.id}.png" alt="">
          <span class="mv-name">${item.name}</span>
          <span class="mv-pp">×${item.qty}</span>
        </button>`;
    }).join('') + '<span class="pointer"></span>';
    bobPointer(els.itemList.querySelector('.pointer'));
  }

  // ---------- Input ----------

  // Arrow-key style movement inside a menu list (two-column lists move sideways too).
  function moveInMenu(item, key) {
    const list = item.closest('.menu-list');
    const cols = getComputedStyle(list).gridTemplateColumns.split(' ').length;
    const step = { ArrowUp: -cols, ArrowDown: cols, ArrowLeft: cols > 1 ? -1 : 0, ArrowRight: cols > 1 ? 1 : 0 }[key];
    if (step == null) return false;
    const items = [...list.querySelectorAll('.menu-item')];
    select(items[items.indexOf(item) + step]);
    return true;
  }

  // LB/RB: hand command to the previous/next Pokémon whose gauge is full.
  function cycleCommand(step) {
    const ready = [...battle.ready].sort((a, b) => a - b);
    if (!ready.length) return;
    const index = ready.indexOf(battle.active);
    activate(ready[index < 0 ? 0 : (index + step + ready.length) % ready.length]);
  }

  const PAD_KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

  function onPad(action) {
    if (!els.result.hidden) {
      const buttons = [...els.result.querySelectorAll('.win-btn')];
      const index = Math.max(0, buttons.indexOf(document.activeElement));
      if (action === 'left' || action === 'right') buttons[(index + 1) % buttons.length].focus();
      else if (action === 'confirm' || action === 'start') buttons[index].click();
      return;
    }
    if (action === 'select') {
      els.music.click();
      return;
    }
    if (action === 'y') {
      toggleView();
      return;
    }
    if (battle.targeting) {
      if (action === 'up' || action === 'left') cycleTarget(-1);
      else if (action === 'down' || action === 'right') cycleTarget(1);
      else if (action === 'confirm') confirmTarget(battle.targeting.target);
      else if (action === 'back') cancelTargeting();
      return;
    }
    if (action === 'prev' || action === 'next') {
      cycleCommand(action === 'next' ? 1 : -1);
      return;
    }
    if (action === 'back') {
      closeSubmenu();
      return;
    }
    const item = currentItem();
    if (!item) return;
    if (action === 'confirm') item.click();
    else if (PAD_KEYS[action]) moveInMenu(item, PAD_KEYS[action]);
  }

  function bindControls() {
    // Sprites and HUD rows: pick a target while targeting, otherwise take command of a party member.
    const onFighterClick = e => {
      const f = fighterOf(e.target);
      if (!f || battle.over) return;
      if (battle.targeting) confirmTarget(f);
      else if (f.side === 'party') commandUnit(f);
    };
    const onFighterHover = e => {
      const f = fighterOf(e.target);
      const t = battle.targeting;
      if (f && t && f !== t.target && t.candidates().includes(f)) markTarget(f);
    };
    for (const el of [els.units, els.partyRows, els.enemyRows, els.plates]) {
      el.addEventListener('click', onFighterClick);
      el.addEventListener('mouseover', onFighterHover);
    }

    // Mouse hover moves the menu cursor; arrow keys and Enter work too.
    els.commandPanel.addEventListener('mouseover', e => {
      const item = e.target.closest('.menu-item');
      if (item && !battle.targeting && !item.classList.contains('current')) select(item);
    });
    els.commandPanel.addEventListener('focusin', e => {
      const item = e.target.closest('.menu-item');
      if (item && !battle.targeting && !item.classList.contains('current')) select(item);
    });
    els.commandPanel.addEventListener('click', e => {
      if (e.target.closest('.sub-back')) {
        cancelTargeting();
        closeSubmenu();
        return;
      }
      const item = e.target.closest('.menu-item');
      if (!item || battle.active == null) return;
      cancelTargeting();
      select(item);
      switch (item.dataset.action) {
        case 'attack': openSubmenu(els.attackMenu); break;
        case 'items': openSubmenu(els.itemMenu); break;
        case 'defend': defend(); break;
        case 'move': chooseMove(Number(item.dataset.index)); break;
        case 'item': chooseItem(Number(item.dataset.index)); break;
      }
    });
    els.hud.addEventListener('contextmenu', e => {
      if (cancelTargeting() || closeSubmenu()) e.preventDefault();
    });

    document.addEventListener('keydown', e => {
      if (battle.targeting) {
        const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key];
        if (step) cycleTarget(step);
        else if (e.key === 'Enter' || e.key === ' ') confirmTarget(battle.targeting.target);
        else if (e.key === 'Escape' || e.key === 'Backspace') cancelTargeting();
        else return;
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (closeSubmenu()) e.preventDefault();
        return;
      }
      const item = currentItem();
      if (!item) return;
      if ((e.key === 'Enter' || e.key === ' ') && !document.activeElement?.matches('button, a')) {
        e.preventDefault();
        item.click();
        return;
      }
      if (moveInMenu(item, e.key)) e.preventDefault();
    });
    Gamepad.on(onPad);

    els.command.querySelectorAll('.pointer').forEach(bobPointer);
    els.againBtn.addEventListener('click', () => {
      if (battle.nextUrl) location.href = battle.nextUrl;
      else location.reload();
    });
    els.music.addEventListener('click', () => {
      Music.toggle();
      updateMusicButton();
    });
    els.viewBtn.addEventListener('click', toggleView);
    document.addEventListener('keydown', e => {
      if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && !e.altKey) toggleView();
    });
    updateMusicButton();
  }

  function toggleView() {
    if (battle.party.length) setView(isAdvanced() ? 'traditional' : 'advanced');
  }

  function updateMusicButton() {
    const on = Music.isEnabled();
    els.music.setAttribute('aria-pressed', String(on));
    els.music.textContent = on ? '♫ Music on' : '♫ Music off';
  }

  // ---------- Battle end ----------

  function checkBattleEnd() {
    if (battle.over) return;
    const won = battle.enemies.every(f => f.fainted);
    const lost = battle.party.every(f => f.fainted);
    if (!won && !lost) return;

    battle.over = true;
    closeMenus();
    if (battle.active != null) standDown(battle.active, true);
    battle.active = null;
    battle.ready = [];
    document.querySelectorAll('.atb i').forEach(fill => gsap.killTweensOf(fill));
    document.querySelectorAll('.unit-row').forEach(row => row.classList.remove('ready', 'active'));
    // Tower progress: a win unlocks the next floor, a loss sends the climb back to Floor I.
    if (floorInfo) Tower.setFloor(won ? towerFloor : 0);
    Music.play(won ? 'victory' : 'defeat');
    gsap.delayedCall(1.5, () => showResult(won));
  }

  function resultCopy(won) {
    if (!floorInfo) {
      return won
        ? { title: 'Victory!', text: 'All the wild Pokémon fainted.', button: 'Battle again' }
        : { title: 'Defeated…', text: 'Your whole team fainted.', button: 'Battle again' };
    }
    const roman = Tower.ROMAN[towerFloor - 1];
    const next = Tower.FLOORS[towerFloor];
    battle.nextUrl = `tower.html?${won ? 'cleared' : 'fell'}=${towerFloor}`;
    if (!won) return { title: 'Defeated…', text: `Your team fell on Floor ${roman}. The climb starts over.`, button: 'Back to tower' };
    if (!next) return { title: 'Tower conquered!', text: `${floorInfo.trainer} has fallen. The summit is yours!`, button: 'To the summit' };
    return { title: `Floor ${roman} cleared!`, text: `Next up: Floor ${Tower.ROMAN[towerFloor]} · ${next.name}`, button: 'Continue climb' };
  }

  function showResult(won) {
    const copy = resultCopy(won);
    els.resultTitle.textContent = copy.title;
    els.resultText.textContent = copy.text;
    els.againBtn.textContent = copy.button;
    els.result.classList.toggle('lost', !won);
    els.result.hidden = false;
    gsap.fromTo(els.result, { opacity: 0 }, { opacity: 1, duration: 0.3 });
    gsap.fromTo('.result-card', { scale: 0.8, y: 20 }, { scale: 1, y: 0, duration: 0.45, ease: 'back.out(1.7)' });
    // Victory hop for whoever is still standing.
    if (won) {
      living(battle.party).forEach((f, i) => gsap.to(innerOf(unitOf(f)), {
        y: -16, duration: 0.22, repeat: -1, yoyo: true, ease: 'power2.out', delay: i * 0.12,
      }));
    }
    els.againBtn.focus();
  }

  // ---------- Intro ----------

  function playIntro() {
    const names = battle.enemies.map(f => f.name);
    const inners = list => list.map(innerOf);
    // Starts with the encounter flash (or on the first click if the browser blocked autoplay).
    Music.play('battle');

    gsap.timeline()
      // Encounter flash
      .to(els.flash, { opacity: 0, duration: 0.12 })
      .to(els.flash, { opacity: 1, duration: 0.08 })
      .to(els.flash, { opacity: 0, duration: 0.5 })
      .from(els.field, { scale: 1.25, filter: 'brightness(2.5) blur(6px)', duration: 0.9, ease: 'power3.out' }, '<')
      .from(inners(battle.enemyUnits), { x: '45vw', opacity: 0, duration: 0.7, stagger: 0.12, ease: 'power3.out' }, 0.45)
      .from(inners(battle.units), { x: '-45vw', opacity: 0, duration: 0.7, stagger: 0.12, ease: 'power3.out' }, 0.7)
      // Landing hop
      .to(inners(battle.units), { y: -18, duration: 0.15, stagger: 0.12, yoyo: true, repeat: 1, ease: 'power2.out' }, '>-0.1')
      .from(els.hud, { yPercent: 110, duration: 0.5, ease: 'power3.out' }, 1.1)
      .from(els.plates, { opacity: 0, duration: 0.4 }, 1.1)
      .add(() => showMessage(floorInfo
        ? `${floorInfo.trainer} sends out ${names.slice(0, -1).join(', ')} and ${names.at(-1)}!`
        : `Wild ${names.slice(0, -1).join(', ')} and ${names.at(-1)} appeared!`), 1.2)
      .add(() => {
        battle.party.forEach((_, i) => fillPartyAtb(i, rand(0, 0.35)));
        battle.enemies.forEach((_, j) => fillEnemyAtb(j, rand(0, 0.2)));
      }, floorInfo ? 2.6 : 1.8);

    // Tower floors open with a big title card.
    if (floorInfo) {
      els.floorTitle.querySelector('small').textContent = `Floor ${Tower.ROMAN[towerFloor - 1]}`;
      els.floorTitle.querySelector('strong').textContent = floorInfo.name;
      els.floorTitle.hidden = false;
      gsap.timeline({ delay: 0.3, onComplete: () => { els.floorTitle.hidden = true; } })
        .fromTo(els.floorTitle, { scale: 1.6, opacity: 0, filter: 'blur(8px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.5, ease: 'power3.out' })
        .to(els.floorTitle, { opacity: 0, y: -20, duration: 0.4, delay: 1.3 });
    }
  }

  // Wild battles roam outdoors; tower battles happen in the tower's arena, decked in the floor's colour.
  function setupMode() {
    if (!floorInfo) {
      els.field.dataset.biome = pick(BIOMES);
      buildScenery();
      buildMotes();
      return;
    }
    els.field.dataset.biome = 'tower';
    els.field.style.setProperty('--floor-accent', floorInfo.color);
    buildTowerScenery();
    buildMotes(true);
    els.loading.innerHTML = `Climbing to Floor ${Tower.ROMAN[towerFloor - 1]}<span class="dots"></span>`;
    els.backBtn.textContent = '← Tower';
    els.backBtn.href = 'tower.html';
    els.enemyTitle.textContent = floorInfo.trainer;
    document.title = `Battle Tower · Floor ${Tower.ROMAN[towerFloor - 1]}`;
  }

  // ---------- Boot ----------

  async function init() {
    setupMode();
    gsap.set(els.flash, { opacity: 1 });
    gsap.to(els.flash, { opacity: 0.85, duration: 0.3 });

    let teams;
    try {
      teams = await loadTeams();
    } catch {
      els.loading.innerHTML = 'Could not reach PokéAPI. <a href="battle.html">Try again</a>';
      gsap.set(els.flash, { opacity: 0 });
      return;
    }
    battle.party = teams.party.map((d, i) => Combat.createFighter(d, 'party', i));
    battle.enemies = teams.enemies.map((d, i) => Combat.createFighter(d, 'enemy', i));
    battle.units = battle.party.map((f, i) => createUnit(f, PLAYER_SPOTS[i]));
    battle.enemyUnits = battle.enemies.map((f, i) => createUnit(f, ENEMY_SPOTS[i]));
    els.units.replaceChildren(...battle.units, ...battle.enemyUnits);
    renderHud();
    // Fetch everyone's attacks in the background so the menus and enemy AI are ready.
    [...battle.party, ...battle.enemies].forEach(loadMoves);

    await Promise.all([
      ...battle.party.map(f => loadSprite(imgOf(f), f.id)),
      ...battle.enemies.map(f => loadSprite(imgOf(f), f.id)),
    ]);
    els.loading.remove();
    // Advanced is the default; Traditional only if the player picked it before.
    let view = 'advanced';
    try { view = localStorage.getItem(VIEW_KEY) === 'traditional' ? 'traditional' : 'advanced'; } catch { /* default */ }
    setView(view);
    playIntro();
  }

  bindControls();

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(relayout, 100);
  });

  init();
})();
