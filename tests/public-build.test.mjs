import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const source = JSON.parse(await readFile(path.join(root, 'data/baseline.json'), 'utf8'));
const read = (name) => readFile(path.join(output, name), 'utf8');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) result.push(...await files(path.join(directory, entry.name), `${name}/`));
    else { assert.ok(entry.isFile(), `Unexpected link or special file in public output: ${name}`); result.push(name); }
  }
  return result;
}
function parseCsv(text) {
  assert.equal(text.charCodeAt(0), 0xfeff, 'CSV should retain its UTF-8 BOM for Thai text in spreadsheet software');
  const rows = []; let row = [], value = '', quoted = false;
  for (let index = 1; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if (char === '\r' && text[index + 1] === '\n' && !quoted) { row.push(value); rows.push(row); row = []; value = ''; index++; }
    else value += char;
  }
  assert.equal(quoted, false, 'CSV ends outside a quoted field');
  row.push(value); rows.push(row);
  return rows;
}
const exportedString = (value) => value == null ? '' : typeof value === 'string' && /^\s*[=+@-]/.test(value) ? `'${value}` : String(value);

test('public package contains only the selected static artifacts and no private runtime state', async () => {
  const inventory = await files(output);
  const expected = new Set(['index.html', 'baseline.json', 'baseline.csv', 'source-baseline.xlsx', 'favicon.svg', 'source-info.json', '.nojekyll']);
  for (const name of expected) assert.ok(inventory.includes(name), `Missing published artifact: ${name}`);
  for (const name of inventory) {
    assert.ok(expected.has(name) || /^assets\/[^/]+\.(?:js|css|woff2?|svg|png|webp)$/.test(name), `Unexpected publication artifact: ${name}`);
    assert.doesNotMatch(name, /(?:^|\/)(?:sw\.js|manifest\.webmanifest|wrangler|\.wrangler|\.env|server|api|reports|evidence|outbox)(?:\/|$)/i);
  }
  assert.ok(inventory.some((name) => /^assets\/.+\.js$/.test(name)), 'Public entry bundle exists');
  assert.ok(inventory.some((name) => /^assets\/.+\.css$/.test(name)), 'Public stylesheet exists');
  const html = await read('index.html');
  assert.doesNotMatch(html, /rel\s*=\s*["']manifest["']|serviceWorker|\/sw\.js|\/api\//i);
});

test('public HTML asset and download URLs resolve under a GitHub Pages repository path', async () => {
  const html = await read('index.html');
  const base = new URL('https://example.github.io/mrv-002/');
  const references = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]);
  assert.ok(references.length >= 3);
  for (const reference of references) {
    assert.ok(reference.startsWith('./'), `Asset must resolve relative to the repository path: ${reference}`);
    const resolved = new URL(reference, base);
    assert.ok(resolved.pathname.startsWith('/mrv-002/'), `Asset escaped the repository path: ${reference}`);
    assert.ok((await stat(path.join(output, reference))).isFile(), `Referenced asset missing: ${reference}`);
  }
  for (const name of (await files(output)).filter((name) => name.endsWith('.css'))) {
    const css = await read(name);
    for (const match of css.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/g)) {
      const reference = match[1];
      if (/^(?:data:|https?:|#)/.test(reference)) continue;
      assert.ok(!reference.startsWith('/'), `CSS asset is rooted outside the Pages repository: ${reference}`);
      assert.ok((await stat(path.resolve(output, path.dirname(name), reference))).isFile(), `Referenced CSS asset missing: ${reference}`);
    }
  }
});

test('published JSON is the full baseline with source counts and no survey state', async () => {
  const published = JSON.parse(await read('baseline.json'));
  assert.deepEqual(published, source);
  assert.equal(published.records.length, 8326);
  assert.equal(published.plots.length, 32);
  assert.equal(published.meta.sourceTreeCount, 6738);
  assert.equal(published.meta.measurementDate, null);
  for (const name of ['rounds', 'observations', 'evidence', 'pending']) assert.equal(Object.hasOwn(published, name), false);
});

test('published CSV reconciles every record and preserves original identifiers and missing fields', async () => {
  const [header, ...rows] = parseCsv(await read('baseline.csv'));
  assert.equal(rows.length, 8326);
  assert.equal(new Set(rows.map((row) => row[0])).size, 8326);
  assert.deepEqual(header, ['record_id', 'plot', 'tag', 'species', 'dbh_cm', 'source_count_marker', 'wood_density', 'agb_kg', 'bgb_kg', 'stock_tco2e', 'source_sheet', 'source_row', 'flags', 'notes']);
  for (let index = 0; index < rows.length; index++) {
    const record = source.records[index];
    const values = [record.id, record.plotId, record.tag, record.species, record.dbhCm, record.countMarker, record.woodDensity, record.agbKg, record.bgbKg, record.stockTco2e, record.plotId, record.row, record.flags.join('|'), record.note];
    assert.deepEqual(rows[index], values.map(exportedString), `CSV source mismatch for ${record.id}`);
  }
  assert.equal(rows.filter((row) => row[1] === 'TRUL2').length, 72, 'Ambiguous source rows remain visible in the baseline export');
});

test('published workbook is unchanged and the source descriptor identifies baseline-only publication', async () => {
  const workbook = await readFile(path.join(output, 'source-baseline.xlsx'));
  assert.equal(sha256(workbook), source.meta.sha256);
  assert.equal(sha256(await readFile(path.join(root, 'public/source-baseline.xlsx'))), source.meta.sha256);
  const info = JSON.parse(await read('source-info.json'));
  assert.equal(info.repository, 'https://github.com/saratchai1/mrv-002');
  assert.equal(info.sha256, source.meta.sha256);
  assert.equal(info.measurementCount, 8326);
  assert.equal(info.samplePlotCount, 32);
  assert.equal(info.audience, 'public-baseline');
  assert.equal(info.privateSurveyDataIncluded, false);
});
