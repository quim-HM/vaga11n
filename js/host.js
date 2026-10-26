// In-browser replacement for the Python server (vaga11n/server.py): owns the configuration, runs the
// vision loop and answers the same commands. The game window talks to it directly; operator windows
// (operador.html) reach it through a BroadcastChannel on the same origin.
import { applyUpdate, loadConfig, publicConfig, saveConfig, STORAGE_KEY } from "./vision/config.js";
import { CHANNEL } from "./link.js";
import { qrDataURL } from "./qr.js";
import { scoped } from "./lloc.js";

const CONFIG_KEY = scoped(STORAGE_KEY);
const DIFUSIO_KEY = scoped("vaga11n.difusio");
const OPERATOR_TIMEOUT_MS = 5000;

function storage() {
  try { return window.localStorage; } catch (e) { console.warn("localStorage unavailable", e); return null; }
}

export class LocalHost {
  // final: final-screen config (data/final.json + locality overrides); joc: the locality's
  // «Encén la vaga» defaults (lloc.json → joc3), overridden by the operator's saved settings
  constructor({ sim = false, final = null, joc = null } = {}) {
    this.mode = sim ? "sim" : "camera";
    this.store = storage();
    this.final = final;
    this.cfg = loadConfig(this.store, CONFIG_KEY, joc ? { joc } : null);
    this.subs = new Set();
    this.vision = null;
    this.operatorUntil = 0;
    this.difusio = null;           // {url, mostrar, qr} once known
    this.channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;
    if (this.channel) this.channel.onmessage = (ev) => this.command(ev.data, true);
  }

  async start() {
    await this._loadDifusio();
    if (this.mode !== "camera") return;
    if (!window.isSecureContext || !navigator.mediaDevices) {
      // getUserMedia only exists on https:// or http://localhost; file:// pages cannot use the camera
      this._publish({ type: "status", camera: false, error: "Cal obrir el joc des de https:// o http://localhost per fer servir la càmera" });
      return;
    }
    const { BrowserVision } = await import("./vision/vision.js");
    this.vision = new BrowserVision(this.cfg, (msg) => this._publish(msg));
    this.vision.onPreview = (blob) => { if (this.channel && this._operatorActive()) this.channel.postMessage({ type: "preview", blob }); };
    await this.vision.start();
  }

  // --- link interface (same as WsLink) ---------------------------------------------------------
  subscribe(fn) {
    this.subs.add(fn);
    // asynchronous, like a server greeting: lets the caller finish wiring its handlers first
    setTimeout(() => {
      fn({ type: "_open" });
      fn(this._hello());
      if (this.difusio && this.difusio.local) fn(this._difusioMsg());
    }, 0);
    return () => this.subs.delete(fn);
  }

  send(obj) { this.command(obj, false); }

  // ---------------------------------------------------------------------------------------------
  _hello() { return { type: "hello", mode: this.mode, joc: { ...this.cfg.joc } }; }

  _operatorActive() { return performance.now() < this.operatorUntil; }

  // to the game (in-page subscribers) and, while an operator page is open, to it as well
  _publish(msg, toOperator = this._operatorActive()) {
    for (const fn of this.subs) fn(msg);
    if (toOperator && this.channel) this.channel.postMessage(msg);
  }

  _toOperator(msg) { if (this.channel) this.channel.postMessage(msg); }

  command(cmd, fromOperator) {
    if (!cmd || typeof cmd !== "object") return;
    const kind = cmd.cmd;
    if (kind === "hello") {
      const first = !this._operatorActive() || !!cmd.first;
      this.operatorUntil = performance.now() + OPERATOR_TIMEOUT_MS;
      if (this.vision) this.vision.previewUntil = cmd.preview ? performance.now() + OPERATOR_TIMEOUT_MS : 0;
      if (first) {
        this._toOperator(this._hello());
        this._toOperator(this._configMsg());
        this._toOperator(this._difusioMsg());
        if (this.vision) this._toOperator(this.vision.info());
      }
    } else if (kind === "get_config") {
      const msg = this._configMsg();
      if (fromOperator) this._toOperator(msg); else for (const fn of this.subs) fn(msg);
    } else if (kind === "config") {
      const applied = applyUpdate(this.cfg, cmd.set || {});
      if (cmd.save && this.store) saveConfig(this.cfg, this.store, CONFIG_KEY);
      this._applyRuntime(applied);
      this._publish({ ...this._configMsg(), applied }, true);
    } else if (kind === "difusio") {
      this._setDifusio(cmd.url, cmd.mostrar !== false);
      this._publish(this._difusioMsg(), true);
    }
  }

  _configMsg() { return { type: "config", config: publicConfig(this.cfg), joc: { ...this.cfg.joc } }; }

  _applyRuntime(applied) {
    const v = this.vision;
    if (!v) return;
    const cam = applied.camera || {};
    if ("device_id" in cam) v.openCamera();
    else if ("auto_exposure" in cam || "exposure" in cam) v.applyExposure().then(() => this._publish(v.info(), true));
    const pose = applied.pose || {};
    if ("model" in pose) v.startPose();
    else if ("num_poses" in pose) v.updatePoseOptions();
  }

  // --- broadcast channel link + QR on the final screen (data/final.json -> difusio) -------------
  async _loadDifusio() {
    let base = (this.final && this.final.difusio) || null;
    if (!base) {
      try {
        const r = await fetch("data/final.json", { cache: "no-store" });
        if (r.ok) base = (await r.json()).difusio || {};
      } catch (e) {
        console.warn("final.json", e);
      }
    }
    base = base || {};
    // the QR is drawn from the link, so each locality's link gets its own code (img/qr.png is a fallback)
    let qr = base.qr || null;
    if (base.url) {
      try { qr = qrDataURL(base.url); } catch (e) { console.warn("QR", e); }
    }
    this.difusio = { url: base.url || null, mostrar: base.mostrar !== false && !!base.url, qr, local: false };
    try {
      const saved = this.store && JSON.parse(this.store.getItem(DIFUSIO_KEY) || "null");
      if (saved && typeof saved === "object") this._setDifusio(saved.url, saved.mostrar, false);
    } catch (e) {
      console.warn("saved difusio ignored", e);
    }
  }

  // Empty url or mostrar=false hides the panel on the final screen (as vaga11n/difusio.py)
  _setDifusio(url, mostrar, save = true) {
    url = String(url || "").trim() || null;
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    let qr = null;
    if (url) {
      try { qr = qrDataURL(url); } catch (e) { console.warn("QR", e); }
    }
    this.difusio = { url, mostrar: !!(mostrar && url), qr, local: true };
    if (save && this.store) this.store.setItem(DIFUSIO_KEY, JSON.stringify({ url, mostrar: this.difusio.mostrar }));
  }

  _difusioMsg() {
    const d = this.difusio || {};
    return { type: "difusio", url: d.url || null, mostrar: !!d.mostrar, qr: d.qr || null };
  }
}
