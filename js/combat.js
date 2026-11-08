// Battle math: level-50 stats, type matchups and the main-series damage formula.
const Combat = (() => {
  const LEVEL = 50;
  const SHEDINJA = 292;
  // Defend grants this many guarded hits, each reduced by a random 25–50%.
  const GUARD_CHARGES = 2;
  const GUARD_MIN = 0.25;
  const GUARD_MAX = 0.5;

  // Attacking type -> defending type -> multiplier (only entries that aren't 1x).
  const TYPE_CHART = {
    normal: { rock: 0.5, ghost: 0, steel: 0.5 },
    fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
    water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
    electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
    grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
    ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
    fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
    poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
    ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
    flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
    bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
    rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
    ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
    dragon: { dragon: 2, steel: 0.5, fairy: 0 },
    dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
    steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
    fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
  };

  // Perfect IVs, no EVs, neutral nature.
  const hpStat = base => Math.floor(((2 * base + 31) * LEVEL) / 100) + LEVEL + 10;
  const otherStat = base => Math.floor(((2 * base + 31) * LEVEL) / 100) + 5;
  const stageMultiplier = stage => (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage));

  function createFighter(details, side, index) {
    const stats = {};
    for (const [key, base] of Object.entries(details.stats)) {
      stats[key] = key === 'hp' ? hpStat(base) : otherStat(base);
    }
    if (details.id === SHEDINJA) stats.hp = 1;
    return {
      side, index,
      id: details.id,
      name: details.name,
      types: details.types,
      base: details.stats,
      stats,
      learnset: details.moves,
      moves: null,
      maxHp: stats.hp,
      hp: stats.hp,
      fainted: false,
      guards: 0,
      atkStage: 0,
    };
  }

  function typeMultiplier(moveType, defenderTypes) {
    return defenderTypes.reduce((m, t) => m * (TYPE_CHART[moveType]?.[t] ?? 1), 1);
  }

  function calcDamage(attacker, defender, move) {
    if (move.accuracy != null && Math.random() * 100 >= move.accuracy) return { missed: true };
    const multiplier = typeMultiplier(move.type, defender.types);
    if (multiplier === 0) return { damage: 0, multiplier };

    const physical = move.category === 'physical';
    const attack = physical ? attacker.stats.attack * stageMultiplier(attacker.atkStage) : attacker.stats['special-attack'];
    const defense = physical ? defender.stats.defense : defender.stats['special-defense'];
    // Fixed/variable-damage moves (Seismic Toss, Low Kick…) have no listed power; treat them as 60.
    const power = move.power ?? 60;
    const crit = Math.random() < 1 / 24;
    const stab = attacker.types.includes(move.type) ? 1.5 : 1;
    const random = 0.85 + Math.random() * 0.15;

    const base = Math.floor(Math.floor((Math.floor((2 * LEVEL) / 5 + 2) * power * attack) / defense) / 50) + 2;
    const damage = Math.floor(base * (crit ? 1.5 : 1) * random * stab * multiplier);
    return { damage: Math.max(1, damage), multiplier, crit };
  }

  // Spends one guard charge (if any) to soften a landed hit. Misses don't use a charge.
  function applyGuard(defender, damage) {
    if (defender.guards <= 0) return { damage, reduced: 0 };
    defender.guards -= 1;
    const reduced = GUARD_MIN + Math.random() * (GUARD_MAX - GUARD_MIN);
    return { damage: Math.max(1, Math.round(damage * (1 - reduced))), reduced };
  }

  return { LEVEL, GUARD_CHARGES, createFighter, typeMultiplier, calcDamage, applyGuard };
})();
