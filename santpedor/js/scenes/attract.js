import { T } from "../textos.js";
// Attract loop: campaign poster (vagageneral.org wording/style, static type) + mirror silhouette.
// Raise a hand to start.
import { W, H, C, text, wrap, clamp, rrect, font, posterField, posterSlogan, posterTitle, privacyFooter } from "../ui.js";

const START_RAISE_S = 1.0;
// small "play with the mouse" link-button, centred under the call to play (above the privacy footer)
const MOUSE_BTN = { x: W / 2 - 190, y: 962, w: 380, h: 54 };

export default class Attract {
  constructor(app) {
    this.app = app;
    this.t = 0;
  }

  enter() {
    this.app.newSession();
    this.app.input.mouseForced = false;
  }

  update(dt) {
    this.t += dt;
    const inp = this.app.input;
    const b = MOUSE_BTN;
    if (!inp.mouseForced && inp.cameraAvailable && inp.consumeClick(b.x, b.y, b.w, b.h)) {
      inp.mouseForced = true;
      inp.mouseDown = false;
      this.app.sfx.select();
      return;
    }
    if (inp.state.present && inp.anyRaisedFor() > START_RAISE_S) {
      inp.oneArm = null;
      this.app.sfx.select();
      this.app.startSession();
    }
  }

  draw(g) {
    const app = this.app;
    const L = (app.data.final || {}).lemes || {};
    const inp = app.input;
    const present = inp.state.present;
    // campaign poster on a full-bleed field (colours: temes.js poster keys)
    posterField(g);
    // silhouette (mirror) behind the poster: shows passers-by that the installation sees them
    app.drawSilhouette(g, { alpha: 1, lw: 46, color: C.fieldSil });

    posterSlogan(g, L.dalt || T("final.dalt", "VIURE ENS COSTA LA VIDA"), W / 2, 0, 100);
    const yb = posterTitle(g, L.titol || T("final.titol", "VAGA GENERAL"), L.data || T("final.data", "11 DE NOVEMBRE"), 110, 205, W - 220, { size: 230, subSize: 96 });
    if (L.crida) wrap(g, L.crida, W / 2, Math.min(yb + 92, 770), 1600, { size: 50, weight: 700, align: "center", color: C.fieldInk });

    // call to play: outlined while nobody is there, solid once someone stands in front
    const y = 880, bw = 1100, bh = 120;
    g.fillStyle = present ? C.ctaBg : C.field;
    rrect(g, W / 2 - bw / 2, y - bh / 2, bw, bh, 4); g.fill();
    g.lineWidth = 6; g.strokeStyle = C.ctaBg === C.field ? C.fieldInk : C.ctaBg; g.stroke();
    const msg = !present ? T("inici.posa_t_davant_la", "POSA'T DAVANT LA PANTALLA")
      : inp.usingMouse ? T("inici.mante_clic", "MANTÉN PREMUT EL CLIC PER JUGAR")
      : T("inici.aixeca_una_ma_per", "AIXECA UNA MÀ PER JUGAR");
    let size = 54;
    font(g, size, "poster");
    while (size > 30 && g.measureText(msg).width > bw - 80) { size -= 2; font(g, size, "poster"); }
    text(g, msg, W / 2, y + size * 0.37, { size, kind: "poster", align: "center", color: present ? C.ctaFg : C.fieldInk });
    // hold feedback on the call itself: the active colour wipes in from the left (as campaign buttons)
    const p = present ? clamp(inp.anyRaisedFor() / START_RAISE_S, 0, 1) : 0;
    if (p > 0) {
      const hot = C.btnHot !== C.ctaBg ? C.btnHot : C.cardInk;
      g.save();
      g.beginPath(); g.rect(W / 2 - bw / 2, y - bh / 2, bw * p, bh); g.clip();
      g.fillStyle = hot; g.fillRect(W / 2 - bw / 2, y - bh / 2, bw, bh);
      text(g, msg, W / 2, y + size * 0.37, { size, kind: "poster", align: "center", color: C.btnHotText });
      g.restore();
    }
    if (present) {
      const side = inp.raisedSide();
      const prog = side ? { [side]: clamp(inp.anyRaisedFor() / START_RAISE_S, 0, 1) } : null;
      app.drawCursors(g, { alpha: 0.95, progress: prog });
    }
    // mouse option: offered while a camera works; forced automatically when there is none
    const mb = MOUSE_BTN;
    if (inp.mode !== "sim") {
      if (!inp.cameraAvailable) {
        text(g, T("inici.sense_camera", "Sense càmera: es juga amb el ratolí"), W / 2, y + 100, { size: 28, weight: 700, align: "center", color: C.fieldSoft });
        // why there is no camera (busy, no permission, unplugged…), so the team can fix it on the spot
        if (inp.cameraOk === false && inp.cameraError) text(g, inp.cameraError, W / 2, y + 140, { size: 24, align: "center", color: C.fieldSoft, maxW: W - 240 });
      } else if (!inp.mouseForced) {
        // secondary action: outlined, quieter than the call to play
        g.save();
        g.lineWidth = 3; g.strokeStyle = C.fieldSoft; rrect(g, mb.x, mb.y, mb.w, mb.h, 4); g.stroke();
        g.restore();
        text(g, T("inici.juga_ratoli", "Juga amb el ratolí"), mb.x + mb.w / 2, mb.y + 37, { size: 28, weight: 700, align: "center", color: C.fieldSoft });
      } else {
        text(g, T("inici.mode_ratoli", "Mode ratolí activat"), W / 2, y + 100, { size: 28, weight: 700, align: "center", color: C.fieldSoft });
      }
    }
    privacyFooter(g, 1, { onField: true });
  }
}
