(() => {
  const MAX_ID = 1025;
  // Feet positions as % of the field; lower on screen = closer to the camera.
  const PLAYER_SPOTS = [{ x: 26, y: 60 }, { x: 34, y: 75 }, { x: 18, y: 90 }];
  const ENEMY_SPOTS = [{ x: 74, y: 60 }, { x: 66, y: 75 }, { x: 82, y: 90 }];
  const BIOMES = ['forest', 'autumn', 'night'];
  // Gen V pixel sprites are small, so they get scaled up more than the HD Showdown ones.
  const KIND_SCALE = { pixel: 2, hd: 1.3, still: 1.6 };
  // Wild Pokémon gauges fill a little slower, since you need time to work the menus.
  const ENEMY_ATB_SCALE = 1.3;
  const ITEM_SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items';
  const ITEMS = [
    { id: 'potion', name: 'Potion', qty: 5, target: 'ally', heal: 20, text: 'Restores 20 HP to one Pokémon.' },
    { id: 'super-potion', name: 'Super Potion', qty: 3, target: 'ally', heal: 60, text: 'Restores 60 HP to one Pokémon.' },
    { id: 'revive', name: 'Revive', qty: 2, target: 'fainted', text: 'Revives a fainted Pokémon with half its HP.' },
    { id: 'ether', name: 'Ether', qty: 2, target: 'self', text: "Restores 10 PP to each of the user's attacks." },
    { id: 'x-attack', name: 'X Attack', qty: 2, target: 'self', text: "Sharply raises the user's Attack for the rest of the battle." },
  ];
  // Used by wild Pokémon that know no damaging attacks.
  const TACKLE = { name: 'Tackle', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 35 };

  const $ = sel => document.querySelector(sel);
  const els = {
    field: $('#field'), backdrop: $('#backdrop'), frame: $('#frame'), motes: $('#motes'), units: $('#units'),
    message: $('#message'), help: $('#help'), loading: $('#loading'), hud: $('#hud'),
    partyRows: $('#partyRows'), enemyRows: $('#enemyRows'), commandPanel: $('#commandPanel'),
    command: $('#command'), commandTitle: $('#commandTitle'), attackMenu: $('#attackMenu'),
    moveList: $('#moveList'), itemMenu: $('#itemMenu'), itemList: $('#itemList'), flash: $('#flash'),
    result: $('#result'), resultTitle: $('#resultTitle'), resultText: $('#resultText'), againBtn: $('#againBtn'),
    music: $('#musicBtn'),
  };

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
  const atbDuration = (base, scale = 1) => gsap.utils.clamp(2, 7, 300 / (base.speed || 50)) * scale;
  // Heavier attacks take longer to recover from: the gauge refills slower afterwards
  // (40 power ≈ ×0.87, 90 ≈ ×1.2, 150 ≈ ×1.6).
  const RECOVERY = { defend: 0.7, item: 1, status: 0.8 };
  const recoveryFactor = move => (move.category === 'status'
    ? RECOVERY.status
    : gsap.utils.clamp(0.8, 1.8, 0.6 + (move.power ?? 60) / 150));
  const living = list => list.filter(f => !f.fainted);

  const rowOf = f => (f.side === 'party' ? els.partyRows : els.enemyRows).children[f.index];
  const unitOf = f => (f.side === 'party' ? battle.units : battle.enemyUnits)[f.index];
  const innerOf = unit => unit.querySelector('.unit-inner');
  const imgOf = f => unitOf(f).querySelector('img');
  const displayName = f => (f.side === 'enemy' ? `Wild ${f.name}` : f.name);
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
    const enemies = await Promise.all(randomIds(3, partyIds).map(id => PokeAPI.loadDetails(id)));
    return { party, enemies };
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

  function buildMotes() {
    const motes = Array.from({ length: 18 }, () => {
      const m = document.createElement('span');
      m.className = 'mote';
      m.style.left = `${rand(5, 95)}%`;
      m.style.top = `${rand(10, 85)}%`;
      return m;
    });
    els.motes.replaceChildren(...motes);
    motes.forEach(m => gsap.to(m, {
      x: 'random(-70, 70)', y: 'random(-50, 50)', opacity: 'random(0.15, 0.9)',
      duration: 'random(3, 6)', repeat: -1, yoyo: true, repeatRefresh: true, ease: 'sine.inOut',
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
        <span class="row-hp">
          <span class="num"><b>${f.hp}</b>/${f.maxHp}</span>
          <span class="bar hp"><i></i></span>
        </span>
        <span class="bar atb"><i></i></span>
      </${party ? 'button' : 'div'}>`;
  }

  function renderHud() {
    els.partyRows.innerHTML = battle.party.map(unitRow).join('');
    els.enemyRows.innerHTML = battle.enemies.map(unitRow).join('');
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
    fillAtb(f, atbDuration(f.base, factor), from, () => {
      if (f.fainted || battle.over) return;
      row.classList.add('ready');
      battle.ready.push(i);
      if (battle.active == null) activate(i);
    });
  }

  function fillEnemyAtb(j, from = 0, factor = 1) {
    const f = battle.enemies[j];
    if (f.fainted || battle.over) return;
    fillAtb(f, atbDuration(f.base, ENEMY_ATB_SCALE * factor), from, () => gsap.delayedCall(rand(0.2, 0.7), () => enemyAct(j)));
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
    gsap.to(innerOf(unit), { x: 28, duration: 0.3, ease: 'power2.out' });
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

  // Resolves one attack at the moment it lands.
  function strike(attacker, target, move) {
    if (battle.over || attacker.fainted) return;
    // Real time: the chosen target may have fainted mid-swing.
    if (target.fainted) target = pick(living(attacker.side === 'party' ? battle.enemies : battle.party));
    if (!target) return;

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
    const target = pick(living(battle.party));
    if (!target) return;
    const usable = (f.moves || []).filter(m => m.category !== 'status');
    const move = usable.length ? pick(usable) : TACKLE;
    const row = rowOf(f);
    showMessage(`Wild ${f.name} used ${move.name}!`);
    row.classList.add('acting');
    drainAtb(row);

    const unit = unitOf(f);
    const tl = gsap.timeline({
      onComplete() {
        row.classList.remove('acting');
        fillEnemyAtb(j, 0, recoveryFactor(move));
      },
    });
    lunge(tl, unit, -1, () => strike(f, target, move));
    tl.to(innerOf(unit), { x: 0, duration: 0.3, ease: 'power2.inOut' });
  }

  function faint(f) {
    f.fainted = true;
    f.guards = 0;
    showGuard(f);
    const row = rowOf(f);
    const unit = unitOf(f);
    row.classList.add('fainted');
    row.classList.remove('ready', 'active', 'acting');
    unit.classList.remove('active');
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
    if (move.category === 'status') {
      // Stat and status effects aren't modeled yet, so these just spend the turn.
      move.ppLeft -= 1;
      endTurn(`${f.name} used ${move.name}!`, recoveryFactor(move), tl => tl.add(() => popup(f, 'No effect', 'miss')).to({}, { duration: 0.5 }));
      return;
    }
    beginTargeting({
      label: move.name,
      candidates: () => living(battle.enemies),
      onConfirm(target) {
        move.ppLeft -= 1;
        endTurn(`${f.name} used ${move.name}!`, recoveryFactor(move), (tl, unit) => lunge(tl, unit, 1, () => strike(f, target, move)));
      },
    });
  }

  function itemTargets(item, user) {
    if (item.target === 'ally') return living(battle.party);
    if (item.target === 'fainted') return battle.party.filter(p => p.fainted);
    return [user];
  }

  function useItem(item, user, target) {
    item.qty -= 1;
    const text = target === user
      ? `${user.name} used ${article(item.name)} ${item.name}!`
      : `Used ${article(item.name)} ${item.name} on ${target.name}!`;
    endTurn(text, RECOVERY.item, tl => tl.add(() => {
      if (item.heal) {
        const healed = Math.min(item.heal, target.maxHp - target.hp);
        glow(target);
        popup(target, `+${healed}`, 'heal');
        setHp(target, target.hp + healed);
      } else if (item.id === 'revive') {
        if (!target.fainted) return;
        revive(target);
        popup(target, `+${target.hp}`, 'heal', 'Revived!');
      } else if (item.id === 'ether') {
        user.moves?.forEach(m => { m.ppLeft = Math.min(m.pp, m.ppLeft + 10); });
        glow(user);
        popup(user, 'PP +10', 'heal');
      } else if (item.id === 'x-attack') {
        user.atkStage = Math.min(6, user.atkStage + 2);
        glow(user);
        popup(user, 'Atk ↑↑', 'heal');
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
    title.textContent = `${t.label} → ${displayName(f)}  (HP ${f.hp}/${f.maxHp})`;
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
    gsap.fromTo(els.command, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.2, ease: 'power2.out' });
    focusItem(els.command);
  }

  function openSubmenu(menu) {
    if (menu === els.itemMenu) renderItems();
    setPaused(true);
    menu.classList.add('open');
    els.commandPanel.classList.add('expanded');
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
      ].join(' · ');
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
    for (const el of [els.units, els.partyRows, els.enemyRows]) {
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
    els.againBtn.addEventListener('click', () => location.reload());
    els.music.addEventListener('click', () => {
      Music.toggle();
      updateMusicButton();
    });
    updateMusicButton();
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
    Music.play(won ? 'victory' : 'defeat');
    gsap.delayedCall(1.5, () => showResult(won));
  }

  function showResult(won) {
    els.resultTitle.textContent = won ? 'Victory!' : 'Defeated…';
    els.resultText.textContent = won ? 'All the wild Pokémon fainted.' : 'Your whole team fainted.';
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
      .add(() => showMessage(`Wild ${names.slice(0, -1).join(', ')} and ${names.at(-1)} appeared!`), 1.2)
      .add(() => {
        battle.party.forEach((_, i) => fillPartyAtb(i, rand(0, 0.35)));
        battle.enemies.forEach((_, j) => fillEnemyAtb(j, rand(0, 0.2)));
      }, 1.8);
  }

  // ---------- Boot ----------

  async function init() {
    els.field.dataset.biome = pick(BIOMES);
    buildScenery();
    buildMotes();
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
    playIntro();
  }

  bindControls();

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => els.units.querySelectorAll('img').forEach(sizeSprite), 100);
  });

  init();
})();
