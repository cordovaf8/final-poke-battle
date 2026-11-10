// The game modes, shared by the mode select menu (index.html) and team select (team.html?mode=…).
const Modes = (() => {
  const LIST = [
    {
      id: 'wild', name: 'Wild battle', icon: '🌿', url: 'battle.html', start: 'Start battle', cls: '', color: '#ffd23f',
      text: 'A quick real-time battle against three random wild Pokémon.',
    },
    {
      id: 'tower', name: 'Battle Tower', icon: '🏰', url: 'tower.html', start: 'Enter the tower', cls: 'tower-btn', color: '#c77dff',
      text: 'Climb six floors of ever-tougher trainer battles to reach the summit.',
    },
    {
      id: 'rogue', name: 'Rogue run', icon: '🎲', url: 'rogue.html', start: 'Start run', cls: 'rogue-btn', color: '#3fd6a6',
      text: 'Start with three 1★ Pokémon and roll the die after every win for new teammates. How far can you go?',
    },
    {
      id: 'adventure', name: 'Adventure', icon: '🗺️', url: 'adventure.html', start: 'Set out', cls: 'adventure-btn', color: '#ffb347',
      text: 'Cross a branching route of battles, events and Pokémon Centers to face a legendary Pokémon.',
    },
  ];
  // Unknown or missing ids fall back to a wild battle.
  const get = id => LIST.find(m => m.id === id) || LIST[0];
  const teamUrl = id => `team.html?mode=${id}`;
  return { LIST, get, teamUrl };
})();
