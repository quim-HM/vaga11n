// Offline copy of the game (service worker). tools/build_web.py fills in VERSION, LLOC, SKIP and
// ASSETS when it builds dist/; a new build changes VERSION, so browsers fetch the new files on the
// next visit. Cache-first: once loaded, the installation keeps working without internet at the venue.
// Several versions (one per locality) can live on one origin, e.g. /vaga11n/ and /vaga11n/santpedor/:
// each one names its caches with its locality and never touches the folders of the others (SKIP).
const VERSION = "fda72b68177f";
const LLOC = "can-baro";
const SKIP = [];
const ASSETS = [
"./",
"css/style.css",
"data/final.json",
"data/fonts.json",
"data/geo/bages_municipis.json",
"data/geo/barris/08015.json",
"data/geo/barris/08019-34.json",
"data/geo/barris/08019.json",
"data/geo/barris/08101.json",
"data/geo/barris/08113.json",
"data/geo/barris/08124.json",
"data/geo/barris/08169.json",
"data/geo/barris/08187.json",
"data/geo/barris/08194.json",
"data/geo/barris/08245.json",
"data/geo/barris/08279.json",
"data/geo/barris/08307.json",
"data/geo/barris/17079.json",
"data/geo/barris/43123.json",
"data/geo/catalunya_comarques.json",
"data/geo/comarques/alt-camp.json",
"data/geo/comarques/alt-emporda.json",
"data/geo/comarques/alt-penedes.json",
"data/geo/comarques/alt-urgell.json",
"data/geo/comarques/alta-ribagorca.json",
"data/geo/comarques/anoia.json",
"data/geo/comarques/bages.json",
"data/geo/comarques/baix-camp.json",
"data/geo/comarques/baix-ebre.json",
"data/geo/comarques/baix-emporda.json",
"data/geo/comarques/baix-llobregat.json",
"data/geo/comarques/baix-penedes.json",
"data/geo/comarques/barcelones.json",
"data/geo/comarques/bergueda.json",
"data/geo/comarques/cerdanya.json",
"data/geo/comarques/conca-de-barbera.json",
"data/geo/comarques/garraf.json",
"data/geo/comarques/garrigues.json",
"data/geo/comarques/garrotxa.json",
"data/geo/comarques/girones.json",
"data/geo/comarques/llucanes.json",
"data/geo/comarques/maresme.json",
"data/geo/comarques/moianes.json",
"data/geo/comarques/montsia.json",
"data/geo/comarques/noguera.json",
"data/geo/comarques/osona.json",
"data/geo/comarques/pallars-jussa.json",
"data/geo/comarques/pallars-sobira.json",
"data/geo/comarques/pla-d-urgell.json",
"data/geo/comarques/pla-de-l-estany.json",
"data/geo/comarques/priorat.json",
"data/geo/comarques/ribera-d-ebre.json",
"data/geo/comarques/ripolles.json",
"data/geo/comarques/segarra.json",
"data/geo/comarques/segria.json",
"data/geo/comarques/selva.json",
"data/geo/comarques/solsones.json",
"data/geo/comarques/tarragones.json",
"data/geo/comarques/terra-alta.json",
"data/geo/comarques/urgell.json",
"data/geo/comarques/val-d-aran.json",
"data/geo/comarques/valles-occidental.json",
"data/geo/comarques/valles-oriental.json",
"data/geo/fonts_geo.json",
"data/geo/index.json",
"data/geo/manresa_barris.json",
"data/geo/ppcc.json",
"data/geo/README.md",
"data/geo/vistes.json",
"data/INFORME_DADES.md",
"data/joc2.json",
"data/llocs/can-baro/fonts.json",
"data/llocs/can-baro/lloc.json",
"data/llocs/can-baro/preguntes.json",
"data/llocs/can-baro/series/lloguer_barcelona.csv",
"data/llocs/can-baro/series/lloguer_horta_guinardo.csv",
"data/llocs/can-baro/series.json",
"data/llocs/index.json",
"data/llocs/README.md",
"data/preguntes_comunes.json",
"data/series/despesa_aliments_llar_catalunya.csv",
"data/series/ipc_catalunya_aliments.csv",
"data/series/ipc_catalunya_general.csv",
"data/series/llancaments_pj_manresa.csv",
"data/series/lloguer_bages.csv",
"data/series/lloguer_catalunya.csv",
"data/series/lloguer_manresa.csv",
"data/series/preu_habitatge_catalunya.csv",
"data/series/preu_habitatge_manresa.csv",
"data/series/renda_llar_manresa.csv",
"data/series/salari_catalunya.csv",
"data/series/smi.csv",
"data/series.json",
"data/territori.json",
"data/textos.json",
"data/vaga11n.json",
"fonts/Archivo-Variable.ttf",
"fonts/OFL-Archivo.txt",
"img/qr.png",
"index.html",
"js/app.js",
"js/audio.js",
"js/countdown.js",
"js/data.js",
"js/games/encen.js",
"js/games/encen_geo.js",
"js/games/finaldemes.js",
"js/games/metafores.js",
"js/games/preu.js",
"js/hand.js",
"js/host.js",
"js/icons.js",
"js/input.js",
"js/link.js",
"js/lloc.js",
"js/main.js",
"js/pictos.js",
"js/qr.js",
"js/scenes/attract.js",
"js/scenes/credits.js",
"js/scenes/final.js",
"js/scenes/interlude.js",
"js/scenes/join.js",
"js/scenes/mes.js",
"js/temes.js",
"js/textos.js",
"js/trail.js",
"js/tutorial.js",
"js/ui.js",
"js/vision/config.js",
"js/vision/filters.js",
"js/vision/landmarks.js",
"js/vision/player.js",
"js/vision/pose-worker.js",
"js/vision/vision.js",
"models/pose_landmarker_full.task",
"models/pose_landmarker_lite.task",
"operador.html",
"package.json",
"paletes.html",
"vendor/mediapipe/vision_bundle.mjs",
"vendor/mediapipe/wasm/vision_wasm_module_internal.js",
"vendor/mediapipe/wasm/vision_wasm_module_internal.wasm",
"vendor/qrcode/qrcode.mjs",
"vendor/README.md"
];
const PREFIX = `vaga11n-${LLOC}-`;
const CACHE = PREFIX + VERSION;
// caches of the first published version (before localities): "vaga11n-<12 hex>"
const LEGACY = /^vaga11n-[0-9a-f]{12}$/;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // one by one, so a single missing file does not abort the whole offline copy
    await Promise.all(ASSETS.map((a) => cache.add(new Request(a, { cache: "reload" })).catch((e) => console.warn("sw cache", a, e))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if ((k.startsWith(PREFIX) && k !== CACHE) || LEGACY.test(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Requests inside this version's folder, excluding the sub-folders of other versions
function ours(url) {
  if (url.origin !== self.location.origin) return false;
  const scope = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scope)) return false;
  const rest = url.pathname.slice(scope.length);
  return !SKIP.some((d) => rest === d || rest.startsWith(d + "/"));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !ours(new URL(req.url))) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === "basic") cache.put(req, res.clone()).catch(() => null);
    return res;
  })());
});
