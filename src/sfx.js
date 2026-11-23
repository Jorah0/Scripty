/* Scripty sound engine: procedural Web Audio sound effects (no audio files needed) + user audio library playback. */
(function (root) {
  'use strict';
  let ctx = null, master = null, volume = 0.8;
  const noiseBufs = {};
  const playingAudio = new Set();
  const R = (a, b) => a + Math.random() * (b - a);

  function ac() {
    if (!ctx) { ctx = new AudioContext(); newMaster(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function newMaster() { master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination); }

  function noiseBuffer(kind) {
    if (noiseBufs[kind]) return noiseBufs[kind];
    const len = ctx.sampleRate * 4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
    }
    return (noiseBufs[kind] = b);
  }

  // Gain envelope: attack -> hold at peak -> exponential release.
  function env(t, attack, peak, release, hold) {
    const g = ctx.createGain(), p = Math.max(peak, 0.0002), a = Math.max(attack, 0.002);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p, t + a);
    g.gain.setValueAtTime(p, t + a + (hold || 0));
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + (hold || 0) + Math.max(release, 0.005));
    return g;
  }
  const endOf = (t, o, dur) => t + (o.attack != null ? o.attack : 0.005) + (o.hold || 0) + (o.release != null ? o.release : dur) + 0.05;

  function nz(t, dur, o) {
    o = o || {};
    t = Math.max(t, ctx.currentTime); // recipes add random jitter; never schedule in the past
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(o.color || 'white'); src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, t + dur);
    f.Q.value = o.q != null ? o.q : 1;
    const g = env(t, o.attack != null ? o.attack : 0.005, o.gain != null ? o.gain : 0.5, o.release != null ? o.release : dur, o.hold);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 3); src.stop(endOf(t, o, dur));
  }

  function tone(t, dur, o) {
    o = o || {};
    t = Math.max(t, ctx.currentTime);
    const osc = ctx.createOscillator();
    osc.type = o.wave || 'sine';
    osc.frequency.setValueAtTime(o.freq || 440, t);
    if (o.freqTo) osc.frequency.exponentialRampToValueAtTime(o.freqTo, t + (o.sweep || dur));
    if (o.detune) osc.detune.value = o.detune;
    let node = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
    const g = env(t, o.attack != null ? o.attack : 0.005, o.gain != null ? o.gain : 0.3, o.release != null ? o.release : dur, o.hold);
    node.connect(g); g.connect(master);
    osc.start(t); osc.stop(endOf(t, o, dur));
  }

  // Each recipe schedules nodes starting at t and returns its length in seconds.
  const RECIPES = {
    rain(t) { nz(t, 4, { color: 'pink', filter: 'highpass', freq: 900, q: 0.5, attack: 0.6, hold: 2.4, release: 1, gain: 0.35 });
      for (let i = 0; i < 50; i++) tone(t + R(0, 3.8), 0.03, { freq: R(1800, 4200), freqTo: R(900, 1500), gain: R(0.02, 0.07), release: 0.03 }); return 4; },
    thunder(t) { nz(t, 0.25, { filter: 'bandpass', freq: 1200, q: 0.6, gain: 0.5, release: 0.3 });
      nz(t + 0.05, 3.5, { color: 'brown', filter: 'lowpass', freq: 300, freqTo: 60, q: 0.7, attack: 0.08, gain: 1, release: 3.4 }); return 3.7; },
    wind(t) { nz(t, 4, { color: 'pink', filter: 'bandpass', freq: 350, freqTo: 900, q: 2.5, attack: 1.2, hold: 1.3, release: 1.5, gain: 0.6 });
      nz(t + 0.8, 3, { color: 'pink', filter: 'bandpass', freq: 700, freqTo: 300, q: 4, attack: 1, hold: 0.5, release: 1.5, gain: 0.3 }); return 4; },
    ocean(t) { for (let i = 0; i < 2; i++) {
      nz(t + i * 2.2, 2.4, { color: 'brown', filter: 'lowpass', freq: 500, freqTo: 1500, q: 0.5, attack: 1, hold: 0.2, release: 1.3, gain: 0.9 });
      nz(t + i * 2.2 + 0.9, 1.2, { filter: 'highpass', freq: 2500, q: 0.5, attack: 0.3, release: 0.9, gain: 0.08 }); } return 4.6; },
    water(t) { for (let i = 0; i < 14; i++) tone(t + R(0, 2), 0.08, { freq: R(250, 500), freqTo: R(700, 1400), sweep: 0.06, gain: R(0.08, 0.18), release: 0.07 }); return 2.2; },
    fire(t) { nz(t, 3.5, { color: 'brown', filter: 'lowpass', freq: 450, q: 0.5, attack: 0.4, hold: 2.4, release: 0.7, gain: 0.5 });
      for (let i = 0; i < 45; i++) nz(t + R(0, 3.4), 0.02, { filter: 'highpass', freq: R(1500, 4000), q: 0.7, gain: R(0.1, 0.45), release: R(0.01, 0.04) }); return 3.6; },
    birds(t) { let x = t; for (let n = 0; n < 5; n++) { const base = R(2400, 3800), reps = Math.floor(R(2, 5));
      for (let i = 0; i < reps; i++) { tone(x, 0.09, { freq: base, freqTo: base * R(1.2, 1.6), sweep: 0.07, gain: 0.12, release: 0.08 }); x += 0.11; } x += R(0.2, 0.6); } return x - t; },
    knock(t) { for (let i = 0; i < 3; i++) { const s = t + i * 0.24;
      nz(s, 0.1, { color: 'brown', filter: 'lowpass', freq: 700, q: 1, gain: 1.2, release: 0.12 }); tone(s, 0.12, { freq: 140, freqTo: 90, gain: 0.5, release: 0.12 }); } return 0.8; },
    door(t) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t);
      for (let i = 1; i <= 12; i++) o.frequency.linearRampToValueAtTime(R(70, 160), t + i * 0.12);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 6;
      const g = env(t, 0.1, 0.35, 0.5, 1.0); o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + 1.7);
      nz(t + 1.55, 0.3, { color: 'brown', filter: 'lowpass', freq: 300, gain: 1.1, release: 0.35 }); return 2; },
    footsteps(t) { for (let i = 0; i < 6; i++) { const s = t + i * 0.45 + R(-0.03, 0.03);
      nz(s, 0.12, { color: 'brown', filter: 'lowpass', freq: 500, gain: 1, release: 0.12 }); nz(s + 0.02, 0.06, { filter: 'highpass', freq: 2500, gain: 0.12, release: 0.06 }); } return 2.8; },
    tap(t) { let s = t; for (let i = 0; i < 10; i++) { nz(s, 0.04, { filter: 'bandpass', freq: R(2000, 3200), q: 3, gain: 0.9, release: 0.04 });
      tone(s, 0.05, { freq: R(700, 900), gain: 0.12, release: 0.05 }); s += R(0.11, 0.2); } return s - t + 0.1; },
    crinkle(t) { for (let i = 0; i < 90; i++) nz(t + R(0, 1.8), 0.02, { filter: 'highpass', freq: R(3000, 7000), q: 0.8, gain: R(0.05, 0.4), release: R(0.005, 0.03) }); return 1.9; },
    paper(t) { nz(t, 0.5, { color: 'pink', filter: 'bandpass', freq: 1200, freqTo: 4500, q: 0.8, attack: 0.15, release: 0.35, gain: 0.7 });
      nz(t + 0.42, 0.12, { color: 'brown', filter: 'lowpass', freq: 600, gain: 0.4, release: 0.12 }); return 0.7; },
    brush(t) { for (let i = 0; i < 4; i++) nz(t + i * 0.5, 0.45, { color: 'pink', filter: 'bandpass', freq: R(2500, 4000), q: 0.7, attack: 0.2, release: 0.25, gain: 0.6 }); return 2.1; },
    scratch(t) { for (let i = 0; i < 8; i++) nz(t + i * 0.18, 0.14, { filter: 'bandpass', freq: R(3500, 5500), freqTo: R(2500, 4000), q: 2, attack: 0.03, release: 0.11, gain: 0.5 }); return 1.6; },
    breath(t) { nz(t, 1.2, { color: 'pink', filter: 'bandpass', freq: 900, freqTo: 1400, q: 0.6, attack: 0.9, release: 0.4, gain: 0.4 });
      nz(t + 1.4, 1.6, { color: 'pink', filter: 'bandpass', freq: 1300, freqTo: 700, q: 0.6, attack: 0.2, release: 1.3, gain: 0.35 }); return 3; },
    pen(t) { for (let i = 0; i < 16; i++) nz(t + i * 0.09 + R(0, 0.03), 0.08, { filter: 'bandpass', freq: R(4000, 7000), q: 3, attack: 0.02, release: 0.06, gain: 0.35 }); return 1.6; },
    typing(t) { let s = t; for (let i = 0; i < 22; i++) { nz(s, 0.03, { filter: 'bandpass', freq: R(2500, 4500), q: 2, gain: 0.6, release: 0.03 });
      tone(s, 0.03, { wave: 'square', freq: R(180, 260), gain: 0.03, release: 0.02 }); s += R(0.06, 0.16); } return s - t; },
    click(t) { nz(t, 0.02, { filter: 'highpass', freq: 2000, gain: 0.8, release: 0.02 }); tone(t, 0.03, { wave: 'square', freq: 1500, gain: 0.08, release: 0.02 }); return 0.15; },
    beep(t) { for (let i = 0; i < 3; i++) tone(t + i * 0.3, 0.18, { wave: 'square', freq: 880, gain: 0.12, hold: 0.15, release: 0.03, lp: 3000 }); return 0.95; },
    phone(t) { for (let r = 0; r < 2; r++) { const s = t + r * 1.1;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 20;
      const am = ctx.createGain(); am.gain.value = 0.5; const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain);
      const g = env(s, 0.01, 0.25, 0.05, 0.8); am.connect(g); g.connect(master);
      for (const f of [440, 480]) { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(am); o.start(s); o.stop(s + 0.9); }
      lfo.start(s); lfo.stop(s + 0.9); } return 2.1; },
    camera(t) { nz(t, 0.04, { filter: 'bandpass', freq: 3000, q: 1, gain: 0.9, release: 0.04 }); nz(t + 0.09, 0.06, { filter: 'bandpass', freq: 1800, q: 1, gain: 0.7, release: 0.06 }); return 0.3; },
    static(t) { for (let i = 0; i < 15; i++) nz(t + i * 0.1, 0.1, { filter: 'bandpass', freq: R(1500, 4000), q: 0.5, gain: R(0.1, 0.45), hold: 0.08, release: 0.02 }); return 1.6; },
    whoosh(t) { nz(t, 0.8, { color: 'pink', filter: 'bandpass', freq: 300, freqTo: 3500, q: 1.5, attack: 0.35, release: 0.45, gain: 0.9 }); return 0.9; },
    pop(t) { tone(t, 0.08, { freq: 900, freqTo: 150, sweep: 0.06, gain: 0.5, release: 0.08 }); return 0.2; },
    ding(t) { tone(t, 1.6, { freq: 1318.5, gain: 0.3, release: 1.6 }); tone(t, 1.2, { freq: 2637, gain: 0.08, release: 1 }); tone(t, 0.8, { freq: 3951, gain: 0.03, release: 0.6 }); return 1.7; },
    success(t) { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { tone(t + i * 0.09, 0.5, { wave: 'triangle', freq: f, gain: 0.22, release: 0.5 }); tone(t + i * 0.09, 0.4, { freq: f * 2, gain: 0.05, release: 0.35 }); });
      for (let i = 0; i < 10; i++) tone(t + 0.35 + R(0, 0.6), 0.2, { freq: R(2500, 5000), gain: 0.04, release: 0.2 }); return 1.3; },
    boom(t) { nz(t, 2.2, { color: 'brown', filter: 'lowpass', freq: 400, freqTo: 60, q: 0.7, attack: 0.01, gain: 1.4, release: 2.2 }); tone(t, 1.5, { freq: 70, freqTo: 30, sweep: 1.2, gain: 0.7, release: 1.5 }); return 2.3; },
    glass(t) { for (let k = 0; k < 2; k++) { const s = t + k * 0.18;
      [2600, 3900, 5300].forEach((f, i) => tone(s, 0.9, { freq: f * R(0.98, 1.02), gain: 0.12 / (i + 1), release: 0.9 - i * 0.2 }));
      nz(s, 0.02, { filter: 'highpass', freq: 5000, gain: 0.3, release: 0.02 }); } return 1.2; },
    heartbeat(t) { for (let i = 0; i < 4; i++) { const s = t + i * 0.85;
      tone(s, 0.15, { freq: 65, freqTo: 45, gain: 0.9, release: 0.15, lp: 200 }); tone(s + 0.22, 0.15, { freq: 55, freqTo: 40, gain: 0.65, release: 0.15, lp: 200 }); } return 3.5; },
    clock(t) { for (let i = 0; i < 8; i++) nz(t + i * 0.5, 0.03, { filter: 'bandpass', freq: i % 2 ? 2200 : 3200, q: 4, gain: 0.8, release: 0.03 }); return 4; },
    zipper(t) { let s = t; for (let i = 0; i < 70; i++) { nz(s, 0.006, { filter: 'highpass', freq: 3000, gain: 0.35, release: 0.006 }); s += 0.004 + i * 0.00012; } return s - t + 0.1; },
    splash(t) { nz(t, 1, { filter: 'lowpass', freq: 5000, freqTo: 800, q: 0.5, attack: 0.01, gain: 0.8, release: 1 });
      for (let i = 0; i < 10; i++) tone(t + R(0.2, 1.2), 0.06, { freq: R(300, 600), freqTo: R(800, 1500), gain: 0.08, release: 0.06 }); return 1.4; },
    applause(t) { for (let i = 0; i < 260; i++) { const s = t + R(0, 3), fade = s - t > 2.2 ? (3 - (s - t)) / 0.8 : 1;
      nz(s, 0.03, { filter: 'bandpass', freq: R(900, 2500), q: 1, gain: R(0.15, 0.4) * fade, release: R(0.02, 0.05) }); } return 3.1; },
    crowd(t) { for (let i = 0; i < 6; i++) nz(t + R(0, 0.5), 3, { color: 'pink', filter: 'bandpass', freq: R(350, 1400), q: R(3, 8), attack: R(0.4, 1), hold: R(0.5, 1.5), release: 0.8, gain: R(0.3, 0.6) }); return 3.4; },
    engine(t) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(40, t);
      o.frequency.linearRampToValueAtTime(75, t + 1.5); o.frequency.linearRampToValueAtTime(55, t + 3);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lg = ctx.createGain(); lg.gain.value = 4; lfo.connect(lg); lg.connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
      const g = env(t, 0.4, 0.35, 0.6, 2); o.connect(f); f.connect(g); g.connect(master);
      o.start(t); lfo.start(t); o.stop(t + 3.1); lfo.stop(t + 3.1); return 3.1; },
    drumroll(t) { let s = t; for (let i = 0; i < 48; i++) { nz(s, 0.05, { filter: 'bandpass', freq: 1800, q: 0.8, gain: 0.25 + i * 0.008, release: 0.05 }); s += Math.max(0.035, 0.07 - i * 0.001); }
      nz(s, 1.8, { filter: 'highpass', freq: 5000, q: 0.5, gain: 0.6, release: 1.8 }); tone(s, 0.3, { freq: 120, freqTo: 60, gain: 0.6, release: 0.3 }); return s - t + 1.8; },
    rimshot(t) { tone(t, 0.15, { freq: 180, freqTo: 140, gain: 0.5, release: 0.15 }); nz(t, 0.05, { filter: 'bandpass', freq: 1500, gain: 0.3, release: 0.05 });
      tone(t + 0.18, 0.18, { freq: 120, freqTo: 90, gain: 0.55, release: 0.18 }); nz(t + 0.18, 0.05, { filter: 'bandpass', freq: 1200, gain: 0.3, release: 0.05 });
      nz(t + 0.42, 0.9, { filter: 'highpass', freq: 6000, q: 0.5, gain: 0.5, release: 0.9 }); return 1.4; },
    pad(t) { [220, 261.63, 329.63, 392].forEach((f, i) => {
      tone(t + i * 0.05, 4, { wave: 'triangle', freq: f, gain: 0.09, attack: 1.2, hold: 1.6, release: 1.4, lp: 1800, detune: R(-6, 6) });
      tone(t + i * 0.05, 4, { freq: f * 2, gain: 0.03, attack: 1.4, hold: 1.2, release: 1.4 }); }); return 4.3; },
    stinger(t) { [73.4, 110, 146.8, 174.6].forEach(f => tone(t, 2.4, { wave: 'sawtooth', freq: f, gain: 0.12, attack: 0.02, hold: 0.6, release: 1.8, lp: 900 }));
      nz(t, 2, { color: 'brown', filter: 'lowpass', freq: 200, gain: 0.9, release: 2 }); return 2.5; },
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function fileUrl(p) { return 'file:///' + encodeURI(String(p).replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F'); }

  function playFile(entry, maxSeconds) {
    return new Promise(resolve => {
      const a = new Audio(fileUrl(entry.path));
      a.volume = Math.min(1, volume * (entry.volume || 1));
      playingAudio.add(a);
      let timer = null;
      const done = () => { clearTimeout(timer); playingAudio.delete(a); resolve(); };
      a.onended = done; a.onerror = done; a.onpause = done;
      if (maxSeconds) timer = setTimeout(() => { a.pause(); }, maxSeconds * 1000);
      a.play().catch(done);
    });
  }

  const Sound = {
    has: id => !!RECIPES[id],
    /** Play a built-in sound id or a library entry. Resolves when it finishes (capped at maxSeconds). */
    play(target, maxSeconds) {
      if (target && typeof target === 'object' && target.path) return playFile(target, maxSeconds);
      const id = typeof target === 'object' && target ? target.id : target;
      const recipe = RECIPES[id];
      if (!recipe) return Promise.resolve();
      ac();
      const dur = recipe(ctx.currentTime + 0.02);
      return sleep(Math.min(dur, maxSeconds || dur) * 1000);
    },
    /** Match a cue label to a sound and play it. Returns { sound, done } or null when nothing matches. */
    playCue(label, library, override, maxSeconds) {
      const K = root.ScriptKit;
      let sound = null;
      if (override) sound = (library || []).find(s => s.id === override) || K.BUILTIN_SOUNDS.find(s => s.id === override) || null;
      if (!sound) sound = K.matchSound(label, library || [], K.BUILTIN_SOUNDS);
      if (!sound) return null;
      return { sound, done: Sound.play(sound, maxSeconds) };
    },
    setVolume(v) { volume = Math.max(0, Math.min(1, Number(v))); if (master) master.gain.value = volume; },
    stopAll() {
      for (const a of playingAudio) a.pause();
      playingAudio.clear();
      if (ctx && master) { master.disconnect(); newMaster(); } // orphan every scheduled node at once
    },
    selfTest() { ac(); const v = volume; Sound.setVolume(0); for (const id of Object.keys(RECIPES)) RECIPES[id](ctx.currentTime + 0.01); Sound.stopAll(); Sound.setVolume(v); return Object.keys(RECIPES).length; },
    ids: () => Object.keys(RECIPES),
  };
  root.Sound = Sound;
})(window);
