// Framing check: is the player placed so the camera can follow the whole game?
// Pure module (no DOM; unit-tested under Node): it only reads the pose message fields.
//
// The games map the hands through "reach space" (input.js MAP): a hand at 0.95 reaches above the
// shoulders touches the top of the screen, ±1 reach the sides. Whatever the size of the player, the
// hands can only drive the whole screen if that reach area fits inside the camera frame. So instead of
// fixed distances (that depend on the camera, the lens and the player), the check measures the player
// against the frame:
//   - aprop:     the area the wrists must reach leaves the frame at the top/bottom (or both sides);
//   - lluny:     the player is so small in the frame that tracking gets noisy and may drop him/her;
//   - dreta / esquerra: the area leaves the frame on one side only → step towards that side;
//   - altres:    somebody else overlaps the player in the image;
//   - tapat:     an arm joint is inside the frame, where it is used, but the detector cannot see it.
//
// Coordinates: kp / shoulder / boxes are normalized to the (mirrored) frame, x in [0,1] of the width
// and y in [0,1] of the height (down); reach is in frame-height units (vision/player.js).

// Most important first: the first one present is the one shown to the player
export const ISSUES = ["aprop", "lluny", "dreta", "esquerra", "altres", "tapat"];

// Wrist positions the games need, in reach units from the shoulder midpoint (the hand cursor sits
// ~0.1 reach beyond the wrist, so 0.8 up ≈ the top of the screen, 0.8 to the side ≈ its edge)
export const NEED = { up: 0.8, down: 0.35, side: 0.8 };
export const FAR_REACH = 0.17;   // reach below this (frame-height units): too small to track reliably
const TOL = 0.02;                // the frame edge itself is fine
const EDGE = 0.03;               // a joint closer than this to the edge may simply be out of the frame
const KP_MIN = 0.3;
const ARMS = { l: [5, 7, 9], r: [6, 8, 10] };   // shoulder, elbow, wrist (COCO, anatomical sides)
const OVERLAP = 0.3;             // another person's box covering this share of the smaller box

// The frame area the wrists must be able to reach. oneArm: only that side is needed.
export function playBox(shoulder, reach, aspect = 16 / 9, oneArm = null) {
  const [sx, sy] = shoulder;
  const dx = (NEED.side * reach) / aspect;
  return {
    x0: oneArm === "r" ? sx : sx - dx,
    x1: oneArm === "l" ? sx : sx + dx,
    y0: sy - NEED.up * reach,
    y1: sy + NEED.down * reach,
  };
}

const inFrame = (k) => k[0] > EDGE && k[0] < 1 - EDGE && k[1] > EDGE && k[1] < 1 - EDGE;

function overlapShare(a, b) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  const area = (r) => Math.max(1e-6, (r[2] - r[0]) * (r[3] - r[1]));
  return (w * h) / Math.min(area(a), area(b));
}

// One frame of the active player. pose: { kp, reach, shoulder, aspect } (the "player" fields of a pose
// message). cands/seat: the message's candidates and the player's track id, to spot other people.
// Returns null when there is nothing to measure.
export function measureFraming(pose, { oneArm = null, cands = null, seat = null } = {}) {
  if (!pose || !pose.kp || !pose.shoulder || !(pose.reach > 0)) return null;
  const { kp, reach, shoulder } = pose;
  const aspect = pose.aspect || 16 / 9;
  const box = playBox(shoulder, reach, aspect, oneArm);
  const margins = { top: box.y0, bottom: 1 - box.y1, left: box.x0, right: 1 - box.x1 };
  const issues = [];

  if (reach < FAR_REACH) issues.push("lluny");
  else {
    const outL = margins.left < -TOL, outR = margins.right < -TOL;
    if (margins.top < -TOL || margins.bottom < -TOL || (outL && outR)) issues.push("aprop");
    else if (outL) issues.push("dreta");      // cut on the left of the screen: move to the right
    else if (outR) issues.push("esquerra");
  }

  const me = cands && seat !== null ? cands.find((c) => c.id === seat) : null;
  if (me && me.box && cands.some((c) => c !== me && c.box && overlapShare(c.box, me.box) > OVERLAP)) issues.push("altres");

  // An arm joint the detector cannot see although it should be in the image, in the part of the body
  // that plays (above the hips: hands resting by the sides or in the pockets do not count)
  const hidden = { l: false, r: false };
  const playY = shoulder[1] + 0.45 * reach;
  for (const side of oneArm ? [oneArm] : ["l", "r"]) {
    hidden[side] = ARMS[side].some((i) => kp[i] && kp[i][2] < KP_MIN && inFrame(kp[i]) && kp[i][1] < playY);
  }
  if (hidden.l || hidden.r) issues.push("tapat");

  return { issues, issue: issues[0] || null, reach, box, margins, hidden };
}

// Nobody is playing yet (or the player was lost): is somebody in front who just stands in the wrong
// place? cands: the pose message candidates; "why" says why each one is not a valid player (petit = too
// small/far, zona = outside the play zone, amagat = shoulders not visible). Older servers do not send
// "why": then only the size is used.
export function candidateIssue(cands, { farSw = 0.06 } = {}) {
  if (!cands || !cands.length) return null;
  const notOk = cands.filter((c) => !c.ok && c.box);
  if (!notOk.length || notOk.length < cands.length) return null;   // somebody valid is there: nothing to say
  // the biggest one is the most likely to be the person trying to play
  const size = (c) => Math.max(c.sw || 0, (c.box[2] - c.box[0]) * 0.35);
  const c = notOk.reduce((a, b) => (size(b) > size(a) ? b : a));
  const cx = (c.box[0] + c.box[2]) / 2;
  const why = c.why || (c.sw > 0 && c.sw < farSw ? "petit" : null);
  if (why === "petit") return "lluny";
  if (why === "zona") return cx < 0.5 ? "dreta" : "esquerra";
  // shoulders not visible and a body covering most of the image: standing right in front of the camera
  if (why === "amagat" && c.box[2] - c.box[0] > 0.5) return "aprop";
  return null;
}

// Hysteresis over the per-frame measures, so a single noisy frame never shows a hint and a hint never
// flickers. An issue becomes active after onS seconds (accumulated) and goes away offS seconds after
// it stops being measured. issueT: how long the current issue has been shown.
export class FramingMonitor {
  constructor({ onS = 0.6, offS = 0.8 } = {}) {
    this.onS = onS; this.offS = offS;
    this.reset();
  }

  reset() {
    this.acc = Object.fromEntries(ISSUES.map((k) => [k, 0]));
    this.on = Object.fromEntries(ISSUES.map((k) => [k, false]));
    this.issue = null;
    this.issueT = 0;
    this.okT = 0;          // time with a measured player and no issue at all
    this.last = null;      // latest measureFraming() result
    this.totals = Object.fromEntries(ISSUES.map((k) => [k, 0]));   // seconds shown per issue (this session)
    this.seenT = 0;        // seconds with a measured player (this session)
  }

  // frame: measureFraming() result (player present) or null; cand: candidateIssue() when nobody plays
  update(dt, frame, cand = null) {
    this.last = frame;
    const raw = new Set(frame ? frame.issues : cand ? [cand] : []);
    for (const k of ISSUES) {
      this.acc[k] = raw.has(k) ? Math.min(this.onS, this.acc[k] + dt) : Math.max(0, this.acc[k] - dt * (this.onS / this.offS));
      if (this.acc[k] >= this.onS) this.on[k] = true;
      else if (this.acc[k] <= 0) this.on[k] = false;
    }
    const issue = ISSUES.find((k) => this.on[k]) || null;
    this.issueT = issue && issue === this.issue ? this.issueT + dt : 0;
    this.issue = issue;
    this.okT = frame && !frame.issues.length ? this.okT + dt : 0;
    if (frame) this.seenT += dt;
    if (issue) this.totals[issue] += dt;
    return issue;
  }
}
