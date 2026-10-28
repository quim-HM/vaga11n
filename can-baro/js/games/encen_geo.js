// Map geometry for «Encén la vaga»: projects real boundaries (data/geo/*.json) into screen space,
// pre-builds Path2D objects, label anchors, neighbour lists and brush hit tests.
// When geometries are missing it falls back to a stylised bubble cartogram (data/territori.json).
import { clamp, lerp } from "../ui.js";

export const MAP_BOX = { x0: 150, y0: 165, x1: 1770, y1: 955 };
const SIMPLIFY_PX = 0.9;
const DP_PX = 1.1;

// Douglas-Peucker on a flat [x0,y0,x1,y1,...] closed ring (iterative)
function simplifyDP(pts, tol) {
  const n = pts.length / 2;
  if (n <= 4) return pts;
  const keep = new Uint8Array(n);
  keep[0] = 1; keep[n - 1] = 1;
  // split at the farthest point from the start so closed rings keep their shape
  let far = 0, fd = -1;
  for (let i = 1; i < n; i++) { const d = (pts[2 * i] - pts[0]) ** 2 + (pts[2 * i + 1] - pts[1]) ** 2; if (d > fd) { fd = d; far = i; } }
  keep[far] = 1;
  const stack = [[0, far], [far, n - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    let idx = -1, md = t2;
    for (let i = a + 1; i < b; i++) {
      const d = segDist2(pts[2 * i], pts[2 * i + 1], pts[2 * a], pts[2 * a + 1], pts[2 * b], pts[2 * b + 1]);
      if (d > md) { md = d; idx = i; }
    }
    if (idx >= 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
  return out.length >= 6 ? Float32Array.from(out) : pts;
}

const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function ringArea(r) {
  let s = 0;
  for (let i = 0, n = r.length; i < n; i += 2) {
    const j = (i + 2) % n;
    s += r[i] * r[j + 1] - r[j] * r[i + 1];
  }
  return Math.abs(s) / 2;
}

function inRing(r, x, y) {
  let inside = false;
  for (let i = 0, n = r.length, j = n - 2; i < n; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}

function edgeDist2(rings, x, y) {
  let best = Infinity;
  for (const r of rings) {
    for (let i = 0, n = r.length, j = n - 2; i < n; j = i, i += 2) {
      const d = segDist2(x, y, r[j], r[j + 1], r[i], r[i + 1]);
      if (d < best) best = d;
    }
  }
  return best;
}

// Any point clearly inside an area (used to detect enclaves)
function interiorPoint(b) {
  let best = null;
  for (let gx = 1; gx < 8; gx++) for (let gy = 1; gy < 8; gy++) {
    const x = lerp(b.minX, b.maxX, gx / 8), y = lerp(b.minY, b.maxY, gy / 8);
    if (!b.rings.some((r) => inRing(r, x, y))) continue;
    const d = edgeDist2(b.rings, x, y);
    if (!best || d > best.d) best = { x, y, d };
  }
  return best;
}

export function pointInArea(a, x, y) {
  // areas cut by the map frame only exist inside it
  if (a.clip && (x < a.clip.x0 || x > a.clip.x1 || y < a.clip.y0 || y > a.clip.y1)) return false;
  if (x < a.minX || x > a.maxX || y < a.minY || y > a.maxY) return false;
  if (a.circle) return (x - a.circle.x) ** 2 + (y - a.circle.y) ** 2 <= a.circle.r ** 2;
  if (a.covers && a.covers.some((b) => pointInArea(b, x, y))) return false;
  for (const r of a.rings) if (inRing(r, x, y)) return true;
  return false;
}

// Exact circle-vs-polygon test: centre inside, or any edge (incl. enclave borders) closer than R
export function brushHits(a, x, y, R) {
  if (x + R < a.minX || x - R > a.maxX || y + R < a.minY || y - R > a.maxY) return false;
  if (a.circle) return (x - a.circle.x) ** 2 + (y - a.circle.y) ** 2 <= (a.circle.r + R) ** 2;
  if (pointInArea(a, x, y)) return true;
  const R2 = R * R;
  const edges = a.covers && a.covers.length ? a.rings.concat(...a.covers.map((b) => b.rings)) : a.rings;
  for (const r of edges) {
    for (let i = 0, n = r.length, j = n - 2; i < n; j = i, i += 2) {
      if (segDist2(x, y, r[j], r[j + 1], r[i], r[i + 1]) <= R2) return true;
    }
  }
  return false;
}

// Interior point far from the edges (coarse "pole of inaccessibility") for labels
function labelAnchor(a, covered = null, extraRings = []) {
  let big = a.rings[0], bigA = -1;
  for (const r of a.rings) { const ar = ringArea(r); if (ar > bigA) { bigA = ar; big = r; } }
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (let i = 0; i < big.length; i += 2) {
    bx0 = Math.min(bx0, big[i]); bx1 = Math.max(bx1, big[i]); by0 = Math.min(by0, big[i + 1]); by1 = Math.max(by1, big[i + 1]);
  }
  let best = { x: (bx0 + bx1) / 2, y: (by0 + by1) / 2, d: 0 };
  const search = (x0, y0, x1, y1, n) => {
    for (let gx = 0; gx <= n; gx++) for (let gy = 0; gy <= n; gy++) {
      const x = lerp(x0, x1, gx / n), y = lerp(y0, y1, gy / n);
      if (!inRing(big, x, y) || (covered && covered(x, y))) continue;
      const d = Math.sqrt(edgeDist2([big, ...extraRings], x, y));
      if (d > best.d) best = { x, y, d };
    }
  };
  search(bx0, by0, bx1, by1, 12);
  const sx = (bx1 - bx0) / 12, sy = (by1 - by0) / 12;
  search(best.x - sx, best.y - sy, best.x + sx, best.y + sy, 6);
  return best;
}

function finishArea(a, withLabel = true) {
  a.minX = Infinity; a.minY = Infinity; a.maxX = -Infinity; a.maxY = -Infinity;
  a.path = new Path2D();
  a.px = 0;
  for (const r of a.rings) {
    for (let i = 0; i < r.length; i += 2) {
      a.minX = Math.min(a.minX, r[i]); a.maxX = Math.max(a.maxX, r[i]);
      a.minY = Math.min(a.minY, r[i + 1]); a.maxY = Math.max(a.maxY, r[i + 1]);
      if (i === 0) a.path.moveTo(r[0], r[1]); else a.path.lineTo(r[i], r[i + 1]);
    }
    a.path.closePath();
    a.px += ringArea(r);
  }
  if (!withLabel) return;
  const l = labelAnchor(a);
  a.lx = l.x; a.ly = l.y; a.lr = l.d;
}

function baseArea(id, nom, extra = {}) {
  return { id: String(id), nom: String(nom || id), v: 0, touched: false, nb: [], label: undefined, ...extra };
}

// Projected + simplified rings of a feature (radial-distance simplification in screen space keeps
// rendering and hit tests cheap)
function projectRings(f, proj) {
  const rings = [];
  for (const p of f.paths || []) {
    const pts = p.filter((pt) => Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1])).map(proj);
    if (pts.length < 3) continue;
    const out = [pts[0][0], pts[0][1]];
    let lx = pts[0][0], ly = pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      if ((x - lx) ** 2 + (y - ly) ** 2 >= SIMPLIFY_PX * SIMPLIFY_PX || i === pts.length - 1) { out.push(x, y); lx = x; ly = y; }
    }
    rings.push(out.length >= 6 ? Float32Array.from(out) : Float32Array.from(pts.flat()));
  }
  return rings;
}

function ringsBox(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (let i = 0; i < r.length; i += 2) {
    x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]);
  }
  return { x0, y0, x1, y1 };
}

const VISIBLE_MIN_PX = 30;   // an area needs at least this much (both ways) inside the vista frame to be playable

// Real geometries -> areas. Returns null if the file is missing/unusable.
// geo.vista = [minLon, minLat, maxLon, maxLat] (optional): the map is fitted to that rectangle instead of the
// features' extent and everything is clipped to it (map.frame, screen px). Areas only partly inside stay playable
// (pointInArea is clipped to the frame, so only their visible part gets cells); areas (almost) fully outside, and
// geo.context features, become map.context: drawn faintly, never playable.
export function areasFromGeo(geo, box = MAP_BOX) {
  const feats = (geo && Array.isArray(geo.features) ? geo.features.filter((f) => f && Array.isArray(f.paths) && f.paths.length) : [])
    // features with an "inset" ({dx, dy} in degrees, e.g. l'Alguer) are moved next to the main map
    .map((f) => {
      const dx = num(f.inset && f.inset.dx), dy = num(f.inset && f.inset.dy);
      if (dx === null && dy === null) return f;
      return { ...f, insetShift: true, paths: f.paths.map((p) => p.map((pt) => [pt[0] + (dx || 0), pt[1] + (dy || 0)])) };
    });
  if (feats.length < 3) return null;
  const v = Array.isArray(geo.vista) && geo.vista.length === 4 ? geo.vista.map(Number) : null;
  const vista = v && v.every(Number.isFinite) && v[2] > v[0] && v[3] > v[1] ? v : null;
  let lat0 = null;
  if (vista) lat0 = (vista[1] + vista[3]) / 2;
  else if (Array.isArray(geo.bbox) && geo.bbox.length === 4) lat0 = (geo.bbox[1] + geo.bbox[3]) / 2;
  if (lat0 === null) {
    let s = 0, n = 0;
    for (const f of feats) for (const p of f.paths) for (const pt of p) { s += pt[1]; n++; }
    lat0 = n ? s / n : 41.7;
  }
  const k = Math.cos((lat0 * Math.PI) / 180);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  if (vista) { minX = vista[0] * k; maxX = vista[2] * k; minY = -vista[3]; maxY = -vista[1]; }
  else {
    for (const f of feats) for (const p of f.paths) for (const pt of p) {
      const x = pt[0] * k, y = -pt[1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const s = Math.min(bw / (maxX - minX || 1e-9), bh / (maxY - minY || 1e-9));
  const ox = box.x0 + (bw - (maxX - minX) * s) / 2, oy = box.y0 + (bh - (maxY - minY) * s) / 2;
  const proj = (pt) => [ox + (pt[0] * k - minX) * s, oy + (-pt[1] - minY) * s];
  const bounds = { x0: ox, y0: oy, x1: ox + (maxX - minX) * s, y1: oy + (maxY - minY) * s };
  const frame = vista ? bounds : null;
  const visible = (b) => !frame || (Math.min(b.x1, frame.x1) - Math.max(b.x0, frame.x0) >= VISIBLE_MIN_PX
    && Math.min(b.y1, frame.y1) - Math.max(b.y0, frame.y0) >= VISIBLE_MIN_PX);
  const areas = [], context = [];
  feats.forEach((f, fi) => {
    const rings = projectRings(f, proj);
    if (!rings.length) return;
    const a = baseArea(f.id ?? `f${fi}`, f.nom, {
      pop: num(f.poblacio), any: f.any_poblacio ?? null, fontPop: f.font_poblacio ?? null, rings,
      regio: f.regio ?? null, inset: !!f.insetShift, clip: frame,
    });
    (visible(ringsBox(rings)) ? areas : context).push(a);
  });
  for (const f of geo.context || []) {
    if (!f || !Array.isArray(f.paths)) continue;
    const rings = projectRings(f, proj);
    if (rings.length) context.push(baseArea(f.id ?? `c${context.length}`, f.nom, { rings, context: true, pop: num(f.poblacio), any: f.any_poblacio ?? null, fontPop: f.font_poblacio ?? null }));
  }
  if (areas.length < 3) return null;
  computeNeighbours(areas);
  for (const a of areas) {
    a.rings = a.rings.map((r) => simplifyDP(r, DP_PX));
    finishArea(a, false);
  }
  // labels stay inside the frame and away from its edges
  const frameRing = frame ? [Float32Array.of(frame.x0, frame.y0, frame.x1, frame.y0, frame.x1, frame.y1, frame.x0, frame.y1)] : [];
  const outside = (x, y) => !!frame && (x < frame.x0 + 8 || x > frame.x1 - 8 || y < frame.y0 + 8 || y > frame.y1 - 8);
  // Holes were dropped upstream: enclaves come later in file order and overlap their surrounding
  // area, so labels of an area must avoid any later area drawn on top of it.
  areas.forEach((a, i) => {
    const later = areas.slice(i + 1).filter((b) => b.minX < a.maxX && b.maxX > a.minX && b.minY < a.maxY && b.maxY > a.minY);
    // enclaves: later areas lying inside this one (they act as its holes for hit tests)
    a.covers = later.filter((b) => { const p = interiorPoint(b); return p && a.rings.some((r) => inRing(r, p.x, p.y)); });
    for (const b of a.covers) {
      const j = areas.indexOf(b);
      if (!a.nb.includes(j)) a.nb.push(j);
      if (!b.nb.includes(i)) b.nb.push(i);
    }
    const l = labelAnchor(a, (x, y) => outside(x, y) || later.some((b) => pointInArea(b, x, y)), [...later.flatMap((b) => b.rings), ...frameRing]);
    a.lx = l.x; a.ly = l.y; a.lr = l.d;
  });
  for (const a of context) {
    a.rings = a.rings.map((r) => simplifyDP(r, DP_PX));
    finishArea(a, false);
    // context names keep clear of the playable areas (e.g. el Xup lies inside Farreres–Suanya)
    const l = labelAnchor(a, (x, y) => outside(x, y) || areas.some((b) => pointInArea(b, x, y)), [...frameRing, ...areas.flatMap((b) => b.rings)]);
    a.lx = l.x; a.ly = l.y; a.lr = l.d;
  }
  return { areas, context, frame, proj, kind: "geo", bounds };
}
// Neighbours = areas with vertices in the same/adjacent 6 px cells (shared borders survive simplification)
function computeNeighbours(areas) {
  const CELL = 6;
  const grid = new Map();
  areas.forEach((a, ai) => {
    for (const r of a.rings) for (let i = 0; i < r.length; i += 2) {
      const key = Math.floor(r[i] / CELL) * 100000 + Math.floor(r[i + 1] / CELL);
      let set = grid.get(key);
      if (!set) { set = new Set(); grid.set(key, set); }
      set.add(ai);
    }
  });
  const pairs = new Set();
  for (const [key, set] of grid) {
    const cx = Math.floor(key / 100000), cy = key - cx * 100000;
    const near = new Set(set);
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const o = grid.get((cx + dx) * 100000 + cy + dy);
      if (o) for (const v of o) near.add(v);
    }
    if (near.size < 2) continue;
    const ids = [...near];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = Math.min(ids[i], ids[j]), b = Math.max(ids[i], ids[j]);
      pairs.add(a * 10000 + b);
    }
  }
  for (const p of pairs) {
    const a = Math.floor(p / 10000), b = p % 10000;
    areas[a].nb.push(b); areas[b].nb.push(a);
  }
}

// ---------------------------------------------------------------------------------------------
// Hexagonal cells (pointy-top) clipped to the areas: heat lives in cells, not in whole areas.
export function buildCells(areas, s) {
  const w = Math.sqrt(3) * s, h = 1.5 * s;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const a of areas) { x0 = Math.min(x0, a.minX); y0 = Math.min(y0, a.minY); x1 = Math.max(x1, a.maxX); y1 = Math.max(y1, a.maxY); }
  x0 -= w; y0 -= h;
  const cols = Math.ceil((x1 - x0) / w) + 2, rows = Math.ceil((y1 - y0) / h) + 2;
  const grid = new Int32Array(cols * rows).fill(-1);
  const cx = [], cy = [], ca = [], cc = [], cr = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * w + (r & 1 ? w / 2 : 0), y = y0 + r * h;
      let k = -1;
      // reverse order: enclaves are listed after (and drawn over) their surrounding area
      for (let i = areas.length - 1; i >= 0; i--) if (pointInArea(areas[i], x, y)) { k = i; break; }
      if (k < 0) continue;
      grid[r * cols + c] = cx.length;
      cx.push(x); cy.push(y); ca.push(k); cc.push(c); cr.push(r);
    }
  }
  // areas too small to contain a cell centre get one "loose" cell at their label anchor
  const has = new Uint8Array(areas.length);
  for (const k of ca) has[k] = 1;
  const loose = [];
  areas.forEach((a, k) => {
    if (has[k]) return;
    loose.push(cx.length);
    cx.push(a.lx); cy.push(a.ly); ca.push(k); cc.push(-1); cr.push(-1);
  });
  const n = cx.length;
  const nb = new Int32Array(n * 6).fill(-1);
  const EVEN = [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  const ODD = [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  for (let i = 0; i < n; i++) {
    if (cc[i] < 0) continue;
    const offs = cr[i] & 1 ? ODD : EVEN;
    offs.forEach(([dc, dr], k) => {
      const c = cc[i] + dc, r = cr[i] + dr;
      if (c >= 0 && r >= 0 && c < cols && r < rows) nb[i * 6 + k] = grid[r * cols + c];
    });
  }
  const area = Int32Array.from(ca);
  const areaCount = new Int32Array(areas.length);
  for (let i = 0; i < n; i++) areaCount[area[i]]++;
  return { s, w, h, x0, y0, cols, rows, grid, n, x: Float32Array.from(cx), y: Float32Array.from(cy), area, nb, loose, areaCount };
}

// Calls fn(i) for every cell whose centre is within R of (x, y)
export function cellsInCircle(cells, x, y, R, fn) {
  const { w, h, x0, y0, cols, rows, grid } = cells;
  const R2 = R * R;
  const r0 = Math.max(0, Math.floor((y - R - y0) / h)), r1 = Math.min(rows - 1, Math.ceil((y + R - y0) / h));
  for (let r = r0; r <= r1; r++) {
    const sh = r & 1 ? w / 2 : 0;
    const c0 = Math.max(0, Math.floor((x - R - x0 - sh) / w)), c1 = Math.min(cols - 1, Math.ceil((x + R - x0 - sh) / w));
    for (let c = c0; c <= c1; c++) {
      const i = grid[r * cols + c];
      if (i < 0) continue;
      const dx = cells.x[i] - x, dy = cells.y[i] - y;
      if (dx * dx + dy * dy <= R2) fn(i);
    }
  }
  for (const i of cells.loose) {
    const dx = cells.x[i] - x, dy = cells.y[i] - y;
    if (dx * dx + dy * dy <= R2) fn(i);
  }
}

// ---------------------------------------------------------------------------------------------
// Fallback: stylised bubble cartogram from data/territori.json (or built-in names)
const FALLBACK = {
  manresa: [
    ["Centre – Barri Antic", 41.7247, 1.8262], ["Carretera de Vic – Sagrada Família", 41.7335, 1.8345],
    ["Passeig – Plaça Catalunya", 41.7298, 1.8232], ["Escodines – Remei", 41.7218, 1.8318],
    ["Valldaura – Cal Gravat", 41.7372, 1.8195], ["Mion – Puigberenguer", 41.7322, 1.8105],
    ["Bases de Manresa – Saldes", 41.7405, 1.8290], ["La Font dels Capellans – Font del Gat", 41.7185, 1.8170],
  ],
  bages: [
    ["Manresa", 41.7286, 1.8268], ["Santpedor i Sant Fruitós", 41.7700, 1.8600],
    ["Sallent i Balsareny", 41.8350, 1.8930], ["Súria i Cardona", 41.8600, 1.7200],
    ["Navarcles i Artés", 41.7800, 1.9350], ["Sant Joan de Vilatorrada", 41.7450, 1.8050],
    ["Sant Vicenç de Castellet", 41.6650, 1.8620], ["Monistrol de Montserrat", 41.6100, 1.8430],
  ],
  catalunya: [
    ["Alt Pirineu i Aran", 42.40, 1.20], ["Lleida", 41.70, 0.85], ["Comarques Centrals", 41.90, 1.85],
    ["Girona", 42.05, 2.75], ["Barcelona", 41.50, 2.15], ["Penedès", 41.35, 1.65],
    ["Camp de Tarragona", 41.20, 1.10], ["Terres de l'Ebre", 40.80, 0.55],
  ],
};

export function fallbackZones(territori, id) {
  const levels = territori && Array.isArray(territori.nivells) ? territori.nivells : [];
  const d = levels.find((l) => l && l.id === id);
  const zones = d && Array.isArray(d.zones) ? d.zones.filter((z) => z && (z.nom || z.id)) : [];
  if (zones.length >= 3) return zones;
  return FALLBACK[id].map(([nom, lat, lon], i) => ({ id: `${id}-${i}`, nom, lat, lon, poblacio: null }));
}

export function areasFromBubbles(raw) {
  const zones = raw.map((z, i) => ({
    id: String(z.id ?? `z${i}`), nom: String(z.nom ?? z.id), lat: num(z.lat), lon: num(z.lon),
    pop: num(z.poblacio), any: z.any_poblacio ?? null, fontPop: z.font_id ?? null,
  }));
  const n = zones.length;
  const geo = zones.filter((z) => z.lat !== null && z.lon !== null);
  const lat0 = geo.length ? geo.reduce((s, z) => s + z.lat, 0) / geo.length : 41.7;
  const k = Math.cos((lat0 * Math.PI) / 180);
  geo.forEach((z) => { z.qx = z.lon * k; z.qy = -z.lat; });
  zones.filter((z) => z.qx === undefined).forEach((z, i) => { const a = i * 2.4; z.qx = Math.cos(a); z.qy = Math.sin(a); });
  const allPop = zones.every((z) => z.pop !== null && z.pop > 0);
  if (allPop) {
    const s = zones.map((z) => Math.sqrt(z.pop));
    const lo = Math.min(...s), hi = Math.max(...s);
    zones.forEach((z, i) => { z.r = hi > lo ? lerp(82, 128, (s[i] - lo) / (hi - lo)) : 105; });
  } else zones.forEach((z) => { z.r = 105; });
  const rMax = Math.max(...zones.map((z) => z.r));
  const box = { x0: 150 + rMax * 0.8, x1: 1770 - rMax * 0.8, y0: 165 + rMax, y1: 955 - rMax * 0.65 };
  const xs = zones.map((z) => z.qx), ys = zones.map((z) => z.qy);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spX = maxX - minX || 1e-6, spY = maxY - minY || 1e-6;
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const s0 = Math.min(bw / spX, bh / spY);
  const sx = Math.min(bw / spX, s0 * 2.5), sy = Math.min(bh / spY, s0 * 2.5);
  const ox = box.x0 + (bw - spX * sx) / 2, oy = box.y0 + (bh - spY * sy) / 2;
  zones.forEach((z) => { z.tx = ox + (z.qx - minX) * sx; z.ty = oy + (z.qy - minY) * sy; z.x = z.tx; z.y = z.ty; });
  const GAP = 40, ITER = 600;
  for (let it = 0; it < ITER; it++) {
    const pull = 0.02 * Math.max(0, 1 - it / (ITER * 0.75));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = zones[i], b = zones[j];
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      const min = a.r + b.r + GAP;
      if (d < min) {
        if (d < 1e-3) { dx = Math.cos(i + j); dy = Math.sin(i + j); d = 1; }
        const push = (min - d) / 2;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push; b.x += (dx / d) * push; b.y += (dy / d) * push;
      }
    }
    for (const z of zones) {
      z.x += (z.tx - z.x) * pull; z.y += (z.ty - z.y) * pull;
      z.x = clamp(z.x, 150 + z.r * 0.6, 1770 - z.r * 0.6); z.y = clamp(z.y, 165 + z.r, 955 - z.r * 0.6);
    }
  }
  const areas = zones.map((z) => {
    const a = baseArea(z.id, z.nom, { pop: z.pop, any: z.any, fontPop: z.fontPop, rings: [], circle: { x: z.x, y: z.y, r: z.r } });
    a.path = new Path2D(); a.path.arc(z.x, z.y, z.r, 0, Math.PI * 2);
    a.minX = z.x - z.r; a.maxX = z.x + z.r; a.minY = z.y - z.r; a.maxY = z.y + z.r;
    a.lx = z.x; a.ly = z.y; a.lr = z.r * 0.9; a.px = Math.PI * z.r * z.r;
    return a;
  });
  // neighbours: 2-3 nearest
  for (let i = 0; i < n; i++) {
    const order = areas.map((b, j) => ({ j, d: Math.hypot(areas[i].lx - b.lx, areas[i].ly - b.ly) })).filter((o) => o.j !== i).sort((p, q) => p.d - q.d);
    for (const o of order.slice(0, order[2] && order[2].d < order[1].d * 1.3 ? 3 : 2)) {
      if (!areas[i].nb.includes(o.j)) areas[i].nb.push(o.j);
      if (!areas[o.j].nb.includes(i)) areas[o.j].nb.push(i);
    }
  }
  return { areas, kind: "bubbles", links: areas.flatMap((a, i) => a.nb.filter((j) => j > i).map((j) => [i, j])) };
}
