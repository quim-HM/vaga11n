// After a round of «El preu (in)just»: play another round (unseen questions) or move on.
// Hand: hold over a button 1.2 s · mouse: click · auto-continues to the next game.
import { W, H, C, text, clamp, easeOut, campaignButton } from "../ui.js";
import { T } from "../textos.js";
import { inRect } from "../input.js";

const DWELL_S = 1.2;
const AUTO_S = 14;

export default class Mes {
  constructor(app) {
    this.app = app;
    this.needsPlayer = true;
    this.t = 0;
    this.left = app.remainingQuestions();
    this.buttons = [
      { id: "mes", x: 260, y: 470, w: 640, h: 300, p: 0 },
      { id: "seguent", x: 1020, y: 470, w: 640, h: 300, p: 0 },
    ];
  }

  enter() {}

  choose(id) {
    if (this.done) return;
    this.done = true;
    this.app.sfx.select();
    if (id === "mes") this.app.goto("preu", { continuar: true });
    else this.app.nextGame();
  }

  skip() { this.choose("seguent"); }

  update(dt) {
    this.t += dt;
    const inp = this.app.input;
    const cs = inp.cursors();
    for (const b of this.buttons) {
      const over = this.t > 0.8 && cs.some((c) => inRect(c, b.x, b.y, b.w, b.h));
      b.p = over ? b.p + dt / DWELL_S : Math.max(0, b.p - dt * 2);
      b.over = over;
      const clicked = inp.usingMouse && inp.consumeClick(b.x, b.y, b.w, b.h);
      if (b.p >= 1 || clicked) return this.choose(b.id);
    }
    if (this.t > AUTO_S) this.choose("seguent");
  }

  draw(g) {
    const a = easeOut(this.t / 0.4);
    text(g, T("mes.titol", "MÉS PREGUNTES?"), W / 2, 320, { size: 120, kind: "title", align: "center", color: C.head, alpha: a, maxW: W - 200 });
    const labels = {
      mes: [T("mes.si", "Sí, més preguntes"), T("mes.queden", "en queden {n}", { n: this.left })],
      seguent: [T("mes.no", "Següent joc ▶"), T("mes.seguent_nom", "Final de mes")],
    };
    for (const b of this.buttons) {
      const [l1, l2] = labels[b.id];
      campaignButton(g, b.x, b.y, b.w, b.h, { label: l1, sub: l2, p: clamp(b.p, 0, 1), size: 60, subSize: 36, alpha: a });
    }
    const leftS = Math.max(0, Math.ceil(AUTO_S - this.t));
    text(g, T("mes.auto", "Si no tries, seguim en {s} s", { s: leftS }), W / 2, H - 70, { size: 30, weight: 700, align: "center", color: C.inkSoft });
    const prog = {};
    for (const b of this.buttons) for (const c of this.app.input.cursors()) if (inRect(c, b.x, b.y, b.w, b.h)) prog[c.side] = clamp(b.p, 0, 1);
    this.app.drawCursors(g, { progress: prog });
  }
}
