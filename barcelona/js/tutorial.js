// «Com es juga» tutorials: the instruction stickman and the three-card layout shared by the games.
// The figure is an ISO-style pictogram: round head, rounded torso whose top corners are the
// shoulders, legs, and arms whose hands are the cursor's hand shape continuing the forearm. The body
// is a neutral mid-tone and the arm(s) doing the gesture carry the card's accent colour, so the
// gesture reads in every theme (an ink-coloured arm on an ink body disappears). Coordinates of a
// figure are in its own space: origin between the feet, y up negative, about 290 units tall.
import { W, C, text, wrap, wrapLines, font, panel, rrect, onCard, posterBlock, clamp, drawCheck } from "./ui.js";
import { textIcon, centerText, drawOkBadge } from "./icons.js";
import { drawHand, handOutline } from "./hand.js";

// --- colours ------------------------------------------------------------------------------------
function rgbOf(c) {
  const s = String(c);
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [128, 128, 128];
}
export function mix(a, b, t) {
  const p = rgbOf(a), q = rgbOf(b), k = clamp(t, 0, 1);
  return `rgb(${Math.round(p[0] + (q[0] - p[0]) * k)},${Math.round(p[1] + (q[1] - p[1]) * k)},${Math.round(p[2] + (q[2] - p[2]) * k)})`;
}
const withAlpha = (g, a, fn) => { g.save(); g.globalAlpha *= a; fn(); g.restore(); };

// --- figure -------------------------------------------------------------------------------------
export const FIG = { TW: 46, TOP: -212, HIP: -104, SCALE: 0.98, ARM: 58 };
FIG.SH = FIG.TOP + 12;                                   // shoulder height
FIG.shL = [-FIG.TW / 2 + 6, FIG.SH];                     // shoulder joints inside the torso corners
FIG.shR = [FIG.TW / 2 - 6, FIG.SH];
// a relaxed arm hanging by the side (offsets from its shoulder)
export const RELAXED = { l: { e: [-18, 52], w: [-20, 100] }, r: { e: [18, 52], w: [20, 100] } };

function limb(g, pts) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
  g.stroke();
}

// Hand at the wrist with the fingers continuing the forearm (ang = direction elbow -> wrist)
function handOnArm(g, wx, wy, ang, s, opts) {
  g.save();
  g.translate(wx, wy);
  g.rotate(ang + Math.PI / 2);
  drawHand(g, 0, -0.62 * s, s, { ...opts, stroke: handOutline(opts.fill, opts.stroke) });
  g.restore();
}

// Two-joint arm towards a wrist target (offset from the shoulder): the elbow bends outwards/down
// (bend +1 for the screen-right arm, -1 for the left one). Out-of-reach targets are clamped.
export function reach(to, bend, L = FIG.ARM) {
  let dx = to[0], dy = to[1];
  let d = Math.hypot(dx, dy) || 1;
  const maxD = 2 * L * 0.995;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  const h = Math.sqrt(Math.max(0, L * L - (d / 2) * (d / 2)));
  const nx = -dy / d, ny = dx / d;
  return { e: [dx / 2 + nx * h * bend, dy / 2 + ny * h * bend], w: [dx, dy] };
}

// Body colour: a neutral mid-tone of the card ink (the accent arm is the only saturated part)
export function bodyColour() { return mix(C.inkSoft, C.card, 0.3); }

// Draws a figure at (x, y) (feet). left/right: { e, w } offsets from the shoulder (or { to } to use
// reach()), plus colour and hand size; behind/front(g, J) draw props in figure space, J = joints.
export function drawFigure(g, x, y, { left = null, right = null, behind = null, front = null, scale = FIG.SCALE } = {}) {
  const { TW, TOP, HIP, shL, shR } = FIG;
  const body = bodyColour();
  const arm = (spec, sh, side) => {
    const a = spec || { ...RELAXED[side] };
    const p = a.to ? reach(a.to, side === "r" ? 1 : -1) : a;
    return { e: [sh[0] + p.e[0], sh[1] + p.e[1]], w: [sh[0] + p.w[0], sh[1] + p.w[1]],
      colour: a.colour || body, hand: a.hand || (spec ? 17 : 13), active: !!spec };
  };
  const L = arm(left, shL, "l"), R = arm(right, shR, "r");
  const J = { shL, shR, eL: L.e, wL: L.w, eR: R.e, wR: R.w, SH: FIG.SH, TOP, HIP };
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  g.lineCap = "round"; g.lineJoin = "round";
  if (behind) { g.save(); behind(g, J); g.restore(); }
  g.fillStyle = body; g.strokeStyle = body;
  // head and torso
  g.beginPath(); g.arc(0, TOP - 44, 30, 0, Math.PI * 2); g.fill();
  rrect(g, -TW / 2, TOP, TW, HIP - TOP, [16, 16, 8, 8]); g.fill();
  // legs
  g.lineWidth = 20;
  limb(g, [[-11, HIP - 6], [-22, -6]]);
  limb(g, [[11, HIP - 6], [22, -6]]);
  // arms: relaxed ones first, active ones on top
  for (const [A, sh, side] of [[L, shL, "l"], [R, shR, "r"]].sort((p, q) => p[0].active - q[0].active)) {
    g.lineWidth = 15;
    g.strokeStyle = A.colour;
    limb(g, [sh, A.e, A.w]);
    handOnArm(g, A.w[0], A.w[1], Math.atan2(A.w[1] - A.e[1], A.w[0] - A.e[0]), A.hand, { fill: A.colour, stroke: C.card || C.white, side });
  }
  if (front) { g.save(); front(g, J); g.restore(); }
  g.restore();
}

// --- props --------------------------------------------------------------------------------------
// The € ball, as in «Final de mes»
export function drawCoin(g, x, y, r) {
  g.save();
  g.fillStyle = C.mustard;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = Math.max(3, r * 0.18); g.strokeStyle = C.ink; g.stroke();
  g.restore();
  centerText(g, "€", x, y, { size: Math.round(r * 1.3), weight: 700, color: C.ink });
}

// A guide path (dashed, faint) ending in an arrow head, with the € travelling along it on a loop
export function drawCoinPath(g, a, b, t, colour, { r = 22, period = 2.2, phase = 0 } = {}) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  withAlpha(g, 0.45, () => {
    g.strokeStyle = colour; g.lineWidth = 5; g.setLineDash([10, 10]); g.lineCap = "round";
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  });
  g.save();
  g.fillStyle = colour;
  g.translate(b[0], b[1]); g.rotate(ang);
  g.beginPath(); g.moveTo(14, 0); g.lineTo(-10, -13); g.lineTo(-10, 13); g.closePath(); g.fill();
  g.restore();
  const k = ((t / period + phase) % 1 + 1) % 1, u = 0.08 + 0.78 * k;
  // it appears and leaves by growing/shrinking (never half-transparent: the € must stay legible)
  const grow = clamp(Math.min(k / 0.1, (1 - k) / 0.1), 0, 1);
  if (grow > 0.05) drawCoin(g, a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, r * (0.4 + 0.6 * grow));
}

// --- screen -------------------------------------------------------------------------------------
export const CARDS = { xs: [480, 960, 1440], y: 300, w: 440, h: 540, feet: 684, label: 734, sub: 786 };

// «Com es juga» screen: a small «COM ES JUGA» block, the game title, a short plain-text explanation of
// the game (what it is, what to do, how it ends; at most two lines) and three cards. Each card:
// { draw(g, cx, feetY, t), label, sub, tone } where tone is a card colour role ("red", "blue",
// "teal") for the sub-label.
export const EXPLAIN = { w: 1640, y0: 206, maxSize: 36, minSize: 28, lineH: 1.22 };

export function drawTutorial(g, { title, block, explain = "", cards, t }) {
  posterBlock(g, block, W / 2, 58, 34, { align: "center", maxW: W - 200 });
  text(g, title, W / 2, 158, { size: 96, kind: "title", align: "center", color: C.head, maxW: W - 200 });
  if (explain) {
    // the largest size at which it fits in two lines; a single line sits in the middle of the band
    let size = EXPLAIN.maxSize, lines = [];
    for (; size >= EXPLAIN.minSize; size -= 2) {
      font(g, size, "body", 600);
      lines = wrapLines(g, explain, EXPLAIN.w);
      if (lines.length <= 2) break;
    }
    const lh = Math.round(size * EXPLAIN.lineH);
    const y = lines.length > 1 ? EXPLAIN.y0 : EXPLAIN.y0 + lh / 2;
    wrap(g, explain, W / 2, y, EXPLAIN.w, { size, weight: 600, align: "center", color: C.ink, lineH: EXPLAIN.lineH, maxLines: 2 });
  }
  cards.forEach((it, i) => onCard(() => {
    const x = CARDS.xs[i];
    panel(g, x - CARDS.w / 2, CARDS.y, CARDS.w, CARDS.h, { lw: 3 });
    g.save();
    g.beginPath(); g.rect(x - CARDS.w / 2 + 4, CARDS.y + 4, CARDS.w - 8, CARDS.h - 8); g.clip();
    it.draw(g, x, CARDS.feet, t);
    g.restore();
    textIcon(g, it.label, x, CARDS.label, { size: 44, weight: 800, align: "center", maxW: CARDS.w - 40 });
    textIcon(g, it.sub, x, CARDS.sub, { size: 36, weight: 800, align: "center", color: C[it.tone] || C.ink, maxW: CARDS.w - 40 });
  }));
}

// --- «El preu (in)just» --------------------------------------------------------------------------
// The answer as a small value chip (as on the game's answer card): the number, an arrow showing which
// way it is moving and a gauge under it; locked = answered (teal frame + ✓ badge).
function valueChip(g, cx, cy, value, dir, colour, { locked = false, frac = 0.5 } = {}) {
  const w = 150, h = 92, x = cx - w / 2, y = cy - h / 2;
  g.save();
  g.fillStyle = C.card; rrect(g, x, y, w, h, 10); g.fill();
  g.lineWidth = locked ? 6 : 4; g.strokeStyle = locked ? C.teal : colour; rrect(g, x, y, w, h, 10); g.stroke();
  // gauge
  const gx = x + 18, gw = w - 36, gy = y + h - 22;
  g.fillStyle = C.cardSoft; rrect(g, gx, gy, gw, 9, 4.5); g.fill();
  g.fillStyle = locked ? C.teal : colour; rrect(g, gx, gy, Math.max(9, gw * clamp(frac, 0, 1)), 9, 4.5); g.fill();
  g.restore();
  const num = String(value);
  if (dir) {
    centerText(g, num, cx - 14, y + 36, { size: 40, kind: "title", color: C.ink });
    // arrow beside the number: ▲ up / ▼ down
    const ax = cx + 44, ay = y + 36, s = 12;
    g.save(); g.fillStyle = colour; g.beginPath();
    if (dir > 0) { g.moveTo(ax, ay - s); g.lineTo(ax + s, ay + s * 0.7); g.lineTo(ax - s, ay + s * 0.7); }
    else { g.moveTo(ax, ay + s); g.lineTo(ax + s, ay - s * 0.7); g.lineTo(ax - s, ay - s * 0.7); }
    g.closePath(); g.fill(); g.restore();
  } else centerText(g, num, cx, y + 36, { size: 40, kind: "title", color: C.ink });
  if (locked) drawOkBadge(g, x + w - 4, y + 4, 17);
}

// arm: 1 = up (the answer climbs), -1 = down (it drops), 0 = hand held still on the ✓ (it is answered)
export function preuFigure(g, x, y, arm, t) {
  const tone = arm > 0 ? C.red : arm < 0 ? C.blue : C.teal;
  const sway = Math.sin(t * 2.4) * 6;        // small, slow arm motion that shows the gesture
  const right = arm > 0 ? { e: [26, -50 - sway * 0.4], w: [34, -110 - sway] }
    : arm < 0 ? { e: [30, 46], w: [48, 92 + sway] }
    : { e: [50, 2], w: [100, -2] };
  // the value runs through 20..49 (up) or 49..20 (down) on a loop, a few steps a second, as the lever does
  const LO = 20, N = 30, k = Math.floor((t * 5) % N);
  const v = arm > 0 ? LO + k : arm < 0 ? LO + N - 1 - k : 35;
  // the ✓ fills from the bottom while the hand stays on it, then the answer is fixed for a moment
  const cyc = t % 3.2, p = clamp((cyc - 0.4) / 1.2, 0, 1), locked = arm === 0 && p >= 1;
  drawFigure(g, x, y, {
    right: { ...right, colour: tone },
    front: (gg, J) => {
      valueChip(gg, -92, -326, v, arm, tone, { locked, frac: (v - LO) / (N - 1) });
      if (arm !== 0) return;
      const bx = J.wR[0] + 34, by = J.SH - 48, bw = 64, bh = 92;
      gg.fillStyle = C.card; rrect(gg, bx, by, bw, bh, 10); gg.fill();
      if (p > 0) {
        gg.save(); rrect(gg, bx, by, bw, bh, 10); gg.clip();
        gg.fillStyle = C.teal; gg.fillRect(bx, by + bh * (1 - p), bw, bh * p);
        gg.restore();
      }
      gg.lineWidth = 5; gg.strokeStyle = C.teal; rrect(gg, bx, by, bw, bh, 10); gg.stroke();
      // check in teal over the empty part and white over the filled one (always whole)
      const fy = by + bh * (1 - p);
      gg.save(); gg.beginPath(); gg.rect(bx, by, bw, fy - by); gg.clip(); drawCheck(gg, bx + bw / 2, by + bh / 2, 34, { color: C.teal }); gg.restore();
      if (p > 0) { gg.save(); gg.beginPath(); gg.rect(bx, fy, bw, by + bh - fy); gg.clip(); drawCheck(gg, bx + bw / 2, by + bh / 2, 34, { color: C.white }); gg.restore(); }
    },
  });
}

// Goal line under the cards: a small target (the real figure) and the rule
export function drawPreuGoal(g, label, y = 916) {
  const size = 40, r = 22, gap = 22;
  const tw = textIcon(g, label, -10000, -10000, { size, weight: 800 });
  const x0 = W / 2 - (2 * r + gap + tw) / 2, cx = x0 + r, cy = y - 2;
  onCard(() => {
    g.save();
    for (const [rr, col] of [[r, C.red], [r * 0.66, C.card], [r * 0.33, C.red]]) {
      g.fillStyle = col; g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill();
    }
    g.lineWidth = 3; g.strokeStyle = C.card; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.restore();
  });
  textIcon(g, label, x0 + 2 * r + gap, y + size * 0.36 - 2, { size, weight: 800, color: C.ink });
}

// --- «Final de mes» -------------------------------------------------------------------------------
// Two hands: the line between them is where the € goes. tilt: 0 level, 1 right hand up, -1 down.
// Arms reach out almost straight at shoulder height, as when holding a bar; the line between the
// hands looks as in the game (teal when level, amber when tilted).
function linePose(tilt, t) {
  const k = tilt ? tilt * (1 + 0.1 * Math.sin(t * 2.4)) : 0;
  const bob = tilt ? 0 : 4 * Math.sin(t * 2.4);
  return {
    left: { to: [-104, -14 + 44 * k + bob] },
    right: { to: [104, -14 - 44 * k + bob] },
  };
}

function coinPathFor(dir) {
  const y0 = -332, dy = 30;
  return dir > 0 ? [[-120, y0 + dy], [120, y0 - dy]] : dir < 0 ? [[-120, y0 - dy], [120, y0 + dy]] : [[-120, y0], [120, y0]];
}

export function finaldemesCards(oneHand, T) {
  const tones = ["teal", "red", "blue"], dirs = [0, 1, -1];
  if (oneHand) {
    // one hand: the € follows the height of the hand (card order: middle, up, down)
    const labels = [
      [T("finaldemes.com.mig", "Mà al mig"), T("finaldemes.com.recte", "▶ recte")],
      [T("finaldemes.com.amunt", "Mà amunt"), T("finaldemes.com.puja", "▲ puja")],
      [T("finaldemes.com.avall", "Mà avall"), T("finaldemes.com.baixa", "▼ baixa")],
    ];
    const poseOf = (i, t) => {
      const sway = Math.sin(t * 2.4) * 6;
      if (i === 1) return { e: [26, -50 - sway * 0.4], w: [34, -110 - sway] };
      if (i === 2) return { e: [30, 46], w: [48, 92 + sway] };
      return { e: [50, 2 + sway * 0.3], w: [100, -2 + sway * 0.5] };
    };
    return dirs.map((dir, i) => ({
      label: labels[i][0], sub: labels[i][1], tone: tones[i],
      draw: (g, x, y, t) => drawFigure(g, x, y, {
        right: { ...poseOf(i, t), colour: C[tones[i]] },
        front: (gg) => drawCoinPath(gg, ...coinPathFor(dir), t, C[tones[i]], { phase: i * 0.31 }),
      }),
    }));
  }
  const labels = [
    [T("finaldemes.com.linia", "Mans en línia"), T("finaldemes.com.recte", "▶ recte")],
    [T("finaldemes.com.inclinaAmunt", "Inclina amunt"), T("finaldemes.com.puja", "▲ puja")],
    [T("finaldemes.com.inclinaAvall", "Inclina avall"), T("finaldemes.com.baixa", "▼ baixa")],
  ];
  return dirs.map((dir, i) => ({
    label: labels[i][0], sub: labels[i][1], tone: tones[i],
    draw: (g, x, y, t) => {
      const p = linePose(dir, t);
      drawFigure(g, x, y, {
        left: { ...p.left, colour: C[tones[i]] },
        right: { ...p.right, colour: C[tones[i]] },
        // the line between the hands, behind the body, as the game draws it
        behind: (gg, J) => withAlpha(gg, 0.6, () => {
          gg.strokeStyle = dir ? C.mustard : C.teal; gg.lineWidth = 12; gg.lineCap = "round";
          gg.beginPath(); gg.moveTo(J.wL[0], J.wL[1]); gg.lineTo(J.wR[0], J.wR[1]); gg.stroke();
        }),
        front: (gg) => drawCoinPath(gg, ...coinPathFor(dir), t, C[tones[i]], { phase: i * 0.31 }),
      });
    },
  }));
}

// Goal line under the cards: a small piece of the game's road (white band with dark edges, the data
// line along its middle and the € on it), then the rule
export function drawFinaldemesGoal(g, label, y = 916) {
  const size = 40, iw = 128, gap = 24, half = 17;
  const tw = textIcon(g, label, -10000, -10000, { size, weight: 800 });
  const x0 = W / 2 - (iw + gap + tw) / 2;
  const mid = (u) => [x0 + iw * u, y + 10 - 26 * (u * u * (3 - 2 * u))];   // gentle rise, left to right
  const edge = (off) => { g.beginPath(); for (let i = 0; i <= 16; i++) { const [px, py] = mid(i / 16); if (i) g.lineTo(px, py + off); else g.moveTo(px, py + off); } };
  onCard(() => {
    g.save();
    g.beginPath();
    for (let i = 0; i <= 16; i++) { const [px, py] = mid(i / 16); if (i) g.lineTo(px, py - half); else g.moveTo(px, py - half); }
    for (let i = 16; i >= 0; i--) { const [px, py] = mid(i / 16); g.lineTo(px, py + half); }
    g.closePath(); g.fillStyle = C.card; g.fill();
    g.strokeStyle = C.cardLine; g.lineWidth = 3.5; g.lineCap = "round";
    edge(-half); g.stroke(); edge(half); g.stroke();
    g.strokeStyle = C.teal; g.lineWidth = 3; g.setLineDash([7, 6]);
    edge(0); g.stroke();
    g.restore();
    const [cx, cy] = mid(0.55);
    drawCoin(g, cx, cy, 12);
  });
  textIcon(g, label, x0 + iw + gap, y + size * 0.36 - 2, { size, weight: 800, color: C.ink });
}

// --- «Encén la vaga» ------------------------------------------------------------------------------
// Hex cell (pointy top), as on the game's map
function hex(g, x, y, r) {
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = ((60 * k - 90) * Math.PI) / 180;
    if (k) g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}

// Motion marks next to a waving hand: two short arcs on its outer side
function motionArcs(g, x, y, side, colour) {
  withAlpha(g, 0.7, () => {
    g.strokeStyle = colour; g.lineWidth = 5; g.lineCap = "round";
    for (const [r, a] of [[30, 0.5], [44, 0.42]]) {
      const c = side > 0 ? 0 : Math.PI;
      g.beginPath(); g.arc(x, y - 6, r, c - a, c + a); g.stroke();
    }
  });
}

export function encenCards(oneArm, T) {
  const warm = () => C.heatHot || C.red;
  // 1 · wave: arms up in a V, swinging fast, with motion marks
  const wave = (g, x, y, t) => {
    const s = Math.sin(t * 7), c = Math.cos(t * 7);
    drawFigure(g, x, y, {
      left: oneArm ? null : { to: [-62 - 26 * s, -88 + 10 * c], colour: C.red },
      right: { to: [62 + 26 * s, -88 - 10 * c], colour: C.red },
      front: (gg, J) => {
        if (!oneArm) motionArcs(gg, J.wL[0], J.wL[1] - 18, -1, C.red);
        motionArcs(gg, J.wR[0], J.wR[1] - 18, 1, C.red);
      },
    });
  };
  // 2 · sweep over a small map: cells under the hand warm up, the ones left behind cool down
  const R = 16, HW = Math.sqrt(3) * R, ROWS = [8, 7, 8];
  const cells = [];
  ROWS.forEach((n, row) => {
    for (let col = 0; col < n; col++) cells.push({ x: (col - (n - 1) / 2) * HW, y: -358 + row * 1.5 * R });
  });
  const handAt = (tt) => reach([16 + 96 * Math.sin(tt * 1.7), -128], 1);
  const sweep = (g, x, y, t) => {
    drawFigure(g, x, y, {
      right: { to: handAt(t).w, colour: C.blue },
      behind: (gg, J) => {
        for (const cell of cells) {
          let heat = 0;
          for (let k = 0; k < 24; k++) {
            const w = handAt(t - k * 0.08).w;
            const hx = J.shR[0] + w[0];
            heat = Math.max(heat, Math.exp(-(((hx - cell.x) / 34) ** 2)) * (1 - k / 24));
          }
          hex(gg, cell.x, cell.y, R - 1.5);
          gg.fillStyle = mix(C.cardSoft, warm(), heat); gg.fill();
          gg.lineWidth = heat > 0.6 ? 3.5 : 1.5; gg.strokeStyle = heat > 0.6 ? C.cardLine : mix(C.cardSoft, C.cardInk, 0.35); gg.stroke();
        }
      },
    });
  };
  // 3 · the gauge passes the flag and holds: the flag becomes the ✓
  const goal = (g, x, y, t) => {
    const cyc = t % 5.2, fill = clamp(cyc / 3, 0, 1), reached = cyc > 3;
    const k = 0.86 * (1 - Math.pow(1 - fill, 2));
    const bounce = reached ? Math.abs(Math.sin(t * 6)) * 6 : 0;
    drawFigure(g, x, y - bounce, {
      left: oneArm ? null : { to: [-52, -104], colour: C.teal },
      right: { to: [52, -104], colour: C.teal },
      front: (gg) => {
        const bx = -150, by = -344, bw = 300, bh = 30, fx = bx + bw * 0.75;
        gg.fillStyle = C.card; rrect(gg, bx, by, bw, bh, 4); gg.fill();
        gg.save(); rrect(gg, bx, by, bw, bh, 4); gg.clip();
        withAlpha(gg, 0.22, () => { gg.fillStyle = warm(); gg.fillRect(fx, by, bx + bw - fx, bh); });
        gg.fillStyle = warm(); gg.fillRect(bx, by, bw * k, bh);
        gg.restore();
        gg.lineWidth = reached ? 5 : 3; gg.strokeStyle = reached ? C.teal : C.cardLine; rrect(gg, bx, by, bw, bh, 4); gg.stroke();
        gg.lineWidth = 5; gg.strokeStyle = C.cardLine; gg.lineCap = "round";
        gg.beginPath(); gg.moveTo(fx, by + bh + 4); gg.lineTo(fx, by - (reached ? 6 : 26)); gg.stroke();
        if (reached) drawOkBadge(gg, fx, by - 16, 15);
        else {
          gg.fillStyle = warm(); gg.lineWidth = 2;
          gg.beginPath(); gg.moveTo(fx + 2, by - 26); gg.lineTo(fx + 28, by - 18); gg.lineTo(fx + 2, by - 10); gg.closePath(); gg.fill(); gg.stroke();
        }
      },
    });
  };
  return [
    { label: T("encen.com.mou", "Mou les mans"), sub: T("encen.com.mou_sub", "sense parar"), tone: "red", draw: wave },
    { label: T("encen.com.mapa", "Per tot el mapa"), sub: T("encen.com.mapa_sub", "si pares, es refreda"), tone: "blue", draw: sweep },
    { label: T("encen.com.bandera", "Supera la fita"), sub: T("encen.com.bandera_sub", "i mantén-t'hi"), tone: "teal", draw: goal },
  ];
}
