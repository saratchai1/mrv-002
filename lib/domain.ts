import type { Baseline, BaselineRecord, Round, Observation, ObservationInput } from './types';

export const METHOD_ID = 'source-workbook-moc2-komiyama-density-v1';
export const CARBON_FRACTION = 0.4715;
export function calculateStock(dbh: number | null, density: number | null): number | null {
  if (typeof dbh !== 'number' || !Number.isFinite(dbh) || dbh <= 0 || typeof density !== 'number' || !Number.isFinite(density) || density <= 0) return null;
  const agb = 0.251 * density * dbh ** 2.46;
  const bgb = 0.199 * density ** 0.899 * dbh ** 2.22;
  return (agb + bgb) / 1000 * CARBON_FRACTION * (44 / 12);
}
export function observationFlags(record: BaselineRecord, observation: Partial<ObservationInput>, dbh: number | null): string[] {
  const flags: string[] = [];
  if (!observation.identityConfirmed) flags.push('IDENTITY_NOT_CONFIRMED');
  if (observation.status === 'alive' && !observation.samePomConfirmed) flags.push('POM_COMPARABILITY_UNCONFIRMED');
  if (observation.status === 'alive' && !observation.pomM) flags.push('POM_HEIGHT_MISSING');
  if (observation.status === 'not_found') flags.push('NOT_FOUND_IS_NOT_DEAD');
  if (record.flags.includes('DIAMETER_CIRCUMFERENCE_AMBIGUITY')) flags.push('BASELINE_DIAMETER_AMBIGUOUS');
  if (record.flags.includes('WOOD_DENSITY_PROXY')) flags.push('WOOD_DENSITY_PROXY');
  if (dbh !== null && record.dbhCm && (dbh < record.dbhCm || dbh > record.dbhCm * 1.5)) flags.push('DIAMETER_CHANGE_REVIEW');
  if (!record.woodDensity && observation.status === 'alive') flags.push('WOOD_DENSITY_MISSING');
  return flags;
}
export function summarizeRound(baseline: Baseline, round: Round, observations: Observation[]) {
  const records = baseline.records.filter(r => round.plotIds.includes(r.plotId));
  const byId = new Map(records.map(r => [r.id, r]));
  const rows = observations.filter(o => o.roundId === round.id && byId.has(o.recordId));
  const statusCounts = { alive: 0, dead: 0, not_found: 0, unmeasurable: 0 };
  let pairedCount = 0, pairedBaselineTco2e = 0, pairedCurrentTco2e = 0, dbhChange = 0;
  for (const o of rows) {
    statusCounts[o.status]++;
    const r = byId.get(o.recordId)!;
    if (o.status === 'alive' && o.identityConfirmed && o.samePomConfirmed && o.pomM && o.dbhCm !== null && r.dbhCm !== null && r.stockTco2e !== null && o.stockTco2e !== null && !r.flags.includes('DIAMETER_CIRCUMFERENCE_AMBIGUITY')) {
      pairedCount++; pairedBaselineTco2e += r.stockTco2e; pairedCurrentTco2e += o.stockTco2e; dbhChange += o.dbhCm - r.dbhCm;
    }
  }
  const issues: string[] = [];
  if (rows.length < records.length) issues.push(`ยังไม่ได้บันทึก ${records.length - rows.length} รายการจากขอบเขตที่เลือก`);
  if (statusCounts.not_found) issues.push(`ค้นหาไม่พบ ${statusCounts.not_found} รายการ ยังไม่ถือว่าตาย`);
  if (statusCounts.dead) issues.push(`พบตาย ${statusCounts.dead} รายการ ต้องพิจารณาการเปลี่ยนแปลงแหล่งสะสมคาร์บอนแยกต่างหาก`);
  if (rows.some(o => o.flags.length)) issues.push('มีรายการที่ต้องพิจารณาตัวตน จุดวัด หรือค่าที่เปลี่ยนแปลง');
  issues.push('ผลเปรียบเทียบคาร์บอนครอบคลุมเฉพาะรายการมีชีวิตที่ยืนยันว่าเปรียบเทียบได้ ไม่ใช่การเปลี่ยนแปลงคาร์บอนทั้งแปลงหรือเครดิตรับรอง');
  issues.push('ไม่คำนวณอัตราเพิ่มต่อปี เนื่องจากไม่พบวันที่ลงวัดจริงของเบสไลน์');
  return { expected: records.length, recorded: rows.length, coverage: records.length ? rows.length / records.length : 0, statusCounts, pairedCount, pairedBaselineTco2e, pairedCurrentTco2e, pairedDeltaTco2e: pairedCurrentTco2e - pairedBaselineTco2e, meanDbhChangeCm: pairedCount ? dbhChange / pairedCount : null, issues, methodId: METHOD_ID, carbonFraction: CARBON_FRACTION, certifiedCredits: null };
}
export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0,10) === value;
}
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+@\-]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
export function toCsv(rows: unknown[][]): string { return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'); }
