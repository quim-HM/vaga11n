// User-facing texts. Every string goes through T(key, fallback, vars):
//  - fallback is the default Catalan text written next to the code (readable, always works);
//  - data/textos.json can override any key without touching code (for proofreading/iteration);
//  - {placeholders} are replaced from vars.
// tools/extract_texts.py collects every T() call into data/textos.json.
let overrides = {};
let mouseMode = false;

// In mouse mode, "<key>.ratoli" (if present in data/textos.json) replaces "<key>"
// e.g. «Aixeca la mà per continuar» -> «Mantén el clic per continuar».
export function setMouseMode(on) { mouseMode = !!on; }

export async function loadTexts() {
  try {
    const r = await fetch("data/textos.json", { cache: "no-store" });
    if (r.ok) overrides = await r.json();
  } catch (e) {
    console.warn("textos.json not loaded", e);
  }
}

export function T(key, fallback = "", vars = null) {
  const has = (k) => Object.prototype.hasOwnProperty.call(overrides, k) && typeof overrides[k] === "string";
  let s = mouseMode && has(key + ".ratoli") ? overrides[key + ".ratoli"] : has(key) ? overrides[key] : fallback;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
  return s;
}
