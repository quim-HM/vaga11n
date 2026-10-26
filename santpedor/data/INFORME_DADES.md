# Informe de dades – joc «El preu (in)just» / 11N

Data de consulta de totes les fonts: **2026-10-25**. Totes les xifres s'han llegit de fitxers descarregats de la font (còpies a `data/raw/`) i es regeneren amb `tools/build_data.py` (cadena `build_data.py` → `build_data_2.py` → `build_data_3.py`). La validació es fa amb `tools/validate_data.py` (resultat actual: 0 errors, 0 avisos).

## Estat actual (25-10-2026, final del dia)

| Fitxer | Contingut |
|---|---|
| `fonts.json` | 51 fonts: 43 oficials i 8 secundàries (pàgines de la campanya vagageneral.org, OSM…). |
| `series.json` + `series/*.csv` | 12 sèries anuals (lloguer de Manresa, el Bages i Catalunya, renda per llar de Manresa, salari i IPC de Catalunya, SMI, despesa en aliments, desnonaments a Manresa, preu de l'habitatge a Catalunya i a Manresa). |
| `preguntes.json` | **16 preguntes** (vegeu la llista a `docs/preguntes_revisio.md`, secció 3, i els canvis de la secció 7). |
| `vaga11n.json` | La vaga descrita només amb les pàgines de la campanya (vegeu la darrera secció). |

Canvis del dia que no surten a les seccions històriques de sota: `hores_setmana_smi_lloguer_manresa` substitueix `hores_smi_lloguer_manresa` (16,9 h a la setmana, metàfora `setmana`); nova `jornada_8_hores_canadenca` (1919); `ultima_vaga_general_ccoo_ugt` exclosa; rang dels desnonaments 0–600. El validador mesura els textos amb la font del joc, **Archivo** (`web/fonts/Archivo-Variable.ttf`, via `fonttools`).

Les seccions següents són l'**historial** de les rondes de treball, en ordre. Quan una secció posterior contradiu una d'anterior, val la posterior.

## Fitxers (primera ronda)

| Fitxer | Contingut |
|---|---|
| `fonts.json` | 28 fonts (18 oficials, 10 secundàries: webs sindicals i del moviment per l'habitatge, OSM i titulars de Google News). |
| `series.json` + `series/*.csv` | 10 sèries anuals (`any,valor`). |
| `preguntes.json` | 9 preguntes numèriques verificades. |
| `territori.json` | 3 nivells: Manresa (8 zones), Bages (7 zones), Catalunya (8 àmbits/vegueries). |
| `vaga11n.json` | Fets verificats sobre l'11N i text CTA neutral. |
| `raw/` | Còpies dels fitxers font (CSV, JSON, HTML del BOE, XLSX del CGPJ, text de les webs consultades) i l'script de consulta del PxWeb del CGPJ. |

## Sèries

| id | Període | Font | Confiança | Observacions |
|---|---|---|---|---|
| `lloguer_manresa` | 2007–2025 (+2026 parcial: només gener-març) | Fiances INCASÒL (Dades obertes, qww9-bvhh) | alta | Valor anual = agregat «gener-desembre» publicat. El municipi no té dades abans del 2007. |
| `lloguer_bages` | 2005–2025 (+2026 parcial) | Fiances INCASÒL (hepw-33ik) | alta | — |
| `lloguer_catalunya` | 2005–2025 (+2026 parcial) | Fiances INCASÒL (hepw-33ik) | **mitjana** | **Incoherència a la font per al 2025:** l'agregat anual diu 80.309 contractes (872,02 €), però la suma dels trimestres és 108.057 i la mitjana ponderada dels trimestres és 860,67 €. S'ha mantingut el valor publicat. |
| `renda_llar_manresa` | 2015–2024 | INE, ADRH | alta | Any de meritació de la renda. |
| `salari_catalunya` | 2008–2024 | INE, Enquesta anual d'estructura salarial | alta | Guany brut mitjà anual. |
| `ipc_catalunya_general` / `_aliments` | 2002–2025 (+2026: mitjana gener–setembre) | INE, IPC base 2025 = 100 | alta | Mitjanes anuals publicades per l'INE; el 2026 és mitjana pròpia dels mesos publicats (parcial). |
| `smi` | 2011–2026 | BOE (16 reials decrets) | alta | 2021: 965 € des de l'1 de setembre (950 € de gener a agost, per pròrroga no consultada). **2005–2010 sense dada**: l'API de sumaris del BOE no ha retornat els decrets anteriors a 2011. |
| `despesa_aliments_llar_catalunya` | 2016–2025 | INE, EPF base 2016 | alta | Opcional; afegida. |
| `llancaments_pj_manresa` | 2013–2025 | CGPJ, PC-Axis OUJII021 | alta | Suma dels 8 jutjats de 1a instància i instrucció de Manresa. Abans del 2013 la variable no té dades. |

## Preguntes de la primera ronda (valor · font · confiança)

1. **Última vaga general conjunta CCOO-UGT a tot l'Estat:** 2012 (14-11-2012) · CCOO, història de les vagues generals; corroborat pel titular del Diari ARA «Catorze anys després…» · alta. Reformulada a «24 hores, convocada conjuntament per CCOO i UGT a tot l'Estat». No s'han verificat els altres casos esmentats a l'encàrrec (vagues feministes del 8M, vagues generals catalanes de 2017 i 2019, vaga per Palestina del 15-10-2025); la nota de la pregunta ho adverteix sense afirmar-ne dades.
2. **Lloguer mitjà contractes nous Manresa 2025:** 584,65 €/mes · fiances INCASÒL · alta.
3. **Pujada del lloguer a Manresa 2010→2025:** +39,3 % · fiances · alta. Advertència honesta a la nota: en euros corrents; l'IPC general de Catalunya va pujar un 36,8 % en el mateix període, de manera que la pujada real és petita si es pren el 2010 (any de baixada després del màxim de 2008). Des del mínim de 2014 la pujada és del 70,5 % (es diu a la revelació, no és el valor de la pregunta).
4. **Habitatges buits a Manresa (Cens 2021):** 5.517 de 40.136 (13,7 %; Catalunya 10,7 %) · INE, taula 59531 · mitjana (mètode de consum elèctric; document metodològic no consultat).
5. **Hores d'SMI per pagar el lloguer mitjà (2025):** 73,4 h · càlcul propi: 584,65 / (1.184 × 14 / 2.080 h) · mitjana (hipòtesis: salari brut, 40 h × 52 setmanes).
6. **Llançaments al partit judicial de Manresa 2025:** 249 (198 per la Llei d'arrendaments urbans) · CGPJ · alta.
7. **Sobrecàrrega dels llogaters a preu de mercat, Espanya 2025:** 26,8 % (UE 18,6 %) · Eurostat ilc_lvho07c · alta. Dada estatal; no s'ha trobat l'equivalent per a Catalunya.
8. **Habitatges principals de lloguer a Manresa (Cens 2021):** 28,3 % (8.793 / 31.030) · INE, taula 59529 · alta (fet local afegit, candidat h).
9. **Pujada de l'IPC d'aliments a Catalunya 2019→2025:** +34,9 % (general +20,6 %) · INE IPC · alta.

## Reformulat o exclòs

- **% d'habitatges en mans del 10 % de propietaris més grans:** **exclosa**. No s'ha trobat cap estadística oficial amb concentració de la propietat per municipi (ni a l'INE, ni a Idescat, ni a les dades obertes de la Generalitat consultades). Sense una font fiable a escala municipal, la pregunta no és defensable per a Manresa.
- **% de la renda destinada al lloguer a Manresa:** no s'ha fet servir. Es podria calcular (lloguer nou / renda mitjana per llar), però barreja propietaris i llogaters i contractes nous amb tots els lloguers: seria enganyós. S'ha preferit l'indicador d'Eurostat (candidat f).
- **Població de Manresa:** no s'ha convertit en pregunta (poc relacionada amb l'objectiu); és a `territori.json` (padró 1-1-2025: 80.974 hab.).

## Territori

- **Manresa:** 18 barris oficials (Ajuntament, dades obertes) agrupats en 8 zones (agrupació pròpia per proximitat). Població per barri de l'any 2023 (últim disponible; suma 80.208). Coordenades aproximades d'OSM/Nominatim (font secundària), ponderades per població.
- **Bages:** 30 municipis (composició d'Idescat) en 7 zones; padró a 1-1-2025; coordenades municipals d'Idescat (EMEX).
- **Catalunya:** 8 àmbits del Pla territorial (equivalents a les vegueries). **El padró ja no es publica per àmbits des de 2023**, per això s'han usat les estimacions de població d'Idescat a 1-1-2025 (total 8.124.126). Coordenades = municipi de referència (Barcelona, Girona, Tarragona, Tortosa, Lleida, Manresa, la Seu d'Urgell, Vilafranca del Penedès), no centroides.

## 11N (vaga11n.json) — superat

*Superat per la decisió editorial de la darrera secció: aquest text descriu la primera versió del fitxer.* Verificat a les webs de les organitzacions convocants (CCOO, UGT; confederals i de Catalunya), a la declaració de la CES reproduïda per CCOO i a la web del Sindicat de Llogateres: vaga general de 24 hores el **dimecres 11 de novembre de 2026**, d'àmbit estatal, convocada per **CCOO i UGT**; a Catalunya també l'impulsa el moviment per l'habitatge (Sindicat de Llogateres, campanya «Viure Ens Costa la Vida») i la Taula Sindical de Catalunya. Reivindicacions: salaris i SMI (+7 % el 2027), habitatge assequible i control dels lloguers, reducció de jornada, preus. Totes les fonts sobre la vaga són **parts interessades** (marcades com a secundàries); els titulars de premsa només s'han llegit via RSS.

## Qüestions obertes

1. Discrepància del recompte de contractes de Catalunya 2025 a les fiances (cal confirmar-la amb la Secretaria d'Habitatge).
2. SMI 2005–2010 sense verificar (decrets no localitzats amb l'API del BOE).
3. Definició exacta d'«habitatge buit» del Cens 2021 (document metodològic de l'INE no consultat).
4. Serveis mínims, llista completa d'adhesions i actes concrets a Manresa/Bages per a l'11N: no verificats.
5. Llicències de reutilització de l'INE, Idescat, Eurostat i CGPJ: no consultades (camp `llicencia` a `null`).
6. La població per barris de Manresa és del 2023 i la del Bages del 2025: anys diferents entre nivells.

## Segona ronda (2026-10-25): preguntes 10–21, sèries de preu de l'habitatge

Generades per `tools/build_data_2.py` (s'executa al final de `tools/build_data.py`). Fitxers binaris (PDF/XLS) convertits a text/CSV amb `data/raw/extract_pdf_xls.py` (requereix `pypdf` i `xlrd`; no cal per reconstruir). Les xifres extretes de PDF/HTML es comproven amb la cadena literal de la font.

| id | Valor | Font | Confiança |
|---|---|---|---|
| `riquesa_10pc_mes_ric` | 54,7 % de la riquesa neta (Espanya, 4t trim. 2025; la meitat menys rica: 7,7 %) | BCE/BdE, comptes distributius de riquesa (DWA) | mitjana (estadística experimental) |
| `impost_buits_3_majors` | 58,7 % de l'impost sobre habitatges buits de 2025 el paguen 3 contribuents (90,5 % el 2018) | Agència Tributària de Catalunya | alta |
| `salari_real_catalunya` | −0,5 % (2008–2024; nominal +35,7 %, IPC +36,5 %) | INE EAES deflactat amb l'IPC de Catalunya (càlcul propi) | mitjana |
| `pujada_preu_habitatge_catalunya` | +87,7 % (IPV 2015–2025; salari +30,5 % 2015–2024) | INE IPV | alta |
| `pobresa_llogaters_mercat` | 32,6 % (propietaris 14,5 %; Espanya 2025) | INE ECV | alta |
| `pobresa_llindar_fix_llogaters_crisi` | 51,2 % el 2014 amb llindar fix 2008 (42,7 % el 2008) | INE ECV | alta |
| `edat_emancipacio` | 30,2 anys (UE 26,3; Espanya 2025) | Eurostat yth_demo_030 | alta |
| `cost_rescat_bancari` | 71,833 mil M€ de cost estimat a 31-12-2021 (123.005 M€ compromesos) | Tribunal de Cuentas, informe aprovat el 27-4-2023; MoU 2012 (BOE) | alta |
| `frob_ajuts_recuperats` | 13,5 % recuperat (7.644 de 56.545 M€) | FROB, «Cifras por entidades» | mitjana (queda per vendre BFA/CaixaBank) |
| `ajuts_catalunya_banc` | 12,052 mil M€ injectats (782 M€ recuperats) | FROB | alta |
| `cartera_hipotecaria_cx_blackstone` | Blackstone va pagar el 56,6 % del valor nominal (3.615 de 6.392 M€; el FROB hi va aportar 572 M€) | Notes de premsa del FROB (2014, 2015) | alta |
| `habitatge_public_venut_madrid_2013` | 4.795 habitatges protegits de lloguer (IVIMA 2.935 + EMVS 1.860) | Cámara de Cuentas de Madrid (2015, 2016) | alta |

Sèries noves: `preu_habitatge_catalunya` (IPV, 2007–2025 + 2026 parcial; **base 2025 = 100**, perquè l'INE ja no publica la base 2015) i `preu_habitatge_manresa` (valor taxat MIVAU, €/m², 2005–2025 + 2026 parcial; mitjana simple trimestral; 95–504 taxacions per trimestre, confiança mitjana).

Exclòs o no verificat en aquesta ronda:
- **Informe del Banco de España sobre la crisi (2017)**: el PDF no és accessible (redirecció/404); substituït per l'informe del Tribunal de Comptes (2023), més recent.
- **Nombre d'actius/habitatges traspassats a la Sareb**: la web de la Sareb bloqueja la descàrrega i el Tribunal de Comptes no en dona el recompte d'habitatges; exclòs.
- **Habitatges dels grans propietaris / % de contractes de grans tenidors a Catalunya**: no hi ha cap registre oficial obert amb aquesta dada (les fiances no distingeixen el tipus d'arrendador al portal). S'ha usat l'impost sobre habitatges buits (ATC) com a indicador oficial de concentració. Manresa 2025: 173 habitatges buits declarats per grans tenidors (71 no exempts).
- **Desigualtat a Catalunya (S80/S20, Gini)**: dades descarregades (INE ECV, sèries ECV7421/ECV7419), però no s'han convertit en pregunta perquè la desigualtat d'ingressos ha baixat des del 2014 i el missatge «impacte desigual de les crisis» queda millor reflectit amb el llindar de pobresa fix.
- **Goldman Sachs com a comprador de l'IVIMA**: l'informe oficial només esmenta Encasa Cibeles i Azora; no es menciona Goldman.

## Tercera ronda (2026-10-25): rangs i revelacions

`presentacio()` a `tools/build_data_2.py` fixa rang, pas, escala i revelació de les 21 preguntes; cap valor no ha canviat (només la unitat de `cost_rescat_bancari` i `ajuts_catalunya_banc`, que ara s'expressen en milions d'€ amb escala logarítmica d'1 M€ a 1.000.000 M€). Font nova: `eurostat_cofog_habitatge` (despesa pública en habitatge de l'Estat, 2023: 2.961 + 627 = 3.588 M€; s'usa per comparar amb el cost del rescat). Altres comparacions noves (lloguer vs SMI i renda per llar, aliments vs SMI, buits vs contractes de lloguer, sobrecàrrega de llogaters vs propietaris) surten de fonts que ja hi eren.

## Quarta ronda (2026-10-25): revisió editorial del conjunt de preguntes

`tools/build_data_3.py` (s'executa al final de `tools/build_data.py`, després de `build_data_2.py`) **reescriu `preguntes.json` amb 16 preguntes finals**; la llista de preguntes de les seccions anteriors queda com a historial. Decisions i justificació (manté/reformula/fusiona/descarta per a cada una de les 21 preguntes anteriors, equilibri temàtic, buits de dades): `docs/preguntes_revisio.md`.

Fonts noves (còpies a `data/raw/`):

| id | Contingut | Còpia |
|---|---|---|
| `gencat_hpo` | Habitatges amb protecció oficial iniciats i acabats per municipi, 2002–2025 (Generalitat, v8i4-fa4q) | `hpo_iniciats_acabats_municipis.csv`, `hpo_iniciats_acabats_metadades.json` |
| `boe_llei_4_1983` | Llei 4/1983, jornada màxima de 40 hores (BOE-A-1983-18136) | `boe_jornada/BOE-A-1983-18136.html` |
| `boe_estatut_treballadors` | Estatut dels Treballadors consolidat (BOE-A-2015-11430), art. 34.1 | `boe_jornada/BOE-A-2015-11430_consolidat.html` |

Preguntes noves: `hpo_acabats_manresa` (107 HPO acabats a Manresa 2013–2025, contra 935 el 2002–2012) i `jornada_40_hores` (1983). Reformulades amb un altre id: `lloguer_vs_renda_manresa` (abans `pujada_lloguer_manresa`), `carro_aliments_catalunya` (abans `pujada_ipc_aliments_catalunya`), `rescat_anys_despesa_habitatge` (abans `cost_rescat_bancari`), `catalunya_banc_recuperat` (abans `ajuts_catalunya_banc` + `frob_ajuts_recuperats`). Descartades: `llars_lloguer_manresa`, `impost_buits_3_majors`, `pujada_preu_habitatge_catalunya`, `pobresa_llogaters_mercat`, `pobresa_llindar_fix_llogaters_crisi`, `habitatge_public_venut_madrid_2013` (les seves fonts es mantenen).

`tools/validate_data.py` comprova ara també que l'enunciat tingui ≤ 140 caràcters i acabi amb «?», i mesura amb la font del joc (`web/fonts/`; ara Archivo) que l'enunciat càpiga en 3 línies i la revelació en 2 a la pantalla del joc.

## Decisió editorial (25-10-2026): fonts de la vaga de l'11N

La vaga es descriu ara només a partir de la campanya «Viure ens costa la vida» (vagageneral.org: inici, manifest, participa, convocatòries i avís legal; còpies a `data/raw/web/vagageneral_*.html`). `data/vaga11n.json` el genera `tools/build_data_3.py` (`build_vaga11n()`), que comprova cada fet amb el text literal de les pàgines desades: plataforma impulsada pel Sindicat de Llogateres de Catalunya (SLC), la Confederació Sindical d'Habitatge de Catalunya (COSHAC) i la CGT; 9 reivindicacions del manifest; data 11-11-2026. S'han retirat de `fonts.json` les fonts de CCOO i UGT (`ccoo_historia_vagues`, `ccoo_cat_11n`, `ccoo_es_preus_11n`, `ccoo_cat_ces`, `ugt_cat_11n`, `ugt_es_11n`) i el recull de titulars `google_news_rss_11n`; les seccions anteriors d'aquest informe que hi fan referència queden superades. La pregunta `ultima_vaga_general_ccoo_ugt` continua exclosa.
