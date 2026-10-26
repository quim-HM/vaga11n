// «Final de mes»: arcade corridor on ONE % scale.
// Each stage's centre line is the real cumulative % change of a series since a common base year;
// the corridor width is only a game difficulty. Already played stages stay visible as ghost lines,
// so the player sees each trend getting steeper. Ends with all lines together.
// Colours are read from C.* at draw time (themes mutate C); all strings go through T().
import { W, H, C, text, panel, ring, hatch, clamp, easeOut, fmtNum, Particles, rrect, onCard, onBg, measure, font, LAYOUT, posterBlock, wrap } from "../ui.js";
import { drawRaiseIcon, drawFooterHint } from "../hand.js";
import { drawTrail } from "../trail.js";
import { centerText } from "../icons.js";

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

// Timing / difficulty (per stage position, easiest first)
const INTRO_DUR = 3;
const GATE_PX = 60;         // hand target within this of the ball's height = on the €
const GATE_HOLD = 0.4;      // ... for this long starts the stage
const GATE_MAX = 6;         // never block: start anyway after this
const GATE_TYPICAL = 1.5;
const GO_DUR = 0.5;         // «Som-hi!»
const GRACE = 1;            // invulnerable seconds at the start of each stage
const STAGE_MIN = 19, STAGE_MAX = 21;
const TIME_BUDGET = 101;
const CARD_TYPICAL = 2.5;
const SPEEDS = [565, 625, 675, 735];        // scroll px/s (fast; px per year scales with it)
const WIDTHS = [230, 185, 150, 120];        // corridor width px, narrower every stage (game difficulty, not data)
const ONE_ARM_EXTRA = 40;                   // assist: wider corridor in one-arm mode
const CARD_MIN = 1.0, CARD_AUTO = 5;
const RAISE_S = 0.6;
const NODATA_DUR = 3;
// End screen: all lines revealed one after another, then the campaign line
const FINAL_LINE_T0 = 0.5, FINAL_LINE_GAP = 0.75, FINAL_LINE_DUR = 0.9;
const FINAL_MIN = 4.5, FINAL_AUTO = 12;

// Direct control: the ball follows the hand height with capped speed and light inertia
const VMAX = 900;           // px/s
const FOLLOW_GAIN = 8;      // 1/s
const INERTIA = 12;         // 1/s (how fast velocity catches up)

// Marge
const DRAIN = 0.175;       // marge/s outside the corridor: ~5.7 s from full to empty
const REGEN = 0.08;

// Fun
const COIN_PTS = 100;       // x coin chain (1..5): following the wave pays much more
const COIN_STEP = 0.2;      // years between coins
const COIN_PERIOD = 1.25;   // years per sine wave
const COIN_AMP = 0.7;       // fraction of the half corridor
const COIN_STREAK = 1.0;    // seconds of combo streak gained per coin
const GRAZE_PX = 22;
const GRAZE_PTS = 30;

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
    const overhead = INTRO_DUR + n * (GATE_TYPICAL + GO_DUR) + n * CARD_TYPICAL;
    this.stageDur = clamp((TIME_BUDGET - overhead) / Math.max(1, n), STAGE_MIN, STAGE_MAX);
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
      st.speed = SPEEDS[k]; st.width = WIDTHS[k];
      st.ppy = (st.speed * this.stageDur) / (st.n - 1);
      st.result = null;
      st.pts = 0; st.inT = 0; st.totT = 0; st.coinsGot = 0;
      st.coins = [];
      // Bonus coins on a sine around the data line (game items, not data): following them pays more
      const phase = i * 1.9 + 0.5;
      for (let uu = 0.4; uu <= st.n - 1.1; uu += COIN_STEP) st.coins.push({ u: uu, s: Math.sin((2 * Math.PI * uu) / COIN_PERIOD + phase), got: false });
    });
    let lo = 0, hi = 10;
    for (const st of out) for (const p of st.pct) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
    const step = hi - lo > 60 ? 20 : 10;
    this.step = step;
    this.lo = Math.floor(lo / step) * step;
    this.hi = Math.ceil(hi / step) * step;
    this.stages = out;
  }

  yOf(p) { return PLAY_BOT - PAD - ((p - this.lo) / (this.hi - this.lo)) * (PLAY_H - 2 * PAD); }

  centreAt(st, u) { return this.yOf(catmull(st.pct, clamp(u, 0, st.n - 1))); }

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
      this.phase = "intro"; this.pt = 0;
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
  }

  _startPrep() { this.phase = "prep"; this.pt = 0; this.gateT = 0; this.app.sfx.whoosh(); }

  _startGo() { this.phase = "go"; this.pt = 0; this.app.sfx.select(); }

  _startPlay() { this.phase = "play"; this.pt = 0; this.graceT = GRACE; this.vy = 0; }

  _uOf(t) { return (t / this.stageDur) * (this.st.n - 1); }

  _endStage(ok) {
    const st = this.st;
    st.result = ok ? "ok" : "fail";
    if (!ok) {
      const rest = Math.max(0, this.stageDur - this.stT);  // unplayed time counts as outside
      this.totalTime += rest; st.totT += rest;
    }
    this.app.sfx[ok ? "good" : "bad"]();
    if (ok) this.fx.burst(PLAYER_X, this.py, 14, [C.mustard, st.color]);
    this.armed = false;
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
      summary: T("finaldemes.resum.frase", "Has superat {ok} de {n} etapes i has estat dins del passadís el {pct} % del temps.", { ok, n, pct: score }),
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

  _steer(dt) {
    const target = this._handTarget();
    const want = target === null ? 0 : clamp((target - this.py) * FOLLOW_GAIN, -VMAX, VMAX);
    this.vy += (want - this.vy) * Math.min(1, dt * INERTIA);
    this.py = clamp(this.py + this.vy * dt, PLAY_TOP + BALL_R, PLAY_BOT - BALL_R);
  }

  _handReady() {
    const target = this._handTarget();
    return target !== null && Math.abs(target - this.py) < GATE_PX;
  }

  _raiseToContinue(minT, autoT) {
    const r = this.app.input.anyRaisedFor();
    if (r === 0) this.armed = true;   // hand must come down first
    return (this.pt > minT && this.armed && r > RAISE_S) || this.pt > autoT;
  }

  update(dt) {
    if (this.finished) return;
    this.t += dt;
    this.pt += dt;
    this.fx.update(dt);
    this.hitSfxT = Math.max(0, this.hitSfxT - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.grazeCool = Math.max(0, this.grazeCool - dt);
    if (this.popup) { this.popup.t += dt; if (this.popup.t > 0.9) this.popup = null; }
    for (const f of this.flying) f.t += dt;
    this.flying = this.flying.filter((f) => f.t < 0.3);

    if (this.phase === "loading") return;
    if (this.phase === "nodata") { if (this.pt > NODATA_DUR) this._finish(); return; }

    if (this.phase === "intro") {
      this.py = this.centreAt(this.st, 0);
      if (this.pt >= INTRO_DUR) this._startPrep();
    } else if (this.phase === "prep") {
      // hand-placement gate: ball locked at the corridor centre, nothing counts
      this.py = this.centreAt(this.st, 0); this.vy = 0;
      this.gateT = this._handReady() ? this.gateT + dt : 0;
      if (this.gateT >= GATE_HOLD || this.pt >= GATE_MAX) this._startGo();
    } else if (this.phase === "go") {
      this.py = this.centreAt(this.st, 0); this.vy = 0;
      if (this.pt >= GO_DUR) this._startPlay();
    } else if (this.phase === "play") {
      this._steer(dt);
      this._updatePlay(dt);
    } else if (this.phase === "final") {
      if (this._raiseToContinue(FINAL_MIN, FINAL_AUTO)) this._finish();
    } else if (this.phase === "card") {
      if (this._raiseToContinue(CARD_MIN, CARD_AUTO)) {
        if (this.si >= this.stages.length - 1) { this.phase = "final"; this.pt = 0; this.armed = false; this.app.sfx.reveal(); }
        else { this.si += 1; this._prepStage(); this._startPrep(); }
      }
    }
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
      if (this.stT >= this.stageDur) this._endStage(true);
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
      }
    }
    for (const co of st.coins) {
      if (co.got !== false) continue;
      const dx = (co.u - this.u) * st.ppy;
      if (dx < -BALL_R - 20) { co.got = "missed"; this.coinChain = 0; continue; }   // missed: keeps scrolling, faded
      if (Math.abs(dx) < BALL_R + 20 && Math.abs(this.coinY(st, co) - this.py) < BALL_R + 12) {
        co.got = true; st.coinsGot += 1;
        this.flying.push({ u: co.u, y: this.coinY(st, co), t: 0 });
        this.coinChain = Math.min(5, this.coinChain + 1);
        this._addPts(COIN_PTS * this.coinChain);
        this.app.sfx.coin();
      }
    }
    if (this.marge <= 0) { this.marge = 0; this._endStage(false); return; }
    if (this.stT >= this.stageDur) this._endStage(true);
  }

  _addPts(p) { this.points += p; this.st.pts += p; }

  _popup(str, colorKey) { this.popup = { text: str, colorKey, t: 0 }; }

  // --- drawing ----------------------------------------------------------
  draw(g) {
    this.app.drawSilhouette(g, { alpha: 0.06 });
    if (this.phase === "loading") { text(g, T("finaldemes.carregant", "Carregant…"), W / 2, H / 2, { size: 48, align: "center", color: C.inkSoft }); return; }
    if (this.phase === "nodata") { this._drawNoData(g); return; }
    if (this.phase === "final") { this._drawFinal(g); return; }

    const st = this.st;
    // the chart lives directly on the campaign field; the corridor is a white «road» (card colours)
    // with dark edges, the outside is hatched with the field's ink. Data drawn inside the road
    // (current line, coins, ball, labels) uses the card roles; what lies on the field uses the bg roles.
    g.save();
    if (this.shake > 0) {
      const a = 12 * (this.shake / 0.35);
      g.translate(Math.sin(this.t * 55) * a, Math.cos(this.t * 47) * a * 0.6);
    }
    this._drawGrid(g);
    this._drawSpeed(g, st);
    this._tags = [];
    this._drawGhosts(g, st);
    this._drawCorridor(g, st);
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
    if (this.flash > 0) {
      // single soft pulse per hit (hits are rate-limited to < 1.5 Hz)
      withAlpha(g, 0.22 * (this.flash / 0.3), () => { g.fillStyle = C.red; g.fillRect(0, PLAY_TOP, W, PLAY_H); });
    }
    this._drawHandLink(g);
    this.app.drawCursors(g, { alpha: 0.6 });
    this._drawHud(g, st);
    this._drawFlyingCoins(g);
    this._drawFooter(g, st);
    onCard(() => {
      if (this.phase === "intro") this._drawIntro(g);
      if (this.phase === "prep") this._drawPrep(g);
      if (this.phase === "card") this._drawCard(g);
    });
    if (this.phase === "go") this._drawGo(g);
  }

  _xOfU(st, uu) { return PLAYER_X + (uu - this.u) * st.ppy; }

  _drawGrid(g) {
    g.save();
    g.beginPath(); g.rect(0, PLAY_TOP, W, PLAY_H); g.clip();
    g.strokeStyle = C.ink;
    for (let p = this.lo; p <= this.hi + 1e-6; p += this.step) {
      const y = this.yOf(p);
      g.globalAlpha = p === 0 ? 0.45 : 0.13;
      g.lineWidth = p === 0 ? 3 : 2;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    g.restore();
  }

  _drawGridLabels(g) {
    for (let p = this.lo; p <= this.hi + 1e-6; p += this.step) {
      const y = this.yOf(p);
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
      g.globalAlpha = 0.6;
      g.strokeStyle = st.color; g.lineWidth = 6; g.setLineDash(st.dash); g.lineCap = "round";
      this._linePath(g, st, xOf, 0, st.n - 1, cur.ppy); g.stroke();
      g.setLineDash([]);
      g.fillStyle = st.color;
      for (let k = 0; k < st.n; k++) marker(g, st.marker, xOf(k), this.yOf(st.pct[k]), 7);
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

  // Right-aligned line labels, pushed apart vertically so they never overlap
  _drawTags(g) {
    const tags = this._tags.sort((a, b) => a.y - b.y);
    for (let i = 1; i < tags.length; i++) {
      const p = tags[i - 1], q = tags[i];
      if (Math.abs(p.x - q.x) < 500 && q.y - p.y < 50) q.y = p.y + 50;
    }
    for (const t of tags) tag(g, t.str, t.x, clamp(t.y, PLAY_TOP + 40, PLAY_BOT - 14), t.st.ink, t.st.color, { size: t.size, align: "right" });
  }

  _drawCoins(g, st) {
    if (this.phase === "card") return;
    for (const co of st.coins) {
      if (co.got === true) continue;
      const x = this._xOfU(st, co.u);
      if (x < -40 || x > W + 40) continue;
      const y = this.coinY(st, co);
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

  _drawYears(g, st) {
    g.save();
    g.strokeStyle = C.ink; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, PLAY_BOT); g.lineTo(W, PLAY_BOT); g.stroke();
    const cur = clamp(Math.round(this.u), 0, st.n - 1);
    for (let k = 0; k < st.n; k++) {
      const x = this._xOfU(st, k);
      if (x < LAYOUT.footX0 || x > LAYOUT.footX1) continue;   // footer corners belong to the ◀ ▶ shortcuts
      g.beginPath(); g.moveTo(x, PLAY_BOT); g.lineTo(x, PLAY_BOT + 12); g.stroke();
      text(g, String(st.years[k]), x, PLAY_BOT + 44, { size: k === cur ? 32 : 28, weight: 700, align: "center", color: k === cur ? C.ink : C.inkSoft });
    }
    g.restore();
    this._drawGridLabels(g);
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

  // "Raise your hand" (or "hold the click" in mouse mode) pictogram inside a progress ring
  _drawRaiseIcon(g, cx, cy, r, progress) { drawRaiseIcon(g, cx, cy, r, progress, { mouse: this.app.input.usingMouse }); }

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
    const c = this.app.input.primary();
    if (!c) return;
    g.save();
    g.globalAlpha = 0.25;
    g.strokeStyle = C.blue; g.lineWidth = 4; g.setLineDash([6, 12]); g.lineCap = "round";
    g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(PLAYER_X + (c.x > PLAYER_X ? BALL_R + 8 : -BALL_R - 8), this.py); g.stroke();
    g.restore();
  }

  _drawChips(g, x, y) {
    g.save();
    font(g, 28, "body", 700);
    for (let i = 0; i < this.stages.length; i++) {
      const st = this.stages[i];
      const w = g.measureText(st.label).width + 36, h = 50;
      const cur = i === this.si;
      const done = st.result !== null;
      onCard(() => {
        g.fillStyle = cur ? C.ink : done ? st.soft : C.card;
        rrect(g, x, y, w, h, 25); g.fill();
        g.save();
        if (!cur && !done) g.globalAlpha = 0.6;
        g.lineWidth = 3; g.strokeStyle = cur ? C.card : done ? st.color : C.ink; g.stroke();   // white rim keeps the navy pill visible on the navy field
        g.restore();
        text(g, st.label, x + w / 2, y + 35, { size: 28, weight: 700, align: "center", color: cur ? C.white : done ? C.ink : C.inkSoft });
      });
      x += w + 12;
    }
    g.restore();
    return x;
  }

  _drawHud(g, st) {
    const y = 26;
    const x = this._drawChips(g, LAYOUT.m, y);
    const bx = Math.max(x + 24, 960), bw = 220, bh = 50;
    const m = clamp(this.marge, 0, 1);
    // marge only while it matters (outside the corridor or still refilling); hidden on the stage cards
    const live = this.phase === "play" && (this.touching || this.marge < 0.999);
    if (live) onCard(() => {
      g.save();
      g.fillStyle = C.card; rrect(g, bx, y, bw, bh, 25); g.fill();
      if (m > 0) {
        g.save(); rrect(g, bx, y, bw, bh, 25); g.clip();
        g.fillStyle = m < 0.35 ? C.red : C.teal; g.fillRect(bx, y, bw * m, bh);
        g.restore();
      }
      g.lineWidth = 3; g.strokeStyle = C.ink; rrect(g, bx, y, bw, bh, 25); g.stroke();
      g.restore();
      // label in navy over the empty part and in white over the filled part (never navy on teal/red)
      const lab = T("finaldemes.marge", "marge");
      g.save(); g.beginPath(); g.rect(bx + bw * m, y, bw * (1 - m), bh); g.clip();
      text(g, lab, bx + bw / 2, y + 35, { size: 28, weight: 700, align: "center", color: C.ink });
      g.restore();
      if (m > 0) {
        g.save(); g.beginPath(); g.rect(bx, y, bw * m, bh); g.clip();
        text(g, lab, bx + bw / 2, y + 35, { size: 28, weight: 700, align: "center", color: C.white });
        g.restore();
      }
    });
    const shown = clamp(Math.round(this.u), 0, st.n - 1);
    const yr = String(st.years[shown]);
    text(g, yr, W - LAYOUT.m, y + 66, { size: 84, kind: "title", align: "right", color: C.ink });
    text(g, fmtPct(st.pct[shown]), W - LAYOUT.m - measure(g, yr, 84, "title") - 28, y + 56, { size: 56, kind: "title", align: "right", color: st.ink });
  }

  _drawFooter(g, st) {
    fitText(g, this._cite(st, true), W / 2, LAYOUT.navY + 8, LAYOUT.footW - 120, { size: 24, minSize: 18, color: C.inkSoft, align: "center" });
  }

  _drawOverlayPanel(g, w, h) {
    const x = (W - w) / 2 + 160, y = PLAY_TOP + (PLAY_H - h) / 2;
    panel(g, x, y, w, h, {});
    return { x, y };
  }

  _drawIntro(g) {
    const a = easeOut(this.pt / 0.35);
    g.save(); g.globalAlpha = a;
    const { x, y } = this._drawOverlayPanel(g, 900, 260);
    text(g, T("finaldemes.titol", "Final de mes"), x + 50, y + 117, { size: 96, kind: "title", color: C.head, maxW: 800 });
    fitText(g, T("finaldemes.control", "Segueix el camí amb la mà"), x + 50, y + 200, 800, { size: 44, weight: 700, color: C.ink });
    g.restore();
  }

  // Hand-placement gate: pulsing target ring on the locked €, fills while the hand stays on it
  _drawPrep(g) {
    const a = easeOut(this.pt / 0.3);
    const pulse = Math.sin(this.t * Math.PI * 2) * 6;   // smooth 1 Hz size pulse, no blinking
    g.save(); g.globalAlpha = a;
    g.lineWidth = 5; g.strokeStyle = C.teal;
    g.beginPath(); g.arc(PLAYER_X, this.py, BALL_R + 22 + pulse, 0, Math.PI * 2); g.stroke();
    g.restore();
    ring(g, PLAYER_X, this.py, BALL_R + 42, clamp(this.gateT / GATE_HOLD, 0, 1), { color: C.teal, lw: 10 });
    const msg = T("finaldemes.coloca", "Coloca't sobre l'€");
    g.save();
    font(g, 48, "body", 700);
    const tw = g.measureText(msg).width + 48;
    const bx = PLAYER_X + 90, by = clamp(this.py - 50, PLAY_TOP + 10, PLAY_BOT - 130);
    g.globalAlpha = a;
    panel(g, bx, by, tw, 130, { lw: 3 });
    g.restore();
    text(g, msg, bx + 24, by + 62, { size: 48, weight: 700, color: C.ink, alpha: a });
    if (this.st) text(g, this.st.label, bx + 24, by + 100, { size: 30, weight: 700, color: this.st.ink, alpha: a });
  }

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
    for (let p = this.lo; p <= this.hi + 1e-6; p += this.step) {
      const y = this.yOf(p);
      for (let x = -((sx * 0.5) % 160); x < W; x += 160) { g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x, y + 7); g.stroke(); }
    }
    g.restore();
  }

  _drawCard(g) {
    const st = this.stages[this.si];
    const ok = st.result === "ok";
    const a = easeOut(this.pt / 0.3);
    g.save(); g.globalAlpha = a;
    const { x, y } = this._drawOverlayPanel(g, 1000, 330);
    if (!ok) withAlpha(g, 0.18, () => { g.fillStyle = hatch(g, C.red, null, 22, 5); rrect(g, x, y, 1000, 34, 6); g.fill(); });
    if (ok) text(g, T("finaldemes.superat", "Etapa superada"), x + 50, y + 105, { size: 92, kind: "title", color: C.teal, maxW: 900 });
    else wrap(g, T("finaldemes.senseMarge", "No li has pogut seguir el ritme al mercat!"), x + 50, y + 92, 900, { size: 54, kind: "title", color: C.red, lineH: 1.08, maxLines: 2 });
    fitText(g, T("finaldemes.resultatEtapaPct", "{etapa}: {pct} des del {any}", { etapa: st.label, pct: fmtPct(st.finalPct), any: st.years[0] }),
      x + 50, y + (ok ? 180 : 208), 900, { size: 44, weight: 700, color: st.ink });
    const r = this.armed ? clamp(this.app.input.anyRaisedFor() / RAISE_S, 0, 1) : 0;
    const iy = y + (ok ? 250 : 274);
    this._drawRaiseIcon(g, x + 86, iy, 36, r);
    text(g, T("finaldemes.aixecaMa", "Aixeca la mà"), x + 145, iy + 12, { size: 34, weight: 700, color: C.ink, maxW: 800 });
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
    const cx = px + 150, cy = py + 50, cw = pw - 150 - 470, ch = ph - 140;
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
        if (p >= 1) labels.push({ st, x: xOf(st.n - 1) + 22, y: yOf(st.n - 1) + 11, a: clamp((this.pt - FINAL_LINE_T0 - i * FINAL_LINE_GAP - FINAL_LINE_DUR) / 0.3, 0, 1) });
      });
      labels.sort((p, q) => p.y - q.y);
      for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 44) labels[i].y = labels[i - 1].y + 44;
      for (const l of labels) {
        const s = T("finaldemes.etiquetaFinal", "{etapa} {pct} ({any})", { etapa: l.st.label, pct: fmtPct(l.st.finalPct), any: l.st.lastYear });
        text(g, s, l.x, l.y, { size: 32, weight: 700, color: l.st.ink, alpha: l.a, maxW: px + pw - 24 - l.x });
      }
      g.restore();
    });
    // campaign line (vagageneral.org/manifest), once every line is drawn
    const tPhrase = FINAL_LINE_T0 + (this.stages.length - 1) * FINAL_LINE_GAP + FINAL_LINE_DUR + 0.3;
    const pa = clamp((this.pt - tPhrase) / 0.5, 0, 1);
    if (pa > 0) posterBlock(g, T("finaldemes.final.frase", "Ni salaris per terra ni habitatge pels núvols."), W / 2, py + ph + 100, 54,
      { align: "center", alpha: pa, maxW: W - 2 * m });
    // sources, small, above the footer
    const srcs = [...new Set(this.stages.map((s) => this._srcShort(s)))];
    text(g, T("finaldemes.fonts", "Fonts: {fonts}", { fonts: srcs.join("; ") }), W / 2, LAYOUT.footY - 14,
      { size: 22, color: C.inkSoft, align: "center", alpha: fade, maxW: W - 2 * m });
    // continue: raised hand / held click (footer centre; the corners belong to ◀ ▶)
    const mouse = this.app.input.usingMouse;
    const r = this.armed && this.pt > FINAL_MIN ? clamp(this.app.input.anyRaisedFor() / RAISE_S, 0, 1) : 0;
    drawFooterHint(g, T("finaldemes.final.continua", mouse ? "Mantén el clic per continuar" : "Aixeca la mà per continuar"), r,
      { mouse, alpha: clamp((this.pt - tPhrase) / 0.5, 0, 1) });
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
