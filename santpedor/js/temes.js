// Colour themes. ui.js `C` is mutated in place so every module picks the new colours at draw time.
// Sources: vagageneral.org (--blau #00009E, --groc #FF0, --vermell red, --card #fff,
// --card-foreground #14183D; pages are a full blue field with yellow cartell headlines, white body
// text and white cards; the footer is yellow with blue text) and the printed poster / logo (yellow
// block or disc with heavy red «VAGA GENERAL / ONZE DE NOVEMBRE 2026» on blue).
//
// Every theme defines SURFACES with the same role names (ui.js SURFACE_KEYS):
//   bg    the campaign field: poster and transition screens (start, Hola, interludes, Més preguntes, final)
//   calm  the play surface (partial overrides of bg): games and dense text (credits). For a ~5-minute
//         session the saturated fields stay on the short poster/transition screens; where the player
//         concentrates (moving gameplay, questions, charts) the field is calmer but of the same family.
//   card  the white cards/panels (charts, metaphors, questions, overlays) and what is drawn inside
// Code reads C.ink / C.red / ...; contents of a card are drawn inside onCard(), which swaps in the
// card values. Data colours (red = «la realitat», blue = «tu», teal = OK/confirm, mustard = heat/coins)
// are therefore defined per surface so they always contrast with what is under them.
//
// Roles:  paper/paper2 surface and a tinted zone on it · ink/inkSoft text · head big titles
//         red/blue (+Soft) data · teal(+Soft) confirm · mustard coins/heat · yellowSoft tint
//         track ring tracks · shadow card shadows
// Globals: card/cardSoft/cardInk/cardInkSoft/cardLine (card look) · white (text/icons on saturated
//         fills) · band/bandText, hl/hlText (campaign bands, countdown badge) · heatCold/Mint/Mid/Hot
//         («Encén la vaga» map: cold → light tint → saturated accent when organised → deep accent;
//         yellow ramp in the blau-groc themes, red ramp in the groc-vermell themes)
//         · poster keys for start/final (see ui.js posterTitle)
//
// Families × intensity:
//   blau-groc-mes       the website: blue field on poster/transition screens, deep navy-blue play surface,
//                       yellow headlines, white text, white cards.
//   blau-groc-menys     white field, blue text and blue blocks; for bright rooms / washed-out projectors.
//   groc-vermell-mes    the poster's yellow block as the field (pale yellow play surface), red headlines, black-navy.
//   groc-vermell-menys  pale-yellow field, red headlines, white cards; the logo disc on the poster screens.
import { C, setSurfaces, SURFACE_KEYS } from "./ui.js";

const CARD = {
  paper: "#FFFFFF", ink: "#14183D", inkSoft: "#4B4F6E",
  red: "#D7000F", redSoft: "#FFCCD0", blue: "#00009E", blueSoft: "#D2D2F7",
  teal: "#0B7A75", tealSoft: "#C5E8E4", mustard: "#F2A900", yellowSoft: "#FFF59D",
  track: "rgba(20,24,61,0.14)", shadow: "rgba(20,24,61,0.18)",
};

export const THEMES = {
  "blau-groc-mes": {
    nom: "Blau i groc · més (camp blau)",
    bg: {
      paper: "#00009E", paper2: "#1B1BB4", ink: "#FFFFFF", inkSoft: "#D2D2F7", head: "#FFFF00",
      red: "#FF5A4E", redSoft: "#5C2A9E", blue: "#FFFF00", blueSoft: "#3434C4",
      teal: "#3FE0A5", tealSoft: "#1F5F9A", mustard: "#FFA51F", yellowSoft: "#3434C4",
      track: "rgba(255,255,255,0.24)", shadow: "rgba(0,0,30,0.5)",
    },
    card: { ...CARD, paper2: "#E4E4FA", head: "#00009E", red: "#E3000F" },
    // calm play surface: deep navy-blue (low chroma) instead of the saturated #00009E behind gameplay/dense text
    calm: { paper: "#12164F", paper2: "#1F2468", inkSoft: "#C9CBE8", red: "#FF6B5E", redSoft: "#4A2A6E", blueSoft: "#2A2F7A",
      tealSoft: "#1F4F7A", yellowSoft: "#2A2F7A", track: "rgba(255,255,255,0.2)", heatCold: "#272D7C", heatMid: "#FFE600", heatHot: "#F5B800" },
    cardLine: "#14183D",
    band: "#E3000F", bandText: "#FFFFFF", hl: "#FFFF00", hlText: "#00009E",
    heatCold: "#2626C2", heatMint: "#FFF59D", heatMid: "#FFE600", heatHot: "#F5B800",
    field: "#00009E", fieldInk: "#FFFF00", fieldSoft: "#FFFFFF", fieldSil: "#2A2AC4", footBg: "rgba(0,0,40,0.35)",
    titleBg: "#FFFF00", titleFg: "#E3000F", titleSub: "#E3000F",
    daltFg: "#FFFF00", ctaBg: "#FFFF00", ctaFg: "#00009E", cardAccent: "#00009E",
    btn: "#FFFF00", btnText: "#00009E", btnLine: "", btnHot: "#E3000F", btnHotText: "#FFFFFF",
  },
  "blau-groc-menys": {
    nom: "Blau i groc · menys (camp blanc)",
    bg: {
      paper: "#FFFFFF", paper2: "#E2E2FA", ink: "#00009E", inkSoft: "#3B3B8C", head: "#00009E",
      red: "#D7000F", redSoft: "#FFCCD0", blue: "#00009E", blueSoft: "#D2D2F7",
      teal: "#0B7A75", tealSoft: "#C5E8E4", mustard: "#E9A400", yellowSoft: "#FFF59D",
      track: "rgba(0,0,158,0.14)", shadow: "rgba(0,0,158,0.16)",
    },
    card: { ...CARD, paper2: "#E2E2FA", head: "#00009E" },
    // calm play surface: barely tinted white (less glare than pure white over 5 minutes)
    calm: { paper: "#F7F7FD", paper2: "#E8E8F8" },
    cardLine: "#00009E",
    band: "#00009E", bandText: "#FFFFFF", hl: "#FFFF00", hlText: "#00009E",
    heatCold: "#E3E4F5", heatMint: "#FFF3A0", heatMid: "#FFD500", heatHot: "#E0A800",
    field: "#FFFFFF", fieldInk: "#00009E", fieldSoft: "#3B3B8C", fieldSil: "#E2E2FA", footBg: "rgba(0,0,158,0.07)",
    titleBg: "", titleFg: "#00009E", titleSub: "#00009E", subBg: "#FFFF00",
    daltBg: "#00009E", daltFg: "#FFFF00", ctaBg: "#00009E", ctaFg: "#FFFFFF", cardAccent: "#00009E",
    btn: "#FFFF00", btnText: "#00009E", btnLine: "#00009E", btnHot: "#E3000F", btnHotText: "#FFFFFF",
  },
  "groc-vermell-mes": {
    nom: "Groc i vermell · més (camp groc)",
    bg: {
      paper: "#FFEC00", paper2: "#F2CF00", ink: "#14183D", inkSoft: "#3D3A50", head: "#E3000F",
      red: "#D7000F", redSoft: "#FFB199", blue: "#14183D", blueSoft: "#E6D45C",
      teal: "#06706A", tealSoft: "#CDE6A0", mustard: "#FF8A00", yellowSoft: "#FFF59D",
      track: "rgba(20,24,61,0.16)", shadow: "rgba(90,60,0,0.25)",
    },
    card: { ...CARD, paper2: "#FFF3B0", head: "#E3000F", blue: "#14183D", blueSoft: "#D6D8E6", mustard: "#FF8A00" },
    // calm play surface: pale yellow instead of the saturated poster yellow (no glare behind gameplay)
    calm: { paper: "#FFF6B3", paper2: "#FFEB80", head: "#C4000D", red: "#C4000D", inkSoft: "#45465E", yellowSoft: "#FFFBD0", heatCold: "#FFFFFF", heatMid: "#E8323A", heatHot: "#B0000C" },
    cardLine: "#14183D",
    band: "#D7000F", bandText: "#FFFF00", hl: "#14183D", hlText: "#FFEC00",
    heatCold: "#FFF7B0", heatMint: "#FFC9C4", heatMid: "#E8323A", heatHot: "#B0000C",
    field: "#FFEC00", fieldInk: "#14183D", fieldSoft: "#14183D", fieldSil: "#EDD500", footBg: "rgba(20,24,61,0.10)",
    titleBg: "", titleFg: "#E3000F", titleSub: "#E3000F",
    daltBg: "#E3000F", daltFg: "#FFEC00", ctaBg: "#14183D", ctaFg: "#FFEC00", cardAccent: "#D7000F",
    btn: "#14183D", btnText: "#FFEC00", btnLine: "", btnHot: "#D7000F", btnHotText: "#FFFFFF",
  },
  "groc-vermell-menys": {
    nom: "Groc i vermell · menys (camp groc clar #FFF9C9)",
    bg: {
      paper: "#FFF9C9", paper2: "#FFEF7A", ink: "#14183D", inkSoft: "#45465E", head: "#D7000F",
      red: "#D7000F", redSoft: "#FFC2B0", blue: "#14183D", blueSoft: "#E0DA9A",
      teal: "#06706A", tealSoft: "#CDE6A0", mustard: "#F08A00", yellowSoft: "#FFFBD0",
      track: "rgba(20,24,61,0.14)", shadow: "rgba(90,60,0,0.2)",
    },
    card: { ...CARD, paper2: "#FFF3B0", head: "#D7000F", blue: "#14183D", blueSoft: "#D6D8E6", mustard: "#F08A00" },
    calm: {},   // calm play surface: the field is already the calmest of the family
    cardLine: "#14183D",
    band: "#D7000F", bandText: "#FFFFFF", hl: "#FFFF00", hlText: "#14183D",
    heatCold: "#FFFFFF", heatMint: "#FFC9C4", heatMid: "#E8323A", heatHot: "#B0000C",
    field: "#FFF9C9", fieldInk: "#14183D", fieldSoft: "#45465E", fieldSil: "#FFE94D", footBg: "rgba(20,24,61,0.07)",
    titleBg: "", disc: "#FFFF00", discLine: "#D7000F", titleFg: "#D7000F", titleSub: "#D7000F",
    daltFg: "#14183D", ctaBg: "#D7000F", ctaFg: "#FFFFFF", cardAccent: "#D7000F",
    btn: "#FFFF00", btnText: "#14183D", btnLine: "#D7000F", btnHot: "#D7000F", btnHotText: "#FFFFFF",
  },
};

// Keys every theme gets unless it overrides them
const DEFAULTS = {
  white: "#FFFFFF", yellow: "#FFFF00", okFill: "#0B7A75",
  disc: "", discLine: "", subBg: "", titleBg: "", daltBg: "",
};

export const DEFAULT_THEME = "blau-groc-mes";
let current = null;

export function applyTheme(name) {
  const t = THEMES[name] || THEMES[DEFAULT_THEME];
  const id = THEMES[name] ? name : DEFAULT_THEME;
  if (current === id) return id;
  const { nom, bg: bg0, card: card0, calm: calm0, ...rest } = t;
  Object.assign(C, DEFAULTS, rest);
  // the heat ramp is a surface role too (the calm play surface may need its own cold colour)
  const heat = { heatCold: rest.heatCold, heatMid: rest.heatMid, heatHot: rest.heatHot };
  const bg = { ...heat, ...bg0 }, card = { ...heat, ...card0 }, calm = { ...bg, ...(calm0 || {}) };
  for (const k of SURFACE_KEYS) C[k] = bg[k];
  C.card = card.paper; C.cardSoft = card.paper2; C.cardInk = card.ink; C.cardInkSoft = card.inkSoft;
  setSurfaces(bg, card, calm);
  current = id;
  document.documentElement.style.background = C.paper;
  document.body.style.background = C.paper;
  window.dispatchEvent(new CustomEvent("tema", { detail: id }));
  return id;
}

export function currentTheme() { return current; }