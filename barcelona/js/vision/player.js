// Person tracking, active-player selection and body feature extraction. Port of vaga11n/player.py,
// producing exactly the same "pose" message fields the games consume.
//
// Coordinates exposed to the games:
// - kp: 17 COCO keypoints normalized to the (mirrored) frame: x in [0,1], y in [0,1] (down).
// - hands: per anatomical side, position in "reach space": origin at the shoulder midpoint,
//   unit = estimated arm reach, x to the right of the screen, y UP. A relaxed hand is around
//   y=-0.8, a hand straight above the head around y=+1.0. This makes control independent of
//   distance to the camera, body size and standing/seated posture.
import { OneEuro } from "./filters.js";

// COCO-17 keypoint indices
export const NOSE = 0, L_SHOULDER = 5, R_SHOULDER = 6, L_ELBOW = 7, R_ELBOW = 8, L_WRIST = 9, R_WRIST = 10;
export const L_HIP = 11, R_HIP = 12;
export const KP_MIN = 0.3;

const r = (v, d) => { const k = 10 ** d; return Math.round(v * k) / k; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function iou(a, b) {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]), y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return ua > 0 ? inter / ua : 0;
}

// Greedy IoU tracker; good enough for a handful of people at 25-30 fps.
export class Tracker {
  constructor(maxAge = 0.6, iouThr = 0.25) {
    this.maxAge = maxAge;
    this.iouThr = iouThr;
    this.tracks = new Map();
    this.nextId = 1;
  }

  update(persons, t) {
    const pairs = [];
    for (const [tid, tr] of this.tracks) persons.forEach((p, i) => pairs.push([iou(tr.person.box, p.box), tid, i]));
    pairs.sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]);
    const usedT = new Set(), usedP = new Set();
    for (const [v, tid, i] of pairs) {
      if (v < this.iouThr) break;
      if (usedT.has(tid) || usedP.has(i)) continue;
      const tr = this.tracks.get(tid);
      tr.person = persons[i]; tr.lastSeen = t; tr.hits += 1;
      usedT.add(tid); usedP.add(i);
    }
    persons.forEach((p, i) => {
      if (usedP.has(i)) return;
      const tid = this.nextId++;
      this.tracks.set(tid, { id: tid, person: p, lastSeen: t, hits: 1 });
    });
    for (const [tid, tr] of [...this.tracks]) if (t - tr.lastSeen > this.maxAge) this.tracks.delete(tid);
    return [...this.tracks.values()].filter((tr) => tr.lastSeen === t);
  }
}

export function shoulderWidth(p) {
  if (p.kconf[L_SHOULDER] < KP_MIN || p.kconf[R_SHOULDER] < KP_MIN) return 0;
  return dist(p.kpts[L_SHOULDER], p.kpts[R_SHOULDER]);
}

export class PlayerSelector {
  constructor(cfg) {
    this.cfg = cfg;
    this.state = { trackId: null, since: 0, lastSeen: -1e9, reachObs: 0, filt: new OneEuro() };
  }

  // Selection score (0 = not eligible)
  eligible(tr, w) {
    const p = tr.person;
    const sw = shoulderWidth(p);
    if (sw < this.cfg.player.min_shoulder_width * w) return 0;
    const cx = (p.kpts[L_SHOULDER][0] + p.kpts[R_SHOULDER][0]) / 2 / w;
    const zmin = this.cfg.player.zone_x_min, zmax = this.cfg.player.zone_x_max;
    if (!(zmin <= cx && cx <= zmax)) return 0;
    const centrality = 1 - Math.abs(cx - (zmin + zmax) / 2) / Math.max((zmax - zmin) / 2, 1e-3);
    return (sw / w) * (0.6 + 0.4 * centrality);
  }

  // Why a person is not eligible, for the framing hints (web/js/framing.js): amagat = shoulders not
  // visible, petit = too small (far away), zona = outside the play zone, null = eligible
  whyNot(tr, w) {
    const p = tr.person;
    const sw = shoulderWidth(p);
    if (sw <= 0) return "amagat";
    if (sw < this.cfg.player.min_shoulder_width * w) return "petit";
    const cx = (p.kpts[L_SHOULDER][0] + p.kpts[R_SHOULDER][0]) / 2 / w;
    if (!(this.cfg.player.zone_x_min <= cx && cx <= this.cfg.player.zone_x_max)) return "zona";
    return null;
  }

  update(tracks, t, w) {
    const st = this.state;
    const scored = new Map(tracks.map((tr) => [tr.id, this.eligible(tr, w)]));
    const current = tracks.find((tr) => tr.id === st.trackId && scored.get(tr.id) > 0);
    if (current) { st.lastSeen = t; return current; }
    if (t - st.lastSeen < this.cfg.player.lost_timeout && st.trackId !== null) return null; // brief occlusion: keep the seat
    let best = null;
    for (const tr of tracks) if (scored.get(tr.id) > 0 && (!best || scored.get(tr.id) > scored.get(best.id))) best = tr;
    if (best) {
      // Same track id can never come back after being dropped, so a new id means a new player
      st.trackId = best.id; st.since = t; st.lastSeen = t;
      st.reachObs = 0;
      st.filt = new OneEuro(this.cfg.filter.min_cutoff, this.cfg.filter.beta);
    }
    return best;
  }

  features(tr, t, w, h) {
    const st = this.state;
    const p = tr.person;
    const f = st.filt;
    f.minCutoff = this.cfg.filter.min_cutoff; f.beta = this.cfg.filter.beta;
    // Filter in frame-height units so x and y share the same scale
    const flat = f.filter(p.kpts.flatMap(([x, y]) => [x / h, y / h]), t);
    const k = Array.from({ length: 17 }, (_, i) => [flat[i * 2], flat[i * 2 + 1]]);
    const c = p.kconf;
    const ok = (...idx) => idx.every((i) => c[i] >= KP_MIN);

    const ls = k[L_SHOULDER], rs = k[R_SHOULDER];
    const smid = [(ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2];
    const sw = ok(L_SHOULDER, R_SHOULDER) ? dist(ls, rs) : 0;
    let torso = 0;
    if (ok(L_HIP, R_HIP, L_SHOULDER, R_SHOULDER)) {
      torso = dist([(k[L_HIP][0] + k[R_HIP][0]) / 2, (k[L_HIP][1] + k[R_HIP][1]) / 2], smid);
    }
    const prior = Math.max(sw * 1.9, torso * 1.35, 1e-3);
    for (const [s, e, wr] of [[L_SHOULDER, L_ELBOW, L_WRIST], [R_SHOULDER, R_ELBOW, R_WRIST]]) {
      if (ok(s, e, wr)) {
        const arm = dist(k[s], k[e]) + dist(k[e], k[wr]);
        st.reachObs = Math.max(st.reachObs * 0.999, arm * 1.15);
      }
    }
    const reach = st.reachObs <= 0 ? prior : Math.min(Math.max(st.reachObs, prior * 0.75), prior * 1.35);

    const hands = {};
    for (const [name, e, wr] of [["l", L_ELBOW, L_WRIST], ["r", R_ELBOW, R_WRIST]]) {
      const hand = [k[wr][0] + 0.22 * (k[wr][0] - k[e][0]), k[wr][1] + 0.22 * (k[wr][1] - k[e][1])];
      hands[name] = {
        x: r((hand[0] - smid[0]) / reach, 4),
        y: r((smid[1] - hand[1]) / reach, 4),
        c: r(Math.min(c[wr], c[e]), 3),
      };
    }
    const headY = ok(NOSE) ? (smid[1] - k[NOSE][1]) / reach : null;
    let lean = 0;
    if (ok(L_HIP, R_HIP, L_SHOULDER, R_SHOULDER)) {
      const hmid = [(k[L_HIP][0] + k[R_HIP][0]) / 2, (k[L_HIP][1] + k[R_HIP][1]) / 2];
      lean = (Math.atan2(smid[0] - hmid[0], hmid[1] - smid[1]) * 180) / Math.PI;
    }
    const aspect = w / h;
    const arms = [L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW, L_WRIST, R_WRIST];
    return {
      id: tr.id,
      since: r(t - st.since, 2),
      q: r(arms.reduce((s, i) => s + c[i], 0) / arms.length, 3),
      kp: k.map(([x, y], i) => [r(x / aspect, 4), r(y, 4), r(c[i], 2)]),
      reach: r(reach, 4),
      aspect: r(aspect, 4),
      shoulder: [r(smid[0] / aspect, 4), r(smid[1], 4)],
      hands,
      head_y: headY === null ? null : r(headY, 3),
      lean: r(lean, 1),
    };
  }
}
