// Move animations: type-themed wind-ups, projectiles, impacts and auras, drawn on a layer over the battlefield.
// The battle hands over sprite <img> elements; everything here is positioned in field pixels.
const Fx = (() => {
  // Per type: a palette (light to dark), how its special moves travel (go) and how they land (hit).
  const TYPES = {
    normal: { c: ['#ffffff', '#f4eed8', '#d9cfa9'], go: 'orb', hit: 'star' },
    fire: { c: ['#fff4a3', '#ffb22e', '#ff5b1a', '#d42a0c'], go: 'fireball', hit: 'flames' },
    water: { c: ['#ffffff', '#9ee6ff', '#3fa7f5', '#2462c9'], go: 'bubbles', hit: 'splash' },
    electric: { c: ['#ffffff', '#fff7a1', '#ffe033', '#f5b800'], go: 'bolt', hit: 'sparks' },
    grass: { c: ['#dcff8f', '#8be05a', '#46b03a', '#2a7a2a'], go: 'leaves', hit: 'leaves' },
    ice: { c: ['#ffffff', '#d8f8ff', '#9fe3f7', '#5fc0e8'], go: 'shards', hit: 'frost' },
    fighting: { c: ['#fff0c8', '#ffaa55', '#e8552a', '#a8321f'], go: 'orb', hit: 'shock' },
    poison: { c: ['#f4c6ff', '#c27ae6', '#9a3fcf', '#5f1f8a'], go: 'sludge', hit: 'bubbles' },
    ground: { c: ['#f5dfa6', '#d6ad62', '#a87d3c', '#6e5126'], go: 'quake', hit: 'dust' },
    flying: { c: ['#ffffff', '#e6f3ff', '#bcdcf7', '#8fbfe8'], go: 'gust', hit: 'feathers' },
    psychic: { c: ['#ffe0f2', '#ff8fcf', '#f0509f', '#b8287a'], go: 'rings', hit: 'warp' },
    bug: { c: ['#f0ffa8', '#c4dd3c', '#93ad1f', '#5f7512'], go: 'swarm', hit: 'sparks' },
    rock: { c: ['#efe0b4', '#c8ab6c', '#97793f', '#62502b'], go: 'rockfall', hit: 'dust' },
    ghost: { c: ['#e6dcff', '#a98be8', '#6d4fc4', '#36246e'], go: 'shade', hit: 'shade' },
    dragon: { c: ['#e4dcff', '#9d86ff', '#6247f0', '#3420a8'], go: 'dragon', hit: 'shock' },
    dark: { c: ['#cdbfd8', '#7b6690', '#45335a', '#1d1228'], go: 'dark', hit: 'slash' },
    steel: { c: ['#ffffff', '#e8eef5', '#b4c2d2', '#7d8da0'], go: 'shards', hit: 'clang' },
    fairy: { c: ['#ffffff', '#ffe3f3', '#ffadd9', '#ff79c1'], go: 'sparkles', hit: 'twinkle' },
  };
  // A few move names get their own look, whatever their type.
  const CONTACT = [
    [/slash|claw|cut\b|scratch|scissor|blade|razor|chop|swipe|aerial ace|night slash/i, 'slash'],
    [/bite|fang|crunch|jaw|chomp/i, 'chomp'],
  ];
  const BEAM = /beam|cannon|laser|\bray\b/i;
  const QUAKE = /quake|magnitude|bulldoze|fissure|\bdig\b|stomping/i;
  // Physical moves of these kinds hit from a distance instead of lunging in.
  const RANGED_PHYSICAL = new Set(['quake', 'rockfall']);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let field = null;
  let layer = null;
  let scene = [];
  let shakeTween = null;

  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const range = v => (Array.isArray(v) ? rand(v[0], v[1]) : v);
  const deg = rad => (rad * 180) / Math.PI;
  const look = move => TYPES[move.type] || TYPES.normal;
  // Bigger attacks throw more and bigger particles (Tackle ≈ 0.7, Hyper Beam 1.5).
  const strength = move => gsap.utils.clamp(0.7, 1.5, (move.power || 60) / 80);

  function init(fieldEl) {
    field = fieldEl;
    layer = document.createElement('div');
    layer.className = 'fx-layer';
    field.querySelector('.units').after(layer);
    scene = [...field.querySelectorAll('.backdrop, .ground, .frame, .units'), layer];
  }

  // A sprite's box in field pixels.
  function box(el) {
    const f = field.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const top = r.top - f.top;
    return { x: r.left - f.left + r.width / 2, y: top + r.height / 2, w: r.width, h: r.height, top, bottom: top + r.height };
  }

  function spawn(shape, x, y, w, color, h = w, props = {}) {
    const el = document.createElement('i');
    el.className = `fx fx-${shape}`;
    el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    el.style.setProperty('--c', color);
    layer.appendChild(el);
    gsap.set(el, { xPercent: -50, yPercent: -50, ...props });
    return el;
  }

  // ---------- Building blocks ----------

  // Throws particles out from a point. Most options take a number or a [min, max] range.
  function burst(p, shape, colors, o = {}) {
    const {
      count = 10, size = [6, 12], dist = [20, 60], dur = [0.45, 0.75], angle = [0, 360],
      gravity = 0, rise = 0, spin = 0, end = 0.3, delay = 0, aspect = 1, align = false,
    } = o;
    for (let i = 0; i < Math.round(count); i += 1) {
      const a = (range(angle) * Math.PI) / 180;
      const d = range(dist);
      const s = range(size);
      const t = range(dur);
      const el = spawn(shape, p.x, p.y, s, pick(colors), s * aspect, { rotation: align ? deg(a) : rand(0, 360) });
      const tx = Math.cos(a) * d;
      const ty = Math.sin(a) * d - rise;
      const tl = gsap.timeline({ delay: range(delay), onComplete: () => el.remove() })
        .fromTo(el, { scale: 0.3 }, { scale: 1, duration: t * 0.25, ease: 'back.out(2)' }, 0)
        .to(el, { x: tx, duration: t, ease: 'power2.out' }, 0)
        .to(el, { opacity: 0, scale: end, duration: t * 0.5, ease: 'power1.in' }, t * 0.5);
      if (spin) tl.to(el, { rotation: `+=${rand(-spin, spin)}`, duration: t, ease: 'none' }, 0);
      if (gravity) {
        tl.to(el, { y: ty, duration: t * 0.4, ease: 'power2.out' }, 0)
          .to(el, { y: ty + gravity, duration: t * 0.6, ease: 'power2.in' }, t * 0.4);
      } else {
        tl.to(el, { y: ty, duration: t, ease: 'power2.out' }, 0);
      }
    }
  }

  function glowAt(p, color, size, dur = 0.4) {
    const el = spawn('glow', p.x, p.y, size, color);
    gsap.timeline({ onComplete: () => el.remove() })
      .fromTo(el, { scale: 0.3, opacity: 1 }, { scale: 1.2, duration: dur * 0.4, ease: 'power2.out' })
      .to(el, { opacity: 0, scale: 1.4, duration: dur * 0.6, ease: 'power1.in' });
  }

  // Shockwave ring. squash < 1 flattens it onto the ground.
  function ring(p, color, size, { dur = 0.45, delay = 0, squash = 1, from = 0.2 } = {}) {
    const el = spawn('ring', p.x, p.y, size, color, size, { scaleY: squash });
    gsap.timeline({ delay, onComplete: () => el.remove() })
      .fromTo(el, { scaleX: from, scaleY: from * squash, opacity: 1 }, { scaleX: 1, scaleY: squash, duration: dur, ease: 'power2.out' })
      .to(el, { opacity: 0, duration: dur * 0.5, ease: 'power1.in' }, dur * 0.5);
  }

  // A shape that flies from a to b, optionally leaving a trail. arc lifts it, wave wiggles it.
  function projectile(a, b, shape, color, size, o = {}) {
    const {
      dur = 0.4, arc = 0, wave = 0, waves = 1, ease = 'power1.in', delay = 0,
      trail = null, trailColors = [color], spin = 0, align = false, aspect = 1,
    } = o;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const el = spawn(shape, a.x, a.y, size, color, size * aspect, {
      rotation: align ? deg(Math.atan2(dy, dx)) : rand(0, 360), autoAlpha: 0,
    });
    const st = { t: 0 };
    let lastPuff = 0;
    gsap.to(st, {
      t: 1, duration: dur, delay, ease,
      onStart: () => gsap.set(el, { autoAlpha: 1 }),
      onUpdate() {
        const x = dx * st.t;
        const y = dy * st.t - arc * Math.sin(Math.PI * st.t) + wave * Math.sin(st.t * Math.PI * 2 * waves);
        gsap.set(el, spin ? { x, y, rotation: `+=${spin}` } : { x, y });
        if (trail && this.time() - lastPuff > 0.025) {
          lastPuff = this.time();
          puff({ x: a.x + x, y: a.y + y }, trail, trailColors, size * 0.6);
        }
      },
      onComplete: () => el.remove(),
    });
  }

  function puff(p, shape, colors, size) {
    const el = spawn(shape, p.x + rand(-3, 3), p.y + rand(-3, 3), size * rand(0.6, 1), pick(colors));
    gsap.to(el, {
      opacity: 0, scale: 0.2, y: shape === 'flame' ? -16 : 0, duration: 0.35, ease: 'power1.in', onComplete: () => el.remove(),
    });
  }

  function bolt(x, top, bottom, color, width) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const steps = 8;
    const pts = [];
    for (let i = 0; i <= steps; i += 1) {
      const jitter = i === 0 || i === steps ? 0 : rand(-24, 24);
      pts.push(`${(x + jitter).toFixed(1)},${(top + ((bottom - top) * i) / steps).toFixed(1)}`);
    }
    svg.setAttribute('class', 'fx-bolt');
    svg.innerHTML = `<polyline points="${pts.join(' ')}" stroke="${color}" stroke-width="${width * 2.6}" opacity="0.55"/>`
      + `<polyline points="${pts.join(' ')}" stroke="#fff" stroke-width="${width}"/>`;
    layer.appendChild(svg);
    gsap.timeline({ onComplete: () => svg.remove() })
      .fromTo(svg, { opacity: 0 }, { opacity: 1, duration: 0.04, repeat: 3, yoyo: true })
      .to(svg, { opacity: 0, duration: 0.2, delay: 0.05 });
  }

  // Full-field colour wash: a white flash for crits, a dark dim for Dark moves.
  function tint(color, alpha, { dur = 0.4, fadeIn = 0 } = {}) {
    const el = document.createElement('i');
    el.className = 'fx-tint';
    el.style.setProperty('--c', color);
    layer.appendChild(el);
    gsap.timeline({ onComplete: () => el.remove() })
      .fromTo(el, { opacity: fadeIn ? 0 : alpha * (reduced ? 0.4 : 1) }, { opacity: alpha * (reduced ? 0.4 : 1), duration: fadeIn })
      .to(el, { opacity: 0, duration: dur, ease: 'power1.in' });
  }

  function shake(amount, dur = 0.35) {
    if (reduced || !amount) return;
    shakeTween?.kill();
    const st = { v: 0 };
    shakeTween = gsap.to(st, {
      v: 1, duration: dur, ease: 'none',
      onUpdate() {
        const k = amount * (1 - st.v);
        gsap.set(scene, { x: rand(-k, k), y: rand(-k, k) * 0.6 });
      },
      onComplete: () => gsap.set(scene, { x: 0, y: 0 }),
    });
  }

  // ---------- How moves travel ----------

  // Each entry fires one copy at one target; time is when the battle should resolve the hit.
  const GO = {
    orb: {
      time: 0.38,
      run: (a, b, T, s) => projectile(a, b, 'orb', T.c[1], 24 * s, { dur: 0.38, trail: 'dot', trailColors: T.c }),
    },
    fireball: {
      time: 0.42,
      run: (a, b, T, s) => projectile(a, b, 'orb', T.c[2], 28 * s, { dur: 0.42, arc: 24, trail: 'flame', trailColors: T.c }),
    },
    dragon: {
      time: 0.48,
      run: (a, b, T, s) => {
        projectile(a, b, 'orb', T.c[2], 26 * s, { dur: 0.48, wave: 18, waves: 1.5, trail: 'dot', trailColors: T.c });
        projectile(a, b, 'dot', T.c[0], 12 * s, { dur: 0.48, wave: -18, waves: 1.5, trail: 'dot', trailColors: T.c });
      },
    },
    shade: {
      time: 0.52,
      run: (a, b, T, s) => projectile(a, b, 'orb', T.c[3], 30 * s, { dur: 0.52, wave: 24, waves: 2, ease: 'sine.in', trail: 'wisp', trailColors: T.c }),
    },
    bubbles: {
      time: 0.5,
      run: (a, b, T, s) => {
        for (let i = 0; i < 9 * s; i += 1) {
          projectile(a, b, 'bubble', pick(T.c.slice(1)), rand(10, 18) * s, { dur: 0.36, delay: i * 0.035, wave: rand(-16, 16), waves: rand(1, 2), ease: 'none' });
        }
      },
    },
    leaves: {
      time: 0.52,
      run: (a, b, T, s) => {
        for (let i = 0; i < 8 * s; i += 1) {
          projectile(a, b, 'leaf', pick(T.c), rand(12, 18) * s, { dur: 0.38, delay: i * 0.04, wave: rand(-20, 20), spin: 25, ease: 'power1.in' });
        }
      },
    },
    shards: {
      time: 0.42,
      run: (a, b, T, s) => {
        for (let i = 0; i < 6 * s; i += 1) {
          const off = { x: b.x + rand(-b.w, b.w) * 0.2, y: b.y + rand(-b.h, b.h) * 0.2 };
          projectile(a, off, 'shard', pick(T.c.slice(1)), rand(22, 30) * s, { dur: 0.26, delay: i * 0.04, align: true, aspect: 0.35, ease: 'power2.in' });
        }
      },
    },
    sludge: {
      time: 0.5,
      run: (a, b, T, s) => {
        for (let i = 0; i < 4; i += 1) {
          projectile(a, b, 'blob', pick(T.c.slice(1)), rand(14, 22) * s, { dur: 0.4, delay: i * 0.05, arc: rand(50, 90), trail: 'dot', trailColors: T.c.slice(2) });
        }
      },
    },
    gust: {
      time: 0.46,
      run: (a, b, T, s) => {
        for (let i = 0; i < 3; i += 1) {
          projectile(a, b, 'crescent', T.c[i % 2 ? 2 : 0], 46 * s, { dur: 0.3, delay: i * 0.08, wave: rand(-10, 10), align: true, aspect: 1.4, ease: 'power1.in' });
        }
        for (let i = 0; i < 4; i += 1) projectile(a, b, 'leaf', '#ffffff', 12, { dur: 0.42, delay: i * 0.05, wave: rand(-26, 26), spin: 18, ease: 'none' });
      },
    },
    rings: {
      time: 0.46,
      run: (a, b, T) => {
        for (let i = 0; i < 5; i += 1) {
          const el = spawn('ring', a.x, a.y, 34, T.c[i % 2 ? 1 : 2], 54, { scale: 0.5, autoAlpha: 0 });
          gsap.timeline({ delay: i * 0.06, onComplete: () => el.remove() })
            .set(el, { autoAlpha: 1 })
            .to(el, { x: b.x - a.x, y: b.y - a.y, scale: 1.3, duration: 0.34, ease: 'none' })
            .to(el, { opacity: 0, duration: 0.12 }, '-=0.12');
        }
      },
    },
    swarm: {
      time: 0.56,
      run: (a, b, T) => {
        for (let i = 0; i < 14; i += 1) {
          projectile(a, b, 'dot', pick(T.c.slice(1)), rand(5, 9), { dur: 0.42, delay: i * 0.02, wave: rand(-30, 30), waves: rand(2, 4), ease: 'none' });
        }
      },
    },
    sparkles: {
      time: 0.5,
      run: (a, b, T, s) => {
        for (let i = 0; i < 8; i += 1) {
          projectile(a, b, 'sparkle', pick(T.c.slice(1)), rand(12, 20) * s, { dur: 0.4, delay: i * 0.04, arc: rand(-40, 40), spin: 12, ease: 'sine.inOut' });
        }
      },
    },
    bolt: {
      time: 0.22,
      run: (a, b, T, s) => {
        bolt(b.x, 0, b.y, T.c[2], 4 * s);
        gsap.delayedCall(0.08, () => bolt(b.x + rand(-12, 12), 0, b.y, T.c[1], 2.5 * s));
        tint('#fffbe0', 0.35, { dur: 0.25 });
      },
    },
    rockfall: {
      time: 0.46,
      run: (a, b, T, s) => {
        for (let i = 0; i < 5 * s; i += 1) {
          const x = b.x + rand(-0.4, 0.4) * b.w;
          const y = b.top - rand(110, 190);
          const el = spawn('rock', x, y, rand(18, 30) * s, pick(T.c.slice(1)), undefined, { rotation: rand(0, 360) });
          gsap.timeline({ delay: i * 0.06, onComplete: () => el.remove() })
            .to(el, { y: b.y - y + rand(-12, 18), rotation: `+=${rand(-120, 120)}`, duration: 0.32, ease: 'power2.in' })
            .to(el, { opacity: 0, scale: 0.6, duration: 0.15 });
        }
      },
    },
    quake: {
      time: 0.5,
      run: (a, b, T, s) => {
        shake(9 * s, 0.6);
        burst({ x: b.x, y: b.bottom - 8 }, 'dust', T.c, { count: 10, angle: [-180, 0], dist: [30, 80], size: [18, 32], dur: [0.6, 0.9], end: 1.4 });
        for (let i = 0; i < 4; i += 1) {
          const el = spawn('rock', b.x + rand(-0.4, 0.4) * b.w, b.bottom, rand(16, 26), pick(T.c.slice(1)));
          gsap.timeline({ delay: 0.15 + i * 0.05, onComplete: () => el.remove() })
            .to(el, { y: -rand(40, 80), rotation: rand(-90, 90), duration: 0.25, ease: 'power2.out' })
            .to(el, { y: 0, opacity: 0, duration: 0.25, ease: 'power2.in' });
        }
      },
    },
    dark: {
      time: 0.34,
      run: (a, b, T) => {
        tint('#0b0614', 0.45, { fadeIn: 0.15, dur: 0.45 });
        burst(a, 'wisp', T.c.slice(1), { count: 8, dist: [20, 50], size: [16, 28], dur: [0.4, 0.6], end: 1.2 });
      },
    },
    beam: {
      time: 0.24,
      run: (a, b, T, s) => {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const el = spawn('beam', a.x, a.y, len, T.c[2], 16 * s, {
          xPercent: 0, rotation: deg(Math.atan2(b.y - a.y, b.x - a.x)), scaleX: 0, transformOrigin: '0% 50%',
        });
        glowAt(a, T.c[1], 60 * s, 0.6);
        gsap.timeline({ onComplete: () => el.remove() })
          .to(el, { scaleX: 1, duration: 0.18, ease: 'power2.out' })
          .to(el, { scaleY: 1.3, duration: 0.05, repeat: 5, yoyo: true })
          .to(el, { scaleY: 0, opacity: 0, duration: 0.2, ease: 'power1.in' });
      },
    },
  };

  function deliveryOf(move) {
    if (QUAKE.test(move.name)) return 'quake';
    // Pure stat moves (Growl, Leer, Charm…) send out rings; status inflicters use their type's look.
    if (move.category === 'status') return move.ailment && move.ailment !== 'none' ? look(move).go : 'rings';
    if (BEAM.test(move.name)) return 'beam';
    return look(move).go;
  }

  // Whether a move flies across the field (special, status, quakes, rock slides) instead of lunging in.
  const ranged = move => move.category !== 'physical' || RANGED_PHYSICAL.has(deliveryOf(move));

  // The attacker glows and gathers energy, then the move travels to every target.
  // Adds both stages to tl; targets() is read when the move fires, so retargeting works.
  function deliver(tl, move, fromEl, targets) {
    const T = look(move);
    const s = strength(move);
    const go = GO[deliveryOf(move)];
    tl.add(() => {
      const a = box(fromEl);
      glowAt(a, T.c[1], a.w * 0.8, 0.45);
      for (let i = 0; i < 8; i += 1) {
        const ang = rand(0, Math.PI * 2);
        const d = rand(40, 70) * s;
        const el = spawn('dot', a.x + Math.cos(ang) * d, a.y + Math.sin(ang) * d, rand(5, 9), pick(T.c));
        gsap.to(el, {
          x: -Math.cos(ang) * d, y: -Math.sin(ang) * d, opacity: 0.2, duration: 0.26, ease: 'power2.in', onComplete: () => el.remove(),
        });
      }
    });
    tl.to({}, { duration: 0.28 });
    tl.add(() => {
      const a = box(fromEl);
      targets().forEach(el => go.run(a, box(el), T, s));
    });
    tl.to({}, { duration: go.time });
  }

  // A contact move's wind-up: a burst of type colour as the attacker charges in.
  function windup(move, el) {
    const T = look(move);
    const p = box(el);
    glowAt(p, T.c[1], p.w * 0.7, 0.35);
    burst(p, 'dot', T.c, { count: 6, dist: [20, 40], size: [5, 9], dur: [0.3, 0.45] });
  }

  // ---------- How moves land ----------

  const HIT = {
    star(p, T, s) {
      glowAt(p, '#ffffff', 80 * s, 0.3);
      const el = spawn('star', p.x, p.y, 64 * s, '#ffffff', undefined, { rotation: rand(0, 45) });
      gsap.timeline({ onComplete: () => el.remove() })
        .fromTo(el, { scale: 0.2 }, { scale: 1.1, duration: 0.12, ease: 'power2.out' })
        .to(el, { scale: 0.6, opacity: 0, duration: 0.2 });
      burst(p, 'dot', T.c, { count: 8, dist: [30, 60 * s], dur: [0.3, 0.5] });
    },
    flames(p, T, s) {
      glowAt(p, T.c[2], 100 * s);
      burst(p, 'flame', T.c, { count: 16 * s, size: [12, 22 * s], dist: [8, 40 * s], rise: 46, dur: [0.5, 0.85], end: 0.2 });
    },
    splash(p, T, s) {
      ring(p, T.c[1], 90 * s, { squash: 0.5 });
      burst(p, 'drop', T.c.slice(1), { count: 16 * s, size: [7, 12], dist: [30, 70 * s], angle: [-165, -15], gravity: 90, dur: [0.6, 0.9], align: true });
    },
    sparks(p, T, s) {
      glowAt(p, T.c[2], 90 * s, 0.3);
      burst(p, 'spark', T.c, { count: 12 * s, size: [18, 30], aspect: 0.18, dist: [30, 70 * s], dur: [0.25, 0.4], align: true, end: 1 });
    },
    leaves(p, T, s) {
      burst(p, 'leaf', T.c, { count: 12 * s, size: [10, 16], dist: [30, 75 * s], spin: 360, gravity: 30, dur: [0.6, 0.9] });
    },
    frost(p, T, s) {
      glowAt(p, T.c[2], 110 * s, 0.6);
      burst(p, 'shard', T.c, { count: 10 * s, size: [18, 28], aspect: 0.35, dist: [25, 65 * s], align: true, dur: [0.4, 0.6], end: 0.8 });
      burst(p, 'sparkle', ['#ffffff'], { count: 6, size: [8, 14], dist: [10, 50], dur: [0.5, 0.8] });
    },
    shock(p, T, s) {
      ring(p, T.c[1], 110 * s, { dur: 0.35 });
      HIT.star(p, T, s * 0.9);
    },
    bubbles(p, T, s) {
      glowAt(p, T.c[2], 80 * s);
      burst(p, 'bubble', T.c.slice(1), { count: 10 * s, size: [8, 16], dist: [10, 40], rise: 60, dur: [0.7, 1.1], end: 1.3 });
    },
    dust(p, T, s) {
      burst(p, 'dust', T.c, { count: 10 * s, size: [20, 34], dist: [20, 60 * s], dur: [0.5, 0.8], end: 1.5 });
      burst(p, 'rock', T.c.slice(1), { count: 5, size: [8, 14], dist: [30, 70], gravity: 60, spin: 200, angle: [-160, -20] });
    },
    feathers(p, T, s) {
      glowAt(p, T.c[0], 80 * s, 0.3);
      burst(p, 'leaf', ['#ffffff', T.c[2]], { count: 10 * s, size: [10, 16], dist: [20, 60], angle: [-170, -10], gravity: 70, spin: 240, dur: [0.8, 1.2] });
    },
    warp(p, T, s) {
      ring(p, T.c[1], 100 * s, { dur: 0.4 });
      ring(p, T.c[2], 70 * s, { dur: 0.4, delay: 0.1 });
      glowAt(p, T.c[1], 100 * s, 0.6);
    },
    shade(p, T, s) {
      glowAt(p, T.c[3], 100 * s, 0.6);
      burst(p, 'wisp', T.c.slice(1), { count: 10 * s, size: [16, 26], dist: [10, 40], rise: 50, dur: [0.6, 1], end: 1.4 });
    },
    slash(p, T, s) {
      [-35, 20, -10].slice(0, s > 1.1 ? 3 : 2).forEach((angle, i) => {
        const el = spawn('slash', p.x + rand(-10, 10), p.y + rand(-12, 12), 130 * s, T.c[i ? 1 : 2], 10, { rotation: angle, scaleX: 0 });
        gsap.timeline({ delay: i * 0.08, onComplete: () => el.remove() })
          .to(el, { scaleX: 1, duration: 0.1, ease: 'power3.out' })
          .to(el, { scaleY: 0, opacity: 0, duration: 0.22, ease: 'power1.in' });
      });
      burst(p, 'dot', T.c, { count: 6, dist: [20, 50], dur: [0.3, 0.5], delay: [0.05, 0.15] });
    },
    chomp(p, T, s) {
      const w = 90 * s;
      const top = spawn('jaw', p.x, p.y - w * 0.55, w, '#ffffff', w * 0.4);
      const bottom = spawn('jaw', p.x, p.y + w * 0.55, w, '#ffffff', w * 0.4, { rotation: 180 });
      gsap.timeline({ onComplete: () => { top.remove(); bottom.remove(); } })
        .to(top, { y: w * 0.35, duration: 0.12, ease: 'power3.in' }, 0)
        .to(bottom, { y: -w * 0.35, duration: 0.12, ease: 'power3.in' }, 0)
        .to([top, bottom], { opacity: 0, duration: 0.2, delay: 0.1 });
      gsap.delayedCall(0.12, () => HIT.star(p, T, s * 0.7));
    },
    clang(p, T, s) {
      HIT.star(p, T, s);
      ring(p, T.c[2], 100 * s, { dur: 0.3 });
      burst(p, 'spark', ['#ffffff', T.c[2]], { count: 10, size: [16, 24], aspect: 0.18, dist: [40, 80], dur: [0.25, 0.4], align: true, end: 1 });
    },
    twinkle(p, T, s) {
      glowAt(p, T.c[2], 90 * s, 0.5);
      burst(p, 'sparkle', T.c, { count: 12 * s, size: [10, 20], dist: [20, 60 * s], dur: [0.6, 0.9], spin: 90, end: 0 });
    },
  };

  // Called when an attack connects: crits flash the screen, super-effective hits shake it.
  function impact(move, el, { crit = false, multiplier = 1 } = {}) {
    const T = look(move);
    const s = strength(move);
    const p = box(el);
    if (move.category === 'physical' && !ranged(move)) {
      const named = CONTACT.find(([re]) => re.test(move.name))?.[1];
      HIT[named || 'star'](p, T, s);
      if (T.hit !== 'star' && T.hit !== named) HIT[T.hit](p, T, s * 0.8);
    } else {
      HIT[T.hit](p, T, s);
    }
    if (crit) {
      tint('#ffffff', 0.55, { dur: 0.3 });
      shake(12, 0.4);
    } else if (multiplier > 1) {
      shake(7, 0.35);
    } else if (s > 1.2) {
      shake(4, 0.25);
    }
  }

  // A status move landing on a foe (Thunder Wave, Growl…): a soft flash in its type colour.
  function affect(move, el) {
    const T = look(move);
    const p = box(el);
    glowAt(p, T.c[1], p.w * 0.8, 0.5);
    burst(p, 'dot', T.c, { count: 8, dist: [20, 50], dur: [0.4, 0.6] });
  }

  // Moves aimed at the user (Swords Dance, Recover…): rings and motes rising from its feet.
  function aura(move, el) {
    const T = look(move);
    const p = box(el);
    const feet = { x: p.x, y: p.bottom - 6 };
    for (let i = 0; i < 3; i += 1) ring(feet, T.c[i % 2 ? 1 : 2], p.w * 1.1, { squash: 0.3, delay: i * 0.12, dur: 0.6 });
    burst(feet, 'dot', T.c, { count: 14, angle: [-115, -65], dist: [p.h * 0.4, p.h * 0.9], size: [5, 9], dur: [0.6, 1], delay: [0, 0.3] });
  }

  // Stat changes: streaks rise for a boost and fall for a drop, in the same colours as the stat popups.
  function stat(el, up) {
    const p = box(el);
    const colors = up ? ['#e6f6ff', '#8fd3ff', '#4aa8f0'] : ['#fff1d6', '#ffb36b', '#f07a2a'];
    for (let i = 0; i < 10; i += 1) {
      const x = p.x + rand(-0.4, 0.4) * p.w;
      const y = up ? p.bottom - rand(0, 0.3) * p.h : p.top + rand(0, 0.3) * p.h;
      const streak = spawn('streak', x, y, 5, pick(colors), rand(24, 40), { rotation: up ? 0 : 180, opacity: 0 });
      gsap.timeline({ delay: rand(0, 0.4), onComplete: () => streak.remove() })
        .to(streak, { opacity: 1, duration: 0.08 })
        .to(streak, { y: (up ? -1 : 1) * p.h * 0.7, opacity: 0, duration: 0.55, ease: 'power1.in' });
    }
  }

  function heal(el) {
    const p = box(el);
    burst({ x: p.x, y: p.y + p.h * 0.2 }, 'plus', ['#ffffff', '#9ff59f', '#3fd36b'], {
      count: 10, angle: [-120, -60], dist: [p.h * 0.3, p.h * 0.7], size: [8, 14], dur: [0.7, 1], delay: [0, 0.3], end: 0.6,
    });
    glowAt(p, '#7dff9a', p.w * 0.8, 0.6);
  }

  // Status conditions, when inflicted and each time they bite.
  function ailment(el, name) {
    const p = box(el);
    if (name === 'burn') {
      burst(p, 'flame', TYPES.fire.c, { count: 10, size: [10, 18], dist: [10, 30], rise: 40, dur: [0.5, 0.8] });
    } else if (name === 'poison') {
      burst(p, 'bubble', TYPES.poison.c.slice(1), { count: 9, size: [8, 14], dist: [10, 35], rise: 50, dur: [0.7, 1], end: 1.3 });
    } else if (name === 'paralysis') {
      burst(p, 'spark', TYPES.electric.c, { count: 10, size: [16, 26], aspect: 0.18, dist: [20, 50], dur: [0.2, 0.35], align: true, end: 1, delay: [0, 0.25] });
    } else if (name === 'freeze') {
      glowAt(p, '#bff3ff', p.w, 0.7);
      burst(p, 'shard', TYPES.ice.c, { count: 8, size: [16, 24], aspect: 0.35, dist: [15, 40], align: true, dur: [0.5, 0.7], end: 0.8 });
    } else if (name === 'sleep') {
      for (let i = 0; i < 3; i += 1) {
        const z = spawn('z', p.x + p.w * 0.2, p.top + p.h * 0.25, 18, '#ffffff', 18, { opacity: 0 });
        z.textContent = 'Z';
        gsap.timeline({ delay: i * 0.25, onComplete: () => z.remove() })
          .to(z, { opacity: 1, duration: 0.1 })
          .to(z, { x: 26 + i * 6, y: -40 - i * 8, scale: 1 + i * 0.3, duration: 0.8, ease: 'sine.out' }, 0)
          .to(z, { opacity: 0, duration: 0.25 }, 0.6);
      }
    } else if (name === 'confusion') {
      const head = { x: p.x, y: p.top + p.h * 0.2 };
      for (let i = 0; i < 3; i += 1) {
        const star = spawn('sparkle', head.x, head.y, 14, '#ffe066');
        const st = { a: (i / 3) * Math.PI * 2 };
        gsap.timeline({ onComplete: () => star.remove() })
          .to(st, {
            a: st.a + Math.PI * 4, duration: 1.1, ease: 'none',
            onUpdate: () => gsap.set(star, { x: Math.cos(st.a) * p.w * 0.3, y: Math.sin(st.a) * 8 }),
          })
          .to(star, { opacity: 0, duration: 0.2 }, 0.9);
      }
    }
  }

  // Evolution, part one: motes of light stream into the Pokémon and rings tighten around it.
  function evolveGather(el, duration) {
    const p = box(el);
    const colors = ['#ffffff', '#fff6c8', '#bdf2ff'];
    const motes = 40;
    for (let i = 0; i < motes; i += 1) {
      const a = rand(0, Math.PI * 2);
      const d = rand(90, 190);
      const mote = spawn('dot', p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, rand(5, 11), pick(colors), undefined, { opacity: 0 });
      gsap.timeline({ delay: (i / motes) * duration, onComplete: () => mote.remove() })
        .to(mote, { opacity: 1, duration: 0.1 })
        .to(mote, { x: -Math.cos(a) * d, y: -Math.sin(a) * d, scale: 0.4, duration: 0.55, ease: 'power2.in' }, 0);
    }
    for (let i = 0; i < 4; i += 1) {
      const r = spawn('ring', p.x, p.y, p.w * 1.6, '#e9fbff');
      gsap.timeline({ delay: (i * duration) / 4, onComplete: () => r.remove() })
        .fromTo(r, { scale: 1.3, opacity: 0 }, { scale: 0.3, opacity: 0.9, duration: 0.6, ease: 'power2.in' })
        .to(r, { opacity: 0, duration: 0.1 });
    }
  }

  // Evolution, part two: the new form bursts out in a shower of light.
  function evolveBurst(el) {
    const p = box(el);
    glowAt(p, '#ffffff', p.w * 2.2, 0.9);
    ring(p, '#fff6c8', p.w * 2.4, { dur: 0.7 });
    ring(p, '#bdf2ff', p.w * 1.8, { dur: 0.7, delay: 0.12 });
    burst(p, 'sparkle', ['#ffffff', '#fff6c8', '#ffe066', '#bdf2ff'], {
      count: 28, size: [10, 22], dist: [60, 170], dur: [0.8, 1.3], spin: 180, end: 0,
    });
    burst(p, 'dot', ['#ffffff', '#bdf2ff'], { count: 16, dist: [30, 120], gravity: 40, dur: [0.9, 1.4], delay: [0.1, 0.4] });
  }

  return { init, deliver, ranged, windup, impact, affect, aura, stat, heal, ailment, evolveGather, evolveBurst };
})();
