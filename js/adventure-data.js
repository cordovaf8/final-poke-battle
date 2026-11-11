// Adventure mode: one expedition across a branching route map, meant to be played in a single
// sitting. Your team's HP, fainted Pokémon, bag and evolutions carry over from stop to stop, wild
// Pokémon you beat can join you, and a legendary Pokémon waits at the end. You set out with three
// 1★ Pokémon, and they only evolve with Evolution Stones; every win pays out money and items, which
// buy more (stones included) from the shop between stops, or for less at a Poké Mart sale.
// Shared by team.html (picking the team), adventure.html (the map) and battle.html (the battles).
const Adventure = (() => {
  const RUN_KEY = 'adventureRun';
  const CLEARS_KEY = 'adventureClears';
  const ROWS = 8; // stops before the boss
  const LANES = 4;
  const PATHS = 4; // random walks that carve out the map

  // Same ids as the battle bag (battle.js ITEMS). sprite: the PokéAPI item sprite, when it isn't the id.
  // map: can also be used from the bag on the route map, between stops. price: in a Poké Mart (₽).
  const ITEMS = {
    potion: { name: 'Potion', map: true, price: 100, text: 'Restores 20 HP to one Pokémon.' },
    'super-potion': { name: 'Super Potion', map: true, price: 250, text: 'Restores 60 HP to one Pokémon.' },
    'full-restore': { name: 'Full Restore', map: true, price: 900, text: 'Restores all HP and cures any status condition.' },
    'full-heal': { name: 'Full Heal', price: 150, text: 'Cures any status condition and confusion.' },
    revive: { name: 'Revive', map: true, price: 500, text: 'Revives a fainted Pokémon with half its HP.' },
    'max-revive': { name: 'Max Revive', map: true, price: 1200, text: 'Revives a fainted Pokémon with all its HP.' },
    'evo-stone': {
      name: 'Evolution Stone', sprite: 'shiny-stone', map: true, price: 800,
      text: 'The only way to evolve on an Adventure. Works on any Pokémon with a next stage, on the map or in battle.',
    },
    ether: { name: 'Ether', price: 300, text: "Restores 10 PP to each of the user's attacks." },
    'x-attack': { name: 'X Attack', price: 250, text: "Sharply raises the user's Attack for the rest of the battle." },
  };
  const START_MONEY = 500;
  // Poké Mart stops knock this much off every price.
  const SALE = 0.3;
  const priceOf = (id, sale = false) => Math.round((ITEMS[id].price * (sale ? 1 - SALE : 1)) / 10) * 10;
  const START_BAG = { potion: 3, 'super-potion': 2, 'full-heal': 1, revive: 1, ether: 1, 'x-attack': 1, 'evo-stone': 1 };
  // Random finds: commoner items turn up more often.
  const ITEM_WEIGHTS = {
    potion: 4, 'super-potion': 5, 'full-restore': 2, 'full-heal': 2, revive: 3, 'max-revive': 1, 'evo-stone': 2, ether: 2, 'x-attack': 2,
  };
  // The best finds, one of which every treasure chest holds.
  const RARE = ['full-restore', 'max-revive', 'evo-stone'];
  // What a beaten trainer offers: pick one of three bundles, one of which always holds a stone.
  const STONE_BUNDLES = [{ 'evo-stone': 1, 'super-potion': 2 }, { 'evo-stone': 1, revive: 1 }, { 'evo-stone': 2 }];
  const BUNDLES = [
    { 'full-restore': 2 }, { 'max-revive': 1, potion: 2 }, { 'super-potion': 3 }, { revive: 2, 'full-heal': 1 },
    { 'full-restore': 1, revive: 1 }, { ether: 2, 'x-attack': 2 }, { 'super-potion': 2, 'full-heal': 2 },
  ];

  // Stops on the map.
  const NODE_TYPES = {
    wild: { label: 'Wild Pokémon', icon: '🌿', text: 'Three wild Pokémon. Beat them for the items they drop, and one may join you.' },
    trainer: { label: 'Trainer', icon: '⚔️', text: 'A tougher, faster fight. Win to pick a reward: Evolution Stones, Full Restores and more.' },
    event: { label: 'Something happens', icon: '❔', text: 'A chance encounter: a trade, a find, a hot spring…' },
    center: { label: 'Pokémon Center', icon: '✚', text: 'Rest to fully heal your team, and shop at the Poké Mart counter.' },
    shop: { label: 'Poké Mart', icon: '🛒', text: 'A sale: everything in the shop is 30% off, Evolution Stones included.' },
    treasure: { label: 'Treasure', icon: '🎁', text: 'Three free items for your bag, one of them rare.' },
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
          center: node.row >= 3 && node.row < ROWS - 2 ? 11 : 0,
          shop: node.row >= 2 ? 11 : 0,
        });
      }
    }
    return { nodes, edges };
  }

  // ---------- The run ----------
  // A run: team ([{ id, hp }], hp as a share of max HP, 0 = fainted), bag ({ itemId: qty }), the map,
  // at (the key of the stop you're on, null before the first), path (every stop visited), pending
  // (whatever the current stop still needs from you), wins (battles won), won and over.

  // Adventures saved before money existed start with the usual purse.
  const getRun = () => {
    const run = read(RUN_KEY, null);
    if (run && run.money == null) run.money = START_MONEY;
    return run;
  };
  const save = run => write(RUN_KEY, run);
  const clears = () => read(CLEARS_KEY, 0);

  function start(teamIds) {
    save({
      team: teamIds.map(id => ({ id, hp: 1 })),
      bag: { ...START_BAG },
      money: START_MONEY,
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
      run.pending = { kind: 'treasure', items: [weighted(ITEM_WEIGHTS), weighted(ITEM_WEIGHTS), pick(RARE)], money: 150 + node.row * 25 };
    } else if (node.type === 'center') {
      run.pending = { kind: 'center' };
    } else if (node.type === 'shop') {
      run.pending = { kind: 'shop' };
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

  // Prize money for a win at a row (₽).
  const prize = (row, type) => (type === 'trainer' ? 350 + row * 60 : 200 + row * 35);

  // Base-stat-total range for foes at a row: 1★ like your starting team at first, 3–4★ just before
  // the boss, by which time your team should have evolved.
  function foeRange(row, type) {
    const lift = type === 'trainer' ? 40 : 0;
    return [220 + row * 42 + lift, 340 + row * 36 + lift];
  }
  // Foe gauges: wild ones start slow and speed up along the route; trainers are quicker.
  const atbScale = (row, type) => {
    if (type === 'boss') return 1.08;
    return Math.max(1.08, (type === 'trainer' ? 1.28 : 1.42) - row * 0.03);
  };
  // Star rating of Pokémon offered by events.
  const offerStars = row => Math.min(5, 2 + Math.floor(row / 2));

  // ---------- Results ----------

  // Called by battle.html when a battle ends. party: [{ id, hp }] after the fight (evolutions
  // included), bag: what's left, foes: the beaten Pokémon's ids (for recruiting).
  // Beaten wild Pokémon drop an item or two, which go straight into the bag.
  function finishBattle(won, party, bag, foes) {
    const run = getRun();
    if (!run || run.pending?.kind !== 'battle') return;
    run.team = party;
    run.bag = bag;
    const { type } = run.pending;
    const row = run.map.nodes[run.at].row;
    if (won) run.wins = (run.wins || 0) + 1;
    if (won && type !== 'boss') run.money = (run.money || 0) + prize(row, type);
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
      const drops = Math.random() < 0.5 ? [weighted(ITEM_WEIGHTS), weighted(ITEM_WEIGHTS)] : [weighted(ITEM_WEIGHTS)];
      run.bag = addItems(run.bag, Object.fromEntries(drops.map(id => [id, drops.filter(d => d === id).length])));
      run.pending = { kind: 'recruit', options: foes, drops, money: prize(row, type) };
    } else {
      run.pending = { kind: 'reward', options: shuffle([pick(STONE_BUNDLES), ...shuffle(BUNDLES).slice(0, 2)]), money: prize(row, type) };
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

  // Buys one of an item (at the sale price on a Poké Mart stop), if you can afford it. Doesn't touch
  // whatever the stop still needs.
  function buy(id, sale = false) {
    const run = getRun();
    if (!ITEMS[id]?.price) return run;
    const price = priceOf(id, sale);
    if (run.money < price) return run;
    run.money -= price;
    run.bag = addItems(run.bag, { [id]: 1 });
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
    getRun, start, clear, reachable, currentNode, isBattle, enter, foeRange, atbScale, offerStars, prize, priceOf,
    finishBattle, resolve, buy, giveUp, addItems, clears,
  };
})();
