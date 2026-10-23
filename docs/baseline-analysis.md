# Baseline workbook audit for the MRV web application

## Source and extraction contract

- Source: `MOC2_VSD-25-06-24 3(1).xlsx` (user attachment).
- Source SHA-256: `6f95f24e7632cc5901a8ea36bc9ecad9807d18ba42a42364df7876439e82b89a`.
- Extraction is read-only; the workbook is unchanged. The source file was not recalculated or repaired.
- `baseline.json` contains the normalized application dataset. `formula-catalog.json` preserves resolved Excel formulas by sheet and cell. `validation.json` records arithmetic reconciliation. `extraction-evidence.json` contains metadata, plot summaries, QA and sheet inventory.
- Formula caches are preserved and independently recomputed. Agreement establishes reproduction of workbook arithmetic; it does not establish the correctness of field measurements, the suitability of the equations, or verified carbon credits.

## Key quantities

| Quantity | Source-derived value | Interpretation |
|---|---:|---|
| Workbook sheets | 40 | Eight summary/reference sheets and 32 tree-data sheets |
| Measurement records | 8,326 | One source row per record; not confirmed unique physical trees |
| Numeric tree-count markers | 6,738 | Sum of numeric values in tree sheet column G |
| Nonblank unique plot/tag pairs | 8,109 | 213 repeated-tag groups; one row has no tag |
| Sample area | 27.5 rai | 32 plots, each 0.5 or 1 rai |
| Sample provinces | 8 | Province membership from sample summary |
| Species observed | 16 | Thai names exactly matching MWD lookup |
| Wood-density reference entries | 31 | Includes one explicit proxy species entry |
| Sample stock | 1,309.5463770261092 tCO₂e | Sum over sampled areas; not a per-rai total |
| Project plots | 22 | Administrative project plot table |
| Project participating area | 6,775.53 rai | CTT0!F10; agrees with project plot table |
| Project baseline estimate | 362,962.8144 tCO₂e | CTT0!G10; six source strata expanded to project area |
| Reference year | BE 2567 (2024) | Total GHG!A2, a model reference year |
| Actual baseline survey date | Not established | No survey date inferred from filename |

These quantities have different denominators. The application should show sample stock and the expanded project estimate separately. The 32 sample plots are different entities from the 22 administrative project plots; the workbook does not supply an unambiguous one-to-one correspondence.

## Sheet inventory and relationships

| Sheet | Purpose |
|---|---|
| Total GHG | Reference-year and future projected project carbon and cumulative reduction table |
| CTTt | Future stock calculation using MAI 9.4 tCO₂/rai/year, area and elapsed time |
| CTT0 | Baseline project expansion over six coast/FCD strata |
| Winrock Test | Sample-size calculation workbook, with links to summary biomass statistics |
| พื้นที่เข้าร่วมโครงการตาม FCD | Project area split by FCD classes and coast |
| แปลง MOC2 VSD | 22 project plot/location/area records |
| สรุปข้อมูลแปลงตัวอย่าง | 32 sample plots, four E/N corner records each, area, counts and normalized stock |
| MWD | 31 Thai/scientific species names, numerical wood densities and references |
| Tree sheets listed below | Raw tree measurements, remarks, count markers and carbon formulas |

The summary links to the physical worksheet through its formula references. This resolves `PNHM1` in the summary to worksheet `PNGM1` without discarding the original alias. Survey corners contain easting/northing numbers but no verified CRS or datum. They must not be converted to latitude/longitude by assumption.

### Sample plot inventory

All stocks in this table are source-cached absolute sample-plot stocks; the application also stores stock per rai.

| Worksheet | Province | Coast | FCD stratum | Area (rai) | Measurement rows | Source count | Stock (tCO₂e) |
|---|---|---|---|---:|---:|---:|---:|
| SMKH3 | สมุทรสงคราม | อ่าวไทย | มาก | 1 | 226 | 151 | 23.580230 |
| CMPH1 | ชุมพร | อ่าวไทย | มาก | 1 | 408 | 408 | 40.505488 |
| CMPH3 | ชุมพร | อ่าวไทย | มาก | 1 | 676 | 465 | 63.574516 |
| CMPH4 | ชุมพร | อ่าวไทย | มาก | 1 | 532 | 376 | 58.538984 |
| CMPH5 | ชุมพร | อ่าวไทย | มาก | 0.5 | 280 | 227 | 22.825997 |
| CMPH6 | ชุมพร | อ่าวไทย | มาก | 0.5 | 153 | 123 | 28.180197 |
| CMPH7 | ชุมพร | อ่าวไทย | มาก | 1 | 556 | 443 | 67.128837 |
| CMPH8 | ชุมพร | อ่าวไทย | มาก | 0.5 | 345 | 313 | 37.220709 |
| PTNH1 | ปัตตานี | อ่าวไทย | มาก | 0.5 | 223 | 148 | 32.916545 |
| PTNH2 | ปัตตานี | อ่าวไทย | มาก | 0.5 | 331 | 160 | 32.351519 |
| PTNH3 | ปัตตานี | อ่าวไทย | มาก | 0.5 | 473 | 439 | 19.952933 |
| CMPM2 | ชุมพร | อ่าวไทย | ปานกลาง | 1 | 500 | 417 | 29.254800 |
| CMPM3 | ชุมพร | อ่าวไทย | ปานกลาง | 1 | 400 | 275 | 25.253572 |
| CMPM4 | ชุมพร | อ่าวไทย | ปานกลาง | 0.5 | 271 | 196 | 16.836535 |
| CMPL2 | ชุมพร | อ่าวไทย | น้อย | 0.5 | 67 | 60 | 2.784633 |
| CMPL3 | ชุมพร | อ่าวไทย | น้อย | 1 | 22 | 15 | 2.071238 |
| CMPL1 | ชุมพร | อ่าวไทย | น้อย | 1 | 160 | 98 | 7.520022 |
| STUH1 | สตูล | อันดามัน | มาก | 1 | 156 | 153 | 66.112041 |
| STUH2 | สตูล | อันดามัน | มาก | 1 | 228 | 227 | 69.500082 |
| STUH3 | สตูล | อันดามัน | มาก | 1 | 186 | 177 | 74.085801 |
| KRBH1 | กระบี่ | อันดามัน | มาก | 1 | 213 | 192 | 65.230793 |
| KRBH2 | กระบี่ | อันดามัน | มาก | 1 | 291 | 264 | 70.848517 |
| PNGH1 | พังงา | อันดามัน | มาก | 1 | 130 | 119 | 78.615959 |
| PNGH2 | พังงา | อันดามัน | มาก | 1 | 412 | 329 | 80.598908 |
| PNGH3 | พังงา | อันดามัน | มาก | 1 | 238 | 229 | 87.302231 |
| PHUH1 | ภูเก็ต | อันดามัน | มาก | 0.5 | 68 | 46 | 26.323715 |
| STUM1 | สตูล | อันดามัน | ปานกลาง | 1 | 269 | 229 | 50.312838 |
| STUM2 | สตูล | อันดามัน | ปานกลาง | 1 | 248 | 228 | 34.240795 |
| PNGM1 | พังงา | อันดามัน | ปานกลาง | 1 | 146 | 119 | 39.159157 |
| KRBL1 | กระบี่ | อันดามัน | น้อย | 1 | 32 | 27 | 13.992966 |
| TRUL1 | ตรัง | อันดามัน | น้อย | 1 | 14 | 13 | 0.507727 |
| TRUL2 | ตรัง | อันดามัน | น้อย | 1 | 72 | 72 | 42.218093 |

`STUH1`, `STUH2`, `STUH3` are the three Satun high-FCD sample sheets. `STUM1` and `STUM2` are the two Satun medium-FCD sheets. All are 1 rai. These are kept as separate plots with their original source plot codes.

## Tree columns and units

| Column | Meaning | Extraction treatment |
|---|---|
| A | Sequence | Preserve, including STUH2!A177 missing sequence |
| B | Sample plot code | Preserve verbatim, e.g. STU-M-01 |
| C | Tree tag | Normalize to a string for display; blank remains null; source-based row ID is independent |
| D | Thai species name | Exact source lookup against MWD |
| E | DBH (cm), as the source header states | Preserve source value, flag TRUL2 diameter/circumference ambiguity |
| F | Remark 1 | Preserve string, number or null; may contain branching or point-of-measurement clues |
| G | Tree count marker | Preserve number, text or null; do not silently coerce text into numeric count |
| H | Above-ground biomass, kg dry matter | Preserve cache and independently reproduce |
| I | Below-ground biomass, kg dry matter | Preserve cache and independently reproduce |
| J | Total biomass, kg dry matter | Exact formulas preserved in formula catalog |
| K | Total biomass, tonnes | Row formula is J/1000; despite its header, it is not yet normalized by plot area |
| L | Carbon fraction | 0.4715 in all source tree rows |
| M | CO₂:C molecular ratio | 44/12 |
| N | Stock, tCO₂e | Per-row source estimate |
| O | Remark 2 | Mostly equations/labels and residual zeros; retained in raw workbook evidence |

There are no explicit tree-height, survey-date, surveyor, photo, individual-tree GPS or structured point-of-measurement fields in the tree table. Several remarks contain offsets such as +5 cm; these are not enough to invent a complete repeatable point-of-measurement specification.

## Reproduced source calculation

For each source row, D is the numerical value in column E and ρ is the exact species lookup in MWD!B2:D32:

```text
AGB_kg = 0.251 × ρ × D^2.46
BGB_kg = 0.199 × ρ^0.899 × D^2.22
biomass_tonnes = (AGB_kg + BGB_kg) / 1000
stock_tCO2e = biomass_tonnes × 0.4715 × (44/12)
plot_stock_per_rai = SUM(row stock_tCO2e) / plot_area_rai
```

The workbook uses these equations for all 8,326 records, with species-specific density lookup. MWD header does not explicitly state the density unit; the extraction preserves the numerical coefficients without adding an unverified unit. Unknown future species should not silently receive a density default. The method identifier in JSON is an internal source-method version label, not a certification claim.

Column G is absent from the biomass and carbon equations. Therefore rows with a blank tree-count marker still contribute carbon. Removing them or multiplying carbon by the source count marker would change the workbook calculation.

The source reference for เสม็ดขาว states that a minimum-density proxy was used because data were unavailable; its coefficient is 0.28. Eighty-six observations use that proxy and carry a WOOD_DENSITY_PROXY flag.

### Six source strata used for project expansion

| Coast | FCD stratum | Mean stock (tCO₂e/rai) | Area (rai) | Expanded stock (tCO₂e) |
|---|---|---:|---:|---:|
| ฝั่งอ่าวไทย | มาก | 54.57 | 1821.64 | 99406.8948 |
| ฝั่งอ่าวไทย | ปานกลาง | 29.39 | 975.86 | 28680.5254 |
| ฝั่งอ่าวไทย | น้อย | 5.05 | 251.25 | 1268.8125 |
| ฝั่งอันดามัน | มาก | 71.66 | 2733.84 | 195906.9744 |
| ฝั่งอันดามัน | ปานกลาง | 41.24 | 847.43 | 34948.0132 |
| ฝั่งอันดามัน | น้อย | 18.91 | 145.51 | 2751.5941 |

CTT0 uses the rounded stratum means supplied by the summary sheet. Replacing them with unrounded means would create a different estimate. The low-FCD area includes Bare/FCD-Process Error area in the source formulas; the classification should be confirmed before approving a future expansion method.

## Reconciliation and completeness

- All 8,326 measurement rows have unique source-based IDs of the form `STUM1-r2`.
- Every pre-total row in all 32 tree sheets is included; this includes STUH2 row 177 although its sequence cell is blank.
- Numeric count markers sum exactly to each cached source count total.
- All 32 sums of row stocks agree with source plot totals within 1e-8 tCO₂e.
- All 32 source plot totals divided by their sample areas agree with the sample summary.
- Independent formula maximum absolute differences: AGB 1.82e-12 kg, BGB 9.10e-13 kg, carbon 4.45e-15 tCO₂e, consistent with floating-point arithmetic.
- Project participating areas sum to 6,775.53 rai; six strata sum to 362,962.8144 tCO₂e.
- No Excel formula error cell was detected.
- CMPL2 has residual copied formulas extending beyond its 67 tree rows and summary row 69. They are not observations and are excluded.

## Specific source issues and required interpretation

| Issue | Exact evidence | Handling |
|---|---|---|
| Repeated tags | 429 records in 213 within-plot groups: 210 pairs and 3 triples | Keep every row; verify identity and stems before repeat-round matching |
| Branch/stem remarks | 2,066 notes match นาง or แตก; 1,587 count markers are blank | Preserve, do not infer that every row is an independent physical tree |
| Missing tag | CMPH4!C330 | Keep record CMPH4-r330, require field identity confirmation |
| Missing sequence | STUH2!A177 | Keep record STUH2-r177; source stock 0.6138655803479369 tCO₂e |
| Text count marker | CMPH7!G505 contains text "1" | Excel SUM omits it; retain source count 443 for that plot, flag separately |
| Plot alias | Summary!D114 and FCD!E29 show PNHM1; links/corners show PNGM1 | Use linked worksheet ID PNGM1, preserve summary alias PNHM1 |
| Potential circumference input | All 72 TRUL2 remarks F equal E/π while header E says DBH | Preserve source E and carbon, request explicit resolution before approving estimates |
| Density proxy | 86 เสม็ดขาว observations, source coefficient 0.28 | Flag for methodological review; no invented density replacement |
| Summary mean formula typo | สรุปข้อมูลแปลงตัวอย่าง!L46 = ROUND(AVERAGE(K46,K50,K54,),2) | Cached 79.70 differs from three-plot mean 106.26318579916314; feeds Winrock Test!D23 |
| Independent carbon mean | Summary!O46 uses a separate correct three-term average | L46 typo does not change that carbon mean or CTT0 carbon total |
| Missing actual date and CRS | Model year present, no verified survey date or CRS | Keep null; do not infer from filename or coordinate magnitudes |

For sensitivity only, TRUL2 source plot stock is 42.21809334773554 tCO₂e. If the source E values were later confirmed to be circumferences, using E/π as diameter would produce approximately 2.7547320117837995 tCO₂e with the same source equations. This is not an approved correction and is not substituted into baseline.json.

Overall 2,837 records carry one or more extraction/review flags. Flags overlap and include informational field characteristics; they must not be summed as counts of errors.

## Projection is separate from measurement

Total GHG years BE 2568–2577 are projected values derived from CTTt, its MAI constant of 9.4 tCO₂/rai/year, project area and elapsed time. They are not observed follow-up rounds. The future cumulative reduction series must not be added across years as though each cumulative value were an annual increment. The reference-year project-stock cell is zero in the source projection table while the baseline estimate is stored separately; the extraction preserves this rather than silently rewriting source values.

## Application integration recommendations

1. Treat source row IDs as immutable observation lineage, not confirmed physical-tree IDs. Establish tree/stem identity and the measurement point explicitly when recording the first follow-up.
2. Persist actual monitoring rounds, dates and observations separately from immutable baseline data. Keep unsurveyed/missing status distinct from zero stock and dead-tree status.
3. Capture direct DBH versus circumference as an explicit measurement type, measurement unit, measurement point/height, surveyor, tree condition and evidence. Preserve the raw entry and the conversion formula.
4. Show computed stock only under the selected, versioned method with a known species density and eligible observations. Preserve arithmetic and method-version lineage.
5. Label dashboard counts as รายการวัด and จำนวนต้นตามสูตรต้นฉบับ, showing their definitions. Do not call 8,326 confirmed physical trees.
6. Compare paired verified observations for tree/plot change; do not subtract a partially completed monitoring sum from the full baseline total. Publish completeness, exclusions and comparability alongside change estimates.
7. Keep the source project estimate, actual sample observations and projected trajectory visibly distinct. Do not call any of them certified credits without a separately supplied verification process.

## JSON data contract

Top-level keys are `schemaVersion`, `meta`, `plots`, `records`, `species`, `projectPlots`, `strata`, `projection` and `qa`.

A record is `{id, plotId, row, sequence, sourcePlotCode, tag, species, dbhCm, note, countMarker, woodDensity, agbKg, bgbKg, carbonFraction, stockTco2e, recalculatedStockTco2e, calculationDifference, flags}`. The original worksheet equals `plotId`; exact source cell references combine the column in `meta.sourceCellMap` with `row`.

Plots include source count, measurement-row count, nonblank unique-tag count, source/calc stock, area, stock per rai, sample-summary row, corners, original alias and flags. `crs` and actual measurement date remain null.

`meta.distinctPlotTagCount` excludes the one blank-tag record; `missingTagRecordCount` records it separately. `qa.counts` contains overlapping record-flag counts. `qa.issues` provides human-readable Thai issue descriptions. The exact formulas are kept in the companion formula catalog instead of repeating large formula strings in every application record.
