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
  // Accuracy/evasion stages use thirds instead of halves.
  const accuracyMultiplier = stage => (stage >= 0 ? (3 + stage) / 3 : 3 / (3 - stage));
  const clampStage = s => Math.max(-6, Math.min(6, s));

  // Types that can't receive a status condition.
  const STATUS_IMMUNE = {
    burn: ['fire'],
    poison: ['poison', 'steel'],
    paralysis: ['electric'],
    freeze: ['ice'],
    sleep: [],
  };
  const STATUSES = Object.keys(STATUS_IMMUNE);

  function canReceiveStatus(f, status) {
    return !f.fainted && !f.status && STATUSES.includes(status) && !STATUS_IMMUNE[status].some(t => f.types.includes(t));
  }

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
      // Major status (burn/poison/paralysis/sleep/freeze) is exclusive; confusion stacks on top.
      status: null,
      sleepTurns: 0,
      confused: 0,
      stages: { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 },
    };
  }

  // Resets everything a faint or a fresh start clears.
  function clearConditions(f) {
    f.status = null;
    f.sleepTurns = 0;
    f.confused = 0;
    f.guards = 0;
    Object.keys(f.stages).forEach(k => { f.stages[k] = 0; });
  }

  // Applies stage changes, clamped to ±6. Returns the changes that actually happened.
  function changeStages(f, changes) {
    const applied = [];
    for (const { stat, change } of changes) {
      if (!(stat in f.stages)) continue;
      const before = f.stages[stat];
      f.stages[stat] = clampStage(before + change);
      applied.push({ stat, delta: f.stages[stat] - before });
    }
    return applied;
  }

  // Multiplier on how fast the ATB gauge fills: Speed stages, and paralysis halves it.
  const speedFactor = f => stageMultiplier(f.stages.speed) * (f.status === 'paralysis' ? 0.5 : 1);

  function typeMultiplier(moveType, defenderTypes) {
    return defenderTypes.reduce((m, t) => m * (TYPE_CHART[moveType]?.[t] ?? 1), 1);
  }

  function hits(attacker, defender, move) {
    if (move.accuracy == null) return true;
    const stage = clampStage(attacker.stages.accuracy - defender.stages.evasion);
    return Math.random() * 100 < move.accuracy * accuracyMultiplier(stage);
  }

  function baseDamage(power, attack, defense) {
    return Math.floor(Math.floor((Math.floor((2 * LEVEL) / 5 + 2) * power * attack) / defense) / 50) + 2;
  }

  function calcDamage(attacker, defender, move) {
    if (!hits(attacker, defender, move)) return { missed: true };
    const multiplier = typeMultiplier(move.type, defender.types);
    if (multiplier === 0) return { damage: 0, multiplier };

    const physical = move.category === 'physical';
    const atkKey = physical ? 'attack' : 'special-attack';
    const defKey = physical ? 'defense' : 'special-defense';
    const attack = attacker.stats[atkKey] * stageMultiplier(attacker.stages[atkKey]);
    const defense = defender.stats[defKey] * stageMultiplier(defender.stages[defKey]);
    // Fixed/variable-damage moves (Seismic Toss, Low Kick…) have no listed power; treat them as 60.
    const power = move.power ?? 60;
    const crit = Math.random() < 1 / 24;
    const stab = attacker.types.includes(move.type) ? 1.5 : 1;
    const random = 0.85 + Math.random() * 0.15;
    const burned = physical && attacker.status === 'burn' ? 0.5 : 1;

    const damage = Math.floor(baseDamage(power, attack, defense) * (crit ? 1.5 : 1) * random * stab * multiplier * burned);
    return { damage: Math.max(1, damage), multiplier, crit };
  }

  // Hitting itself in confusion: a typeless 40-power physical hit on its own stats.
  function confusionDamage(f) {
    const attack = f.stats.attack * stageMultiplier(f.stages.attack);
    const defense = f.stats.defense * stageMultiplier(f.stages.defense);
    return Math.max(1, Math.floor(baseDamage(40, attack, defense) * (0.85 + Math.random() * 0.15)));
  }

  // Spends one guard charge (if any) to soften a landed hit. Misses don't use a charge.
  function applyGuard(defender, damage) {
    if (defender.guards <= 0) return { damage, reduced: 0 };
    defender.guards -= 1;
    const reduced = GUARD_MIN + Math.random() * (GUARD_MAX - GUARD_MIN);
    return { damage: Math.max(1, Math.round(damage * (1 - reduced))), reduced };
  }

  return {
    LEVEL, GUARD_CHARGES, STATUSES,
    createFighter, clearConditions, changeStages, canReceiveStatus, speedFactor,
    typeMultiplier, hits, calcDamage, confusionDamage, applyGuard,
  };
})();
