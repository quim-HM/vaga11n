// After a round of «El preu (in)just»: play another round (unseen questions) or move on.
// Hand: hold over a button 2 s (after a short reading time) · mouse: click · auto-continues to the next game (bar at the bottom).
import { W, H, C, LAYOUT, text, clamp, easeOut, campaignButton } from "../ui.js";
import { T } from "../textos.js";
import { inRect } from "../input.js";
import { GAMES } from "../app.js";
import { drawAutoBar } from "../hand.js";
import { N_QUESTIONS } from "../games/preu.js";

// Guarded against choosing by accident (the buttons are big and central, and the hands are often
// already there): a reading time first, a hand already over a button must leave it before it counts,
// and a longer hold than elsewhere.
const DWELL_S = 2.0;
const MIN_S = 2.5;
const AUTO_S = 12;

export default class Mes {
  constructor(app) {
    this.app = app;
    this.needsPlayer = true;
    this.t = 0;
    this.left = app.remainingQuestions();
    this.buttons = [
      { id: "mes", x: 260, y: 470, w: 640, h: 300, p: 0, armed: false },
      { id: "seguent", x: 1020, y: 470, w: 640, h: 300, p: 0, armed: false },
    ];
  }

  enter() {}

  // the hand raised to resume from the pause must leave the buttons before it counts
  onResume() { for (const b of this.buttons) { b.armed = false; b.p = 0; } }

  // b = the button picked by hand or click (acknowledged on it); none when it moves on by itself
  choose(id, b = null) {
    if (this.done) return;
    this.done = true;
    if (b) this.app.ack({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    if (id === "mes") this.app.goto("preu", { continuar: true });
    else this.app.nextGame();
  }

  skip() { this.choose("seguent"); }

  update(dt) {
    this.t += dt;
    const inp = this.app.input;
    const cs = inp.cursors();
    for (const b of this.buttons) {
      const inside = cs.some((c) => inRect(c, b.x, b.y, b.w, b.h));
      if (!inside) b.armed = true;
      const over = inside && b.armed && this.t > MIN_S;
      b.p = over ? b.p + dt / DWELL_S : Math.max(0, b.p - dt * 2);
      b.over = over;
      const clicked = inp.usingMouse && this.t > MIN_S && inp.consumeClick(b.x, b.y, b.w, b.h);
      if (b.p >= 1 || clicked) return this.choose(b.id, b);
    }
    if (this.t > AUTO_S) this.choose("seguent");
  }

  draw(g) {
    const a = easeOut(this.t / 0.4);
    text(g, T("mes.titol", "MÉS PREGUNTES?"), W / 2, 320, { size: 110, kind: "title", align: "center", color: C.head, alpha: a, maxW: W - 200 });
    // this screen only follows «El preu (in)just»: the next game is the one after it in the list
    const next = GAMES[GAMES.findIndex((gm) => gm.id === "preu") + 1];
    const labels = {
      mes: [T("mes.si", "Sí, més preguntes"), T("mes.queden", "{n} preguntes més", { n: Math.min(N_QUESTIONS, this.left) })],
      seguent: [T("mes.no", "Següent joc ▶"), next ? next.title : ""],
    };
    for (const b of this.buttons) {
      const [l1, l2] = labels[b.id];
      campaignButton(g, b.x, b.y, b.w, b.h, { label: l1, sub: l2, p: clamp(b.p, 0, 1), size: 54, subSize: 36, alpha: a });
    }
    // if nobody chooses, it moves on by itself when the bar is full
    drawAutoBar(g, W / 2 - 300, LAYOUT.footY - 18, 600, this.t / AUTO_S);
    const prog = {};
    for (const b of this.buttons) for (const c of this.app.input.cursors()) if (inRect(c, b.x, b.y, b.w, b.h)) prog[c.side] = clamp(b.p, 0, 1);
    this.app.drawCursors(g, { progress: prog });
  }
}
