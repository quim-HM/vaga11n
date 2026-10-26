// Seamless motion trails: a short history of positions (oldest → newest) is smoothed with a Catmull-Rom
// spline and drawn as ONE filled ribbon that tapers to nothing at the tail, with a single linear gradient
// fading it out (one gradient per ribbon, no shadowBlur, no per-segment strokes). An optional narrower
// lighter core gives the "glow" without blur.
const rgbCache = new Map();
let parseCtx = null;
function rgb(color) {
  const key = String(color);
  if (rgbCache.has(key)) return rgbCache.get(key);
  if (!parseCtx) parseCtx = document.createElement("canvas").getContext("2d");
  parseCtx.fillStyle = "#000";
  parseCtx.fillStyle = key;
  const v = parseCtx.fillStyle;   // "#rrggbb" or "rgba(r, g, b, a)"
  let out;
  if (v[0] === "#") out = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
  else out = v.replace(/[^\d,.]/g, "").split(",").slice(0, 3).map(Number);
  rgbCache.set(key, out);
  return out;
}
const rgba = (c, a) => { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; };

// Catmull-Rom resampling: `per` points per segment (ends included once)
function smooth(pts, per) {
  const n = pts.length, out = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push({ x: pts[n - 1].x, y: pts[n - 1].y });
  return out;
}

function ribbonPath(g, s, width, taper) {
  const n = s.length;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = s[Math.max(0, i - 1)], b = s[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    const hw = (width / 2) * Math.pow(i / (n - 1), taper);
    L.push([s[i].x - ty * hw, s[i].y + tx * hw]);
    R.push([s[i].x + ty * hw, s[i].y - tx * hw]);
  }
  g.beginPath();
  g.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(L[i][0], L[i][1]);
  // round head: half circle from the left edge to the right edge around the newest point
  const h = s[n - 1], hb = s[Math.max(0, n - 2)];
  const ang = Math.atan2(h.y - hb.y, h.x - hb.x);
  g.arc(h.x, h.y, width / 2, ang + Math.PI / 2, ang - Math.PI / 2, true);
  for (let i = n - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath();
}

// pts: [{x, y}, …] oldest → newest (screen px). width: at the head. Returns nothing; no state is kept.
export function drawTrail(g, pts, { width = 20, color = "#FFFFFF", alpha = 1, core = null, coreAlpha = 0.6, taper = 0.9, per = 4 } = {}) {
  // drop repeated points (a still hand) so the tangent stays defined
  const p = [];
  for (const q of pts) if (!p.length || Math.hypot(q.x - p[p.length - 1].x, q.y - p[p.length - 1].y) > 0.5) p.push(q);
  if (p.length < 2) return;
  const s = smooth(p, per);
  const tail = s[0], head = s[s.length - 1];
  if (Math.hypot(head.x - tail.x, head.y - tail.y) < 2) return;
  g.save();
  const grad = (c, a) => {
    const gr = g.createLinearGradient(tail.x, tail.y, head.x, head.y);
    gr.addColorStop(0, rgba(c, 0));
    gr.addColorStop(0.55, rgba(c, a * 0.55));
    gr.addColorStop(1, rgba(c, a));
    return gr;
  };
  ribbonPath(g, s, width, taper);
  g.fillStyle = grad(color, alpha);
  g.fill();
  if (core) {
    ribbonPath(g, s, width * 0.42, taper);
    g.fillStyle = grad(core, alpha * coreAlpha);
    g.fill();
  }
  g.restore();
}
