// Which version of the game this page is: one per locality (Manresa, Santpedor, Vallès Oriental…).
// Each locality has a folder data/llocs/<id>/ (lloc.json + local questions, series and sources; see
// data/llocs/README.md). tools/build_web.py writes <meta name="vaga11n-lloc" content="<id>"> into the
// built pages; while developing, ?lloc=<id> picks any folder of data/llocs/.
export const LLOC_PER_DEFECTE = "manresa";

const VALID = /^[a-z0-9][a-z0-9-]{0,40}$/;

function resolve() {
  try {
    const meta = typeof document !== "undefined" ? document.querySelector('meta[name="vaga11n-lloc"]') : null;
    if (meta && VALID.test(meta.content)) return meta.content;
    const q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("lloc") : null;
    if (q && VALID.test(q)) return q;
  } catch (e) {
    console.warn("lloc: using the default locality", e);
  }
  return LLOC_PER_DEFECTE;
}

export const LLOC = resolve();
export const LLOC_DIR = `data/llocs/${LLOC}/`;

// All versions published under one origin (e.g. https://user.github.io/vaga11n/ and .../santpedor/)
// share localStorage, BroadcastChannel names and Cache Storage: anything named there goes through
// scoped() so versions never read each other's settings. The default locality keeps the old names.
export function scoped(name) {
  return LLOC === LLOC_PER_DEFECTE ? name : `${name}.${LLOC}`;
}

// Query string that keeps the locality when opening another page of the game (dev mode only:
// built pages carry the meta tag)
export function llocQuery() {
  try {
    const q = new URLSearchParams(location.search).get("lloc");
    return q && VALID.test(q) ? `lloc=${q}` : "";
  } catch (e) {
    return "";
  }
}
