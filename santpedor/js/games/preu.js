import { T } from "../textos.js";
// «El preu (in)just»: guess real numbers with your hand, then confirm explicitly.
//
// Controls (one or two arms, standing or seated):
//  - Lever: hand above the shoulders = the value goes up (faster the longer you hold),
//    hand at belly height = goes down, hand at chest height or resting = holds.
//  - Confirm: put a hand on one of the «FIXA-HO» buttons at the sides for 1.5 s (the value is
//    frozen while a hand is there), or raise both hands for 1 s. Nothing is ever confirmed by
//    just standing still, so players can take their time to think.
import { W, H, C, LAYOUT, text, wrap, wrapLines, font, panel, ring, clamp, lerp, easeOut, shuffle, Particles, rrect, drawCheck, onCard } from "../ui.js";
import { MAP, inRect } from "../input.js";
import { drawMetaphor, fmtWithUnit } from "./metafores.js";
import { drawCountdown } from "../countdown.js";
import { drawOkBadge, textIcon } from "../icons.js";
import { drawFooterHint, drawHand } from "../hand.js";

const N_QUESTIONS = 5;
const ANSWER_MAX_S = 30;
const WARN_S = 8;              // countdown shown during the last seconds
const CONFIRM_S = 1.5;
const BOTH_UP_S = 1.0;
const ARM_AFTER_S = 1.2;       // ignore input right after the question appears
const REVEAL_NEXT_MIN_S = 3.0;
const HOWTO_MIN_S = 3.5;      // the how-to card stays at least this long before a raised hand skips it
const REVEAL_MAX_S = 40;   // players move on themselves (raise a hand / click); auto only as a safety net
const NEXT_RAISE_S = 0.6;
const LEVER_UP = 0.45, LEVER_DOWN = -0.1, REST_Y = -0.5;

const yOf = (hy) => H * (MAP.yTop - hy) / (MAP.yTop - MAP.yBottom);
const Y_UP = yOf(LEVER_UP), Y_DOWN = yOf(LEVER_DOWN);
const BTN = { w: 250, h: 330 };
const BTN_Y = (Y_UP + Y_DOWN) / 2 - BTN.h / 2;
const BUTTONS = [{ x: 30, y: BTN_Y, ...BTN }, { x: W - 30 - BTN.w, y: BTN_Y, ...BTN }];
// Reveal screen: the metaphor cards («TU» / «LA REALITAT») take only the upper half, so the
// explanation and the source below them have room (pad = card border around the drawing box).
const REVEAL_CARD = { x: 272, y: 232, w: 636, h: 350, pad: 22, panelY: 150, panelH: 450 };
// …and the explanation below them is set as large as it fits in the band left between the verdict
// and the source line (which always ends on the same baseline, just above the footer prompt).
const REV = { w: 1560, lineH: 1.2, maxLines: 4, maxSize: 60, minSize: 26, top: 112 };
const SRC = { w: 1500, size: 24, maxLines: 2, lastBaseline: 980 };

function countLines(g, str, maxW, size, maxLines) {
  font(g, size, "body", 400);
  return Math.min(maxLines, wrapLines(g, str, maxW).length);
}

// Largest size at which the text fits the band, with the height the block will occupy
function fitBlock(g, str, maxW, bandH) {
  for (let size = REV.maxSize; size > REV.minSize; size -= 2) {
    font(g, size, "body", 400);
    const n = wrapLines(g, str, maxW).length;
    const h = (n - 1) * size * REV.lineH + size * 0.94;
    if (n <= REV.maxLines && h <= bandH) return { size, h };
  }
  font(g, REV.minSize, "body", 400);
  const n = Math.min(REV.maxLines, wrapLines(g, str, maxW).length);
  return { size: REV.minSize, h: (n - 1) * REV.minSize * REV.lineH + REV.minSize * 0.94 };
}

function stepsOf(q) {
  // ~12 lever steps per order of magnitude on log scales
  if (q.escala === "log" && q.rang.min > 0) return Math.max(30, Math.round(Math.log10(q.rang.max / q.rang.min) * 12));
  return Math.max(1, Math.round((q.rang.max - q.rang.min) / (q.pas || 1)));
}

function valueAt(q, t) {
  const { min, max } = q.rang;
  let v;
  if (q.escala === "log" && min > 0) {
    v = min * Math.pow(max / min, t);
    const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
    v = Math.round(v / mag) * mag;
    if (q.pas) v = Math.max(min, Math.round(v / q.pas) * q.pas);
  } else {
    const p = q.pas || 1;
    v = min + Math.round((t * (max - min)) / p) * p;
  }
  return clamp(v, min, max);
}

// Where the lever starts. By default at the bottom of the scale, but a question with a neutral
// point starts there instead, so the answer can move either way from «no change»: ranges that cross
// zero start at zero (e.g. the change in purchasing power) and a question can name its own baseline
// with "linia_base" (e.g. the 100 € the 2019 shopping trolley cost).
function startParam(q) {
  const { min, max } = q.rang;
  const base = Number.isFinite(q.linia_base) ? q.linia_base : (min < 0 && max > 0 ? 0 : null);
  if (base === null || base <= min || base >= max) return 0;
  if (q.escala === "log" && min > 0) return clamp(Math.log(base / min) / Math.log(max / min), 0, 1);
  return clamp((base - min) / (max - min), 0, 1);
}

function scoreOf(q, a) {
  const { min, max } = q.rang;
  // Log scales reward the right order of magnitude: 0 points when off by a factor of 10
  if (q.escala === "log" && min > 0) return Math.round(100 * clamp(1 - Math.abs(Math.log10(a / q.valor)), 0, 1));
  const err = Math.abs(a - q.valor) / (max - min);
  return Math.round(100 * clamp(1 - err / 0.5, 0, 1));
}

export function validQuestions(all, exclude = []) {
  const skip = new Set(exclude);
  return all.filter((q) => q.rang && q.rang.max > q.rang.min && Number.isFinite(q.valor) && !skip.has(q.id));
}

function pickQuestions(all, exclude = []) {
  const valid = validQuestions(all, exclude);
  const out = [], used = new Set();
  for (const q of shuffle(valid)) {
    if (out.length >= N_QUESTIONS) break;
    if (!used.has(q.metafora)) { out.push(q); used.add(q.metafora); }
  }
  for (const q of shuffle(valid)) { if (out.length >= N_QUESTIONS) break; if (!out.includes(q)) out.push(q); }
  return out;
}

export default class Preu {
  constructor(app, params = {}) {
    this.calm = true;   // drawn on the theme's calm play surface (app.draw)
    this.app = app;
    this.needsPlayer = true;
    // "Més preguntes" rounds never repeat questions already asked in this session
    this.continuing = !!params.continuar;
    this.questions = pickQuestions(app.data.preguntes || [], app.session.preuAsked || []);
    this.i = 0;
    this.results = [];
    this.fx = new Particles();
    this.phase = this.questions.length ? "howto" : "empty";
    this.t = 0;
    this.nextT = 0;
    this.nextArmed = false;
  }

  enter() {
    if (this.continuing && this.questions.length) this.startQuestion();
  }

  get q() { return this.questions[this.i]; }

  startQuestion() {
    const q = this.q;
    this.tParam = startParam(q);   // bottom of the scale, or the question's neutral point
    this.value = valueAt(q, this.tParam);
    this.prevValue = this.value;
    this.touched = false;
    this.leverHeld = 0;
    this.leverDir = 0;
    this.confirmP = 0;
    this.bothUpT = 0;
    this.overBtn = -1;
    this.phase = "answer";
    this.t = 0;
    this.nextT = 0;
    this.nextArmed = false;
    this.revealSfx = false;
  }

  lock(reason) {
    const q = this.q;
    this.answer = this.value;
    this.points = scoreOf(q, this.answer);
    this.results.push({ q, answer: this.answer, points: this.points, reason });
    this.phase = "reveal";
    this.t = 0;
    this.nextT = 0;
    this.nextArmed = false;
    this.app.sfx.lock();
  }

  next() {
    this.i += 1;
    if (this.i >= this.questions.length) this.finish();
    else this.startQuestion();
  }

  skip() {
    if (this.phase === "answer") this.lock("operator");
    else if (this.phase === "howto") this.startQuestion();
    else if (this.phase === "reveal") this.next();
    else this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    // accumulate across "més preguntes" rounds
    const ses = this.app.session;
    ses.preuAsked = [...(ses.preuAsked || []), ...this.results.map((r) => r.q.id)];
    ses.preuAll = [...(ses.preuAll || []), ...this.results];
    this.results = ses.preuAll;
    const n = this.results.length;
    const score = n ? Math.round(this.results.reduce((s, r) => s + r.points, 0) / n) : 0;
    const close = this.results.filter((r) => r.points >= 80).length;
    const facts = this.results.slice(0, 2).map((r) => ({
      text: `${r.q.enunciat} → ${fmtWithUnit(r.q, r.q.valor, true)}`,
      source: this.app.data.cite(r.q.font_id, r.q.any_referencia ? String(r.q.any_referencia) : ""),
    }));
    this.app.finishGame("preu", {
      score,
      summary: n ? T("preu.resum", "{ok} de {n} respostes molt a prop de la realitat.", { ok: close, n }) : T("preu.no_hi_havia_preguntes", "No hi havia preguntes disponibles."),
      facts,
    });
  }

  // "Raise a hand to continue" helper with a short minimum delay. A hand that is still up from the
  // previous screen does not count: it has to come down first (so the instructions get read).
  wantsNext(dt, minS) {
    const inp = this.app.input;
    if (inp.anyRaisedFor() === 0) this.nextArmed = true;
    if (this.t < minS || !this.nextArmed) { this.nextT = 0; return false; }
    this.nextT = inp.anyRaisedFor() > 0 ? this.nextT + dt : Math.max(0, this.nextT - dt * 2);
    return this.nextT >= NEXT_RAISE_S || inp.keys.has("Space");
  }

  update(dt) {
    this.t += dt;
    this.fx.update(dt);
    switch (this.phase) {
      case "empty":
        if (this.t > 3) this.finish();
        break;
      case "howto":
        if (this.wantsNext(dt, HOWTO_MIN_S) || this.t > 14) this.startQuestion();
        break;
      case "answer":
        this.updateAnswer(dt);
        break;
      case "reveal": {
        const r = this.results[this.results.length - 1];
        if (!this.revealSfx && this.t > 1.0) {
          this.revealSfx = true;
          this.app.sfx.reveal();
          setTimeout(() => (r.points >= 80 ? this.app.sfx.good() : r.points >= 40 ? this.app.sfx.meh() : this.app.sfx.bad()), 900);
          if (r.points >= 80) this.fx.burst(W * 0.73, H * 0.45, 70);
        }
        if (this.wantsNext(dt, REVEAL_NEXT_MIN_S) || this.t > REVEAL_MAX_S) this.next();
        break;
      }
    }
  }

  updateAnswer(dt) {
    const inp = this.app.input;
    const q = this.q;
    const armed = this.t > ARM_AFTER_S;
    // Confirm buttons: any hand inside freezes the value and fills the ring
    const cs = inp.cursors();
    this.overBtn = -1;
    this.overSide = null;
    BUTTONS.forEach((b, k) => {
      const c = cs.find((cc) => inRect(cc, b.x, b.y, b.w, b.h));
      if (c) { this.overBtn = k; this.overSide = c.side; }
    });
    const canConfirm = armed && (this.touched || this.t > 6);
    this.confirmP = this.overBtn >= 0 && canConfirm ? this.confirmP + dt / CONFIRM_S : Math.max(0, this.confirmP - dt * 2);
    // Both hands up = quick confirm (two-arm players)
    const bothUp = !inp.oneArm && inp.isRaised("l") && inp.isRaised("r");
    this.bothUpT = bothUp && canConfirm ? this.bothUpT + dt : 0;

    const c = inp.primary();
    if (armed && this.overBtn < 0 && !bothUp && c && c.hy > REST_Y) {
      let dir = 0;
      if (c.hy > LEVER_UP) dir = 1; else if (c.hy < LEVER_DOWN) dir = -1;
      if (dir !== this.leverDir) { this.leverDir = dir; this.leverHeld = 0; }
      this.leverHeld += dt;
      if (dir !== 0) {
        const steps = stepsOf(q);
        const sps = Math.min(2 + this.leverHeld * 8, 45);   // steps per second, accelerating
        this.tParam = clamp(this.tParam + (dir * sps * dt) / steps, 0, 1);
      }
    } else {
      this.leverDir = 0;
      this.leverHeld = 0;
    }
    this.value = valueAt(q, this.tParam);
    if (this.value !== this.prevValue) {
      this.touched = true;
      this.app.sfx.tick();
      this.prevValue = this.value;
    }
    if (this.confirmP >= 1) this.lock("button");
    else if (this.bothUpT >= BOTH_UP_S) this.lock("both-up");
    else if (inp.keys.has("Space") && armed) this.lock("key");
    else if (this.t >= ANSWER_MAX_S) this.lock("timeout");
    // audible tick on each of the last seconds
    const sec = Math.ceil(ANSWER_MAX_S - this.t);
    if (sec <= WARN_S && sec !== this.lastSec) { this.lastSec = sec; if (this.phase === "answer") this.app.sfx.tick(); }
  }

  // ---------------------------------------------------------------- drawing
  draw(g) {
    const app = this.app;
    if (this.phase === "empty") {
      text(g, T("preu.no_hi_ha_preguntes", "No hi ha preguntes disponibles"), W / 2, H / 2, { size: 56, align: "center" });
      return;
    }
    if (this.phase === "howto") this.drawHowto(g);
    else if (this.phase === "answer") this.drawAnswer(g);
    else if (this.phase === "reveal") this.drawReveal(g);
    this.fx.draw(g);
    // dwell feedback on the hand itself: confirming (answer) or "raise to continue" (other phases)
    const prog = {};
    if (this.phase === "answer") {
      if (this.overSide) prog[this.overSide] = clamp(this.confirmP, 0, 1);
    } else {
      const side = app.input.raisedSide();
      if (side) prog[side] = clamp(this.nextT / NEXT_RAISE_S, 0, 1);
    }
    app.drawCursors(g, { alpha: this.phase === "reveal" ? 0.75 : 1, progress: prog });
  }

  drawProgress(g, y = 52) {
    for (let k = 0; k < this.questions.length; k++) {
      const done = k < this.results.length, cur = k === this.i && this.phase !== "howto";
      g.fillStyle = done ? C.ink : cur ? C.red : C.track;
      g.beginPath(); g.arc(W / 2 - (this.questions.length - 1) * 23 + k * 46, y, cur ? 14 : 10, 0, Math.PI * 2); g.fill();
    }
  }

  drawNextHint(g, minS) {
    if (this.t < minS) return;
    const p = clamp(this.nextT / NEXT_RAISE_S, 0, 1);
    drawFooterHint(g, T("preu.aixeca_la_ma_per", "Aixeca la mà per continuar"), p, { mouse: this.app.input.usingMouse });
  }

  drawHowto(g) {
    const app = this.app;
    app.drawSilhouette(g, { alpha: 0.08 });
    text(g, T("preu.el_preu_in_just", "EL PREU (IN)JUST"), W / 2, 170, { size: 120, kind: "title", align: "center", color: C.head, maxW: W - 200 });
    text(g, T("preu.endevina_xifres_reals_com", "Com hem arribat fins aquí?"), W / 2, 250, { size: 46, weight: 700, align: "center" });
    // three pictograms: up / down / confirm
    const items = [
      { x: 480, label: T("preu.ma_amunt", "Mà amunt"), sub: T("preu.puja__", "puja"), arm: 1 },
      { x: 960, label: T("preu.ma_a_la_panxa", "Mà a la panxa"), sub: T("preu.baixa__", "baixa"), arm: -1 },
      { x: 1440, label: T("preu.toca_ok", "Toca {check}"), sub: T("preu.respon", "respon"), arm: 0 },
    ];
    for (const it of items) onCard(() => {
      panel(g, it.x - 220, 300, 440, 520, { lw: 3 });
      figure(g, it.x, 684, it.arm, this.t);
      textIcon(g, it.label, it.x, 721, { size: 38, weight: 700, align: "center" });
      textIcon(g, it.sub, it.x, 763, { size: 32, align: "center", color: it.arm > 0 ? C.red : it.arm < 0 ? C.blue : C.teal, weight: 700 });
    });
    textIcon(g, T("preu.nomes_compta", "Només compta quan toques {check}"), W / 2, 880, { size: 38, align: "center", color: C.inkSoft });
    this.drawNextHint(g, HOWTO_MIN_S);
  }

  drawAnswer(g) {
    const app = this.app, q = this.q;
    const a = easeOut(this.t / 0.5);
    app.drawSilhouette(g, { alpha: 0.08 });
    // lever zones across the central area: tinted fields of the theme, the active one stronger
    const x0 = BUTTONS[0].x + BUTTONS[0].w + 30, x1 = BUTTONS[1].x - 30;
    g.save();
    g.fillStyle = C.paper2;
    g.globalAlpha = this.leverDir > 0 ? 1 : 0.55; g.fillRect(x0, 0, x1 - x0, Y_UP);
    g.globalAlpha = this.leverDir < 0 ? 1 : 0.55; g.fillRect(x0, Y_DOWN, x1 - x0, H - Y_DOWN);
    // dashed outline: the zones must read even where the tint is subtle
    g.globalAlpha = 1;
    g.setLineDash([16, 12]); g.lineWidth = 3;
    g.strokeStyle = this.leverDir > 0 ? C.head : C.inkSoft;
    g.strokeRect(x0 + 1.5, 1.5, x1 - x0 - 3, Y_UP - 3);
    g.strokeStyle = this.leverDir < 0 ? C.head : C.inkSoft;
    g.strokeRect(x0 + 1.5, Y_DOWN + 1.5, x1 - x0 - 3, H - Y_DOWN - 3);
    g.setLineDash([]);
    g.restore();
    const zone = (label, x, y, align, dir) => textIcon(g, label, x, y,
      { size: 40, kind: "title", align, color: this.leverDir === dir ? C.head : C.ink, maxW: 170 });
    zone(T("preu.puja", "▲ PUJA"), x0 + 20, Y_UP - 18, "left", 1);
    zone(T("preu.puja_", "▲ PUJA"), x1 - 20, Y_UP - 18, "right", 1);
    zone(T("preu.baixa", "▼ BAIXA"), x0 + 20, Y_DOWN + 52, "left", -1);
    zone(T("preu.baixa_", "▼ BAIXA"), x1 - 20, Y_DOWN + 52, "right", -1);
    // question: pick the largest size that fits in 3 lines (4 as a last resort) and size the
    // frame to the text, with the text vertically centred inside it
    this.drawProgress(g, 34);
    const maxW = 1180;
    let qs = 42, lines = [];
    for (; qs >= 30; qs -= 2) { font(g, qs, "body", 700); lines = wrapLines(g, q.enunciat, maxW); if (lines.length <= 3) break; }
    if (lines.length > 3) { qs = 30; font(g, qs, "body", 700); lines = wrapLines(g, q.enunciat, maxW).slice(0, 4); }
    const lh = qs * 1.18, padY = 26;
    const ph = Math.max(140, lines.length * lh + padY * 2);
    onCard(() => {
      panel(g, 330, 60, W - 660, ph, { lw: 3, shadow: false });
      g.save(); g.globalAlpha *= a; font(g, qs, "body", 700); g.fillStyle = C.ink; g.textAlign = "center"; g.textBaseline = "middle";
      const ty0 = 60 + ph / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((ln, i) => g.fillText(ln, W / 2, ty0 + i * lh));
      g.restore();
      // metaphor with the current value, on its own card
      const mb = { x: 540, y: Y_UP - 60, w: 840, h: Y_DOWN - Y_UP + 140 };
      const cy = Math.max(mb.y - 22, 60 + ph + 14);
      panel(g, mb.x - 30, cy, mb.w + 60, mb.y + mb.h + 56 - cy, { lw: 3 });
      drawMetaphor(g, q.metafora, mb, this.value, q, "answer");
    });
    // confirm buttons
    BUTTONS.forEach((b, k) => this.drawButton(g, b, k === this.overBtn));
    // both hands up feedback
    if (this.bothUpT > 0) ring(g, W / 2, Y_DOWN + 120, 50, this.bothUpT / BOTH_UP_S, { color: C.teal, lw: 14 });
    // countdown in the last seconds (campaign-style badge)
    const left = ANSWER_MAX_S - this.t;
    if (left < WARN_S) drawCountdown(g, W / 2, H - 80, left, WARN_S, { r: 58 });
    else textIcon(g, T("preu.ho_tens", "Ho tens? Toca {check}"), W / 2, LAYOUT.navY + 12, { size: 34, weight: 700, align: "center", color: C.ink });
  }

  drawButton(g, b, over) {
    const p = clamp(this.confirmP, 0, 1);
    const active = over && p > 0;
    const allowed = this.t > ARM_AFTER_S && (this.touched || this.t > 6);
    onCard(() => {
      panel(g, b.x, b.y, b.w, b.h, { fill: C.card, stroke: C.teal, lw: 6 });
      // holding fills the button with teal from the bottom (the hold feedback lives on the button)
      if (active) {
        g.save();
        g.beginPath(); g.rect(b.x, b.y, b.w, b.h); g.clip();
        g.fillStyle = C.teal;
        g.fillRect(b.x, b.y + b.h * (1 - p), b.w, b.h * p);
        g.restore();
        g.lineWidth = 6; g.strokeStyle = C.teal; g.strokeRect(b.x, b.y, b.w, b.h);
      }
      // icon-only button: a large, static check badge
      // «tria primer» only on the very first question of the session: after that the player knows
      // the ✓ needs a value chosen first, and the hint is just noise
      const hint = over && !allowed && this.i === 0 && !this.continuing;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2 - (hint ? 24 : 0);
      drawOkBadge(g, cx, cy, 78, active && p > 0.5 ? { fill: C.white, color: C.teal } : {});
      if (hint) text(g, T("preu.primer_tria", "tria primer"), cx, b.y + b.h - 40, { size: 30, weight: 800, align: "center", color: C.teal, maxW: b.w - 24 });
    });
  }

  drawReveal(g) {
    const app = this.app, r = this.results[this.results.length - 1], q = r.q;
    // the real value counts up from the first frame (no blank card, no "0" pause), landing just before the verdict
    const prog = easeOut(this.t / 2.0);
    const shown = q.escala === "log" && q.rang.min > 0
      ? q.rang.min * Math.pow(q.valor / q.rang.min, Math.max(prog, 0.0001))
      : lerp(q.rang.min, q.valor, prog);
    this.drawProgress(g, 34);
    wrap(g, q.enunciat, W / 2, 90, 1600, { size: 30, weight: 700, align: "center", maxLines: 2, color: C.ink, lineH: 1.18 });
    // the two comparison cards are deliberately small: the numbers are the headline, but what the
    // figure means (revelation + source) is what people read, so it gets the lower half of the screen
    const bl = { x: REVEAL_CARD.x, y: REVEAL_CARD.y, w: REVEAL_CARD.w, h: REVEAL_CARD.h };
    const br = { ...bl, x: W - REVEAL_CARD.x - REVEAL_CARD.w };
    const panelH = REVEAL_CARD.panelH + (q.escala === "log" ? 20 : 0);
    onCard(() => {
      for (const b of [bl, br]) panel(g, b.x - REVEAL_CARD.pad, REVEAL_CARD.panelY, b.w + 2 * REVEAL_CARD.pad, panelH, { lw: 3 });
      text(g, T("preu.tu", "TU"), bl.x + bl.w / 2, 212, { size: 44, kind: "title", align: "center", color: C.blue, maxW: bl.w });
      text(g, T("preu.la_realitat", "LA REALITAT"), br.x + br.w / 2, 212, { size: 44, kind: "title", align: "center", color: C.red, maxW: br.w });
      drawMetaphor(g, q.metafora, bl, r.answer, q, "answer");
      drawMetaphor(g, q.metafora, br, prog >= 1 ? q.valor : shown, q, "real");
    });
    if (this.t > 2.2) {
      const a = easeOut((this.t - 2.2) / 0.5);
      const diff = r.answer - q.valor;
      const verdict = r.points >= 95 ? T("preu.veredicte.clavat", "Clavat!")
        : r.points >= 80 ? T("preu.veredicte.aprop", "Molt a prop!")
        : diff < 0 ? T("preu.veredicte.sota", "No ben bé!") : T("preu.veredicte.sobre", "No ben bé!");
      // vertical rhythm: cards → verdict → revelation → source (small) → footer prompt.
      // The source sits on a fixed baseline above the footer prompt, so the explanation always gets
      // the same band and can be set as large as it fits in it; the verdict is then centred in
      // whatever room is left between the cards and the top of that explanation.
      const cardsBottom = REVEAL_CARD.panelY + panelH;
      const src = app.data.cite(q.font_id, q.any_referencia ? String(q.any_referencia) : "");
      const note = q.nota_curta ? `  ·  ${q.nota_curta}` : "";
      const srcLines = countLines(g, src + note, SRC.w, SRC.size, SRC.maxLines);
      const srcTop = SRC.lastBaseline - (srcLines - 1) * SRC.size * 1.2;
      const y0 = cardsBottom + REV.top, y1 = srcTop - SRC.size - 30;
      let revTop = y1;
      if (q.revelacio) {
        const fit = fitBlock(g, q.revelacio, REV.w, y1 - y0);
        // vertically centred in the band (cap height to descender), horizontally centred
        revTop = y0 + (y1 - y0 - fit.h) / 2;
        wrap(g, q.revelacio, W / 2, revTop + fit.size * 0.74, REV.w,
          { size: fit.size, align: "center", alpha: a, maxLines: REV.maxLines, lineH: REV.lineH });
      }
      const vy = (cardsBottom + revTop) / 2 + 64 * 0.36;   // cap height centred in the gap
      text(g, verdict, W / 2, vy, { size: 64, kind: "title", align: "center", color: r.points >= 80 ? C.teal : C.ink, alpha: a, maxW: W - 200 });
      wrap(g, src + note, W / 2, srcTop, SRC.w, { size: SRC.size, color: C.inkSoft, alpha: a, maxLines: SRC.maxLines, align: "center", lineH: 1.2 });
    }
    this.drawNextHint(g, REVEAL_NEXT_MIN_S);
  }
}

// Instruction pictogram (ISO-style figure): head, rounded torso whose top corners are the shoulders,
// arms attached at those corners, and hands drawn with the cursor's hand shape, rotated to continue
// the forearm. arm: 1 = up, -1 = low, 0 = sideways to ✓.
function handOnArm(g, wx, wy, ang, s, opts) {
  // ang = direction of the forearm (elbow -> wrist); the hand's fingers continue that direction
  g.save();
  g.translate(wx, wy);
  g.rotate(ang + Math.PI / 2);
  drawHand(g, 0, -0.62 * s, s, opts);
  g.restore();
}

function limb(g, pts) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
  g.stroke();
}

function figure(g, x, y, arm, t) {
  const s = 0.98;
  const accent = arm > 0 ? C.red : arm < 0 ? C.blue : C.teal;
  const sway = Math.sin(t * 2.4) * 6;        // small, slow arm motion that shows the gesture
  const TW = 46, TOP = -212, HIP = -104, SH = TOP + 12;   // torso width/top, hips, shoulder height
  const shL = [-TW / 2 + 6, SH], shR = [TW / 2 - 6, SH];   // shoulder joints inside the torso corners
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.lineCap = "round"; g.lineJoin = "round";
  g.fillStyle = C.ink; g.strokeStyle = C.ink;
  // head and torso
  g.beginPath(); g.arc(0, TOP - 44, 30, 0, Math.PI * 2); g.fill();
  rrect(g, -TW / 2, TOP, TW, HIP - TOP, [16, 16, 8, 8]); g.fill();
  // legs
  g.lineWidth = 20;
  limb(g, [[-11, HIP - 6], [-22, -6]]);
  limb(g, [[11, HIP - 6], [22, -6]]);
  // relaxed arm (screen left), with its hand
  g.lineWidth = 15;
  const rel = [shL, [-TW / 2 - 12, SH + 52], [-TW / 2 - 14, SH + 100]];
  limb(g, rel);
  handOnArm(g, rel[2][0], rel[2][1], Math.atan2(rel[2][1] - rel[1][1], rel[2][0] - rel[1][0]), 13, { fill: C.ink, stroke: C.card || C.white, side: "l" });
  // active arm (screen right)
  let elbow, wrist;
  if (arm > 0) { elbow = [shR[0] + 26, SH - 50 - sway * 0.4]; wrist = [shR[0] + 34, SH - 110 - sway]; }
  else if (arm < 0) { elbow = [shR[0] + 30, SH + 46]; wrist = [shR[0] + 48, SH + 92 + sway]; }
  else { elbow = [shR[0] + 50, SH + 2]; wrist = [shR[0] + 100, SH - 2]; }
  g.strokeStyle = accent;
  limb(g, [shR, elbow, wrist]);
  handOnArm(g, wrist[0], wrist[1], Math.atan2(wrist[1] - elbow[1], wrist[0] - elbow[0]), 17, { fill: accent, stroke: C.card || C.white, side: "r" });
  if (arm === 0) {
    g.fillStyle = C.teal; rrect(g, wrist[0] + 34, SH - 48, 64, 92, 10); g.fill();
    drawCheck(g, wrist[0] + 66, SH - 2, 34, { color: C.white });
  }
  g.restore();
}
