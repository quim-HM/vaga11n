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
  drawHand(g, x, y, s, { fill: color, stroke: C.white, side });
  if (progress > 0) ring(g, x, cy, r * 1.5, progress, { color: progressColor, lw: 10 });
  g.restore();
}

// "Raise your hand" affordance (mouse mode: "hold the click"): a progress ring with the gesture inside
export function drawRaiseIcon(g, cx, cy, r, progress, { mouse = false, color = C.teal, ink = C.ink } = {}) {
  ring(g, cx, cy, r, progress, { color, lw: Math.max(8, r * 0.22) });
  if (mouse) drawMouseIcon(g, cx, cy, r * 0.55, { color: ink });
  else { const s = r * 0.62; drawHand(g, cx, cy + s * 0.25, s, { fill: ink, stroke: C.white, side: "r" }); }
}
// Footer prompt («Aixeca la mà per continuar»): icon + label as one group, optically centred in the
// footer's centre zone (the corners belong to the ◀ ▶ shortcuts)
export function drawFooterHint(g, label, progress, { mouse = false, size = 34, alpha = 1 } = {}) {
  const r = 28, gap = 18;
  const tw = measure(g, label, size, "body", 700);
  const x0 = W / 2 - (2 * r + gap + tw) / 2, cy = LAYOUT.navY;
  g.save();
  g.globalAlpha *= alpha;
  drawRaiseIcon(g, x0 + r, cy, r, progress, { mouse });
  text(g, label, x0 + 2 * r + gap, cy + size * 0.355, { size, weight: 700, color: C.ink });
  g.restore();
}