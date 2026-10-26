# data/geo — geometries administratives simplificades

Geometries reals (no inventades) per al joc, en WGS84 lon/lat (5 decimals), simplificades per a pantalla 1920×1080.
`index.json` és el punt d'entrada: el nivell 1 tria una ciutat (`ciutats` → `barris/<INE>.json`), el nivell 2 una comarca
(`comarques` → `comarques/<slug>.json`) i el nivell 3 un mapa final (`final` → `ppcc.json` o `catalunya_comarques.json`).

| Fitxer | Contingut | Features | Mida | Tolerància DP | Font geometria | Població |
|---|---|---|---|---|---|---|
| `index.json` | ciutats (13), comarques (43) i mapes finals (2) | | ~8 KB | | | |
| `comarques/<slug>.json` (43) | municipis de cada comarca | 947 en total (3–68 per fitxer) | 1,5 MB en total, màx. 78 KB | extensió/1200 (16–56 m) | ICGC Divisions administratives v2r2 (CC BY 4.0) | Idescat, 1/1/2025 |
| `barris/<INE>.json` (13) | barris de ciutats | 352 en total | 275 KB en total, màx. 79 KB | extensió/1200 (3–14 m) | oficial (Barcelona, Girona, Reus) o OSM (ODbL) | Barcelona 1/1/2026, Reus 31/12/2024, Manresa 2023; la resta null |
| `ppcc.json` | Països Catalans (sense l'Alguer) | 91 | ~360 KB | 300 m | ICGC, ICV, IGEAR, IDEIB, IGN/Etalab, OSM | Idescat, INE, INSEE |
| `manresa_barris.json` | 18 barris de Manresa (ronda 1; mateix contingut que `barris/08113.json`, tolerància 6 m) | 18 | ~21 KB | 6 m | OpenStreetMap (ODbL) | Aj. Manresa, padró 2023 |
| `bages_municipis.json` | 30 municipis del Bages (ronda 1; mateix contingut que `comarques/bages.json`) | 30 | ~55 KB | 35 m | ICGC v2r2 (CC BY 4.0) | Idescat, 1/1/2025 |
| `catalunya_comarques.json` | 42 comarques (amb el Lluçanès) + Aran | 43 | ~137 KB | 180 m | ICGC v2r2 (CC BY 4.0) | Idescat, 1/1/2025 |
| `fonts_geo.json` | totes les fonts utilitzades (mateixos camps que `font`) | 25 | | | | |

## Esquema

```json
{ "id": "...", "titol": "...", "nivell": "manresa|bages|catalunya|comarca|ciutat|ppcc",
  "font": {"id","organisme","titol","titol_curt","url","data_consulta","tipus","llicencia","notes"},
  "bbox": [minLon, minLat, maxLon, maxLat],
  "features": [{"id","nom","poblacio","any_poblacio","font_poblacio","paths": [[[lon,lat],...], ...]}] }
```

* `ppcc.json` afegeix a cada feature `regio` i `font_geometria`.
* `index.json`: `ciutats[] = {id (INE), nom, comarca (slug), fitxer, n, font, tipus_font}`,
  `comarques[] = {id (slug), nom (amb article), codi (ICGC), fitxer, n}`, `final[] = {id, nom, fitxer, n}`.
* `paths` = anells exteriors tancats (primer punt = últim punt); els forats s'han eliminat.
* Identificadors: municipis = codi INE de 5 xifres (`08113` = Manresa; el codi Idescat/ICGC de 6 xifres és aquest + dígit
  de control); comarques catalanes = codi ICGC de 2 xifres; barris = `<INE>-<nn>` (Manresa i Barcelona: codi oficial del
  barri; Reus: camp `num` oficial; Girona i OSM: ordre alfabètic).
* **Enclavaments**: com que els forats s'eliminen, l'ordre de les features és significatiu: una feature el contorn de la
  qual envolta un enclavament d'una altra apareix **abans** que aquesta. **Dibuixeu en l'ordre del fitxer i feu el
  *hit-test* en ordre invers.** Exemples: el Xup dins Farreres–…–la Guia (Manresa); a comarques, enclavaments d'Urgell dins
  la Noguera, del Pla d'Urgell dins l'Urgell, etc.; a `ppcc.json`, Llívia (Cerdanya) dins l'Alta Cerdanya, València dins
  l'Horta Nord. Alguns enclavaments són illes < 0,5 % i s'han descartat. Al Bages queda un buit real (~1,1 km²,
  enclavament del Solsonès entre Cardona i Navàs).

## Ciutats amb barris (`barris/`)

| INE | Ciutat | Barris | Font geometria | Notes |
|---|---|---|---|---|
| 08019 | Barcelona | 73 | **Aj. Barcelona, Open Data BCN (CC BY 4.0)** | població padró 1/1/2026 |
| 17079 | Girona | 9 | **Aj. Girona, dades obertes (CC BY)** | grans barris oficials (Centre, Eixample, Est, Nord, Oest, Sud…); sense població |
| 43123 | Reus | 61 | **Aj. Reus, Open Data (CC BY)** | població 31/12/2024 (Aeroport, Pedra Estela i Pi de Bofarull sense dada) |
| 08113 | Manresa | 18 | OSM + noms/codis/població de l'Aj. Manresa | vegeu "Per què els barris de Manresa vénen d'OSM" |
| 08015 | Badalona | 34 | OSM | cobreix el 100 % del terme |
| 08101 | l'Hospitalet de Llobregat | 13 | OSM | 100 % |
| 08187 | Sabadell | 40 | OSM | 100 % |
| 08245 | Santa Coloma de Gramenet | 17 | OSM | 100 % ("Cemetiri Vell" corregit a "Cementiri Vell") |
| 08194 | Sant Adrià de Besòs | 6 | OSM (`admin_level` 9) | 100 % |
| 08279 | Terrassa | 40 | OSM | **només zona urbana** (28 % del terme; alguns barris aïllats) |
| 08307 | Vilanova i la Geltrú | 18 | OSM | **només zona urbana** (21 %) |
| 08124 | Mollet del Vallès | 13 | OSM | **només zona urbana** (75 %) |
| 08169 | el Prat de Llobregat | 10 | OSM | **només zona urbana** (8 %; la resta és aeroport i delta) |

Regla OSM (`build_barris_files`): municipi ≥ 20.000 hab. sense polígons oficials trobats, ≥ 5 relacions
`boundary=administrative` (`admin_level` 10, o 9 si no n'hi ha prou) que se solapen ≤ 3 % i cobreixen ≥ 85 % del terme
ICGC; o municipi ≥ 50.000 hab. amb ≥ 8 barris amb ≥ 80 % de la superfície en una sola peça (zona urbana). Descartats:
**Sant Boi** (les unitats OSM són polígons industrials; detectat a la previsualització, exclòs explícitament), Igualada,
Sant Feliu de Llobregat, Sant Andreu de la Barca, Calafell i Valls (cobertura parcial i < 50.000 hab.), Vic (massa poques
relacions) i municipis petits (Banyoles, Tona, Cornellà del Terri, Porqueres).
**Sense font fiable: Lleida, Tarragona, Mataró, Granollers, Igualada, Vic** — no s'ha trobat cap polígon oficial als
portals provats (CKAN/WFS municipals, AOC) ni barris a OSM; no s'han fet zones de seccions censals perquè no s'ha trobat
cap correspondència oficial secció→barri publicada.

## Països Catalans (`ppcc.json`)

Identificadors: `cat-XX` (codi comarcal ICGC), `val-XX` (codi ICV), `ib-07X` (consell insular), `ara-XX` (codi comarcal
d'Aragó), `cn-<slug>`, `ad`.

| `regio` | Unitats | Geometria | Població |
|---|---|---|---|
| Principat | 43 comarques | ICGC v2r2 | Idescat 1/1/2025 |
| País Valencià | **33** comarques: delimitació vigent de l'ICV, en què l'Horta Oest de 1987 està repartida entre l'Horta Sud i l'Horta Nord. Noms en català sense article | ICV (CC BY 4.0) | INE 1/1/2025, suma dels municipis (comarca segons ICV.Municipios) |
| Illes | 4 illes/consells (Mallorca, Menorca, Eivissa, Formentera); Mallorca no té comarques oficials | IDEIB/ICGIB (CC BY 4.0) | INE 1/1/2025 per illa |
| Franja | Ribagorça, Llitera, Baix Cinca, Matarranya — **comarques aragoneses senceres** (inclouen municipis no catalanoparlants, sobretot a la Ribagorça) | IDEAragon/IGEAR | INE 1/1/2025 |
| Catalunya Nord | Rosselló, Conflent, Vallespir, Capcir, Alta Cerdanya i **Fenolleda** (occitanòfona, però dins el departament) | communes oficials (geo.api.gouv.fr, Licence Ouverte) agrupades per encavalcament amb les comarques històriques d'OSM (ODbL); les 28 communes fora de les 5 relacions OSM = Fenolleda | INSEE, populations de référence 2023 (en vigor l'1/1/2026) |
| Andorra | 1 | OSM (ODbL) | null (cap API oficial fàcil) |

**L'Alguer no s'inclou** (decisió de l'usuari, 25/10/2026); per tant no hi ha cap `inset` i el `bbox` és el real.

Les fonts no comparteixen exactament les fronteres (ICGC 1:50.000, ICV, IGEAR, IGN-F, OSM): les solapes s'assignen a
la font amb més superfície i les escletxes < 20 km² (1,5 km² en total) al veí amb més frontera comuna; el resultat no
té cap buit interior.

## Mètode (`build_geo.py`)

1. Geometries en metres: EPSG:25831 (Catalunya, barris) o EPSG:3035 (LAEA Europa, `ppcc.json`); pyproj.
2. **Simplificació Douglas–Peucker que preserva la topologia**: s'extreuen els límits de totes les features, es nodifiquen
   (`union_all`) i es fusionen en arcs entre nusos (`line_merge`); cada arc compartit se simplifica **una sola vegada**
   amb DP (extrems fixos), es reconstrueixen les cares (`polygonize`) i s'assignen a la feature original amb més
   superfície en comú. Els veïns comparteixen exactament els mateixos vèrtexs. Toleràncies: extensió màxima / 1200
   (≈ 0,9 px a 1080 px d'alçada) per a comarques/ i barris/; 300 m per a ppcc; 6/35/180 m per als fitxers de la ronda 1.
3. S'eliminen illes < 0,5 % de la superfície de la feature i tots els forats.
4. Reprojecció a WGS84 i arrodoniment a 5 decimals (~1 m).
5. Ordenació "amfitrió abans que enclavament".

Scripts:
* `fetch_geo.py` — descarrega les fonts de la ronda 2 a `raw\` (Overpass amb reintents; la selecció de relacions OSM de
  ciutats es fa automàticament a partir de l'enquesta `osm_cat_admin9_10_center.json`).
* `build_geo.py` — genera tots els fitxers (`build_geo.py [catalunya] [comarques] [barris] [ppcc]`), `index.json` i
  `fonts_geo.json`. Necessita `shapely`, `pyproj`, `numpy`, `pyshp` (venv del projecte).
* `check_geo.py` — validació només amb stdlib (`python data\geo\check_geo.py`).
* `preview_geo.py` — previsualitzacions a `raw\preview_*.png` (inclou mosaics de totes les comarques i ciutats).

## Fonts i llicències (detall a `fonts_geo.json`)

* **ICGC – Divisions administratives de Catalunya v2r2 (20/01/2026)**, base 1:50.000, EPSG:25831, **CC BY 4.0**.
  Comarques: <https://datacloud.icgc.cat/datacloud/divisions-administratives/json_unzip_EPSG25831/divisions-administratives-v2r2-comarques-50000-20260120.json>
  · Municipis: <https://datacloud.icgc.cat/datacloud/divisions-administratives/json_unzip_EPSG25831/divisions-administratives-v2r2-municipis-50000-20260120.json>.
  Inclou el Lluçanès (Llei 7/2023) i Sant Feliu Sasserra al Bages. "Val d'Aran" és el nom ICGC (Idescat: "Aran").
* **Idescat – Padró municipal 1/1/2025** (taula 446/477), **CC BY 4.0**.
* **Ajuntament de Barcelona – Open Data BCN**: barris (`BarcelonaCiutat_Barris.csv`) i padró 1/1/2026 per barri, CC BY 4.0.
* **Ajuntament de Girona – terra.girona.cat/opendata**: `barris.zip`, CC BY.
* **Ajuntament de Reus – opendata.reus.cat**: `gisbarris.json` i població per barri, CC BY.
* **Ajuntament de Manresa – dades obertes (seu-e.cat/AOC)**: llista de barris i població per barri 2023, CC BY.
* **Institut Cartogràfic Valencià (GVA)** – WFS `0105_Delimitaciones` (ICV.Comarcas, ICV.Municipios), CC BY 4.0.
* **Instituto Geográfico de Aragón (IDEAragon)** – WFS `VISOR2D:Comarca`/`Municipio`; CC BY 4.0 segons les condicions
  generals d'Aragón Open Data (la capa no ho indica explícitament).
* **IDEIB / ICGIB (Govern de les Illes Balears)** – `GOIB_UnitAdm_IB` (consells insulars i municipis), CC BY 4.0,
  citar "ICGIB-ign.es".
* **INE** – Cifras oficiales de población 1/1/2025 (taules per província), reutilització lliure citant la font.
* **Etalab / IGN / INSEE** – geo.api.gouv.fr (communes del 66, populations de référence 2023), Licence Ouverte 2.0.
* **OpenStreetMap** – **© OpenStreetMap contributors, ODbL 1.0**: barris de Manresa, Badalona, l'Hospitalet, Sabadell,
  Santa Coloma, Sant Adrià, Terrassa, Vilanova, Mollet i el Prat; comarques històriques de Catalunya Nord; Andorra.
  Cal citar-ho al joc. Els fitxers derivats que en contenen (`barris/*` d'OSM, `manresa_barris.json`,
  `ppcc.json`) són bases de dades derivades sota ODbL.

### Per què els barris de Manresa vénen d'OSM

L'Ajuntament publica la llista oficial de 18 barris i la seva població, però **no** en publica la geometria:
el seu WFS/WMS (`https://www.manresa.cat/microsites/webGis/SigmaSIG/wfs.aspx`, capabilities a `raw\manresa_w*s_caps.xml`)
només ofereix seccions censals (`PLSECCIO`) i la taula `divisions_territorials.csv` relaciona les seccions amb districtes,
no amb barris. OSM té exactament 18 relacions admin_level=10 que es corresponen 1:1 amb els codis oficials (el nom mostrat
és el de l'Ajuntament). La unió dels barris OSM coincideix amb el terme municipal de l'ICGC amb una diferència simètrica de
0,53 km² sobre 41,6 km² (~1,3 %).

## Fitxers a `raw\`

Descàrregues originals: `epsg25831\` (ICGC), Idescat JSON-stat, CSV de l'Ajuntament de Manresa, `barris\` (Barcelona,
Girona, Reus, enquesta i relacions OSM), `ppcc\` (ICV, IDEAragon, IDEIB, INE, geo.api.gouv.fr, OSM) i les
previsualitzacions `preview_*.png`.
