// Input abstraction layer: games never see the vision system, only this API.
// Sources: live camera (in-browser vision through LocalHost, or the Python vision process through a
// WebSocket link), recorded skeletons (Python replay mode) or simulation (mouse + keyboard, no camera).
import { W, H, clamp } from "./ui.js";

// Reach-space -> screen mapping. Reach space: origin at shoulders, unit = arm reach, y up.
export const MAP = { xHalf: 1.0, yTop: 0.95, yBottom: -0.5 };

export function reachToScreen(hx, hy) {
  return {
    x: W / 2 + (hx / MAP.xHalf) * (W / 2),
    y: H * (MAP.yTop - hy) / (MAP.yTop - MAP.yBottom),
  };
}

export function screenToReach(x, y) {
  return {
    x: ((x - W / 2) / (W / 2)) * MAP.xHalf,
    y: MAP.yTop - (y / H) * (MAP.yTop - MAP.yBottom),
  };
}

const MIN_CONF = 0.3;
const STALE_S = 0.6;
const CAMERA_OK_S = 1.0;     // continuous camera data needed to (re)enter camera mode
const CAMERA_LOST_S = 6.0;   // camera outage needed to fall back to mouse mode

export class Input {
  constructor({ sim = false, link = null } = {}) {
    this.mode = sim ? "sim" : "connecting";
    this.connected = false;
    this.raw = null;           // latest pose message
    this.rawAt = 0;
    this.oneArm = null;        // null | "l" | "r"
    this.active = "r";
    this._activeCand = null;
    this._activeCandT = 0;
    this.raisedT = { l: 0, r: 0 };
    this.state = this._emptyState();
    this.sim = { x: W * 0.65, y: H * 0.45, present: true, otherUp: false, moved: false };
    this.keys = new Set();
    this.mouseForced = false;      // chosen on the start screen ("Juga amb el ratolí")
    this.mouseDown = false;        // in mouse mode, holding the button = "raising a hand"
    this._mouseMode = true;        // sticky camera/mouse decision (see usingMouse)
    this._camT = 0;
    this._lostT = 0;
    this.clicks = [];              // pointer clicks in logical coordinates, consumed by scenes
    this.cameraOk = null;          // last camera status reported by the host
    this.cameraError = null;       // human-readable reason when there is no camera
    this.lastPoseAt = -1e9;
    this.onServerMessage = null;  // set by the app: hello/config/difusio messages
    this._setupSim();
    // Always connect: even in simulation the host sends theme/territory configuration
    this.link = link;
    if (link) link.subscribe((msg) => this._onMessage(msg));
  }

  _emptyState() {
    return { present: false, seat: null, kp: null, hands: null, cursors: { l: null, r: null },
      headY: null, lean: 0, quality: 0, people: 0, fps: 0, ms: 0, cands: [], aspect: 16 / 9, reach: 1, shoulder: [0.5, 0.4] };
  }

  _onMessage(msg) {
    if (msg.type === "_open") { this.connected = true; return; }
    if (msg.type === "_close") {
      this.connected = false;
      if (this.mode !== "sim") this.mode = "connecting";
      return;
    }
    if (msg.type === "hello") {
      if (this.mode !== "sim") this.mode = msg.mode;
      if (this.onServerMessage) this.onServerMessage(msg);
      return;
    }
    if (msg.type === "pose") {
      this.cameraOk = true;
      this.cameraError = null;
      this.lastPoseAt = performance.now() / 1000;
      if (this.mode !== "sim") { this.raw = msg; this.rawAt = this.lastPoseAt; }
      return;
    }
    if (msg.type === "status") { this.cameraOk = msg.camera !== false; this.cameraError = msg.error || null; return; }
    if (this.onServerMessage) this.onServerMessage(msg);
  }

  get isSim() { return this.mode === "sim"; }

  // Mouse control: explicit simulation, chosen by the player, or no camera available
  get cameraAvailable() {
    return this.mode === "camera" && this.cameraOk !== false && performance.now() / 1000 - this.lastPoseAt < 3;
  }

  // Sticky mode with hysteresis, so texts and icons never flip between «Aixeca la mà» and «Mantén el
  // clic» on a short camera hiccup or reconnection: camera mode needs 1 s of continuous camera data and
  // mouse mode only kicks in after CAMERA_LOST_S without it.
  get usingMouse() { return this.mode === "sim" || this.mouseForced || this._mouseMode; }

  _updateMode(dt) {
    if (this.cameraAvailable) {
      this._camT += dt; this._lostT = 0;
      if (this._camT >= CAMERA_OK_S) this._mouseMode = false;
    } else {
      this._lostT += dt; this._camT = 0;
      if (this._lostT >= CAMERA_LOST_S) this._mouseMode = true;
    }
  }

  consumeClick(x, y, w, h) {
    const i = this.clicks.findIndex((c) => c.x >= x && c.x <= x + w && c.y >= y && c.y <= y + h);
    if (i < 0) return false;
    this.clicks.splice(i, 1);
    return true;
  }

  _setupSim() {
    window.addEventListener("mousemove", (e) => {
      const r = document.getElementById("stage").getBoundingClientRect();
      const s = Math.min(r.width / W, r.height / H);
      const ox = (r.width - W * s) / 2, oy = (r.height - H * s) / 2;
      this.sim.x = (e.clientX - r.left - ox) / s;
      this.sim.y = (e.clientY - r.top - oy) / s;
      this.sim.moved = true;
    });
    const toLogical = (e) => {
      const r = document.getElementById("stage").getBoundingClientRect();
      const s = Math.min(r.width / W, r.height / H);
      return { x: (e.clientX - r.left - (r.width - W * s) / 2) / s, y: (e.clientY - r.top - (r.height - H * s) / 2) / s };
    };
    window.addEventListener("pointerdown", (e) => {
      this.mouseDown = true;
      const p = toLogical(e);
      this.clicks.push({ ...p, t: performance.now() });
      if (this.clicks.length > 5) this.clicks.shift();
    });
    window.addEventListener("pointerup", () => { this.mouseDown = false; });
    window.addEventListener("blur", () => { this.mouseDown = false; });
    window.addEventListener("keydown", (e) => { this.keys.add(e.code); });
    window.addEventListener("keyup", (e) => { this.keys.delete(e.code); });
  }

  // Simulated pose message built from the mouse (right hand) and Enter key (left hand raised)
  _simMessage() {
    const r = screenToReach(this.sim.x, this.sim.y);
    const left = this.keys.has("Enter") ? { x: -0.25, y: 0.95, c: 1 } : { x: -0.35, y: -0.85, c: 1 };
    const hands = { r: { x: r.x, y: r.y, c: 1 }, l: left };
    const aspect = 16 / 9, reach = 0.42, sh = [0.5, 0.42];
    const toKp = (hx, hy) => [sh[0] + (hx * reach) / aspect, sh[1] - hy * reach, 1];
    const kp = new Array(17).fill(null);
    kp[0] = toKp(0, 0.33); kp[1] = toKp(-0.05, 0.37); kp[2] = toKp(0.05, 0.37); kp[3] = toKp(-0.1, 0.35); kp[4] = toKp(0.1, 0.35);
    kp[5] = toKp(-0.22, 0); kp[6] = toKp(0.22, 0);
    const elbow = (side, h) => { const s = side === "l" ? -0.22 : 0.22; return toKp((s + h.x) / 2 + s * 0.3, h.y / 2 - 0.1); };
    kp[7] = elbow("l", left); kp[8] = elbow("r", hands.r);
    kp[9] = toKp(left.x, left.y); kp[10] = toKp(hands.r.x, hands.r.y);
    kp[11] = toKp(-0.16, -0.62); kp[12] = toKp(0.16, -0.62);
    kp[13] = toKp(-0.17, -1.12); kp[14] = toKp(0.17, -1.12);
    kp[15] = toKp(-0.18, -1.6); kp[16] = toKp(0.18, -1.6);
    return { type: "pose", present: this.sim.present, seat: this.sim.present ? 1 : null, people: this.sim.present ? 1 : 0,
      fps: 60, ms: 0, cands: [],
      player: this.sim.present ? { id: 1, q: 1, kp, hands, reach, aspect, shoulder: sh, head_y: 0.33, lean: 0 } : undefined };
  }

  toggleSimPresence() { this.sim.present = !this.sim.present; }

  update(dt) {
    const now = performance.now() / 1000;
    this._updateMode(dt);
    let msg = null;
    // stale clicks are dropped after 0.5 s so they never trigger something later by surprise
    this.clicks = this.clicks.filter((c) => performance.now() - c.t < 500);
    if (this.usingMouse) msg = this._simMessage();
    else if (this.raw && now - this.rawAt < STALE_S) msg = this.raw;
    const st = this._emptyState();
    if (msg) {
      st.people = msg.people || 0; st.fps = msg.fps || 0; st.ms = msg.ms || 0; st.cands = msg.cands || [];
      const p = msg.player;
      if (msg.present && p) {
        st.present = true; st.seat = msg.seat; st.kp = p.kp; st.hands = p.hands; st.headY = p.head_y;
        st.lean = p.lean || 0; st.quality = p.q; st.aspect = p.aspect || 16 / 9; st.reach = p.reach; st.shoulder = p.shoulder;
        for (const side of ["l", "r"]) {
          const h = p.hands[side];
          if (this.oneArm && side !== this.oneArm) continue;
          if (h && h.c >= MIN_CONF) {
            const s = reachToScreen(h.x, h.y);
            st.cursors[side] = { x: s.x, y: s.y, hx: h.x, hy: h.y, side };
          }
        }
      }
    }
    this.state = st;
    this._updateActive(dt);
    for (const side of ["l", "r"]) this.raisedT[side] = this.isRaised(side) ? this.raisedT[side] + dt : 0;
  }

  _updateActive(dt) {
    if (this.usingMouse) { this.active = "r"; return; }
    if (this.oneArm) { this.active = this.oneArm; return; }
    const { l, r } = this.state.cursors;
    if (!l && !r) return;
    if (!this.state.cursors[this.active]) { this.active = l ? "l" : "r"; return; }
    const other = this.active === "l" ? "r" : "l";
    const a = this.state.cursors[this.active], o = this.state.cursors[other];
    // Switch to the other hand only when it is clearly higher for a moment (hysteresis)
    if (o && o.hy > a.hy + 0.3) {
      this._activeCandT += dt;
      if (this._activeCandT > 0.35) { this.active = other; this._activeCandT = 0; }
    } else this._activeCandT = 0;
  }

  // Hand above the head (mouse mode: holding the mouse button also counts as raising the hand)
  isRaised(side) {
    if (side === "r" && this.usingMouse && this.mouseDown) return true;
    const c = this.state.cursors[side];
    if (!c) return false;
    const head = this.state.headY ?? 0.3;
    return c.hy > Math.max(0.55, head + 0.15);
  }

  anyRaisedFor() { return Math.max(this.raisedT.l, this.raisedT.r); }

  raisedSide() {
    if (this.raisedT.l === 0 && this.raisedT.r === 0) return null;
    return this.raisedT.l >= this.raisedT.r ? "l" : "r";
  }

  primary() { return this.state.cursors[this.active] || this.state.cursors.l || this.state.cursors.r || null; }

  secondary() {
    if (this.oneArm) return null;
    const other = this.active === "l" ? "r" : "l";
    return this.state.cursors[other];
  }

  cursors() { return ["l", "r"].map((s) => this.state.cursors[s]).filter(Boolean); }

  // Map a normalized camera keypoint into screen space consistently with the cursors
  kpToScreen(k) {
    const st = this.state;
    const hx = ((k[0] - st.shoulder[0]) * st.aspect) / st.reach;
    const hy = (st.shoulder[1] - k[1]) / st.reach;
    return reachToScreen(hx, hy);
  }
}

// Dwell-to-activate helper: progress grows while inside, decays when outside.
export class Dwell {
  constructor(time = 1.0, decay = 1.5) { this.time = time; this.decay = decay; this.p = 0; this.done = false; }
  update(dt, inside) {
    if (this.done) return 1;
    this.p = clamp(this.p + (inside ? dt / this.time : -dt * this.decay), 0, 1);
    if (this.p >= 1) this.done = true;
    return this.p;
  }
  reset() { this.p = 0; this.done = false; }
}

export function inCircle(c, x, y, r) { return c && (c.x - x) ** 2 + (c.y - y) ** 2 <= r * r; }
export function inRect(c, x, y, w, h) { return c && c.x >= x && c.x <= x + w && c.y >= y && c.y <= y + h; }
