import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateStock, observationFlags, summarizeRound, isValidDate, csvCell, toCsv } from '../lib/domain.ts';

const baseline = JSON.parse(readFileSync(new URL('../data/baseline.json', import.meta.url), 'utf8'));
const round = (plotIds) => ({ id:'test-round', name:'Test', date:'2026-10-23', plotIds, notes:'', status:'open', createdAt:'', updatedAt:'', lockedAt:null, version:1 });
const observation = (record, overrides = {}) => ({
  id:'test-round:'+record.id, roundId:'test-round', recordId:record.id, status:'alive',
  inputType:'dbh', rawValue:record.dbhCm + 1, dbhCm:record.dbhCm + 1,
  pomM:1.3, observedOn:'2026-10-23', observer:'Test surveyor', notes:'',
  identityConfirmed:true, samePomConfirmed:true, version:1, updatedAt:'',
  stockTco2e:calculateStock(record.dbhCm + 1,record.woodDensity), flags:[], ...overrides,
});

test('source counts retain rows, source tree counts and sample areas as different measures', () => {
  assert.equal(baseline.records.length, 8326);
  assert.equal(baseline.meta.measurementCount, 8326);
  assert.equal(baseline.meta.sourceTreeCount, 6738);
  assert.equal(baseline.plots.length, 32);
  assert.equal(baseline.plots.reduce((s,p)=>s+p.recordCount,0), 8326);
  assert.equal(baseline.plots.reduce((s,p)=>s+p.sourceTreeCount,0), 6738);
  assert.equal(baseline.plots.reduce((s,p)=>s+p.areaRai,0), 27.5);
  assert.equal(new Set(baseline.records.map(r=>r.id)).size, baseline.records.length);
  const ids = new Set(baseline.plots.map(p=>p.id));
  assert.ok(baseline.records.every(r=>ids.has(r.plotId)));
  assert.equal(baseline.meta.measurementDate, null);
});

test('blank sequence at STUH2 row 177 is retained rather than omitted', () => {
  const record=baseline.records.find(r=>r.plotId==='STUH2'&&r.row===177);
  assert.ok(record);
  assert.equal(record.sequence, null);
  assert.ok(record.dbhCm > 0);
  assert.ok(record.stockTco2e > 0);
});

test('all individual calculations and sample plot totals reconcile to workbook caches', () => {
  let sum=0;
  for(const r of baseline.records){
    const computed=calculateStock(r.dbhCm,r.woodDensity);
    assert.notEqual(computed,null,r.id);
    assert.ok(Math.abs(computed-r.stockTco2e)<1e-10,r.id);
    sum += r.stockTco2e;
  }
  assert.ok(Math.abs(sum-1309.5463770261092)<1e-8);
  for(const p of baseline.plots){
    const actual=baseline.records.filter(r=>r.plotId===p.id).reduce((s,r)=>s+r.stockTco2e,0);
    assert.ok(Math.abs(actual-p.sourceStockTco2e)<1e-8,p.id);
    assert.ok(Math.abs(p.stockPerRai*p.areaRai-p.sourceStockTco2e)<1e-8,p.id);
  }
  assert.notEqual(sum,baseline.meta.projectBaselineTco2e);
});

test('missing or invalid diameter/density is null, never a zero stock', () => {
  for (const diameter of [null,undefined,0,-1,NaN,Infinity,'12']) assert.equal(calculateStock(diameter,0.53),null);
  for (const density of [null,undefined,0,-1,NaN,Infinity,'0.53']) assert.equal(calculateStock(12,density),null);
});

test('partial survey comparisons only include eligible live measured records', () => {
  const records=baseline.records.filter(r=>r.plotId==='STUM1').slice(0,5);
  const observations=[
    observation(records[0]),
    observation(records[1],{status:'dead',rawValue:null,dbhCm:null,stockTco2e:null}),
    observation(records[2],{status:'not_found',rawValue:null,dbhCm:null,stockTco2e:null}),
    observation(records[3],{identityConfirmed:false}),
    observation(records[4],{samePomConfirmed:false}),
  ];
  const result=summarizeRound(baseline,round(['STUM1']),observations);
  assert.equal(result.expected,269);
  assert.equal(result.recorded,5);
  assert.equal(result.pairedCount,1);
  assert.equal(result.statusCounts.dead,1);
  assert.equal(result.statusCounts.not_found,1);
  assert.equal(result.pairedBaselineTco2e,records[0].stockTco2e);
  assert.equal(result.pairedCurrentTco2e,observations[0].stockTco2e);
  assert.equal(result.certifiedCredits,null);
  assert.equal(result.meanDbhChangeCm,1);
  assert.ok(result.coverage<1);
});

test('missing status is not inferred as dead and empty comparison has no mean growth', () => {
  const result=summarizeRound(baseline,round(['STUM1']),[]);
  assert.equal(result.recorded,0);
  assert.equal(result.statusCounts.dead,0);
  assert.equal(result.statusCounts.not_found,0);
  assert.equal(result.pairedCount,0);
  assert.equal(result.meanDbhChangeCm,null);
  assert.equal(result.certifiedCredits,null);
});

test('ambiguous circumference/diameter baseline in TRUL2 cannot enter paired results', () => {
  const records=baseline.records.filter(r=>r.plotId==='TRUL2');
  assert.equal(records.length,72);
  assert.ok(records.every(r=>r.flags.includes('DIAMETER_CIRCUMFERENCE_AMBIGUITY')));
  const result=summarizeRound(baseline,round(['TRUL2']),records.map(r=>observation(r)));
  assert.equal(result.recorded,72);
  assert.equal(result.pairedCount,0);
  assert.equal(result.meanDbhChangeCm,null);
});

test('observations from another round or outside selected plots do not change coverage', () => {
  const a=baseline.records.find(r=>r.plotId==='STUM1');
  const b=baseline.records.find(r=>r.plotId==='STUM2');
  const result=summarizeRound(baseline,round(['STUM1']),[
    observation(a,{roundId:'different-round'}),observation(b)
  ]);
  assert.equal(result.recorded,0);
  assert.equal(result.pairedCount,0);
});

test('quality flags retain unknown identity, POM, and not-found meaning', () => {
  const r=baseline.records.find(r=>r.plotId==='TRUL2');
  const flags=observationFlags(r,{status:'alive',identityConfirmed:false,samePomConfirmed:false,pomM:null},r.dbhCm);
  assert.ok(flags.includes('IDENTITY_NOT_CONFIRMED'));
  assert.ok(flags.includes('POM_COMPARABILITY_UNCONFIRMED'));
  assert.ok(flags.includes('POM_HEIGHT_MISSING'));
  assert.ok(flags.includes('BASELINE_DIAMETER_AMBIGUOUS'));
  assert.ok(observationFlags(r,{status:'not_found',identityConfirmed:true},null).includes('NOT_FOUND_IS_NOT_DEAD'));
});

test('calendar dates reject impossible dates and preserve leap-year rules', () => {
  for(const value of ['2024-02-29','2026-10-23','2000-02-29']) assert.equal(isValidDate(value),true,value);
  for(const value of ['2026-02-29','2026-02-30','2026-13-01','2026-00-01','1900-02-29','2026-10-23T00:00:00Z','23/10/2026','2026-1-1',null,20261023]) assert.equal(isValidDate(value),false,String(value));
});

test('CSV protects spreadsheet formulas while retaining numeric negative values and quoting', () => {
  for(const value of ['=1+1','+SUM(A1:A9)','-1+2','@SUM(A1)',' \t=1+1','\n=CMD()']) assert.equal(csvCell(value).startsWith('"\''),true,value);
  assert.equal(csvCell(-2.5),'"-2.5"');
  assert.equal(csvCell(null),'""');
  assert.equal(csvCell('a,"b"'),'"a,""b"""');
  assert.equal(toCsv([['name','number'],['ต้นไม้',2]]),'\ufeff"name","number"\r\n"ต้นไม้","2"');
});
