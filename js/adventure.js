(() => {
  const $ = sel => document.querySelector(sel);
  const els = {
    team: $('#team'), bag: $('#bag'), legend: $('#legend'), progress: $('#progress'), quit: $('#quitBtn'),
    mapWrap: $('#mapWrap'), map: $('#map'), paths: $('#paths'), nodes: $('#nodes'), token: $('#token'), hint: $('#hint'),
    dialog: $('#dialog'), card: $('#card'), kicker: $('#cardKicker'), title: $('#cardTitle'), body: $('#cardBody'),
    choices: $('#cardChoices'), toast: $('#toast'), flash: $('#flash'), music: $('#musicBtn'),
  };
  const ITEM_SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items';
  const { ROWS, LANES, NODE_TYPES, ITEMS } = Adventure;
  // Map layout (px): row spacing, and room above the boss and below the first row.
  const ROW_H = 92;
  const PAD_TOP = 64;
  const PAD_BOTTOM = 96;
  const MAP_H = PAD_TOP + ROWS * ROW_H + PAD_BOTTOM;

  let run = Adventure.getRun();
  const details = {}; // Pokémon details by id, once loaded
  let busy = false;

  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const typeBadge = t => `<span class="type" style="--type: var(--${t})">${t}</span>`;
  const bstOf = d => Object.values(d.stats).reduce((a, b) => a + b, 0);
  const pct = share => `${Math.round(share * 100)}%`;
  const itemImg = id => `<img src="${ITEM_SPRITES}/${ITEMS[id]?.sprite || id}.png" alt="">`;
  const load = async id => {
    details[id] ||= await PokeAPI.loadDetails(id);
    return details[id];
  };
  // Heals every Pokémon by `share` of its max HP; fainted ones come back with `revive` (0 leaves them down).
  const healTeam = (team, share, revive = 0) => team.map(m => ({ ...m, hp: m.hp <= 0 ? revive : Math.min(1, m.hp + share) }));
  const counts = ids => ids.reduce((bag, id) => ({ ...bag, [id]: (bag[id] || 0) + 1 }), {});
  const itemsText = bundle => Object.entries(bundle).map(([id, n]) => `${n > 1 ? `${n} ` : ''}${ITEMS[id].name}${n > 1 ? 's' : ''}`).join(' and ');

  function setSprite(img, id) {
    const sources = PokeAPI.spriteSources(id);
    let i = 0;
    img.onerror = () => {
      i += 1;
      if (i < sources.length) img.src = sources[i];
    };
    img.src = sources[0];
  }
  const fillSprites = root => root.querySelectorAll('img[data-id]').forEach(img => setSprite(img, Number(img.dataset.id)));

  function toast(message) {
    els.toast.textContent = message;
    gsap.killTweensOf(els.toast);
    gsap.timeline()
      .fromTo(els.toast, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25 })
      .to(els.toast, { y: 20, opacity: 0, duration: 0.3, delay: 3 });
  }

  // ---------- Side panel ----------

  // A Pokémon card: sprite, name, types and stars, and (when hp is given) an HP bar.
  function monCard(d, { hp, tag = '', disabled = false, index } = {}) {
    const down = hp != null && hp <= 0;
    const bar = hp == null ? '' : `
      <span class="av-hp${hp <= 0.2 ? ' low' : hp <= 0.5 ? ' mid' : ''}"><i style="--hp: ${Math.max(0, hp)}"></i></span>
      <span class="av-hp-text">${down ? 'Fainted' : `HP ${pct(hp)}`}</span>`;
    return `
      <button type="button" class="av-mon${down ? ' fainted' : ''}${index != null ? ' av-pick' : ''}" ${index != null ? `data-i="${index}"` : ''}
        ${disabled ? 'disabled' : ''} style="--t1: var(--${d.types[0]})">
        <span class="av-mon-stage"><img data-id="${d.id}" alt=""></span>
        <span class="av-mon-info">
          <span class="av-mon-name">${d.name}${tag ? ` <em>${tag}</em>` : ''}</span>
          <span class="av-mon-types">${d.types.map(typeBadge).join('')}${PokeAPI.starsHtml(bstOf(d))}</span>
          ${bar}
        </span>
      </button>`;
  }

  async function renderTeam() {
    const ids = run ? run.team.map(m => m.id) : [];
    const list = await Promise.all(ids.map(load));
    els.team.innerHTML = list.map((d, i) => monCard(d, { hp: run.team[i].hp })).join('') || '<p class="av-empty">No team yet.</p>';
    els.team.querySelectorAll('.av-mon').forEach(b => { b.tabIndex = -1; });
    fillSprites(els.team);
  }

  // Items marked for the map (healing, revives, Evolution Stones) can be used between stops.
  function renderBag() {
    const bag = run?.bag || {};
    const items = Object.entries(bag).filter(([id, n]) => n > 0 && ITEMS[id]);
    const usable = Boolean(run && !run.over && !run.pending);
    els.bag.innerHTML = items.length
      ? items.map(([id, n]) => {
        const title = `${ITEMS[id].name}: ${ITEMS[id].text}${ITEMS[id].map ? '' : ' (battle only)'}`;
        return ITEMS[id].map && usable
          ? `<button type="button" class="av-item use" data-item="${id}" title="${title} Click to use.">${itemImg(id)}<b>×${n}</b></button>`
          : `<span class="av-item" title="${title}">${itemImg(id)}<b>×${n}</b></span>`;
      }).join('')
      : '<p class="av-empty">Empty</p>';
  }

  function renderLegend() {
    els.legend.innerHTML = Object.entries(NODE_TYPES).map(([type, t]) => `
      <span class="av-key" title="${t.text}"><i class="av-node-icon ${type}">${t.icon}</i>${t.label}</span>`).join('');
  }

  function renderProgress() {
    const cleared = Adventure.clears();
    const where = run && !run.over ? `Stop ${run.path.length} of ${ROWS + 1} · ` : '';
    els.progress.textContent = `${where}${cleared ? `Adventures completed: ${cleared}` : 'No adventures completed yet'}`;
    els.quit.hidden = !run || run.over;
  }

  // ---------- The map ----------

  const nodePos = n => ({ x: ((n.lane + 0.5 + n.jitter) / LANES) * 100, y: PAD_TOP + (ROWS - n.row) * ROW_H });
  const startPos = () => ({ x: 50, y: MAP_H - 26 });

  function renderMap() {
    els.map.style.height = `${MAP_H}px`;
    if (!run) {
      els.paths.innerHTML = '';
      els.nodes.innerHTML = '';
      els.token.hidden = true;
      return;
    }
    const { nodes, edges } = run.map;
    const open = new Set(Adventure.reachable(run));
    const visited = new Set(run.path);
    const walked = new Set(run.path.slice(1).map((key, i) => `${run.path[i]}>${key}`));
    const here = run.at ? nodes[run.at].row : -1;

    els.paths.setAttribute('viewBox', `0 0 100 ${MAP_H}`);
    let lines = '';
    for (const [from, tos] of Object.entries(edges)) {
      const a = nodePos(nodes[from]);
      for (const to of tos) {
        const b = nodePos(nodes[to]);
        const cls = walked.has(`${from}>${to}`) ? 'walked' : from === run.at && open.has(to) ? 'open' : nodes[to].row <= here ? 'past' : '';
        lines += `<line class="${cls}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" vector-effect="non-scaling-stroke"/>`;
      }
    }
    // The way in: from the trailhead to each starting stop.
    if (!run.at) {
      const s = startPos();
      for (const n of Object.values(nodes).filter(n => n.row === 0)) {
        const b = nodePos(n);
        lines += `<line class="${open.has(n.key) ? 'open' : ''}" x1="${s.x}" y1="${s.y}" x2="${b.x}" y2="${b.y}" vector-effect="non-scaling-stroke"/>`;
      }
    }
    els.paths.innerHTML = lines;

    els.nodes.innerHTML = Object.values(nodes).map(n => {
      const { x, y } = nodePos(n);
      const t = NODE_TYPES[n.type];
      const state = n.key === run.at ? ' current' : open.has(n.key) ? ' open' : visited.has(n.key) ? ' visited' : n.row <= here ? ' past' : '';
      return `
        <button type="button" class="av-node ${n.type}${state}" data-key="${n.key}" style="left: ${x}%; top: ${y}px"
          ${open.has(n.key) ? '' : 'tabindex="-1"'} aria-label="${t.label}" title="${t.label}: ${t.text}">
          <i class="av-node-icon ${n.type}">${t.icon}</i>
        </button>`;
    }).join('');
    gsap.utils.toArray('.av-node.open').forEach((n, i) => gsap.fromTo(n, { scale: 1 }, { scale: 1.12, duration: 0.6, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: i * 0.15 }));
    placeToken();
  }

  // The lead Pokémon (the first one still standing) marks where you are.
  function placeToken() {
    const lead = run.team.find(m => m.hp > 0) || run.team[0];
    if (Number(els.token.dataset.id) !== lead.id) {
      els.token.dataset.id = lead.id;
      setSprite(els.token, lead.id);
    }
    els.token.hidden = false;
    const p = run.at ? nodePos(run.map.nodes[run.at]) : startPos();
    gsap.set(els.token, { left: `${p.x}%`, top: p.y });
  }

  function scrollToHere(smooth = true) {
    const p = run?.at ? nodePos(run.map.nodes[run.at]) : startPos();
    const top = Math.max(0, p.y - els.mapWrap.clientHeight * 0.65);
    els.mapWrap.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  }

  function paintHint() {
    if (!run || run.over || run.pending) {
      els.hint.textContent = '';
      return;
    }
    els.hint.textContent = run.at ? 'Choose your next stop' : 'Choose where to begin';
  }

  function renderAll() {
    renderTeam();
    renderBag();
    renderMap();
    renderProgress();
    paintHint();
  }

  // Hops the team marker along the path to a stop, then opens it.
  async function travel(key) {
    if (busy || !Adventure.reachable(run).includes(key)) return;
    busy = true;
    const p = nodePos(run.map.nodes[key]);
    const from = run.at ? nodePos(run.map.nodes[run.at]) : startPos();
    await gsap.timeline()
      .to(els.token, { left: `${(from.x + p.x) / 2}%`, top: Math.min(from.y, p.y) - 30, duration: 0.3, ease: 'power2.out' })
      .to(els.token, { left: `${p.x}%`, top: p.y, duration: 0.35, ease: 'bounce.out' });
    try {
      run = await Adventure.enter(key);
    } catch {
      busy = false;
      toast('Could not reach PokéAPI. Check your connection and try again.');
      placeToken();
      return;
    }
    renderMap();
    renderProgress();
    paintHint();
    scrollToHere();
    busy = false;
    openStop();
  }

  // ---------- The dialog ----------

  // picks: called with the index of a clicked .av-pick card in the body.
  function showDialog({ kicker = '', title, body = '', choices = [], picks = null }) {
    els.kicker.innerHTML = kicker;
    els.title.textContent = title;
    els.body.innerHTML = body;
    fillSprites(els.body);
    els.body.querySelectorAll('.av-pick').forEach(card => card.addEventListener('click', () => picks?.(Number(card.dataset.i))));
    els.choices.replaceChildren(...choices.map(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn${c.primary ? ' primary' : ''}${c.quiet ? ' av-quiet' : ''}`;
      b.textContent = c.label;
      b.disabled = Boolean(c.disabled);
      if (c.title) b.title = c.title;
      b.addEventListener('click', c.onClick);
      return b;
    }));
    if (els.dialog.hidden) {
      els.dialog.hidden = false;
      gsap.fromTo(els.dialog, { opacity: 0 }, { opacity: 1, duration: 0.25 });
      gsap.fromTo(els.card, { y: 30, scale: 0.96 }, { y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.6)' });
    } else {
      gsap.fromTo(els.card, { scale: 0.98 }, { scale: 1, duration: 0.25, ease: 'power2.out' });
    }
    const first = els.card.querySelector('.av-pick:not(:disabled), .av-choices .btn:not(:disabled)');
    first?.focus({ preventScroll: true });
  }

  function closeDialog() {
    els.dialog.hidden = true;
  }

  const kickerOf = type => `<i class="av-node-icon ${type}">${NODE_TYPES[type].icon}</i> ${NODE_TYPES[type].label}`;

  // Finishes the current stop with the given changes and goes back to the map.
  function finish(changes, message) {
    run = Adventure.resolve(changes);
    closeDialog();
    renderAll();
    if (message) toast(message);
    if (run.over) openStop();
  }

  function openStop() {
    if (!run) return startDialog();
    if (run.over) return overDialog();
    if (!run.intro && !run.path.length) return introDialog();
    const p = run.pending;
    if (!p) {
      closeDialog();
      return paintHint();
    }
    const node = Adventure.currentNode(run);
    if (p.kind === 'battle') return battleDialog(node);
    if (p.kind === 'recruit') return recruitDialog(p.options, p.drops);
    if (p.kind === 'reward') return rewardDialog(p.options);
    if (p.kind === 'treasure') return treasureDialog(p.items);
    if (p.kind === 'center') return centerDialog();
    return eventDialog(p);
  }

  // ---------- Start and end ----------

  // With no adventure saved, send you off to pick a team; team select starts the run.
  function startDialog() {
    showDialog({
      kicker: 'Adventure', title: 'Pick your team',
      body: '<p>An adventure starts with three 1★ Pokémon. Choose them on the team select screen, then set out.</p>',
      choices: [
        { label: 'Pick a 1★ team', primary: true, onClick: () => { location.href = 'team.html?mode=adventure'; } },
        { label: 'Menu', onClick: () => { location.href = 'index.html'; } },
      ],
    });
  }

  // Shown once, when a freshly started adventure is first opened.
  async function introDialog() {
    const team = await Promise.all(run.team.map(m => load(m.id)));
    showDialog({
      kicker: 'A new adventure', title: 'Set out on the route',
      body: `
        <p>Cross a branching route of ${ROWS} stops to reach a legendary Pokémon. Pick your path: wild Pokémon,
        trainers, Pokémon Centers, treasure and chance encounters.</p>
        <ul class="av-rules">
          <li>HP, fainted Pokémon, your bag and evolutions <b>carry over</b> between stops.</li>
          <li>Every win pays out: wild Pokémon <b>drop items</b> and one can <b>join your team</b>; trainers hand over prizes.</li>
          <li>An <b>Evolution Stone</b> evolves any Pokémon that has a next stage. Click items in your bag to use them between stops.</li>
          <li>If your whole team faints, the adventure is over.</li>
        </ul>
        <div class="av-picks">${team.map(d => monCard(d, { hp: 1 })).join('')}</div>`,
      choices: [
        { label: 'Set out!', primary: true, onClick: begin },
        { label: 'Change team', onClick: () => { location.href = 'team.html?mode=adventure'; } },
      ],
    });
    els.body.querySelectorAll('.av-mon').forEach(b => { b.disabled = true; });
  }

  function begin() {
    run = Adventure.resolve({ intro: true });
    closeDialog();
    renderAll();
    gsap.from('.av-node', { scale: 0, opacity: 0, duration: 0.35, stagger: 0.02, ease: 'back.out(2)' });
    scrollToHere(false);
    toast('Your adventure begins. Choose where to start!');
  }

  async function overDialog() {
    const battles = run.wins || 0;
    const team = await Promise.all(run.team.map(m => load(m.id)));
    const cards = `<div class="av-picks">${team.map((d, i) => monCard(d, { hp: run.team[i].hp })).join('')}</div>`;
    const again = [
      { label: 'New adventure', primary: true, onClick: () => { Adventure.clear(); location.href = 'team.html?mode=adventure'; } },
      { label: 'Menu', onClick: () => { location.href = 'index.html'; } },
    ];
    if (run.won) {
      const boss = run.boss ? (await load(run.boss)).name : 'The legendary';
      showDialog({
        kicker: '👑 Adventure complete', title: `${boss} defeated!`,
        body: `<p>Your team crossed the whole route and won ${plural(battles, 'battle')} along the way. This is the team that made it:</p>${cards}`,
        choices: again,
      });
      celebrate();
    } else {
      showDialog({
        kicker: 'Adventure over', title: run.team.every(m => m.hp <= 0) ? 'Your team fell' : 'You turned back',
        body: `<p>You made it ${plural(run.path.length, 'stop')} along the route and won ${plural(battles, 'battle')}.</p>${cards}`,
        choices: again,
      });
    }
    els.body.querySelectorAll('.av-mon').forEach(b => { b.disabled = true; });
  }

  function celebrate() {
    const box = els.card.getBoundingClientRect();
    const colors = ['#ffd23f', '#ff8a5c', '#b88bff', '#6bd96b', '#4fb8ff'];
    for (let i = 0; i < 60; i += 1) {
      const s = document.createElement('i');
      s.className = 'av-spark';
      s.style.setProperty('--c', pick(colors));
      s.style.left = `${box.left + box.width / 2}px`;
      s.style.top = `${box.top + 40}px`;
      document.body.appendChild(s);
      const a = rand(0, Math.PI * 2);
      const d = rand(80, 320);
      gsap.to(s, {
        x: Math.cos(a) * d, y: Math.sin(a) * d + 60, rotation: rand(-200, 200), scale: 0,
        duration: rand(1, 1.8), ease: 'power2.out', onComplete: () => s.remove(),
      });
    }
  }

  // ---------- Stops ----------

  function battleDialog(node) {
    const down = run.team.filter(m => m.hp <= 0).length;
    const titles = { wild: 'Wild Pokémon ahead!', trainer: 'A trainer blocks the path!', boss: 'The legendary awaits' };
    const warning = down ? `<p class="av-warn">${plural(down, 'Pokémon')} on your team ${down === 1 ? 'is' : 'are'} fainted and will sit this one out unless revived.</p>` : '';
    showDialog({
      kicker: kickerOf(node.type), title: titles[node.type],
      body: `<p>${NODE_TYPES[node.type].text}</p>${warning}`,
      choices: [{ label: node.type === 'boss' ? 'Face the legendary!' : 'Fight!', primary: true, onClick: fight }],
    });
  }

  function fight() {
    if (busy) return;
    busy = true;
    gsap.to(els.flash, { opacity: 1, duration: 0.35, ease: 'power2.in', onComplete: () => { location.href = 'battle.html?mode=adventure'; } });
  }

  // Lets you pick a team slot. filter(member, slot) says which can be picked.
  async function chooseSlot({ kicker, title, text, filter = () => true, onPick, back }) {
    const team = await Promise.all(run.team.map(m => load(m.id)));
    showDialog({
      kicker, title,
      body: `<p>${text}</p><div class="av-picks">${team.map((d, i) => monCard(d, { hp: run.team[i].hp, index: i, disabled: !filter(run.team[i], i) })).join('')}</div>`,
      picks: onPick,
      choices: [{ label: 'Back', onClick: back }],
    });
  }

  // A Pokémon joins at full health in the given slot.
  function swapIn(slot, id, message) {
    const team = run.team.map((m, i) => (i === slot ? { id, hp: 1 } : m));
    finish({ team }, message);
  }

  // drops: the items the beaten Pokémon left behind (already in the bag).
  async function recruitDialog(options, drops = []) {
    const foes = await Promise.all(options.map(load));
    const loot = drops.length ? `
      <p>They dropped ${itemsText(counts(drops))}, now in your bag.</p>
      <div class="av-loot small">${drops.map(id => `<span class="av-loot-item">${itemImg(id)}<b>${ITEMS[id].name}</b></span>`).join('')}</div>` : '';
    showDialog({
      kicker: kickerOf('wild'), title: 'A wild Pokémon wants to join!',
      body: `${loot}<p>Impressed by your team, one of the Pokémon you beat would like to come along. Pick one to recruit, or travel on as you are.</p>
        <div class="av-picks">${foes.map((d, i) => monCard(d, { index: i })).join('')}</div>`,
      picks: i => {
        const d = foes[i];
        chooseSlot({
          kicker: kickerOf('wild'), title: `Who makes room for ${d.name}?`,
          text: `${d.name} joins at full health. The Pokémon it replaces leaves your team.`,
          onPick: slot => swapIn(slot, d.id, `${d.name} joined your team in place of ${details[run.team[slot].id].name}!`),
          back: () => recruitDialog(options, drops),
        });
      },
      choices: [{ label: 'No thanks', onClick: () => finish({}) }],
    });
  }

  function rewardDialog(bundles) {
    showDialog({
      kicker: kickerOf('trainer'), title: 'Choose your reward',
      body: `<p>The trainer hands over a prize for a battle well fought. Take one:</p>
        <div class="av-picks rewards">${bundles.map((b, i) => `
          <button type="button" class="av-reward av-pick" data-i="${i}">
            <span class="av-reward-icons">${Object.keys(b).map(itemImg).join('')}</span>
            <b>${itemsText(b)}</b>
          </button>`).join('')}</div>`,
      picks: i => finish({ bag: Adventure.addItems(run.bag, bundles[i]) }, `Added ${itemsText(bundles[i])} to your bag.`),
    });
  }

  function treasureDialog(items) {
    const found = counts(items);
    showDialog({
      kicker: kickerOf('treasure'), title: 'You found treasure!',
      body: `<div class="av-loot">${items.map(id => `<span class="av-loot-item">${itemImg(id)}<b>${ITEMS[id].name}</b></span>`).join('')}</div>`,
      choices: [{ label: 'Take them', primary: true, onClick: () => finish({ bag: Adventure.addItems(run.bag, found) }, `Added ${itemsText(found)} to your bag.`) }],
    });
    gsap.from('.av-loot-item', { y: -40, opacity: 0, scale: 0.4, duration: 0.6, stagger: 0.15, ease: 'bounce.out' });
  }

  // Team slots whose Pokémon can still evolve (fainted ones can't train), with their next stages.
  async function evolvable() {
    const result = [];
    await Promise.all(run.team.map(async (m, slot) => {
      if (m.hp <= 0) return;
      try {
        const stages = await PokeAPI.loadNextStages(await load(m.id));
        if (stages.length) result.push({ slot, stages });
      } catch { /* treat as unable to evolve */ }
    }));
    return result.sort((a, b) => a.slot - b.slot);
  }

  async function centerDialog() {
    const kicker = kickerOf('center');
    showDialog({ kicker, title: 'Pokémon Center', body: '<p>Checking on your team…</p>' });
    const options = await evolvable();
    showDialog({
      kicker, title: 'Pokémon Center',
      body: `<p>Take a break here. You have time for one thing before moving on:</p>
        <ul class="av-rules">
          <li><b>Rest:</b> every Pokémon is fully healed, and fainted Pokémon are revived with half their HP.</li>
          <li><b>Train:</b> one Pokémon evolves into its next stage, keeping its share of HP.</li>
        </ul>`,
      choices: [
        { label: 'Rest', primary: true, onClick: () => finish({ team: healTeam(run.team, 1, 0.5) }, 'Your team is rested and ready.') },
        {
          label: 'Train', disabled: !options.length, title: options.length ? '' : 'No one on your team can evolve right now',
          onClick: () => chooseEvolver(options, kicker, 'Who trains?', centerDialog),
        },
      ],
    });
  }

  function chooseEvolver(options, kicker, title, back) {
    chooseSlot({
      kicker, title,
      text: 'Pick a Pokémon to evolve. It keeps its moves and its share of HP.',
      filter: (_, slot) => options.some(o => o.slot === slot),
      onPick: slot => evolveSlot(slot, pick(options.find(o => o.slot === slot).stages)),
      back,
    });
  }

  // The evolution cutscene, in miniature: the sprite turns to light, flickers between the two
  // forms faster and faster, and bursts into the new one.
  // changes: anything else to save with the evolution (the bag, when a stone was used).
  async function evolveSlot(slot, toId, changes = {}) {
    const from = await load(run.team[slot].id);
    const to = await load(toId);
    showDialog({
      kicker: '✦ Evolution', title: `What? ${from.name} is evolving!`,
      body: `<div class="av-evo"><span class="av-evo-glow"></span><img class="old" data-id="${from.id}" alt=""><img class="new" data-id="${to.id}" alt=""></div>`,
    });
    Music.play('evolve');
    const old = els.body.querySelector('.old');
    const next = els.body.querySelector('.new');
    const white = 'brightness(0) invert(1) drop-shadow(0 0 10px #ffffff)';
    const REVEAL = 3.65; // lines up with the fanfare
    gsap.set(next, { opacity: 0, filter: white });
    const tl = gsap.timeline()
      .to(old, { filter: white, duration: 0.6 }, 0.3)
      .to('.av-evo-glow', { opacity: 1, scale: 1.4, duration: REVEAL, ease: 'power1.in' }, 0);
    let showNew = true;
    for (let t = 1, gap = 0.42; t < REVEAL - 0.1; t += gap, gap = Math.max(0.05, gap * 0.8), showNew = !showNew) {
      tl.set(old, { opacity: showNew ? 0 : 1 }, t).set(next, { opacity: showNew ? 1 : 0 }, t);
    }
    tl.to(els.flash, { opacity: 0.9, duration: 0.08 }, REVEAL - 0.08)
      .set(old, { opacity: 0 }, REVEAL)
      .set(next, { opacity: 1 }, REVEAL)
      .to(els.flash, { opacity: 0, duration: 0.6 }, REVEAL)
      .to(next, { filter: 'brightness(1) invert(0) drop-shadow(0 0 0px #ffffff)', duration: 0.8 }, REVEAL + 0.1)
      .fromTo(next, { scale: 1.25 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.45)' }, REVEAL + 0.1)
      .to('.av-evo-glow', { opacity: 0.3, scale: 1, duration: 0.8 }, REVEAL);
    await tl;
    els.title.textContent = `${from.name} evolved into ${to.name}!`;
    const team = run.team.map((m, i) => (i === slot ? { ...m, id: to.id } : m));
    els.choices.replaceChildren();
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'btn primary';
    done.textContent = 'Continue';
    done.addEventListener('click', () => {
      Music.play('menu');
      finish({ ...changes, team });
    });
    els.choices.append(done);
    done.focus();
  }

  // Chance encounters. Anything random was rolled when you arrived (see Adventure.enter).
  async function eventDialog(p) {
    const kicker = kickerOf('event');
    if (p.event === 'grove') {
      showDialog({
        kicker, title: 'A berry grove',
        body: '<p>Branches heavy with ripe berries hang over the path.</p>',
        choices: [
          { label: 'Share the berries', primary: true, onClick: () => finish({ team: healTeam(run.team, 0.4) }, 'Everyone still standing recovered 40% HP.') },
          {
            label: 'Save a Sitrus Berry for one',
            onClick: () => chooseSlot({
              kicker, title: 'Who gets the Sitrus Berry?', text: 'It restores one Pokémon to full health. It can\'t revive a fainted one.',
              filter: m => m.hp > 0 && m.hp < 1,
              onPick: slot => finish({ team: run.team.map((m, i) => (i === slot ? { ...m, hp: 1 } : m)) }, `${details[run.team[slot].id].name} is back to full health!`),
              back: () => eventDialog(p),
            }),
          },
        ],
      });
    } else if (p.event === 'joiner') {
      if (!p.offer) {
        showDialog({ kicker, title: 'A rustle in the grass', body: '<p>Something moved in the tall grass, but it was gone before you got close.</p>', choices: [{ label: 'Move on', primary: true, onClick: () => finish({}) }] });
        return;
      }
      const d = await load(p.offer);
      showDialog({
        kicker, title: `A wild ${d.name} is following you`,
        body: `<p>It has trailed your team for a while now. It seems to want to come along.</p><div class="av-picks">${monCard(d)}</div>`,
        choices: [
          {
            label: 'Welcome it', primary: true,
            onClick: () => chooseSlot({
              kicker, title: `Who makes room for ${d.name}?`, text: `${d.name} joins at full health. The Pokémon it replaces leaves your team.`,
              onPick: slot => swapIn(slot, d.id, `${d.name} joined your team in place of ${details[run.team[slot].id].name}!`),
              back: () => eventDialog(p),
            }),
          },
          { label: 'Leave it', onClick: () => finish({}) },
        ],
      });
      els.body.querySelector('.av-mon').disabled = true;
    } else if (p.event === 'camp') {
      const [first, second] = p.items;
      showDialog({
        kicker, title: 'An abandoned camp',
        body: `<p>Someone left in a hurry. There's a ${ITEMS[first].name} by the fire, and more in the tents, but something is growling in there.</p>`,
        choices: [
          { label: `Take the ${ITEMS[first].name}`, primary: true, onClick: () => finish({ bag: Adventure.addItems(run.bag, { [first]: 1 }) }, `Added a ${ITEMS[first].name} to your bag.`) },
          {
            label: 'Search the tents too',
            onClick: () => {
              const standing = run.team.map((m, i) => i).filter(i => run.team[i].hp > 0);
              const hurt = pick(standing);
              const team = run.team.map((m, i) => (i === hurt ? { ...m, hp: Math.max(0.05, m.hp - 0.2) } : m));
              finish({ team, bag: Adventure.addItems(run.bag, counts([first, second])) },
                `You found ${itemsText(counts([first, second]))}, but a wild Pokémon bit ${details[run.team[hurt].id].name} (−20% HP)!`);
            },
          },
        ],
      });
    } else if (p.event === 'spring') {
      showDialog({
        kicker, title: 'A hot spring',
        body: '<p>Steam drifts from a warm pool among the rocks. Your team looks tired.</p>',
        choices: [{ label: 'Take a soak', primary: true, onClick: () => finish({ team: healTeam(run.team, 0.4, 0.4) }, 'Everyone recovered 40% HP. Fainted Pokémon woke up!') }],
      });
    } else {
      showDialog({
        kicker, title: 'A glinting stone',
        body: `<p>An Evolution Stone lies half-buried in the grass. It hums when your Pokémon come near: it works on any of them that can still evolve.</p>
          <div class="av-loot"><span class="av-loot-item">${itemImg('evo-stone')}<b>${ITEMS['evo-stone'].name}</b></span></div>`,
        choices: [{ label: 'Pick it up', primary: true, onClick: () => finish({ bag: Adventure.addItems(run.bag, { 'evo-stone': 1 }) }, 'Added an Evolution Stone to your bag.') }],
      });
    }
  }

  // ---------- Using items on the map ----------

  // Max HP at level 50, to turn a Potion's flat HP into a share of the bar.
  const maxHpOf = d => Combat.createFighter(d, 'party', 0).maxHp;
  const POTIONS = { potion: 20, 'super-potion': 60 };

  async function useItem(id) {
    if (busy || !run || run.over || run.pending || !(run.bag[id] > 0) || !ITEMS[id]?.map) return;
    const item = ITEMS[id];
    const kicker = `${itemImg(id)} ${item.name}`;
    const spend = () => Adventure.addItems(run.bag, { [id]: -1 });
    if (id === 'evo-stone') {
      showDialog({ kicker, title: item.name, body: '<p>Checking on your team…</p>' });
      const options = await evolvable();
      if (!options.length) {
        showDialog({
          kicker, title: item.name, body: '<p>None of your Pokémon can evolve any further right now. Save the stone for later.</p>',
          choices: [{ label: 'Back', primary: true, onClick: closeDialog }],
        });
        return;
      }
      chooseSlot({
        kicker, title: 'Who touches the stone?',
        text: 'Pick a Pokémon to evolve. It keeps its moves and its share of HP.',
        filter: (_, slot) => options.some(o => o.slot === slot),
        onPick: slot => evolveSlot(slot, pick(options.find(o => o.slot === slot).stages), { bag: spend() }),
        back: closeDialog,
      });
      return;
    }
    const reviving = id === 'revive' || id === 'max-revive';
    const team = await Promise.all(run.team.map(m => load(m.id)));
    chooseSlot({
      kicker, title: `Use the ${item.name} on…`, text: item.text,
      filter: m => (reviving ? m.hp <= 0 : m.hp > 0 && m.hp < 1),
      onPick: slot => {
        const m = run.team[slot];
        const hp = reviving ? (id === 'max-revive' ? 1 : 0.5)
          : POTIONS[id] ? Math.min(1, m.hp + POTIONS[id] / maxHpOf(team[slot])) : 1;
        const name = team[slot].name;
        finish({ team: run.team.map((x, i) => (i === slot ? { ...x, hp } : x)), bag: spend() },
          reviving ? `${name} was revived with ${pct(hp)} HP!` : `${name} recovered to ${pct(hp)} HP.`);
      },
      back: closeDialog,
    });
  }

  // ---------- Controls ----------

  function updateMusicButton() {
    const on = Music.isEnabled();
    els.music.setAttribute('aria-pressed', String(on));
    els.music.textContent = on ? '♫ Music on' : '♫ Music off';
  }

  // Giving up takes a second click.
  let quitArmed = null;
  function quit() {
    if (!quitArmed) {
      els.quit.textContent = 'Click again to give up';
      els.quit.classList.add('armed');
      quitArmed = setTimeout(() => {
        quitArmed = null;
        els.quit.textContent = 'Give up adventure';
        els.quit.classList.remove('armed');
      }, 3000);
      return;
    }
    clearTimeout(quitArmed);
    quitArmed = null;
    Adventure.giveUp();
    run = Adventure.getRun();
    renderAll();
    openStop();
  }

  // Controller: the D-pad steps through whatever can be pressed right now; A presses it.
  function padTargets() {
    if (!els.dialog.hidden) return [...els.card.querySelectorAll('.av-pick:not(:disabled), .av-choices .btn:not(:disabled)')];
    return [...els.nodes.querySelectorAll('.av-node.open'), ...(els.quit.hidden ? [] : [els.quit])];
  }

  function bind() {
    els.nodes.addEventListener('click', e => {
      const node = e.target.closest('.av-node.open');
      if (node) travel(node.dataset.key);
    });
    els.quit.addEventListener('click', quit);
    els.bag.addEventListener('click', e => {
      const item = e.target.closest('.av-item.use');
      if (item && els.dialog.hidden) useItem(item.dataset.item);
    });
    els.music.addEventListener('click', () => {
      Music.toggle();
      updateMusicButton();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && els.dialog.hidden) location.href = 'index.html';
    });
    Gamepad.on(action => {
      if (action === 'select') {
        els.music.click();
        return;
      }
      if (action === 'back') {
        if (els.dialog.hidden && !busy) location.href = 'index.html';
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
    renderLegend();
    bind();
    updateMusicButton();
    Music.play('menu');
    renderAll();
    scrollToHere(false);
    gsap.fromTo(els.flash, { opacity: 1 }, { opacity: 0, duration: 0.5 });
    if (run) gsap.from('.av-node', { scale: 0, opacity: 0, duration: 0.35, stagger: 0.015, ease: 'back.out(2)' });
    try {
      await openStop();
    } catch {
      toast('Could not reach PokéAPI. Check your connection and refresh.');
    }
  }

  init();
})();
