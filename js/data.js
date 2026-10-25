// Loads the data files (JSON/CSV with provenance) served from /data/. Missing files are tolerated:
// the game degrades gracefully and the operator sees a warning in the debug overlay.
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

export async function loadData() {
  const [fontsMain, preguntes, seriesIdx, territori, vaga, fontsGeo, geoManresa, geoBages, geoCat, final] = await Promise.all([
    getJSON("data/fonts.json"),
    getJSON("data/preguntes.json"),
    getJSON("data/series.json"),
    getJSON("data/territori.json"),
    getJSON("data/vaga11n.json"),
    getJSON("data/geo/fonts_geo.json"),
    getJSON("data/geo/manresa_barris.json"),
    getJSON("data/geo/bages_municipis.json"),
    getJSON("data/geo/catalunya_comarques.json"),
    getJSON("data/final.json"),
  ]);
  const fonts = [...(fontsMain || []), ...(fontsGeo || [])];
  const geo = { manresa: geoManresa, bages: geoBages, catalunya: geoCat };
  const warnings = [];
  const fontsById = new Map((fonts || []).map((f) => [f.id, f]));
  const series = new Map();
  for (const s of seriesIdx || []) {
    const rows = await getCSV(`data/${s.fitxer}`);
    if (!rows) { warnings.push(`Falta la sèrie ${s.id}`); continue; }
    const partial = new Set(s.anys_parcials || []);
    // Partial years (e.g. only Q1) are kept apart so they are never compared with full years
    const all = rows.filter((r) => r.any !== null && r.valor !== null).map((r) => ({ year: r.any, value: r.valor }));
    const points = all.filter((p) => !partial.has(p.year));
    series.set(s.id, { ...s, points, partialPoints: all.filter((p) => partial.has(p.year)) });
  }
  if (!preguntes) warnings.push("Falta data/preguntes.json");
  if (!fontsMain) warnings.push("Falta data/fonts.json");
  return {
    fonts,
    fontsById,
    preguntes: (preguntes || []).filter((q) => q.valor !== null && q.valor !== undefined),
    series,
    territori,
    geo,
    final: final || {},
    vaga,
    warnings,
    geoKey: null,
    // Load the 3 territories chosen by the operator for «Encén la vaga» (city barris, comarca
    // municipis, final territory) from data/geo/index.json. Falls back to Manresa/Bages/Catalunya.
    async loadGeoLevels(joc = {}) {
      const key = `${joc.ciutat}|${joc.comarca}|${joc.final}`;
      if (this.geoKey === key && this.geo.levels) return this.geo.levels;
      const idx = await getJSON("data/geo/index.json");
      const pick = (list, id) => (list || []).find((x) => x.id === id || (x.nom || "").toLowerCase() === String(id || "").toLowerCase());
      let levels = null;
      if (idx) {
        const c = pick(idx.ciutats, joc.ciutat) || pick(idx.ciutats, "08113");
        const k = pick(idx.comarques, joc.comarca) || pick(idx.comarques, c && c.comarca) || pick(idx.comarques, "bages");
        const f = pick(idx.final, joc.final) || pick(idx.final, "ppcc") || pick(idx.final, "catalunya");
        const files = await Promise.all([c, k, f].map((e) => (e ? getJSON(`data/geo/${e.fitxer}`) : null)));
        if (files.every(Boolean)) {
          // l'Alguer is intentionally left out of the map game (user decision)
          const f2 = files[2];
          if (Array.isArray(f2.features)) {
            const before = f2.features.length;
            f2.features = f2.features.filter((ft) => !/alguer/i.test(`${ft.nom || ""} ${ft.regio || ""}`));
            if (f2.features.length !== before) {
              let b = [Infinity, Infinity, -Infinity, -Infinity];
              for (const ft of f2.features) for (const ring of ft.paths || []) for (const [lon, lat] of ring) {
                b = [Math.min(b[0], lon), Math.min(b[1], lat), Math.max(b[2], lon), Math.max(b[3], lat)];
              }
              f2.bbox = b;
            }
          }
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
          for (const lv of files) {
            if (!Array.isArray(lv.features)) continue;
            const ctx = lv.features.filter((ft) => ft.context);
            if (ctx.length) {
              lv.context = ctx;
              lv.features = lv.features.filter((ft) => !ft.context);
              if (Array.isArray(lv.vista) && lv.vista.length === 4) lv.bbox = lv.vista;
            }
          }
          files[1].comarca = files[1].comarca || { id: k.id, nom: k.nom };
          files[1].titol = files[1].titol || k.nom;
          files[2].titol = files[2].titol || f.nom;
          levels = files;
          this.geoIndex = idx;
        }
      }
      if (!levels && this.geo.manresa && this.geo.bages && this.geo.catalunya) {
        levels = [this.geo.manresa, this.geo.bages, this.geo.catalunya];
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
