import { T, setMouseMode } from "./textos.js";
// Scene manager + session flow (attract -> join -> games with interludes -> final -> attract),
// presence monitoring (pause / relay / timeout) and operator shortcuts.
import { W, H, C, LAYOUT, text, wrap, panel, ring, drawSkeleton, clamp, easeOut, privacyFooter, onCard, onPage, font } from "./ui.js";
import { drawHandCursor } from "./hand.js";
import { sfx, setMuted, isMuted } from "./audio.js";
import { applyTheme } from "./temes.js";
import { drawCountdown } from "./countdown.js";
import { llocQuery, scoped } from "./lloc.js";
import { drawFramingToast } from "./framehint.js";

// Titles are getters so data/textos.json overrides (loaded after module evaluation) apply
export const GAMES = [
  { id: "preu", module: "./games/preu.js", get title() { return T("joc.preu", "El preu (in)just"); } },
  { id: "finaldemes", module: "./games/finaldemes.js", get title() { return T("joc.finaldemes", "Final de mes"); } },
  { id: "encen", module: "./games/encen.js", get title() { return T("joc.encen", "Encén la vaga"); } },
];

const SCENES = {
  attract: "./scenes/attract.js",
  join: "./scenes/join.js",
  interlude: "./scenes/interlude.js",
  final: "./scenes/final.js",
  credits: "./scenes/credits.js",
  mes: "./scenes/mes.js",
};
for (const g of GAMES) SCENES[g.id] = g.module;

const NAV_DWELL_S = 2.5;       // small prev/next game buttons: long dwell so they never fire by accident
const NAV_R = LAYOUT.navR;   // the shortcuts live in the footer corners (ui.js LAYOUT), never shared
const NAV_SCENES = new Set(["join", "interlude", "preu", "finaldemes", "encen", "final"]);
const PAUSE_AFTER_S = 1.5;     // player not visible -> pause
const PAUSE_TIMEOUT_S = 15;    // paused for this long -> end session
const RESUME_RAISE_S = 0.8;    // raise a hand this long to resume / take over
const TRANS_S = 0.35;          // screen change: the new screen fades in from the page colour
const ACK_S = 0.5;             // input acknowledged: a ring bursts out of the hand that did it
// Badly placed for the camera (framing.js) for this long during a game: a small hint at the top.
// Longer than in the calibration, so a quick lean or a step aside never interrupts the game.
const TOAST_AFTER_S = 2.5;

// Placeholder used while a game module is not available yet (keeps the flow testable)
class Placeholder {
  constructor(app, params) { this.app = app; this.params = params; this.t = 0; }
  enter() {}
  update(dt) { this.t += dt; if (this.t > 3) this.app.finishGame(this.params.id, { score: 0, summary: T("app.joc_no_disponible", "Joc no disponible") }); }
  draw(g) { text(g, `«${this.params.title}» encara no està disponible`, W / 2, H / 2, { size: 56, align: "center" }); }
  exit() {}
}

export class App {
  constructor(canvas, input, data) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d");
    this.input = input;
    this.data = data;
    this.sfx = sfx;
    this.time = 0;
    this.scene = null;
    this.sceneName = null;
    this.debug = new URLSearchParams(location.search).has("debug");
    this.paused = null;            // null | { t, manual }
    this.absentT = 0;
    this.modules = new Map();
    this.nav = { prev: 0, next: 0 };
    this.transT = TRANS_S;
    this.acks = [];
    this.toast = { issue: null, a: 0 };
    this.newSession();
  }

  // Feedback for a screen change (a scene, or a step inside a game: next question, next level):
  // a swish and a short fade-in. Every scene change gets it from goto().
  transition({ sound = true } = {}) {
    this.transT = 0;
    if (sound) sfx.whoosh();
  }

  // Feedback for an input that has been acknowledged (a raised hand, a dwell, a click): a confirm
  // sound and a ring bursting out of the hand that did it (or out of the given point). sound: an sfx
  // name, or null for the ring alone (when the caller already plays its own sound).
  ack({ x, y, side, sound = "select" } = {}) {
    if (sound && sfx[sound]) sfx[sound]();
    let p = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    if (!p) {
      const s = side || this.input.raisedSide();
      const c = (s && this.input.state.cursors[s]) || this.input.primary();
      if (c) p = { x: c.x, y: c.y - 10 };
    }
    if (p) this.acks.push({ x: p.x, y: p.y, t: 0 });
  }

  drawFeedback(g) {
    if (this.transT < TRANS_S) {
      g.save();
      g.globalAlpha = 0.85 * (1 - easeOut(this.transT / TRANS_S));
      g.fillStyle = C.paper;
      g.fillRect(0, 0, W, H);
      g.restore();
    }
    for (const a of this.acks) {
      const k = clamp(a.t / ACK_S, 0, 1), e = easeOut(k);
      g.save();
      g.globalAlpha = 1 - k;
      g.strokeStyle = C.teal; g.lineWidth = 12 * (1 - k) + 2;
      g.beginPath(); g.arc(a.x, a.y, 50 + 90 * e, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
  }

  newSession() {
    this.logFraming();
    this.session = { results: {}, startedAt: this.time, gameIndex: -1, oneArm: null };
    this.input.oneArm = null;
    this.input.framing.reset();
  }

  // How well placed the last player was (console, for the team tuning the floor marks and the camera)
  logFraming() {
    const f = this.input.framing;
    if (!f || f.seenT < 10) return;
    const pct = Object.entries(f.totals).filter(([, s]) => s > 0).map(([k, s]) => `${k} ${Math.round((100 * s) / f.seenT)} %`);
    console.info(`[vaga11n] Enquadrament de la partida (${Math.round(f.seenT)} s): ${pct.length ? pct.join(", ") : "sempre bé"}`);
  }

  async loadScene(name) {
    if (this.modules.has(name)) return this.modules.get(name);
    let cls = null;
    try {
      cls = (await import(SCENES[name])).default;
    } catch (e) {
      console.warn(`scene ${name} not loadable`, e);
    }
    this.modules.set(name, cls);
    return cls;
  }

  async goto(name, params = {}) {
    // Scene modules load on first use (an async import that can take several frames on a slow
    // connection). Until the new scene is in place the current one is frozen (see update), so it
    // cannot fire its transition again — e.g. the calibration calling nextGame() every frame and
    // skipping all the games — and only the latest requested scene is entered.
    const token = (this._gotoToken = (this._gotoToken || 0) + 1);
    this.switching = true;
    let Cls = await this.loadScene(name);
    if (token !== this._gotoToken) return;
    this.switching = false;
    const game = GAMES.find((g) => g.id === name);
    if (!Cls && game) { Cls = Placeholder; params = { ...params, id: game.id, title: game.title }; }
    if (!Cls) { console.error("missing scene", name); return; }
    if (this.scene && this.scene.exit) this.scene.exit();
    const first = !this.scene;
    this.sceneName = name;
    this.scene = new Cls(this, params);
    this.paused = null;
    this.absentT = 0;
    this.transition({ sound: !first });   // no swish at boot: audio is not unlocked yet
    if (this.scene.enter) this.scene.enter();
  }

  // Load every scene module in the background so later transitions are instant
  preloadScenes() {
    return Promise.all(Object.keys(SCENES).map((name) => this.loadScene(name)));
  }

  // --- session flow -------------------------------------------------------
  startSession() {
    this.newSession();
    this.goto("join");
  }

  // Called by join when calibration is done, and after each game
  nextGame() {
    this.session.gameIndex += 1;
    const g = GAMES[this.session.gameIndex];
    if (!g) { this.goto("final"); return; }
    this.goto("interlude", { game: g, index: this.session.gameIndex });
  }

  finishGame(id, result) {
    this.session.results[id] = result;
    // after «El preu (in)just», offer another round while unseen questions remain
    if (id === "preu" && !result.skipped && this.remainingQuestions() > 0) { this.goto("mes"); return; }
    this.nextGame();
  }

  remainingQuestions() {
    const asked = new Set(this.session.preuAsked || []);
    return (this.data.preguntes || []).filter((q) => !asked.has(q.id)).length;
  }

  endSession(reason = "done") {
    this.goto("final", { reason });
  }

  jumpToGame(i) {
    this.session.gameIndex = i - 1;
    this.nextGame();
  }

  get needsPlayer() { return !!(this.scene && this.scene.needsPlayer); }

  // --- main loop ----------------------------------------------------------
  update(dt) {
    this.time += dt;
    this.transT += dt;
    for (const a of this.acks) a.t += dt;
    this.acks = this.acks.filter((a) => a.t < ACK_S);
    this.input.update(dt);
    setMouseMode(this.input.usingMouse);
    this.updateFramingToast(dt);
    if (!this.scene || this.switching) return;
    if (this.needsPlayer) {
      const present = this.input.state.present;
      this.absentT = present ? 0 : this.absentT + dt;
      if (!this.paused && this.absentT > PAUSE_AFTER_S) { this.paused = { t: 0, manual: false }; sfx.meh(); }
      if (this.paused) {
        this.paused.t += dt;
        if (!this.paused.manual && present && this.input.anyRaisedFor() > RESUME_RAISE_S) {
          this.paused = null; this.ack();
          // the hand raised to resume must not also count as «continue» on the screen underneath
          if (this.scene && this.scene.onResume) this.scene.onResume();
        } else if (!this.paused.manual && this.paused.t > PAUSE_TIMEOUT_S) {
          this.endSession("timeout");
        }
        return;
      }
    }
    if (this.paused && this.paused.manual) return;
    this.updateNav(dt);
    this.scene.update(dt);
  }

  // The calibration shows its own framing hints; the start and final screens need no player
  updateFramingToast(dt) {
    const inp = this.input, f = inp.framing;
    const show = !this.paused && this.needsPlayer && this.sceneName !== "join" && !inp.usingMouse
      && inp.state.present && !!f.issue && f.issueT >= TOAST_AFTER_S;
    if (show) this.toast.issue = f.issue;
    this.toast.a = clamp(this.toast.a + (show ? dt : -dt) * 3, 0, 1);
  }

  draw() {
    const g = this.g;
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(r.width * dpr), ch = Math.round(r.height * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    const s = Math.min(cw / W, ch / H);
    // games and dense screens are drawn on the calm play surface, poster/transition screens on the field
    onPage(this.scene && this.scene.calm ? "calm" : "bg", () => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = C.paper;
      g.fillRect(0, 0, cw, ch);
      g.setTransform(s, 0, 0, s, (cw - W * s) / 2, (ch - H * s) / 2);
      g.save();
      g.beginPath(); g.rect(0, 0, W, H); g.clip();
      if (this.scene) this.scene.draw(g);
      this.drawFeedback(g);
      if (!this.paused && this.toast.a > 0) drawFramingToast(g, W / 2, 0, this.toast.issue, { alpha: easeOut(this.toast.a) });
      if (!this.paused) this.drawNav(g);
      if (this.paused) this.drawPause(g);
      if (this.debug) this.drawDebug(g);
      g.restore();
      // full-canvas effects of the scene (margins around the 16:9 stage included), in device pixels
      if (this.scene && this.scene.drawScreen && !this.paused) {
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        this.scene.drawScreen(g, cw, ch);
        g.restore();
      }
    });
  }

  drawPause(g) {
    g.save();
    g.globalAlpha = 0.9;
    g.fillStyle = C.paper;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;
    onCard(() => {
    // card sized to its content with equal top/bottom padding (70 px)
    if (this.paused.manual) panel(g, W / 2 - 620, H / 2 - 270, 1240, 360, {});
    else panel(g, W / 2 - 620, H / 2 - 289, 1240, 606, {});
    if (this.paused.manual) {
      text(g, T("app.pausa", "PAUSA"), W / 2, H / 2 - 120, { size: 110, kind: "title", align: "center", color: C.head, maxW: 1160 });
      text(g, T("app.l_equip_de_la", "L'equip de la instal·lació ha aturat el joc un moment."), W / 2, H / 2 + 10, { size: 44, align: "center", maxW: 1160 });
    } else {
      const left = Math.max(0, PAUSE_TIMEOUT_S - this.paused.t);
      const present = this.input.state.present;
      // somebody is there but not where the camera can take them as the player (framing.js)
      const fi = present || this.input.usingMouse ? null : this.input.framing.issue;
      const back = fi === "lluny" ? T("app.apropa_t_i_aixeca", "Apropa't a la pantalla i aixeca la mà")
        : fi === "aprop" ? T("app.pas_enrere_i_aixeca", "Fes un pas enrere i aixeca la mà")
        : fi === "dreta" || fi === "esquerra" ? T("app.al_mig_i_aixeca", "Posa't al mig de la pantalla i aixeca la mà")
        : T("app.torna_davant_de_la", "Torna davant de la pantalla i aixeca una mà");
      text(g, present ? T("app.continues_tu_la_partida", "Continues tu la partida?") : T("app.on_ets", "On ets?"), W / 2, H / 2 - 150, { size: 110, kind: "title", align: "center", color: C.red, maxW: 1160 });
      text(g, present ? T("app.aixeca_una_ma_per", "Aixeca una mà per continuar") : back, W / 2, H / 2 - 40, { size: 48, weight: 800, align: "center", maxW: 1160 });
      drawCountdown(g, W / 2, H / 2 + 110, left, PAUSE_TIMEOUT_S, { r: 62 });
      text(g, T("app.si_no_hi_ha", "Si no hi ha ningú, la partida s'acabarà sola."), W / 2, H / 2 + 240, { size: 32, align: "center", color: C.inkSoft, maxW: 1160 });
    }
    });
    g.restore();
    const side = this.input.raisedSide();
    this.drawCursors(g, { progress: side ? { [side]: clamp(this.input.anyRaisedFor() / RESUME_RAISE_S, 0, 1) } : null });
  }

  // Shared rendering helpers for scenes ------------------------------------
  // progress: optional { l: 0..1, r: 0..1 } dwell progress drawn as a ring around that hand
  drawCursors(g, { alpha = 1, color = C.red, progress = null } = {}) {
    const prim = this.input.primary();
    for (const c of this.input.cursors()) {
      drawHandCursor(g, c.x, c.y, { color: c === prim ? color : C.blue, alpha, r: c === prim ? 46 : 38,
        side: c.side, progress: progress ? progress[c.side] || 0 : 0 });
    }
  }

  // Draw the player's silhouette in screen space, aligned with the hand cursors
  drawSilhouette(g, { color = C.ink, alpha = 0.18, lw = 34 } = {}) {
    const st = this.input.state;
    if (!st.present || !st.kp) return;
    const kp = st.kp.map((k) => { const s = this.input.kpToScreen(k); return [s.x / W, s.y / H, k[2]]; });
    drawSkeleton(g, kp, { x: 0, y: 0, w: W, h: H }, { color, alpha, lw });
  }

  drawPrivacy(g, alpha = 1) { privacyFooter(g, alpha, { inset: NAV_SCENES.has(this.sceneName) }); }

  drawDebug(g) {
    const st = this.input.state;
    const fm = this.input.framing, fr = fm.last;
    g.save();
    g.fillStyle = "rgba(26,31,54,0.82)";
    g.fillRect(10, 10, 780, 260);
    const lines = [
      `mode: ${this.input.mode}  escena: ${this.sceneName}`,
      `present: ${st.present}  seat: ${st.seat}  persones: ${st.people}`,
      `fps: ${st.fps}  inferència: ${st.ms} ms  qualitat: ${st.quality}`,
      `mà activa: ${this.input.active}  un braç: ${this.input.oneArm || "no"}  so: ${isMuted() ? "no" : "sí"}`,
      `absent: ${this.absentT.toFixed(1)} s  pausa: ${this.paused ? this.paused.t.toFixed(1) : "-"}`,
      `enquadrament: ${fm.issue || "bé"}${fr ? `  abast ${fr.reach.toFixed(2)}  marges d${fr.margins.top.toFixed(2)} e${fr.margins.left.toFixed(2)} r${fr.margins.right.toFixed(2)} b${fr.margins.bottom.toFixed(2)}` : ""}`,
      ...(this.data.warnings || []).slice(0, 2),
    ];
    lines.forEach((ln, i) => text(g, ln, 26, 46 + i * 30, { size: 22, color: "#fff" }));
    g.restore();
    if (st.kp) {
      drawSkeleton(g, st.kp, { x: W - 340, y: H - 260, w: 320, h: 180 }, { color: C.red, lw: 4, alpha: 0.9 });
      g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(W - 340, H - 260, 320, 180);
    }
  }

  // --- previous / next game shortcuts -------------------------------------
  navButtons() {
    const all = [
      { id: "prev", x: LAYOUT.navW / 2 - 10, y: LAYOUT.navY },
      { id: "next", x: W - LAYOUT.navW / 2 + 10, y: LAYOUT.navY },
    ];
    // the final screen is the end of the session: no "next game"
    return this.sceneName === "final" ? all.filter((b) => b.id !== "next") : all;
  }

  updateNav(dt) {
    if (!NAV_SCENES.has(this.sceneName)) { this.nav.prev = this.nav.next = 0; return; }
    const cs = this.input.cursors();
    const insideOf = (b) => cs.some((c) => (c.x - b.x) ** 2 + (c.y - b.y) ** 2 <= (NAV_R + 14) ** 2);
    // after a jump, the hand must leave the buttons before they can fire again
    if (this.navLock) { if (!this.navButtons().some(insideOf)) this.navLock = false; return; }
    for (const b of this.navButtons()) {
      const inside = insideOf(b);
      const clicked = this.input.usingMouse && this.input.consumeClick(b.x - NAV_R, b.y - NAV_R, NAV_R * 2, NAV_R * 2);
      this.nav[b.id] = inside ? this.nav[b.id] + dt / NAV_DWELL_S : Math.max(0, this.nav[b.id] - dt * 2);
      if (clicked || this.nav[b.id] >= 1) {
        this.nav.prev = this.nav.next = 0;
        this.navLock = true;
        this.ack({ x: b.x, y: b.y });
        if (b.id === "next") this.gotoNextGame(); else this.gotoPrevGame();
        return;
      }
    }
  }

  // index of the game being played (or about to start in an interlude)
  currentGameIndex() {
    const gi = GAMES.findIndex((g) => g.id === this.sceneName);
    if (gi >= 0) return gi;
    if (this.sceneName === "interlude" && this.scene && this.scene.params) return this.scene.params.index;
    if (this.sceneName === "final") return GAMES.length;
    return -1;   // join
  }

  gotoNextGame() {
    const gi = this.currentGameIndex();
    if (gi + 1 >= GAMES.length) this.goto("final");
    else this.jumpToGame(gi + 1);
  }

  gotoPrevGame() {
    const gi = this.currentGameIndex();
    this.jumpToGame(Math.max(0, gi - 1));
  }

  drawNav(g) {
    if (!NAV_SCENES.has(this.sceneName)) return;
    const gi = this.currentGameIndex();
    for (const b of this.navButtons()) {
      if (b.id === "prev" && gi <= 0 && this.sceneName !== "final") continue;
      const p = this.nav[b.id];
      // opaque white disc + navy chevron (no translucent grey-on-colour); quiet because it is small
      g.save();
      g.fillStyle = C.card; g.strokeStyle = C.cardLine; g.lineWidth = 3;
      g.beginPath(); g.arc(b.x, b.y, NAV_R, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = C.cardInk;
      const d = b.id === "next" ? 1 : -1;
      // triangle with its centroid on the disc centre (tip 14, base -7)
      g.beginPath(); g.moveTo(b.x + d * 14, b.y); g.lineTo(b.x - d * 7, b.y - 13); g.lineTo(b.x - d * 7, b.y + 13); g.closePath(); g.fill();
      if (p > 0) {
        ring(g, b.x, b.y, NAV_R + 10, p, { color: C.teal, lw: 8 });
        // label above the button, in its own corner (a white pill, legible on any surface)
        const label = b.id === "next" ? T("app.nav.seguent", "Següent joc") : T("app.nav.anterior", "Joc anterior");
        font(g, 26, "body", 700);
        const tw = g.measureText(label).width + 32, ph = 44, py = b.y - NAV_R - 22 - ph;
        const px = b.id === "next" ? W - LAYOUT.m - tw : LAYOUT.m;
        g.fillStyle = C.card; g.strokeStyle = C.cardLine; g.lineWidth = 3;
        g.beginPath(); g.roundRect(px, py, tw, ph, 4); g.fill(); g.stroke();
        text(g, label, px + tw / 2, py + ph / 2 + 9, { size: 26, weight: 700, align: "center", color: C.cardInk });
      }
      g.restore();
    }
  }

  // --- server configuration (theme, territories, broadcast channel) ------------
  onServerMessage(msg) {
    if ((msg.type === "hello" || msg.type === "config") && msg.joc) this.applyJoc(msg.joc);
    else if (msg.type === "difusio" && !msg.error) {
      const d = { ...(this.data.final.difusio || {}), url: msg.url, mostrar: msg.mostrar };
      // in-browser mode generates the QR itself (a data: URL) instead of web/img/qr.png
      if (msg.qr) d.qr = msg.qr;
      this.data.final.difusio = d;
    }
  }

  applyJoc(joc) {
    const params = new URLSearchParams(location.search);
    this.joc = { ...joc };
    applyTheme(params.get("tema") || joc.tema);
    this.data.loadGeoLevels(this.joc).catch((e) => console.warn("geo levels", e));
  }

  // --- operator keyboard --------------------------------------------------
  onKey(e) {
    const k = e.key.toLowerCase();
    // scene-changing keys wait until the previous change has finished loading
    if (this.switching && "rsnc123j".includes(k)) { e.preventDefault(); return; }
    if (k === "d") this.debug = !this.debug;
    else if (k === "r") { this.newSession(); this.goto("attract"); }
    else if (k === "s" || k === "n") { if (this.scene && this.scene.skip) this.scene.skip(); else if (GAMES.some((g) => g.id === this.sceneName)) this.finishGame(this.sceneName, { score: 0, summary: T("app.saltat", "Saltat"), skipped: true }); }
    else if (k === "p") { this.paused = this.paused ? null : { t: 0, manual: true }; sfx[this.paused ? "meh" : "select"](); }
    else if (k === "u") { this.input.oneArm = this.input.oneArm ? null : (this.input.active || "r"); this.session.oneArm = this.input.oneArm; }
    else if (k === "m") setMuted(!isMuted());
    else if (k === "c") this.goto("credits");
    else if (k === "x" && this.input.usingMouse) this.input.toggleSimPresence();
    else if (k === "1" || k === "2" || k === "3") this.jumpToGame(Number(k) - 1);
    else if (k === "j") this.startSession();
    else if (k === "f") { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch((err) => console.warn(err)); }
    else if (k === "h") document.body.classList.toggle("show-cursor");
    else if (k === "o") {
      const q = [location.search.includes("servidor") ? "servidor=1" : "", llocQuery()].filter(Boolean).join("&");
      window.open(`operador.html${q ? "?" + q : ""}`, scoped("vaga11n-operador"));
    }
    else return;
    e.preventDefault();
  }
}
