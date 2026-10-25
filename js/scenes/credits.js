import { T } from "../textos.js";
// Data sources and technical credits (licences). The installation itself is intentionally unsigned.
import { W, H, C, text, wrap, font } from "../ui.js";

// Single line, shrunk down to minSize and then cut with an ellipsis so it never leaves the screen
function line(g, str, x, y, maxW, { size, minSize, weight = 400, color }) {
  g.save();
  let s = size;
  for (; s > minSize; s--) { font(g, s, "body", weight); if (g.measureText(str).width <= maxW) break; }
  font(g, s, "body", weight);
  let out = String(str);
  if (g.measureText(out).width > maxW) {
    while (out.length > 1 && g.measureText(out + "…").width > maxW) out = out.slice(0, -1);
    out = out.trimEnd() + "…";
  }
  g.restore();
  text(g, out, x, y, { size: s, weight, color });
}

const DUR = 30;

export default class Credits {
  constructor(app) { this.app = app; this.t = 0; this.calm = true; }
  enter() {}
  update(dt) {
    this.t += dt;
    if (this.t > DUR) this.app.goto("attract");
  }
  skip() { this.app.goto("attract"); }
  draw(g) {
    const fonts = this.app.data.fonts || [];
    text(g, T("credits.fonts_de_les_dades", "FONTS DE LES DADES"), 80, 110, { size: 72, kind: "title", color: C.head });
    const off = fonts.filter((f) => f.tipus === "oficial");
    const sec = fonts.filter((f) => f.tipus !== "oficial");
    // auto-scroll if long
    const lineH = 66;
    const total = (off.length + sec.length + 4) * lineH;
    const viewH = H - 330;
    const scroll = total > viewH ? Math.min(total - viewH, Math.max(0, (this.t - 4) * 30)) : 0;
    g.save();
    g.beginPath(); g.rect(0, 150, W, viewH); g.clip();
    let y = 200 - scroll;
    const row = (f) => {
      line(g, `${f.organisme} · ${f.titol}`, 80, y, W - 160, { size: 26, minSize: 26, weight: 700, color: C.ink });
      line(g, `${f.url || ""}   (${T("credits.consulta", "consulta")}: ${f.data_consulta || "—"})`, 80, y + 30, W - 160, { size: 20, minSize: 20, color: C.inkSoft });
      y += lineH;
    };
    if (off.length) { text(g, T("credits.fonts_oficials", "Fonts oficials"), 80, y, { size: 34, kind: "title", color: C.head }); y += 50; off.forEach(row); }
    if (sec.length) { y += 10; text(g, T("credits.fonts_secundaries", "Fonts secundàries"), 80, y, { size: 34, kind: "title", color: C.head }); y += 50; sec.forEach(row); }
    g.restore();
    // soft cut at the bottom of the scrolling list, then a rule
    const fade = g.createLinearGradient(0, 150 + viewH - 60, 0, 150 + viewH);
    fade.addColorStop(0, C.paper + "00"); fade.addColorStop(1, C.paper);
    g.fillStyle = fade; g.fillRect(0, 150 + viewH - 60, W, 60);
    g.fillStyle = C.inkSoft; g.fillRect(80, 150 + viewH + 6, W - 160, 3);
    wrap(g, T("credits.tipografies", "Tipografies: Archivo (SIL Open Font License) i Arial Black (font del sistema). Detecció de postura: RTMO (OpenMMLab, Apache-2.0), executat localment. Mapes: Institut Cartogràfic i Geològic de Catalunya (CC BY 4.0) i © col·laboradors d'OpenStreetMap (ODbL), simplificats. El joc «Encén la vaga» és una simulació lúdica i no mostra dades reals d'adhesió."),
      80, H - 140, W - 160, { size: 24, color: C.inkSoft, lineH: 1.25, maxLines: 3 });
    this.app.drawPrivacy(g, 0.8);
  }
}
