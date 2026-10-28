// Tiny synthesized sound effects (no audio files, works offline). Everything is optional:
// the game is fully understandable without sound.
// Kept soft on purpose (a loud public space, long sessions): mostly sine/triangle voices, square ones
// only through a lowpass, noise always band-limited, no instant attacks, and a master bus that rolls
// off the top end and adds a little room.
let ctx = null;
let out = null;
let muted = false;

const MASTER_LP = 6500;     // Hz: nothing above this is needed and it is where harshness lives
const REVERB_WET = 0.12;    // share of the signal sent to the short room reverb
const REVERB_S = 0.9;

// Short room impulse: stereo noise with a fast exponential decay, darker towards the tail
function roomImpulse(a) {
  const n = Math.floor(a.sampleRate * REVERB_S);
  const buf = a.createBuffer(2, n, a.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      lp += (Math.random() * 2 - 1 - lp) * (0.6 - 0.5 * k);
      d[i] = lp * Math.pow(1 - k, 3);
    }
  }
  return buf;
}

function ac() {
  if (!ctx) {
    try { ctx = new AudioContext(); } catch (e) { console.warn("No audio", e); return null; }
    // master bus: input -> lowpass -> compressor (overlapping effects must not clip) -> speakers,
    // with a send from the lowpass to the room reverb
    try {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4;
      comp.attack.value = 0.003; comp.release.value = 0.15;
      comp.connect(ctx.destination);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = MASTER_LP; lp.Q.value = 0.5;
      lp.connect(comp);
      try {
        const rev = ctx.createConvolver();
        rev.buffer = roomImpulse(ctx);
        const wet = ctx.createGain();
        wet.gain.value = REVERB_WET;
        lp.connect(rev).connect(wet).connect(comp);
      } catch (e) { console.warn("No reverb", e); }
      out = lp;
    } catch (e) { console.warn("No master bus", e); out = null; }
  }
  if (ctx.state === "suspended") ctx.resume().catch((e) => console.warn(e));
  return ctx;
}

function bus(a) { return out || a.destination; }

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

// One voice. lp = optional lowpass cutoff (Hz), to take the edge off square/sawtooth waves.
function tone(freq, dur, { type = "sine", gain = 0.12, slide = 0, delay = 0, attack = 0.012, lp = 0 } = {}) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const at = Math.min(attack, dur / 3);
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + at);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = o;
  if (lp) {
    const f = a.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = lp; f.Q.value = 0.7;
    node = node.connect(f);
  }
  node.connect(g).connect(bus(a));
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noiseBuffer(a, dur) {
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Short noise burst (impacts, crackles), always band-limited between hp and lp, with a few ms of
// attack so it does not click
function noise(dur, { gain = 0.1, delay = 0, hp = 100, lp = 4000 } = {}) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a, dur);
  const h = a.createBiquadFilter();
  h.type = "highpass"; h.frequency.value = hp;
  const l = a.createBiquadFilter();
  l.type = "lowpass"; l.frequency.value = lp;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.004, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(h).connect(l).connect(g).connect(bus(a));
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// Air moving past: band-passed noise whose band sweeps up while it swells and fades. Unlike the
// impact noise it fades in, so a screen change never sounds like a hit.
function swish(dur, { gain = 0.06, from = 300, to = 1800, delay = 0 } = {}) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a, dur + 0.05);
  const f = a.createBiquadFilter();
  f.type = "bandpass"; f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(bus(a));
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}
// Coins: quick successions climb a major pentatonic (a run sounds like a run, not a stutter), with a
// slight random detune so even repeats at the top differ. A caller can pass its own step (e.g. a
// combo count); otherwise coins less than COIN_CHAIN_S apart chain by themselves.
const COIN_STEPS = [0, 2, 4, 7, 9, 12];   // semitones
const COIN_CHAIN_S = 0.8;
const COIN_DETUNE = 0.3;                  // semitones, peak to peak
let coinAt = -Infinity;
let coinRun = -1;

// Semitone offset of the n-th coin in a run (0 = first): climbs the scale, then alternates between
// its two top notes
export function coinSemis(n) {
  const L = COIN_STEPS.length;
  const i = n < L ? Math.max(0, n) : L - 1 - ((n - L + 1) % 2);
  return COIN_STEPS[i];
}

function coin(step) {
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  if (Number.isFinite(step)) coinRun = step;
  else coinRun = now - coinAt < COIN_CHAIN_S ? coinRun + 1 : 0;
  coinAt = now;
  const k = 2 ** ((coinSemis(coinRun) + (Math.random() - 0.5) * COIN_DETUNE) / 12);
  tone(988 * k, 0.08, { type: "square", gain: 0.045, lp: 2400 * k });
  tone(1319 * k, 0.14, { type: "square", gain: 0.045, delay: 0.06, lp: 3200 * k });
}

// Sparks (an area of the «Encén la vaga» map lights up): the pitch climbs two octaves of a major
// pentatonic with the share of the map organised, so a map filling up is heard as a rise; a small
// detune, a random second voice and a varying crackle keep repeats at the same share from sounding
// identical.
const SPARK_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];   // semitones above C5

export function sparkSemis(share) {
  const s = Number.isFinite(share) ? clamp01(share) : 0;
  return SPARK_STEPS[Math.round(s * (SPARK_STEPS.length - 1))];
}

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function clampInt(x, a, b) { return Math.max(a, Math.min(b, Math.round(Number.isFinite(x) ? x : a))); }

function spark(share) {
  const f = 523 * 2 ** ((sparkSemis(share) + (Math.random() - 0.5) * 0.4) / 12);
  const dur = 0.09 + Math.random() * 0.05;
  noise(0.03 + Math.random() * 0.03, { gain: 0.02, hp: 1800 + Math.random() * 1200, lp: 5000 });
  tone(f, dur + 0.06, { type: "triangle", gain: 0.07 });
  tone(f * (Math.random() < 0.5 ? 1.5 : 2), dur, { gain: 0.025, delay: 0.02 + Math.random() * 0.02 });
}

export const sfx = {
  tick: () => tone(880, 0.05, { type: "triangle", gain: 0.05, attack: 0.004 }),
  hover: () => tone(660, 0.08, { gain: 0.05 }),
  select: () => { tone(523, 0.12, { type: "triangle", gain: 0.11 }); tone(784, 0.16, { type: "triangle", gain: 0.11, delay: 0.08 }); },
  lock: () => {
    tone(392, 0.14, { type: "triangle", gain: 0.085 }); tone(784, 0.1, { gain: 0.02 });
    tone(523, 0.22, { type: "triangle", gain: 0.085, delay: 0.1 }); tone(1047, 0.14, { gain: 0.02, delay: 0.1 });
  },
  reveal: () => { swish(0.45, { gain: 0.16, from: 300, to: 2000 }); tone(220, 0.5, { type: "sawtooth", gain: 0.14, slide: 440, lp: 2000 }); },
  good: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: "triangle", gain: 0.11, delay: i * 0.08 })),
  meh: () => { tone(392, 0.22, { type: "triangle", gain: 0.11 }); tone(330, 0.32, { type: "triangle", gain: 0.11, delay: 0.15 }); },
  bad: () => tone(220, 0.38, { type: "sawtooth", gain: 0.08, slide: -110, lp: 1000 }),
  // out of the corridor: a soft bump (filtered noise + a dropping tone), never a crack; kept above
  // ~200 Hz so laptop and projector speakers still play it
  hit: () => { noise(0.12, { gain: 0.25, hp: 180, lp: 1600 }); tone(262, 0.15, { type: "triangle", gain: 0.18, slide: -110, attack: 0.004 }); },
  coin,
  spark,
  // game 1 lever: one soft notch per step, its pitch following the value's place on the scale
  // (two octaves from E4), so up and down can be heard
  notch: (pos) => tone(330 * 2 ** (2 * (Number.isFinite(pos) ? clamp01(pos) : 0)), 0.035, { type: "triangle", gain: 0.06 }),
  // ... and a dull thunk when it is pushed against the end of the scale
  limit: () => { tone(196, 0.15, { type: "square", gain: 0.05, slide: -60, lp: 900 }); noise(0.05, { gain: 0.04, hp: 150, lp: 1200 }); },
  // a confirm ring filling up (stage 1..3 of 4: C5, E5, G5); the lock sound completes it
  charge: (stage) => tone(523 * 2 ** ([0, 4, 7][clampInt(stage - 1, 0, 2)] / 12), 0.14, { gain: 0.06 }),
  // screen / level change: a rising swish and a soft two-note chime
  whoosh: () => {
    swish(0.42, { gain: 0.06 });
    tone(784, 0.2, { gain: 0.03, delay: 0.24 });
    tone(1175, 0.28, { gain: 0.025, delay: 0.32 });
  },
  // a data line drawn on screen: notes = [{ at (s from now), f (Hz), last }], one pluck per year;
  // the last one (the end of the line) rings longer and louder
  trend: (notes, { gain = 0.07 } = {}) => {
    for (const n of notes || []) {
      if (!Number.isFinite(n.f) || !Number.isFinite(n.at)) continue;
      const dur = n.last ? 0.7 : 0.16, gn = n.last ? gain * 1.4 : gain;
      tone(n.f, dur, { type: "triangle", gain: gn, delay: n.at });
      tone(n.f * 2, dur * 0.6, { gain: gn * 0.25, delay: n.at });
    }
  },
  // a closing statement: low thump and a firm major chord
  stamp: () => {
    noise(0.1, { gain: 0.09, hp: 50, lp: 500 });
    tone(110, 0.3, { gain: 0.13, slide: -50, attack: 0.005 });
    [262, 330, 392, 523].forEach((f) => tone(f, 0.6, { type: "triangle", gain: 0.045, delay: 0.04 }));
  },
  // confetti: a popper's pop, a rising fanfare onto a held chord, and glittery pings scattered
  // like falling paper (random high pentatonic notes, so no two wins sound quite the same)
  cheer: () => {
    tone(180, 0.08, { gain: 0.1, slide: -90, attack: 0.004 });
    noise(0.04, { gain: 0.04, hp: 600, lp: 3000 });
    [392, 494, 587, 784].forEach((f, i) => tone(f, 0.22, { type: "triangle", gain: 0.09, delay: 0.06 + i * 0.08 }));
    [392, 494, 587, 784].forEach((f) => tone(f, 0.7, { type: "triangle", gain: 0.04, delay: 0.38 }));
    const glitter = [1568, 1760, 1976, 2349, 2637];
    for (let i = 0; i < 14; i++) {
      const f = glitter[Math.floor(Math.random() * glitter.length)] * 2 ** ((Math.random() - 0.5) * 0.3 / 12);
      tone(f, 0.1 + Math.random() * 0.08, { gain: 0.01 + Math.random() * 0.012, delay: 0.15 + Math.random() * 0.9 });
    }
  },
  unlock: () => ac(),
};