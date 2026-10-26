// Browser-side configuration: the same sections as config.toml, with runtime overrides saved in
// localStorage (the browser equivalent of config.local.json). Pure module: no DOM access, so the
// unit tests run it under Node with an in-memory storage.

export const STORAGE_KEY = "vaga11n.config";

export const DEFAULTS = {
  camera: {
    device_id: "",          // "" = the browser's default camera
    width: 1280,
    height: 720,
    mirror: true,           // show the player like a mirror
    auto_exposure: true,    // set to false and tune 'exposure' if projector light makes the image flicker
    exposure: -6,           // log2 seconds (same scale as the Windows drivers: -6 = 1/64 s)
  },
  pose: {
    model: "full",          // full | lite (MediaPipe Pose Landmarker)
    num_poses: 1,           // 1 = fastest; 2 also follows a second person (passers-by), ~2x slower
    delegate: "GPU",        // GPU | CPU (GPU falls back to CPU automatically)
    score_thr: 0.5,
  },
  player: {
    // Horizontal play zone, normalized camera coordinates (0 = left edge, 1 = right edge of the mirrored image)
    zone_x_min: 0.15,
    zone_x_max: 0.85,
    // Ignore people whose shoulders look smaller than this fraction of the frame width (far away / passers-by)
    min_shoulder_width: 0.045,
    // Seconds without seeing the player before he/she is considered gone
    lost_timeout: 0.5,
  },
  filter: {
    // One Euro filter (higher min_cutoff = less lag, more jitter; higher beta = less lag on fast moves)
    min_cutoff: 1.6,
    beta: 0.6,
  },
  // ciutat / comarca / final of «Encén la vaga»: the locality's defaults (data/llocs/<id>/lloc.json →
  // joc3) are passed to loadConfig() as `base`; ciutat = "" starts the game at the comarca
  joc: {
    tema: "blau-groc-mes",
    final: "ppcc",
  },
};

// Keys that the operator page is allowed to change at runtime
export const EDITABLE = {
  player: ["zone_x_min", "zone_x_max", "min_shoulder_width", "lost_timeout"],
  filter: ["min_cutoff", "beta"],
  camera: ["auto_exposure", "exposure", "device_id"],
  pose: ["model", "num_poses"],
  joc: ["tema", "ciutat", "comarca", "final"],
};
const TEXT_KEYS = new Set(["joc.tema", "joc.ciutat", "joc.comarca", "joc.final", "camera.device_id", "pose.model"]);

const clone = (o) => JSON.parse(JSON.stringify(o));

function okType(section, key, v) {
  if (TEXT_KEYS.has(`${section}.${key}`)) return typeof v === "string" && v.length < 200;
  return typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
}

export function applyUpdate(cfg, update) {
  const applied = {};
  for (const [section, values] of Object.entries(update || {})) {
    const allowed = EDITABLE[section];
    if (!allowed || !values || typeof values !== "object") continue;
    for (const [k, v] of Object.entries(values)) {
      if (allowed.includes(k) && okType(section, k, v)) {
        (cfg[section] ||= {})[k] = v;
        (applied[section] ||= {})[k] = v;
      }
    }
  }
  return applied;
}

// key: localStorage key (one per locality, see web/js/lloc.js); base: defaults of this version
export function loadConfig(storage, key = STORAGE_KEY, base = null) {
  const cfg = clone(DEFAULTS);
  if (base) applyUpdate(cfg, base);
  try {
    const saved = storage && storage.getItem(key);
    if (saved) applyUpdate(cfg, JSON.parse(saved));
  } catch (e) {
    console.warn("[config] ignoring invalid saved configuration", e);
  }
  return cfg;
}

export function saveConfig(cfg, storage, key = STORAGE_KEY) {
  const subset = {};
  for (const [section, keys] of Object.entries(EDITABLE)) {
    subset[section] = {};
    for (const k of keys) if (cfg[section] && k in cfg[section]) subset[section][k] = cfg[section][k];
  }
  storage.setItem(key, JSON.stringify(subset));
}

export function publicConfig(cfg) {
  return clone(Object.fromEntries(["camera", "pose", "player", "filter", "joc"].map((s) => [s, cfg[s] || {}])));
}
