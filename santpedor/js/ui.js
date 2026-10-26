// Drawing helpers, palette and typography. Logical canvas is always 1920x1080.
import { T } from "./textos.js";
import { textIcon } from "./icons.js";
export const W = 1920;
export const H = 1080;

// Layout grid shared by every screen:
//   header  y 0 – 140 (titles / HUD), side margin LAYOUT.m
//   play    y 140 – LAYOUT.footY (content, maps, cards)
//   footer  y LAYOUT.footY – H: centre zone [LAYOUT.footX0, LAYOUT.footX1] for hints, sources, credits and
//           progress bars; the two corners (width LAYOUT.navW) belong ONLY to the ◀ ▶ game shortcuts.
export const LAYOUT = { m: 40, footY: H - 96, navW: 170, navR: 30, navY: H - 48 };
LAYOUT.footX0 = LAYOUT.navW;
LAYOUT.footX1 = W - LAYOUT.navW;
LAYOUT.footW = LAYOUT.footX1 - LAYOUT.footX0;

// Live palette. temes.js overwrites every key when a theme is applied; these defaults are the
// «blau-groc-mes» values so nothing breaks before the first applyTheme().
//
// Two SURFACES share the role names below (see SURFACE_KEYS): the background of the screen and the
// white cards drawn on it. Code draws with C.ink, C.red... and wraps whatever lives inside a card in
// onCard(() => ...), which temporarily swaps those role keys for the card values. C.card / C.cardInk /
// C.cardInkSoft / C.cardSoft / C.cardLine are always available too (e.g. for a card's own fill/stroke).
export const C = {
  // background surface roles
  paper: "#00009E", paper2: "#1B1BB4", ink: "#FFFFFF", inkSoft: "#D2D2F7", head: "#FFFF00",
  red: "#FF4A3D", redSoft: "#5C2A9E", blue: "#FFFF00", blueSoft: "#3A3AC8",
  teal: "#3FE0A5", tealSoft: "#1F5F9A", mustard: "#FFD000", yellowSoft: "#3A3AC8",
  track: "rgba(255,255,255,0.22)", shadow: "rgba(0,0,40,0.45)",
  // cards (always white-ish with navy text, like the site)
  card: "#FFFFFF", cardSoft: "#E4E4FA", cardInk: "#14183D", cardInkSoft: "#4B4F6E", cardLine: "#14183D",
  // fixed colours: pure white for text/icons on saturated fills, campaign yellow, confirm badge
  white: "#FFFFFF", yellow: "#FFFF00", okFill: "#0B7A75",
  // campaign bands (posterBlock, countdown badge)
  band: "#E3000F", bandText: "#FFFFFF", hl: "#FFFF00", hlText: "#00009E",
  // «Encén la vaga» heat ramp on the background
  heatCold: "#2323BC", heatMid: "#FFD000", heatHot: "#FF3B2F",
  // poster screens (start/final): full-bleed field, title block/disc, slogan strip, CTA (temes.js)
  field: "#00009E", fieldInk: "#FFFF00", fieldSoft: "#FFFFFF", fieldSil: "#2A2AC4", footBg: "rgba(0,0,40,0.35)",
  titleBg: "#FFFF00", disc: "", discLine: "", titleFg: "#E3000F", titleSub: "#E3000F", subBg: "",
  daltBg: "", daltFg: "#FFFF00", ctaBg: "#FFFF00", ctaFg: "#00009E", cardAccent: "#00009E",
};

// Role keys that exist on every surface (campaign field, calm play surface, cards)
export const SURFACE_KEYS = ["paper", "paper2", "ink", "inkSoft", "head", "red", "redSoft", "blue", "blueSoft",
  "teal", "tealSoft", "mustard", "yellowSoft", "track", "shadow", "heatCold", "heatMid", "heatHot"];
const SURF = { bg: null, card: null, calm: null, page: null };
let surfDepth = 0;

// Called by temes.js: role values for the campaign field, the cards and the calm play surface
export function setSurfaces(bg, card, calm = null) { SURF.bg = bg; SURF.card = card; SURF.calm = calm || bg; SURF.page = bg; }

function withSurface(s, fn) {
  if (!s) return fn();
  const saved = {};
  for (const k of SURFACE_KEYS) { saved[k] = C[k]; C[k] = s[k]; }
  surfDepth++;
  try { return fn(); } finally { surfDepth--; Object.assign(C, saved); }
}
// Draw inside a card: C.ink, C.red, C.paper2... resolve to the card surface values
export function onCard(fn) { return withSurface(SURF.card, fn); }
// Back to the page surface (e.g. something drawn outside a card from within onCard)
export function onBg(fn) { return withSurface(SURF.page || SURF.bg, fn); }
// Draw a whole screen on the campaign field ("bg") or on the calm play surface ("calm")
export function onPage(kind, fn) {
  const s = kind === "calm" ? SURF.calm : SURF.bg;
  const prev = SURF.page;
  SURF.page = s;
  try { return withSurface(s, fn); } finally { SURF.page = prev; }
}

// Typography as on vagageneral.org:
//  - "title"/"poster": the site's «cartell» face = Arial Black (system font on Windows, not bundled),
//    900, UPPERCASE, letter-spacing -0.01em, never condensed (only shrunk to fit with maxW);
//  - "ample": the site's «cartell-ample» = Archivo 800 at ~85 % width, UPPERCASE (labels, buttons);
//  - "body": Archivo (variable, SIL OFL, web/fonts/Archivo-Variable.ttf).
export const FONT_POSTER = "'Arial Black', 'Archivo', sans-serif";
export const FONT_TITLE = FONT_POSTER;
export const TITLE_SX = 1;
export const FONT_BODY = "Archivo, Arial, sans-serif";

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
export function easeInOut(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

const isPoster = (kind) => kind === "title" || kind === "poster";
const isUpper = (kind) => isPoster(kind) || kind === "ample";

export function font(g, size, kind = "body", weight = 400) {
  if (isPoster(kind)) {
    g.font = `900 ${size}px ${FONT_POSTER}`;
    g.fontStretch = "normal";
    g.letterSpacing = `${(-0.01 * size).toFixed(2)}px`;
  } else {
    g.font = `${kind === "ample" ? Math.max(weight, 800) : weight} ${size}px ${FONT_BODY}`;
    g.fontStretch = kind === "ample" ? "semi-condensed" : "normal";
    g.letterSpacing = "0px";
  }
}

// The string as drawn for a text kind (cartell kinds are uppercase, like the site's text-transform)
export function caseFor(str, kind) { return isUpper(kind) ? String(str).toLocaleUpperCase("ca") : String(str); }

// Horizontal scale applied when drawing a given text kind (kept for callers; the site never condenses)
export function kindSx(kind) { return isPoster(kind) ? TITLE_SX : 1; }

// Width of a string as drawn by text()/wrap()
export function measure(g, str, size, kind = "body", weight = 400) {
  g.save();
  font(g, size, kind, weight);
  const w = g.measureText(caseFor(str, kind)).width * kindSx(kind);
  g.restore();
  return w;
}

// Largest size <= size at which str fits in maxW (never below minSize)
export function fitSize(g, str, size, maxW, kind = "body", weight = 400, minSize = 12) {
  if (!maxW) return size;
  const w = measure(g, str, size, kind, weight);
  return w > maxW ? Math.max(minSize, Math.floor((size * maxW) / w)) : size;
}

function fillSx(g, str, x, y, sx) {
  if (sx === 1) { g.fillText(str, x, y); return; }
  g.save();
  g.translate(x, y); g.scale(sx, 1);
  g.fillText(str, 0, 0);
  g.restore();
}

// maxW (optional): shrink the size so the line never exceeds that width
export function text(g, str, x, y, { size = 40, kind = "body", weight = 400, color = C.ink, align = "left", baseline = "alphabetic", alpha = 1, maxW = 0 } = {}) {
  g.save();
  g.globalAlpha *= alpha;
  const s = caseFor(str, kind);
  font(g, maxW ? fitSize(g, s, size, maxW, kind, weight) : size, kind, weight);
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = baseline;
  fillSx(g, s, x, y, kindSx(kind));
  g.restore();
}

// Word-wrapped text; returns the total height used.
export function wrap(g, str, x, y, maxW, { size = 40, kind = "body", weight = 400, color = C.ink, align = "left", lineH = 1.25, alpha = 1, maxLines = 99 } = {}) {
  g.save();
  g.globalAlpha *= alpha;
  font(g, size, kind, weight);
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  const sx = kindSx(kind);
  const lines = wrapLines(g, caseFor(str, kind), maxW / sx).slice(0, maxLines);
  lines.forEach((ln, i) => fillSx(g, ln, x, y + i * size * lineH, sx));
  g.restore();
  return lines.length * size * lineH;
}

export function wrapLines(g, str, maxW) {
  const out = [];
  for (const para of String(str).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const t = line ? line + " " + word : word;
      if (g.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}

export function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

// A card. Fill/stroke default to the card colours; the shadow is the current surface's.
// Draw the card's contents inside onCard(() => ...) so they use the card roles.
export function panel(g, x, y, w, h, { fill = C.card, stroke = C.cardLine, lw = 4, r = 8, shadow = true } = {}) {
  if (shadow) {
    g.fillStyle = C.shadow;
    rrect(g, x + 8, y + 10, w, h, r);
    g.fill();
  }
  g.fillStyle = fill;
  rrect(g, x, y, w, h, r);
  g.fill();
  if (lw) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}

// Campaign button (vagageneral.org: yellow block + blue cartell text; red + white while active).
// p (0..1) = dwell/hold progress: the active colour fills the button from the left, so the hold
// feedback lives on the button itself. Colours: theme keys btn/btnText/btnLine/btnHot/btnHotText.
export function campaignButton(g, x, y, w, h, { label = "", sub = "", p = 0, size = 52, subSize = 32, alpha = 1, shadow = true } = {}) {
  const hot = p > 0;
  g.save();
  g.globalAlpha *= alpha;
  if (shadow) { g.fillStyle = C.shadow; g.fillRect(x + 8, y + 10, w, h); }
  g.fillStyle = C.btn; g.fillRect(x, y, w, h);
  if (hot) { g.fillStyle = C.btnHot; g.fillRect(x, y, w * clamp(p, 0, 1), h); }
  if (C.btnLine || hot) { g.lineWidth = 5; g.strokeStyle = hot ? C.btnHot : C.btnLine; g.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5); }
  // label drawn twice: normal colours, then clipped to the filled part in the active colours
  // optical centring: cap height of the cartell face ≈ 0.72 em; with a sub line the pair (cap top → sub baseline)
  // is centred as a group
  const ly = sub ? y + h / 2 - (subSize * 1.5 - size * 0.72) / 2 : y + h / 2 + size * 0.36;
  const label2 = (fg) => {
    textIcon(g, label, x + w / 2, ly, { size, kind: "title", align: "center", color: fg, maxW: w - 48 });
    if (sub) text(g, sub, x + w / 2, ly + subSize * 1.5, { size: subSize, weight: 700, align: "center", color: fg, maxW: w - 48 });
  };
  const fx = x + w * clamp(p, 0, 1);
  g.save(); g.beginPath(); g.rect(fx, y, x + w - fx, h); g.clip(); label2(C.btnText); g.restore();
  if (hot) { g.save(); g.beginPath(); g.rect(x, y, fx - x, h); g.clip(); label2(C.btnHotText); g.restore(); }
  g.restore();
}

export function ring(g, x, y, r, p, { color = C.red, back = C.track, lw = 12 } = {}) {
  g.save();
  g.lineCap = "round";
  g.lineWidth = lw;
  g.strokeStyle = back;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  if (p > 0) {
    g.strokeStyle = color;
    g.beginPath(); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(p, 0, 1)); g.stroke();
  }
  g.restore();
}

// Diagonal hatch fill for colour-blind friendly differentiation
let hatchCache = new Map();
export function hatch(g, color, bg = null, spacing = 14, lw = 4) {
  const key = color + bg + spacing + lw;
  if (!hatchCache.has(key)) {
    const c = document.createElement("canvas");
    c.width = c.height = spacing;
    const h = c.getContext("2d");
    if (bg) { h.fillStyle = bg; h.fillRect(0, 0, spacing, spacing); }
    h.strokeStyle = color; h.lineWidth = lw;
    h.beginPath();
    h.moveTo(-spacing, spacing * 2); h.lineTo(spacing * 2, -spacing);
    h.moveTo(-spacing, spacing); h.lineTo(spacing, -spacing);
    h.moveTo(0, spacing * 2); h.lineTo(spacing * 2, 0);
    h.stroke();
    hatchCache.set(key, g.createPattern(c, "repeat"));
  }
  return hatchCache.get(key);
}

export function drawCheck(g, x, y, s, { color = C.white, lw = null } = {}) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = lw || s * 0.22;
  g.lineCap = "round"; g.lineJoin = "round";
  g.beginPath();
  g.moveTo(x - s * 0.45, y + s * 0.02);
  g.lineTo(x - s * 0.12, y + s * 0.34);
  g.lineTo(x + s * 0.48, y - s * 0.32);
  g.stroke();
  g.restore();
}

export const BONES = [[5, 7], [7, 9], [6, 8], [8, 10], [5, 6], [5, 11], [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];

// Stylised silhouette from normalized keypoints (x,y in 0..1 of the camera frame) mapped into rect
export function drawSkeleton(g, kp, rect, { color = C.ink, lw = 18, alpha = 1, head = true, minC = 0.3 } = {}) {
  if (!kp) return;
  const P = (i) => [rect.x + kp[i][0] * rect.w, rect.y + kp[i][1] * rect.h];
  g.save();
  g.globalAlpha *= alpha;
  g.strokeStyle = color;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = lw;
  for (const [a, b] of BONES) {
    if (kp[a][2] < minC || kp[b][2] < minC) continue;
    const [x1, y1] = P(a), [x2, y2] = P(b);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  if (head && kp[0][2] >= minC && kp[5][2] >= minC && kp[6][2] >= minC) {
    const [hx, hy] = P(0);
    const sw = Math.hypot(P(5)[0] - P(6)[0], P(5)[1] - P(6)[1]);
    g.fillStyle = color;
    g.beginPath(); g.arc(hx, hy, Math.max(lw, sw * 0.32), 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// Small source line shown with every revealed number
export function sourceLine(g, src, x, y, maxW, { size = 22, color = C.inkSoft, align = "left" } = {}) {
  if (!src) return 0;
  return wrap(g, src, x, y, maxW, { size, color, align, lineH: 1.2 });
}

export function fmtNum(v, decimals = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return Number(v).toLocaleString("ca-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function decimalsFor(step) {
  if (!step || step >= 1) return 0;
  return Math.min(3, Math.ceil(-Math.log10(step) - 1e-9));
}

export function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

// Confetti / particle burst
export class Particles {
  constructor() { this.p = []; }
  burst(x, y, n = 40, colors = [C.red, C.mustard, C.blue, C.teal]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 200 + Math.random() * 500;
      this.p.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 300, life: 1.2 + Math.random() * 0.8, t: 0,
        c: colors[i % colors.length], w: 10 + Math.random() * 10, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10 });
    }
  }
  update(dt) {
    for (const q of this.p) { q.t += dt; q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt; }
    this.p = this.p.filter((q) => q.t < q.life);
  }
  draw(g) {
    for (const q of this.p) {
      g.save(); g.translate(q.x, q.y); g.rotate(q.rot);
      g.globalAlpha = 1 - q.t / q.life; g.fillStyle = q.c; g.fillRect(-q.w / 2, -q.w / 4, q.w, q.w / 2);
      g.restore();
    }
  }
}

export const PRIVACY = "Aquesta experiència detecta la postura amb una càmera. Tot es processa en aquest dispositiu: no es guarda ni s'envia cap imatge.";

// onField: use the poster-screen colours (C.field / C.fieldSoft / C.footBg) instead of the background ones.
// inset: keep the footer corners free for the ◀ ▶ shortcuts (band and text only in the centre zone)
export function privacyFooter(g, alpha = 1, { onField = false, inset = false } = {}) {
  const fg = onField ? C.fieldSoft : C.inkSoft;
  const x0 = inset ? LAYOUT.footX0 : 0, x1 = inset ? LAYOUT.footX1 : W;
  // inset: a strip on the footer row, vertically centred with the ◀ ▶ shortcuts
  const by = inset ? LAYOUT.navY - 26 : H - 52, cy = by + 26;
  const tx = inset ? x0 + 24 : LAYOUT.m;
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = onField ? C.footBg : C.paper2;
  g.fillRect(x0, by, x1 - x0, 52);
  // camera icon
  g.fillStyle = fg;
  rrect(g, tx, cy - 12, 34, 24, 5); g.fill();
  g.beginPath(); g.arc(tx + 17, cy, 7, 0, Math.PI * 2); g.fillStyle = onField ? C.field : C.paper2; g.fill();
  text(g, T("privacitat", "Aquesta experiència detecta la postura amb una càmera. Tot es processa en aquest dispositiu: no es guarda ni s'envia cap imatge."), tx + 52, cy + 22 * 0.355, { size: 22, weight: 700, color: fg, maxW: x1 - tx - 52 - 24 });
  g.restore();
}
// Campaign-style highlighted text block (vagageneral.org poster look): text on a solid band.
// Returns the width used. align: "left" | "center" | "right". bg "" = text only.
// maxW shrinks the type (never condenses it, like the site) so the block never exceeds that width.
export function posterSize(g, str, size, maxW, padX = 0) {
  if (!maxW) return size;
  const tw = measure(g, str, size, "poster");
  const need = tw + 2 * size * padX;
  return need > maxW ? Math.floor(size * maxW / need) : size;
}

export function posterBlock(g, str, x, y, size, { bg = C.hl, fg = C.hlText, align = "left", padX = 0.28, alpha = 1, sx = 1, maxW = 0 } = {}) {
  const s = caseFor(str, "poster");
  size = posterSize(g, s, size, maxW ? maxW / sx : 0, padX);
  g.save();
  g.globalAlpha *= alpha;
  font(g, size, "poster");
  const tw = g.measureText(s).width, pad = size * padX;
  const w = tw * sx + pad * 2;
  const h = size * 1.18;
  const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  // equal padding above the cap height and below the baseline (0.23 em each)
  if (bg) { g.fillStyle = bg; g.fillRect(x0, y - size * 0.95, w, h); }
  g.fillStyle = fg;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.translate(x0 + pad, y); g.scale(sx, 1);
  g.fillText(s, 0, 0);
  g.restore();
  return w;
}
// Full-bleed poster field for the start/final screens
export function posterField(g) {
  g.fillStyle = C.field;
  g.fillRect(0, 0, W, H);
}

// Slogan line («VIURE ENS COSTA LA VIDA»). With C.daltBg it is a full-bleed strip [y0, y0 + h];
// otherwise plain cartell type in C.daltFg. Returns the bottom y.
export function posterSlogan(g, str, x, y0, size, { align = "center", maxW = W - 220, alpha = 1, strip = true } = {}) {
  const h = size * 1.5;
  const base = y0 + h / 2 + size * 0.36;
  g.save();
  g.globalAlpha *= alpha;
  if (C.daltBg && strip) { g.fillStyle = C.daltBg; g.fillRect(0, y0, W, h); }
  posterBlock(g, str, x, base, size, { bg: C.daltBg && !strip ? C.daltBg : "", fg: C.daltFg, align, padX: C.daltBg && !strip ? 0.28 : 0, maxW });
  g.restore();
  return y0 + h;
}

// «VAGA GENERAL» + date, campaign style: a solid block spanning [x, x + w] (C.titleBg), the logo
// (C.disc: a yellow disc with the title stacked inside, at the left of the column or centred) or bare
// type. The title is as big as fits the width (shrunk, never condensed). Static. Returns the bottom y.
export function posterTitle(g, title, sub, x, y0, w, { size = 220, subSize = 92, align = "center", alpha = 1 } = {}) {
  if (C.disc) return posterLogo(g, title, sub, x, y0, w, { size, subSize, align, alpha });
  const inner = w - size * 0.34;
  size = posterSize(g, title, size, inner);
  if (sub) subSize = Math.min(subSize, posterSize(g, sub, subSize, inner, C.subBg ? 0.22 : 0));
  const padT = size * 0.17, gap = size * 0.15 + (C.subBg ? subSize * 0.32 : 0), padB = size * 0.2;
  const tb = y0 + padT + size * 0.72;
  const sb = tb + gap + subSize * 0.72;
  const y1 = sb + padB;
  const tx = align === "center" ? x + w / 2 : x + size * 0.17;
  g.save();
  g.globalAlpha *= alpha;
  if (C.titleBg) { g.fillStyle = C.titleBg; g.fillRect(x, y0, w, y1 - y0); }
  posterBlock(g, title, tx, tb, size, { bg: "", fg: C.titleFg, align, padX: 0 });
  if (sub) posterBlock(g, sub, tx, sb, subSize, { bg: C.subBg, fg: C.titleSub, align, padX: C.subBg ? 0.22 : 0 });
  g.restore();
  return y1;
}

// The campaign logo: disc (C.disc) with the title split over two lines and the date, all in C.titleFg
function posterLogo(g, title, sub, x, y0, w, { size, subSize, align, alpha }) {
  const R = size * 1.15;
  const cx = align === "center" ? x + w / 2 : x + R, cy = y0 + R - size * 0.17;
  const words = String(title).split(" ");
  let cut = 1, best = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (d < best) { best = d; cut = i; }
  }
  const lines = words.length > 1 ? [words.slice(0, cut).join(" "), words.slice(cut).join(" ")] : [title];
  const s1 = size * 0.62, s2 = size * 0.5, s3 = subSize * 0.56;
  const rows = lines.length > 1 ? [[lines[0], s1], [lines[1], s2]] : [[lines[0], s1]];
  if (sub) rows.push([sub, s3]);
  const gap = size * 0.07;
  const total = rows.reduce((t, [, s]) => t + s * 0.72, 0) + gap * (rows.length - 1);
  const chord = (dy) => 2 * Math.sqrt(Math.max(0, R * R - dy * dy)) * 0.86;
  g.save();
  g.globalAlpha *= alpha;
  g.fillStyle = C.disc;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  if (C.discLine) { g.lineWidth = Math.max(6, R * 0.05); g.strokeStyle = C.discLine; g.stroke(); }
  let top = cy - total / 2;
  for (const [str, s] of rows) {
    const cap = s * 0.72, far = Math.max(Math.abs(top - cy), Math.abs(top + cap - cy));
    posterBlock(g, str, cx, top + cap, s, { bg: "", fg: C.titleFg, align: "center", padX: 0, maxW: chord(far) });
    top += cap + gap;
  }
  g.restore();
  return cy + R;
}
