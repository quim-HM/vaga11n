// Hand cursor: open-palm silhouette with a dwell-progress ring.
// Base drawing is a left hand seen from the front (thumb on the right, pinky on the left);
// side "r" mirrors it, so on screen the thumb always points towards the body centre.
import { C, ring, text, measure, W, LAYOUT } from "./ui.js";
import { drawMouseIcon } from "./icons.js";

// Unit coordinates: palm centred around (0, 0.15); fingers up to y≈-1.15.
const FINGERS = [
  // [x, top, width]  pinky → index (index sits next to the thumb)
  [-0.50, -0.80, 0.22],
  [-0.255, -1.04, 0.235],
  [0.005, -1.13, 0.235],
  [0.265, -1.00, 0.235],
];

function handPath(g) {
  g.beginPath();
  for (const [x, top, w] of FINGERS) g.roundRect(x, top, w, -top + 0.25, w / 2);
  // palm: exactly as wide as the outer finger edges so the sides run straight
  g.roundRect(-0.50, -0.28, 1.0, 0.98, [0.12, 0.12, 0.44, 0.44]);
  // thumb: from the lower right of the palm, tilted outwards (positive angle = clockwise)
  g.save();
  g.translate(0.36, 0.34);
  g.rotate(0.72);
  g.roundRect(-0.14, -0.74, 0.28, 0.84, 0.14);
  g.restore();
}

// Relative luminance (WCAG) of a #rgb / #rrggbb / rgb() colour
function lum(c) {
  const s = String(c);
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i), p;
  if (m) {
    const h = m[1].length === 3 ? m[1].split("").map((x) => x + x).join("") : m[1];
    p = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else if ((m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i))) p = [m[1], m[2], m[3]].map(Number);
  else return 0.5;
  const v = p.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

// Sticker outline for a hand: the wanted one (white) unless it is about as light as the fill, in which
// case the outline would fuse with it and swallow the gaps between the fingers (a white or yellow hand
// with a white rim reads as a blob). Then a dark ink outline keeps the silhouette slim.
export function handOutline(fill, wanted = C.white) {
  const a = lum(fill), b = lum(wanted);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 1.6 ? C.cardInk : wanted;
}

export function drawHand(g, x, y, s, { fill = C.red, stroke = C.white, side = "r", outline = 0.2 } = {}) {
  g.save();
  g.translate(x, y);
  g.scale(side === "r" ? -s : s, s);
  g.lineJoin = "round";
  // outline: stroke the union first, then fill on top (nonzero winding merges the parts)
  handPath(g);
  g.lineWidth = outline * 2;
  g.strokeStyle = stroke;
  g.stroke();
  g.fillStyle = fill;
  g.fill("nonzero");
  g.restore();
}

export function drawHandCursor(g, x, y, { color = C.red, r = 40, alpha = 1, side = "r", progress = 0, progressColor = C.teal } = {}) {
  const s = r * 0.9;
  const cy = y - s * 0.25;   // visual centre of the hand
  g.save();
  g.globalAlpha *= alpha;
  // soft shadow
  g.save();
  g.globalAlpha *= 0.22;
  drawHand(g, x + 5, y + 7, s, { fill: C.cardInk, stroke: C.cardInk, side });
  g.restore();
  drawHand(g, x, y, s, { fill: color, stroke: handOutline(color), side });
  if (progress > 0) ring(g, x, cy, r * 1.5, progress, { color: progressColor, lw: 10 });
  g.restore();
}

// "Raise your hand" affordance (mouse mode: "hold the click"): a progress ring with the gesture inside.
// waitT = seconds the prompt has been waiting: after NUDGE_AFTER_S with no progress it starts to pulse
// (a soft ring expanding from the icon + a gentle size breath), to catch the eye of whoever missed it.
const NUDGE_AFTER_S = 5, NUDGE_PERIOD_S = 1.4;
export function drawRaiseIcon(g, cx, cy, r, progress, { mouse = false, color = C.teal, ink = C.ink, waitT = 0 } = {}) {
  let s0 = 1;
  if (waitT > NUDGE_AFTER_S && progress <= 0) {
    const k = ((waitT - NUDGE_AFTER_S) % NUDGE_PERIOD_S) / NUDGE_PERIOD_S;
    g.save();
    g.globalAlpha *= 0.7 * (1 - k);
    g.lineWidth = Math.max(4, r * 0.12); g.strokeStyle = color;
    g.beginPath(); g.arc(cx, cy, r * (1 + 0.9 * k), 0, Math.PI * 2); g.stroke();
    g.restore();
    s0 = 1 + 0.08 * Math.sin(k * Math.PI * 2);
  }
  ring(g, cx, cy, r * s0, progress, { color, lw: Math.max(8, r * 0.22) });
  if (mouse) drawMouseIcon(g, cx, cy, r * 0.55 * s0, { color: ink });
  else { const s = r * 0.62 * s0; drawHand(g, cx, cy + s * 0.25, s, { fill: ink, stroke: handOutline(ink), side: "r" }); }
}
// Footer prompt («Aixeca la mà per continuar»): icon + label as one group, optically centred in the
// footer's centre zone (the corners belong to the ◀ ▶ shortcuts)
export function drawFooterHint(g, label, progress, { mouse = false, size = 34, alpha = 1, waitT = 0 } = {}) {
  const r = 28, gap = 18;
  const tw = measure(g, label, size, "body", 700);
  const x0 = W / 2 - (2 * r + gap + tw) / 2, cy = LAYOUT.navY;
  g.save();
  g.globalAlpha *= alpha;
  drawRaiseIcon(g, x0 + r, cy, r, progress, { mouse, waitT });
  text(g, label, x0 + 2 * r + gap, cy + size * 0.355, { size, weight: 700, color: C.ink });
  g.restore();
}

// Thin bar that fills while a screen waits: it moves on by itself when full (nothing ever blocks)
export function drawAutoBar(g, x, y, w, k, { back = C.track, fill = C.inkSoft } = {}) {
  g.save();
  g.fillStyle = back; g.fillRect(x, y, w, 6);
  g.fillStyle = fill; g.fillRect(x, y, w * clamp01(k), 6);
  g.restore();
}
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);