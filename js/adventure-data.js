// Adventure mode: one expedition across a branching route map, meant to be played in a single
// sitting. Your team's HP, fainted Pokémon, bag and evolutions carry over from stop to stop, wild
// Pokémon you beat can join you, and a legendary Pokémon waits at the end.
// Shared by adventure.html (the map) and battle.html (the battles along the way).
const Adventure = (() => {
  const RUN_KEY = 'adventureRun';
  const CLEARS_KEY = 'adventureClears';
  const ROWS = 8; // stops before the boss
  const LANES = 4;
  const PATHS = 4; // random walks that carve out the map

  // Same ids as the battle bag (battle.js ITEMS).
  const ITEMS = {
    potion: { name: 'Potion', text: 'Restores 20 HP to one Pokémon.' },
    'super-potion': { name: 'Super Potion', text: 'Restores 60 HP to one Pokémon.' },
    'full-heal': { name: 'Full Heal', text: 'Cures any status condition and confusion.' },
    revive: { name: 'Revive', text: 'Revives a fainted Pokémon with half its HP.' },
    ether: { name: 'Ether', text: "Restores 10 PP to each of the user's attacks." },
    'x-attack': { name: 'X Attack', text: "Sharply raises the user's Attack for the rest of the battle." },
  };
  const START_BAG = { potion: 3, 'super-potion': 1, 'full-heal': 1, revive: 1, ether: 1, 'x-attack': 1 };
  // Treasure draws: commoner items appear more often.
  const ITEM_WEIGHTS = { potion: 5, 'super-potion': 4, 'full-heal': 3, revive: 2, ether: 2, 'x-attack': 2 };
  // What a beaten trainer offers: pick one bundle.
  const BUNDLES = [
    { potion: 3 }, { 'super-potion': 2 }, { revive: 1 }, { 'full-heal': 2 }, { ether: 2 }, { 'x-attack': 2 },
    { potion: 1, revive: 1 }, { 'super-potion': 1, 'full-heal': 1 },
  ];

  // Stops on the map.
  const NODE_TYPES = {
    wild: { label: 'Wild Pokémon', icon: '🌿', text: 'Three wild Pokémon. Beat them and one may join you.' },
    trainer: { label: 'Trainer', icon: '⚔️', text: 'A tougher, faster fight. Win to pick a reward for your bag.' },
    event: { label: 'Something happens', icon: '❔', text: 'A chance encounter: a trade, a find, a hot spring…' },
    center: { label: 'Pokémon Center', icon: '✚', text: 'Rest to heal your team, or train one Pokémon to evolve.' },
    treasure: { label: 'Treasure', icon: '🎁', text: 'Free items for your bag.' },
    boss: { label: 'Legendary', icon: '👑', text: 'A legendary Pokémon and its guards. Win to finish the adventure.' },
  };
  const EVENTS = ['grove', 'joiner', 'camp', 'spring', 'stone'];

  // Legendary Pokémon that can guard the end of the route.
  const BOSSES = [
    144, 145, 146, 150, 243, 244, 245, 249, 250, 377, 378, 379, 380, 381, 382, 383, 384, 480, 481, 482, 483, 484,
    485, 487, 488, 638, 639, 640, 641, 642, 643, 644, 645, 646, 716, 717, 718, 785, 786, 787, 788, 791, 792, 888,
    889, 890, 1007, 1008,
  ];

  const rand = (min, max) => min + Math.random() * (max - min);
  const randInt = n => Math.floor(Math.random() * n);
  const pick = list => list[randInt(list.length)];
  const shuffle = list => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const weighted = weights => {
    let roll = Math.random() * Object.values(weights).reduce((a, b) => a + b, 0);
    for (const [key, w] of Object.entries(weights)) {
      roll -= w;
      if (roll < 0) return key;
    }
    return Object.keys(weights)[0];
  };

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }

  // ---------- The map ----------
  // A few random walks climb from the bottom row to the top, each step moving at most one lane
  // sideways and never crossing a path already drawn. Every node they touch becomes a stop.

  function generateMap() {
    const nodes = {};
    const edges = {};
    const add = (row, lane) => {
      const key = `${row}-${lane}`;
      nodes[key] ||= { key, row, lane, type: null, jitter: rand(-0.1, 0.1) };
      edges[key] ||= [];
      return key;
    };
    const crosses = (row, from, to) => Object.entries(edges).some(([key, next]) => {
      const [r, l] = key.split('-').map(Number);
      if (r !== row - 1) return false;
      return next.some(n => {
        const nl = Number(n.split('-')[1]);
        return (l < from && nl > to) || (l > from && nl < to);
      });
    });

    const starts = shuffle([...Array(LANES).keys()]);
    for (let p = 0; p < PATHS; p++) {
      let lane = p < 2 ? starts[p] : randInt(LANES);
      let prev = add(0, lane);
      for (let row = 1; row < ROWS; row++) {
        const options = [lane - 1, lane, lane + 1].filter(l => l >= 0 && l < LANES && !crosses(row, lane, l));
        lane = pick(options);
        const key = add(row, lane);
        if (!edges[prev].includes(key)) edges[prev].push(key);
        prev = key;
      }
      if (!edges[prev].includes('boss')) edges[prev].push('boss');
    }
    nodes.boss = { key: 'boss', row: ROWS, lane: (LANES - 1) / 2, type: 'boss', jitter: 0 };
    edges.boss = [];

    // First stops are wild battles, the middle row is always treasure and the last is a Pokémon
    // Center before the boss. Everything else is drawn at random; trainers and Centers come later.
    for (const node of Object.values(nodes)) {
      if (node.type) continue;
      if (node.row === 0) node.type = 'wild';
      else if (node.row === ROWS - 1) node.type = 'center';
      else if (node.row === Math.floor(ROWS / 2)) node.type = 'treasure';
      else {
        node.type = weighted({
          wild: 45,
          event: 26,
          trainer: node.row >= 2 ? 16 : 0,
          center: node.row >= 3 && node.row < ROWS - 2 ? 13 : 0,
        });
      }
    }
    return { nodes, edges };
  }

  // ---------- The run ----------
  // A run: team ([{ id, hp }], hp as a share of max HP, 0 = fainted), bag ({ itemId: qty }), the map,
  // at (the key of the stop you're on, null before the first), path (every stop visited), pending
  // (whatever the current stop still needs from you), wins (battles won), won and over.

  const getRun = () => read(RUN_KEY, null);
  const save = run => write(RUN_KEY, run);
  const clears = () => read(CLEARS_KEY, 0);

  function start(teamIds) {
    save({
      team: teamIds.map(id => ({ id, hp: 1 })),
      bag: { ...START_BAG },
      map: generateMap(),
      at: null,
      path: [],
      pending: null,
      wins: 0,
      won: false,
      over: false,
    });
  }

  const clear = () => {
    try { localStorage.removeItem(RUN_KEY); } catch { /* storage unavailable */ }
  };

  // Stops you can move to next.
  function reachable(run) {
    if (run.over || run.pending) return [];
    if (!run.at) return Object.values(run.map.nodes).filter(n => n.row === 0).map(n => n.key);
    return run.map.edges[run.at] || [];
  }

  const currentNode = run => (run?.at ? run.map.nodes[run.at] : null);
  const isBattle = type => type === 'wild' || type === 'trainer' || type === 'boss';

  // Moves onto a stop. Battles are left pending until battle.html reports back; anything random
  // about the other stops is rolled here and saved, so a refresh can't reroll it.
  async function enter(key) {
    const run = getRun();
    const node = run.map.nodes[key];
    run.at = key;
    run.path.push(key);
    if (isBattle(node.type)) {
      run.pending = { kind: 'battle', type: node.type };
    } else if (node.type === 'treasure') {
      run.pending = { kind: 'treasure', items: [weighted(ITEM_WEIGHTS), weighted(ITEM_WEIGHTS)] };
    } else if (node.type === 'center') {
      run.pending = { kind: 'center' };
    } else {
      const event = pick(EVENTS);
      run.pending = { kind: 'event', event };
      if (event === 'joiner') {
        const team = run.team.map(m => m.id);
        const [id] = await PokeAPI.pickByBst(1, PokeAPI.starRange(offerStars(node.row)), team);
        run.pending.offer = id || null;
      }
      if (event === 'camp') run.pending.items = [weighted(ITEM_WEIGHTS), weighted(ITEM_WEIGHTS)];
    }
    save(run);
    return run;
  }

  // ---------- Difficulty along the route ----------

  // Base-stat-total range for foes at a row: about 1–2★ at the start, 4–5★ just before the boss.
  function foeRange(row, type) {
    const lift = type === 'trainer' ? 45 : 0;
    return [250 + row * 40 + lift, 400 + row * 32 + lift];
  }
  // Foe gauges: wild ones start slow and speed up along the route; trainers are quicker.
  const atbScale = (row, type) => {
    if (type === 'boss') return 1.05;
    return Math.max(1.05, (type === 'trainer' ? 1.25 : 1.38) - row * 0.03);
  };
  // Star rating of Pokémon offered by events.
  const offerStars = row => Math.min(5, 2 + Math.floor(row / 2));

  // ---------- Results ----------

  // Called by battle.html when a battle ends. party: [{ id, hp }] after the fight (evolutions
  // included), bag: what's left, foes: the beaten Pokémon's ids (for recruiting).
  function finishBattle(won, party, bag, foes) {
    const run = getRun();
    if (!run || run.pending?.kind !== 'battle') return;
    run.team = party;
    run.bag = bag;
    const type = run.pending.type;
    if (won) run.wins = (run.wins || 0) + 1;
    if (!won) {
      run.over = true;
      run.pending = null;
    } else if (type === 'boss') {
      run.over = true;
      run.won = true;
      run.boss = foes[1];
      run.pending = null;
      write(CLEARS_KEY, clears() + 1);
    } else if (type === 'wild') {
      run.pending = { kind: 'recruit', options: foes };
    } else {
      run.pending = { kind: 'reward', options: shuffle(BUNDLES).slice(0, 3) };
    }
    save(run);
  }

  // Applies a finished stop's outcome and clears it. changes: any of team, bag.
  function resolve(changes = {}) {
    const run = getRun();
    Object.assign(run, changes);
    run.pending = null;
    if (run.team.every(m => m.hp <= 0)) run.over = true;
    save(run);
    return run;
  }

  function giveUp() {
    const run = getRun();
    if (!run) return;
    run.over = true;
    run.pending = null;
    save(run);
  }

  const addItems = (bag, items) => {
    const next = { ...bag };
    for (const [id, qty] of Object.entries(items)) next[id] = (next[id] || 0) + qty;
    return next;
  };

  return {
    ITEMS, NODE_TYPES, BOSSES, ROWS, LANES,
    getRun, start, clear, reachable, currentNode, isBattle, enter, foeRange, atbScale, offerStars,
    finishBattle, resolve, giveUp, addItems, clears,
  };
})();
