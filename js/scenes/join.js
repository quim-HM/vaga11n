import { T } from "../textos.js";
// Welcome + quick calibration/tutorial: place the hands on two hand-shaped targets to learn the cursors.
// Also lets the player switch to one-arm mode.
import { W, H, C, text, wrap, ring, clamp, Particles, campaignButton } from "../ui.js";
import { Dwell, inCircle, inRect, reachToScreen } from "../input.js";
import { drawHand } from "../hand.js";
import { drawOkBadge } from "../icons.js";
import { drawFramingCard, drawCameraView } from "../framehint.js";

const MAX_S = 16;
// While the player is badly placed for the camera (framing.js) the calibration waits up to this much
// longer, so the games do not start with someone who cannot reach the screen
const MAX_WAIT_S = 20;
// «Així et veu la càmera», top right corner, clear of the right target (and its dwell ring)
const VIEW = { x: W - 40 - 280, y: 22, w: 280 };

export default class Join {
  constructor(app) {
    this.app = app;
    this.needsPlayer = true;
    this.t = 0;
    this.fx = new Particles();
    this.place();
    this.armBtn = { x: W / 2, y: reachToScreen(0, -0.2).y, w: 520, h: 120, dwell: new Dwell(1.3) };
    this.doneT = null;
    this.waitT = 0;
  }

  place() {
    const one = this.app.input.oneArm;
    const pts = one ? [one === "l" ? [-0.55, 0.55] : [0.55, 0.55], one === "l" ? [-0.75, 0.0] : [0.75, 0.0]]
      : [[-0.75, 0.5], [0.75, 0.5]];
    this.stars = pts.map(([hx, hy]) => ({ ...reachToScreen(hx, hy), r: 85, dwell: new Dwell(0.5), done: false }));
  }

  enter() {}

  update(dt) {
    this.t += dt;
    this.fx.update(dt);
    const inp = this.app.input;
    const cs = inp.cursors();
    for (const s of this.stars) {
      if (s.done) continue;
      s.dwell.update(dt, cs.some((c) => inCircle(c, s.x, s.y, s.r)));
      if (s.dwell.done) { s.done = true; this.app.sfx.coin(); this.fx.burst(s.x, s.y, 30); }
    }
    // one-arm toggle button
    const b = this.armBtn;
    const over = cs.find((c) => inRect(c, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h));
    b.dwell.update(dt, !!over);
    if (b.dwell.done) {
      inp.oneArm = inp.oneArm ? null : (over ? over.side : inp.active);
      this.app.session.oneArm = inp.oneArm;
      b.dwell = new Dwell(1.3, 3);
      b.cool = 1.5;
      this.app.ack({ x: b.x, y: b.y });
      this.place();
    }
    if (b.cool) { b.cool -= dt; if (b.cool > 0) b.dwell.p = 0; else b.cool = 0; }
    if (this.framingIssue()) this.waitT += dt;
    const limit = MAX_S + Math.min(this.waitT, MAX_WAIT_S);
    if (this.doneT === null && (this.stars.every((s) => s.done) || this.t > limit)) { this.doneT = 0; this.app.sfx.good(); }
    if (this.doneT !== null) {
      this.doneT += dt;
      if (this.doneT > 1.4) this.app.nextGame();
    }
  }

  skip() { this.app.nextGame(); }

  // camera players only: the mouse never needs placing
  framingIssue() { return this.app.input.usingMouse ? null : this.app.input.framing.issue; }

  draw(g) {
    const app = this.app, inp = app.input;
    text(g, T("hola.hola", "HOLA!"), W / 2, 150, { size: 110, kind: "title", align: "center", color: C.head });
    const issue = this.doneT === null ? this.framingIssue() : null;
    const msg = this.doneT !== null ? T("hola.molt_be_comencem", "Molt bé! Comencem.") : inp.oneArm ? T("hola.diana_una", "Col·loca la mà als cercles") : T("hola.diana_dues", "Col·loca les mans als cercles");
    if (!issue) text(g, msg, W / 2, 240, { size: 60, weight: 800, align: "center" });
    app.drawSilhouette(g, { alpha: 0.18, lw: 40 });
    for (const s of this.stars) {
      handTarget(g, s.x, s.y, s.r, s.done, s.x < W / 2 ? "l" : "r");
      if (!s.done && s.dwell.p > 0) ring(g, s.x, s.y, s.r + 14, s.dwell.p, { color: C.teal });
    }
    const b = this.armBtn;
    // one-arm toggle: campaign button; holding fills it (when active it is full and drains instead)
    const label = inp.oneArm ? T("hola.mode_un_brac_activat", "Mode un braç: activat") : T("hola.jugo_amb_un_sol", "Jugo amb un sol braç");
    const p = inp.oneArm ? 1 - b.dwell.p : b.dwell.p;
    campaignButton(g, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, { label, p, size: 36 });
    wrap(g, T("hola.tambe_es_pot_jugar", "Es pot jugar assegut."), W / 2, H - 110, 1500, { size: 32, align: "center", color: C.inkSoft });
    this.fx.draw(g);
    // camera players: what the camera sees, and what to do when it cannot see them well
    if (!inp.usingMouse) drawCameraView(g, VIEW.x, VIEW.y, VIEW.w, inp);
    if (issue) drawFramingCard(g, W / 2, 190, issue, { w: 1060 });
    const over = inp.cursors().find((c) => inRect(c, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h));
    app.drawCursors(g, { progress: over ? { [over.side]: clamp(b.dwell.p, 0, 1) } : null });
    app.drawPrivacy(g, 0.8);
  }
}

// Calibration target: a dashed ring in the theme's headline colour with a hand inside ("put your
// hand here"), optically centred; once reached it becomes the teal ✓ badge.
function handTarget(g, x, y, r, done, side) {
  g.save();
  if (done) {
    drawOkBadge(g, x, y, r * 0.8);
  } else {
    g.fillStyle = C.paper2; g.globalAlpha = 0.85;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    g.setLineDash([14, 10]); g.lineWidth = 6; g.strokeStyle = C.head;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    // the hand shape's visual centre sits ~0.2 units above its anchor and ~0.17 towards the thumb
    const hs = r * 0.52;
    const dx = (side === "l" ? -0.17 : 0.17) * hs, dy = 0.21 * hs;
    drawHand(g, x + dx, y + dy, hs, { fill: C.head, stroke: C.paper2, side });
  }
  g.restore();
}
