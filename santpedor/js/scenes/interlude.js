import { T } from "../textos.js";
// Short rest between games: what comes next and how to play it. Continue by raising a hand.
import { W, C, text, wrap, ring, easeOut, clamp, posterBlock } from "../ui.js";
import { GAMES } from "../app.js";
import { textIcon } from "../icons.js";
import { drawRaiseIcon } from "../hand.js";

const AUTO_S = 10;
const MIN_S = 3;   // reading time before a raised hand moves on
const RAISE_S = 0.6;
// Evaluated at draw time so data/textos.json overrides apply. Pattern for every game: «what» = what it
// means (60 px), «how» = the goal or the gesture (44 px). Detailed controls are taught inside each game.
const INFO = {
  preu: () => ({ what: T("interludi.preu.que", "Posem xifres a com hem arribat fins aquí"), how: T("interludi.preu.com", "Mira d'acostar-te el màxim a la xifra real") }),
  // the control depends on how you are playing: two hands tilt the line, one hand is followed
  finaldemes: (app) => ({
    what: T("interludi.finaldemes.que", "Aconsegueix arribar a final de mes al llarg dels anys"),
    how: app && (app.input.usingMouse || app.input.oneArm)
      ? T("interludi.finaldemes.com_una", "Puja i baixa la mà i mantén-te dins els marges dels preus")
      : T("interludi.finaldemes.com", "Inclina les mans i mantén-te dins els marges dels preus"),
  }),
  encen: () => ({ what: T("interludi.encen.que", "Organitza la vaga, barri a barri"), how: T("interludi.encen.com", "Mou les mans sense parar per tot el mapa per organitzar la vaga al teu entorn") }),
};

export default class Interlude {
  constructor(app, params) {
    this.app = app;
    this.params = params;
    this.needsPlayer = true;
    this.t = 0;
    this.nextT = 0;
  }
  enter() {}
  update(dt) {
    this.t += dt;
    const inp = this.app.input;
    // a hand still up from the previous screen must come down first
    if (inp.anyRaisedFor() === 0) this.armed = true;
    if (this.t > MIN_S && this.armed) this.nextT = inp.anyRaisedFor() > 0 ? this.nextT + dt : Math.max(0, this.nextT - 2 * dt);
    if (this.nextT > RAISE_S || (this.t > MIN_S && inp.keys.has("Space"))) { this.app.ack(); this.app.goto(this.params.game.id); }
    else if (this.t > AUTO_S) this.app.goto(this.params.game.id);
  }
  skip() { this.app.goto(this.params.game.id); }
  // the hand raised to resume from the pause must come down before it counts here
  onResume() { this.armed = false; this.nextT = 0; }
  draw(g) {
    const { game, index } = this.params;
    const info = INFO[game.id] ? INFO[game.id](this.app) : { what: "", how: "" };
    const a = easeOut(this.t / 0.5);
    posterBlock(g, `${index + 1} / ${GAMES.length}`, W / 2, 196, 56, { bg: C.hl, fg: C.hlText, align: "center", alpha: a });
    text(g, game.title, W / 2, 420, { size: 160, kind: "title", align: "center", color: C.head, alpha: a, maxW: W - 200 });
    // long descriptions break after a colon («Qui dia passa, any empeny: …») into two lines
    const parts = String(info.what).split(/:\s+/);
    let wy = 530;
    if (parts.length > 1) {
      text(g, parts[0] + ":", W / 2, 510, { size: 56, weight: 800, align: "center", alpha: a, maxW: W - 200 });
      text(g, parts.slice(1).join(": "), W / 2, 578, { size: 46, weight: 700, align: "center", alpha: a, maxW: W - 200 });
      wy = 578;
    } else {
      text(g, info.what, W / 2, 530, { size: 60, weight: 800, align: "center", alpha: a, maxW: W - 200 });
    }
    textIcon(g, info.how, W / 2, wy + 96, { size: 44, weight: 700, align: "center", color: C.ink, alpha: a, maxW: W - 200 });
    if (this.t > MIN_S) {
      text(g, T("interludi.aixeca_la_ma_quan", "Aixeca la mà quan estiguis a punt"), W / 2, 860, { size: 44, weight: 700, align: "center" });
      drawRaiseIcon(g, W / 2, 960, 46, clamp(this.nextT / RAISE_S, 0, 1), { mouse: this.app.input.usingMouse, waitT: this.t - MIN_S });
    } else {
      text(g, T("interludi.descansa_els_bracos_un", "Descansa els braços un moment"), W / 2, 860, { size: 40, align: "center", color: C.inkSoft });
    }
    this.app.drawCursors(g, { alpha: 0.7 });
  }
}
