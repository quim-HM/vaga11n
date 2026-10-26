# Versions per localitat

El joc és el mateix per a tothom; el que canvia d'un lloc a un altre és aquí. Cada carpeta és una versió
(`manresa`, `santpedor`, `valles-oriental`…) i `index.json` diu quines es publiquen i on.

| Minijoc / pantalla | Què és local | On es configura |
|---|---|---|
| «El preu (in)just» | Les preguntes locals (lloguer, renda, habitatges buits, HPO, desnonaments…) | `<id>/preguntes.json` (+ `joc1` a `lloc.json`) |
| «Final de mes» | Les tendències (quines sèries, en quin ordre, amb quina etiqueta) | `joc2` a `lloc.json` (+ `<id>/series.json`) |
| «Encén la vaga» | Els tres mapes (ciutat → comarca → territori final) | `joc3` a `lloc.json` |
| Pantalla final | El canal de difusió (enllaç i QR) i qualsevol altre text de `data/final.json` | `final` a `lloc.json` |
| Textos de la interfície | Qualsevol clau de `data/textos.json` | `textos` a `lloc.json` |
| Crèdits | Les fonts noves o amb una URL pròpia del lloc | `<id>/fonts.json` |

Tot el que no és a la carpeta d'una versió és comú i surt de `data/`: les preguntes de Catalunya i de l'Estat
(`preguntes_comunes.json`), les sèries (`series.json`), les fonts (`fonts.json`), els mapes (`geo/`), els lemes
(`final.json`) i els textos (`textos.json`). Quan una font comuna publica un any nou, s'actualitza una sola vegada
per a totes les versions.

## Fitxers d'una versió (`data/llocs/<id>/`)

| Fitxer | Obligatori | Contingut |
|---|---|---|
| `lloc.json` | sí | Manifest de la versió (vegeu més avall) |
| `preguntes.json` | sí | Preguntes locals: el mateix format que `data/preguntes_comunes.json` (enunciat, valor, unitat, any, àmbit, font, definició, confiança, rang, pas, escala, metàfora, revelació, nota, nota curta) |
| `series.json` + `series/*.csv` | no (`[]`) | Sèries locals per a «Final de mes». Com a `data/series.json`; el camp `fitxer` és relatiu a `data/` (`llocs/<id>/series/x.csv`). Camps opcionals: `subjecte` (p. ex. «el lloguer mitjà dels contractes nous a Santpedor», per a les frases del final) i `subjecte_plural` |
| `fonts.json` | no (`[]`) | Fonts noves, o fonts comunes amb el mateix `id` i una URL o còpia pròpia del lloc (substitueixen la comuna en aquesta versió) |

Les còpies dels fitxers originals van a `data/raw/llocs/<id>/` i el script que en treu les xifres a
`tools/build_lloc_<id>.py` (el de Manresa és la cadena `tools/build_data.py`). La recepta per fer les preguntes
d'una localitat nova és a [`docs/guia_preguntes_localitat.md`](../../docs/guia_preguntes_localitat.md), i les decisions
de cada versió a `docs/llocs/<id>_preguntes.md`.

## `lloc.json`

```jsonc
{
  "id": "santpedor",                 // = nom de la carpeta; minúscules, xifres i guions
  "nom": "Santpedor",                // surt al títol de la finestra i a la pàgina d'operador
  "tipus": "municipi",               // municipi | comarca (informatiu)
  "codis": { "ine": "08192", "comarca": "bages", "partit_judicial": "Manresa" },   // informatiu
  "joc1": {                          // «El preu (in)just»
    "comunes": "totes",              // o una llista d'ids de preguntes_comunes.json
    "excloure": []                   // ids comunes que aquesta versió no fa servir
  },
  "joc2": {                          // «Final de mes» (si no hi és: data/joc2.json)
    "any_base": 2015,
    "ordenar_per_pujada": true,
    "etapes": [
      { "serie": "salari_catalunya", "etiqueta": "Salaris" },
      { "opcions": [                 // la primera que tingui dades a l'any base i 5 anys seguits
        { "serie": "lloguer_bages", "etiqueta": "Lloguer al Bages" },
        { "serie": "lloguer_catalunya", "etiqueta": "Lloguer a Catalunya" } ] }
    ]
  },
  "joc3": {                          // «Encén la vaga»: ids de data/geo/index.json
    "ciutat": "",                    // "" = sense barris: comarca → Catalunya → territori final
    "comarca": "bages",
    "final": "ppcc"                  // ppcc | catalunya
  },
  "final": {                         // es fusiona amb data/final.json (camp a camp)
    "difusio": { "titol": "…", "subtitol": "…", "url": "https://…", "mostrar": true }
  },
  "textos": {}                       // claus de data/textos.json que canvien en aquesta versió
}
```

Les claus que comencen per `_` són comentaris. El QR de la pantalla final es genera a partir de `difusio.url`.
A la pàgina d'operador (tecla `O`) es poden canviar els mapes i el canal de difusió d'una instal·lació concreta
sense tocar aquests fitxers: es desen al navegador, separats per versió.

## Publicar: `index.json`

```json
{ "url_base": "https://quim-hm.github.io/vaga11n/", "arrel": "manresa",
  "publicats": ["manresa", "santpedor", "valles-oriental"] }
```

`tools/build_web.py` construeix totes les versions de `publicats`: `arrel` a `dist/` i les altres a `dist/<id>/`.
Cada versió només porta la seva carpeta, té el seu propi nom de memòria cau (funciona sense internet de manera
independent) i desa la configuració del navegador amb un nom propi, així que poden conviure al mateix domini.
`tools/build_web.py --lloc <id>` en fa només una a l'arrel de `dist/` (per allotjar-la en un altre lloc).

## Afegir una localitat

1. Crea `data/llocs/<id>/` amb `lloc.json`, `preguntes.json`, `series.json` i `fonts.json` (copia'ls d'una altra versió).
2. Fes les preguntes locals seguint la guia (`docs/guia_preguntes_localitat.md`) amb un `tools/build_lloc_<id>.py`.
3. Tria les tendències (`joc2`), els mapes (`joc3`) i el contacte (`final.difusio`).
4. Comprova-ho: `.venv\Scripts\python.exe tools\validate_data.py --lloc <id>` (0 errors) i juga-hi amb
   `python tools\build_web.py --lloc <id> --serve`, o sense construir-la: `?lloc=<id>&sim=1` al servidor de desenvolupament.
5. Afegeix `<id>` a `publicats` i publica (vegeu `AGENTS.md`).
