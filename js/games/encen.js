// «Encén la vaga»: frantic agit-prop mini-game on three real maps chosen by the operator
// (city barris -> comarca municipis -> final territory, e.g. the Països Catalans). Each real area is
// subdivided into hexagonal cells; each hand is a "brush" that heats the cells under it in proportion
// to how fast it moves (waving heats, a still hand barely does) and every cell cools down
// continuously. A level is won by having a share of the WHOLE map organised at once (TUNING.winArea)
// and holding it for a few seconds: no area is a prerequisite, but the cells cool fast enough that
// it takes constant waving. Each area is still marked as organised when ~60 % of its cells are lit,
// which is what the map outlines and the counter show. The "adhesion" is a playful simulation,
// never real data.
// All user-facing strings go through T() from textos.js (keys "encen.*", overridable in data/textos.json) and all
// colours are derived at draw time from the switchable palette C.
import { W, H, C, LAYOUT, text, wrap, panel, ring, hatch, Particles, clamp, easeOut, fmtNum, font, rrect, onCard, measure, fitSize as uiFit } from "../ui.js";
import { centerText, drawOkBadge } from "../icons.js";
import { drawTrail } from "../trail.js";
import { drawFooterHint } from "../hand.js";
import { drawTutorial, encenCards, drawEncenGoal } from "../tutorial.js";
import { areasFromGeo, areasFromBubbles, fallbackZones, pointInArea, buildCells, cellsInCircle } from "./encen_geo.js";
import { T } from "../textos.js";

// --- colours (derived from the live palette C) -------------------------------------------------
const rgbCache = new Map();
function rgbOf(c) {
  const key = String(c);
  if (rgbCache.has(key)) return rgbCache.get(key);
  let out = null;
  let m = key.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.split("").map((x) => x + x).join("");
    out = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  } else if ((m = key.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i))) {
    out = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  if (!out || out.some((v) => !Number.isFinite(v))) out = [128, 128, 128];
  rgbCache.set(key, out);
  return out;
}
function mix(a, b, t) {
  const p = rgbOf(a), q = rgbOf(b), k = clamp(t, 0, 1);
  return `rgb(${Math.round(p[0] + (q[0] - p[0]) * k)},${Math.round(p[1] + (q[1] - p[1]) * k)},${Math.round(p[2] + (q[2] - p[2]) * k)})`;
}
function alpha(c, a) {
  const p = rgbOf(c);
  return `rgba(${p[0]},${p[1]},${p[2]},${a})`;
}
const themeSig = () => [C.paper, C.paper2, C.ink, C.inkSoft, C.heatCold, C.heatMint, C.heatMid, C.heatHot, C.card, C.cardInk].join("|");

// --- tuning ------------------------------------------------------------------------------------
// Gameplay tuning (exported so it can be adjusted from the console / test harness)
export const TUNING = {
  brushR: [88, 88, 64],           // brush radius per level (screen px; the final map is smaller on screen)
  heat: [2.0, 1.95, 2.75],        // max heat/s per level: about a third of the range per pass, so a cell
                                  // fills up in three passes (and counts as organised after about two)
  stillFactor: 0.25,              // fraction of the max heat given by a resting hand (moving = 100%)
  speedMin: 120,                  // px/s below which a hand counts as still (pose jitter)
  speedFull: 1100,                // px/s at which a hand gives the full heat
  dec: [0.040, 0.044, 0.029],     // cooling per level (heat/s), tuned against the time it takes to sweep the
                                  // whole map: a zone you left behind cools visibly, and sweeping slowly
                                  // loses ground faster than it gains it
  spread: [0.25, 0.25, 0.25],     // contagion: warmth flowing from lit neighbour cells
  cellTarget: [720, 650, 300],    // approx. number of hex cells per level (size derived from map area)
  cellMin: 11, cellMax: 30,       // hex radius limits (px)
  winArea: [0.75, 0.75, 0.70],    // share of the whole map that must be organised at once to win the level
  winHyst: 0.07,                  // once the target is reached, the hold survives dips this far below it
  areaLit: 0.6,                   // fraction of an area's cells that marks one area as organised (display only)
  fewAreasLit: 0.15,              // extra lit share required on maps with fewer than ~15 areas
  fewAreasCool: 0.6,              // and extra cooling (x1.6 at <= 5 areas)
  litHyst: 0.15,                  // a lit area stays lit until its fraction drops this much below
  orgCool: 0.6,                   // organised (lit) areas cool at this fraction of the normal rate
  seedHeat: 0.7,                  // initial heat of the area containing the previous territory
  oneArmCool: 0.30,               // one-arm mode: cooling a third as fast (one brush covers half the ground)
  oneArmWin: 0.60,                // one-arm mode: the share of the map needed is lowered by this factor
  limit: [35, 40, 45],            // per-level timer (no defeat)
  fast: [18, 22, 26],             // completion time that earns the full speed bonus
};
const TU = TUNING;
const NLEVELS = 3;
const LIT = 0.5;        // a cell counts as organised from half the range up: the top half is
                        // headroom that visibly cools down, so the map keeps breathing
const HOLD_S = 5;   // seconds the target must be held to win the level
// «Com es juga» (stickman cards) first, then a level card before each map. Result cards move on by
// themselves (no gesture), but stay long enough to be read even by a player who is ready at once.
const HOWTO_MIN_S = 6.0, HOWTO_AUTO_S = 24, RAISE_S = 0.6;
const READY_FIRST_S = 5.0, READY_S = 4.2, CARD_WON_S = 4.0, CARD_FAIL_S = 4.5, CARD_LAST_S = 5.5;
// legacy data (app.data.geo.manresa/bages/catalunya) and bubble fallback
const LEGACY_IDS = ["manresa", "bages", "catalunya"];
const LEGACY_NAMES = [["Manresa", "barris"], ["el Bages", "municipis"], ["Catalunya", "comarques"]];

const NB = 12;  // colour buckets for batched cell fills
// hexagon template (pointy-top, unit radius)
const HEX = Array.from({ length: 6 }, (_, k) => [Math.cos(((60 * k - 90) * Math.PI) / 180), Math.sin(((60 * k - 90) * Math.PI) / 180)]);
function addHex(p, x, y, r) {
  p.moveTo(x + HEX[0][0] * r, y + HEX[0][1] * r);
  for (let k = 1; k < 6; k++) p.lineTo(x + HEX[k][0] * r, y + HEX[k][1] * r);
  p.closePath();
}

function listCa(names) {
  if (names.length <= 1) return names.join("");
  return names.slice(0, -1).join(", ") + T("encen.llista_i", " i ") + names[names.length - 1];
}

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/^(els |les |el |la |l')/, "").replace(/[^a-z0-9]+/g, " ").trim();

// Territory name, article and unit from the geo file ("Municipis del Bages" -> "el Bages", "municipis")
const PREPS = [["dels ", "els "], ["de les ", "les "], ["del ", "el "], ["de la ", "la "], ["de l'", "l'"], ["d'", ""], ["de ", ""]];
const ARTICLES = ["els ", "les ", "el ", "la ", "l'"];
const UNITS = ["barris", "municipis", "comarques"];
// names that take a plural article when written bare in the data
const PLURAL_NAMES = { "paisos catalans": "els ", "illes balears": "les ", "terres de l ebre": "les " };
function describeTerritory(geo, fallbackName, fallbackUnit) {
  let name = null, unit = null;
  const titol = String((geo && geo.titol) || "").trim();
  const m = titol.match(/^(\S+)\s+(.+)$/);
  if (m) {
    const rest = m[2], low = rest.toLowerCase();
    for (const [p, art] of PREPS) if (low.startsWith(p)) { unit = m[1].toLowerCase(); name = art + rest.slice(p.length); break; }
  }
  const explicit = geo && (geo.territori || geo.nom_territori || geo.nom);
  if (explicit) name = String(explicit);
  if (!name && titol) name = titol;
  if (geo && geo.unitat) unit = String(geo.unitat);
  if (!unit && geo && geo.id) { const u = UNITS.find((x) => String(geo.id).toLowerCase().endsWith(x)); if (u) unit = u; }
  if (!name) name = fallbackName || "?";
  if (!unit) unit = fallbackUnit || "zones";
  let lowName = name.toLowerCase();
  if (!ARTICLES.some((a) => lowName.startsWith(a)) && PLURAL_NAMES[norm(name)]) { name = PLURAL_NAMES[norm(name)] + name; lowName = name.toLowerCase(); }
  const article = ARTICLES.find((a) => lowName.startsWith(a)) || "";
  const bare = name.slice(article.length);
  name = article + bare;
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  const plural = article === "els " || article === "les ";
  // grammatical gender of the territory: el/els masc, la/les fem; l' depends on the next word
  // (l'Hospitalet, l'Alt Camp, l'Urgell masc; l'Anoia, l'Alta Ribagorça, l'Horta fem); bare names
  // are cities/countries (feminine: «Manresa organitzada», «Catalunya organitzada»)
  let fem = article === "la " || article === "les " || article === "";
  if (article === "l'") fem = /^[^\s-]*a\b/i.test(bare);
  if (geo && typeof geo.genere === "string") fem = /^f/i.test(geo.genere);
  const kind = (fem ? "fem" : "masc") + (plural ? "_pl" : "");
  // «seccions» is feminine without ending in -es: a geo file can say so with unitat_genere
  const femUnit = geo && typeof geo.unitat_genere === "string" ? /^f/i.test(geo.unitat_genere) : /es$/i.test(unit);
  return { name, cap, bare, upper: cap.toUpperCase(), plural, fem, kind, unit, femUnit };
}

// Index of the area matching any of the wanted {id, nom} (by id, then by normalised name)
function findArea(areas, wanted) {
  for (const w of wanted) {
    if (!w) continue;
    if (w.id !== undefined && w.id !== null) {
      const k = areas.findIndex((a) => String(a.id) === String(w.id));
      if (k >= 0) return k;
    }
    if (w.nom) {
      const n = norm(w.nom);
      const k = areas.findIndex((a) => norm(a.nom) === n);
      if (k >= 0) return k;
    }
  }
  return -1;
}

export default class Encen {
  constructor(app, params) {
    this.calm = true;   // drawn on the theme's calm play surface (app.draw)
    this.app = app;
    this.params = params || {};
    this.needsPlayer = true;
    this.t = 0;
    this.phase = "howto";
    this.raiseT = 0;
    this.raiseArmed = false;
    this.phaseT = 0;
    this.li = 0;
    this.level = null;
    this.results = [];
    this.facts = [];
    this.particles = new Particles();
    this.embers = [];
    this.emberAcc = 0;
    this.holdT = 0;
    this.holdTick = null;
    this.levelT = 0;
    this.lastCount = null;
    this.sfxT = 0;
    this.goT = 0;
    this.hands = {};
    this.pal = null;
    this.done = false;
    this.onTheme = () => { this.pal = null; };
  }

  enter() {
    window.addEventListener("tema", this.onTheme);
    // pre-build every map up front (projection, cells) so level transitions never stutter
    const geos = this.geoLevels();
    this.built = geos.map((g, i) => this.makeLevel(i, g));
    this.buildLevel(0);
  }

  exit() {
    this.done = true;
    window.removeEventListener("tema", this.onTheme);
  }

  skip() { this.finish(); }

  // the hand raised to resume from the pause must come down before it can move the how-to on
  onResume() { this.raiseArmed = false; this.raiseT = 0; }

  // Operator-chosen territories (app.data.geo.levels) or the legacy fixed trio
  geoLevels() {
    const g = (this.app.data && this.app.data.geo) || {};
    if (Array.isArray(g.levels) && g.levels.length >= NLEVELS) return g.levels.slice(0, NLEVELS);
    return LEGACY_IDS.map((id) => g[id] || null);
  }

  // --- levels ---------------------------------------------------------------
  buildLevel(i) {
    if (this.level) { this.level.layer = null; this.level.overlay = null; } // free the offscreen canvases
    this.level = (this.built && this.built[i]) || this.makeLevel(i, this.geoLevels()[i]);
    const L = this.level;
    if (L.fact && !this.facts.some((f) => f.text === L.fact.text)) this.facts.push(L.fact);
    this.levelT = 0; this.holdT = 0; this.holdTick = null; this.bestFrac = 0; this.lit = 0; this.area = 0; this.embers = [];
    this.hands = {};
    // the area containing the previous territory starts warm (looks lit, but cools if ignored)
    if (i > 0 && L.seed >= 0) {
      const prev = this.results[i - 1];
      const v0 = prev && prev.won ? TU.seedHeat : TU.seedHeat * 0.7;
      for (let c = 0; c < L.cells.n; c++) if (L.cells.area[c] === L.seed) L.v[c] = v0;
    }
  }

  makeLevel(i, geo) {
    const data = this.app.data || {};
    let map = null;
    try { map = areasFromGeo(geo); } catch (e) { console.warn("encen: unusable geometry for level", i, e); map = null; }
    if (!map) { geo = null; map = areasFromBubbles(fallbackZones(data.territori, LEGACY_IDS[i])); }
    const isGeo = map.kind === "geo";
    const terr = describeTerritory(geo, LEGACY_NAMES[i][0], isGeo ? LEGACY_NAMES[i][1] : "zones");
    if (!isGeo) terr.unit = "zones";
    const L = { i, id: (geo && geo.id) || LEGACY_IDS[i], geo, terr, map, areas: map.areas, isGeo, credit: isGeo ? this.mapCredit(geo) : "" };
    // maps whose zones have no meaningful names (census sections) can turn the names off: "etiquetes": false
    L.noLabels = !!(geo && geo.etiquetes === false);
    L.frame = map.frame || null;
    L.context = map.context || [];
    // with a framed view only the visible part of the areas is played: cap the area by the frame
    let totalPx = L.areas.reduce((s, a) => s + (a.px || 0), 0);
    if (L.frame) totalPx = Math.min(totalPx, (L.frame.x1 - L.frame.x0) * (L.frame.y1 - L.frame.y0));
    // cell size from the map area; at least ~4 cells per area on maps with many small areas
    const target = Math.max(TU.cellTarget[i], L.areas.length * 4);
    const s = clamp(Math.sqrt(totalPx / (2.598 * target)), TU.cellMin, TU.cellMax);
    L.cells = buildCells(L.areas, s);
    L.v = new Float32Array(L.cells.n);
    L.v2 = new Float32Array(L.cells.n);
    L.areaLitCells = new Int32Array(L.areas.length);
    L.areaFrac = new Float32Array(L.areas.length);
    // maps with only a few (big) areas need a larger share of each area lit (e.g. the 5 municipis of the Barcelonès)
    const few = clamp((15 - L.areas.length) / 10, 0, 1);
    L.areaLit = TU.areaLit + TU.fewAreasLit * few;
    L.decK = 1 + TU.fewAreasCool * few;
    L.seed = i > 0 ? this.findSeed(i, L) : -1;
    L.fact = this.popFact(L);
    return L;
  }

  // Level 2: the city of level 1; level 3: the comarca of level 2 (by id or name)
  findSeed(i, L) {
    const geos = this.geoLevels();
    const prevGeo = geos[i - 1];
    const prevTerr = describeTerritory(prevGeo, LEGACY_NAMES[i - 1][0], LEGACY_NAMES[i - 1][1]);
    const wanted = [];
    if (prevGeo && i === 1 && prevGeo.municipi) wanted.push(prevGeo.municipi);
    if (prevGeo && i === 2 && prevGeo.comarca) wanted.push(prevGeo.comarca);
    wanted.push({ nom: prevTerr.bare });
    return findArea(L.areas, wanted);
  }

  mapCredit(geo) {
    const f = geo && geo.font;
    if (!f) return "";
    const osm = /openstreetmap/i.test(`${f.organisme || ""} ${f.llicencia || ""}`);
    const osmOnly = /^openstreetmap/i.test(String(f.organisme || "").trim());
    if (osmOnly) return T("encen.credit_osm", "Mapa: © OpenStreetMap contributors (ODbL)");
    const body = f.titol_curt || [f.organisme, f.titol].filter(Boolean).join(" · ");
    if (!body) return "";
    return osm
      ? T("encen.credit_mixt", "Mapa: {font} · © OpenStreetMap contributors (ODbL)", { font: body })
      : T("encen.credit", "Mapa: {font}", { font: body });
  }

  // Real population of the territory: sum of all its areas (same year and source), with citation
  popFact(L) {
    // the whole territory, including the non-playable context areas outside the framed view
    const A = [...L.areas, ...(L.context || [])];
    const data = this.app.data;
    if (!data || typeof data.cite !== "function" || !A.length || !A.every((a) => a.pop > 0)) return null;
    const anys = new Set(A.map((a) => a.any)), fonts = new Set(A.map((a) => a.fontPop));
    if (anys.size !== 1 || fonts.size !== 1) return null;
    const fid = [...fonts][0], any = [...anys][0];
    const src = fid ? data.cite(fid) : "";
    if (!src) return null;
    const sum = A.reduce((s, a) => s + a.pop, 0);
    const yr = any ? ` (${any})` : "";
    // Aran is not legally a comarca: "42 comarques i l'Aran"
    const aran = /comarques/i.test(L.terr.unit) && A.some((a) => /^(val d'aran|aran)$/i.test(String(a.nom).trim()));
    const parts = aran
      ? T("encen.parts_aran", "{n} {unitat} i l'Aran", { n: A.length - 1, unitat: L.terr.unit })
      : T("encen.parts", "{n} {unitat}", { n: A.length, unitat: L.terr.unit });
    const txt = L.isGeo
      ? T("encen.poblacio", "{Nom} {te} {n} habitants{any}, repartits en {parts}.",
        { Nom: L.terr.cap, te: L.terr.plural ? T("encen.tenen", "tenen") : T("encen.te", "té"), n: fmtNum(sum), any: yr, parts })
      : T("encen.poblacio_zones", "Les {z} zones del mapa sumen {n} habitants{any}.", { z: A.length, n: fmtNum(sum), any: yr });
    return { text: txt, source: src, sum };
  }

  doneTitle(L) {
    const NOM = L.terr.upper;
    switch (L.terr.kind) {
      case "masc": return T("encen.fet_masc", "{NOM} ORGANITZAT!", { NOM });
      case "masc_pl": return T("encen.fet_masc_pl", "{NOM} ORGANITZATS!", { NOM });
      case "fem_pl": return T("encen.fet_fem_pl", "{NOM} ORGANITZADES!", { NOM });
      default: return T("encen.fet_fem", "{NOM} ORGANITZADA!", { NOM });
    }
  }

  // «organitzats/organitzades» for the units (barris, municipis / comarques, zones)
  litWord(L) { return L.terr.femUnit ? T("encen.organitzades", "organitzades") : T("encen.organitzats", "organitzats"); }
  // singular, for one area in the tooltip (un barri organitzat / una comarca organitzada)
  litWordOne(L) { return L.terr.femUnit ? T("encen.organitzada", "organitzada") : T("encen.organitzat", "organitzat"); }

  // --- flow -----------------------------------------------------------------
  startPlay() {
    this.phase = "play"; this.phaseT = 0; this.goT = 0.9;
    this.app.sfx.select();
  }

  // Share of the whole map that must be organised at once to win the current level
  // (one hand covers half the ground, so one-arm mode asks for less)
  winArea() {
    const w = TU.winArea[Math.min(this.li, TU.winArea.length - 1)];
    return this.app.input.oneArm ? w * TU.oneArmWin : w;
  }

  endLevel(won) {
    const A = this.level.areas;
    this.results[this.li] = { i: this.li, won, time: this.levelT, frac: won ? 1 : this.bestFrac,
      name: this.level.terr.name, lit: this.lit, total: A.length, area: this.area };
    this.phase = "card"; this.phaseT = 0;
    this.holdT = 0;
    if (won) {
      this.app.sfx.cheer();
      for (let k = 0; k < A.length; k += Math.max(1, Math.floor(A.length / 12))) this.particles.burst(A[k].lx, A[k].ly, 10);
      this.particles.burst(W / 2, H * 0.4, 50);
    } else this.app.sfx.meh();
  }

  next() {
    if (this.li >= NLEVELS - 1) { this.finish(); return; }
    this.li += 1;
    this.buildLevel(this.li);
    this.phase = "ready"; this.phaseT = 0; this.lastCount = null;
    this.app.transition();
  }

  score() {
    let s = 0;
    this.results.forEach((r, i) => {
      if (!r) return;
      s += r.won ? 22 + 11.33 * clamp((TU.limit[i] - r.time) / (TU.limit[i] - TU.fast[i]), 0, 1) : 18 * r.frac;
    });
    return Math.round(clamp(s, 0, 100));
  }

  summary() {
    const won = this.results.filter((r) => r && r.won).map((r) => r.name);
    if (won.length === NLEVELS) return T("encen.resum_tot", "Has organitzat {llista}.", { llista: listCa(won) });
    if (won.length === 0) return T("encen.resum_cap", "Encara falta gent: la vaga s'organitza zona a zona.");
    // no counts or scores at the end (no «n de 3»): only what was organised
    return T("encen.resum_alguns", "Has organitzat {llista}. La vaga s'organitza zona a zona!", { llista: listCa(won) });
  }

  finish() {
    if (this.done) return;
    if (this.level && !this.results[this.li] && this.phase === "play") {
      this.results[this.li] = { i: this.li, won: false, time: this.levelT, frac: this.bestFrac,
        name: this.level.terr.name, lit: this.lit, total: this.level.areas.length, area: this.area };
    }
    this.done = true;
    window.removeEventListener("tema", this.onTheme);
    this.app.finishGame("encen", { score: this.score(), summary: this.summary(), facts: this.facts.slice() });
  }

  // --- update -----------------------------------------------------------------
  update(dt) {
    if (this.done) return;
    this.t += dt;
    this.phaseT += dt;
    this.sfxT -= dt;
    this.particles.update(dt);
    for (const e of this.embers) { e.t += dt; e.x += e.vx * dt; e.y += e.vy * dt; }
    this.embers = this.embers.filter((e) => e.t < e.life);
    if (this.level && (this.phase === "play" || this.phase === "ready")) this.updateHands(dt);
    const countdown = (total) => {
      const c = this.phaseT < total - 3 ? null : Math.ceil(total - this.phaseT);
      if (c !== this.lastCount) { this.lastCount = c; if (c) this.app.sfx.tick(); }
    };
    switch (this.phase) {
      case "howto": this.updateHowto(dt); break;
      case "ready": countdown(this.readyDur()); if (this.phaseT >= this.readyDur()) this.startPlay(); break;
      case "play": this.simulate(dt); break;
      case "card": if (this.phaseT >= this.cardDur()) this.next(); break;
      default: break;
    }
  }

  // «Com es juga»: a raised hand (once it has come down) moves on after the reading time, or it goes on alone
  updateHowto(dt) {
    const r = this.app.input.anyRaisedFor();
    if (r === 0) this.raiseArmed = true;
    this.raiseT = this.raiseArmed && this.phaseT > HOWTO_MIN_S && r > 0 ? this.raiseT + dt : 0;
    if (this.raiseT >= RAISE_S || this.phaseT >= HOWTO_AUTO_S || (this.phaseT > HOWTO_MIN_S && this.app.input.keys.has("Space"))) {
      if (this.raiseT >= RAISE_S || (this.phaseT > HOWTO_MIN_S && this.app.input.keys.has("Space"))) this.app.ack();
      this.phase = "ready"; this.phaseT = 0; this.lastCount = null;
      this.app.transition();
    }
  }

  readyDur() { return this.li === 0 ? READY_FIRST_S : READY_S; }

  cardDur() {
    if (this.li >= NLEVELS - 1) return CARD_LAST_S;
    const r = this.results[this.li];
    return r && r.won ? CARD_WON_S : CARD_FAIL_S;
  }

  // Track each hand: smoothed speed, motion trail, area under it, time spent still
  updateHands(dt) {
    const L = this.level, A = L.areas;
    const seen = new Set();
    for (const c of this.app.input.cursors()) {
      const key = c.side || "r";
      seen.add(key);
      let h = this.hands[key];
      if (!h) { h = this.hands[key] = { x: c.x, y: c.y, speed: 0, trail: [], stillT: 0, area: -1, f: TU.stillFactor }; }
      const d = Math.hypot(c.x - h.x, c.y - h.y);
      const inst = d > 450 ? 0 : d / Math.max(dt, 1e-3); // a jump (re-detection) is not movement
      h.speed += (inst - h.speed) * Math.min(1, dt * 10);
      h.x = c.x; h.y = c.y;
      h.trail.push({ x: c.x, y: c.y, t: this.t });
      while (h.trail.length && this.t - h.trail[0].t > 0.35) h.trail.shift();
      h.f = TU.stillFactor + (1 - TU.stillFactor) * clamp((h.speed - TU.speedMin) / (TU.speedFull - TU.speedMin), 0, 1);
      h.area = -1;
      for (let k = A.length - 1; k >= 0; k--) if (pointInArea(A[k], c.x, c.y)) { h.area = k; break; }
      const needsWork = h.area >= 0 && L.areaFrac[h.area] < 1;
      // the «Mou la mà!» hint only appears after a long, total stillness on an area that needs heat
      h.stillT = this.phase === "play" && needsWork && h.speed < TU.speedMin ? h.stillT + dt : 0;
    }
    for (const k of Object.keys(this.hands)) if (!seen.has(k)) delete this.hands[k];
  }

  simulate(dt) {
    const L = this.level, A = L.areas, i = this.li, input = this.app.input, sfx = this.app.sfx;
    this.levelT += dt;
    if (this.goT > 0) this.goT -= dt;
    const cells = L.cells, n = cells.n, v = L.v, v2 = L.v2, nb = cells.nb;
    const dec = TU.dec[i] * (L.decK || 1) * (input.oneArm ? TU.oneArmCool : 1);
    const sp = TU.spread[i] / 6;
    // cooling + contagion from lit neighbour cells; organised (lit) areas cool slower
    const org = L.orgFlag || (L.orgFlag = new Float32Array(A.length));
    for (let k = 0; k < A.length; k++) org[k] = A[k].lit ? TU.orgCool : 1;
    const area = cells.area;
    for (let c = 0; c < n; c++) {
      const vc = v[c];
      let s = 0;
      for (let k = c * 6, e = k + 6; k < e; k++) {
        const j = nb[k];
        if (j >= 0) { const vj = v[j]; if (vj >= LIT && vj > vc) s += vj - vc; }
      }
      v2[c] = vc + (sp * s - dec * org[area[c]]) * dt;
    }
    // heating: proportional to hand speed
    for (const h of Object.values(this.hands)) {
      const add = TU.heat[i] * h.f * dt;
      let any = false;
      cellsInCircle(cells, h.x, h.y, TU.brushR[this.li], (c) => { v2[c] += add; if (v[c] < 1) any = true; });
      if (any) this.spawnEmbers(h, dt * h.f);
    }
    const litCells = L.areaLitCells;
    litCells.fill(0);
    let litTotal = 0;
    for (let c = 0; c < n; c++) {
      const x = v2[c] < 0 ? 0 : v2[c] > 1 ? 1 : v2[c];
      v[c] = x;
      if (x >= LIT) { litCells[cells.area[c]]++; litTotal++; }
    }
    let lit = 0, newlyLit = 0;
    A.forEach((a, k) => {
      const frac = litCells[k] / Math.max(1, cells.areaCount[k]);
      L.areaFrac[k] = Math.min(1, frac / L.areaLit);
      const was = a.lit;
      // hysteresis: a lit area only goes out when clearly below the threshold (forgiving hold)
      a.lit = frac >= (was ? L.areaLit - TU.litHyst : L.areaLit) - 1e-6;
      if (a.lit) { lit++; if (!was) newlyLit++; }
    });
    if (newlyLit && this.sfxT <= 0) { sfx.spark(lit / Math.max(1, A.length)); this.sfxT = 0.12; }
    this.lit = lit;
    // the goal is a share of the whole map organised at once, wherever it is
    this.area = litTotal / Math.max(1, n);
    const goal = this.winArea();
    this.bestFrac = Math.max(this.bestFrac, clamp(this.area / goal, 0, 1));
    // hysteresis while holding: a short dip (a hand crossing an already organised zone) does not
    // throw away the countdown
    if (this.area >= (this.holdT > 0 ? goal - TU.winHyst : goal)) {
      if (this.holdT === 0) sfx.lock();
      this.holdT += dt;
      const s = Math.ceil(HOLD_S - this.holdT);
      if (s !== this.holdTick) { if (this.holdTick !== null) sfx.tick(); this.holdTick = s; }
      if (this.holdT >= HOLD_S) this.endLevel(true);
    } else {
      if (this.holdT > 0.4) sfx.bad();
      this.holdT = 0; this.holdTick = null;
      if (this.levelT >= TU.limit[i]) this.endLevel(false);
    }
  }

  spawnEmbers(c, dt) {
    this.emberAcc += 40 * dt;
    while (this.emberAcc >= 1 && this.embers.length < 200) {
      this.emberAcc -= 1;
      const a = Math.random() * Math.PI * 2, r = TU.brushR[this.li] * (0.3 + Math.random() * 0.7);
      this.embers.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, vx: (Math.random() - 0.5) * 60,
        vy: -110 - Math.random() * 150, t: 0, life: 0.5 + Math.random() * 0.4, hot: Math.random() < 0.5, r: 4 + Math.random() * 5 });
    }
    if (this.emberAcc > 1) this.emberAcc = 0;
  }

  // --- drawing --------------------------------------------------------------
  // Colours derived from the live palette; recomputed whenever the theme changes
  palette() {
    const sig = themeSig();
    if (this.pal && this.pal.sig === sig) return this.pal;
    // "organising" ramp from the theme: heatCold -> heatMint -> heatMid (at the "organised"
    // threshold) -> heatHot (deep accent); hatching from the threshold keeps it readable without colour
    const cold = C.heatCold || C.paper2, mid = C.heatMid || C.teal, hot = C.heatHot || C.teal;
    const mint = C.heatMint || mix(mid, C.white, 0.6);
    const MINT_AT = 0.3;
    const ramp = (v) => (v < MINT_AT ? mix(cold, mint, v / MINT_AT)
      : v < LIT ? mix(mint, mid, (v - MINT_AT) / (LIT - MINT_AT)) : mix(mid, hot, (v - LIT) / (1 - LIT)));
    this.pal = {
      sig, mid, hot, mint,
      buckets: Array.from({ length: NB }, (_, q) => ramp(q / (NB - 1))),
      base: mix(cold, C.ink, 0.13),
      hatch: alpha(C.white, 0.6),
      border: alpha(C.ink, 0.65),
      veil: alpha(C.paper, 0.6),
      band: alpha(C.paper, 0.93),
      line: alpha(C.ink, 0.2),
      track: alpha(C.ink, 0.12),
      litBar: alpha(mid, 0.45),
    };
    return this.pal;
  }

  fitSize(g, str, size, maxW, kind = "title", weight = 400) { return uiFit(g, str, size, maxW, kind, weight); }

  draw(g) {
    if (this.phase === "howto") { this.drawHowto(g); return; }
    if (!this.level) return;
    const ph = this.phase;
    this.palette();
    g.save();
    g.globalAlpha = ph === "ready" ? 0.25 + 0.75 * easeOut(this.phaseT / 0.8) : 1;
    this.drawMap(g);
    g.restore();
    // map attribution is always visible (ODbL / CC BY)
    if (this.level.credit) text(g, this.level.credit, W / 2, H - 14, { size: 20, color: C.inkSoft, align: "center", maxW: LAYOUT.footW });
    this.drawEmbers(g);
    this.app.drawSilhouette(g, { alpha: 0.12 });
    this.particles.draw(g);
    if (ph === "play" || ph === "ready") this.drawHud(g);
    if (ph === "play" || ph === "ready") this.drawBrushes(g);
    if (ph === "play" && this.goT > 0) this.halo(g, T("encen.som_hi", "SOM-HI!"), W / 2, H * 0.55, 150, { kind: "title", color: C.teal, alpha: clamp(this.goT / 0.5, 0, 1) });
    if (ph === "ready") this.drawReady(g);
    else if (ph === "card") this.drawCard(g);
    if (ph !== "play" && ph !== "ready") this.app.drawCursors(g);
  }

  // «Com es juga»: three stickman cards (wave, sweep the whole map, pass the flag and hold)
  drawHowto(g) {
    const inp = this.app.input;
    this.app.drawSilhouette(g, { alpha: 0.08 });
    drawTutorial(g, {
      title: T("joc.encen", "Encén la vaga"),
      block: T("encen.com_es_juga", "Com es juga"),
      explain: inp.oneArm
        ? T("encen.com.text_una", "Una vaga no es fa, es construeix: passa la mà per tot el mapa per agitar i fer créixer l'organització per a la vaga. Aconsegueix mantenir mobilitzada la major part del mapa durant 5 segons per passar al següent nivell.")
        : T("encen.com.text", "Una vaga no es fa, es construeix: passa les mans per tot el mapa per agitar i fer créixer l'organització per a la vaga. Aconsegueix mantenir mobilitzada la major part del mapa durant 5 segons per passar al següent nivell."),
      t: this.phaseT,
      cards: encenCards(!!inp.oneArm, T),
    });
    drawEncenGoal(g, T("encen.com.objectiu", "Mobilitza el teu entorn"));
    if (this.phaseT > HOWTO_MIN_S) {
      const p = this.raiseArmed ? clamp(this.raiseT / RAISE_S, 0, 1) : 0;
      drawFooterHint(g, T("encen.com.continua", "Aixeca la mà per començar"), p, { mouse: inp.usingMouse, waitT: this.phaseT - HOWTO_MIN_S });
    }
    this.app.drawCursors(g, { alpha: 0.7 });
  }

  // Sticker-style label: card ink with a card-coloured halo, legible on any map colour and any theme
  halo(g, str, x, y, size, { kind = "body", weight = 700, color = C.cardInk, haloColor = C.card, align = "center", alpha: al = 1, lw = null } = {}) {
    g.save();
    g.globalAlpha *= al;
    font(g, size, kind, weight);
    g.textAlign = align;
    g.textBaseline = "alphabetic";
    g.lineJoin = "round";
    g.lineWidth = lw ?? Math.max(5, size * 0.24);
    g.strokeStyle = haloColor;
    g.strokeText(str, x, y);
    g.fillStyle = color;
    g.fillText(str, x, y);
    g.restore();
  }

  // Short form of an area name for crowded maps: «Mion - Puigberenguer - Miralpeix» -> «Mion»
  abbrev(nom) {
    const s = String(nom).replace(/\s*\([^)]*\)\s*/g, " ").trim();
    const first = s.split(/\s+[-–—·\/]\s+|,\s*/)[0].trim();
    return first && first !== nom ? first : null;
  }

  fitLabel(g, a, only = null) {
    const geo = this.level.isGeo;
    const maxW = geo ? a.lr * 2.5 : a.lr * 2 + 20;
    const maxH = geo ? a.lr * 1.8 : a.lr * 1.4;
    const short = a.nom.replace(/\s*\([^)]*\)\s*/g, " ").trim();
    const names = only ? [only] : short && short !== a.nom ? [a.nom, short] : [a.nom];
    for (const name of names) {
      const words = name.split(/\s+/).filter(Boolean);
      for (const size of geo ? [28, 24, 20] : [34, 30, 26]) {
        font(g, size, "body", 700);
        const options = [[name]];
        if (words.length > 1) {
          let best = null;
          for (let k = 1; k < words.length; k++) {
            const l1 = words.slice(0, k).join(" "), l2 = words.slice(k).join(" ");
            const w = Math.max(g.measureText(l1).width, g.measureText(l2).width);
            if (!best || w < best.w) best = { w, lines: [l1, l2] };
          }
          options.push(best.lines);
          if (!geo && words.length > 2) {
            const lines = []; let line = "";
            for (const w of words) { const c = line ? line + " " + w : w; if (line && g.measureText(c).width > maxW) { lines.push(line); line = w; } else line = c; }
            if (line) lines.push(line);
            if (lines.length <= 3) options.push(lines);
          }
        }
        for (const lines of options) {
          const w = Math.max(...lines.map((l) => g.measureText(l).width));
          if (w <= maxW && lines.length * size * 1.05 <= maxH) return { size, lines };
        }
      }
    }
    return null;
  }

  // Static overlay (paper outside the territory, thin borders, names, inset frames) + a cell layer
  // updated incrementally: only cells whose colour bucket changed are repainted each frame.
  // Both are rebuilt when the palette changes.
  ensureLayers(L) {
    const pal = this.palette();
    if (L.layer && L.layerSig === pal.sig) return;
    L.layerSig = pal.sig;
    const A = L.areas, cells = L.cells;
    const hr = cells.s * 0.9;
    if (!L.union) {
      L.union = new Path2D();
      for (const a of A) L.union.addPath(a.path);
    }
    const cv = (L.layer && L.layer.cv) || document.createElement("canvas");
    cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    c.fillStyle = pal.base;
    c.fillRect(0, 0, W, H);
    const pc = document.createElement("canvas");
    pc.width = pc.height = 16;
    const p = pc.getContext("2d");
    p.strokeStyle = pal.hatch; p.lineWidth = 4;
    p.beginPath(); p.moveTo(-16, 32); p.lineTo(32, -16); p.moveTo(-16, 16); p.lineTo(16, -16); p.moveTo(0, 32); p.lineTo(32, 0); p.stroke();
    L.layer = { cv, c, hr, pat: c.createPattern(pc, "repeat"), last: new Int16Array(cells.n).fill(-1), litKey: null, lc: null };
    const ov = document.createElement("canvas");
    ov.width = W; ov.height = H;
    const o = ov.getContext("2d");
    o.fillStyle = C.paper;
    o.fillRect(0, 0, W, H);
    o.globalCompositeOperation = "destination-out";
    o.fill(L.union);
    o.globalCompositeOperation = "source-over";
    if (!L.isGeo && L.map.links) {
      o.save();
      o.strokeStyle = C.ink; o.globalAlpha = 0.25; o.lineWidth = 4; o.setLineDash([2, 12]); o.lineCap = "round";
      for (const [i, j] of L.map.links) { o.beginPath(); o.moveTo(A[i].lx, A[i].ly); o.lineTo(A[j].lx, A[j].ly); o.stroke(); }
      o.restore();
    }
    o.lineJoin = "round";
    o.strokeStyle = pal.border;
    o.lineWidth = L.isGeo ? 1.6 : 3;
    for (const a of A) o.stroke(a.path);
    // shifted areas (e.g. l'Alguer) get a dashed inset frame
    o.save();
    o.setLineDash([10, 8]); o.lineWidth = 2.5; o.strokeStyle = C.inkSoft;
    for (const a of A) if (a.inset) o.strokeRect(a.minX - 14, a.minY - 14, a.maxX - a.minX + 28, a.maxY - a.minY + 28);
    o.restore();
    // context areas (outside the playable view): faint fill and dashed border, never heated
    const F = L.frame;
    if (L.context.length) {
      o.save();
      o.fillStyle = alpha(C.ink, 0.07); o.strokeStyle = alpha(C.ink, 0.35); o.lineWidth = 1.5; o.setLineDash([6, 6]);
      for (const a of L.context) { o.fill(a.path); o.stroke(a.path); }
      // playable areas lying inside a context area (enclaves) stay clear of the context tint
      o.globalCompositeOperation = "destination-out"; o.setLineDash([]);
      o.fill(L.union);
      o.restore();
      o.lineJoin = "round"; o.strokeStyle = pal.border; o.lineWidth = L.isGeo ? 1.6 : 3;
      for (const a of A) o.stroke(a.path);
    }
    this.drawRivers(o, L);
    // labels live on their own layer, drawn after the organised-area outlines so names stay on top
    const lb = (L.labelLayer && L.labelLayer.width === W) ? L.labelLayer : document.createElement("canvas");
    lb.width = W; lb.height = H;
    const lt = lb.getContext("2d");
    // labels: biggest areas first; a label that would collide with one already placed (or leave the
    // frame) tries the short name, then is hidden (the hover tooltip still names the area)
    const placed = [];
    const boxOf = (a, lab) => {
      font(lt, lab.size, "body", 700);
      const w = Math.max(...lab.lines.map((l) => lt.measureText(l).width)), h = lab.lines.length * lab.size * 1.05;
      return { x0: a.lx - w / 2 - 6, x1: a.lx + w / 2 + 6, y0: a.ly - h / 2 - 3, y1: a.ly + h / 2 + 3 };
    };
    const free = (b) => !placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0)
      && (!F || (b.x0 >= F.x0 && b.x1 <= F.x1 && b.y0 >= F.y0 && b.y1 <= F.y1));
    const place = (a) => {
      if (a.label === undefined) a.label = this.fitLabel(lt, a);
      const ab = this.abbrev(a.nom);
      if (a.labelShort === undefined) a.labelShort = ab ? this.fitLabel(lt, a, ab) : null;
      for (const lab of [a.label, a.labelShort]) {
        if (!lab) continue;
        const b = boxOf(a, lab);
        if (free(b)) { placed.push(b); return lab; }
      }
      // small isolated areas (no neighbours: el Xup, islands): no room inside, but a free spot just below
      if (!a.context && !(a.nb && a.nb.length)) {
        const lab = { size: 22, lines: [a.nom] };
        const at = { lx: (a.minX + a.maxX) / 2, ly: a.maxY + 22 };
        const b = boxOf(at, lab);
        // only where the spot below is not another area (otherwise it would name the wrong place)
        const onOther = A.some((q) => q !== a && pointInArea(q, at.lx, at.ly));
        if (!onOther && free(b) && b.y0 > 150 && b.y1 < H - 110) { placed.push(b); a.lxOut = at.lx; a.lyOut = at.ly; return { ...lab, out: true }; }
      }
      return null;
    };
    for (const a of [...A].sort((p, q) => q.lr - p.lr)) {
      a.shown = L.noLabels ? null : place(a);
      if (!a.shown) continue;
      const { size, lines, out } = a.shown;
      const lx = out ? a.lxOut : a.lx, ly = out ? a.lyOut : a.ly;
      let y = ly - ((lines.length - 1) * size * 1.05) / 2 + size * 0.36;
      for (const ln of lines) { this.halo(lt, ln, lx, y, size, { lw: Math.max(4, size * 0.22) }); y += size * 1.05; }
    }
    // context names: small and muted, only where there is room
    for (const a of [...L.context].sort((p, q) => q.lr - p.lr)) {
      if (a.lr < 24 || (F && (a.lx < F.x0 || a.lx > F.x1 || a.ly < F.y0 || a.ly > F.y1))) continue;
      const lab = place(a);
      if (!lab) continue;
      const size = Math.min(lab.size, 22);
      let y = a.ly - ((lab.lines.length - 1) * size * 1.05) / 2 + size * 0.36;
      for (const ln of lab.lines) { text(lt, ln, a.lx, y, { size, weight: 700, align: "center", color: alpha(C.ink, 0.55) }); y += size * 1.05; }
    }
    L.overlay = ov;
    L.labelLayer = lb;
  }

  drawMap(g) {
    const L = this.level, A = L.areas, cells = L.cells, v = L.v;
    this.ensureLayers(L);
    const pal = this.pal;
    const { c, hr, pat, last } = L.layer;
    // repaint changed cells, batched by colour bucket (+ hatching for lit cells)
    const batches = new Array(NB * 2);
    for (let i = 0; i < cells.n; i++) {
      const x = v[i];
      const code = Math.min(NB - 1, Math.floor(x * (NB - 1) + 0.5)) + (x >= LIT ? NB : 0);
      if (code === last[i]) continue;
      last[i] = code;
      (batches[code] || (batches[code] = [])).push(i);
    }
    for (let code = 0; code < NB * 2; code++) {
      const list = batches[code];
      if (!list) continue;
      c.beginPath();
      for (const i of list) addHex(c, cells.x[i], cells.y[i], hr);
      c.fillStyle = pal.buckets[code % NB];
      c.fill();
      if (code >= NB) { c.fillStyle = pat; c.fill(); }
    }
    const F = L.frame;
    g.save();
    if (F) { g.beginPath(); g.rect(F.x0, F.y0, F.x1 - F.x0, F.y1 - F.y0); g.clip(); }
    g.drawImage(L.layer.cv, 0, 0, W, H);
    g.drawImage(L.overlay, 0, 0, W, H);
    // lit areas get a thick outline (state not shown by colour only); cached until the set changes
    let key = "";
    for (let k = 0; k < A.length; k++) key += A[k].lit ? "1" : "0";
    if (key !== L.layer.litKey) {
      L.layer.litKey = key;
      if (!L.layer.lc) { L.layer.lc = document.createElement("canvas"); L.layer.lc.width = W; L.layer.lc.height = H; }
      const o = L.layer.lc.getContext("2d");
      o.clearRect(0, 0, W, H);
      o.lineJoin = "round";
      o.strokeStyle = C.ink;
      o.lineWidth = L.isGeo ? 3.5 : 6;
      for (const a of A) if (a.lit) o.stroke(a.path);
    }
    if (key.includes("1")) g.drawImage(L.layer.lc, 0, 0, W, H);
    if (L.labelLayer) g.drawImage(L.labelLayer, 0, 0, W, H);
    g.restore();
    // framed (cropped) view: a thin frame says «the city continues beyond this»
    if (F) { g.save(); g.strokeStyle = alpha(C.ink, 0.6); g.lineWidth = 2; g.strokeRect(F.x0, F.y0, F.x1 - F.x0, F.y1 - F.y0); g.restore(); }
  }

  // Optional decoration: rivers (geo.decoracio.rius = [{ nom, paths: [[[lon, lat], …], …] }] or { path: [[lon, lat], …] })
  drawRivers(o, L) {
    const rius = L.geo && L.geo.decoracio && Array.isArray(L.geo.decoracio.rius) ? L.geo.decoracio.rius : [];
    const proj = L.map.proj;
    if (!rius.length || !proj) return;
    o.save();
    o.lineCap = "round"; o.lineJoin = "round";
    for (const r of rius) {
      const lines = Array.isArray(r.paths) ? r.paths : Array.isArray(r.path) ? [r.path] : [];
      for (const ln of lines) {
        const pts = (ln || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map(proj);
        if (pts.length < 2) continue;
        o.beginPath(); pts.forEach(([x, y], i) => (i ? o.lineTo(x, y) : o.moveTo(x, y)));
        o.strokeStyle = C.card; o.lineWidth = 9; o.stroke();
        o.strokeStyle = C.cardLine; o.lineWidth = 4; o.stroke();
      }
    }
    o.restore();
  }

  drawEmbers(g) {
    g.save();
    for (const e of this.embers) {
      g.globalAlpha = 1 - e.t / e.life;
      g.fillStyle = e.hot ? this.pal.mid : this.pal.mint;
      g.beginPath(); g.arc(e.x, e.y, e.r * (1 - 0.5 * e.t / e.life), 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  drawBrushes(g) {
    const L = this.level, A = L.areas, pal = this.pal;
    for (const h of Object.values(this.hands)) {
      // motion trail: one smooth tapered ribbon (≤ 20 most recent points, 0.35 s), wider and more opaque the faster
      // the hand moves; heat colours of the theme (mid → hot when waving hard), light core
      if (h.trail.length > 1) {
        drawTrail(g, h.trail.slice(-20), { width: 14 + 40 * h.f, color: h.f > 0.6 ? C.heatHot : pal.mid,
          alpha: 0.35 + 0.55 * h.f, core: C.white, coreAlpha: 0.5 });
      }
      g.save();
      g.fillStyle = alpha(C.white, 0.15 + 0.15 * h.f);
      g.beginPath(); g.arc(h.x, h.y, TU.brushR[this.li], 0, Math.PI * 2); g.fill();
      g.lineWidth = 9; g.strokeStyle = C.white; g.stroke();
      g.lineWidth = 4 + 3 * h.f; g.strokeStyle = h.f > 0.6 ? C.heatHot : C.cardInk; g.stroke();
      g.restore();
      const a = h.area >= 0 ? A[h.area] : null;
      // "mou la mà!" hint when a hand rests still on an area that still needs heat
      if (h.stillT > 3) {
        const wob = 0;
        const label = T("encen.agita", "Mou la mà!");
        font(g, 34, "body", 700);
        const w = g.measureText(label).width + 44;
        const bx = clamp(h.x + TU.brushR[this.li] * 0.75, 40, W - w - 40), by = h.y + TU.brushR[this.li] * 0.65;
        g.save();
        g.fillStyle = C.hl; g.strokeStyle = C.cardInk; g.lineWidth = 3;
        rrect(g, bx + wob, by, w, 52, 4); g.fill(); g.stroke();
        g.restore();
        text(g, label, bx + wob + w / 2, by + 37, { size: 34, weight: 700, align: "center", color: C.hlText });
      }
      if (a && this.phase === "play" && !L.noLabels) {
        const label = a.lit
          ? T("encen.tooltip_fet", "{nom} · {organitzat}", { nom: a.nom, organitzat: this.litWordOne(L) })
          : T("encen.tooltip", "{nom}", { nom: a.nom });
        font(g, 28, "body", 700);
        const w = g.measureText(label).width + 36;
        const x = clamp(h.x - w / 2, 10, W - w - 10);
        const y = Math.min(LAYOUT.footY - 70, h.y - TU.brushR[this.li] - 62 < 140 ? h.y + TU.brushR[this.li] + 14 : h.y - TU.brushR[this.li] - 62);
        g.save();
        g.fillStyle = C.card; g.strokeStyle = a.lit ? C.band : C.cardLine; g.lineWidth = a.lit ? 5 : 3;
        rrect(g, x, y, w, 48, 4); g.fill(); g.stroke();
        g.restore();
        text(g, label, x + w / 2, y + 34, { size: 28, weight: 700, align: "center", color: C.cardInk });
      }
    }
  }

  drawHud(g) {
    const L = this.level, A = L.areas, pal = this.pal;
    // the gauge is the win condition: share of the whole map organised right now, with its target
    const area = this.phase === "play" ? (this.area || 0) : 0;
    const goal = this.winArea();
    const lit = this.phase === "play" ? (this.lit || 0) : 0;
    g.save();
    g.fillStyle = pal.band;
    g.fillRect(0, 0, W, 140);
    g.fillStyle = pal.line;
    g.fillRect(0, 140, W, 3);
    g.restore();
    text(g, L.terr.upper, 40, 92, { size: this.fitSize(g, L.terr.upper, 76, 560), kind: "title", color: C.ink });
    // no labels: the stretch past the target is tinted as the zone to reach, the target carries a
    // flag, and reaching it turns the flag into the ✓ badge and the frame and % into the hot colour
    const bx = 640, by = 44, bw = 800, bh = 56;
    const gx = bx + bw * goal, reached = area >= goal;
    const hot = C.heatHot || C.teal, ok = C.teal;
    // bars are white cards: hatched accent fill (state readable without colour), dark frame
    const barFill = () => hatch(g, C.heatHot || C.teal, C.heatMint || mix(C.heatMid || C.teal, C.white, 0.6), 20, 6);
    onCard(() => {
      g.save();
      g.fillStyle = C.card;
      rrect(g, bx, by, bw, bh, 4); g.fill();
      g.save(); g.clip();
      g.globalAlpha = 0.22; g.fillStyle = hot; g.fillRect(gx, by, bx + bw - gx, bh);
      g.globalAlpha = 1;
      g.fillStyle = barFill();
      g.fillRect(bx, by, bw * area, bh);
      g.restore();
      rrect(g, bx, by, bw, bh, 4);
      g.lineWidth = reached ? 6 : 3; g.strokeStyle = reached ? ok : C.cardLine; g.stroke();
      g.lineWidth = 6; g.strokeStyle = C.cardLine; g.lineCap = "round";
      g.beginPath(); g.moveTo(gx, by + 2); g.lineTo(gx, by + bh - 2); g.stroke();
      g.restore();
    });
    // target: a post with a flag on top (the ✓ badge once reached), on the header band
    g.save();
    g.lineCap = "round";
    g.lineWidth = 6; g.strokeStyle = C.ink;
    g.beginPath(); g.moveTo(gx, by - 4); g.lineTo(gx, by - (reached ? 10 : 30)); g.stroke();
    if (reached) drawOkBadge(g, gx, by - 18, 18);
    else {
      g.fillStyle = hot; g.strokeStyle = C.ink; g.lineWidth = 2;
      g.beginPath(); g.moveTo(gx + 2, by - 30); g.lineTo(gx + 34, by - 21); g.lineTo(gx + 2, by - 12); g.closePath(); g.fill(); g.stroke();
    }
    g.restore();
    text(g, T("encen.percent", "{n}%", { n: Math.round(area * 100) }), bx + bw + 22, by + 46, { size: 54, kind: "title", color: reached ? ok : C.ink });
    const lim = TU.limit[this.li];
    const left = clamp(lim - this.levelT, 0, lim);
    ring(g, 1830, 70, 44, left / lim, { color: left < 8 ? C.red : C.teal, back: pal.track, lw: 10 });
    centerText(g, String(Math.ceil(left)), 1830, 70, { size: 48, kind: "title", color: C.ink });
    // bottom: areas lit / hold progress (as in the mockup), only while playing
    if (this.phase !== "play") return;
    const w = 820, x = W / 2 - w / 2, y = LAYOUT.footY - 14, h = 56;   // footer centre zone, above the map credit
    const msg = this.holdT > 0
      ? T("encen.mantenho", "Aguanta! {s}", { s: Math.max(1, Math.ceil(HOLD_S - this.holdT)) })
      : T("encen.comptador", "{n} / {total} {unitat} {organitzats}", { n: lit, total: A.length, unitat: L.terr.unit, organitzats: this.litWord(L) });
    onCard(() => {
      g.save();
      g.fillStyle = C.card;
      rrect(g, x, y, w, h, 4); g.fill();
      g.save(); g.clip();
      if (this.holdT > 0) { g.fillStyle = barFill(); g.fillRect(x, y, (w * this.holdT) / HOLD_S, h); }
      else { g.fillStyle = C.heatMint || mix(C.heatMid || C.teal, C.white, 0.6); g.fillRect(x, y, (w * lit) / A.length, h); }
      g.restore();
      rrect(g, x, y, w, h, 4);
      g.lineWidth = this.holdT > 0 ? 5 : 3; g.strokeStyle = this.holdT > 0 ? (C.heatHot || C.teal) : C.cardLine; g.stroke();
      g.restore();
      this.halo(g, msg, W / 2, y + h / 2 + 38 * 0.355, 38, { lw: 6 });
    });
  }
  drawCountdown(g, total, x, y) {
    const left = Math.max(0, total - this.phaseT);
    if (left > 3) return false;
    const n = Math.max(1, Math.ceil(left));
    ring(g, x, y, 70, 1 - (left % 1 || 1), { color: C.red, back: this.pal.track, lw: 14 });
    centerText(g, String(n), x, y, { size: 110, kind: "title", color: C.red });
    return true;
  }

  // Overlay card (veiled field): optional small kicker, a big title, one line (two if it is long), an
  // optional small hint, and an optional auto-advance bar at its bottom. Returns the card's bottom y.
  drawTitleCard(g, title, line, { alpha: al = 1, y = 300, tone = "red", kicker = "", hint = "", autoK = null, size = 120 } = {}) {
    let bottom = y;
    g.save();
    g.globalAlpha *= al;
    onCard(() => {
      const two = line && measure(g, line, 46, "body", 700) > 1280;
      const top = kicker ? 64 : 0;
      const ty = y + top + 150, lineY = ty + 76, hintY = lineY + (two ? 50 : 0) + 58;
      const contentEnd = hint ? hintY : lineY + (two ? 50 : 0);
      const h = contentEnd - y + 46 + (autoK !== null ? 30 : 0);
      bottom = y + h;
      panel(g, W / 2 - 680, y, 1360, h, {});
      if (kicker) text(g, kicker, W / 2, y + 68, { size: 30, kind: "ample", align: "center", color: C.inkSoft, maxW: 1280 });
      text(g, title, W / 2, ty, { size, kind: "title", align: "center", color: C[tone] || C.red, maxW: 1280 });
      if (two) wrap(g, line, W / 2, lineY - 2, 1280, { size: 44, weight: 700, align: "center", color: C.ink, lineH: 1.2, maxLines: 2 });
      else if (line) text(g, line, W / 2, lineY, { size: 46, weight: 800, align: "center", color: C.ink, maxW: 1280 });
      if (hint) text(g, hint, W / 2, hintY, { size: 34, weight: 700, align: "center", color: C.inkSoft, maxW: 1280 });
      if (autoK !== null) {
        g.fillStyle = C.cardSoft; g.fillRect(W / 2 - 640, bottom - 26, 1280, 6);
        g.fillStyle = C.cardInkSoft; g.fillRect(W / 2 - 640, bottom - 26, 1280 * clamp(autoK, 0, 1), 6);
      }
    });
    g.restore();
    return bottom;
  }

  // Level card, as in «Final de mes»: «Nivell n de 3», the territory, and what it is in real numbers
  drawReady(g) {
    const L = this.level;
    if (L.popSum === undefined) L.popSum = (this.popFact(L) || {}).sum || null;
    const parts = T("encen.unitats", "{n} {unitat}", { n: L.areas.length, unitat: L.terr.unit });
    const line = L.popSum ? T("encen.unitats_pop", "{parts} · {hab} habitants", { parts, hab: fmtNum(L.popSum) }) : parts;
    const bottom = this.drawTitleCard(g, L.terr.upper, line, {
      alpha: easeOut(this.phaseT / 0.4), y: 220,
      kicker: T("encen.nivell", "Nivell {n} de {total}", { n: this.li + 1, total: NLEVELS }),
    });
    this.drawCountdown(g, this.readyDur(), W / 2, Math.max(720, bottom + 110));
  }

  // Result card: it moves on by itself (bar at its bottom). Success in the confirm colour, as in the
  // other games; the line says what the territory is (its people), never a contradictory count.
  drawCard(g) {
    const r = this.results[this.li];
    const L = this.level;
    const last = this.li >= NLEVELS - 1;
    const won = !!(r && r.won);
    const a = easeOut(this.phaseT / 0.35);
    g.save();
    g.globalAlpha = a;
    g.fillStyle = this.pal.veil; g.fillRect(0, 0, W, H);
    g.restore();
    let title, line, tone = "red";
    if (last) { title = T("encen.final", "VAGA GENERAL!"); line = this.summary(); }
    else if (won) {
      title = this.doneTitle(L);
      tone = "teal";
      if (L.popSum === undefined) L.popSum = (this.popFact(L) || {}).sum || null;
      line = L.popSum
        ? T("encen.fet_linia_pop", "Hi viuen {n} persones", { n: fmtNum(L.popSum) })
        : T("encen.unitats", "{n} {unitat}", { n: L.areas.length, unitat: L.terr.unit });
    } else { title = T("encen.falta", "ENCARA NO!"); line = T("encen.falta_linia", "Fan falta més mans."); }
    this.drawTitleCard(g, title, line, { alpha: a, tone, autoK: this.phaseT / this.cardDur() });
  }
}