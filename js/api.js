// Thin wrapper around PokéAPI (https://pokeapi.co) with caching.
const PokeAPI = (() => {
  const BASE = 'https://pokeapi.co/api/v2';
  const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
  const MAX_ID = 1025;
  const INDEX_CACHE_KEY = 'pokeapi-index-v1';

  const TYPES = [
    'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
    'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
  ];

  const GENERATIONS = [
    { label: 'I', start: 1, end: 151 },
    { label: 'II', start: 152, end: 251 },
    { label: 'III', start: 252, end: 386 },
    { label: 'IV', start: 387, end: 493 },
    { label: 'V', start: 494, end: 649 },
    { label: 'VI', start: 650, end: 721 },
    { label: 'VII', start: 722, end: 809 },
    { label: 'VIII', start: 810, end: 905 },
    { label: 'IX', start: 906, end: 1025 },
  ];

  const NAME_FIXES = {
    'nidoran-f': 'Nidoran♀', 'nidoran-m': 'Nidoran♂', 'mr-mime': 'Mr. Mime', 'mime-jr': 'Mime Jr.',
    'mr-rime': 'Mr. Rime', farfetchd: "Farfetch'd", sirfetchd: "Sirfetch'd", 'type-null': 'Type: Null',
    'ho-oh': 'Ho-Oh', 'porygon-z': 'Porygon-Z', 'jangmo-o': 'Jangmo-o', 'hakamo-o': 'Hakamo-o',
    'kommo-o': 'Kommo-o', flabebe: 'Flabébé',
  };

  const BST_CACHE_KEY = 'pokeapi-bst-v1';
  const detailCache = new Map();
  const moveCache = new Map();

  const idFromUrl = url => Number(url.split('/').filter(Boolean).pop());
  const capitalize = w => w.charAt(0).toUpperCase() + w.slice(1);
  const prettyName = name => NAME_FIXES[name] || name.split('-').map(capitalize).join(' ');

  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }

  function readCache(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function writeCache(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  }

  // Base stat totals, kept across visits so team costs show up instantly next time.
  const bstCache = readCache(BST_CACHE_KEY) || {};
  let bstSaveTimer;
  function rememberBst(id, stats) {
    bstCache[id] = Object.values(stats).reduce((sum, v) => sum + v, 0);
    clearTimeout(bstSaveTimer);
    bstSaveTimer = setTimeout(() => writeCache(BST_CACHE_KEY, bstCache), 500);
  }
  const cachedBst = id => bstCache[id];
  // Star rating from the base stat total: under 350 is 1★ (Caterpie, Pichu), 600+ is 5★
  // (pseudo-legendaries and most legendaries).
  const STAR_STEPS = [350, 450, 525, 600];
  const starsOf = bst => 1 + STAR_STEPS.filter(min => bst >= min).length;
  // The base stat total range [min, max] of an n-star Pokémon.
  const starRange = n => [n <= 1 ? 0 : STAR_STEPS[n - 2], n >= 5 ? Infinity : STAR_STEPS[n - 1] - 1];

  // Up to count random Pokémon IDs whose base stat total falls in [min, max]. Totals cached from
  // earlier visits are used first; the rest are looked up a batch at a time (at most 240 lookups).
  async function pickByBst(count, [min, max], exclude = []) {
    const ids = Array.from({ length: MAX_ID }, (_, i) => i + 1).filter(id => !exclude.includes(id));
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const inRange = id => bstCache[id] != null && bstCache[id] >= min && bstCache[id] <= max;
    const picks = ids.filter(inRange).slice(0, count);
    for (let i = 0; picks.length < count && i < ids.length && i < 240; i += 12) {
      const batch = ids.slice(i, i + 12).filter(id => bstCache[id] == null);
      await Promise.allSettled(batch.map(loadBst));
      batch.forEach(id => picks.length < count && inRange(id) && picks.push(id));
    }
    return picks;
  }
  // Gold stars for the rating with the rest dimmed, out of 5.
  const starsHtml = bst => {
    const n = starsOf(bst);
    return `<span class="stars" title="${n} of 5 stars (base stat total ${bst})">${'★'.repeat(n)}<span class="stars-dim">${'★'.repeat(5 - n)}</span></span>`;
  };
  async function loadBst(id) {
    if (bstCache[id] == null) await loadDetails(id);
    return bstCache[id];
  }

  // Animated Gen V pixel sprites are the "classic" look; later Pokémon fall back to
  // Showdown animations, and finally to the static front sprite.
  function spriteSources(id) {
    const bw = `${SPRITES}/versions/generation-v/black-white/animated/${id}.gif`;
    const showdown = `${SPRITES}/other/showdown/${id}.gif`;
    const still = `${SPRITES}/${id}.png`;
    return id <= 649 ? [bw, showdown, still] : [showdown, still];
  }

  // Names come from the species list, types from the 18 type endpoints,
  // so the whole grid needs 19 requests instead of one per Pokémon.
  async function loadIndex() {
    const cached = readCache(INDEX_CACHE_KEY);
    if (Array.isArray(cached) && cached.length) return cached;

    const [species, ...typeLists] = await Promise.all([
      getJSON(`${BASE}/pokemon-species?limit=${MAX_ID}`),
      ...TYPES.map(t => getJSON(`${BASE}/type/${t}`)),
    ]);

    const typesById = {};
    for (const type of typeLists) {
      for (const { pokemon, slot } of type.pokemon) {
        const id = idFromUrl(pokemon.url);
        if (id > MAX_ID) continue;
        (typesById[id] ||= [])[slot - 1] = type.name;
      }
    }

    const index = species.results
      .map(s => {
        const id = idFromUrl(s.url);
        return { id, name: s.name, displayName: prettyName(s.name), types: (typesById[id] || ['normal']).filter(Boolean) };
      })
      .filter(p => p.id <= MAX_ID)
      .sort((a, b) => a.id - b.id);

    writeCache(INDEX_CACHE_KEY, index);
    return index;
  }

  const cleanText = text => (text || '').replace(/[\f\n\r­]+/g, ' ');

  // Level-up learnset from the game with the fullest list (newest wins ties). Version group
  // ids aren't chronological — the Japanese Gen 1 releases have the highest ids.
  function levelUpMoves(moves) {
    const isLevelUp = d => d.move_learn_method.name === 'level-up';
    const counts = new Map();
    for (const m of moves) {
      for (const d of m.version_group_details) {
        if (!isLevelUp(d)) continue;
        const id = idFromUrl(d.version_group.url);
        counts.set(id, (counts.get(id) || 0) + 1);
      }
    }
    let best = 0;
    for (const [id, count] of counts) {
      if (count > (counts.get(best) || 0) || (count === counts.get(best) && id > best)) best = id;
    }
    const list = [];
    for (const m of moves) {
      const d = m.version_group_details.find(v => isLevelUp(v) && idFromUrl(v.version_group.url) === best);
      if (d) list.push({ name: m.move.name, level: d.level_learned_at });
    }
    return list.sort((a, b) => a.level - b.level);
  }

  function loadMove(name) {
    if (!moveCache.has(name)) {
      const request = getJSON(`${BASE}/move/${name}`)
        .then(m => ({
          id: m.name,
          name: m.names.find(n => n.language.name === 'en')?.name || prettyName(m.name),
          type: m.type.name,
          category: m.damage_class.name,
          power: m.power,
          accuracy: m.accuracy,
          pp: m.pp,
          effect: cleanText(m.flavor_text_entries.findLast(e => e.language.name === 'en')?.flavor_text),
          // Who it affects and what it does besides damage (status, stat changes, healing, drain/recoil).
          target: m.target.name,
          ailment: m.meta?.ailment?.name || 'none',
          ailmentChance: m.meta?.ailment_chance || 0,
          statChanges: m.stat_changes.map(s => ({ stat: s.stat.name, change: s.change })),
          statChance: m.meta?.stat_chance || 0,
          effectCategory: m.meta?.category?.name || '',
          healing: m.meta?.healing || 0,
          drain: m.meta?.drain || 0,
        }))
        .catch(err => {
          moveCache.delete(name);
          throw err;
        });
      moveCache.set(name, request);
    }
    return moveCache.get(name);
  }

  function loadDetails(id) {
    if (!detailCache.has(id)) {
      const request = Promise.all([getJSON(`${BASE}/pokemon/${id}`), getJSON(`${BASE}/pokemon-species/${id}`)])
        .then(([p, s]) => ({
          id,
          name: s.names.find(n => n.language.name === 'en')?.name || prettyName(p.name),
          types: [...p.types].sort((a, b) => a.slot - b.slot).map(t => t.type.name),
          stats: Object.fromEntries(p.stats.map(st => [st.stat.name, st.base_stat])),
          abilities: p.abilities.map(a => ({ name: prettyName(a.ability.name), hidden: a.is_hidden })),
          height: p.height / 10,
          weight: p.weight / 10,
          genus: s.genera.find(g => g.language.name === 'en')?.genus || '',
          flavor: cleanText(s.flavor_text_entries.find(e => e.language.name === 'en')?.flavor_text),
          cry: p.cries?.latest || p.cries?.legacy || null,
          moves: levelUpMoves(p.moves),
          chain: s.evolution_chain?.url || null,
        }))
        .then(details => {
          rememberBst(id, details.stats);
          return details;
        })
        .catch(err => {
          detailCache.delete(id);
          throw err;
        });
      detailCache.set(id, request);
    }
    return detailCache.get(id);
  }

  // Species IDs this Pokémon evolves into next: none for a final stage, several for branching lines like Eevee's.
  async function loadNextStages(details) {
    if (!details.chain) return [];
    const { chain } = await getJSON(details.chain);
    const find = node => (idFromUrl(node.species.url) === details.id ? node : node.evolves_to.map(find).find(Boolean));
    const node = find(chain);
    return (node?.evolves_to || []).map(n => idFromUrl(n.species.url)).filter(id => id <= MAX_ID);
  }

  return {
    TYPES, GENERATIONS, loadIndex, loadDetails, loadMove, loadBst, cachedBst, starsOf, starRange, starsHtml, pickByBst,
    loadNextStages,
    spriteSources, prettyName,
  };
})();
