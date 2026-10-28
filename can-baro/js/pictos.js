// Level pictograms for «Final de mes»: one per kind of series, so each level is recognisable at a
// glance (level card, HUD chips, end chart). Drawn in a unit box centred on (cx, cy), size s.
import { C } from "./ui.js";
import { centerText } from "./icons.js";

// Kind of pictogram for a series: its own "picto" field (series.json) wins, then the id/label.
export function pictoKind(id, label = "", own = "") {
  if (own && DRAW[own]) return own;
  const k = `${id} ${label}`.toLowerCase();
  if (/salari|renda|smi|sou|nòmina|nomina/.test(k)) return "salari";
  if (/lloguer/.test(k)) return "lloguer";
  if (/habitatge|ipv|hipoteca|casa/.test(k)) return "habitatge";
  if (/aliment|cistella|compra/.test(k)) return "cistella";
  if (/ipc|preu/.test(k)) return "preus";
  return "puja";
}

// Payslip: a sheet with a folded corner, text lines and a € seal (the € glyph is added by drawPicto)
function salari(g) {
  const w = 0.62, h = 0.8, x = -w / 2, y = -h / 2, f = 0.18;
  g.beginPath();
  g.moveTo(x, y); g.lineTo(x + w - f, y); g.lineTo(x + w, y + f); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath();
  g.stroke();
  g.beginPath(); g.moveTo(x + w - f, y); g.lineTo(x + w - f, y + f); g.lineTo(x + w, y + f); g.stroke();
  for (const ly of [-0.17, -0.03]) { g.beginPath(); g.moveTo(x + 0.1, ly); g.lineTo(x + w - 0.12, ly); g.stroke(); }
}

// Shopping basket: arched handle over a trapezoid with slats
function cistella(g) {
  g.beginPath(); g.arc(0, -0.05, 0.27, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
  g.beginPath();
  g.moveTo(-0.42, -0.05); g.lineTo(0.42, -0.05); g.lineTo(0.31, 0.36); g.lineTo(-0.31, 0.36); g.closePath();
  g.stroke();
  for (const fx of [-0.15, 0, 0.15]) {
    g.beginPath(); g.moveTo(fx * 1.25, 0.04); g.lineTo(fx, 0.28); g.stroke();
  }
}

// Key: round bow with a hole, shaft and two teeth
function lloguer(g) {
  g.beginPath(); g.arc(-0.2, 0, 0.19, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(-0.2, 0, 0.05, 0, Math.PI * 2); g.stroke();
  g.beginPath();
  g.moveTo(-0.01, 0); g.lineTo(0.42, 0);
  g.moveTo(0.26, 0); g.lineTo(0.26, 0.16);
  g.moveTo(0.38, 0); g.lineTo(0.38, 0.12);
  g.stroke();
}

// House: roof, body and door
function habitatge(g) {
  g.beginPath();
  g.moveTo(-0.42, -0.02); g.lineTo(0, -0.38); g.lineTo(0.42, -0.02);
  g.stroke();
  g.beginPath();
  g.moveTo(-0.3, -0.1); g.lineTo(-0.3, 0.36); g.lineTo(0.3, 0.36); g.lineTo(0.3, -0.1);
  g.stroke();
  g.beginPath(); g.moveTo(-0.08, 0.36); g.lineTo(-0.08, 0.12); g.lineTo(0.08, 0.12); g.lineTo(0.08, 0.36); g.stroke();
}

// Price tag with its hole (the € glyph is added by drawPicto)
function preus(g) {
  g.beginPath();
  g.moveTo(-0.38, -0.12); g.lineTo(-0.12, -0.38); g.lineTo(0.38, -0.38); g.lineTo(0.38, 0.38); g.lineTo(-0.12, 0.38); g.lineTo(-0.38, 0.12);
  g.closePath(); g.stroke();
  g.beginPath(); g.arc(-0.17, 0, 0.05, 0, Math.PI * 2); g.stroke();
}

// Rising line with an arrow head (generic «it went up»)
function puja(g) {
  g.beginPath(); g.moveTo(-0.4, 0.3); g.lineTo(-0.1, 0); g.lineTo(0.06, 0.14); g.lineTo(0.38, -0.2); g.stroke();
  g.beginPath(); g.moveTo(0.16, -0.24); g.lineTo(0.4, -0.24); g.lineTo(0.4, 0); g.stroke();
}

const DRAW = { salari, cistella, lloguer, habitatge, preus, puja };
// € glyph inside some pictograms: [x, y, size] in unit-box coordinates
const EURO = { salari: [0.06, 0.2, 0.34], preus: [0.12, 0, 0.42] };

// The pictogram alone (strokes), in colour ink
export function drawPicto(g, kind, cx, cy, s, { ink = C.ink, lw = 0.085 } = {}) {
  const fn = DRAW[kind] || puja;
  g.save();
  g.translate(cx, cy); g.scale(s, s);
  g.lineWidth = lw; g.lineCap = "round"; g.lineJoin = "round";
  g.strokeStyle = ink;
  fn(g);
  g.restore();
  const e = EURO[kind];
  if (e) centerText(g, "€", cx + e[0] * s, cy + e[1] * s, { size: Math.max(8, Math.round(e[2] * s)), weight: 800, color: ink });
}

// Round badge: a disc in the level colour with the pictogram on it (white, or ink on light fills)
export function drawPictoBadge(g, kind, cx, cy, r, { fill, ink = C.white, rim = C.white, rimW = 0 } = {}) {
  g.save();
  g.fillStyle = fill;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  if (rimW > 0) { g.lineWidth = rimW; g.strokeStyle = rim; g.stroke(); }
  g.restore();
  drawPicto(g, kind, cx, cy, r * 1.45, { ink, lw: 0.09 });
}
