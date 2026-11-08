// Battle Tower: floor definitions and the saved climb, shared by tower.html and battle.html.
const Tower = (() => {
  const RUN_KEY = 'towerRun';
  const BEST_KEY = 'towerBest';
  const TEAM_KEY = 'pokemonTeam';

  // Each floor's foes are drawn from a base-stat-total range, and their gauges fill faster as you climb.
  const FLOORS = [
    { name: 'The Gate', trainer: 'Gatekeeper Rowan', bst: [300, 430], atbScale: 1.35, color: '#6bd96b', stars: 1 },
    { name: 'The Hall', trainer: 'Ace Trainer Mira', bst: [420, 500], atbScale: 1.25, color: '#4fb8ff', stars: 2 },
    { name: 'The Spire', trainer: 'Veteran Holt', bst: [490, 560], atbScale: 1.15, color: '#c77dff', stars: 3 },
    { name: 'The Summit', trainer: 'Tower Master Sable', bst: [560, 720], atbScale: 1.05, color: '#ffd23f', stars: 4 },
  ];
  const ROMAN = ['I', 'II', 'III', 'IV'];

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

  const teamIds = () => (read(TEAM_KEY, []) || []).map(p => p.id);

  // A run stores the next floor to fight (0–3, or 4 once the tower is conquered).
  // Changing your team starts a fresh climb.
  function getRun() {
    const ids = teamIds();
    let run = read(RUN_KEY, null);
    if (!run || (run.teamIds || []).join() !== ids.join()) {
      run = { floor: 0, teamIds: ids };
      write(RUN_KEY, run);
    }
    return run;
  }

  function setFloor(floor) {
    const run = getRun();
    run.floor = floor;
    write(RUN_KEY, run);
    if (floor > best()) write(BEST_KEY, floor);
  }

  const best = () => read(BEST_KEY, 0);

  return { FLOORS, ROMAN, getRun, setFloor, best };
})();
