// Rogue mode: an endless run of battles against ever-stronger wild Pokémon. You start with three
// 1★ Pokémon; after each win a die roll (1–5) offers a random Pokémon with that many stars, which
// you can swap in for a team member or turn down. Pokémon that faint in a won battle are lost: each
// gets a roll of its own, and the rolled Pokémon takes its place. Losing a battle ends the run.
// Shared by index.html (picking the starting team), rogue.html (the run) and battle.html.
const Rogue = (() => {
  const RUN_KEY = 'rogueRun';
  const BEST_KEY = 'rogueBest';

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

  // A run: team (3 Pokémon IDs), wins so far, whether a die roll is owed for the last win (pendingRoll),
  // the roll once thrown, the offer ({ roll, id }) once its Pokémon is drawn, fallen (team slots lost in
  // the last battle, still to be refilled) and over once a battle is lost.
  // The roll and offer are saved straight away, so refreshing can't reroll them.
  const getRun = () => read(RUN_KEY, null);
  const save = run => write(RUN_KEY, run);

  function start(team) {
    save({ team, wins: 0, pendingRoll: false, roll: null, offer: null, fallen: [], over: false });
  }

  // fallen: the team slots whose Pokémon fainted during the battle.
  function recordWin(fallen = []) {
    const run = getRun();
    if (!run || run.over) return;
    run.wins += 1;
    run.fallen = fallen;
    run.pendingRoll = true;
    run.roll = null;
    run.offer = null;
    save(run);
    if (run.wins > best()) write(BEST_KEY, run.wins);
  }

  // Throws the die for the last win, or returns the throw already made.
  function roll() {
    const run = getRun();
    if (run.roll == null) {
      run.roll = 1 + Math.floor(Math.random() * 5);
      save(run);
    }
    return run.roll;
  }

  function endRun() {
    const run = getRun();
    if (!run) return;
    run.over = true;
    save(run);
  }

  function setOffer(offer) {
    const run = getRun();
    run.pendingRoll = false;
    run.roll = null;
    run.offer = offer;
    save(run);
  }

  // Swaps the offered Pokémon into team slot `slot`, or turns the offer down when slot is null.
  // While slots are still fallen, the offer has to fill the first of them, and the next one gets a roll.
  function resolveOffer(slot) {
    const run = getRun();
    const fallen = run.fallen || [];
    if (fallen.length) slot = fallen.shift();
    if (slot != null && run.offer) run.team[slot] = run.offer.id;
    run.offer = null;
    run.fallen = fallen;
    run.pendingRoll = fallen.length > 0;
    save(run);
  }

  const clear = () => {
    try { localStorage.removeItem(RUN_KEY); } catch { /* storage unavailable */ }
  };

  // Foes get a star tougher every two wins (battles 1–2 are 1★, 3–4 are 2★ … 9 on are 5★),
  // and their gauges fill faster as the run goes on, down to your own pace.
  const foeStars = wins => Math.min(5, 1 + Math.floor(wins / 2));
  const atbScale = wins => Math.max(1, 1.35 - wins * 0.04);

  const best = () => read(BEST_KEY, 0);

  return { getRun, start, recordWin, roll, endRun, setOffer, resolveOffer, clear, foeStars, atbScale, best };
})();
