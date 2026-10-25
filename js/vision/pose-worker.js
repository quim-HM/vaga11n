// Pose detection worker (MediaPipe Pose Landmarker, Apache-2.0, vendored in web/vendor/mediapipe).
// Runs off the main thread so inference never stalls the game's animation.
// Protocol: in  {type:"init", model, delegate, numPoses, minDetection, minPresence, minTracking}
//               {type:"frame", bitmap: ImageBitmap, ts}   (bitmap is transferred and closed here)
//               {type:"options", ...same keys as init}
//               {type:"reset"}   (forget the tracked person so the detector looks again)
//           out {type:"ready", delegate} | {type:"error", message} | {type:"result", ms, poses}
// poses: one Float32Array per person with 33 × (x, y, visibility), x/y normalized to the frame.
import { FilesetResolver, PoseLandmarker } from "../../vendor/mediapipe/vision_bundle.mjs";

const WASM = new URL("../../vendor/mediapipe/wasm", import.meta.url).href;
const MODELS = new URL("../../models/", import.meta.url).href;

let landmarker = null;
let lastTs = -1;

function options(m) {
  const o = {};
  if (m.numPoses !== undefined) o.numPoses = m.numPoses;
  if (m.minDetection !== undefined) o.minPoseDetectionConfidence = m.minDetection;
  if (m.minPresence !== undefined) o.minPosePresenceConfidence = m.minPresence;
  if (m.minTracking !== undefined) o.minTrackingConfidence = m.minTracking;
  return o;
}

function detectBlank() {
  const blank = new OffscreenCanvas(64, 64);
  blank.getContext("2d").fillRect(0, 0, 64, 64);
  lastTs += 1;
  landmarker.detectForVideo(blank, lastTs);
}

async function init(m) {
  // useModule: the ES-module build of the Wasm loader, the only one that loads in a module worker
  const fileset = await FilesetResolver.forVisionTasks(WASM, true);
  const modelAssetPath = `${MODELS}pose_landmarker_${m.model === "lite" ? "lite" : "full"}.task`;
  let lastErr = null;
  // GPU (WebGL2) first; the CPU (WASM) delegate works everywhere but is slower
  for (const delegate of m.delegate === "CPU" ? ["CPU"] : ["GPU", "CPU"]) {
    try {
      landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: "VIDEO",
        outputSegmentationMasks: false,
        ...options(m),
      });
      // Warm-up: the first inference compiles the GPU shaders (seconds on some machines). Doing it
      // here keeps the "loading" status on screen until the detector is really ready.
      detectBlank();
      return delegate;
    } catch (e) {
      lastErr = e;
      console.warn(`[pose] delegate ${delegate} failed`, e);
    }
  }
  throw lastErr || new Error("PoseLandmarker unavailable");
}

self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.type === "init") {
    try {
      const delegate = await init(m);
      self.postMessage({ type: "ready", delegate });
    } catch (e) {
      self.postMessage({ type: "error", message: String((e && e.message) || e) });
    }
  } else if (m.type === "options") {
    if (landmarker) await landmarker.setOptions(options(m));
  } else if (m.type === "reset") {
    // An empty frame ends MediaPipe's tracking, so the next frame runs the person detector again
    if (landmarker) {
      try { detectBlank(); } catch (e) { console.warn("[pose] reset failed", e); }
    }
  } else if (m.type === "frame") {
    const bitmap = m.bitmap;
    if (!landmarker) { bitmap.close(); self.postMessage({ type: "result", ms: 0, poses: [] }); return; }
    // VIDEO mode requires strictly increasing timestamps
    const ts = Math.max(m.ts, lastTs + 1);
    lastTs = ts;
    const t0 = performance.now();
    let poses = [];
    try {
      const res = landmarker.detectForVideo(bitmap, ts);
      poses = (res.landmarks || []).map((lm) => {
        const a = new Float32Array(lm.length * 3);
        lm.forEach((p, i) => { a[i * 3] = p.x; a[i * 3 + 1] = p.y; a[i * 3 + 2] = p.visibility ?? 1; });
        return a;
      });
    } catch (e) {
      console.warn("[pose] detect failed", e);
    } finally {
      bitmap.close();
    }
    self.postMessage({ type: "result", ms: performance.now() - t0, poses }, poses.map((a) => a.buffer));
  }
};
