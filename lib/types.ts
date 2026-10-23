export type BaselineRecord = {
  id: string; plotId: string; row: number; sequence: number | string | null;
  sourcePlotCode: string | null; tag: string | null; species: string;
  dbhCm: number | null; note: string | number | null; countMarker: number | string | null;
  woodDensity: number | null; agbKg: number | null; bgbKg: number | null;
  stockTco2e: number | null; recalculatedStockTco2e: number | null;
  calculationDifference: number | null; flags: string[];
};
export type BaselinePlot = {
  id: string; name: string; sourcePlotCode: string; province: string;
  coast: string; stratum: string; areaRai: number; recordCount: number;
  sourceTreeCount: number; uniqueTagCount: number; sourceStockTco2e: number;
  stockPerRai: number; meanDbhCm: number; summaryRow: number;
  corners: { marker: string; easting: number; northing: number }[];
  crs: string | null; flags: string[];
};
export type Baseline = {
  meta: { fileName: string; sha256: string; baselineYearBE: number | null;
    measurementDate: string | null; sheetCount: number; samplePlotCount: number;
    measurementCount: number; sourceTreeCount: number; sampleAreaRai: number;
    projectPlotCount: number; projectAreaRai: number; projectBaselineTco2e: number;
    projectionMaiTco2eRaiYear: number; flags: string[]; [key: string]: unknown };
  plots: BaselinePlot[]; records: BaselineRecord[];
  species: { name: string; scientificName: string; woodDensity: number | null; reference: string; sourceRow: number }[];
  projectPlots: Record<string, unknown>[]; strata: Record<string, unknown>[];
  projection: Record<string, unknown>[];
  qa: { issues: Record<string, unknown>[]; counts: Record<string, number>; [key: string]: unknown };
};
export type Round = { id: string; name: string; date: string; plotIds: string[];
  notes: string; status: 'open' | 'locked'; createdAt: string; updatedAt: string;
  lockedAt: string | null; version: number; };
export type ObservationStatus = 'alive' | 'dead' | 'not_found' | 'unmeasurable';
export type ObservationInput = { id?: string; roundId: string; recordId: string;
  status: ObservationStatus; inputType: 'dbh' | 'gbh'; rawValue: number | null;
  pomM: number | null; observedOn: string; observer: string; notes: string;
  identityConfirmed: boolean; samePomConfirmed: boolean; expectedVersion: number;
  operationId: string; };
export type Observation = Omit<ObservationInput, 'expectedVersion' | 'operationId'> & {
  id: string; dbhCm: number | null; version: number; updatedAt: string;
  stockTco2e: number | null; flags: string[];
};
export type Evidence = { id: string; roundId: string; recordId: string; fileName: string;
  mimeType: string; size: number; createdAt: string; url: string; };
export type AppState = { rounds: Round[]; observations: Observation[]; evidence: Evidence[] };
