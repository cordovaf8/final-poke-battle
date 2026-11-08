// Controller support: polls the Gamepad API and turns input into simple actions
// (up/down/left/right, confirm, back, x, y, prev, next, start, select) that each screen maps.
const Gamepad = (() => {
  // Standard mapping (Xbox layout; PlayStation is cross/circle/square/triangle in the same spots).
  const BUTTONS = {
    0: 'confirm', 1: 'back', 2: 'x', 3: 'y', 4: 'prev', 5: 'next',
    8: 'select', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right',
  };
  const REPEATABLE = new Set(['up', 'down', 'left', 'right']);
  const DEADZONE = 0.5;
  const REPEAT_DELAY = 350;
  const REPEAT_RATE = 110;

  const listeners = new Set();
  const held = new Map(); // action -> time it next repeats
  let polling = false;

  const connectedPads = () => [...(navigator.getGamepads?.() || [])].filter(Boolean);

  function pressedActions(pad) {
    const actions = new Set();
    pad.buttons.forEach((button, i) => {
      if (button.pressed && BUTTONS[i]) actions.add(BUTTONS[i]);
    });
    const [x = 0, y = 0] = pad.axes;
    if (x < -DEADZONE) actions.add('left');
    if (x > DEADZONE) actions.add('right');
    if (y < -DEADZONE) actions.add('up');
    if (y > DEADZONE) actions.add('down');
    return actions;
  }

  function poll(now) {
    const pads = connectedPads();
    const active = new Set();
    pads.forEach(pad => pressedActions(pad).forEach(a => active.add(a)));

    // Fire on press; directions auto-repeat while held, like a keyboard.
    for (const action of active) {
      const next = held.get(action);
      if (next === undefined) {
        held.set(action, REPEATABLE.has(action) ? now + REPEAT_DELAY : Infinity);
        listeners.forEach(fn => fn(action));
      } else if (now >= next) {
        held.set(action, now + REPEAT_RATE);
        listeners.forEach(fn => fn(action));
      }
    }
    for (const action of [...held.keys()]) {
      if (!active.has(action)) held.delete(action);
    }

    if (pads.length) requestAnimationFrame(poll);
    else polling = false;
  }

  function start() {
    document.body.classList.add('has-gamepad');
    if (polling) return;
    polling = true;
    requestAnimationFrame(poll);
  }

  // Browsers only reveal a controller after one of its buttons is pressed on the page.
  addEventListener('gamepadconnected', start);
  addEventListener('gamepaddisconnected', () => {
    if (!connectedPads().length) document.body.classList.remove('has-gamepad');
  });
  if (connectedPads().length) start();

  return { on: fn => listeners.add(fn) };
})();
