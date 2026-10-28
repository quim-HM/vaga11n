// «Final de mes»: arcade corridor following real data.
// Each stage's centre line is the real cumulative % change of a series since a common base year;
// the corridor width is only a game difficulty. Each stage is played zoomed to its own range, so it
// climbs the whole screen from start to finish; already played stages stay visible as ghost lines on
// that same zoom, which keeps the comparison. The end screen puts every line back on ONE % scale.
// Flow per level: level card (kicker + icon + name) with the two-hands gate → «Som-hi!» → play →
// result card showing the real rise (auto, no gesture; a first loss offers a retry) → next level.
// Colours are read from C.* at draw time (themes mutate C); all strings go through T().
import { W, H, C, text, panel, ring, hatch, clamp, easeOut, fmtNum, Particles, rrect, onCard, measure, font, LAYOUT, posterBlock } from "../ui.js";
import { drawFooterHint } from "../hand.js";
import { drawTrail } from "../trail.js";
import { centerText, drawOkBadge } from "../icons.js";
import { inRect } from "../input.js";
import { pictoKind, drawPicto, drawPictoBadge } from "../pictos.js";
import { drawTutorial, finaldemesCards, drawFinaldemesGoal } from "../tutorial.js";

// Text overrides (data/textos.json via web/js/textos.js); safe fallback if the module is missing
function fill(str, vars) {
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));
}
let T = (key, fallback, vars) => fill(fallback, vars);
try {
  const mod = await import("../textos.js");
  if (mod && typeof mod.T === "function") T = mod.T;
} catch (e) {
  console.warn("finaldemes: textos.js not available, using built-in texts", e);
}

const GAME_ID = "finaldemes";
const K = (k) => `finaldemes.${k}`;

const DEFAULT_CFG = {
  any_base: 2015,
  ordenar_per_pujada: true,
  etapes: [
    { serie: "salari_catalunya", etiqueta: "Salaris" },
    { serie: "ipc_catalunya_aliments", etiqueta: "Cistella" },
    { serie: "lloguer_catalunya", etiqueta: "Lloguer a Catalunya" },
    { serie: "preu_habitatge_catalunya", etiqueta: "Preu de l'habitatge" },
  ],
};

// Subject phrases for the facts: [fallback text, plural]. A series can bring its own phrase
// (series.json → "subjecte", "subjecte_plural"), which is how locality series add theirs.
const SUBJ = {
  salari_catalunya: ["el salari brut mitjà a Catalunya", false],
  renda_llar_manresa: ["la renda neta mitjana per llar a Manresa", false],
  smi: ["el salari mínim interprofessional", false],
  ipc_catalunya_aliments: ["el preu dels aliments a Catalunya (IPC)", false],
  ipc_catalunya_general: ["els preus a Catalunya (IPC general)", true],
  lloguer_manresa: ["el lloguer mitjà dels contractes nous a Manresa", false],
  lloguer_bages: ["el lloguer mitjà dels contractes nous al Bages", false],
  lloguer_catalunya: ["el lloguer mitjà dels contractes nous a Catalunya", false],
  preu_habitatge_catalunya: ["el preu de l'habitatge a Catalunya (IPV)", false],
};

// Layout
const PLAY_TOP = 124;
const PLAY_BOT = 936;
const PLAY_H = PLAY_BOT - PLAY_TOP;
const PAD = 125;            // keeps the 0 % corridor fully inside so you can fall out of it
const PLAYER_X = 480;
const BALL_R = 24;
const TRAIL_S = 0.4;         // seconds of ball trail

// Timing / difficulty (per stage position, easiest first). The interlude before the game already
// says what it is and how it is played, so the game opens straight on the first level card.
const GATE_PX = 60;         // hand target within this of the ball's height = on the €
const GATE_HOLD = 0.4;      // ... for this long starts the stage
const GATE_MAX = 7;         // never block: start anyway after this
const GATE_TYPICAL = 3.4;
// Reading time: even a player who is ready at once gets time to take in each card
const GATE_MIN = 3.0;       // the first level card stays up at least this long before the gate can open
const GATE_MIN_NEXT = 2.5;  // ... and the next ones (same layout, already known)
const HOWTO_MIN = 6.0, HOWTO_AUTO = 24;   // «Com es juga»: raise a hand after 6 s, or it goes on by itself
const GO_DUR = 0.5;         // «Som-hi!»
const GRACE = 1;            // invulnerable seconds at the start of each stage
const STAGE_MIN = 15, STAGE_MAX = 17;   // length of the FIRST level (the next ones are shorter)
const LEVEL_RAMP = [1, 0.9, 0.82, 0.75];   // each level runs this fraction of the first one's time
const TIME_BUDGET = 80;
const SPEEDS = [565, 625, 675, 735];        // scroll px/s (fast; px per year scales with it)
const WIDTHS = [230, 185, 150, 120];        // corridor width px, narrower every stage (game difficulty, not data)
const ONE_ARM_EXTRA = 40;                   // assist: wider corridor in one-arm mode
// After each level its result (the real rise) shows by itself, with no gesture: raising a hand would
// break the two-hand steering pose four times per game. Long enough to read the figure.
const RESULT_DUR = 4.0;
const RESULT_FAIL_DUR = 4.5;
const CARD_RETRY_AUTO = 12; // a lost level offers a retry: longer, and it carries on by itself
const CARD_DWELL = 1.8;     // hold a hand over an option for this long to pick it
const CARD_PICK_MIN = 2.5;  // reading time before an option can be picked
const RAISE_S = 0.6;
const NODATA_DUR = 3;
// End screen: all lines revealed one after another, then the campaign line
const FINAL_LINE_T0 = 0.6, FINAL_LINE_GAP = 1.15, FINAL_LINE_DUR = 1.4;
const FINAL_MIN = 7, FINAL_AUTO = 17;
// ... each line is heard as it is drawn: one note per year marker, on a C major pentatonic (two
// octaves from C4, bottom to top of the chart), so the bigger the rise, the higher the tune climbs —
// and a flat line repeats its note. In C, like the closing chord.
const FINAL_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];   // semitones above C4
const FINAL_F_C4 = 261.63;
const FINAL_NOTE_GAP = 0.055;   // the first markers appear almost at once: keep the notes this far apart

// Control. With two hands the line between them is the direction the € travels: tilt it up and the
// € climbs, tilt it down and it dives, hold it level and it keeps its height. With a single hand
// (one-arm mode, mouse, or only one hand detected) the € follows the hand height directly.
const VMAX = 900;           // px/s
const FOLLOW_GAIN = 8;      // 1/s
const INERTIA = 12;         // 1/s (how fast velocity catches up)
const TILT_DEAD = 0.09;     // |slope| below this = level line: the € holds its height
const TILT_FULL = 0.60;     // slope (~31°) that asks for the full climb/dive speed
const TILT_VMAX = 760;      // px/s at full tilt
const TILT_SPAN = 170;      // hands closer than this (px apart) give no usable direction

// Vertical speed asked by a hand line, in screen px/s (negative = up). slope > 0 means the hand
// on the right (where the € is heading) is the higher one.
export function tiltSpeed(slope) {
  const mag = clamp((Math.abs(slope) - TILT_DEAD) / (TILT_FULL - TILT_DEAD), 0, 1);
  return slope > 0 ? -mag * TILT_VMAX : mag * TILT_VMAX;
}

// Notes of an end-screen line: one per year, at the moment its marker appears (the drawing eases
// out, so marker k shows when easeOut(p) reaches k / (n - 1)), pitched from the common % scale
// [lo, hi] onto FINAL_SCALE. at = seconds from the start of the line; the last note lands at dur.
export function trendNotes(pct, lo, hi, dur = FINAL_LINE_DUR) {
  const n = pct.length, out = [];
  for (let k = 0; k < n; k++) {
    const x = n > 1 ? k / (n - 1) : 1;
    let at = (1 - Math.cbrt(1 - x)) * dur;
    if (k > 0) at = Math.max(at, out[k - 1].at + FINAL_NOTE_GAP);
    const deg = Math.round(clamp((pct[k] - lo) / Math.max(1e-9, hi - lo), 0, 1) * (FINAL_SCALE.length - 1));
    out.push({ at, f: FINAL_F_C4 * 2 ** (FINAL_SCALE[deg] / 12), last: k === n - 1 });
  }
  return out;
}

// Marge
const DRAIN = 0.45;        // marge/s outside the corridor: ~2.2 s from full to empty
// Being outside has to feel bad: the whole screen goes red (more as the marge drains), red edges
// close in, and a heartbeat thumps and pulses the red, faster as the marge runs out. The pulse stays
// a smooth swell below 3 Hz (no hard flashing).
const HURT_IN = 10, HURT_OUT = 4;          // 1/s: how fast the red comes in / goes away
const BEAT_SLOW = 0.8, BEAT_FAST = 0.42;   // heartbeat period (s) with a full / an empty marge
// matte reds of the hurt effect (fixed, not theme colours: it has to read as alarm on every palette)
const HURT_RED = "#A3201C";        // recolouring (hue + saturation of the screen)
const HURT_RED_LIGHT = "#E0928A";  // multiply: what white turns into at full strength
const HURT_RED_DARK = "#4A0808";   // multiply: the burnt edges
const REGEN = 0.06;        // and slow to come back: being out of the corridor has to hurt
const MARGE_SEG = 5;       // the marge is shown as segments (a life bar), with no label to read

// Fun
const COIN_PTS = 100;       // x coin chain (1..5): following the wave pays much more
const COIN_STEP = 0.2;      // years between coins
const COIN_PERIOD = 1.25;   // years per sine wave
const COIN_AMP = 0.7;       // fraction of the half corridor
const COIN_STREAK = 1.0;    // seconds of combo streak gained per coin
const GRAZE_PX = 22;
const GRAZE_PTS = 30;

// Campaign slogan as scenery: giant faint text behind the chart, drifting with the scroll (parallax)
// and slowly between levels. The white road covers it, so it never competes with the data.
const BANNER_SIZE = 170;
const BANNER_GAP = 220;
const BANNER_ALPHA = 0.08;
const BANNER_PARALLAX = 0.3;   // fraction of the chart scroll speed while playing
const BANNER_IDLE = 60;        // px/s on the level cards

// Stage styles by difficulty step: palette KEYS (resolved at draw time), dashes, markers
const COLOR_KEYS = ["teal", "blue", "mustard", "red"];
const SOFT_KEYS = ["tealSoft", "blueSoft", "yellowSoft", "redSoft"];
const DASHES = [[], [24, 12], [10, 10], [28, 10, 6, 10]];
const MARKERS = ["circle", "square", "triangle", "diamond"];

// --- helpers --------------------------------------------------------------
function catmull(arr, u) {
  const n = arr.length;
  if (n === 1 || u <= 0) return arr[0];
  if (u >= n - 1) return arr[n - 1];
  const i = Math.floor(u), t = u - i;
  const p0 = arr[Math.max(i - 1, 0)], p1 = arr[i], p2 = arr[Math.min(i + 1, n - 1)], p3 = arr[Math.min(i + 2, n - 1)];
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

// Round gridline step giving ~5 lines over the range (10 % minimum, so a flat stage is not blown up)
function niceStep(range) {
  const raw = Math.max(10, range) / 5;
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100]) if (raw <= s) return s;
  return 200;
}

function fmtPct(v) {
  const r = Math.round(v);
  return `${r < 0 ? "−" : "+"}${fmtNum(Math.abs(r))}\u00A0%`;
}

function usablePoints(s) {
  if (!s || !Array.isArray(s.points)) return null;
  const partial = new Set((s.anys_parcials || []).map(Number));
  const m = new Map();
  for (const p of s.points) {
    const y = Number(p.year), v = Number(p.value);
    if (Number.isFinite(y) && Number.isFinite(v) && v > 0 && !partial.has(y)) m.set(y, v);
  }
  return m;
}

// Mix of two #RRGGBB colours (t = 0..1), as #RRGGBB
function mixHex(a, b, t) {
  const p = (c, i) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
  return "#" + [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * clamp(t, 0, 1)).toString(16).padStart(2, "0")).join("");
}

function fitText(g, str, x, y, maxW, opts = {}) {
  let size = opts.size || 40;
  const min = opts.minSize || 18;
  for (; size > min; size -= 2) if (measure(g, str, size, opts.kind || "body", opts.weight || 400) <= maxW) break;
  text(g, str, x, y, { ...opts, size });
}

function withAlpha(g, a, fn) {
  g.save();
  g.globalAlpha *= a;
  fn();
  g.restore();
}

function marker(g, kind, x, y, r) {
  g.beginPath();
  if (kind === "square") g.rect(x - r, y - r, 2 * r, 2 * r);
  else if (kind === "triangle") { g.moveTo(x, y - r * 1.2); g.lineTo(x + r * 1.1, y + r * 0.8); g.lineTo(x - r * 1.1, y + r * 0.8); g.closePath(); }
  else if (kind === "diamond") { g.moveTo(x, y - r * 1.3); g.lineTo(x + r * 1.1, y); g.lineTo(x, y + r * 1.3); g.lineTo(x - r * 1.1, y); g.closePath(); }
  else g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function tag(g, str, x, y, textColor, borderColor, { size = 28, align = "left" } = {}) {
  g.save();
  font(g, size, "body", 700);
  const tw = g.measureText(str).width + 20;
  const x0 = align === "right" ? x - tw : align === "center" ? x - tw / 2 : x;
  rrect(g, x0, y - size - 2, tw, size + 16, 4);
  g.fillStyle = C.white; g.fill();   // opaque: the line behind must not tint the label
  g.lineWidth = 3; g.strokeStyle = borderColor; g.stroke();
  g.restore();
  // baseline so the cap height sits in the optical middle of the pill
  text(g, str, x0 + 10, y - size / 2 + 6 + size * 0.355, { size, weight: 700, color: textColor });
}

// Stages: the locality's (lloc.json → joc2, already loaded in app.data.joc2) or data/joc2.json
async function loadConfig(data) {
  const own = data && data.joc2;
  if (own && Array.isArray(own.etapes) && own.etapes.length) return { ...DEFAULT_CFG, ...own };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const r = await fetch("data/joc2.json", { cache: "no-store", signal: ctrl.signal });
    if (!r.ok) throw new Error(`${r.status} data/joc2.json`);
    const cfg = await r.json();
    if (!cfg || !Array.isArray(cfg.etapes) || !cfg.etapes.length) throw new Error("joc2.json without etapes");
    return { ...DEFAULT_CFG, ...cfg };
  } catch (e) {
    console.warn("finaldemes: using default config", e);
    return DEFAULT_CFG;
  } finally {
    clearTimeout(timer);
  }
}

export default class FinalDeMes {
  constructor(app, params = {}) {
    this.calm = true;   // drawn on the theme's calm play surface (app.draw)
    this.app = app;
    this.params = params;
    this.needsPlayer = true;
    this.fx = new Particles();
    this.t = 0;
    this.pt = 0;
    this.phase = "loading";
    this.finished = false;
    this.stages = [];
    this.si = 0;
    this.u = 0;
    this.stT = 0;
    this.py = PLAY_BOT - PAD;
    this.vy = 0;
    this.trail = [];
    this.trailT = 0;
    this.points = 0;
    this.streak = 0;
    this.combo = 1;
    this.popup = null;
    this.insideTime = 0;
    this.totalTime = 0;
    this.touching = false;
    this.hitSfxT = 0;
    this.shake = 0;
    this.flash = 0;
    this.grazeT = 0;
    this.grazeCool = 0;
    this.flying = [];       // collected coins flying to the score
    this.hudPts = { x: 1300, y: 60 };
    this.graceT = 0;
    this.marge = 1;
    this.btnP = { retry: 0, next: 0 };
    this.stageDur = STAGE_MAX;
    this.cfgPromise = loadConfig(app.data);
  }

  // --- data -------------------------------------------------------------
  _candidate(opt, base) {
    const s = this.app.data && this.app.data.series ? this.app.data.series.get(opt.serie) : null;
    const pts = usablePoints(s);
    if (!pts || !pts.has(base)) return null;
    const years = [];
    for (let y = base; pts.has(y); y++) years.push(y);   // consecutive run from the base year
    if (years.length < 5) return null;
    const vals = years.map((y) => pts.get(y));
    const pct = vals.map((v) => (v / vals[0] - 1) * 100);
    const label = T(`finaldemes.etapa.${s.id}`, opt.etiqueta || s.titol || s.id);
    return { id: s.id, s, label, years, vals, pct, n: years.length,
      finalPct: pct[pct.length - 1], lastYear: years[years.length - 1] };
  }

  _build(cfg) {
    const base = Number(cfg.any_base) || 2015;
    this.base = base;
    const out = [];
    for (const et of cfg.etapes) {
      const opts = Array.isArray(et.opcions) ? et.opcions : [et];
      for (const o of opts) {
        if (!o || !o.serie || out.some((x) => x.id === o.serie)) continue;
        const c = this._candidate(o, base);
        if (c) { out.push(c); break; }
      }
    }
    if (cfg.ordenar_per_pujada !== false) out.sort((a, b) => a.finalPct - b.finalPct);
    const off = Math.max(0, 4 - out.length);  // fewer stages -> start at a harder difficulty step
    const n = out.length;
    const overhead = n * (GATE_TYPICAL + GO_DUR) + n * RESULT_DUR;
    // every level runs a bit shorter than the one before (same years, less time): the budget is
    // shared out in proportion, so the first level still lasts about STAGE_MIN..MAX
    const ramp = out.map((_, i) => LEVEL_RAMP[Math.min(i, LEVEL_RAMP.length - 1)]);
    const rampSum = ramp.reduce((a, b) => a + b, 0) || 1;
    this.stageDur = clamp((TIME_BUDGET - overhead) / rampSum, STAGE_MIN, STAGE_MAX);
    out.forEach((st, i) => {
      const k = Math.min(i + off, 3);
      st.index = i;
      st.k = k;
      // colour getters: always read the current theme
      Object.defineProperties(st, {
        color: { get: () => C[COLOR_KEYS[k]] },
        soft: { get: () => C[SOFT_KEYS[k]] || C.paper2 },
        ink: { get: () => (COLOR_KEYS[k] === "mustard" ? C.ink : C[COLOR_KEYS[k]]) },  // mustard text is not legible
      });
      st.dash = DASHES[k]; st.marker = MARKERS[k];
      st.picto = pictoKind(st.id, st.label, st.s && st.s.picto);
      st.speed = SPEEDS[k]; st.width = WIDTHS[k];
      st.dur = this.stageDur * ramp[i];
      st.ppy = (st.speed * st.dur) / (st.n - 1);
      st.result = null;
      st.pts = 0; st.inT = 0; st.totT = 0; st.coinsGot = 0;
      st.coins = [];
      // Bonus coins on a sine around the data line (game items, not data): following them pays more
      const phase = i * 1.9 + 0.5;
      for (let uu = 0.4; uu <= st.n - 1.1; uu += COIN_STEP) st.coins.push({ u: uu, s: Math.sin((2 * Math.PI * uu) / COIN_PERIOD + phase), got: false });
    });
    // each stage is played zoomed to its own range (its last year lands near the top of the screen),
    // so every trend climbs the whole screen and the stage feels like a climb from start to finish
    for (const st of out) {
      let a = 0, b = 0;
      for (const p of st.pct) { a = Math.min(a, p); b = Math.max(b, p); }
      const s = niceStep(b - a);
      st.step = s;
      st.lo = Math.floor(a / s) * s;
      st.hi = Math.max(st.lo + s, Math.ceil(b / s) * s);
    }
    // the end screen still puts every stage on one common scale: that is where they get compared
    let lo = 0, hi = 10;
    for (const st of out) for (const p of st.pct) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
    const step = hi - lo > 60 ? 20 : 10;
    this.step = step;
    this.lo = Math.floor(lo / step) * step;
    this.hi = Math.ceil(hi / step) * step;
    this.stages = out;
  }

  // Scale of the stage being played (the end screen passes the common one explicitly)
  yOf(p, sc = this.st || this) {
    return PLAY_BOT - PAD - ((p - sc.lo) / (sc.hi - sc.lo)) * (PLAY_H - 2 * PAD);
  }

  centreAt(st, u) { return this.yOf(catmull(st.pct, clamp(u, 0, st.n - 1)), this.st || st); }

  widthOf(st) { return st.width + (this.app.input.oneArm ? ONE_ARM_EXTRA : 0); }

  coinY(st, co) { return this.centreAt(st, co.u) + co.s * COIN_AMP * (this.widthOf(st) / 2); }

  // --- lifecycle --------------------------------------------------------
  enter() {
    this.cfgPromise.then((cfg) => {
      if (this.finished) return;
      this._build(cfg);
      if (!this.stages.length) { this.phase = "nodata"; this.pt = 0; return; }
      this.si = 0;
      this._prepStage();
      // first «Com es juga» (the stickman cards), then the first level card
      this.phase = "howto"; this.pt = 0; this.armed = false; this.raiseT = 0;
    }).catch((e) => { console.error("finaldemes setup", e); this.phase = "nodata"; this.pt = 0; });
  }

  exit() {}

  skip() { this._finish(); }

  _prepStage() {
    this.st = this.stages[this.si];
    this.stT = 0;
    this.u = 0;
    this.py = this.centreAt(this.st, 0);
    this.vy = 0;
    this.marge = 1;
    this.streak = 0; this.combo = 1;
    this.trail = [];
    this.grazeT = 0;
    this.touching = false;
    this.coinChain = 0;
    this.coinRun = 0;
  }

  _startPrep() { this.phase = "prep"; this.pt = 0; this.gateT = 0; this.app.transition(); }

  // gate passed with the hands in place: acknowledged on the € (by time-out: just the sound); then «Som-hi!»
  _startGo(byHands = true) {
    this.phase = "go"; this.pt = 0;
    if (byHands) this.app.ack({ x: PLAYER_X, y: this.py }); else this.app.sfx.select();
  }

  _startPlay() { this.phase = "play"; this.pt = 0; this.graceT = GRACE; this.vy = 0; }

  _uOf(t) { return (t / this.st.dur) * (this.st.n - 1); }

  _endStage(ok) {
    const st = this.st;
    st.result = ok ? "ok" : "fail";
    if (!ok) {
      const rest = Math.max(0, this.st.dur - this.stT);  // unplayed time counts as outside
      this.totalTime += rest; st.totT += rest;
    }
    this.app.sfx[ok ? "good" : "bad"]();
    if (ok) this.fx.burst(PLAYER_X, this.py, 14, [C.mustard, st.color]);
    this.armed = false;
    this.btnP = { retry: 0, next: 0 };
    this.btnArmed = { retry: false, next: false };
    this.pt = 0;
    this.phase = "card";   // after the last stage card comes the end screen (all lines together)
  }

  _finish() {
    if (this.finished) return;
    this.finished = true;
    if (!this.stages.length) {
      this.app.finishGame(GAME_ID, { score: 0, summary: T("finaldemes.resum.senseDades", "No hi ha dades disponibles per a aquest joc."), facts: [] });
      return;
    }
    const n = this.stages.length;
    const ok = this.stages.filter((s) => s.result === "ok").length;
    const score = this._score();
    this.app.finishGame(GAME_ID, {
      score,
      summary: T("finaldemes.resum.frase", "Has superat {ok} de {n} nivells i has estat dins del passadís el {pct} % del temps.", { ok, n, pct: score }),
      facts: this._facts(),
    });
  }

  _score() { return this.totalTime > 0 ? Math.round(clamp((100 * this.insideTime) / this.totalTime, 0, 100)) : 0; }

  _factFor(st) {
    const [subjFb, plural] = st.s && st.s.subjecte ? [st.s.subjecte, !!st.s.subjecte_plural] : SUBJ[st.id] || [`«${st.label}»`, false];
    const subj = T(`finaldemes.subjecte.${st.id}`, subjFb);
    const r = Math.round(st.finalPct);
    const vars = { pct: fmtNum(Math.abs(r)) };
    let verb;
    if (r === 0) verb = plural ? T("finaldemes.fet.igualPl", "s'han mantingut") : T("finaldemes.fet.igual", "s'ha mantingut");
    else if (r > 0) verb = plural ? T("finaldemes.fet.pujaPl", "han pujat un {pct}\u00A0%", vars) : T("finaldemes.fet.puja", "ha pujat un {pct}\u00A0%", vars);
    else verb = plural ? T("finaldemes.fet.baixaPl", "han baixat un {pct}\u00A0%", vars) : T("finaldemes.fet.baixa", "ha baixat un {pct}\u00A0%", vars);
    const txt = T("finaldemes.fet.frase", "Del {any0} al {any1}, {subjecte} {verb}.", { any0: st.years[0], any1: st.lastYear, subjecte: subj, verb });
    return { text: txt[0].toUpperCase() + txt.slice(1), source: this._cite(st, false) };
  }

  _facts() {
    const s = this.stages;
    const out = [this._factFor(s[s.length - 1])];
    if (s.length > 1) out.push(this._factFor(s[0]));
    return out;
  }

  // Compact "Org · Title" source name
  _srcShort(st) {
    const d = this.app.data || {};
    const id = st.s.font_id;
    const f = d.fontsById ? d.fontsById.get(id) : null;
    if (!f) return String(id || "—");
    let org = String(f.organisme || "");
    const acr = org.match(/\(([A-ZÀ-ÚÇ]{2,})\)\s*$/);
    if (acr) org = acr[1];
    else if (org.includes("/")) org = org.split("/").pop().trim();
    const tit = String(f.titol || "").split(/\s+–\s+|\.\s+|\s+\(|;/)[0].trim();
    return tit ? `${org} · ${tit}` : org;
  }

  // Full citation (facts) or compact form (on screen)
  _cite(st, short) {
    const d = this.app.data || {};
    if (short) return T("finaldemes.font", "Font: {font}", { font: this._srcShort(st) });
    const c = typeof d.cite === "function" ? d.cite(st.s.font_id) : "";
    return c || T("finaldemes.font", "Font: {font}", { font: this._srcShort(st) });
  }

  // --- update -----------------------------------------------------------
  // Ball height the hand is asking for (hand high = ball high); null if the hand is not visible
  _handTarget() {
    const c = this.app.input.primary();
    if (!c) return null;
    return clamp(c.y, PLAY_TOP + BALL_R, PLAY_BOT - BALL_R);
  }

  // Both hands as [left, right] on screen, when two-hand steering applies (camera, two arms,
  // two hands detected). null = steer with a single hand.
  _pair() {
    const inp = this.app.input;
    if (inp.usingMouse || inp.oneArm) return null;
    const cs = inp.cursors();
    if (cs.length < 2) return null;
    return cs[0].x <= cs[1].x ? [cs[0], cs[1]] : [cs[1], cs[0]];
  }

  // Slope of the line between the hands (> 0 = pointing up towards where the € is heading);
  // null when there is no usable line (one hand, or both hands on top of each other).
  _slope() {
    const p = this._pair();
    if (!p) return null;
    const dx = p[1].x - p[0].x;
    if (dx < TILT_SPAN) return null;
    return (p[0].y - p[1].y) / dx;
  }

  _steer(dt) {
    const slope = this._slope();
    let want;
    if (slope !== null) want = tiltSpeed(slope);
    else if (this._pair()) want = 0;      // hands together: no direction, hold the height
    else {
      const target = this._handTarget();
      want = target === null ? 0 : clamp((target - this.py) * FOLLOW_GAIN, -VMAX, VMAX);
    }
    this.vy += (want - this.vy) * Math.min(1, dt * INERTIA);
    this.py = clamp(this.py + this.vy * dt, PLAY_TOP + BALL_R, PLAY_BOT - BALL_R);
  }

  // Start gate: two hands apart and level, or (single hand) the hand on the €
  _handReady() {
    const slope = this._slope();
    if (slope !== null) return Math.abs(slope) < TILT_DEAD;
    if (this._pair()) return false;
    const target = this._handTarget();
    return target !== null && Math.abs(target - this.py) < GATE_PX;
  }

  // Raise-a-hand to continue, timed within this screen: the hand must have come down once (armed),
  // and only the time it is held up after the reading time counts (so a hand raised early, or the
  // gesture that resumed from the pause, does not skip the screen in one frame)
  _raiseToContinue(dt, minT, autoT) {
    const r = this.app.input.anyRaisedFor();
    if (r === 0) this.armed = true;
    this.raiseT = this.armed && this.pt > minT && r > 0 ? (this.raiseT || 0) + dt : 0;
    return this.raiseT >= RAISE_S || this.pt > autoT;
  }

  // Called by the app when play resumes after the pause: the hand raised to resume must come down
  onResume() { this.armed = false; this.raiseT = 0; this.btnArmed = { retry: false, next: false }; }

  update(dt) {
    if (this.finished) return;
    this.t += dt;
    this.pt += dt;
    this.fx.update(dt);
    this.hitSfxT = Math.max(0, this.hitSfxT - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt);
    const hurting = this.phase === "play" && this.touching;
    this.hurt = (this.hurt || 0) + ((hurting ? 1 : 0) - (this.hurt || 0)) * Math.min(1, dt * (hurting ? HURT_IN : HURT_OUT));
    this.beatPulse = Math.max(0, (this.beatPulse || 0) - dt * 3);
    this.grazeCool = Math.max(0, this.grazeCool - dt);
    if (this.popup) { this.popup.t += dt; if (this.popup.t > 0.9) this.popup = null; }
    for (const f of this.flying) f.t += dt;
    this.flying = this.flying.filter((f) => f.t < 0.3);
    this.bannerX = (this.bannerX || 0) + dt * (this.phase === "play" && this.st ? this.st.speed * BANNER_PARALLAX : BANNER_IDLE);

    if (this.phase === "loading") return;
    if (this.phase === "nodata") { if (this.pt > NODATA_DUR) this._finish(); return; }

    if (this.phase === "howto") {
      if (this._raiseToContinue(dt, HOWTO_MIN, HOWTO_AUTO)) { if (this.raiseT >= RAISE_S) this.app.ack(); this._startPrep(); }
    } else if (this.phase === "prep") {
      // hand-placement gate: ball locked at the corridor centre, nothing counts
      this.py = this.centreAt(this.st, 0); this.vy = 0;
      this.gateT = this._handReady() ? this.gateT + dt : 0;
      const minT = this.si === 0 && !this.st.retried ? GATE_MIN : GATE_MIN_NEXT;
      if (this.gateT >= GATE_HOLD && this.pt >= minT) this._startGo(true);
      else if (this.pt >= GATE_MAX) this._startGo(false);
    } else if (this.phase === "go") {
      this.py = this.centreAt(this.st, 0); this.vy = 0;
      if (this.pt >= GO_DUR) this._startPlay();
    } else if (this.phase === "play") {
      this._steer(dt);
      this._updatePlay(dt);
    } else if (this.phase === "final") {
      this._finalSound();
      if (this._raiseToContinue(dt, FINAL_MIN, FINAL_AUTO)) { if (this.raiseT >= RAISE_S) this.app.ack(); this._finish(); }
    } else if (this.phase === "card") {
      // a level lost for want of marge can be played again once; otherwise the result moves on by itself
      if (this._canRetry()) {
        const pick = this._pickOnCard(dt);
        if (pick) { const b = this._cardRects()[pick]; this.app.ack({ x: b.x + b.w / 2, y: b.y + b.h / 2 }); }
        if (pick === "retry") this._retryStage();
        else if (pick === "next" || this.pt > CARD_RETRY_AUTO) this._afterCard();
      } else if (this.pt > (this.stages[this.si].result === "ok" ? RESULT_DUR : RESULT_FAIL_DUR)) this._afterCard();
    }
  }

  _afterCard() {
    if (this.si >= this.stages.length - 1) {
      this.phase = "final"; this.pt = 0; this.armed = false; this.raiseT = 0;
      this.finalLine = 0; this.finalStamp = false;
      this.app.sfx.reveal();
    }
    else { this.si += 1; this._prepStage(); this._startPrep(); }
  }

  // When the campaign line appears on the end screen (after the last stage line is drawn)
  _finalPhraseT() { return FINAL_LINE_T0 + (this.stages.length - 1) * FINAL_LINE_GAP + FINAL_LINE_DUR + 0.3; }

  // End-screen sound, driven by the same clock as the drawing (so it waits while the game is paused):
  // each line is heard as it is drawn, then the campaign line lands with a stamp
  _finalSound() {
    const i = this.finalLine || 0;
    if (i < this.stages.length && this.pt >= FINAL_LINE_T0 + i * FINAL_LINE_GAP) {
      this.finalLine = i + 1;
      this.app.sfx.trend(trendNotes(this.stages[i].pct, this.lo, this.hi));
    }
    if (!this.finalStamp && this.pt >= this._finalPhraseT()) { this.finalStamp = true; this.app.sfx.stamp(); }
  }

  // A level is only offered again if it was lost and has not been retried yet
  _canRetry() {
    const st = this.stages[this.si];
    return !!st && st.result === "fail" && !st.retried;
  }

  // The two options on the card: hold a hand over one (or click it in mouse mode). Guarded against
  // picking by accident with the hands still in the steering pose: nothing counts during the reading
  // time, and a hand that was already over an option when the card appeared has to leave it first.
  _pickOnCard(dt) {
    const r = this._cardRects();
    const cs = this.app.input.cursors();
    this.btnArmed = this.btnArmed || { retry: false, next: false };
    for (const k of ["retry", "next"]) {
      const b = r[k];
      const over = cs.some((c) => inRect(c, b.x, b.y, b.w, b.h));
      if (!over) this.btnArmed[k] = true;
      const counts = over && this.btnArmed[k] && this.pt > CARD_PICK_MIN;
      this.btnP[k] = clamp(this.btnP[k] + (counts ? dt / CARD_DWELL : -dt * 2), 0, 1);
      if (this.app.input.consumeClick(b.x, b.y, b.w, b.h) && this.pt > CARD_PICK_MIN) this.btnP[k] = 1;
      if (this.btnP[k] >= 1) return k;
    }
    return null;
  }

  // Play the level again: the lost attempt leaves no trace in the score
  _retryStage() {
    const st = this.stages[this.si];
    st.retried = true;
    st.result = null;
    this.insideTime = Math.max(0, this.insideTime - st.inT);
    this.totalTime = Math.max(0, this.totalTime - st.totT);
    this.points = Math.max(0, this.points - st.pts);
    st.inT = 0; st.totT = 0; st.pts = 0; st.coinsGot = 0;
    for (const co of st.coins) co.got = false;
    this._prepStage();
    this._startPrep();
  }

  _updatePlay(dt) {
    const st = this.st;
    this.stT += dt;
    this.u = this._uOf(this.stT);
    this.trailT += dt;
    // time-based ring buffer for the trail (~0.4 s, ≤ 20 points); stored in world units so it scrolls with the chart
    if (this.trailT > 0.02) { this.trailT = 0; this.trail.push({ u: this.u, y: this.py, t: this.t }); }
    while (this.trail.length > 20 || (this.trail.length && this.t - this.trail[0].t > TRAIL_S)) this.trail.shift();
    if (this.graceT > 0) {
      this.graceT -= dt;
      this.touching = false;
      if (this.stT >= this.st.dur) this._endStage(true);
      return;
    }

    const c = this.centreAt(st, this.u);
    const half = this.widthOf(st) / 2;
    const dev = Math.abs(this.py - c);
    const inside = dev < half - BALL_R * 0.5;
    const wasTouching = this.touching;
    this.touching = !inside;
    this.totalTime += dt; st.totT += dt;
    if (inside) {
      this.insideTime += dt; st.inT += dt;
      this.marge = Math.min(1, this.marge + REGEN * dt);
      this.streak += dt;
      const combo = 1 + Math.min(4, Math.floor(this.streak / 3));
      if (combo > this.combo) this.combo = combo;
      this._addPts(dt * 10 * this.combo);
      if (half - BALL_R - dev < GRAZE_PX) {
        this.grazeT += dt;
        if (this.grazeT > 0.4 && this.grazeCool <= 0) {
          this._addPts(GRAZE_PTS * this.combo);
          this.grazeCool = 1.5; this.grazeT = 0;
        }
      } else this.grazeT = 0;
    } else {
      this.marge -= DRAIN * dt;
      this.streak = 0; this.combo = 1; this.grazeT = 0;
      if (!wasTouching && this.hitSfxT <= 0) {
        this.app.sfx.hit();
        this.hitSfxT = 0.7;
        this.shake = 0.35; this.flash = 0.3;
        this.beatT = 0.3;   // the first heartbeat right after the hit
      }
      this.beatT = (this.beatT || 0) - dt;
      if (this.beatT <= 0) {
        const danger = 1 - clamp(this.marge, 0, 1);
        this.app.sfx.heartbeat(danger);
        this.beatPulse = 1;
        this.beatT = BEAT_SLOW + (BEAT_FAST - BEAT_SLOW) * danger;
      }
    }
    for (const co of st.coins) {
      if (co.got !== false) continue;
      const dx = (co.u - this.u) * st.ppy;
      if (dx < -BALL_R - 20) { co.got = "missed"; this.coinChain = 0; this.coinRun = 0; continue; }   // missed: keeps scrolling, faded
      if (Math.abs(dx) < BALL_R + 20 && Math.abs(this.coinY(st, co) - this.py) < BALL_R + 12) {
        co.got = true; st.coinsGot += 1;
        this.flying.push({ u: co.u, y: this.coinY(st, co), t: 0 });
        this.coinChain = Math.min(5, this.coinChain + 1);
        this._addPts(COIN_PTS * this.coinChain);
        this.app.sfx.coin(this.coinRun++);   // a run of coins climbs the scale; a missed one restarts it
      }
    }
    if (this.marge <= 0) { this.marge = 0; this._endStage(false); return; }
    if (this.stT >= this.st.dur) this._endStage(true);
  }

  _addPts(p) { this.points += p; this.st.pts += p; }

  _popup(str, colorKey) { this.popup = { text: str, colorKey, t: 0 }; }

  // --- drawing ----------------------------------------------------------
  draw(g) {
    this.app.drawSilhouette(g, { alpha: 0.06 });
    if (this.phase === "loading") { text(g, T("finaldemes.carregant", "Carregant…"), W / 2, H / 2, { size: 48, align: "center", color: C.inkSoft }); return; }
    if (this.phase === "nodata") { this._drawNoData(g); return; }
    if (this.phase === "final") { this._drawFinal(g); return; }
    if (this.phase === "howto") { this._drawHowto(g); return; }

    const st = this.st;
    // the chart sits on a panel of its own (so it reads as a graph, not as a dark screen); the
    // corridor is a white «road» (card colours) with dark edges. Lines of levels already played are
    // drawn ON TOP of the road, so they stay visible where they cross it. Data drawn inside the road
    // (current line, coins, ball, labels) uses the card roles; what lies on the field uses the bg roles.
    g.save();
    if (this.shake > 0 || this.hurt > 0.01) {
      // a hit jolts the screen; while outside it keeps trembling, harder as the marge runs out
      const a = 12 * (this.shake / 0.35) + this.hurt * (1.5 + 4 * (1 - clamp(this.marge, 0, 1)));
      g.translate(Math.sin(this.t * 55) * a, Math.cos(this.t * 47) * a * 0.6);
    }
    this._drawGrid(g, st);
    this._drawSpeed(g, st);
    this._tags = [];
    this._drawCorridor(g, st);
    this._drawGhosts(g, st);
    onCard(() => {
      this._drawDataLine(g, st);
      this._drawCoins(g, st);
      this._drawTags(g);
    });
    this._drawYears(g, st);
    onCard(() => this._drawBall(g, st));
    // coin sparks stay inside the play area (never fall into the footer / ◀ ▶ corners)
    g.save(); g.beginPath(); g.rect(0, PLAY_TOP, W, PLAY_H); g.clip(); this.fx.draw(g); g.restore();
    g.restore();
    // the level card goes under the hands: the player has to see them to line them up
    if (this.phase === "prep") onCard(() => this._drawPrep(g));
    this._drawHandLink(g);
    this.app.drawCursors(g, { alpha: 0.6 });
    this._drawHud(g, st);
    this._drawFlyingCoins(g);
    this._drawFooter(g, st);
    onCard(() => {
      if (this.phase === "card") this._drawCard(g);
    });
    // on the card with options the hand goes on top: it is what you aim at the buttons with
    if (this.phase === "card" && this._canRetry()) this.app.drawCursors(g, { alpha: 0.9 });
    if (this.phase === "go") this._drawGo(g);
  }

  _xOfU(st, uu) { return PLAYER_X + (uu - this.u) * st.ppy; }

  // Outside the corridor, over the whole canvas (letterbox margins included; called by the app in
  // device pixels): a matte red, no glow. The screen's own colours are pulled towards a dusty brick
  // red (multiply: whites turn red, nothing gets lighter) and recoloured red (keeping light and dark),
  // and the edges burn darker; all deeper as the marge drains, swelling on each heartbeat and on the
  // jolt of a hit.
  drawScreen(g, w, h) {
    const k = this.hurt || 0;
    if (k < 0.01) return;
    const danger = 1 - clamp(this.marge, 0, 1), pulse = this.beatPulse || 0, jolt = this.flash / 0.3;
    const amt = clamp(k * (0.45 + 0.3 * danger + 0.1 * pulse + 0.15 * jolt), 0, 1);
    g.globalCompositeOperation = "multiply";
    g.fillStyle = mixHex("#FFFFFF", HURT_RED_LIGHT, amt);
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "color";
    g.globalAlpha = 0.75 * amt;
    g.fillStyle = HURT_RED;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "multiply";
    const r = Math.hypot(w, h) / 2;
    const grad = g.createRadialGradient(w / 2, h / 2, r * (0.6 - 0.22 * danger - 0.05 * pulse), w / 2, h / 2, r);
    grad.addColorStop(0, "#FFFFFF");
    grad.addColorStop(1, mixHex("#FFFFFF", HURT_RED_DARK, clamp(k * (0.55 + 0.35 * danger), 0, 1)));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "source-over";
  }

  _drawGrid(g, st) {
    g.save();
    g.beginPath(); g.rect(0, PLAY_TOP, W, PLAY_H); g.clip();
    // panel behind the chart: a lighter field than the page, so the whole thing reads as a graph
    g.fillStyle = C.paper2;
    g.fillRect(0, PLAY_TOP, W, PLAY_H);
    this._drawBanner(g);
    g.strokeStyle = C.ink;
    for (let p = st.lo; p <= st.hi + 1e-6; p += st.step) {
      const y = this.yOf(p, st);
      g.globalAlpha = p === 0 ? 0.6 : 0.24;
      g.lineWidth = p === 0 ? 3 : 2;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    g.restore();
    // top edge of the panel (the bottom one is the years axis)
    g.save();
    g.globalAlpha = 0.5; g.strokeStyle = C.ink; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, PLAY_TOP + 1); g.lineTo(W, PLAY_TOP + 1); g.stroke();
    g.restore();
  }

  // «VIURE ENS COSTA LA VIDA» marquee: two rows half a block apart, always drifting left (called
  // inside the play-area clip of _drawGrid, before the gridlines)
  _drawBanner(g) {
    const str = T("finaldemes.banner", "Viure ens costa la vida");
    const span = measure(g, str, BANNER_SIZE, "title") + BANNER_GAP;
    const rows = [PLAY_TOP + PLAY_H * 0.36, PLAY_TOP + PLAY_H * 0.86];
    rows.forEach((y, i) => {
      const off = (((this.bannerX || 0) + i * span / 2) % span + span) % span;
      for (let x = -off; x < W; x += span) text(g, str, x, y, { size: BANNER_SIZE, kind: "title", color: C.ink, alpha: BANNER_ALPHA });
    });
  }

  _drawGridLabels(g, st) {
    for (let p = st.lo; p <= st.hi + 1e-6; p += st.step) {
      const y = this.yOf(p, st);
      if (y < PLAY_TOP + 20 || y > PLAY_BOT - 4) continue;
      // small field-coloured chip so the label stays legible where it crosses the white road
      const lab = fmtPct(p), lw = measure(g, lab, 28, "body", 700);
      g.fillStyle = C.paper; g.fillRect(LAYOUT.m - 8, y - 40, lw + 16, 38);
      text(g, lab, LAYOUT.m, y - 10, { size: 28, weight: 700, color: C.ink });
    }
  }

  _drawCorridor(g, st) {
    const xs = [], tops = [], bots = [];
    const half = this.widthOf(st) / 2;
    for (let x = -10; x <= W + 10; x += 10) {
      const c = this.centreAt(st, this.u + (x - PLAYER_X) / st.ppy);
      xs.push(x); tops.push(c - half); bots.push(c + half);
    }
    g.save();
    g.beginPath(); g.rect(0, PLAY_TOP, W, PLAY_H); g.clip();
    g.beginPath();
    xs.forEach((x, i) => (i ? g.lineTo(x, tops[i]) : g.moveTo(x, tops[i])));
    for (let i = xs.length - 1; i >= 0; i--) g.lineTo(xs[i], bots[i]);
    g.closePath();
    withAlpha(g, 0.94, () => { g.fillStyle = C.card; g.fill(); });
    const outside = (edge, toward) => {
      g.save();
      g.beginPath(); g.moveTo(xs[0], toward);
      xs.forEach((x, i) => g.lineTo(x, edge[i]));
      g.lineTo(xs[xs.length - 1], toward); g.closePath();
      g.clip();
      // calm, static tint outside the road (a moving hatch was tiring on saturated fields)
      g.globalAlpha = 0.35;
      g.fillStyle = C.paper2;
      g.fillRect(-48, PLAY_TOP - 10, W + 96, PLAY_H + 20);
      g.restore();
    };
    outside(tops, PLAY_TOP - 5);
    outside(bots, PLAY_BOT + 5);
    g.strokeStyle = C.cardLine; g.lineWidth = 5; g.lineJoin = "round";
    for (const arr of [tops, bots]) { g.beginPath(); xs.forEach((x, i) => (i ? g.lineTo(x, arr[i]) : g.moveTo(x, arr[i]))); g.stroke(); }
    g.restore();
  }

  // Samples on a fixed u grid plus the exact end points, so the line never "swims" or jumps
  // at its ends while scrolling (the old fixed-step loop from a moving start did).
  _linePath(g, st, xOf, uFrom, uTo, ppy) {
    const step = Math.max(0.004, 8 / ppy);
    g.beginPath();
    g.moveTo(xOf(uFrom), this.yOf(catmull(st.pct, uFrom)));
    for (let k = Math.floor(uFrom / step) + 1; k * step < uTo; k++) {
      const uu = k * step;
      g.lineTo(xOf(uu), this.yOf(catmull(st.pct, uu)));
    }
    g.lineTo(xOf(uTo), this.yOf(catmull(st.pct, uTo)));
  }

  _drawGhosts(g, cur) {
    g.save();
    g.beginPath(); g.rect(0, PLAY_TOP, W, PLAY_H); g.clip();
    const xOfYear = (yr) => PLAYER_X + (yr - (this.base + this.u)) * cur.ppy;
    for (let i = 0; i < this.si; i++) {
      const st = this.stages[i];
      const xOf = (uu) => xOfYear(st.years[0] + uu);
      g.save();
      g.globalAlpha = 0.95;
      g.lineCap = "round"; g.lineJoin = "round";
      // dark casing first, so the line separates both from the panel and from the white road
      g.strokeStyle = C.paper; g.lineWidth = 13; g.globalAlpha = 0.35;
      this._linePath(g, st, xOf, 0, st.n - 1, cur.ppy); g.stroke();
      g.globalAlpha = 0.95;
      g.strokeStyle = st.color; g.lineWidth = 7; g.setLineDash(st.dash);
      this._linePath(g, st, xOf, 0, st.n - 1, cur.ppy); g.stroke();
      g.setLineDash([]);
      g.fillStyle = st.color;
      for (let k = 0; k < st.n; k++) marker(g, st.marker, xOf(k), this.yOf(st.pct[k]), 8);
      g.restore();
      const xe = xOf(st.n - 1);
      if (xe > 40) {
        const x = Math.min(xe, W - 20);
        const uu = clamp((x - xOfYear(st.years[0])) / cur.ppy, 0, st.n - 1);
        this._tags.push({ str: T("finaldemes.etiquetaFinal", "{etapa} {pct} ({any})", { etapa: st.label, pct: fmtPct(st.finalPct), any: st.lastYear }),
          x, y: this.yOf(catmull(st.pct, uu)) - 16, st, size: 28 });
      }
    }
    g.restore();
  }

  _drawDataLine(g, st) {
    const xOf = (uu) => this._xOfU(st, uu);
    const uFrom = Math.max(0, this.u - PLAYER_X / st.ppy - 0.2), uTo = Math.min(st.n - 1, this.u + (W - PLAYER_X) / st.ppy + 0.2);
    if (uTo < uFrom) return;
    g.save();
    g.beginPath(); g.rect(0, PLAY_TOP, W, PLAY_H); g.clip();
    g.strokeStyle = st.color; g.lineWidth = 6; g.lineCap = "round"; g.lineJoin = "round";
    this._linePath(g, st, xOf, uFrom, uTo, st.ppy); g.stroke();
    g.fillStyle = st.color;
    for (let k = Math.ceil(uFrom); k <= Math.floor(uTo); k++) marker(g, st.marker, xOf(k), this.yOf(st.pct[k]), 8);
    g.restore();
  }

  // Right-aligned line labels, pushed apart vertically so they never overlap (idempotent)
  _layoutTags() {
    const tags = this._tags.sort((a, b) => a.y - b.y);
    for (let i = 1; i < tags.length; i++) {
      const p = tags[i - 1], q = tags[i];
      if (Math.abs(p.x - q.x) < 500 && q.y - p.y < 50) q.y = p.y + 50;
    }
    return tags;
  }

  _drawTags(g) {
    for (const t of this._layoutTags()) tag(g, t.str, t.x, clamp(t.y, PLAY_TOP + 40, PLAY_BOT - 14), t.st.ink, t.st.color, { size: t.size, align: "right" });
  }

  _drawCoins(g, st) {
    if (this.phase === "card") return;
    // coins hidden under an (opaque) ghost-line label are not drawn
    const under = this._layoutTags().map((t) => {
      const w = measure(g, t.str, t.size, "body", 700) + 20, y = clamp(t.y, PLAY_TOP + 40, PLAY_BOT - 14);
      return { x0: t.x - w - 17, x1: t.x + 17, y0: y - t.size - 19, y1: y + 31 };
    });
    for (const co of st.coins) {
      if (co.got === true) continue;
      const x = this._xOfU(st, co.u);
      if (x < -40 || x > W + 40) continue;
      const y = this.coinY(st, co);
      if (under.some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1)) continue;
      g.save();
      if (co.got === "missed") g.globalAlpha = 0.35;
      g.fillStyle = C.mustard;
      g.beginPath(); g.arc(x, y, 17, 0, Math.PI * 2); g.fill();
      g.lineWidth = 3; g.strokeStyle = C.ink; g.stroke();
      g.restore();
      g.save(); if (co.got === "missed") g.globalAlpha = 0.35;
      centerText(g, "€", x, y, { size: 24, weight: 700, color: C.ink });
      g.restore();
    }
  }

  // Years as milestones going past: a faint post across the chart at each year, and a label that
  // grows as it nears the € (peaks on it) and shrinks as it moves away, smoothly (no pop)
  _drawYears(g, st) {
    g.save();
    g.beginPath(); g.rect(0, PLAY_TOP, W, PLAY_H); g.clip();
    g.strokeStyle = C.ink; g.lineWidth = 3; g.globalAlpha = 0.14; g.setLineDash([4, 14]);
    for (let k = 0; k < st.n; k++) {
      const x = this._xOfU(st, k);
      if (x < -10 || x > W + 10) continue;
      g.beginPath(); g.moveTo(x, PLAY_TOP); g.lineTo(x, PLAY_BOT); g.stroke();
    }
    g.restore();
    g.save();
    g.strokeStyle = C.ink; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, PLAY_BOT); g.lineTo(W, PLAY_BOT); g.stroke();
    for (let k = 0; k < st.n; k++) {
      const x = this._xOfU(st, k);
      if (x < -120 || x > W + 120) continue;   // labels slide all the way off screen (they sit above the footer row)
      const near = clamp(1 - Math.abs(x - PLAYER_X) / 420, 0, 1);
      const e = near * near * (3 - 2 * near);
      g.beginPath(); g.moveTo(x, PLAY_BOT); g.lineTo(x, PLAY_BOT + 12 + 8 * e); g.stroke();
      text(g, String(st.years[k]), x, PLAY_BOT + 46 + 10 * e, { size: Math.round(36 + 22 * e), kind: "title", align: "center", color: e > 0.5 ? C.ink : C.inkSoft });
    }
    g.restore();
    this._drawGridLabels(g, st);
  }

  _drawBall(g, st) {
    const hurt = this.phase === "play" && this.touching;
    g.save();
    // one smooth tapered ribbon (amber, red while touching the edge) with a light core, ending under the ball
    if (this.trail.length) {
      const pts = this.trail.map((p) => ({ x: this._xOfU(st, p.u), y: p.y }));
      pts.push({ x: PLAYER_X, y: this.py });
      drawTrail(g, pts, { width: BALL_R * 1.7, color: hurt ? C.red : C.mustard, alpha: 0.8, core: C.white, coreAlpha: 0.7 });
    }
    g.globalAlpha = 0.25;
    g.fillStyle = C.ink;
    g.beginPath(); g.arc(PLAYER_X + 4, this.py + 6, BALL_R, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = hurt ? C.red : C.mustard;
    g.beginPath(); g.arc(PLAYER_X, this.py, BALL_R, 0, Math.PI * 2); g.fill();
    g.lineWidth = 5; g.strokeStyle = C.ink; g.stroke();
    // steady shield ring while locked or invulnerable (no blinking)
    if (this.phase === "go" || (this.phase === "play" && this.graceT > 0)) {
      g.lineWidth = 5; g.strokeStyle = C.teal;
      g.beginPath(); g.arc(PLAYER_X, this.py, BALL_R + 10, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
    centerText(g, "€", PLAYER_X, this.py, { size: 32, weight: 700, color: hurt ? C.white : C.ink });
  }

  // Coin pickup: one small soft ring at the coin (it scrolls with the chart), no flying coins
  _drawFlyingCoins(g) {
    const st = this.st;
    if (!st) return;
    for (const f of this.flying) {
      const k = clamp(f.t / 0.3, 0, 1);
      g.save();
      g.globalAlpha = 0.6 * (1 - k);
      g.lineWidth = 4; g.strokeStyle = C.mustard;
      g.beginPath(); g.arc(this._xOfU(st, f.u), f.y, 17 + 16 * easeOut(k), 0, Math.PI * 2); g.stroke();
      g.restore();
    }
  }

  _drawHandLink(g) {
    const p = this._pair();
    if (p) { this._drawTiltBar(g, p); return; }
    const c = this.app.input.primary();
    if (!c) return;
    g.save();
    g.globalAlpha = 0.25;
    g.strokeStyle = C.blue; g.lineWidth = 4; g.setLineDash([6, 12]); g.lineCap = "round";
    g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(PLAYER_X + (c.x > PLAYER_X ? BALL_R + 8 : -BALL_R - 8), this.py); g.stroke();
    g.restore();
  }

  // The steering line drawn between both hands, plus what it is asking of the € right now
  // (a chevron above or below the ball, a flat dash while the line is level).
  _drawTiltBar(g, [l, r]) {
    const dx = r.x - l.x;
    const slope = dx >= TILT_SPAN ? (l.y - r.y) / dx : 0;
    const v = dx >= TILT_SPAN ? tiltSpeed(slope) : 0;
    const col = v === 0 ? C.teal : C.mustard;
    g.save();
    g.lineCap = "round";
    g.globalAlpha = 0.45;
    g.strokeStyle = col; g.lineWidth = 10;
    g.beginPath(); g.moveTo(l.x, l.y); g.lineTo(r.x, r.y); g.stroke();
    g.globalAlpha = 0.75;
    const k = clamp(Math.abs(v) / TILT_VMAX, 0, 1);
    g.fillStyle = col;
    if (v === 0) g.fillRect(PLAYER_X - 26, this.py - BALL_R - 34, 52, 8);
    else {
      const up = v < 0, y = this.py + (up ? -1 : 1) * (BALL_R + 22 + 14 * k), s = 16 + 10 * k;
      g.beginPath();
      g.moveTo(PLAYER_X, y + (up ? -s : s));
      g.lineTo(PLAYER_X + s * 1.1, y + (up ? s * 0.5 : -s * 0.5));
      g.lineTo(PLAYER_X - s * 1.1, y + (up ? s * 0.5 : -s * 0.5));
      g.closePath(); g.fill();
    }
    g.restore();
  }

  // Level chips: the current one in its own colour with icon + name; played ones show the real rise
  // they ended at (a running comparison); the ones to come are just their icon.
  _drawChips(g, x, y) {
    const h = 54, ic = 38, pad = 14;
    g.save();
    for (let i = 0; i < this.stages.length; i++) {
      const st = this.stages[i];
      const cur = i === this.si;
      const done = st.result !== null && !cur;
      const str = cur ? st.label : done ? fmtPct(st.finalPct) : "";
      onCard(() => {
        const tw = str ? measure(g, str, 28, "body", 800) + 10 : 0;
        const w = pad + ic + tw + pad;
        const light = COLOR_KEYS[st.k] === "mustard";
        const fg = cur ? (light ? C.cardInk : C.white) : done ? C.cardInk : C.cardInkSoft;
        g.save();
        if (!cur && !done) g.globalAlpha *= 0.7;
        g.fillStyle = cur ? st.color : done ? st.soft : C.card;
        rrect(g, x, y, w, h, h / 2); g.fill();
        g.lineWidth = 3; g.strokeStyle = cur ? C.card : st.color; g.stroke();
        drawPicto(g, st.picto, x + pad + ic / 2, y + h / 2, ic, { ink: fg, lw: 0.1 });
        g.restore();
        if (str) text(g, str, x + pad + ic + 8, y + h / 2 + 10, { size: 28, weight: 800, color: fg });
        x += w + 10;
      });
    }
    g.restore();
    return x;
  }

  // How much longer the € can stay out of the corridor, as a row of segments next to a small €:
  // a life bar reads at a glance and needs no word (it empties in ~3 s and refills slowly).
  _drawMarge(g, bx, y) {
    const m = clamp(this.marge, 0, 1);
    const r = 24, gap = 10, sw = 34, sh = 44, sy = y + 3;
    const col = m < 0.4 ? C.red : C.teal;
    onCard(() => {
      g.save();
      // the € that is losing ground, same look as the ball
      g.fillStyle = C.mustard;
      g.beginPath(); g.arc(bx + r, y + 25, r, 0, Math.PI * 2); g.fill();
      g.lineWidth = 4; g.strokeStyle = C.cardInk; g.stroke();
      g.restore();
      centerText(g, "€", bx + r, y + 25, { size: 30, weight: 700, color: C.cardInk });
      for (let i = 0; i < MARGE_SEG; i++) {
        const x0 = bx + 2 * r + 16 + i * (sw + gap);
        const f = clamp(m * MARGE_SEG - i, 0, 1);      // the segment being spent drains smoothly
        g.save();
        g.fillStyle = C.card; rrect(g, x0, sy, sw, sh, 4); g.fill();
        if (f > 0) {
          g.save(); rrect(g, x0, sy, sw, sh, 4); g.clip();
          g.fillStyle = col; g.fillRect(x0, sy + sh * (1 - f), sw, sh * f);
          g.restore();
        }
        g.lineWidth = 3; g.strokeStyle = C.cardInk; rrect(g, x0, sy, sw, sh, 4); g.stroke();
        g.restore();
      }
    });
  }

  _drawHud(g, st) {
    const y = 26;
    const x = this._drawChips(g, LAYOUT.m, y);
    const bx = Math.max(x + 24, 960);
    // marge only while it matters (outside the corridor or still refilling); hidden on the stage cards
    if (this.phase === "play" && (this.touching || this.marge < 0.999)) this._drawMarge(g, bx, y);
    const shown = clamp(Math.round(this.u), 0, st.n - 1);
    // the rise is the data: big, in the level colour; the year is its context
    const yr = String(st.years[shown]);
    text(g, yr, W - LAYOUT.m, y + 60, { size: 48, kind: "title", align: "right", color: C.inkSoft });
    text(g, fmtPct(st.pct[shown]), W - LAYOUT.m - measure(g, yr, 48, "title") - 24, y + 72, { size: 88, kind: "title", align: "right", color: st.ink });
  }

  // «Com es juga»: the stickman cards (two hands tilt the line; one hand sets the height), the rule
  // of the game under them, and «raise a hand» to start (it pulses if nobody reacts)
  _drawHowto(g) {
    const inp = this.app.input;
    const oneHand = inp.usingMouse || !!inp.oneArm;
    const L = drawTutorial(g, {
      title: T("joc.finaldemes", "Final de mes"),
      block: T("finaldemes.com_es_juga", "Com es juga"),
      explain: oneHand
        ? T("finaldemes.com.text_una", "Viu l'augment del cost de la vida: movent la mà amunt o avall, guia verticalment l'€ al llarg dels anys i mantén-te a prop de l'increment dels preus des del 2015. Pots reintentar una vegada cada nivell.")
        : T("finaldemes.com.text", "Viu l'augment del cost de la vida: inclinant la recta entre les teves mans, guia verticalment l'€ al llarg dels anys i mantén-te a prop de l'increment dels preus des del 2015. Pots reintentar una vegada cada nivell."),
      t: this.pt,
      cards: finaldemesCards(oneHand, T),
    });
    drawFinaldemesGoal(g, T("finaldemes.com.objectiu", "Mantén l'€ dins de l'àrea"), L.goalY);
    if (this.pt > HOWTO_MIN) {
      const mouse = inp.usingMouse;
      const r = clamp((this.raiseT || 0) / RAISE_S, 0, 1);
      drawFooterHint(g, T("finaldemes.com.continua", "Aixeca la mà per començar"), r,
        { mouse, waitT: this.pt - HOWTO_MIN });
    }
    this.app.drawCursors(g, { alpha: 0.7 });
  }

  _drawFooter(g, st) {
    fitText(g, this._cite(st, true), W / 2, LAYOUT.navY + 8, LAYOUT.footW - 120, { size: 24, minSize: 18, color: C.inkSoft, align: "center" });
  }

  // Level announcement + hand-placement gate. Hierarchy: why (the campaign kicker), which trend
  // (icon + name in its colour), then the gesture, small. Stays up at least GATE_MIN(_NEXT).
  _drawPrep(g) {
    const a = easeOut(this.pt / 0.3);
    const st = this.st;
    const pulse = Math.sin(this.t * Math.PI * 2) * 6;   // smooth 1 Hz size pulse, no blinking
    g.save(); g.globalAlpha = a;
    g.lineWidth = 5; g.strokeStyle = C.teal;
    g.beginPath(); g.arc(PLAYER_X, this.py, BALL_R + 22 + pulse, 0, Math.PI * 2); g.stroke();
    g.restore();
    ring(g, PLAYER_X, this.py, BALL_R + 42, clamp(this.gateT / GATE_HOLD, 0, 1), { color: C.teal, lw: 10 });
    const msg = this._pair()
      ? T("finaldemes.colocaDues", "Posa les dues mans en línia")
      : T("finaldemes.coloca", "Col·loca't sobre l'€");
    const w = 1140, h = 350, x = (W - w) / 2 + 170, y = PLAY_TOP + (PLAY_H - h) / 2 - 30;
    onCard(() => {
      g.save();
      g.globalAlpha *= a;
      panel(g, x, y, w, h, {});
      fitText(g, T("finaldemes.kicker", "Viu l'augment del cost de la vida"), x + 50, y + 78, w - 100,
        { size: 46, weight: 800, color: C.ink });
      const r = 66, cx = x + 50 + r, cy = y + 182;
      drawPictoBadge(g, st.picto, cx, cy, r, { fill: st.color, ink: this._badgeInk(st) });
      const tx = cx + r + 36, tw = x + w - 50 - tx;
      text(g, T("finaldemes.nivellDe", "Nivell {n} de {total}", { n: this.si + 1, total: this.stages.length }), tx, y + 152,
        { size: 30, kind: "ample", color: C.inkSoft, maxW: tw });
      fitText(g, st.label, tx, y + 232, tw, { size: 92, kind: "title", color: st.ink, minSize: 48 });
      fitText(g, msg, x + 50, y + 312, w - 100, { size: 34, weight: 700, color: C.inkSoft });
      g.restore();
    });
  }

  // Pictogram colour on a badge filled with the level colour (mustard is too light for white)
  _badgeInk(st) { return COLOR_KEYS[st.k] === "mustard" ? C.cardInk : C.white; }

  _drawGo(g) {
    const k = clamp(this.pt / GO_DUR, 0, 1);
    text(g, T("finaldemes.somhi", "Som-hi!"), W / 2 + 160, PLAY_TOP + PLAY_H / 2 + 50, { size: 150, kind: "title", align: "center", color: C.teal, alpha: 1 - k * k, maxW: W - 400 });
  }

  // Sense of speed: subtle parallax ticks on the % gridlines (no streaks, no flashing)
  _drawSpeed(g, st) {
    if (this.phase !== "play") return;
    const sx = this.u * st.ppy;
    g.save();
    g.beginPath(); g.rect(0, PLAY_TOP, W, PLAY_H); g.clip();
    g.strokeStyle = C.ink; g.lineCap = "round";
    // far layer: ticks on the % gridlines at half speed
    g.globalAlpha = 0.18; g.lineWidth = 3;
    for (let p = st.lo; p <= st.hi + 1e-6; p += st.step) {
      const y = this.yOf(p, st);
      for (let x = -((sx * 0.5) % 160); x < W; x += 160) { g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x, y + 7); g.stroke(); }
    }
    g.restore();
  }

  // Geometry of the card with the two options (retry / go on), shared by update and draw
  _cardRects() {
    const w = 1000, h = 476;
    const x = (W - w) / 2 + 160, y = PLAY_TOP + (PLAY_H - h) / 2;
    const bw = (w - 3 * 40) / 2, bh = 96, by = y + 328;
    return { x, y, w, h, retry: { x: x + 40, y: by, w: bw, h: bh }, next: { x: x + 80 + bw, y: by, w: bw, h: bh } };
  }

  // One option: the hold fills it from the left, as on the «FIXA-HO» buttons of the first game
  _drawCardButton(g, b, label, p, accent) {
    g.save();
    g.fillStyle = C.card; rrect(g, b.x, b.y, b.w, b.h, 6); g.fill();
    if (p > 0) {
      g.save(); rrect(g, b.x, b.y, b.w, b.h, 6); g.clip();
      g.fillStyle = accent; g.fillRect(b.x, b.y, b.w * p, b.h);
      g.restore();
    }
    g.lineWidth = 4; g.strokeStyle = accent; rrect(g, b.x, b.y, b.w, b.h, 6); g.stroke();
    g.restore();
    // label twice: card ink over the empty part, white over the filled one
    const draw = (color) => fitText(g, label, b.x + b.w / 2, b.y + b.h / 2 + 14, b.w - 36,
      { size: 40, weight: 700, align: "center", color });
    g.save(); g.beginPath(); g.rect(b.x + b.w * p, b.y, b.w * (1 - p), b.h); g.clip(); draw(C.cardInk); g.restore();
    if (p > 0) { g.save(); g.beginPath(); g.rect(b.x, b.y, b.w * p, b.h); g.clip(); draw(C.white); g.restore(); }
  }

  // The result of a level is the real rise, not the game outcome: icon, «Salaris, del 2015 al 2024»
  // and a huge «+30 %» in the level colour. A loss only adds a red line above it; a win, a small check.
  // (x, y) = top-left of the content row; returns nothing.
  _drawResultRow(g, st, x, y, w, ok) {
    const r = 70, cx = x + r, cy = y + 104;
    drawPictoBadge(g, st.picto, cx, cy, r, { fill: st.color, ink: this._badgeInk(st) });
    if (ok) drawOkBadge(g, cx + r * 0.74, cy - r * 0.74, 24);
    const tx = cx + r + 40, tw = x + w - tx;
    const head = st.label, sub = T("finaldemes.periode", "del {any0} al {any1}", { any0: st.years[0], any1: st.lastYear });
    const full = measure(g, head, 42, "body", 800) + 42 * 0.4 + measure(g, sub, 36, "body", 600);
    const hs = full > tw ? Math.max(24, (42 * tw) / full) : 42;
    text(g, head, tx, y + 44, { size: hs, weight: 800, color: C.ink });
    text(g, sub, tx + measure(g, head, hs, "body", 800) + hs * 0.4, y + 44, { size: hs * 0.86, weight: 600, color: C.inkSoft });
    fitText(g, fmtPct(st.finalPct), tx, y + 178, tw, { size: 150, kind: "title", color: st.ink, minSize: 80 });
  }

  // Thin bar that fills while the card waits: it carries on by itself (nothing blocks the installation)
  _drawAutoBar(g, x, y, w, k) {
    g.fillStyle = C.cardSoft; g.fillRect(x, y, w, 6);
    g.fillStyle = C.cardInkSoft; g.fillRect(x, y, w * clamp(k, 0, 1), 6);
  }

  _drawFailHead(g, x, y, w) {
    withAlpha(g, 0.18, () => { g.fillStyle = hatch(g, C.red, null, 22, 5); rrect(g, x, y, w, 30, 6); g.fill(); });
    fitText(g, T("finaldemes.senseMarge", "No li has pogut seguir el ritme al mercat!"), x + 50, y + 86, w - 100,
      { size: 40, weight: 800, color: C.red, minSize: 26 });
  }

  // Lost level, first time: the result plus «play it again» / «carry on» (hold a hand over one)
  _drawRetryCard(g, st, a) {
    const r = this._cardRects();
    g.save(); g.globalAlpha = a;
    panel(g, r.x, r.y, r.w, r.h, {});
    this._drawFailHead(g, r.x, r.y, r.w);
    this._drawResultRow(g, st, r.x + 50, r.y + 104, r.w - 100, false);
    this._drawCardButton(g, r.retry, T("finaldemes.reintenta", "Torna-ho a provar"), this.btnP.retry, C.teal);
    this._drawCardButton(g, r.next, T("finaldemes.continua", "Continua"), this.btnP.next, C.cardLine);
    this._drawAutoBar(g, r.x + 40, r.y + r.h - 26, r.w - 80, this.pt / CARD_RETRY_AUTO);
    g.restore();
  }

  _drawCard(g) {
    const st = this.stages[this.si];
    const ok = st.result === "ok";
    const a = easeOut(this.pt / 0.3);
    if (this._canRetry()) { this._drawRetryCard(g, st, a); return; }
    const w = 1000, h = ok ? 290 : 370;
    const x = (W - w) / 2 + 160, y = PLAY_TOP + (PLAY_H - h) / 2;
    g.save(); g.globalAlpha = a;
    panel(g, x, y, w, h, {});
    if (!ok) this._drawFailHead(g, x, y, w);
    this._drawResultRow(g, st, x + 50, y + (ok ? 30 : 104), w - 100, ok);
    this._drawAutoBar(g, x + 40, y + h - 26, w - 80, this.pt / (ok ? RESULT_DUR : RESULT_FAIL_DUR));
    g.restore();
  }

  // End screen: every stage line on one % scale since the base year, drawn one after another
  // (left -> right), labelled with its final % and year; then one campaign line and the sources.
  _drawFinal(g) {
    const m = LAYOUT.m;
    const fade = easeOut(this.pt / 0.4);
    text(g, T("finaldemes.final.titol", "Quant ha pujat des del {any}", { any: this.base }), m, 112,
      { size: 64, kind: "title", color: C.head, alpha: fade, maxW: W - 2 * m });
    const px = m, py = 150, pw = W - 2 * m, ph = 640;
    const cx = px + 150, cy = py + 50, cw = pw - 150 - 520, ch = ph - 140;
    const y0 = Math.min(...this.stages.map((s) => s.years[0]));
    const y1 = Math.max(...this.stages.map((s) => s.lastYear));
    const X = (yr) => cx + ((yr - y0) / Math.max(1, y1 - y0)) * cw;
    const Y = (p) => cy + ch - ((p - this.lo) / (this.hi - this.lo)) * ch;
    onCard(() => {
      g.save(); g.globalAlpha *= fade;
      panel(g, px, py, pw, ph, {});
      for (let p = this.lo; p <= this.hi + 1e-6; p += this.step) {
        withAlpha(g, p === 0 ? 0.55 : 0.15, () => {
          g.strokeStyle = C.ink; g.lineWidth = p === 0 ? 3 : 2;
          g.beginPath(); g.moveTo(cx, Y(p)); g.lineTo(cx + cw, Y(p)); g.stroke();
        });
        text(g, fmtPct(p), cx - 18, Y(p) + 10, { size: 28, weight: 700, align: "right", color: C.inkSoft });
      }
      const every = Math.max(1, Math.ceil(((y1 - y0) * 90) / cw));
      for (let yr = y1; yr >= y0; yr -= every) text(g, String(yr), X(yr), cy + ch + 46, { size: 28, weight: 700, align: "center", color: C.inkSoft });
      const labels = [];
      this.stages.forEach((st, i) => {
        const p = clamp((this.pt - FINAL_LINE_T0 - i * FINAL_LINE_GAP) / FINAL_LINE_DUR, 0, 1);
        if (p <= 0) return;
        const uTo = easeOut(p) * (st.n - 1);
        const xOf = (uu) => X(st.years[0] + uu);
        const yOf = (uu) => Y(catmull(st.pct, uu));
        g.save();
        g.strokeStyle = st.color; g.lineWidth = 7; g.setLineDash(st.dash); g.lineCap = "round"; g.lineJoin = "round";
        g.beginPath(); g.moveTo(xOf(0), yOf(0));
        const step = 0.02;
        for (let uu = step; uu < uTo; uu += step) g.lineTo(xOf(uu), yOf(uu));
        g.lineTo(xOf(uTo), yOf(uTo));
        g.stroke();
        g.setLineDash([]); g.fillStyle = st.color;
        for (let k = 0; k <= Math.floor(uTo + 1e-6); k++) marker(g, st.marker, xOf(k), yOf(k), 9);
        g.restore();
        if (p >= 1) labels.push({ st, x: xOf(st.n - 1) + 22, y: yOf(st.n - 1) + 14, a: clamp((this.pt - FINAL_LINE_T0 - i * FINAL_LINE_GAP - FINAL_LINE_DUR) / 0.3, 0, 1) });
      });
      // label = icon, then the rise (big, in the line colour), then the name (smaller)
      labels.sort((p, q) => p.y - q.y);
      for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 56) labels[i].y = labels[i - 1].y + 56;
      for (const l of labels) {
        const r = 22, maxX = px + pw - 24;
        g.save(); g.globalAlpha *= l.a;
        drawPictoBadge(g, l.st.picto, l.x + r, l.y - 15, r, { fill: l.st.color, ink: this._badgeInk(l.st) });
        g.restore();
        const pct = fmtPct(l.st.finalPct), x1 = l.x + 2 * r + 12;
        text(g, pct, x1, l.y, { size: 44, kind: "title", color: l.st.ink, alpha: l.a });
        const x2 = x1 + measure(g, pct, 44, "title") + 14;
        text(g, l.st.label, x2, l.y, { size: 28, weight: 700, color: C.ink, alpha: l.a, maxW: Math.max(40, maxX - x2) });
      }
      g.restore();
    });
    // campaign line (vagageneral.org/manifest), once every line is drawn
    const tPhrase = this._finalPhraseT();
    const pa = clamp((this.pt - tPhrase) / 0.5, 0, 1);
    if (pa > 0) posterBlock(g, T("finaldemes.final.frase", "Ni salaris per terra ni habitatge pels núvols."), W / 2, py + ph + 100, 54,
      { align: "center", alpha: pa, maxW: W - 2 * m });
    // sources, small, above the footer
    const srcs = [...new Set(this.stages.map((s) => this._srcShort(s)))];
    text(g, T("finaldemes.fonts", "Fonts: {fonts}", { fonts: srcs.join("; ") }), W / 2, LAYOUT.footY - 14,
      { size: 22, color: C.inkSoft, align: "center", alpha: fade, maxW: W - 2 * m });
    // continue: raised hand / held click (footer centre; the corners belong to ◀ ▶)
    const mouse = this.app.input.usingMouse;
    const r = clamp((this.raiseT || 0) / RAISE_S, 0, 1);
    drawFooterHint(g, T("finaldemes.final.continua", mouse ? "Mantén el clic per continuar" : "Aixeca la mà per continuar"), r,
      { mouse, alpha: clamp((this.pt - tPhrase) / 0.5, 0, 1), waitT: this.pt - Math.max(FINAL_MIN, tPhrase) });
    this.app.drawCursors(g, { alpha: 0.6 });
  }

  _drawNoData(g) {
    onCard(() => {
      panel(g, W / 2 - 700, H / 2 - 170, 1400, 300, {});
      text(g, T("finaldemes.titol", "Final de mes"), W / 2, H / 2 - 60, { size: 80, kind: "title", align: "center", color: C.head });
      text(g, T("finaldemes.senseDades", "Ara mateix no tenim les dades necessàries per a aquest joc."), W / 2, H / 2 + 30, { size: 40, align: "center", color: C.ink });
      text(g, T("finaldemes.senseDadesSeguent", "Passem al següent!"), W / 2, H / 2 + 90, { size: 34, align: "center", color: C.inkSoft });
    });
  }
}
