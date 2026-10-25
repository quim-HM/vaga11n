import { App } from "./app.js";
import { Input } from "./input.js";
import { loadData } from "./data.js";
import { sfx } from "./audio.js";
import { loadTexts } from "./textos.js";
import { applyTheme, DEFAULT_THEME } from "./temes.js";
import { LocalHost } from "./host.js";
import { WsLink } from "./link.js";

// ?servidor=1: legacy mode, the Python server (python -m vaga11n) runs the camera and the pose model.
// Otherwise everything runs in this page: camera, pose model (MediaPipe in a worker) and settings.
function createLink(params) {
  if (params.has("servidor")) return new WsLink(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  const host = new LocalHost({ sim: params.has("sim") });
  host.start().catch((e) => console.error("[vaga11n] host", e));
  return host;
}

// Offline copy for venues without internet (on https; ?offline=1 enables it on localhost for testing)
function registerServiceWorker(params) {
  if (!("serviceWorker" in navigator) || params.has("servidor")) return;
  if (location.protocol !== "https:" && !params.has("offline")) return;
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("service worker", e));
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const canvas = document.getElementById("stage");
  registerServiceWorker(params);
  await Promise.all([
    document.fonts.load('400 40px "Archivo"'),
    document.fonts.load('700 40px "Archivo"'),
    document.fonts.load('800 40px "Archivo"'),
    document.fonts.load('900 80px "Arial Black"'),
  ]).catch((e) => console.warn("fonts", e));
  await loadTexts();
  const data = await loadData();
  applyTheme(params.get("tema") || DEFAULT_THEME);
  await data.loadGeoLevels({});
  const input = new Input({ sim: params.has("sim"), link: createLink(params) });
  const app = new App(canvas, input, data);
  input.onServerMessage = (msg) => app.onServerMessage(msg);
  window.app = app; // handy for debugging from the console
  window.addEventListener("keydown", (e) => { sfx.unlock(); app.onKey(e); });
  window.addEventListener("pointerdown", () => sfx.unlock());
  // Show the system pointer briefly when the mouse moves in camera mode (e.g. to click
  // "Juga amb el ratolí"); in mouse mode the drawn hand is the pointer.
  let cursorTimer = null;
  window.addEventListener("mousemove", () => {
    if (input.usingMouse) { document.body.classList.remove("show-cursor"); return; }
    document.body.classList.add("show-cursor");
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => document.body.classList.remove("show-cursor"), 3000);
  });
  await app.goto(params.get("scene") || "attract");
  document.getElementById("boot").classList.add("hidden");
  app.preloadScenes().catch((e) => console.warn("preload", e));
  let last = performance.now();
  let errors = 0;
  const frame = (now) => {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    try {
      app.update(dt);
      app.draw();
    } catch (e) {
      // Never let a single bad frame kill the installation; log and fall back to the attract loop.
      console.error(e);
      if (++errors > 30) { errors = 0; app.newSession(); app.goto("attract"); }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  document.getElementById("boot").textContent = "Error en carregar el joc: " + e.message;
});
