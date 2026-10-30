// Framing hints shown to the player: what to do when the camera cannot follow him/her well (the
// measure lives in framing.js). Used by the start screen, the calibration and, as a toast, the games.
import { T } from "./textos.js";
import { C, text, panel, onCard, drawSkeleton, measure } from "./ui.js";
import { textIcon } from "./icons.js";

export function framingText(issue) {
  switch (issue) {
    case "aprop": return { title: T("enquadre.aprop", "Fes un pas enrere"), sub: T("enquadre.aprop_sub", "Has de cabre a la imatge amb les mans enlaire.") };
    case "lluny": return { title: T("enquadre.lluny", "Apropa't una mica"), sub: T("enquadre.lluny_sub", "Des d'aquí la càmera no et veu prou bé.") };
    case "dreta": return { title: T("enquadre.dreta", "Fes un pas cap a la dreta ▶"), sub: T("enquadre.costat_sub", "Posa't al mig, davant la pantalla.") };
    case "esquerra": return { title: T("enquadre.esquerra", "◀ Fes un pas cap a l'esquerra"), sub: T("enquadre.costat_sub", "Posa't al mig, davant la pantalla.") };
    case "altres": return { title: T("enquadre.altres", "Només juga una persona"), sub: T("enquadre.altres_sub", "Els altres, feu un pas enrere o a un costat.") };
    case "tapat": return { title: T("enquadre.tapat", "La càmera no et veu bé els braços"), sub: T("enquadre.tapat_sub", "Que no hi hagi res entre tu i la pantalla.") };
    default: return null;
  }
}

// Hint card centred on cx: title + one explanatory line, a campaign-red stripe on the left.
// Returns the card height.
export function drawFramingCard(g, cx, y, issue, { w = 1120, alpha = 1, titleSize = 54, subSize = 32 } = {}) {
  const t = framingText(issue);
  if (!t) return 0;
  const h = titleSize + subSize + 96;
  g.save();
  g.globalAlpha *= alpha;
  onCard(() => {
    panel(g, cx - w / 2, y, w, h, { r: 6 });
    g.fillStyle = C.band;
    g.fillRect(cx - w / 2, y, 16, h);
    textIcon(g, t.title, cx + 8, y + 40 + titleSize * 0.78, { size: titleSize, kind: "title", align: "center", color: C.ink, maxW: w - 80 });
    text(g, t.sub, cx + 8, y + h - 34, { size: subSize, weight: 700, align: "center", color: C.inkSoft, maxW: w - 80 });
  });
  g.restore();
  return h;
}

// Small toast for the games: only the title, in a slim card hanging from the top edge at cx, so it
// covers as little as possible of the game's header
export function drawFramingToast(g, cx, y, issue, { alpha = 1, size = 30 } = {}) {
  const t = framingText(issue);
  if (!t) return;
  const w = Math.min(1100, measure(g, t.title, size, "title") + 110), h = size + 30;
  g.save();
  g.globalAlpha *= alpha;
  onCard(() => {
    panel(g, cx - w / 2, y, w, h, { r: 4 });
    g.fillStyle = C.band;
    g.fillRect(cx - w / 2, y, 12, h);
    textIcon(g, t.title, cx + 6, y + h / 2 + size * 0.36, { size, kind: "title", align: "center", color: C.ink, maxW: w - 50 });
  });
  g.restore();
}

// «Així et veu la càmera»: the camera frame with the player's skeleton and the area the hands need
// (dashed; red where it leaves the frame). Only the skeleton is drawn, never the image.
// Returns the card height.
export function drawCameraView(g, x, y, w, input, { alpha = 1 } = {}) {
  const st = input.state, fm = input.framing;
  const aspect = st.aspect || 16 / 9;
  const pad = 16, capH = 34;
  const fw = w - pad * 2, fh = fw / aspect;
  const h = fh + pad * 2 + capH;
  const fx = x + pad, fy = y + pad;
  const frame = fm.last;
  const bad = frame && ["aprop", "lluny", "dreta", "esquerra"].includes(frame.issue);
  g.save();
  g.globalAlpha *= alpha;
  onCard(() => {
    panel(g, x, y, w, h, { r: 6 });
    g.fillStyle = C.paper2;
    g.fillRect(fx, fy, fw, fh);
    if (st.present && st.kp) {
      // the skeleton only inside the image (that is all the camera sees)
      g.save();
      g.beginPath(); g.rect(fx, fy, fw, fh); g.clip();
      drawSkeleton(g, st.kp, { x: fx, y: fy, w: fw, h: fh }, { color: C.ink, lw: Math.max(4, fw * 0.022), alpha: 0.85 });
      g.restore();
      if (frame) {
        // the hands' area may stick out of the image (that is the problem shown), up to the card edge
        g.save();
        g.beginPath(); g.rect(x + 3, y + 3, w - 6, fh + pad * 2 - 3); g.clip();
        const b = frame.box;
        g.setLineDash([10, 7]);
        g.lineWidth = 4;
        g.strokeStyle = bad ? C.band : C.okFill;
        g.strokeRect(fx + b.x0 * fw, fy + b.y0 * fh, (b.x1 - b.x0) * fw, (b.y1 - b.y0) * fh);
        g.setLineDash([]);
        // arm joints that should be visible but are not
        for (const side of ["l", "r"]) {
          if (!frame.hidden[side]) continue;
          const idx = side === "l" ? [7, 9] : [8, 10];
          g.strokeStyle = C.band; g.lineWidth = 4;
          for (const i of idx) {
            const k = st.kp[i];
            g.beginPath(); g.arc(fx + k[0] * fw, fy + k[1] * fh, fw * 0.05, 0, Math.PI * 2); g.stroke();
          }
        }
        g.restore();
      }
    }
    g.lineWidth = 3; g.strokeStyle = C.ink;
    g.strokeRect(fx, fy, fw, fh);
    text(g, T("enquadre.camera", "Així et veu la càmera"), x + w / 2, y + h - 12, { size: 22, weight: 700, align: "center", color: C.inkSoft, maxW: w - 24 });
  });
  g.restore();
  return h;
}
