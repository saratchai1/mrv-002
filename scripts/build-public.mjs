import { spawnSync } from 'node:child_process';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = JSON.parse(await readFile(path.join(root, 'data/baseline.json'), 'utf8'));
const original = await readFile(path.join(root, 'public/source-baseline.xlsx'));
if (createHash('sha256').update(original).digest('hex') !== baseline.meta.sha256) {
  throw new Error('The original workbook does not match the published baseline checksum.');
}
const build = spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.public.config.ts'], { cwd: root, stdio: 'inherit' });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status || 1);

const out = path.join(root, 'dist');
await mkdir(out, { recursive: true });
const cell = value => {
  let s = value == null ? '' : String(value);
  if (typeof value === 'string' && /^\s*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
const rows = [
  ['record_id','plot','tag','species','dbh_cm','source_count_marker','wood_density','agb_kg','bgb_kg','stock_tco2e','source_sheet','source_row','flags','notes'],
  ...baseline.records.map(r => [r.id,r.plotId,r.tag,r.species,r.dbhCm,r.countMarker,r.woodDensity,r.agbKg,r.bgbKg,r.stockTco2e,r.plotId,r.row,r.flags.join('|'),r.note]),
];
await Promise.all([
  writeFile(path.join(out, 'baseline.json'), JSON.stringify(baseline)),
  writeFile(path.join(out, 'baseline.csv'), '\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n')),
  copyFile(path.join(root, 'public/source-baseline.xlsx'), path.join(out, 'source-baseline.xlsx')),
  copyFile(path.join(root, 'public/favicon.svg'), path.join(out, 'favicon.svg')),
  writeFile(path.join(out, '.nojekyll'), ''),
  writeFile(path.join(out, 'source-info.json'), JSON.stringify({ repository: 'https://github.com/saratchai1/mrv-002', workbook: baseline.meta.fileName, sha256: baseline.meta.sha256, measurementCount: baseline.meta.measurementCount, samplePlotCount: baseline.meta.samplePlotCount, audience: 'public-baseline', privateSurveyDataIncluded: false }, null, 2)),
]);
console.log(`Public build: ${baseline.records.length} source records, ${baseline.plots.length} sample plots. No survey database or outbox copied.`);
