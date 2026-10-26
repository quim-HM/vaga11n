// Campaign-style countdown badge (echoes the yellow-circle «VAGA GENERAL» logo): a solid disc
// with the seconds in the poster face and a draining ring. Static (no pulsing type); the last seconds
// switch to the red band colours.
import { C, text, clamp } from "./ui.js";
import { centerText } from "./icons.js";

export function drawCountdown(g, x, y, secondsLeft, total, { r = 70, urgentBelow = 5, label = null } = {}) {
  const s = Math.max(0, Math.ceil(secondsLeft));
  const frac = clamp(secondsLeft / total, 0, 1);
  const urgent = s <= urgentBelow;
  g.save();
  g.translate(x, y);
  // drop shadow
  g.fillStyle = C.shadow;
  g.beginPath(); g.arc(4, 7, r, 0, Math.PI * 2); g.fill();
  // disc
  g.fillStyle = urgent ? C.band : C.hl;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6; g.strokeStyle = urgent ? C.hl : C.band; g.stroke();
  // draining ring
  g.lineCap = "round";
  g.lineWidth = 10;
  g.strokeStyle = urgent ? C.hl : C.band;
  g.beginPath(); g.arc(0, 0, r + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); g.stroke();
  // number
  centerText(g, String(s), 0, 0, { size: Math.round(r * 1.05), kind: "poster", color: urgent ? C.bandText : C.hlText });
  g.restore();
  if (label) text(g, label, x, y + r + 52, { size: 28, kind: "poster", align: "center", color: C.band });
}
