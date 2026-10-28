// End of session: campaign poster (vagageneral.org wording/style), a short encouragement from the
// manifest (quote + «Exigim» list, data/final.json → anim) and the broadcast-channel QR. No scores.
// Unsigned on purpose. Texts live in data/final.json.
import { W, H, C, LAYOUT, text, wrap, panel, clamp, easeOut, measure, Particles, posterField, posterSlogan, posterTitle, posterBlock } from "../ui.js";
import { drawFooterHint } from "../hand.js";

// The poster field uses its own ink (C.fieldInk): draw shared helpers with C.ink = fieldInk
function onField(fn) {
  const ink = C.ink;
  C.ink = C.fieldInk;
  try { fn(); } finally { C.ink = ink; }
}
import { GAMES } from "../app.js";
import { T } from "../textos.js";
import { qrDataURL } from "../qr.js";

const DUR_FULL = 30;
const DUR_SHORT = 8;
const RESTART_AFTER_S = 8;

let qrImg = null;
// The QR is drawn from the link (each locality has its own); a fixed image (qr) is only a fallback
function qrSource(dif) {
  if (dif.qr_propi) return dif.qr_propi;
  if (dif.url) {
    try { return qrDataURL(dif.url); } catch (e) { console.warn("QR", e); }
  }
  return dif.qr || null;
}
function loadQr(src) {
  if (!src) return;
  qrImg = new Image();
  qrImg.onerror = () => { qrImg.failed = true; };
  qrImg.src = src.startsWith("data:") ? src : src + "?v=" + Date.now();
}

export default class Final {
  constructor(app, params) {
    this.app = app;
    this.reason = params.reason || "done";
    this.t = 0;
    this.fx = new Particles();
    this.results = app.session.results;
    this.played = GAMES.filter((g) => this.results[g.id] && !this.results[g.id].skipped);
    this.short = this.reason === "timeout" && this.played.length === 0;
    this.cfg = app.data.final || {};
    const dif = this.cfg.difusio || {};
    loadQr(qrSource(dif));
  }

  enter() {
    if (!this.short) { this.app.sfx.cheer(); this.fx.burst(W * 0.35, 260, 90, [C.fieldInk, C.titleFg, C.card]); }
  }

  update(dt) {
    this.t += dt;
    this.fx.update(dt);
    const dur = this.short ? DUR_SHORT : DUR_FULL;
    const inp = this.app.input;
    const raised = this.t > RESTART_AFTER_S && inp.state.present && inp.anyRaisedFor() > 1.0;
    if (raised || this.t > dur) {
      if (raised) this.app.ack();
      this.app.newSession();
      this.app.goto("attract");
    }
  }

  skip() { this.app.newSession(); this.app.goto("attract"); }

  draw(g) {
    const app = this.app;
    const L = this.cfg.lemes || {};
    const d = this.cfg.difusio || {};
    const a = (t0) => clamp(easeOut((this.t - t0) / 0.5), 0, 1);
    const showQr = d.mostrar !== false && !!(d.url || d.qr_propi);
    // poster on a full-bleed field: left column when the QR panel is shown, centred otherwise
    // (the logo-disc style is centred inside the left column)
    posterField(g);
    const colW = showQr ? 1100 : W - 220;
    const mid = showQr && !!C.disc;
    const cx = !showQr ? W / 2 : mid ? 110 + colW / 2 : 110, al = showQr && !mid ? "left" : "center";
    posterSlogan(g, L.dalt || T("final.dalt", "VIURE ENS COSTA LA VIDA"), cx, 0, 80, { align: al, maxW: showQr && !C.daltBg ? colW : W - 220, alpha: a(0.1) });
    const yb = posterTitle(g, L.titol || T("final.titol", "VAGA GENERAL"), L.data || T("final.data", "11 DE NOVEMBRE"), 110, 165, colW,
      { size: showQr ? (C.disc ? 150 : 180) : (C.disc ? 170 : 200), subSize: showQr ? 84 : 90, align: al, alpha: a(0.3) });
    const textW = showQr ? colW : 1500;
    let y = yb + 64;
    if (L.crida) y += wrap(g, L.crida, cx, y, textW, { size: 44, weight: 700, color: C.fieldInk, alpha: a(0.6), lineH: 1.15, align: al, maxLines: 2 });
    if (this.short) return;

    // encouragement from the campaign manifest (data/final.json → anim): a short quote and what we demand
    const A = this.cfg.anim || {};
    if (A.frase) {
      y += 34;
      const h = wrap(g, A.frase, cx, y, textW, { size: 38, color: C.fieldInk, alpha: a(1.0), lineH: 1.2, align: al, maxLines: 2 });
      y += h - 38 * 0.2;
      if (A.font) { text(g, T("final.cita_font", "— {font}", { font: A.font }), cx, y + 6, { size: 22, weight: 700, color: C.fieldSoft, alpha: a(1.0), align: al, maxW: textW }); y += 30; }
    }
    const items = Array.isArray(A.exigim) ? A.exigim.slice(0, 3) : [];
    if (items.length) {
      y += 62;
      // label as a campaign highlight block, then one demand per line with a square bullet
      posterBlock(g, A.exigim_titol || T("final.exigim", "Exigim"), cx, y, 34, { bg: C.hl, fg: C.hlText, align: al, alpha: a(1.3) });
      y += 58;
      // centred layout: the list is one left-aligned block centred as a whole (bullets stay in a column)
      const size = 36, listW = Math.min(textW, Math.max(...items.map((it) => measure(g, it, size, "body", 700))) + 34);
      const x0 = al === "center" ? cx - listW / 2 : cx;
      items.forEach((it, i) => {
        const ai = a(1.45 + i * 0.12);
        g.save(); g.globalAlpha *= ai; g.fillStyle = C.fieldInk;
        g.fillRect(x0, y + i * 52 - size * 0.355 - 8, 16, 16);
        g.restore();
        text(g, it, x0 + 34, y + i * 52, { size, weight: 700, color: C.fieldInk, alpha: ai, maxW: textW - 34 });
      });
      // pointer to the full list of demands: under the QR panel when there is one (the footer row
      // belongs to the restart prompt), otherwise below the list but never inside the footer
      if (A.mes_info && !showQr) {
        const iy = Math.min(y + items.length * 52 + 14, LAYOUT.footY - 30);
        text(g, A.mes_info, al === "center" ? cx : x0, iy, { size: 30, weight: 700, color: C.fieldSoft, alpha: a(1.8), align: al === "center" ? "center" : "left", maxW: textW });
      }
    }

    // broadcast channel + QR (optional)
    if (showQr) {
      const bx = 1310, by = 165, bw = 500, bh = 620;   // top aligned with the poster title block
      if (A.mes_info && !this.short) wrap(g, A.mes_info, bx + bw / 2, by + bh + 64, bw, { size: 30, weight: 700, color: C.fieldSoft, alpha: a(1.8), align: "center", maxLines: 2, lineH: 1.2 });
      g.save(); g.globalAlpha = a(1.0);
      panel(g, bx, by, bw, bh, { fill: C.card, stroke: C.cardAccent, lw: 6, r: 6, shadow: false });
      text(g, (d.titol || T("final.canal", "Canal de difusió")).toUpperCase(), bx + bw / 2, by + 66, { size: 34, kind: "poster", align: "center", color: C.cardAccent, maxW: bw - 40 });
      const qs = 400, qx = bx + (bw - qs) / 2, qy = by + 96;
      if (qrImg && qrImg.complete && !qrImg.failed && qrImg.naturalWidth) {
        g.imageSmoothingEnabled = false;
        g.fillStyle = "#FFFFFF"; g.fillRect(qx - 6, qy - 6, qs + 12, qs + 12);
        g.drawImage(qrImg, qx, qy, qs, qs);
      } else {
        g.setLineDash([14, 10]); g.strokeStyle = C.cardInkSoft; g.lineWidth = 4;
        g.strokeRect(qx, qy, qs, qs); g.setLineDash([]);
        text(g, T("final.qr", "QR"), qx + qs / 2, qy + qs / 2 + 20, { size: 60, kind: "poster", align: "center", color: C.cardInkSoft });
      }
      const handle = d.subtitol || (d.url || "").replace(/^https?:\/\//, "");
      wrap(g, handle, bx + bw / 2, qy + qs + 64, bw - 40, { size: 32, weight: 700, align: "center", maxLines: 2, color: C.cardInk });
      g.restore();
    }

    // restart prompt in the footer centre (icon fills while the hand is up); the corners are the ◀ ▶ shortcuts
    if (this.t > RESTART_AFTER_S) {
      const inp = this.app.input;
      onField(() => drawFooterHint(g, T("final.reinicia", "Aixeca la mà per tornar a començar"), clamp(inp.anyRaisedFor() / 1.0, 0, 1), { mouse: inp.usingMouse, size: 34, waitT: this.t - RESTART_AFTER_S }));
    }
    this.fx.draw(g);
    app.drawCursors(g, { alpha: 0.7 });
  }
}
