/* Full experience · the soundtrack. An original synthwave / dark synth-pop score, generated in code with the Web Audio
   API: no audio files, no samples, no third-party music. Key of C minor, 128 BPM (the film is cut on this bar grid).
   - drums, like an 80s drum machine: a punchy kick (sine pitch drop + click), a big snare (noise + tonal body) with
     hand claps layered on it, both into a GATED REVERB (a generated dense impulse that is cut off dead at ~0.26 s),
     crisp sixteenth hi-hats with a little swing (open hats choke the closed ones), toms through the same gate;
   - bass: driving eighth notes jumping octaves, saw + square through a resonant low-pass with a snappy filter
     envelope, locked to the kick;
   - pads: wide detuned saw chords with a slow attack, through a stereo chorus (two LFO-modulated short delays);
   - arpeggios: sixteenth-note plucks through a dotted-eighth ping-pong delay; the lead for the finale: saw + square,
     portamento, a brassy filter envelope and a delayed vibrato;
   - FX: filtered-noise risers, reverse swells (a reversed chord + a reversed cymbal), sub drops, and a TAPE STOP for
     the crash test: the whole band passes through a delay line whose delay time is bent so playback slows to zero.
   The arrangement (score() below) follows the film: sections on the bar grid plus timed events. A look-ahead scheduler
   places every note on the AudioContext clock ~0.4 s ahead, so only a few voices exist at once; every voice
   disconnects itself when it ends; nothing is scheduled while paused, muted, hidden or closed.
   Mix: gentle tape-style saturation -> glue compressor -> limiter -> safety soft-clip, so nothing ever clips. */

export const BPM = 128;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const S16 = BEAT / 4;
const AHEAD = 0.4;       // seconds of music scheduled ahead of the film clock (survives a busy main thread)
const TICK_MS = 50;      // scheduler wake-up (tab hidden or paused: no wake-ups at all)
const SWING = 0.11 * S16;   // the off 16ths of the hats land ~13 ms late: a little swing
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const LONG = { hit: 1, final: 1, lead: 1, riser: 1, swell: 1, lp: 1, arpf: 1, sweep: 1, kill: 1, crash: 1, fill: 1 };

/* the harmony: an original palette in C minor. r = bass root (MIDI), p = pad voicing (MIDI, Eb4..D5, smooth voice leading) */
export const CH = {
  Cm9: { r: 36, p: [63, 67, 70, 74] },      // C  · Eb G Bb D
  Abmaj9: { r: 32, p: [63, 67, 70, 72] },   // Ab · Eb G Bb C
  Fm9: { r: 29, p: [63, 67, 68, 72] },      // F  · Eb G Ab C
  Gsus: { r: 31, p: [62, 65, 67, 72] },     // G  · D F G C
  Gm7: { r: 31, p: [62, 65, 67, 70] },      // G  · D F G Bb
  Bbadd9: { r: 34, p: [62, 65, 70, 72] },   // Bb · D F Bb C
  Dbmaj9: { r: 37, p: [63, 65, 68, 72] },   // Db · Eb F Ab C
  Ebmaj9: { r: 39, p: [62, 65, 67, 70] },   // Eb · D F G Bb
};
// arpeggio shapes: indexes into the chord's pad notes an octave up (4, 5 = another octave up)
const ARP = {
  up: [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5, 4, 3],
  climb: [0, 2, 1, 3, 2, 4, 3, 5, 4, 2, 3, 1, 2, 0, 1, 3],
  fall: [4, 3, 2, 1, 0, 1, 2, 3, 5, 4, 3, 2, 1, 2, 3, 1],
  pulse: [0, 2, 1, 3, 0, 2, 1, 4],
};

/* ------------------------------------------------------------------ the arrangement, on the film's bar grid */
// F: { segs, route, finaleT, DUR, KILL, CRASH, BACK } from film.js. Returns { sections, events, end } for setMusic().
export function score(F) {
  const { segs, route, finaleT, DUR, KILL, CRASH, BACK } = F;
  const b = (bar, beat) => bar * BAR + (beat || 0) * BEAT;
  const M = { sections: [], events: [], end: 0 };
  const sec = (t, bars, kind, o) => M.sections.push(Object.assign({ t, bars, kind }, o || {}));
  const ev = (t, k, o) => M.events.push(Object.assign({ t, k }, o || {}));
  const PROG = { answered: ['Cm9', 'Abmaj9', 'Fm9', 'Gsus'], booked: ['Abmaj9', 'Bbadd9', 'Cm9', 'Gm7'], measured: ['Fm9', 'Cm9', 'Dbmaj9', 'Gsus'], alwayson: ['Cm9', 'Cm9', 'Abmaj9', 'Bbadd9'] };
  const ARPS = { answered: 'up', booked: 'climb', measured: 'fall' };
  const first = (id) => (id ? PROG[id][0] : 'Abmaj9');

  // plan: filtered pads and an arpeggio that slowly opens up, a kick pulse, a snare build, a reverse swell into the first hit
  sec(0, 3, 'intro', { chords: ['Abmaj9', 'Abmaj9', 'Bbadd9'] });
  ev(0, 'lp', { f0: 700, f1: 9000, d: 3 * BAR - 0.05 });
  ev(0, 'arpf', { f0: 420, f1: 4600, d: 3 * BAR });
  ev(0.01, 'whoosh', { d: 1.3, v: 0.14 });
  ev(BAR * 1.5, 'riser', { d: BAR * 1.5, v: 0.12 });
  ev(3 * BAR - BEAT * 2, 'swell', { d: BEAT * 2, ch: 'Cm9' });
  // opening titles: the first big hit and the groove; "Four demos." on a stab, "All real." on a hit
  const o = DUR.plan;
  ev(o, 'lp', { f0: 20000, f1: 20000, d: 0 });
  ev(o, 'hit', { ch: 'Cm9', size: 3 });
  sec(o, 3, 'open', { chords: ['Cm9', 'Abmaj9', 'Bbadd9'], fillLast: true, skip: [0, 24, 32] });
  ev(o + b(1, 2), 'stab', { ch: 'Abmaj9' });
  ev(o + b(2), 'hit', { ch: 'Bbadd9', size: 2 });
  ev(o + DUR.open - BEAT * 2, 'swell', { d: BEAT * 2, ch: first(route[0]) });

  // the stations: each title card gets a hit, a snare fill and a filter sweep; the groove sits under the narration
  segs.filter((s) => s.kind === 'station').forEach((s) => {
    const t0 = s.t0, id = s.id, ch = PROG[id], lvl = Math.min(3, 1 + s.index);
    const at = (bar) => ch[bar % ch.length];
    ev(t0, 'hit', { ch: ch[0], size: s.index === 0 ? 3 : 2 });
    ev(t0 + 0.03, 'whoosh', { d: 1.7, v: 0.13 });
    if (id === 'alwayson') {
      // the deploy: a driving build, the filter rising towards the crash test
      ev(t0 + BEAT * 1.5, 'sweep', { lo: 520, open: BAR - BEAT * 1.5, d: KILL - BAR - 0.1, hi: 16000 });
      sec(t0, 4, 'build', { chords: ch, skip: [0] });
      // the crash test: the downbeat starts, the tape stops under it, silence and the countdown; then the app comes back
      ev(t0 + KILL, 'kill', { ch: 'Cm9', back: CRASH - 1.25 });
      for (let k = 1; k < CRASH; k++) ev(t0 + KILL + k, 'tick', { v: 0.55 + k * 0.07 });
      ev(t0 + BACK - 1.6, 'riser', { d: 1.6, v: 0.15 });
      ev(t0 + BACK - BEAT * 2, 'swell', { d: BEAT * 2, ch: 'Cm9' });
      ev(t0 + BACK - 8 * S16, 'fill', { n: 8, kind: 'toms' });
      ev(t0 + BACK, 'hit', { ch: 'Cm9', size: 3, drop: true });
      sec(t0 + BACK, 3, 'back', { chords: ['Cm9', 'Fm9', 'Gsus'], fillLast: true, skip: [0] });
      return;
    }
    ev(t0 + BEAT * 1.5, 'sweep', { lo: 380, open: BAR - BEAT * 1.5, d: BAR, hi: 16000 });
    const skip = [];
    if (id === 'answered') {
      ev(t0 + b(3, 2), 'ping', { f: 1568, v: 0.07 });                                   // the cited section lights up
      ev(t0 + b(5, 2), 'stab', { ch: at(5), v: 0.9 }); skip.push(5 * 16 + 8);          // not in the guide: hand-off
    } else if (id === 'booked') {
      ev(t0 + b(2, 2), 'ping', { f: 1046.5, v: 0.06 });                                 // €49
      ev(t0 + b(3), 'ping', { f: 1174.66, v: 0.06 });                                   // + €49
      ev(t0 + b(3, 1), 'ping', { f: 1396.91, v: 0.06 });                                // + €8
      ev(t0 + b(3, 2), 'stab', { ch: at(3) }); skip.push(3 * 16 + 8);                  // = €106
      ev(t0 + b(5, 2), 'ping', { f: 1864.66, v: 0.07 }); ev(t0 + b(5, 2) + 0.12, 'ping', { f: 2349.32, v: 0.05 });   // the owner's Telegram
    } else if (id === 'measured') {
      ev(t0 + b(6), 'hit', { ch: at(6), size: 2 }); skip.push(6 * 16);                  // done: 1,000 books
    }
    const nextId = route[s.index + 1];
    sec(t0, 8, 'verse', { chords: ch, lvl, arp: ARPS[id], skip, noEndFill: nextId === undefined });
    ev(t0 + DUR[id] - BEAT * 2, 'swell', { d: BEAT * 2, ch: first(nextId) });
  });

  // finale: the four words on rising hits, a snare fill, then the chorus with the lead hook; the last chord rings out
  const f = finaleT, WORDS = ['Abmaj9', 'Bbadd9', 'Cm9', 'Ebmaj9'];
  sec(f, 2, 'words', { chords: WORDS });
  WORDS.forEach((c, i) => ev(f + i * BEAT * 2, 'hit', { ch: c, size: i === 3 ? 2 : 1 }));
  ev(f + b(1, 2), 'fill', { n: 8, kind: 'snare' });
  ev(f + b(2), 'hit', { ch: 'Abmaj9', size: 3 });
  sec(f + b(2), 4, 'anthem', { chords: ['Abmaj9', 'Bbadd9', 'Gm7', 'Cm9'], fillLast: true, skip: [0] });
  // the hook (16th-note grid): a rising three-note figure, answered, sequenced a step down, resolved; the last note rings over the final chord
  const HOOK = [[0, 72, 3], [3, 75, 3], [6, 79, 4], [10, 77, 2], [12, 75, 4],
    [16, 74, 3], [19, 77, 3], [22, 82, 6], [28, 79, 2], [30, 77, 2],
    [32, 70, 3], [35, 74, 3], [38, 77, 4], [42, 75, 2], [44, 74, 4],
    [48, 75, 3], [51, 74, 3], [54, 72, 10], [64, 79, 26]];
  ev(f + b(2), 'lead', { notes: HOOK.map(([s, m, l]) => [s * S16, m, l * S16 - 0.025]) });
  ev(f + b(6), 'final', { ch: 'Abmaj9' });
  M.end = f + b(6) + 5;
  return M;
}

function silentAudio() {
  const noop = () => {};
  return { ok: false, ctx: null, setMusic: noop, startQuestion: noop, startFilm: () => 0, pause: noop, resume: noop, setMuted: noop, duck: noop, ui: noop,
    jump: noop, stopFilm: noop, idle: noop, fadeOutAndClose: () => Promise.resolve(), scheduleAll: noop, voices: () => 0, debugTap: () => null, clock: () => null };
}

export function createAudio(ctx, opt) {
  if (!ctx) return silentAudio();
  opt = opt || {};
  const calm = !!opt.calm, offline = !!opt.offline;
  const safe = (p) => { if (p && typeof p.catch === 'function') p.catch(() => {}); };   // resume/suspend/close return promises: never leave one unhandled
  if (!offline && ctx.state === 'suspended') safe(ctx.resume());

  /* ------------------------------------------------------------------ the graph (built once) */
  const G = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const F = (type, f, q, gain) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q != null) n.Q.value = q; if (gain != null) n.gain.value = gain; return n; };
  const P = (p) => { if (!ctx.createStereoPanner) return G(1); const n = ctx.createStereoPanner(); n.pan.value = p; return n; };
  const chain = (...ns) => { for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]); return ns[ns.length - 1]; };
  const comp = (th, knee, ratio, att, rel) => { const c = ctx.createDynamicsCompressor(); c.threshold.value = th; c.knee.value = knee; c.ratio.value = ratio; c.attack.value = att; c.release.value = rel; return c; };

  // master: gentle saturation -> glue compressor -> limiter -> safety soft-clip (never above 0.98) -> trim
  const master = G(0);
  const sat = ctx.createWaveShaper(); sat.curve = satCurve(calm ? 0.7 : 1.15); sat.oversample = '2x';
  const glue = comp(-18, 10, 1.8, 0.03, 0.3);
  const limit = comp(-8, 0, 20, 0.001, 0.06);
  const clip = ctx.createWaveShaper(); clip.curve = softClip();
  const trim = G(calm ? 0.85 : 1);
  if (opt.stage === 'raw') chain(master, trim);
  else if (opt.stage === 'pre') chain(master, sat, glue, trim);   // tests only: measure before the limiter / before the clipper
  else if (opt.stage === 'lim') chain(master, sat, glue, limit, trim);
  else chain(master, sat, glue, limit, clip, trim);
  trim.connect(ctx.destination);

  // music: band -> narration duck -> band low-pass (the intro behind a wall) -> tape (the crash test's tape stop) -> master
  const band = G(1), duckG = G(1), bandLP = F('lowpass', 20000, 0.7), tape = ctx.createDelay(1.5), tapeG = G(1), music = G(calm ? 0.6 : 0.66);
  tape.delayTime.value = 0;
  chain(band, duckG, bandLP, tape, tapeG, music, master);
  const sfx = G(calm ? 0.35 : 0.5); sfx.connect(master);
  // the synths (pads, bass, arps, effect returns) pass one more low-pass: the title cards' filter sweeps
  const synth = G(1), synthLP = F('lowpass', 20000, 1.6); chain(synth, synthLP, band);

  // hall reverb (generated impulse) for pads, arps and lead; the gated reverb for snare, claps and toms
  const hall = ctx.createConvolver();
  const hallIn = G(1), hallHP = F('highpass', 260, 0.7), hallOut = G(calm ? 1.5 : 1.25); chain(hallIn, hallHP, hall, hallOut, synth);
  const gate = ctx.createConvolver();
  // the impulses are generated after the click's frame, one small task each (a slow phone keeps animating the cold open);
  // until they arrive the dark question pads simply play dry
  const hallBuf = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 2.4), ctx.sampleRate);
  const lpState = [0, 0];   // each channel's low-pass memory, carried from one half to the next
  const irJobs = [() => { gate.buffer = gateIR(ctx); }, hallIR(hallBuf, 0, 0, lpState), hallIR(hallBuf, 0, 1, lpState), hallIR(hallBuf, 1, 0, lpState), hallIR(hallBuf, 1, 1, lpState), () => { hall.buffer = hallBuf; }];
  if (offline) irJobs.forEach((j) => j());
  else (function next() { const j = irJobs.shift(); if (!j) return; setTimeout(() => { try { if (ctx.state !== 'closed') j(); } catch (e) { /* closed */ } next(); }, 40); })();
  const gateIn = G(1), gateHP = F('highpass', 320, 0.7), gateOut = G(calm ? 2 : 4);   // a normalised 0.25 s impulse is ~17 dB quieter than its input

  // dotted-eighth ping-pong delay (arps, lead, pings): left, then right, then left...
  const dIn = G(1), dHP = F('highpass', 300, 0.6), dLP = F('lowpass', 3600, 0.5), dL = ctx.createDelay(1), dR = ctx.createDelay(1);
  dL.delayTime.value = dR.delayTime.value = BEAT * 0.75;
  const dX = G(0.78), dFb = G(0.52), dMerge = ctx.createChannelMerger(2), dOut = G(calm ? 0.66 : 0.6);
  chain(dIn, dHP, dLP, dL); chain(dL, dX, dR); chain(dR, dFb, dL);
  dL.connect(dMerge, 0, 0); dR.connect(dMerge, 0, 1); chain(dMerge, dOut, synth);

  // drums
  // drum bus: an 80s-style bus compressor (fast, 4:1) tames the kick and snare peaks and pulls up the room
  const drums = G(calm ? 0.36 : 0.7), drumComp = comp(-12, 6, 4, 0.003, 0.12); chain(drums, drumComp, band);
  const kickBus = G(calm ? 0.8 : 1); kickBus.connect(drums);
  const clickHP = F('highpass', 2800, 0.7); clickHP.connect(kickBus);
  const snBus = G(1); snBus.connect(drums);
  const snSend = G(1); snBus.connect(snSend); snSend.connect(gateIn);
  const snBP = F('bandpass', 1800, 0.55), snHP = F('highpass', 380, 0.7); chain(snBP, snHP, snBus);
  const clapBP = F('bandpass', 1150, 1.1), clapHP = F('highpass', 600, 0.7), clapBus = G(1); chain(clapBP, clapHP, clapBus, drums);
  const clapSend = G(0.9); clapBus.connect(clapSend); clapSend.connect(gateIn);
  chain(gateIn, gateHP, gate, gateOut, drums);
  const hatHP = F('highpass', 7600, 0.7), hatPK = F('peaking', 11000, 0.9, 3), hatPan = P(0.3), hatBus = G(1); chain(hatHP, hatPK, hatPan, hatBus, drums);
  const cymHP = F('highpass', 4200, 0.6), cymPK = F('peaking', 8000, 0.7, 4), cymBus = G(1), cymPan = P(-0.2); chain(cymHP, cymPK, cymBus, cymPan, drums);
  const cymSend = G(0.18); cymBus.connect(cymSend); cymSend.connect(hallIn);
  const tomPan = [P(0.45), P(0), P(-0.45)], tomBus = G(1), tomSend = G(0.8);
  tomPan.forEach((p) => { p.connect(tomBus); }); tomBus.connect(drums); tomBus.connect(tomSend); tomSend.connect(gateIn);
  const thudLP = F('lowpass', 900, 0.7); thudLP.connect(tomBus);

  // bass: each note has its own resonant low-pass; the bus trims the rumble
  const bassBus = G(1), bassHP = F('highpass', 30, 0.7), bassOut = G(calm ? 0.38 : 0.48); chain(bassBus, bassHP, bassOut, synth);

  // pads: high-passed (the bass owns the low end), then a stereo chorus: dry centre + two LFO-modulated short delays L/R
  const padBus = G(1), padHP = F('highpass', 170, 0.7), padDry = G(0.72); chain(padBus, padHP, padDry, synth);
  const chL = ctx.createDelay(0.05), chR = ctx.createDelay(0.05), chMerge = ctx.createChannelMerger(2), chWet = G(0.62);
  chL.delayTime.value = 0.013; chR.delayTime.value = 0.019;
  padHP.connect(chL); padHP.connect(chR); chL.connect(chMerge, 0, 0); chR.connect(chMerge, 0, 1); chain(chMerge, chWet, synth);
  const lfos = [];
  [[chL, 0.31, 0.0026], [chR, 0.43, 0.0031]].forEach(([d, rate, depth]) => {
    const l = ctx.createOscillator(), lg = G(depth); l.frequency.value = rate; l.connect(lg); lg.connect(d.delayTime); l.start(); lfos.push(l);
  });
  const padSend = G(calm ? 0.7 : 0.6); padHP.connect(padSend); padSend.connect(hallIn);

  // arps: one shared low-pass (the intro opens it), then dry + the delay + a little hall
  const arpBus = G(1), arpLP = F('lowpass', 4600, 2.2), arpOut = G(calm ? 0.7 : 1); chain(arpBus, arpLP, arpOut, synth);
  const arpDly = G(0.55), arpVerb = G(0.3); arpOut.connect(arpDly); arpDly.connect(dIn); arpOut.connect(arpVerb); arpVerb.connect(hallIn);

  // lead: straight to the band (the sweeps are over by the finale), with delay and hall sends
  const leadBus = G(1), leadHP = F('highpass', 220, 0.7), leadPK = F('peaking', 1700, 0.9, 3), leadOut = G(calm ? 0.7 : 1); chain(leadBus, leadHP, leadPK, leadOut, band);
  const leadDly = G(0.34), leadVerb = G(0.3); leadOut.connect(leadDly); leadDly.connect(dIn); leadOut.connect(leadVerb); leadVerb.connect(hallIn);

  // pings (the cited section, the owner's Telegram) and UI sounds go to the sfx bus, with a little delay
  const pingDly = G(0.3); pingDly.connect(dIn);

  const noise = noiseBuffer(ctx, 3);
  if (opt.solo) {   // tests: hear (measure) one instrument group alone
    const groups = { drums: [drums], bass: [bassOut], pads: [padDry, chWet, padSend], arp: [arpOut], lead: [leadOut], sfx: [sfx, pingDly] };   // each keeps its own reverb/delay
    const parts = { kick: [kickBus], snare: [snBus, clapBus], gate: [gateOut], hats: [hatBus], cym: [cymBus], toms: [tomBus] };   // drum parts (dry; 'gate' is the gated reverb return)
    const keep = groups[opt.solo] || (parts[opt.solo] ? [drums].concat(parts[opt.solo]) : []);
    Object.keys(groups).forEach((k) => groups[k].forEach((n) => { if (keep.indexOf(n) < 0) n.gain.value = 0; }));
    if (parts[opt.solo]) Object.keys(parts).forEach((k) => parts[k].forEach((n) => { if (keep.indexOf(n) < 0) n.gain.value = 0; }));
  }

  /* ------------------------------------------------------------------ voices (each cleans up after itself) */
  const voices = new Set();
  function voice(srcs, nodes, end) {   // srcs[0] must be the source that stops last
    const v = { srcs, nodes, end };
    voices.add(v);
    srcs[0].onended = () => { voices.delete(v); for (const n of srcs) { try { n.disconnect(); } catch (e) { /* gone */ } } for (const n of nodes) { try { n.disconnect(); } catch (e) { /* gone */ } } };
    return v;
  }
  function osc(type, f, t) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); return o; }
  function nsrc(t, dur) { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(t, Math.random() * 2.5); s.stop(t + dur); return s; }
  const rnd = (a) => 1 + (Math.random() * 2 - 1) * a;

  /* drums */
  function kick(t, v) {
    const o = osc('sine', 165, t), g = G(0);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.042); o.frequency.exponentialRampToValueAtTime(43, t + 0.34);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.75 * v, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.33 * v, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    chain(o, g, kickBus); o.start(t); o.stop(t + 0.42);
    const c = nsrc(t, 0.012), cg = G(0); cg.gain.setValueAtTime(0.42 * v, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.01);
    chain(c, cg, clickHP);
    voice([o, c], [g, cg], t + 0.42);
  }
  function snare(t, v, withClap) {
    const n = nsrc(t, 0.24), ng = G(0);
    ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.8 * v, t + 0.001); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.21);
    chain(n, ng, snBP);
    const o = osc('triangle', 215, t), og = G(0); o.frequency.exponentialRampToValueAtTime(176, t + 0.05);
    og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.5 * v, t + 0.001); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    chain(o, og, snBus); o.start(t); o.stop(t + 0.14);
    voice([n, o], [ng, og], t + 0.24);
    if (withClap && !calm) clap(t, v);
  }
  function clap(t, v) {   // three quick bursts and a short tail, like a drum machine's clap circuit
    const n = nsrc(t, 0.18), g = G(0), p = g.gain;
    p.setValueAtTime(0.0001, t);
    [0, 0.011, 0.021].forEach((dt) => { p.setValueAtTime(0.6 * v, t + dt); p.exponentialRampToValueAtTime(0.06 * v, t + dt + 0.009); });
    p.setValueAtTime(0.55 * v, t + 0.031); p.exponentialRampToValueAtTime(0.0001, t + 0.16);
    chain(n, g, clapBP); voice([n], [g], t + 0.18);
  }
  let openHat = null;   // an open hat is choked by the next closed one
  function hat(t, v, open) {
    if (openHat && openHat.end > t) { const p = openHat.g.gain; try { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t); p.setTargetAtTime(0.0001, t, 0.006); } catch (e) { /* ended */ } openHat = null; }
    const len = open ? 0.26 : 0.042, n = nsrc(t, len + 0.03), g = G(0);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.42 * v * rnd(0.06), t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    chain(n, g, hatHP); voice([n], [g], t + len + 0.03);
    if (open) openHat = { g, end: t + len };
  }
  function crash(t, v, len) {
    len = len || 2.4;
    const n = nsrc(t, len + 0.05), g = G(0);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.26 * v, t + 0.004); g.gain.setTargetAtTime(0.0001, t + 0.01, len / 5);
    chain(n, g, cymHP); voice([n], [g], t + len + 0.05);
  }
  const TOMF = [196, 155.6, 130.8];   // G3, Eb3, C3: the toms are tuned to the key
  function tom(t, which, v) {
    const f = TOMF[which], o = osc('sine', f * 1.45, t), g = G(0);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03); o.frequency.exponentialRampToValueAtTime(f * 0.78, t + 0.4);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.62 * v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    chain(o, g, tomPan[which]); o.start(t); o.stop(t + 0.44);
    const n = nsrc(t, 0.05), ng = G(0); ng.gain.setValueAtTime(0.22 * v, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    chain(n, ng, thudLP);
    voice([o, n], [g, ng], t + 0.44);
  }

  /* bass: one note = saw + square through its own resonant low-pass with a snappy envelope */
  function bass(t, m, len, v, rel) {
    const f = mtof(m), a = osc('sawtooth', f, t), q = osc('square', f, t), qg = G(0.4), lp = F('lowpass', 200, calm ? 2.5 : 4.5), g = G(0);
    a.detune.value = 4; q.detune.value = -5;
    const top = Math.min(calm ? 1400 : 2600, f * 14 + 700 * v), rest = Math.min(900, f * 2.2 + 140);
    lp.frequency.setValueAtTime(top, t); lp.frequency.setTargetAtTime(rest, t + 0.004, 0.055);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.34 * v, t + 0.004);
    g.gain.setTargetAtTime(0.24 * v, t + 0.005, 0.12); g.gain.setTargetAtTime(0.0001, t + len, rel || 0.018);
    a.connect(lp); q.connect(qg); qg.connect(lp); chain(lp, g, bassBus);
    const stop = t + len + Math.max(0.1, (rel || 0) * 6);
    a.start(t); q.start(t); a.stop(stop); q.stop(stop);
    voice([a, q], [qg, lp, g], stop);
  }

  /* pads: a chord = two detuned saws per note (calm: a saw and a triangle), one gain, one low-pass */
  const DET = calm ? [-6, 6] : [-11, 9];
  function pad(t, name, len, v, o) {
    const c = CH[name]; if (!c) return;
    o = o || {};
    const g = G(0), cut = o.cut || (calm ? 1700 : 2600), lp = F('lowpass', cut, 0.6), oscs = [];
    c.p.forEach((m, i) => DET.forEach((d, j) => {
      if (o.thin && j) return;
      const x = osc(calm && j ? 'triangle' : 'sawtooth', mtof(m), t); x.detune.value = d + (i - 1.5) * 1.4; x.connect(g); oscs.push(x);
    }));
    const att = o.att != null ? o.att : 0.3, rel = o.rel != null ? o.rel : 0.7, peak = 0.024 * v * (o.thin ? 1.6 : 1), p = g.gain;
    p.setValueAtTime(0.0001, t);
    let stop;
    if (o.rev) {   // reversed: swells up and stops dead on the downbeat
      p.exponentialRampToValueAtTime(peak, t + len); p.linearRampToValueAtTime(0.0001, t + len + 0.012);
      lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(cut * 1.6, t + len);
      stop = t + len + 0.03;
    } else {
      p.linearRampToValueAtTime(peak, t + att);
      if (o.stab) p.setTargetAtTime(peak * 0.5, t + att, 0.22);
      p.setTargetAtTime(0.0001, t + len, rel / 4.5);
      if (o.bright) { lp.frequency.setValueAtTime(o.bright, t); lp.frequency.setTargetAtTime(cut, t + 0.01, 0.16); }
      stop = t + len + rel * 1.5 + 0.02;
    }
    chain(g, lp, padBus);
    oscs.forEach((x) => { x.start(t); x.stop(stop); });
    voice(oscs, [g, lp], stop);
  }
  function padRun(sec, chs, bar, t) {   // a pad at the start of a bar, held while the chord repeats
    const ch = at(chs, bar), sk = sec.skip || [];
    if (bar > 0 && at(chs, bar - 1) === ch && sk.indexOf((bar - 1) * 16) < 0) return;   // still ringing from the bar before
    let n = 1; while (bar + n < sec.bars && at(chs, bar + n) === ch && sk.indexOf((bar + n) * 16) < 0) n++;
    pad(t, ch, n * BAR - 0.08, sec.kind === 'anthem' ? 1.15 : sec.kind === 'qloop' ? 0.75 : sec.kind === 'intro' ? 0.7 : 1, { att: sec.kind === 'qloop' || sec.kind === 'intro' ? 0.9 : 0.28, cut: sec.kind === 'anthem' ? (calm ? 2000 : 3400) : undefined });
  }

  /* arps: a short pluck per 16th into the shared filter and the delay */
  function arp(t, m, v) {
    const o = osc(calm ? 'triangle' : 'square', mtof(m), t), g = G(0);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.083 * v, t + 0.003); g.gain.setTargetAtTime(0.0001, t + 0.004, 0.05);
    chain(o, g, arpBus); o.start(t); o.stop(t + 0.3); voice([o], [g], t + 0.3);
  }
  function arpStep(C, pat, s, t, v, every, oct) {
    if (every === 2 && s % 2) return;
    const P = ARP[pat] || ARP.up, idx = P[(every === 2 ? s >> 1 : s) % P.length];
    arp(t, C.p[idx % 4] + 12 * ((oct == null ? 1 : oct) + Math.floor(idx / 4)), (s % 4 === 0 ? 1 : s % 2 ? 0.66 : 0.82) * v);
  }

  /* the lead: one voice per phrase, saw + square, gliding between notes, a brassy filter swell on each attack, vibrato after it */
  function lead(t0, notes, v, from) {
    if (!notes.length) return;
    const st = Math.max(t0, from || t0);
    const f0 = mtof(notes[0][1]), a = osc('sawtooth', f0, t0), q = osc('square', f0, t0), qg = G(0.45), lp = F('lowpass', 900, 1.4), g = G(0);
    a.detune.value = -4; q.detune.value = 5;
    a.connect(lp); q.connect(qg); qg.connect(lp); chain(lp, g, leadBus);
    const lfo = osc('sine', 5.4, t0), lg = G(0); lfo.connect(lg); lg.connect(a.detune); lg.connect(q.detune);
    const pk = 0.084 * v * (calm ? 0.75 : 1), open = calm ? 2600 : 4400;
    g.gain.setValueAtTime(0.0001, t0);
    let end = t0;
    notes.forEach(([dt, m, len], i) => {
      const t = t0 + dt, f = mtof(m), prevEnd = i ? t0 + notes[i - 1][0] + notes[i - 1][2] : -1, legato = i && t - prevEnd < 0.04;
      if (i) { a.frequency.setTargetAtTime(f, t - 0.01, 0.022); q.frequency.setTargetAtTime(f, t - 0.01, 0.022); }   // portamento
      g.gain.setTargetAtTime(pk, t, legato ? 0.02 : 0.006); g.gain.setTargetAtTime(pk * 0.72, t + 0.08, 0.25);
      lp.frequency.setTargetAtTime(open, t, 0.02); lp.frequency.setTargetAtTime(open * 0.5, t + 0.07, 0.2);   // the brass "bwah"
      lg.gain.setValueAtTime(0, t); if (len > 0.3) lg.gain.linearRampToValueAtTime(len > 0.8 ? 16 : 11, t + Math.min(0.6, len * 0.6));   // delayed vibrato
      const nx = notes[i + 1], next = nx ? t0 + nx[0] : Infinity;
      if (next - (t + len) > 0.03) g.gain.setTargetAtTime(0.0001, t + len, len > 1 ? 0.35 : 0.03);
      end = Math.max(end, t + len);
    });
    const stop = end + 1.8;
    a.start(st); q.start(st); lfo.start(st); a.stop(stop); q.stop(stop); lfo.stop(stop);
    voice([a, q, lfo], [qg, lp, g, lg], stop);
  }

  /* ------------------------------------------------------------------ hits and effects */
  function hit(t, ch, size, v) {   // a title card / a word: chord stab + kick + gated snare and clap; bigger ones add a crash and a sub drop
    v = v == null ? 1 : v;
    const C = CH[ch] || CH.Cm9, len = size >= 2 ? BAR - 0.06 : BEAT * 2 - 0.06;
    pad(t, ch, len, 1.25 * v, { att: 0.004, rel: size >= 2 ? 1.1 : 0.45, bright: calm ? 3000 : 6200, stab: true });
    bass(t, C.r, len * 0.8, 1, size >= 2 ? 0.12 : 0.04);
    kick(t, v); snare(t, 0.95 * v, true);
    if (size >= 2) crash(t, (size >= 3 ? 0.9 : 0.65) * v * (calm ? 0.45 : 1), size >= 3 ? 2.8 : 2);
    if (size >= 3) { boom(t, calm ? 0.22 : 0.5); tom(t, 2, 0.6); }
  }
  function stab(t, ch, v) {
    v = v == null ? 1 : v; const C = CH[ch] || CH.Cm9;
    pad(t, ch, 0.34, 1.1 * v, { att: 0.004, rel: 0.4, bright: calm ? 2800 : 5600, stab: true });
    bass(t, C.r, 0.3, 1); kick(t, 0.85 * v); snare(t, 0.6 * v, true);
  }
  function boom(t, v) {   // the sub drop
    const o = osc('sine', 84, t), g = G(0); o.frequency.exponentialRampToValueAtTime(31, t + 1.2);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    chain(o, g, sfx); o.start(t); o.stop(t + 1.65); voice([o], [g], t + 1.65);
  }
  function riser(t, d, v) {   // filtered noise opening up
    const n = nsrc(t, d + 0.05), bp = F('bandpass', 400, 2.4), g = G(0);
    bp.frequency.setValueAtTime(360, t); bp.frequency.exponentialRampToValueAtTime(7200, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + d * 0.97); g.gain.linearRampToValueAtTime(0.0001, t + d + 0.03);
    chain(n, bp, g, sfx); voice([n], [bp, g], t + d + 0.05);
  }
  function swell(t, d, ch, v) {   // the reverse swell into a hit: a reversed cymbal and the coming chord played backwards
    v = v == null ? 1 : v;
    const n = nsrc(t, d + 0.03), g = G(0);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3 * v * (calm ? 0.5 : 1), t + d); g.gain.linearRampToValueAtTime(0.0001, t + d + 0.01);
    chain(n, g, cymHP); voice([n], [g], t + d + 0.03);
    if (ch) pad(t, ch, d, 0.9 * v, { rev: true, thin: true });
  }
  function whoosh(t, d, v) {
    const n = nsrc(t, d + 0.05), bp = F('bandpass', 2000, 1.1), g = G(0), pn = P(-0.7);
    bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(260, t + d);
    if (pn.pan) { pn.pan.setValueAtTime(-0.7, t); pn.pan.linearRampToValueAtTime(0.7, t + d); }
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + d * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    chain(n, bp, g, pn, sfx); voice([n], [bp, g, pn], t + d + 0.05);
  }
  function ping(t, f, v) {   // a soft FM bell (the owner's message, a cited section), echoed by the delay
    const c = osc('sine', f, t), m = osc('sine', f * 3.5, t), mg = G(0), g = G(0);
    mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(f * 0.04, t + 0.45);
    m.connect(mg); mg.connect(c.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    c.connect(g); g.connect(sfx); g.connect(pingDly);
    c.start(t); m.start(t); c.stop(t + 1.15); m.stop(t + 1.15); voice([c, m], [mg, g], t + 1.15);
  }
  function clockTick(t, v) {   // the countdown: a dry clock tick over a low heartbeat on C
    const n = nsrc(t, 0.03), hp = F('highpass', 3200, 0.8), g = G(0);
    g.gain.setValueAtTime(0.25 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025); chain(n, hp, g, sfx);
    const o = osc('sine', 65.4, t), og = G(0); og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.5 * v, t + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    chain(o, og, sfx); o.start(t); o.stop(t + 0.34);
    voice([o, n], [hp, g, og], t + 0.34);
  }
  function blip(t, f, v, len) {
    const o = osc('sine', f, t), g = G(0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    chain(o, g, sfx); o.start(t); o.stop(t + len + 0.02); voice([o], [g], t + len + 0.02);
  }
  // the tape stop: playback speed falls from 1 to 0 over d (delay time grows as x²/2d), the level falls with it; back to normal later, in silence
  function tapeStop(t, d, back) {
    const N = 96, curve = new Float32Array(N);
    for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * d; curve[i] = (x * x) / (2 * d); }
    const dt = tape.delayTime, g = tapeG.gain;
    try {
      dt.cancelScheduledValues(t); dt.setValueAtTime(0, t); dt.setValueCurveAtTime(curve, t, d);
      g.cancelScheduledValues(t); g.setValueAtTime(1, t); g.setValueAtTime(1, t + d * 0.4); g.linearRampToValueAtTime(0.0001, t + d);
      const r = t + Math.max(d + 0.1, back);
      dt.setValueAtTime(0, r); g.setValueAtTime(0.0001, r); g.linearRampToValueAtTime(1, r + 0.04);
    } catch (e) { /* automation clash after a seek: the next jump resets the tape */ }
  }
  function resetTape(t) {
    try { tape.delayTime.cancelScheduledValues(t); tape.delayTime.setValueAtTime(0, t); tapeG.gain.cancelScheduledValues(t); tapeG.gain.setValueAtTime(1, t); } catch (e) { /* closed */ }
  }
  function kill(t, ch, back) {   // the app is killed: the downbeat starts, the tape stops under it, a short digital glitch, silence
    const C = CH[ch] || CH.Cm9;
    pad(t, ch, 1.1, 1.2, { att: 0.004, rel: 0.3, bright: calm ? 3000 : 6000, stab: true });
    kick(t, 1); snare(t, 0.9, true); crash(t, calm ? 0.35 : 0.8, 1.6);
    for (let s = 0; s < 8; s++) {   // the groove keeps going for two beats while the tape slows it down
      const tt = t + s * S16;
      if (s % 2 === 0) bass(tt, C.r + (s % 4 === 2 ? 12 : 0), S16 * 1.5, 0.95);
      arp(tt, C.p[s % 4] + 12, 0.9);
      if (s % 2 === 0 && s) hat(tt, s % 4 === 2 ? 0.9 : 0.5, false);
      if (s === 4) { kick(tt, 0.9); snare(tt, 0.85, true); }
    }
    tapeStop(t + 0.06, calm ? 1.4 : 0.95, back);
    if (calm) return;
    for (let i = 0; i < 6; i++) {   // the glitch: a few clipped digital chirps as the process dies
      const tt = t + 0.42 + i * 0.05 + (i > 3 ? 0.06 : 0), o = osc('square', 180 + ((i * 433) % 1700), tt), og = G(0);
      og.gain.setValueAtTime(0.05, tt); og.gain.setValueAtTime(0.0001, tt + 0.026); chain(o, og, sfx); o.start(tt); o.stop(tt + 0.03); voice([o], [og], tt + 0.03);
    }
  }

  /* ------------------------------------------------------------------ patterns: one 16th step of a section */
  const at = (arr, i) => arr[i % arr.length];
  function beat(lvl, s, bar, t, vel) {   // the drum machine's groove; lvl 1 sparse .. 3 four-on-the-floor with open hats
    vel = vel || 1;
    const K = lvl >= 3 ? [0, 4, 8, 12] : lvl === 2 ? (bar % 2 ? [0, 6, 8, 14] : [0, 6, 8]) : (bar % 2 ? [0, 8, 10] : [0, 8]);
    if (K.indexOf(s) >= 0) kick(t, (s === 0 ? 1 : 0.88) * vel);
    if (s === 4 || s === 12) snare(t, vel, true);
    const OH = calm ? [] : lvl >= 3 ? [2, 6, 10, 14] : lvl === 2 && bar % 2 ? [14] : [];
    if (OH.indexOf(s) >= 0) { hat(t, 0.62 * vel, true); return; }
    if (OH.indexOf(s - 1) >= 0) return;   // the open hat rings through this step
    if (calm && s % 2) return;
    const acc = s % 4 === 2 ? 1 : s % 4 === 0 ? 0.72 : 0.4;
    hat(t + (s % 2 ? SWING : 0), acc * vel * (lvl === 1 ? 0.82 : 1) * (calm ? 0.6 : 1), false);
  }
  function fillStep(i, n, t, kind) {   // i-th 16th of an n-step fill: gated snare up, then down the toms
    const k = i / Math.max(1, n - 1);
    if (kind === 'snare' || calm) { snare(t, 0.32 + 0.6 * k, false); if (i === n - 1 && !calm) kick(t, 0.7); return; }
    if (i < n / 4) snare(t, 0.6 + 0.3 * k, false);
    else tom(t, Math.min(2, Math.floor(((i - n / 4) / (n * 0.75)) * 3)), 0.78 + 0.22 * k);
    if (i === n - 1) kick(t, 0.85);
  }
  function bassLine(C, s, t, vel, sixteen) {   // octave-jumping eighths (or driving sixteenths), locked to the kick
    if (sixteen) { bass(t, C.r + (s % 4 === 2 ? 12 : 0), S16 * 0.8, (s % 4 === 0 ? 1 : 0.72) * vel); return; }
    if (s % 2) return;
    const hi = s % 4 === 2;
    bass(t, C.r + (hi ? 12 : 0), S16 * 1.55, (s % 8 === 0 ? 1 : hi ? 0.8 : 0.9) * vel);
  }

  function stepSection(sec, k, t) {
    if (sec.skip && sec.skip.indexOf(k) >= 0) return;   // a hit or a stab (an event) owns this step
    const bar = k >> 4, s = k & 15, chs = sec.chords || ['Cm9'], C = CH[at(chs, bar)] || CH.Cm9, last = bar === sec.bars - 1;
    switch (sec.kind) {
      case 'qloop': {      // the question: dark pads behind glass, a soft arpeggio, a slow heartbeat
        if (s === 0) { padRun(sec, chs, bar, t); bass(t, C.r, BAR * 0.9, 0.5); }
        arpStep(C, 'pulse', s, t, 0.55, 2);
        if (s === 0) kick(t, 0.34); if (s === 3) kick(t, 0.2);
        return;
      }
      case 'intro': {      // pads and an arpeggio opening up; a heartbeat, then the pulse, the bass and a snare build into the first hit
        if (s === 0) padRun(sec, chs, bar, t);
        arpStep(C, 'up', s, t, 0.4 + 0.2 * bar + 0.02 * s, 1);
        if (bar === 0) { if (s === 0) kick(t, 0.5); if (s === 3) kick(t, 0.3); return; }
        if (bar === 1) { if (s === 0) bass(t, C.r, BAR * 0.95, 0.75, 0.1); if (s % 4 === 0) kick(t, 0.55 + 0.03 * s); return; }
        bassLine(C, s, t, 0.85);
        if (s % 4 === 0) kick(t, 0.8);
        if (s % 4 === 2) hat(t, 0.7, false);
        if (s < 8 ? s % 2 === 0 : true) snare(t, 0.2 + 0.62 * (s / 15), false);
        return;
      }
      case 'open': case 'back': {   // the groove, full band
        if (s === 0) padRun(sec, chs, bar, t);
        bassLine(C, s, t, 1);
        arpStep(C, sec.kind === 'back' ? 'climb' : 'up', s, t, 0.85, 1);
        if (sec.fillLast && last && s >= 8) { fillStep(s - 8, 8, t, 'toms'); return; }
        beat(sec.kind === 'back' ? 3 : 2, s, bar, t);
        if (sec.kind === 'back' && s === 0 && bar > 0) crash(t, 0.5, 1.8);
        return;
      }
      case 'verse': {
        const lvl = sec.lvl || 1;
        if (bar === 0) {   // the title card: the hit rings, then a gated snare fill into the sweep
          if (s === 8) kick(t, 0.7);
          if (s >= 8) fillStep(s - 8, 8, t, 'snare');
          return;
        }
        if (s === 0) padRun(sec, chs, bar, t);
        bassLine(C, s, t, 0.95);
        arpStep(C, sec.arp, s, t, lvl === 1 ? 0.7 : 0.8, lvl === 1 ? 2 : 1);
        if (bar === 5 && s >= 12) { fillStep(s - 12, 4, t, 'snare'); return; }
        if (last && s >= 8 && !sec.noEndFill) { fillStep(s - 8, 8, t, 'toms'); return; }
        beat(lvl, s, bar, t);
        if (s === 0 && bar === 2) crash(t, 0.45, 1.8);
        return;
      }
      case 'build': {      // the deploy: driving sixteenths, getting louder towards the crash test
        const rise = 0.78 + 0.22 * (k / (sec.bars * 16));
        if (bar === 0) { if (s >= 8) fillStep(s - 8, 8, t, 'snare'); if (s === 8) kick(t, 0.75); return; }
        if (s === 0) padRun(sec, chs, bar, t);
        bassLine(C, s, t, 0.95 * rise, !calm);
        arpStep(C, 'fall', s, t, 0.8 * rise, 1);
        if (last && s >= 8) { snare(t, 0.4 + (s - 8) / 13, false); if (s % 2 === 0) kick(t, 0.9); if (s % 2 === 0) hat(t, 0.7, false); return; }
        beat(3, s, bar, t, rise);
        if (s === 0) crash(t, 0.45 * rise, 1.6);
        return;
      }
      case 'words': {      // the finale's four words: the hits are events; toms lead into each one
        if (s === 6 || s === 7 || (bar === 0 && (s === 14 || s === 15))) tom(t, s % 2 ? 1 : 0, 0.55 + 0.2 * bar);
        return;
      }
      case 'anthem': {     // the chorus: four on the floor, open hats, the octave bass, big pads; the lead is an event
        if (s === 0) padRun(sec, chs, bar, t);
        bassLine(C, s, t, 1);
        arpStep(C, 'up', s, t, 0.6, 1, 0);
        if (last && s >= 8) { fillStep(s - 8, 8, t, 'toms'); return; }
        beat(3, s, bar, t);
        if (s === 0 && bar === 2) crash(t, 0.6, 2);
        return;
      }
      default:
    }
  }

  // a low-pass automation that keeps its end time even when it starts late
  function sweepTo(p, f0, f1, t, end) {
    p.cancelScheduledValues(t); p.setValueAtTime(f0, t);
    if (end > t + 0.005) p.exponentialRampToValueAtTime(f1, end); else p.setValueAtTime(f1, t);
  }
  function play(ev, t, nominal) {
    switch (ev.k) {
      case 'hit': hit(t, ev.ch, ev.size || 2, ev.v); break;
      case 'stab': stab(t, ev.ch, ev.v); break;
      case 'final': {   // the last chord rings out under the hire buttons; the arp's last notes fall into the delay
        const C = CH[ev.ch] || CH.Abmaj9;
        pad(t, ev.ch, 2.6, 1.3, { att: 0.004, rel: 3.4, bright: calm ? 3000 : 6400, stab: true });
        bass(t, C.r, 1.6, 1, 0.6); kick(t, 1); snare(t, 1, true); crash(t, calm ? 0.45 : 1, 3.8); boom(t, calm ? 0.2 : 0.5);
        for (let i = 0; i < 6; i++) arp(t + i * S16 * 2, C.p[3 - (i % 4)] + (i < 4 ? 12 : 0), 0.9 - i * 0.12);
        break;
      }
      case 'fill': for (let i = 0; i < ev.n; i++) { const tt = nominal + i * S16; if (tt >= t - 0.01) fillStep(i, ev.n, Math.max(tt, t), ev.kind || 'toms'); } break;
      case 'riser': riser(t, Math.max(0.1, ev.d - (t - nominal)), (ev.v || 0.14) * (calm ? 0.6 : 1)); break;
      case 'swell': swell(t, Math.max(0.1, ev.d - (t - nominal)), ev.ch, ev.v); break;
      case 'whoosh': whoosh(t, ev.d || 1, (ev.v || 0.15) * (calm ? 0.5 : 1)); break;
      case 'ping': ping(t, ev.f || 1568, (ev.v || 0.07) * (calm ? 0.8 : 1)); break;
      case 'tick': clockTick(t, (ev.v || 1) * (calm ? 0.45 : 0.6)); break;
      case 'kill': kill(t, ev.ch, ev.back || 3.5); break;
      case 'lead': lead(nominal, ev.notes, ev.v || 1, t); break;   // late: the phrase stays on the grid, the first notes are cut
      case 'crash': crash(t, ev.v || 0.8, ev.d || 2.2); break;
      case 'lp': sweepTo(bandLP.frequency, ev.f0, ev.f1, t, nominal + (ev.d || 0)); break;     // the band behind a wall, opening up
      case 'arpf': sweepTo(arpLP.frequency, ev.f0, ev.f1, t, nominal + (ev.d || 0)); break;   // the arpeggio opening up
      case 'sweep': {   // title card: the synths are pulled under a closing filter, then it sweeps open across the next bar(s)
        const p = synthLP.frequency, open = Math.max(t + 0.3, nominal + ev.open);   // ev.open: seconds after the event
        p.cancelScheduledValues(t); p.setValueAtTime(18000, t); p.exponentialRampToValueAtTime(ev.lo || 400, t + 0.28);
        p.setValueAtTime(ev.lo || 400, open); p.exponentialRampToValueAtTime(ev.hi || 16000, open + (ev.d || BAR));
        p.setValueAtTime(20000, open + (ev.d || BAR) + 0.01);
        break;
      }
      default:
    }
  }

  /* ------------------------------------------------------------------ scheduling */
  let mus = { sections: [], events: [], end: 0 };
  let filmClock = () => 0, base = 0, until = 0, evIdx = 0, running = false, paused = false, muted = false, susTimer = 0, timer = 0, ended = false;
  let q = null;   // the question loop: { base, k }
  const Q_SEC = { kind: 'qloop', bars: 4, chords: ['Cm9', 'Cm9', 'Abmaj9', 'Abmaj9'] };
  const latency = () => Math.min(0.08, (ctx.outputLatency || 0) + (ctx.baseLatency || 0));

  function scheduleRange(f0, f1, b) {   // every note with film time in [f0, f1), placed at audio time b + film time
    const now = offline ? -1 : ctx.currentTime;
    const ev = mus.events;
    while (evIdx < ev.length && ev[evIdx].t < f0 - 1e-6) evIdx++;
    while (evIdx < ev.length && ev[evIdx].t < f1) {
      const e = ev[evIdx++], tt = b + e.t, late = LONG[e.k] ? 0.35 : 0.02;   // a short note that is late is dropped; a hit, a sweep or the last chord still plays
      if (tt >= now - late) play(e, Math.max(tt, now), tt);
    }
    for (const sec of mus.sections) {
      const end = sec.t + sec.bars * BAR;
      if (end <= f0 || sec.t >= f1) continue;
      let k = Math.max(0, Math.ceil((f0 - sec.t) / S16 - 1e-6));
      for (; k < sec.bars * 16; k++) {
        const ft = sec.t + k * S16; if (ft >= f1) break;
        const tt = b + ft; if (tt < now - 0.02) continue;
        stepSection(sec, k, Math.max(tt, now));
      }
    }
  }
  function qTick() {
    if (!q || paused || muted || ctx.state !== 'running') return;
    const lim = ctx.currentTime + AHEAD;
    while (q.base + q.k * S16 < lim) { const t = q.base + q.k * S16; if (t >= ctx.currentTime - 0.01) stepSection(Q_SEC, q.k % 64, t); q.k++; }
  }
  function tick() {
    if (paused || muted || ctx.state !== 'running') return;
    if (q) { qTick(); return; }
    if (!running || ended) return;
    const T = filmClock(), want = ctx.currentTime - T - latency();
    if (Math.abs(want - base) > 0.6) resync();   // the picture follows the music (clock()); only a big jump (a seek the film made alone) re-anchors
    if (T + AHEAD <= until) return;
    scheduleRange(Math.max(until, T), T + AHEAD, base);
    until = T + AHEAD;
    if (!ended && T > mus.end + 1) { ended = true; idleSoon(); }
  }
  function startTimer() { if (!timer && !offline) timer = setInterval(tick, TICK_MS); }
  function stopTimer() { clearInterval(timer); timer = 0; }
  function stopVoices(at, soft) {   // cut (or, softly, fade) everything that is still ringing: seek, replay, exit, the film starting
    const tau = soft ? 0.12 : 0.015, tail = soft ? 0.7 : 0.08;
    for (const v of voices) {
      for (const n of v.nodes) if (n.gain) { try { n.gain.cancelScheduledValues(at); n.gain.setTargetAtTime(0, at, tau); } catch (e) { /* ended */ } }
      for (const s of v.srcs) { try { s.stop(at + tail); } catch (e) { /* already stopped */ } }
    }
    openHat = null;
  }
  function resetFilters(t) {
    [bandLP, synthLP].forEach((f) => { f.frequency.cancelScheduledValues(t); f.frequency.setValueAtTime(20000, t); });
    arpLP.frequency.cancelScheduledValues(t); arpLP.frequency.setValueAtTime(4600, t);
    resetTape(t);
  }
  // the filters exactly as the score has them at film time T, from audio time t on: the events that move them may have been
  // skipped (muted, paused, a stall), and a skipped intro must never leave the band muffled behind the question's 800 Hz wall
  function restoreFilters(T, t) {
    resetFilters(t);
    for (const e of mus.events) {
      if (e.t > T) break;
      const k = T - e.t;
      if (e.k === 'lp' || e.k === 'arpf') {
        const p = (e.k === 'lp' ? bandLP : arpLP).frequency, d = e.d || 0;
        p.cancelScheduledValues(t);
        if (k < d) { p.setValueAtTime(e.f0 * Math.pow(e.f1 / e.f0, k / d), t); p.exponentialRampToValueAtTime(e.f1, t + (d - k)); } else p.setValueAtTime(e.f1, t);
      } else if (e.k === 'sweep') {
        const lo = e.lo || 400, hi = e.hi || 16000, open = Math.max(0.3, e.open || 0), d = e.d || BAR, p = synthLP.frequency;
        if (k >= open + d) continue;   // over: the synths are open again
        p.cancelScheduledValues(t);
        if (k < 0.28) { p.setValueAtTime(18000 * Math.pow(lo / 18000, k / 0.28), t); p.exponentialRampToValueAtTime(lo, t + 0.28 - k); }
        else if (k < open) p.setValueAtTime(lo, t);
        else p.setValueAtTime(lo * Math.pow(hi / lo, (k - open) / d), t);
        if (k < open) p.setValueAtTime(lo, t + open - k);
        p.exponentialRampToValueAtTime(hi, t + open + d - k); p.setValueAtTime(20000, t + open + d - k + 0.01);
      }
    }
  }
  let resyncs = 0;
  function resync() {   // the film moved without the music (muted, a long stall): cut what rings, re-anchor on the film, restore the filters
    const T = filmClock(), now = ctx.currentTime; resyncs++;
    stopVoices(now); base = now - T - latency(); until = T; evIdx = 0;
    restoreFilters(T, now);
  }
  function setMaster(v, sec) {
    const t = ctx.currentTime, p = master.gain; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(v, t + (sec || 0.2));
  }
  function idleSoon() {   // nothing left to play: let the last chord ring, then stop the audio thread
    clearTimeout(susTimer);
    susTimer = setTimeout(() => { if (ended && !paused && !q) { stopTimer(); safe(ctx.suspend()); } }, 6500);
  }
  function wake() { clearTimeout(susTimer); if (ctx.state === 'suspended' && !paused && !muted) safe(ctx.resume()); startTimer(); }

  function sortEvents(m) { m.events.sort((a, b) => a.t - b.t); return m; }
  const LEVEL = 0.85, DUCK = 0.36;

  return {
    ok: true, ctx,
    setMusic(m) { mus = sortEvents({ sections: m.sections.slice(), events: m.events.slice(), end: m.end || 0 }); evIdx = 0; },
    // the question: dark pads behind glass until the visitor answers
    startQuestion() {
      if (offline) return;
      q = { base: ctx.currentTime + 0.12, k: 0 };
      bandLP.frequency.cancelScheduledValues(ctx.currentTime); bandLP.frequency.setValueAtTime(800, ctx.currentTime);
      arpLP.frequency.cancelScheduledValues(ctx.currentTime); arpLP.frequency.setValueAtTime(700, ctx.currentTime);
      setMaster(muted ? 0 : LEVEL, 1.6); startTimer();
    },
    // the film starts on the question loop's next eighth note; returns the wait in seconds (the film clock starts at -wait)
    startFilm(clock) {
      filmClock = clock; running = true; ended = false; until = 0; evIdx = 0;
      let wait = 0;
      if (q && ctx.state === 'running') { const step = 2 * S16, now = ctx.currentTime + 0.04; wait = Math.ceil((now - q.base) / step) * step + q.base - ctx.currentTime; }
      q = null;
      stopVoices(ctx.currentTime + Math.max(0, wait - 0.02), true);   // the question's pads fade under the film's first chord
      base = ctx.currentTime + wait - latency();
      resetFilters(Math.max(ctx.currentTime, base));   // the question's walls come down even if the intro's own filter events never play (muted)
      wake();
      return Math.max(0, wait);
    },
    // the music's film time at this frame (what is heard now), or null when the music is not running: the film follows it
    clock(perfNow) {
      if (offline || !running || ended || paused || muted || q || ctx.state !== 'running') return null;
      let heard = ctx.currentTime - latency();
      if (ctx.getOutputTimestamp && perfNow) {
        try { const o = ctx.getOutputTimestamp(); if (o && o.contextTime > 0 && o.performanceTime > 0) { const h = o.contextTime + (perfNow - o.performanceTime) / 1000; if (Math.abs(h - heard) < 0.25) heard = h; } } catch (e) { /* estimate above */ }
      }
      return heard - base;
    },
    jump(T) {   // seek: cut what rings, continue from the new time
      stopVoices(ctx.currentTime); until = T; evIdx = 0; ended = false;
      base = ctx.currentTime - T - latency();
      resetFilters(ctx.currentTime);
      wake();
    },
    stopFilm() { running = false; stopVoices(ctx.currentTime); },
    idle() { if (!ended) { ended = true; idleSoon(); } },   // the picture has settled: let the last chord ring, then stop the audio thread
    pause() {
      if (paused) return; paused = true; clearTimeout(susTimer);
      setMaster(0, 0.05); stopTimer();
      setTimeout(() => { if (paused) safe(ctx.suspend()); }, 70);
    },
    // resume keeps the music's own timeline (the notes already placed stay in time; the picture catches up through clock()),
    // unless the film moved on without the music, e.g. muted while paused: then cut, re-anchor and restore the filters
    resume() {
      if (!paused) return; paused = false;
      const go = () => {
        if (paused) return;
        if (running && !ended && !muted && Math.abs(ctx.currentTime - filmClock() - latency() - base) > 0.25) resync();
        if (q) q.base = Math.max(q.base, ctx.currentTime - q.k * S16 + 0.05);
        setMaster(muted ? 0 : LEVEL, 0.15); if (!muted) startTimer();
      };
      if (ended && running) { if (ctx.state === 'suspended' && !muted) safe(ctx.resume()); setMaster(muted ? 0 : LEVEL, 0.15); idleSoon(); return; }
      if (muted) { go(); return; }
      if (ctx.state === 'suspended') ctx.resume().then(go, () => {}); else go();
    },
    setMuted(m) {
      muted = m; clearTimeout(susTimer);
      if (m) { setMaster(0, 0.22); stopTimer(); susTimer = setTimeout(() => { if (muted) safe(ctx.suspend()); }, 300); }
      else if (!paused) {
        const go = () => { if (muted || paused) return; if (running && !ended) resync(); setMaster(LEVEL, 0.3); startTimer(); };
        if (ctx.state === 'suspended') ctx.resume().then(go, () => {}); else go();
      }
    },
    // the browser's voice is speaking: the music steps back ~9 dB before the bus compressors, ~7 dB at the speakers (the effects stay)
    duck(on) { if (offline) return; const t = ctx.currentTime, p = duckG.gain; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.setTargetAtTime(on ? DUCK : 1, t, on ? 0.05 : 0.25); },
    ui(kind) {
      if (ctx.state !== 'running' || muted) return;
      const t = ctx.currentTime + 0.005;
      if (kind === 'go') { whoosh(t, 0.7, 0.13); blip(t, 783.99, 0.06, 0.1); blip(t + 0.07, 1046.5, 0.05, 0.16); } else blip(t, 1568, 0.035, 0.04);
    },
    fadeOutAndClose() {
      running = false; q = null; stopTimer(); clearTimeout(susTimer);
      return new Promise((res) => {
        try { setMaster(0, 0.45); } catch (e) { /* closed */ }
        setTimeout(() => { stopVoices(0); lfos.forEach((l) => { try { l.stop(); l.disconnect(); } catch (e) { /* gone */ } }); try { safe(ctx.close()); } catch (e) { /* closed */ } res(); }, 520);
      });
    },
    // offline (tests): schedule the whole film at once; duck under the given narration windows
    scheduleAll(m, ducks, chunked) {
      this.setMusic(m); master.gain.value = LEVEL; until = 0; evIdx = 0;
      if (!chunked) scheduleRange(0, m.end + 8, 0);   // chunked: the test calls scheduleChunk() from OfflineAudioContext.suspend()
      (ducks || []).forEach(([a, b]) => { duckG.gain.setTargetAtTime(DUCK, a, 0.05); duckG.gain.setTargetAtTime(1, b, 0.25); });
    },
    scheduleChunk(f0, f1) { scheduleRange(f0, f1, 0); },
    voices: () => voices.size,
    debug: () => ({ base, until, resyncs, voices: voices.size }),   // tests
    // tests: listen to what reaches the speakers (the analyser also carries the dynamics nodes and the voice count)
    debugTap() { const an = ctx.createAnalyser(); an.fftSize = 2048; trim.connect(an); an.meters = { glue, limit, drumComp, voices: () => voices.size, oscs: () => { let n = 0; voices.forEach((v) => { n += v.srcs.length; }); return n; }, pre: () => { const a2 = ctx.createAnalyser(); a2.fftSize = 2048; limit.connect(a2); return a2; } }; return an; },
  };
}

/* ------------------------------------------------------------------ curves and buffers */
function satCurve(k) {   // tape-style: unity gain for small signals, rounding the peaks
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / k; }
  return c;
}
function softClip() {   // transparent below 0.8, then a smooth knee that never passes 0.98 (a WaveShaper maps input -1..1 onto the curve)
  const n = 4096, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= 0.8 ? a : 0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18));
  }
  return c;
}
function noiseBuffer(ctx, sec) {
  const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function hallIR(b, c, half, st) {   // a dark, wide hall: decorrelated noise, darker as it decays, 18 ms pre-delay. Returns the job for one half of one channel
  return () => {
    const sr = b.sampleRate, len = b.length, pre = Math.floor(sr * 0.018), d = b.getChannelData(c), mid = Math.floor((pre + len) / 2);
    let lp = half ? st[c] : 0;
    for (let i = half ? mid : pre, end = half ? len : mid; i < end; i++) { const k = (i - pre) / (len - pre); lp += ((Math.random() * 2 - 1) - lp) * (0.62 - 0.5 * k); d[i] = lp * Math.pow(1 - k, 2.6) * Math.min(1, (i - pre) / (sr * 0.006)); }
    st[c] = lp;
  };
}
function gateIR(ctx) {   // the 80s gated reverb: dense and almost flat for ~0.24 s, then cut off dead
  const sr = ctx.sampleRate, hold = 0.235, cut = 0.012, len = Math.floor(sr * (hold + cut)), b = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / sr; lp += ((Math.random() * 2 - 1) - lp) * 0.55;
      const env = tt < hold ? (0.55 + 0.45 * Math.min(1, tt / 0.012)) * (1 - 0.32 * (tt / hold)) : (1 - (tt - hold) / cut) * 0.68;
      d[i] = lp * env;
    }
  }
  return b;
}
