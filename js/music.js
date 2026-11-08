// Original chiptune soundtrack, synthesized live with the Web Audio API (no audio files).
const Music = (() => {
  const STORAGE_KEY = 'pokemonMusicOn';
  const LOOKAHEAD = 0.3; // seconds of notes scheduled ahead of the playhead
  const TICK_MS = 50;
  const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

  const freqOf = name => {
    const [, pitch, octave] = name.match(/^([A-G]#?)(\d)$/);
    const midi = (Number(octave) + 1) * 12 + NOTE_INDEX[pitch];
    return 440 * 2 ** ((midi - 69) / 12);
  };

  // ---------- Composition helpers ----------
  // Patterns are space-separated 16th-note steps: a note ("C5"), "." to hold it, "-" for silence.
  // Drum steps use k (kick), s (snare) and h (hi-hat).

  const repeat = (bar, times) => Array(times).fill(bar).join(' ');
  // 16th-note arpeggio over a triad for one bar.
  const arp = chords => chords.map(([a, b, c]) => repeat(`${a} ${b} ${c} ${b}`, 4)).join(' ');
  // Root on the beat with the fifth bouncing in between.
  const walk = chords => chords.map(([r, f]) => `${r} . . . ${r} . ${f} . ${r} . . . ${f} . ${r} .`).join(' ');
  // Driving 8th-note octave bass.
  const pump = chords => chords.map(([lo, hi]) => repeat(`${lo} . ${hi} .`, 4)).join(' ');

  const TRACKS = {
    // Easygoing adventure theme in C major: C – Am – F – G – C – Am – Dm – G.
    menu: {
      bpm: 112,
      loop: true,
      parts: [
        {
          wave: 'square', volume: 0.07, pattern: [
            'E5 . . . G5 . . . C6 . . . B5 . A5 .',
            'G5 . . . E5 . . . - - A4 . C5 . E5 .',
            'F5 . . . A5 . . . G5 . F5 . E5 . . .',
            'D5 . . . . . . . G4 . B4 . D5 . . .',
            'E5 . . . G5 . . . C6 . . . D6 . E6 .',
            'C6 . . . A5 . . . E5 . . . A5 . . .',
            'F5 . . . E5 . D5 . A5 . . . G5 . F5 .',
            'D5 . . . . . . . - - B4 . C5 . D5 .',
          ].join(' '),
        },
        {
          wave: 'square', volume: 0.022, pattern: arp([
            ['C4', 'E4', 'G4'], ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['G3', 'B3', 'D4'],
            ['C4', 'E4', 'G4'], ['A3', 'C4', 'E4'], ['D4', 'F4', 'A4'], ['G3', 'B3', 'D4'],
          ]),
        },
        {
          wave: 'triangle', volume: 0.16, pattern: walk([
            ['C3', 'G2'], ['A2', 'E3'], ['F2', 'C3'], ['G2', 'D3'],
            ['C3', 'G2'], ['A2', 'E3'], ['D3', 'A2'], ['G2', 'D3'],
          ]),
        },
      ],
      drums: { volume: 0.7, pattern: repeat('k - h - s - h - k - h - s - h -', 8) },
    },

    // Urgent battle theme in A minor: Am – Am – F – G – Am – Am – F – E.
    battle: {
      bpm: 160,
      loop: true,
      parts: [
        {
          wave: 'square', volume: 0.075, pattern: [
            'A4 . C5 . E5 . A5 . G5 . E5 . C5 . D5 .',
            'E5 . . . . . . . D5 . C5 . B4 . C5 .',
            'A4 . . . F5 . . . E5 . D5 . C5 . A4 .',
            'B4 . . . G5 . . . F5 . E5 . D5 . B4 .',
            'A5 . . . E5 . A5 . C6 . . . B5 . A5 .',
            'G5 . E5 . . . C5 . E5 . G5 . A5 . . .',
            'F5 . . . A5 . . . G5 . F5 . E5 . D5 .',
            'E5 . . . G#5 . . . B5 . . . E5 . . .',
          ].join(' '),
        },
        {
          wave: 'square', volume: 0.025, pattern: arp([
            ['A3', 'C4', 'E4'], ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['G3', 'B3', 'D4'],
            ['A3', 'C4', 'E4'], ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['E3', 'G#3', 'B3'],
          ]),
        },
        {
          wave: 'triangle', volume: 0.18, pattern: pump([
            ['A2', 'A3'], ['A2', 'A3'], ['F2', 'F3'], ['G2', 'G3'],
            ['A2', 'A3'], ['A2', 'A3'], ['F2', 'F3'], ['E2', 'E3'],
          ]),
        },
      ],
      drums: {
        volume: 0.9,
        pattern: `${repeat('k - h - s - h k k - h - s - h h', 7)} k - h - s - h k s - s s s s s s`,
      },
    },

    victory: {
      bpm: 150,
      loop: false,
      parts: [
        { wave: 'square', volume: 0.08, pattern: 'G4 . C5 . E5 . G5 . . . E5 . G5 . . . C6 . . . . . . . . . . . - - - -' },
        { wave: 'square', volume: 0.04, pattern: 'E4 . G4 . C5 . E5 . . . C5 . E5 . . . G5 . . . . . . . . . . . - - - -' },
        { wave: 'triangle', volume: 0.18, pattern: 'C3 . . . . . . . G2 . . . . . . . C3 . . . . . . . . . . . - - - -' },
      ],
      drums: { volume: 0.9, pattern: 'k - - - s - - - k - k - s - - - k - - - - - - - - - - - - - - -' },
    },

    defeat: {
      bpm: 84,
      loop: false,
      parts: [
        { wave: 'square', volume: 0.07, pattern: 'E5 . . . D5 . . . C5 . . . B4 . . . A4 . . . . . . . . . . . - - - -' },
        { wave: 'square', volume: 0.035, pattern: 'C5 . . . B4 . . . A4 . . . G#4 . . . E4 . . . . . . . . . . . - - - -' },
        { wave: 'triangle', volume: 0.18, pattern: 'A2 . . . . . . . F2 . . . E2 . . . A1 . . . . . . . . . . . - - - -' },
      ],
    },
  };

  // ---------- Sequencer ----------

  function parse(pattern, isDrums) {
    const tokens = pattern.trim().split(/\s+/);
    const steps = new Array(tokens.length).fill(null);
    let last = null;
    tokens.forEach((token, i) => {
      if (token === '.') {
        if (last) last.length += 1;
        return;
      }
      last = null;
      if (token === '-') return;
      last = steps[i] = isDrums ? { kind: token } : { freq: freqOf(token), length: 1 };
    });
    return steps;
  }

  const compiled = {};
  function compile(name) {
    if (compiled[name]) return compiled[name];
    const track = TRACKS[name];
    const parts = track.parts.map(p => ({ ...p, steps: parse(p.pattern, false) }));
    const drums = track.drums && { volume: track.drums.volume, steps: parse(track.drums.pattern, true) };
    const length = Math.max(...parts.map(p => p.steps.length), drums?.steps.length ?? 0);
    compiled[name] = { ...track, parts, drums, length };
    return compiled[name];
  }

  let ctx = null;
  let master = null;
  let noise = null;
  let current = null; // { name, bus, timer }
  let wanted = null;
  let enabled = readEnabled();

  function readEnabled() {
    try { return localStorage.getItem(STORAGE_KEY) !== 'false'; } catch { return true; }
  }

  function ensureContext() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    // Takes the edge off raw square waves.
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 7000;
    master.connect(tone).connect(ctx.destination);

    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Browsers only allow audio after a user gesture; resume on the first one.
    const unlock = () => ctx.state === 'suspended' && ctx.resume();
    ['pointerdown', 'keydown'].forEach(type => addEventListener(type, unlock, { capture: true }));
  }

  function playTone(wave, freq, time, duration, volume, out) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.008);
    gain.gain.linearRampToValueAtTime(volume * 0.7, time + duration * 0.6);
    gain.gain.linearRampToValueAtTime(0, time + duration);
    osc.connect(gain).connect(out);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  function playDrum(kind, time, volume, out) {
    const gain = ctx.createGain();
    gain.connect(out);
    if (kind === 'k') {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
      gain.gain.setValueAtTime(0.5 * volume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
      osc.connect(gain);
      osc.start(time);
      osc.stop(time + 0.16);
      return;
    }
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const snare = kind === 's';
    src.buffer = noise;
    filter.type = snare ? 'bandpass' : 'highpass';
    filter.frequency.value = snare ? 1800 : 7000;
    const length = snare ? 0.14 : 0.04;
    gain.gain.setValueAtTime((snare ? 0.22 : 0.06) * volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + length);
    src.connect(filter).connect(gain);
    src.start(time);
    src.stop(time + length + 0.01);
  }

  function scheduleStep(track, step, time, stepDur, out) {
    for (const part of track.parts) {
      const note = part.steps[step];
      if (note) playTone(part.wave, note.freq, time, note.length * stepDur * 0.92, part.volume, out);
    }
    const hit = track.drums?.steps[step];
    if (hit) playDrum(hit.kind, time, track.drums.volume, out);
  }

  function startTrack(name) {
    ensureContext();
    const track = compile(name);
    const bus = ctx.createGain();
    bus.connect(master);
    const stepDur = 60 / track.bpm / 4;
    let step = 0;
    let nextTime = ctx.currentTime + 0.05;

    // Standard lookahead scheduler: a timer queues notes slightly ahead on the audio clock.
    const timer = setInterval(() => {
      // After a stall (e.g. a background tab), skip ahead instead of firing a burst of notes.
      if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.02;
      while (nextTime < ctx.currentTime + LOOKAHEAD) {
        scheduleStep(track, step, nextTime, stepDur, bus);
        nextTime += stepDur;
        step += 1;
        if (step >= track.length) {
          if (!track.loop) {
            clearInterval(timer);
            return;
          }
          step = 0;
        }
      }
    }, TICK_MS);
    current = { name, bus, timer };
  }

  function stopCurrent() {
    if (!current) return;
    const { bus, timer } = current;
    clearInterval(timer);
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    setTimeout(() => bus.disconnect(), 600);
    current = null;
  }

  // ---------- Public API ----------

  function play(name) {
    wanted = name;
    if (current?.name === name) return;
    stopCurrent();
    if (enabled && name) startTrack(name);
  }

  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem(STORAGE_KEY, String(on)); } catch { /* storage unavailable */ }
    if (!on) stopCurrent();
    else if (wanted && !current) startTrack(wanted);
  }

  return {
    play,
    stop: () => play(null),
    isEnabled: () => enabled,
    setEnabled,
    toggle: () => setEnabled(!enabled),
  };
})();
