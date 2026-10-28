import { T } from "../textos.js";
import { centerText } from "../icons.js";
// Visual metaphors for numeric answers in «El preu (in)just».
// draw(g, kind, box, value, q, opts): box = {x,y,w,h}; value in the question's unit.
import { C, text, rrect, hatch, clamp, fmtNum, decimalsFor, measure } from "../ui.js";

export function fraction(q, v) {
  const { min, max } = q.rang;
  if (q.escala === "log" && min > 0) return clamp(Math.log(v / min) / Math.log(max / min), 0, 1);
  return clamp((v - min) / (max - min), 0, 1);
}

// A guess is always shown with the same number of decimals (those of the question's step), so the
// number never changes width while the lever moves (29,5 → 30 → 30,5 used to jump). exact: the real
// value with its own precision (reveal). trim: drop a ",0" (static labels such as the range ends).
export function fmtValue(q, v, exact = false, trim = false) {
  if (q.unitat === "any") return String(Math.round(v));
  let d = decimalsFor(q.pas);
  if (trim && Math.abs(v - Math.round(v)) < 1e-9) d = 0;
  if (exact) {
    const s = String(q.valor);
    d = s.includes(".") ? Math.min(2, s.split(".")[1].length) : 0;
  }
  return fmtNum(v, d);
}

export function fmtWithUnit(q, v, exact = false) {
  if (q.unitat === "any") return fmtValue(q, v);
  const u = q.unitat || "";
  return u.startsWith("%") ? `${fmtValue(q, v, exact)} %` : `${fmtValue(q, v, exact)} ${u}`;
}

// Label helper: the real value is shown with its own precision once fully revealed
function lab(q, v, style) { return fmtWithUnit(q, v, style === "real" && v === q.valor); }
// …and it is the hero of the reveal: bigger than the guess and in the «LA REALITAT» red
function labStyle(style) { return style === "real" ? { size: 64, color: C.red } : { size: 54 }; }

function styleFill(g, style) {
  return style === "answer" ? hatch(g, C.blue, C.blueSoft, 16, 5) : C.red;
}

function calendari(g, b, v, q, style) {
  const cx = b.x + b.w / 2, w = Math.min(b.w * 0.7, 460), h = Math.min(b.h * 0.8, 440);
  const x = cx - w / 2, y = b.y + (b.h - h) / 2;
  for (let i = 3; i >= 1; i--) {
    g.fillStyle = i % 2 ? C.paper2 : C.white;
    rrect(g, x + i * 10, y + i * 10, w, h, 16); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 3; g.stroke();
  }
  g.fillStyle = C.white; rrect(g, x, y, w, h, 16); g.fill(); g.lineWidth = 5; g.stroke();
  g.fillStyle = style === "answer" ? C.blue : C.red;
  rrect(g, x, y, w, h * 0.24, [16, 16, 0, 0]); g.fill();
  for (let i = 0; i < 6; i++) { g.fillStyle = C.ink; g.beginPath(); g.arc(x + w * (0.15 + i * 0.14), y, 10, 0, Math.PI * 2); g.fill(); }
  text(g, q.unitat === "any" ? "ANY" : (q.unitat || "").toUpperCase(), x + w / 2, y + h * 0.17, { size: Math.round(h * 0.12), kind: "title", align: "center", color: C.white, maxW: w - 40 });
  text(g, fmtValue(q, v, style === "real" && v === q.valor), x + w / 2, y + h * 0.78, { size: Math.round(h * 0.42), kind: "title", align: "center", color: style === "real" ? C.red : C.ink, maxW: w - 50 });
}

// A block of flats built as the value grows, one window at a time (ED_FLOORS × ED_WIN steps, so it
// grows as finely as the coin stacks): the floor being built shows its finished windows and the
// empty openings of the rest, with a crane on top; once a floor is complete the roof gets its
// rooftop structure instead. Drawn with volume (side face, roof slab, ground shadow) and in the
// answer / reality colour, like the coins.
const ED_FLOORS = 12, ED_WIN = 6;

// Tower crane on the roof of the floor being built, carrying the next window (the next home) on its
// hook right over the slot it goes into. u = size unit (1 for a 300 px wide building), so it reads at
// the same size on the small reveal cards; the mast takes the height left above the building (room),
// and the crane is left out when there is too little. Returns the y of its top, or null if not drawn.
function crane(g, { u, mx, y0, room, hx, loadY, ww, wh, r, main, soft }) {
  const mw = 12 * u, jt = 10 * u, apex = 22 * u;
  const h = Math.min(150 * u, room - jt - apex);
  if (h < 40 * u) return null;
  const jy = y0 - h;                                   // bottom chord of the jib
  const jl = Math.min(hx - 24 * u, mx - 120 * u), jr = mx + 66 * u;
  const thin = Math.max(1, 1.3 * u), thick = Math.max(1.5, 2.6 * u);
  g.save();
  g.strokeStyle = main; g.fillStyle = main; g.lineCap = "round"; g.lineJoin = "round";
  // mast: two rails with X bracing, on a foot plate
  g.fillRect(mx - mw, y0 - 3 * u, mw * 2, 5 * u);
  g.lineWidth = thick;
  g.beginPath(); g.moveTo(mx - mw / 2, y0); g.lineTo(mx - mw / 2, jy); g.moveTo(mx + mw / 2, y0); g.lineTo(mx + mw / 2, jy); g.stroke();
  g.lineWidth = thin; g.beginPath();
  for (let y = y0; y - mw > jy - 0.5; y -= mw) {
    g.moveTo(mx - mw / 2, y); g.lineTo(mx + mw / 2, y - mw);
    g.moveTo(mx + mw / 2, y); g.lineTo(mx - mw / 2, y - mw);
  }
  g.stroke();
  // jib + counter-jib: a truss (two chords and a zigzag), the tip tapering to the bottom chord
  const jtop = jy - jt;
  g.lineWidth = thick; g.beginPath();
  g.moveTo(jl, jy); g.lineTo(jr, jy);
  g.moveTo(jl + jt * 1.5, jtop); g.lineTo(jr, jtop); g.lineTo(jr, jy);
  g.moveTo(jl, jy); g.lineTo(jl + jt * 1.5, jtop);
  g.stroke();
  g.lineWidth = thin; g.beginPath();
  for (let xx = jl + jt * 1.5, up = true; xx < jr - 0.5; xx += jt, up = !up) {
    const nx = Math.min(jr, xx + jt);
    g.moveTo(xx, up ? jtop : jy); g.lineTo(nx, up ? jy : jtop);
  }
  g.stroke();
  // tower head with its tie cables to both arms
  const ay = jtop - apex;
  g.lineWidth = thick; g.beginPath();
  g.moveTo(mx - mw / 2, jtop); g.lineTo(mx, ay); g.lineTo(mx + mw / 2, jtop); g.stroke();
  g.lineWidth = thin; g.beginPath();
  g.moveTo(mx, ay); g.lineTo(jl + (mx - jl) * 0.3, jtop);
  g.moveTo(mx, ay); g.lineTo(jr - 6 * u, jtop);
  g.stroke();
  // operator's cab (with a window) and the counterweight
  const cw = 20 * u, ch = 15 * u, cx = mx - mw / 2 - cw;
  rrect(g, cx, jy + 1, cw, ch, 3 * u); g.fill();
  g.fillStyle = soft; g.fillRect(cx + 4 * u, jy + 4 * u, cw * 0.45, ch * 0.45);
  g.fillStyle = main;
  const kw = 24 * u, kh = 18 * u;
  g.fillRect(jr - kw - 2 * u, jy, kw, kh);
  g.strokeStyle = soft; g.lineWidth = thin;
  g.beginPath(); g.moveTo(jr - kw - 2 * u, jy + kh / 2); g.lineTo(jr - 2 * u, jy + kh / 2); g.stroke();
  // trolley, cable, hook and the next window on two slings (in the air, clear of the jib)
  g.strokeStyle = main; g.fillStyle = main;
  g.fillRect(hx - 8 * u, jy, 16 * u, 5 * u);
  loadY = Math.max(loadY, jy + 26 * u);
  const hookY = loadY - 10 * u;
  g.lineWidth = thin; g.beginPath(); g.moveTo(hx, jy + 5 * u); g.lineTo(hx, hookY); g.stroke();
  g.lineWidth = thick; g.beginPath(); g.arc(hx, hookY + 2 * u, 3 * u, -Math.PI / 2, Math.PI * 0.9); g.stroke();
  g.lineWidth = thin; g.beginPath();
  g.moveTo(hx, hookY + 4 * u); g.lineTo(hx - ww / 2 + 2, loadY);
  g.moveTo(hx, hookY + 4 * u); g.lineTo(hx + ww / 2 - 2, loadY);
  g.stroke();
  rrect(g, hx - ww / 2, loadY, ww, wh, r); g.fill();
  g.restore();
  return ay;
}

function edifici(g, b, v, q, style) {
  const f = fraction(q, v);
  const n = Math.max(1, Math.round(f * ED_FLOORS * ED_WIN));
  const floors = Math.ceil(n / ED_WIN);
  const building = n % ED_WIN !== 0;
  const main = style === "answer" ? C.blue : C.red, soft = style === "answer" ? C.blueSoft : C.redSoft;
  const bw = Math.min(300, b.w * 0.5), dx = Math.round(bw * 0.16), dy = Math.round(dx * 0.6);
  // height budget: floors + roof + crane (2.4 floors) + room for the label above
  const fh = Math.min(32, (b.h - 90 - dy) / (ED_FLOORS + 2.4));
  const x = b.x + (b.w - bw - dx) / 2, base = b.y + b.h - 24, top = base - floors * fh;
  g.lineJoin = "round";
  g.fillStyle = off(0.12);
  g.beginPath(); g.ellipse(x + (bw + dx) / 2, base + 3, (bw + dx) * 0.62, 9, 0, 0, Math.PI * 2); g.fill();
  // side face (depth): light shade of the colour, a line per floor
  g.beginPath();
  g.moveTo(x + bw, base); g.lineTo(x + bw + dx, base - dy); g.lineTo(x + bw + dx, top - dy); g.lineTo(x + bw, top); g.closePath();
  g.fillStyle = soft; g.fill();
  g.save(); g.globalAlpha *= 0.3; g.fillStyle = main; g.fill(); g.restore();
  g.strokeStyle = main; g.lineWidth = 3; g.stroke();
  g.lineWidth = 1.5;
  for (let i = 1; i < floors; i++) {
    const y = base - i * fh;
    g.beginPath(); g.moveTo(x + bw, y); g.lineTo(x + bw + dx, y - dy); g.stroke();
  }
  // front: alternating bands (like the coins), one window per step
  const pad = Math.max(8, bw * 0.06), slot = (bw - 2 * pad) / ED_WIN, ww = slot * 0.7, wh = fh * 0.52, r = Math.min(4, wh / 3);
  for (let i = 0; i < floors; i++) {
    const y = base - (i + 1) * fh;
    g.fillStyle = i % 2 ? soft : C.white;
    g.fillRect(x, y, bw, fh);
    g.strokeStyle = main; g.lineWidth = 1.5; g.strokeRect(x, y, bw, fh);
    for (let k = 0; k < ED_WIN; k++) {
      const idx = i * ED_WIN + k, wx = x + pad + k * slot + (slot - ww) / 2, wy = y + fh * 0.24;
      // ground floor: an entrance in the middle instead of two windows
      if (i === 0 && (k === ED_WIN / 2 - 1 || k === ED_WIN / 2)) {
        if (k === ED_WIN / 2 - 1) {
          const dw = slot * 1.2, dh = fh * 0.78;
          g.fillStyle = main; rrect(g, x + bw / 2 - dw / 2, y + fh - dh, dw, dh, [r, r, 0, 0]); g.fill();
        }
        continue;
      }
      if (idx < n) { g.fillStyle = main; rrect(g, wx, wy, ww, wh, r); g.fill(); }
      else {
        g.save(); g.setLineDash([4, 3]); g.strokeStyle = main; g.lineWidth = 1.5;
        rrect(g, wx, wy, ww, wh, r); g.stroke(); g.restore();
      }
    }
  }
  g.strokeStyle = main; g.lineWidth = 3; g.strokeRect(x, top, bw, base - top);
  // roof slab
  g.beginPath();
  g.moveTo(x, top); g.lineTo(x + dx, top - dy); g.lineTo(x + bw + dx, top - dy); g.lineTo(x + bw, top); g.closePath();
  g.fillStyle = C.white; g.fill(); g.strokeStyle = main; g.lineWidth = 3; g.stroke();
  let peak = top - dy;
  const craneTop = building ? crane(g, {
    u: bw / 300, mx: x + bw * 0.78, y0: top - dy * 0.5, room: top - dy * 0.5 - (b.y + 74),
    hx: x + pad + ((n % ED_WIN) + 0.5) * slot, loadY: top - dy - wh - 10, ww, wh, r, main, soft,
  }) : null;
  if (craneTop !== null) peak = craneTop;
  else if (!building) {
    // completed: lift / water-tank housing on the roof
    const hw = bw * 0.22, hh = fh * 0.7, hx = x + dx + bw * 0.55;
    g.fillStyle = soft; g.fillRect(hx, top - dy * 0.5 - hh, hw, hh);
    g.strokeStyle = main; g.lineWidth = 2; g.strokeRect(hx, top - dy * 0.5 - hh, hw, hh);
    peak = Math.min(peak, top - dy * 0.5 - hh);
  }
  text(g, lab(q, v, style), b.x + b.w / 2, peak - 18, { ...labStyle(style), kind: "title", align: "center", maxW: b.w - 24 });
}

// Neutral "off" colour for unlit items (empty houses, people, keys): a light tint of the ink of
// the current surface, so it reads on white cards in every palette (never yellow-on-white).
function off(alpha = 0.16) {
  const h = String(C.ink).replace("#", "");
  if (h.length !== 6) return `rgba(20,24,61,${alpha})`;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function house(g, x, y, s, lit, style) {
  g.fillStyle = lit ? (style === "answer" ? C.blue : C.red) : off();
  g.beginPath(); g.moveTo(x, y + s * 0.45); g.lineTo(x + s / 2, y); g.lineTo(x + s, y + s * 0.45); g.closePath(); g.fill();
  g.fillRect(x + s * 0.12, y + s * 0.42, s * 0.76, s * 0.55);
  if (lit) { g.fillStyle = C.ink; g.fillRect(x + s * 0.4, y + s * 0.62, s * 0.2, s * 0.35); }
}

function casetes(g, b, v, q, style) {
  // percentages: 100 houses (10×10), one per cent; counts: 60 houses spread over the range
  const pctMode = (q.unitat || "").includes("%");
  const total = pctMode ? 100 : 60, cols = 10, rows = total / cols;
  const n = pctMode ? Math.round(clamp(v, 0, 100)) : Math.round(fraction(q, v) * total);
  const s = Math.min((b.w - 40) / cols, (b.h - 110) / rows) * 0.86;
  const gx = b.x + (b.w - cols * s / 0.86) / 2, gy = b.y + 10;
  for (let i = 0; i < total; i++) {
    const c = i % cols, r = rows - 1 - Math.floor(i / cols);
    house(g, gx + c * s / 0.86, gy + r * s / 0.86, s, i < n, style);
  }
  const per = (q.rang.max - q.rang.min) / total;
  text(g, lab(q, v, style), b.x + b.w / 2, b.y + b.h - 50, { ...labStyle(style), kind: "title", align: "center", maxW: b.w - 24 });
  if (pctMode) text(g, T("metafora.de_cada_100", "de cada 100 habitatges"), b.x + b.w / 2, b.y + b.h - 12, { size: 24, align: "center", color: C.inkSoft });
  else if (q.escala !== "log") text(g, T("metafora.cada_caseta", "cada caseta ≈ {n} {unitat}", { n: fmtNum(per, per < 10 ? 1 : 0), unitat: q.unitat }), b.x + b.w / 2, b.y + b.h - 12, { size: 24, align: "center", color: C.inkSoft });
}

function pastis(g, b, v, q, style) {
  const pct = (q.unitat || "").includes("%") ? clamp(v / 100, 0, 1) : fraction(q, v);
  const r = Math.min(b.w, b.h - 80) * 0.42, cx = b.x + b.w / 2, cy = b.y + r + 20;
  g.fillStyle = C.white; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = 5; g.strokeStyle = C.ink; g.stroke();
  g.fillStyle = styleFill(g, style);
  g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2); g.closePath(); g.fill(); g.stroke();
  text(g, lab(q, v, style), cx, cy + r + 62, { ...labStyle(style), kind: "title", align: "center", maxW: b.w - 24 });
}

function rellotge(g, b, v, q, style) {
  const hours = Math.max(0, v);
  const nClocks = Math.min(12, Math.ceil(hours / 12) || 1);
  const cols = Math.min(4, nClocks), rows = Math.ceil(nClocks / cols);
  const r = Math.min((b.w - 40) / cols, (b.h - 100) / rows) * 0.42;
  for (let i = 0; i < nClocks; i++) {
    const c = i % cols, rr = Math.floor(i / cols);
    const cx = b.x + b.w / 2 + (c - (cols - 1) / 2) * r * 2.3, cy = b.y + r + 10 + rr * r * 2.3;
    const part = clamp((hours - i * 12) / 12, 0, 1);
    g.fillStyle = C.white; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.lineWidth = 4; g.strokeStyle = C.ink; g.stroke();
    g.fillStyle = styleFill(g, style);
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + part * Math.PI * 2); g.closePath(); g.fill();
    g.lineWidth = 4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - r * 0.8); g.stroke();
  }
  text(g, lab(q, v, style), b.x + b.w / 2, b.y + b.h - 30, { ...labStyle(style), kind: "title", align: "center", maxW: b.w - 24 });
  text(g, T("metafora.cada_rellotge_12_hores", "cada rellotge = 12 hores"), b.x + b.w / 2, b.y + b.h + 4, { size: 24, align: "center", color: C.inkSoft });
}

function barres(g, b, v, q, style) {
  const f = fraction(q, v);
  const bw = Math.min(300, b.w * 0.4), x = b.x + (b.w - bw) / 2, base = b.y + b.h - 20, hmax = b.h - 90;
  g.strokeStyle = C.ink; g.lineWidth = 3; g.strokeRect(x, base - hmax, bw, hmax);
  g.fillStyle = styleFill(g, style);
  if (q.rang.min < 0 && q.rang.max > 0) {
    // Diverging bar from the zero line (e.g. real wage change)
    const zf = fraction(q, 0), zy = base - zf * hmax, vy = base - f * hmax;
    // keep a visible sliver for values very close to zero
    const bh = Math.max(Math.abs(vy - zy), 6), by = vy < zy ? zy - bh : zy;
    g.fillRect(x, by, bw, bh);
    g.lineWidth = 5; g.strokeRect(x, by, bw, bh);
    g.strokeStyle = C.ink; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 20, zy); g.lineTo(x + bw + 20, zy); g.stroke();
    text(g, "0", x - 30, zy + 8, { size: 22, color: C.inkSoft, align: "right" });
  } else {
    g.fillRect(x, base - f * hmax, bw, f * hmax);
    g.lineWidth = 5; g.strokeRect(x, base - f * hmax, bw, f * hmax);
  }
  if (q.escala === "log" && q.rang.min > 0) {
    // decade ticks so the orders of magnitude are visible
    for (let e = Math.ceil(Math.log10(q.rang.min)); Math.pow(10, e) <= q.rang.max; e++) {
      const ty = base - fraction(q, Math.pow(10, e)) * hmax;
      g.strokeStyle = C.inkSoft; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x - 10, ty); g.lineTo(x, ty); g.stroke();
      text(g, fmtNum(Math.pow(10, e)), x - 14, ty + 8, { size: 20, color: C.inkSoft, align: "right" });
    }
  } else {
    text(g, fmtValue(q, q.rang.max, false, true), x - 14, base - hmax + 10, { size: 22, color: C.inkSoft, align: "right" });
    text(g, fmtValue(q, q.rang.min, false, true), x - 14, base, { size: 22, color: C.inkSoft, align: "right" });
  }
  // value label above the bar end; for negative values, just above the zero line (never on the hatch)
  const zf = q.rang.min < 0 && q.rang.max > 0 ? fraction(q, 0) : 0;
  const ly = base - Math.max(f, zf) * hmax - 18;
  text(g, lab(q, v, style), x + bw / 2, ly, { ...labStyle(style), kind: "title", align: "center", maxW: b.w - 24 });
}

// Stacks of coins: up to 4 columns of 10 coins; the top of each stack shows the € face.
function bitllets(g, b, v, q, style) {
  const f = fraction(q, v);
  const per = 10, cols = 4, total = per * cols;
  const n = Math.round(f * total);
  const cw = Math.min(170, (b.w - 60) / cols - 24), th = Math.min(20, (b.h - 140) / per), ry = cw * 0.17;
  const used = Math.ceil(n / per);
  const gap = 26, x0 = b.x + (b.w - (used * cw + (used - 1) * gap)) / 2, base = b.y + b.h - 30 - ry;
  const main = style === "answer" ? C.blue : C.red;
  const soft = style === "answer" ? C.blueSoft : C.redSoft;
  let topY = base;
  for (let c = 0; c < used; c++) {
    const k = Math.min(per, n - c * per);
    const cx = x0 + c * (cw + gap) + cw / 2;
    for (let i = 0; i < k; i++) {
      const y = base - i * th;
      // coin edge (side band) + rim
      g.fillStyle = i % 2 ? soft : C.white;
      g.beginPath();
      g.ellipse(cx, y, cw / 2, ry, 0, 0, Math.PI);
      g.lineTo(cx - cw / 2, y - th);
      g.ellipse(cx, y - th, cw / 2, ry, 0, Math.PI, 0, true);
      g.closePath(); g.fill();
      g.strokeStyle = main; g.lineWidth = 3; g.stroke();
    }
    // top face (white so the € keeps full contrast)
    const ty = base - k * th;
    g.fillStyle = C.white;
    g.beginPath(); g.ellipse(cx, ty, cw / 2, ry, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = main; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.ellipse(cx, ty, cw / 2 - 10, ry - 4, 0, 0, Math.PI * 2); g.stroke();
    text(g, "€", cx, ty + ry * 0.45, { size: Math.round(ry * 1.4), weight: 700, align: "center", color: main });
    topY = Math.min(topY, ty);
  }
  text(g, lab(q, v, style), b.x + b.w / 2, topY - ry - 22, { ...labStyle(style), kind: "title", align: "center", maxW: b.w - 24 });
}

function persones(g, b, v, q, style) {
  const pct = (q.unitat || "").includes("%") ? clamp(v / 100, 0, 1) : fraction(q, v);
  const n = Math.round(pct * 100), cols = 10;
  const s = Math.min((b.w - 40) / cols, (b.h - 90) / 10);
  const gx = b.x + (b.w - cols * s) / 2;
  for (let i = 0; i < 100; i++) {
    const c = i % cols, r = 9 - Math.floor(i / cols);
    const x = gx + c * s + s / 2, y = b.y + r * s + s * 0.3;
    g.fillStyle = i < n ? (style === "answer" ? C.blue : C.red) : off();
    g.beginPath(); g.arc(x, y, s * 0.17, 0, Math.PI * 2); g.fill();
    rrect(g, x - s * 0.24, y + s * 0.2, s * 0.48, s * 0.42, s * 0.12); g.fill();
  }
  text(g, lab(q, v, style), b.x + b.w / 2, b.y + b.h - 18, { ...labStyle(style), kind: "title", align: "center", maxW: b.w - 24 });
}

function keyIcon(g, x, y, s, on, style) {
  g.strokeStyle = on ? (style === "answer" ? C.blue : C.red) : off(0.2);
  g.lineWidth = s * 0.14; g.lineCap = "round";
  g.beginPath(); g.arc(x, y, s * 0.22, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(x + s * 0.22, y); g.lineTo(x + s * 0.7, y); g.moveTo(x + s * 0.55, y); g.lineTo(x + s * 0.55, y + s * 0.18);
  g.moveTo(x + s * 0.68, y); g.lineTo(x + s * 0.68, y + s * 0.14); g.stroke();
}

function claus(g, b, v, q, style) {
  const total = 60, cols = 10, rows = 6;
  const n = Math.round(fraction(q, v) * total);
  const s = Math.min((b.w - 40) / cols, (b.h - 110) / rows);
  const gx = b.x + (b.w - cols * s) / 2;
  for (let i = 0; i < total; i++) {
    const c = i % cols, r = rows - 1 - Math.floor(i / cols);
    keyIcon(g, gx + c * s + s * 0.2, b.y + 20 + r * s + s * 0.4, s * 0.9, i < n, style);
  }
  const per = (q.rang.max - q.rang.min) / total;
  text(g, lab(q, v, style), b.x + b.w / 2, b.y + b.h - 50, { ...labStyle(style), kind: "title", align: "center", maxW: b.w - 24 });
  if (q.escala !== "log") text(g, T("metafora.cada_clau", "cada clau ≈ {n} {unitat}", { n: fmtNum(per, per < 10 ? 1 : 0), unitat: q.unitat }), b.x + b.w / 2, b.y + b.h - 12, { size: 24, align: "center", color: C.inkSoft });
}

// «Same trolley, more money»: the trolley never changes (it is the same basket of goods);
// what changes is the price tag and the 20 € banknotes needed to pay for it. Top row = the 100 €
// it cost in 2019 (5 notes), bottom row = the difference. A partial note is drawn torn.
const NOTE_EUR = 20;

function trolley(g, ox, oy, u, style) {
  // Empty wire trolley (it is the same basket in both years: only the price changes).
  // Unit u = basket width; rim at y = 0, handle grip up-left, two-wheel chassis below.
  const main = style === "answer" ? C.blue : C.red;
  const soft = style === "answer" ? C.blueSoft : C.redSoft;
  const P = (fx, fy) => [ox + fx * u, oy + fy * u];
  const lw = Math.max(5, u * 0.026);
  g.save();
  g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = C.ink;
  const basket = () => {
    g.beginPath(); g.moveTo(...P(0.02, 0)); g.lineTo(...P(1, 0)); g.lineTo(...P(0.88, 0.52)); g.lineTo(...P(0.13, 0.52)); g.closePath();
  };
  basket(); g.fillStyle = soft; g.globalAlpha = 0.45; g.fill(); g.globalAlpha = 1;
  // wire mesh: verticals converge with the sides, two horizontals
  g.save(); basket(); g.clip();
  g.strokeStyle = main; g.globalAlpha = 0.55; g.lineWidth = Math.max(2, u * 0.012);
  for (let k = 1; k < 8; k++) {
    g.beginPath(); g.moveTo(...P(0.02 + (k * 0.98) / 8, 0)); g.lineTo(...P(0.13 + (k * 0.75) / 8, 0.52)); g.stroke();
  }
  for (const fy of [0.18, 0.35]) { g.beginPath(); g.moveTo(...P(0, fy)); g.lineTo(...P(1.05, fy)); g.stroke(); }
  g.restore();
  g.lineWidth = lw; basket(); g.stroke();
  // rim, slightly wider than the basket
  g.lineWidth = lw * 1.35; g.beginPath(); g.moveTo(...P(-0.01, 0)); g.lineTo(...P(1.03, 0)); g.stroke();
  // handle with a coloured grip
  g.lineWidth = lw; g.beginPath(); g.moveTo(...P(0.02, 0)); g.lineTo(...P(-0.07, -0.16)); g.stroke();
  g.fillStyle = main; rrect(g, ...P(-0.23, -0.19), 0.17 * u, 0.06 * u, 0.03 * u); g.fill();
  g.lineWidth = Math.max(3, lw * 0.6); g.stroke();
  // chassis: lower tray and wheel forks
  g.lineWidth = lw;
  g.beginPath(); g.moveTo(...P(0.13, 0.52)); g.lineTo(...P(0.16, 0.66)); g.lineTo(...P(0.92, 0.66)); g.stroke();
  for (const fx of [0.25, 0.83]) {
    g.lineWidth = lw * 0.8; g.beginPath(); g.moveTo(...P(fx, 0.66)); g.lineTo(...P(fx, 0.71)); g.stroke();
    g.fillStyle = C.ink; g.beginPath(); g.arc(...P(fx, 0.765), 0.06 * u, 0, Math.PI * 2); g.fill();
    g.fillStyle = C.card; g.beginPath(); g.arc(...P(fx, 0.765), 0.022 * u, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// One 20 € note: full, torn (partial) or an empty dashed slot
function banknote(g, x, y, w, h, frac, main) {
  if (frac < 1) {
    g.save(); g.setLineDash([8, 6]); g.strokeStyle = off(0.45); g.lineWidth = 2.5;
    rrect(g, x, y, w, h, 6); g.stroke(); g.restore();
  }
  if (frac <= 0.02) return;
  g.save();
  if (frac < 1) {
    const cx = x + w * frac, n = 6, zz = Math.min(7, w * frac * 0.5);
    g.beginPath(); g.moveTo(x - 2, y - 2); g.lineTo(cx, y - 2);
    for (let i = 1; i <= n; i++) g.lineTo(cx + (i % 2 ? -zz : 0), y + (h * i) / n + (i === n ? 2 : 0));
    g.lineTo(x - 2, y + h + 2); g.closePath(); g.clip();
  }
  g.fillStyle = main; rrect(g, x, y, w, h, 6); g.fill();
  g.strokeStyle = C.card; g.lineWidth = 2;
  g.globalAlpha = 0.55; rrect(g, x + 5, y + 5, w - 10, h - 10, 4); g.stroke();
  g.globalAlpha = 1;
  const r = h * 0.27, sx = x + w - h * 0.44;
  g.lineWidth = 2.5; g.beginPath(); g.arc(sx, y + h / 2, r, 0, Math.PI * 2); g.stroke();
  centerText(g, "€", sx, y + h / 2, { size: Math.round(r * 1.25), weight: 800, color: C.card });
  centerText(g, String(NOTE_EUR), x + (w - h * 0.44 - r) / 2 + 4, y + h / 2, { size: Math.round(h * 0.5), kind: "title", color: C.card });
  g.restore();
}

function carro(g, b, v, q, style) {
  const main = style === "answer" ? C.blue : C.red;
  const exact = style === "real" && v === q.valor;
  // banknotes: 2 rows of 5 (row 1 = the 100 € of 2019, row 2 = the difference)
  const labW = 150, gap = 10;
  const nw = Math.min(124, (b.w - 40 - labW - 4 * gap) / 5), nh = Math.round(nw * 0.54);
  const bx = b.x + (b.w - (labW + 5 * nw + 4 * gap)) / 2, nx = bx + labW;
  const r2 = b.y + b.h - 16 - nh, r1 = r2 - 14 - nh;
  const notes = clamp(v, 0, 10 * NOTE_EUR) / NOTE_EUR;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 5; i++) banknote(g, nx + i * (nw + gap), row ? r2 : r1, nw, nh, clamp(notes - (row * 5 + i), 0, 1), main);
  }
  const lx = nx - 18, d = v - 100, dec = exact ? 2 : decimalsFor(q.pas);
  text(g, "100 €", lx, r1 + nh * 0.5, { size: 30, kind: "title", align: "right", maxW: labW - 18 });
  text(g, T("metafora.carro_2019", "el 2019"), lx, r1 + nh * 0.5 + 24, { size: 20, weight: 700, align: "right", color: C.inkSoft, maxW: labW - 18 });
  text(g, `${d < 0 ? "−" : "+"}${fmtNum(Math.abs(d), dec)} €`, lx, r2 + nh * 0.5, { size: 30, kind: "title", align: "right", color: main, maxW: labW - 18 });
  text(g, d < 0 ? T("metafora.carro_menys", "de menys") : T("metafora.carro_mes", "de més"), lx, r2 + nh * 0.5 + 24, { size: 20, weight: 700, align: "right", color: C.inkSoft, maxW: labW - 18 });
  // trolley + price tag, centred as a group in the space above the notes
  const vs = lab(q, v, style), ts = 50, th = 84;
  const tw = measure(g, vs, ts, "title") + 40 + 28;
  const room = r1 - 30 - b.y;
  const u = Math.min(280, room / 1.02, (b.w - 40 - 44 - tw) / 1.26);
  const ox = b.x + (b.w - (1.26 * u + 44 + tw)) / 2 + 0.23 * u;
  const oy = b.y + (room - 1.02 * u) / 2 + 0.2 * u;
  trolley(g, ox, oy, u, style);
  const tx = ox + 1.03 * u + 44, ty = oy + 0.16 * u - th / 2, hx = tx + 22, hy = ty + th / 2;
  g.save();
  g.fillStyle = main;
  g.beginPath(); g.moveTo(tx, hy); g.lineTo(tx + 26, ty); g.lineTo(tx + tw, ty); g.lineTo(tx + tw, ty + th); g.lineTo(tx + 26, ty + th); g.closePath(); g.fill();
  g.fillStyle = C.card; g.beginPath(); g.arc(hx, hy, 7, 0, Math.PI * 2); g.fill();
  // string threaded through the tag's hole
  g.strokeStyle = C.ink; g.lineWidth = 3; g.lineCap = "round";
  g.beginPath(); g.moveTo(ox + 1.03 * u, oy); g.quadraticCurveTo((ox + 1.03 * u + hx) / 2, hy + 18, hx, hy); g.stroke();
  g.restore();
  centerText(g, vs, tx + 40 + (tw - 68) / 2, hy, { size: ts, kind: "title", color: C.card });
}

// A working week: 7 day columns (Mon→Sun) of 8 one-hour cells, filled day by day from Monday
// morning. The weekend sits on a tinted band: hours there mean working on your days off.
function setmana(g, b, v, q, style) {
  const main = style === "answer" ? C.blue : C.red;
  const days = T("metafora.dies_setmana", "DL,DT,DC,DJ,DV,DS,DG").split(",");
  const perDay = 8, gap = 10, headH = 40, labH = 96;
  const cw = Math.min(96, (b.w - 40 - 6 * gap) / 7);
  const ch = Math.min(52, (b.h - headH - labH) / perDay);
  const gx = b.x + (b.w - (7 * cw + 6 * gap)) / 2, gy = b.y + headH;
  const hours = clamp(v, 0, 7 * perDay);
  for (let d = 0; d < 7; d++) {
    const x = gx + d * (cw + gap), weekend = d >= 5;
    if (weekend) { g.fillStyle = off(0.07); rrect(g, x - 5, gy - headH + 4, cw + 10, headH + perDay * ch, 8); g.fill(); }
    text(g, days[d] || "", x + cw / 2, gy - 12, { size: 24, weight: 800, align: "center", color: weekend ? C.inkSoft : C.ink });
    for (let k = 0; k < perDay; k++) {
      const y = gy + k * ch + 2, f = clamp(hours - (d * perDay + k), 0, 1);
      g.fillStyle = off(0.1); g.fillRect(x, y, cw, ch - 4);
      if (f > 0) { g.fillStyle = main; g.fillRect(x, y, cw * f, ch - 4); }
    }
    // a whole day spent on the rent gets an outline
    if (hours >= (d + 1) * perDay) { g.strokeStyle = main; g.lineWidth = 3; g.strokeRect(x - 3, gy - 1, cw + 6, perDay * ch + 2); }
  }
  const ly = gy + perDay * ch;
  text(g, lab(q, v, style), b.x + b.w / 2, ly + 58, { ...labStyle(style), kind: "title", align: "center", maxW: b.w - 24 });
  text(g, T("metafora.cada_casella_hora", "cada casella = 1 hora de feina"), b.x + b.w / 2, ly + 96, { size: 22, align: "center", color: C.inkSoft });
}

const KINDS = { calendari, edifici, casetes, pastis, rellotge, barres, bitllets, persones, carro, claus, setmana };

export function drawMetaphor(g, kind, box, value, q, style = "answer") {
  const fn = KINDS[kind] || barres;
  g.save();
  fn(g, box, value, q, style);
  g.restore();
  if (q.escala === "log" && style === "answer") {
    text(g, T("metafora.escala_logaritmica", "escala logarítmica"), box.x + box.w / 2, box.y + box.h + 30, { size: 22, align: "center", color: C.inkSoft });
  }
}
