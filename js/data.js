// Loads the data files (JSON/CSV with provenance) served from /data/: the shared ones plus the
// locality's folder data/llocs/<id>/ (lloc.js). Missing files are tolerated: the game degrades
// gracefully and the operator sees a warning in the debug overlay.
import { LLOC, LLOC_DIR } from "./lloc.js";
import { addTexts } from "./textos.js";

async function getJSON(path) {
  try {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    return await r.json();
  } catch (e) {
    console.warn("data missing:", path, e);
    return null;
  }
}

async function getCSV(path) {
  try {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    const lines = (await r.text()).trim().split(/\r?\n/);
    const head = lines.shift().split(",").map((s) => s.trim());
    return lines.filter(Boolean).map((ln) => {
      const cells = ln.split(",");
      const o = {};
      head.forEach((h, i) => {
        const v = (cells[i] ?? "").trim();
        o[h] = v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : v;
      });
      return o;
    });
  } catch (e) {
    console.warn("csv missing:", path, e);
    return null;
  }
}

// l'Alguer is intentionally left out of the map game (user decision)
function dropAlguer(geo) {
  if (!geo || !Array.isArray(geo.features)) return;
  const before = geo.features.length;
  geo.features = geo.features.filter((ft) => !/alguer/i.test(`${ft.nom || ""} ${ft.regio || ""}`));
  if (geo.features.length === before) return;
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ft of geo.features) for (const ring of ft.paths || []) for (const [lon, lat] of ring) {
    b = [Math.min(b[0], lon), Math.min(b[1], lat), Math.max(b[2], lon), Math.max(b[3], lat)];
  }
  geo.bbox = b;
}

// Entries of `over` replace the entries of `base` with the same id; new ids are appended
export function mergeById(base, over) {
  const out = Array.isArray(base) ? [...base] : [];
  for (const o of Array.isArray(over) ? over : []) {
    if (!o || o.id === undefined) continue;
    const i = out.findIndex((b) => b && b.id === o.id);
    if (i >= 0) out[i] = o; else out.push(o);
  }
  return out;
}

// Plain objects merge key by key; anything else (arrays included) is replaced
export function deepMerge(base, over) {
  if (!over || typeof over !== "object" || Array.isArray(over)) return over === undefined ? base : over;
  const out = base && typeof base === "object" && !Array.isArray(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(over)) {
    if (k.startsWith("_")) continue;   // "_nota" etc. are comments
    out[k] = deepMerge(out[k], v);
  }
  return out;
}

// Question bank of a locality: the shared questions (Catalunya/Estat, data/preguntes_comunes.json)
// selected by lloc.json → joc1 ("comunes": "totes" or a list of ids; "excloure": ids), plus the
// locality's own questions (a local question with the same id replaces the shared one).
export function questionBank(comunes, locals, joc1 = {}) {
  const list = Array.isArray(comunes) ? comunes : [];
  const only = Array.isArray(joc1.comunes) ? new Set(joc1.comunes) : null;
  const skip = new Set(Array.isArray(joc1.excloure) ? joc1.excloure : []);
  const shared = list.filter((q) => q && (!only || only.has(q.id)) && !skip.has(q.id));
  return mergeById(locals || [], shared.filter((q) => !(locals || []).some((l) => l && l.id === q.id)));
}

// Final + attract screen texts and broadcast channel: data/final.json with the locality overrides
export async function loadFinalConfig() {
  const [final, lloc] = await Promise.all([getJSON("data/final.json"), getJSON(`${LLOC_DIR}lloc.json`)]);
  return deepMerge(final || {}, (lloc && lloc.final) || {});
}

export async function loadData() {
  const [fontsMain, comunes, seriesIdx, territori, vaga, fontsGeo, final, joc2, lloc, locals, seriesLloc, fontsLloc] = await Promise.all([
    getJSON("data/fonts.json"),
    getJSON("data/preguntes_comunes.json"),
    getJSON("data/series.json"),
    getJSON("data/territori.json"),
    getJSON("data/vaga11n.json"),
    getJSON("data/geo/fonts_geo.json"),
    getJSON("data/final.json"),
    getJSON("data/joc2.json"),
    getJSON(`${LLOC_DIR}lloc.json`),
    getJSON(`${LLOC_DIR}preguntes.json`),
    getJSON(`${LLOC_DIR}series.json`),
    getJSON(`${LLOC_DIR}fonts.json`),
  ]);
  const warnings = [];
  if (!lloc) warnings.push(`Falta ${LLOC_DIR}lloc.json`);
  const manifest = lloc || { id: LLOC };
  if (manifest.textos) addTexts(manifest.textos);
  const fonts = mergeById([...(fontsMain || []), ...(fontsGeo || [])], fontsLloc);
  const preguntes = questionBank(comunes, locals, manifest.joc1 || {});
  const geo = {};
  const fontsById = new Map((fonts || []).map((f) => [f.id, f]));
  const series = new Map();
  for (const s of mergeById(seriesIdx, seriesLloc)) {
    const rows = await getCSV(`data/${s.fitxer}`);
    if (!rows) { warnings.push(`Falta la sèrie ${s.id}`); continue; }
    const partial = new Set(s.anys_parcials || []);
    // Partial years (e.g. only Q1) are kept apart so they are never compared with full years
    const all = rows.filter((r) => r.any !== null && r.valor !== null).map((r) => ({ year: r.any, value: r.valor }));
    const points = all.filter((p) => !partial.has(p.year));
    series.set(s.id, { ...s, points, partialPoints: all.filter((p) => partial.has(p.year)) });
  }
  if (!comunes) warnings.push("Falta data/preguntes_comunes.json");
  if (!locals) warnings.push(`Falta ${LLOC_DIR}preguntes.json`);
  if (!fontsMain) warnings.push("Falta data/fonts.json");
  return {
    lloc: manifest,
    fonts,
    fontsById,
    preguntes: preguntes.filter((q) => q.valor !== null && q.valor !== undefined),
    series,
    territori,
    geo,
    final: deepMerge(final || {}, manifest.final || {}),
    joc2: manifest.joc2 || joc2 || null,
    vaga,
    warnings,
    geoKey: null,
    // Load the 3 territories of «Encén la vaga» from data/geo/index.json: city barris → comarca
    // municipis → final territory; without a city (joc.ciutat = ""): comarca → Catalunya → final.
    // Defaults come from lloc.json → joc3; the operator can change them (joc = saved config).
    async loadGeoLevels(joc = {}) {
      const def = manifest.joc3 || {};
      const want = {
        ciutat: joc.ciutat ?? def.ciutat ?? "",
        comarca: joc.comarca || def.comarca || "",
        final: joc.final || def.final || "ppcc",
      };
      const key = `${want.ciutat}|${want.comarca}|${want.final}`;
      if (this.geoKey === key && this.geo.levels) return this.geo.levels;
      const idx = await getJSON("data/geo/index.json");
      const pick = (list, id) => (list || []).find((x) => x.id === id || (x.nom || "").toLowerCase() === String(id || "").toLowerCase());
      let levels = null;
      if (idx) {
        const c = want.ciutat ? pick(idx.ciutats, want.ciutat) : null;
        const k = pick(idx.comarques, want.comarca) || pick(idx.comarques, c && c.comarca) || pick(idx.comarques, def.comarca);
        let f = pick(idx.final, want.final) || pick(idx.final, "ppcc") || pick(idx.final, "catalunya");
        let trio = [c, k, f];
        if (!c) {
          // no city: the comarca opens, then Catalunya, then the final territory (if it isn't Catalunya)
          const cat = pick(idx.final, "catalunya");
          if (f && cat && f.id === cat.id) f = pick(idx.final, "ppcc") || f;
          trio = [k, cat, f];
        }
        const files = await Promise.all(trio.map((e) => (e ? getJSON(`data/geo/${e.fitxer}`) : null)));
        if (k && files.every(Boolean)) {
          dropAlguer(files[2]);
          if (c) {
            files[0].municipi = files[0].municipi || { id: c.id, nom: c.nom };
            files[0].titol = files[0].titol || c.nom;
            // City level: peripheral rural barris marked "context" are not playable — they are kept
            // apart (drawn faintly if the game supports it) and the view fits the playable "vista".
            // data/geo/vistes.json can add both per city without rebuilding the geometry.
            const vistes = (await getJSON("data/geo/vistes.json")) || {};
            const ov = vistes[c.id];
            if (ov) {
              const ctxIds = new Set(ov.context || []);
              for (const ft of files[0].features || []) if (ctxIds.has(ft.id)) ft.context = true;
              if (Array.isArray(ov.vista)) files[0].vista = ov.vista;
            }
          } else {
            files[0].comarca = files[0].comarca || { id: k.id, nom: k.nom };
            files[0].titol = files[0].titol || k.nom;
          }
          for (const lv of files) {
            if (!Array.isArray(lv.features)) continue;
            const ctx = lv.features.filter((ft) => ft.context);
            if (ctx.length) {
              lv.context = ctx;
              lv.features = lv.features.filter((ft) => !ft.context);
              if (Array.isArray(lv.vista) && lv.vista.length === 4) lv.bbox = lv.vista;
            }
          }
          // level 3 starts warm on the comarca: with a city level 2 is the comarca, without one it's Catalunya
          files[1].comarca = c ? files[1].comarca || { id: k.id, nom: k.nom } : { id: k.id, nom: k.nom };
          files[1].titol = files[1].titol || trio[1].nom;
          files[2].titol = files[2].titol || trio[2].nom;
          levels = files;
          this.geoIndex = idx;
        }
      }
      this.geo.levels = levels;
      this.geoKey = key;
      return levels;
    },
    // Human-readable citation for a source id: "Font: INE · Cens 2021 · 2021". Uses the short
    // Catalan title when available (full titles are in the credits screen).
    cite(fontId, extra = "") {
      const f = fontsById.get(fontId);
      if (!f) return extra ? `Font: ${extra}` : "";
      return `Font: ${f.organisme} · ${f.titol_curt || f.titol}${extra ? " · " + extra : ""}`;
    },
  };
}
