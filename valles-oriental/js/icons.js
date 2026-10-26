// Small vector icons usable inline in texts: "{check}" (the confirm badge: white check on a teal disc)
// and the arrows ▲ ▼ ▶ ◀ are drawn by textIcon() as vector shapes in place of the glyphs.
import { C, font, drawCheck, kindSx, caseFor } from "./ui.js";

// The badge is a self-contained sticker (card teal + white check, thin white rim) so it reads on any surface
export function drawOkBadge(g, cx, cy, r, { fill = C.okFill, color = C.white } = {}) {
  g.save();
  g.fillStyle = fill;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = Math.max(2, r * 0.08); g.strokeStyle = C.white; g.stroke();
  drawCheck(g, cx, cy, r * 1.1, { color });
  g.restore();
}

// Glyphs drawn as vector icons (Archivo has no ▲ ▼ ▶ ◀; the check is the confirm badge)
const TOKENS = /(\{check\}|▲|▼|▶|◀)/;

function arrow(g, tok, x, y, s, color) {
  // equilateral-ish triangle centred on (x, y), "s" = width
  const h = s * 0.86, d = { "▲": [0, -1], "▼": [0, 1], "▶": [1, 0], "◀": [-1, 0] }[tok];
  g.save();
  g.fillStyle = color;
  g.beginPath();
  if (d[1]) { g.moveTo(x, y + d[1] * h / 2); g.lineTo(x - s / 2, y - d[1] * h / 2); g.lineTo(x + s / 2, y - d[1] * h / 2); }
  else { g.moveTo(x + d[0] * h / 2, y); g.lineTo(x - d[0] * h / 2, y - s / 2); g.lineTo(x - d[0] * h / 2, y + s / 2); }
  g.closePath(); g.fill();
  g.restore();
}

// Single-line text with inline icons ({check}, ▲, ▼, ▶, ◀). Returns the drawn width.
export function textIcon(g, str, x, y, { size = 40, kind = "body", weight = 400, color = C.ink, align = "left", alpha = 1, maxW = 0 } = {}) {
  const parts = caseFor(str, kind).split(TOKENS);
  g.save();
  g.globalAlpha *= alpha;
  font(g, size, kind, weight);
  const iconW = (tok) => (tok === "{check}" ? size * 1.15 : size * 0.62);
  const gap = size * 0.18;
  const widthOf = (p, i) => (i % 2 ? iconW(p) + gap * 2 : g.measureText(p).width);
  let total = parts.reduce((t, p, i) => t + widthOf(p, i), 0);
  if (maxW && total > maxW) {
    size = Math.max(12, Math.floor(size * maxW / total));
    font(g, size, kind, weight);
    total = parts.reduce((t, p, i) => t + (i % 2 ? (p === "{check}" ? size * 1.15 : size * 0.62) + size * 0.36 : g.measureText(p).width), 0);
  }
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  g.fillStyle = color;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  const gp = size * 0.18;
  parts.forEach((p, i) => {
    if (i % 2 === 0) { g.fillText(p, cx, y); cx += g.measureText(p).width; return; }
    const w = p === "{check}" ? size * 1.15 : size * 0.62;
    if (p === "{check}") drawOkBadge(g, cx + gp + w / 2, y - size * 0.34, w / 2);
    else arrow(g, p, cx + gp + w / 2, y - size * 0.36, w, color);
    cx += w + gp * 2;
    g.fillStyle = color;
  });
  g.restore();
  return total;
}

// Text optically centred on (x, y) using the glyphs' real bounding box (digits in circles,
// badges...). textBaseline "middle" centres the em box, which looks off for digits/caps.
export function centerText(g, str, x, y, { size = 40, kind = "body", weight = 400, color = C.ink } = {}) {
  g.save();
  font(g, size, kind, weight);
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  str = caseFor(str, kind);
  const m = g.measureText(str);
  const asc = m.actualBoundingBoxAscent || size * 0.72, desc = m.actualBoundingBoxDescent || 0;
  g.translate(x, y + (asc - desc) / 2); g.scale(kindSx(kind), 1);
  g.fillText(str, 0, 0);
  g.restore();
}

// Mouse with the left button highlighted: the "hold the click" gesture in mouse mode
export function drawMouseIcon(g, x, y, s, { color = C.ink, accent = C.teal } = {}) {
  g.save();
  g.translate(x, y);
  const w = s * 1.1, h = s * 1.6;
  g.lineWidth = Math.max(2, s * 0.12);
  g.strokeStyle = color;
  g.fillStyle = C.card;
  g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, w / 2); g.fill(); g.stroke();
  // left button
  g.fillStyle = accent;
  g.beginPath();
  g.moveTo(0, -h / 2 + g.lineWidth / 2);
  g.lineTo(0, -h * 0.08);
  g.lineTo(-w / 2 + g.lineWidth / 2, -h * 0.08);
  g.arc(-w / 2 + w / 2, -h / 2 + w / 2, w / 2 - g.lineWidth / 2, Math.PI, Math.PI * 1.5);
  g.closePath(); g.fill();
  g.beginPath(); g.moveTo(0, -h / 2); g.lineTo(0, -h * 0.08); g.moveTo(-w / 2, -h * 0.08); g.lineTo(w / 2, -h * 0.08); g.stroke();
  g.restore();
}
