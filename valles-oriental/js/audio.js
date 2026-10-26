// Tiny synthesized sound effects (no audio files, works offline). Everything is optional:
// the game is fully understandable without sound.
let ctx = null;
let muted = false;

function ac() {
  if (!ctx) {
    try { ctx = new AudioContext(); } catch (e) { console.warn("No audio", e); return null; }
  }
  if (ctx.state === "suspended") ctx.resume().catch((e) => console.warn(e));
  return ctx;
}

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

function tone(freq, dur, { type = "sine", gain = 0.15, slide = 0, delay = 0 } = {}) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(dur, { gain = 0.12, delay = 0, hp = 800 } = {}) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "highpass"; f.frequency.value = hp;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  tick: () => tone(1200, 0.04, { type: "square", gain: 0.04 }),
  hover: () => tone(660, 0.06, { gain: 0.06 }),
  select: () => { tone(523, 0.1, { type: "triangle" }); tone(784, 0.14, { type: "triangle", delay: 0.08 }); },
  lock: () => { tone(392, 0.12, { type: "square", gain: 0.08 }); tone(523, 0.18, { type: "square", gain: 0.08, delay: 0.1 }); },
  reveal: () => { noise(0.35, { gain: 0.08, hp: 2000 }); tone(220, 0.5, { type: "sawtooth", gain: 0.06, slide: 440 }); },
  good: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: "triangle", delay: i * 0.08 })),
  meh: () => { tone(392, 0.2, { type: "triangle" }); tone(330, 0.3, { type: "triangle", delay: 0.15 }); },
  bad: () => tone(200, 0.35, { type: "sawtooth", gain: 0.08, slide: -120 }),
  hit: () => noise(0.12, { gain: 0.15, hp: 300 }),
  coin: () => { tone(988, 0.07, { type: "square", gain: 0.05 }); tone(1319, 0.12, { type: "square", gain: 0.05, delay: 0.06 }); },
  whoosh: () => noise(0.4, { gain: 0.06, hp: 1200 }),
  cheer: () => { noise(0.9, { gain: 0.1, hp: 600 }); [392, 494, 587, 784].forEach((f, i) => tone(f, 0.3, { type: "triangle", delay: 0.1 + i * 0.1 })); },
  unlock: () => ac(),
};
