// Browser vision loop: webcam -> pose worker (MediaPipe) -> tracking -> active player -> the same JSON
// "pose" messages the Python version (vaga11n/vision.py) sends over its WebSocket.
//
// Privacy: frames live only in memory. The optional preview for the operator page is drawn on demand
// at low resolution and is never stored or sent anywhere outside this browser.
import { PlayerSelector, Tracker, shoulderWidth } from "./player.js";
import { toPersons } from "./landmarks.js";

const SKELETON = [[5, 7], [7, 9], [6, 8], [8, 10], [5, 6], [5, 11], [6, 12], [11, 12],
  [11, 13], [13, 15], [12, 14], [14, 16], [0, 5], [0, 6]];
const PREVIEW_W = 640;
// With num_poses = 1 MediaPipe keeps tracking whoever it found first. If that person stays outside the
// play zone (or too far) for this long, its tracking is reset so the detector looks for someone else.
const REDETECT_AFTER_S = 1.0;

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

function cameraError(e) {
  const n = e && e.name;
  if (n === "NotAllowedError" || n === "SecurityError") return "Cal donar permís al navegador per fer servir la càmera";
  if (n === "NotFoundError" || n === "OverconstrainedError") return "No s'ha trobat cap càmera. Comprova el cable USB";
  if (n === "NotReadableError" || n === "AbortError") return "La càmera està ocupada per una altra aplicació (Teams, Zoom, Càmera…)";
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return "Aquest navegador no pot fer servir la càmera (cal https o localhost)";
  return `No s'ha pogut obrir la càmera (${(e && e.message) || e})`;
}

export class BrowserVision {
  constructor(cfg, emit) {
    this.cfg = cfg;
    this.emit = emit;            // (msg) -> void, for every pose/status/info message
    this.onPreview = null;       // (Blob) -> void, operator preview frames
    this.previewUntil = 0;       // performance.now() deadline renewed by the operator page
    this.tracker = new Tracker();
    this.selector = new PlayerSelector(cfg);
    this.video = null;
    this.stream = null;
    this.worker = null;
    this.ready = false;
    this.busy = false;
    this.busySince = 0;
    this.delegate = null;
    this.poseError = null;
    this.cameraErr = null;
    this.devices = [];
    this.exposure = { supported: false };
    this.fps = 0; this.camFps = 0; this.inferMs = 0;
    this._n = 0; this._t0 = performance.now(); this._camN = 0; this._camT0 = performance.now();
    this._ineligibleT = 0; this._lastT = null;
    this._lastPreview = 0;
    this._gen = 0;               // camera generation: stale callbacks of a closed camera stop themselves
    this._retry = null;
  }

  async start() {
    this.startPose();
    await this.openCamera();
    setInterval(() => this._heartbeat(), 1000);
  }

  info() {
    const s = this.video;
    return {
      type: "info",
      provider: this.delegate ? `MediaPipe ${this.delegate}` : null,
      delegate: this.delegate,
      pose_error: this.poseError,
      camera_error: this.cameraErr,
      devices: this.devices,
      device_label: this.stream ? (this.stream.getVideoTracks()[0] || {}).label || "" : "",
      resolution: s && s.videoWidth ? [s.videoWidth, s.videoHeight] : null,
      exposure: this.exposure,
    };
  }

  // --- pose worker -------------------------------------------------------------------------------
  startPose() {
    if (this.worker) this.worker.terminate();
    this.ready = false; this.busy = false; this.delegate = null; this.poseError = null;
    const p = this.cfg.pose;
    const w = new Worker(new URL("./pose-worker.js", import.meta.url), { type: "module" });
    this.worker = w;
    w.onmessage = (ev) => this._onWorker(ev.data);
    w.onerror = (ev) => { this.poseError = `Error del detector de postura: ${ev.message || "desconegut"}`; this.emit(this.info()); };
    w.postMessage({ type: "init", model: p.model, delegate: p.delegate, ...this._poseOptions() });
  }

  _poseOptions() {
    const p = this.cfg.pose;
    return { numPoses: Math.max(1, Math.min(4, Math.round(p.num_poses))), minDetection: p.score_thr, minPresence: p.score_thr, minTracking: 0.5 };
  }

  updatePoseOptions() { if (this.worker && this.ready) this.worker.postMessage({ type: "options", ...this._poseOptions() }); }

  _onWorker(m) {
    if (m.type === "ready") {
      this.ready = true; this.delegate = m.delegate;
      console.info(`[vaga11n] Model de postura: MediaPipe ${m.delegate}`);
      this.emit(this.info());
    } else if (m.type === "error") {
      this.poseError = m.message;
      console.error("[vaga11n] pose", m.message);
      this.emit(this.info());
    } else if (m.type === "result") {
      this.busy = false;
      this._process(m.poses, m.ms);
    }
  }

  // --- camera ------------------------------------------------------------------------------------
  closeCamera() {
    this._gen++;
    clearTimeout(this._retry);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) { this.video.srcObject = null; this.video = null; }
  }

  async openCamera() {
    this.closeCamera();
    const gen = this._gen;
    const c = this.cfg.camera;
    const video = { width: { ideal: c.width }, height: { ideal: c.height }, frameRate: { ideal: 30 } };
    if (c.device_id) video.deviceId = { exact: c.device_id };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (e) {
      if (c.device_id && (e.name === "OverconstrainedError" || e.name === "NotFoundError")) {
        // the saved camera is not connected: use the default one instead of showing no image
        try { stream = await navigator.mediaDevices.getUserMedia({ video: { ...video, deviceId: undefined }, audio: false }); } catch (e2) { e = e2; }
      }
      if (!stream) { this._cameraFailed(e, gen); return; }
    }
    if (gen !== this._gen) { stream.getTracks().forEach((t) => t.stop()); return; }
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.autoplay = true;
    v.srcObject = stream;
    try { await v.play(); } catch (e) { console.warn("[vaga11n] video.play", e); }
    if (gen !== this._gen) { stream.getTracks().forEach((t) => t.stop()); return; }
    this.stream = stream; this.video = v; this.cameraErr = null;
    const track = stream.getVideoTracks()[0];
    track.addEventListener("ended", () => { if (gen === this._gen) this._cameraFailed(new Error("S'ha perdut el senyal de la càmera"), gen); });
    console.info(`[vaga11n] Càmera connectada: ${track.label}`);
    await this.refreshDevices();
    await this.applyExposure();
    this.emit(this.info());
    this._loop(gen);
  }

  _cameraFailed(e, gen) {
    if (gen !== this._gen) return;
    this.cameraErr = cameraError(e);
    console.warn("[vaga11n]", this.cameraErr, e);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null; this.video = null;
    this.emit({ type: "status", camera: false, error: this.cameraErr });
    this.emit(this.info());
    // keep retrying: the camera may be plugged in later, or the permission granted
    this._retry = setTimeout(() => { if (gen === this._gen) this.openCamera(); }, 2000);
  }

  async refreshDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      this.devices = all.filter((d) => d.kind === "videoinput").map((d, i) => ({ id: d.deviceId, label: d.label || `Càmera ${i + 1}` }));
    } catch (e) {
      console.warn("[vaga11n] enumerateDevices", e);
    }
  }

  // Manual exposure through MediaStreamTrack constraints (Chrome/Edge, if the webcam driver allows it).
  // The operator value keeps the Windows-driver scale: exposure = log2(seconds), e.g. -6 = 1/64 s.
  async applyExposure() {
    const track = this.stream && this.stream.getVideoTracks()[0];
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    const modes = caps.exposureMode || [];
    this.exposure = { supported: modes.includes("manual") && !!caps.exposureTime, modes };
    if (!track || !modes.length) return;
    const c = this.cfg.camera;
    try {
      if (c.auto_exposure || !this.exposure.supported) {
        if (modes.includes("continuous")) await track.applyConstraints({ advanced: [{ exposureMode: "continuous" }] });
      } else {
        const t100us = Math.pow(2, c.exposure) * 10000;   // exposureTime is in units of 100 µs
        const t = Math.min(caps.exposureTime.max, Math.max(caps.exposureTime.min, t100us));
        await track.applyConstraints({ advanced: [{ exposureMode: "manual", exposureTime: t }] });
        this.exposure.time = t;
      }
    } catch (e) {
      console.warn("[vaga11n] exposure", e);
    }
  }

  // --- frame loop --------------------------------------------------------------------------------
  _loop(gen) {
    const v = this.video;
    const onFrame = () => {
      if (gen !== this._gen || !this.video) return;
      this._camN++;
      this._send();
      schedule();
    };
    let lastTime = -1;
    const schedule = () => {
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(onFrame);
      else setTimeout(() => { if (v.currentTime !== lastTime) { lastTime = v.currentTime; onFrame(); } else schedule(); }, 10);
    };
    schedule();
  }

  _send() {
    const now = performance.now();
    if (this.busy && now - this.busySince > 2000) this.busy = false;   // worker hiccup: never stall forever
    if (this.busy || !this.ready || !this.video || !this.video.videoWidth) return;
    this.busy = true; this.busySince = now;
    createImageBitmap(this.video).then((bitmap) => {
      this.worker.postMessage({ type: "frame", bitmap, ts: performance.now() }, [bitmap]);
    }).catch((e) => { this.busy = false; console.warn("[vaga11n] frame", e); });
  }

  _process(poses, ms) {
    const v = this.video;
    if (!v || !v.videoWidth) return;
    const w = v.videoWidth, h = v.videoHeight;
    const t = performance.now() / 1000;
    const dt = this._lastT === null ? 0 : t - this._lastT;
    this._lastT = t;
    this.inferMs = ms;
    const persons = toPersons(poses, w, h, this.cfg.camera.mirror);
    const tracks = this.tracker.update(persons, t);
    const player = this.selector.update(tracks, t, w);
    const msg = {
      type: "pose",
      t: Math.round(Date.now()) / 1000,
      present: player !== null && player !== undefined,
      seat: this.selector.state.trackId,
      people: tracks.length,
      fps: r1(this.fps),
      cam: r1(this.camFps),
      ms: r1(ms),
    };
    if (msg.present) msg.player = this.selector.features(player, t, w, h);
    msg.cands = tracks.map((tr) => ({
      id: tr.id,
      box: tr.person.box.map((b, i) => r3(b / (i % 2 ? h : w))),
      sw: r3(shoulderWidth(tr.person) / w),
      s: Math.round(tr.person.score * 100) / 100,
      ok: this.selector.eligible(tr, w) > 0,
    }));
    this.emit(msg);

    // single-pose mode: release a tracked person who is not a valid player
    if (this.cfg.pose.num_poses <= 1 && tracks.length && !msg.present && !msg.cands.some((c) => c.ok)) {
      this._ineligibleT += dt;
      if (this._ineligibleT > REDETECT_AFTER_S) { this._ineligibleT = 0; this.worker.postMessage({ type: "reset" }); }
    } else this._ineligibleT = 0;

    this._n++;
    const now = performance.now();
    if (now - this._t0 >= 1000) { this.fps = (this._n * 1000) / (now - this._t0); this._n = 0; this._t0 = now; }
    if (this.onPreview && now < this.previewUntil && now - this._lastPreview > 120) {
      this._lastPreview = now;
      this._renderPreview(tracks, player ? player.id : null);
    }
  }

  _heartbeat() {
    const now = performance.now();
    this.camFps = (this._camN * 1000) / Math.max(1, now - this._camT0);
    this._camN = 0; this._camT0 = now;
    if (!this.stream) this.emit({ type: "status", camera: false, error: this.cameraErr });
    else if (!this.ready) this.emit({ type: "status", camera: true, error: this.poseError || "Carregant el detector de postura…" });
  }

  // --- operator preview --------------------------------------------------------------------------
  _renderPreview(tracks, playerId) {
    const v = this.video;
    const k = PREVIEW_W / v.videoWidth;
    const w = PREVIEW_W, h = Math.round(v.videoHeight * k);
    if (!this._pc || this._pc.width !== w || this._pc.height !== h) {
      this._pc = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    }
    const g = this._pc.getContext("2d");
    g.save();
    if (this.cfg.camera.mirror) { g.translate(w, 0); g.scale(-1, 1); }
    g.drawImage(v, 0, 0, w, h);
    g.restore();
    const p = this.cfg.player;
    const x0 = p.zone_x_min * w, x1 = p.zone_x_max * w;
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(0, 0, x0, h); g.fillRect(x1, 0, w - x1, h);
    g.strokeStyle = "rgb(255,200,0)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0, h); g.moveTo(x1, 0); g.lineTo(x1, h); g.stroke();
    g.font = "13px sans-serif";
    for (const tr of tracks) {
      const pr = tr.person, sel = tr.id === playerId;
      const color = sel ? "rgb(200,16,46)" : "rgb(160,160,160)";
      g.strokeStyle = color; g.fillStyle = color; g.lineWidth = sel ? 3 : 1;
      const b = pr.box.map((x) => x * k);
      g.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
      g.fillText(`#${tr.id} ${pr.score.toFixed(2)}`, b[0] + 4, b[1] + 16);
      g.lineWidth = 2;
      g.beginPath();
      for (const [a, c] of SKELETON) {
        if (pr.kconf[a] > 0.3 && pr.kconf[c] > 0.3) { g.moveTo(pr.kpts[a][0] * k, pr.kpts[a][1] * k); g.lineTo(pr.kpts[c][0] * k, pr.kpts[c][1] * k); }
      }
      g.stroke();
    }
    g.fillStyle = "#fff";
    g.fillText(`${this.fps.toFixed(0)} fps  ${this.inferMs.toFixed(0)} ms  MediaPipe ${this.delegate || "—"}`, 8, h - 10);
    const done = (blob) => { if (blob && this.onPreview) this.onPreview(blob); };
    if (this._pc.convertToBlob) this._pc.convertToBlob({ type: "image/jpeg", quality: 0.7 }).then(done).catch((e) => console.warn(e));
    else this._pc.toBlob(done, "image/jpeg", 0.7);
  }
}
