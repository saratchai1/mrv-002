import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Mutating integration checks are deliberately restricted to the managed local
// preview. Do not allow redirects to take requests to a hosted deployment.
const base = new URL(process.env.MRV_TEST_URL || 'http://localhost:4173');
assert.equal(base.protocol, 'http:', 'Integration tests require a local HTTP preview');
assert.ok(['localhost', '127.0.0.1', 'terminal.local'].includes(base.hostname), 'Refusing to mutate a nonlocal server');
assert.equal(base.username, '');
assert.equal(base.password, '');
assert.equal(base.pathname, '/');
assert.equal(base.search, '');
assert.equal(base.hash, '');

let checks = 0;
let roundId;
const date = '2026-10-23';
const jsonHeaders = { 'Content-Type': 'application/json', Origin: base.origin };
const check = (label) => { checks++; console.log(`PASS ${checks}: ${label}`); };
const almost = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-10, `${label}: expected ${expected}, received ${actual}`);
async function request(path, { method = 'GET', body, expected = 200, headers = {}, apiEnvelope = true } = {}) {
  const response = await fetch(new URL(path, base), {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: body instanceof FormData ? { Origin: base.origin, ...headers } : body === undefined ? headers : { ...jsonHeaders, ...headers },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  assert.equal(response.status, expected, `${method} ${path}: expected HTTP ${expected}, received ${response.status}; ${text.slice(0, 1200)}`);
  if (apiEnvelope) assert.match(response.headers.get('cache-control') || '', /private, no-store/);
  const data = response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
  if (expected >= 400 && apiEnvelope) assert.equal(typeof data.error, 'string');
  return { response, data };
}
const get = async (path) => (await request(path)).data;
const post = async (path, body, expected = 200) => (await request(path, { method: 'POST', body, expected })).data;
const getRound = async () => (await get('/api/state')).rounds.find((round) => round.id === roundId);
function observation(record, overrides = {}) {
  return {
    operationId: randomUUID(), roundId, recordId: record.id,
    status: 'alive', inputType: 'dbh', rawValue: record.dbhCm + 0.5,
    pomM: 1.3, observedOn: date, observer: 'LOCAL API lifecycle test',
    notes: 'Local test fixture, not a field observation',
    identityConfirmed: true, samePomConfirmed: true, expectedVersion: 0,
    ...overrides,
  };
}
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1sAAAAASUVORK5CYII=', 'base64');
function photoForm(operationId, recordId, bytes = photo) {
  const form = new FormData();
  form.append('operationId', operationId);
  form.append('roundId', roundId);
  form.append('recordId', recordId);
  form.append('file', new Blob([bytes], { type: 'image/png' }), 'local-fixture.png');
  return form;
}
// Parse quoted cells so CSV assertions check exported values rather than only
// searching for a substring in the complete file.
function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (char === '\r' && text[i + 1] === '\n' && !quoted) { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += char;
  }
  row.push(cell); rows.push(row);
  return rows;
}

try {
  const baseline = await get('/api/baseline');
  assert.equal(baseline.records.length, 8326);
  assert.equal(baseline.meta.sourceTreeCount, 6738);
  assert.equal(baseline.meta.baselineYearBE, 2567);
  assert.equal(baseline.meta.measurementDate, null);
  const records = baseline.records.filter((record) => record.plotId === 'TRUL1');
  assert.equal(records.length, 14);
  assert.equal(baseline.plots.find((plot) => plot.id === 'TRUL1').sourceTreeCount, 13);
  check('baseline distinguishes measurement records, source counted trees, and model year');

  const create = { operationId: randomUUID(), name: `LOCAL API TEST ${new Date().toISOString()}`, date, plotIds: ['TRUL1'], notes: 'Automated local-only lifecycle fixture; never field observations.' };
  // Vinext may reject a foreign Origin before the app's JSON error handler.
  await request('/api/rounds', { method: 'POST', body: create, expected: 403, headers: { Origin: 'https://foreign-origin.example' }, apiEnvelope: false });
  await post('/api/rounds', { ...create, operationId: randomUUID(), date: '2026-02-30' }, 400);
  await request('/api/export?roundId=bad%22header&type=csv', { expected: 400 });
  check('foreign-origin mutations, impossible dates, and unsafe export identifiers are rejected');

  const created = await post('/api/rounds', create, 201);
  roundId = created.round.id;
  assert.equal(roundId, `r_${create.operationId}`);
  assert.equal(created.round.version, 1);
  assert.equal(created.round.status, 'open');
  assert.deepEqual(await post('/api/rounds', create, 201), created);
  await post('/api/rounds', { ...create, notes: 'Changed under the same operation' }, 409);
  assert.equal((await get('/api/state')).rounds.filter((round) => round.id === roundId).length, 1);
  check('round creation persists and exact retries are idempotent; changed retry conflicts');

  for (const invalid of [{ status: ['alive'] }, { inputType: ['dbh'] }, { expectedVersion: Number.MAX_SAFE_INTEGER + 1 }, { observedOn: '2026-02-30' }]) {
    await post('/api/observations', observation(records[0], invalid), 400);
  }
  const outside = baseline.records.find((record) => record.plotId !== 'TRUL1');
  await post('/api/observations', observation(outside), 400);
  assert.equal((await getRound()).version, 1);
  check('invalid enums, unsafe revisions, impossible dates, and out-of-scope records do not mutate the round');

  const firstBody = observation(records[0]);
  const first = await post('/api/observations', firstBody);
  assert.equal(first.observation.version, 1);
  assert.equal(first.observation.dbhCm, firstBody.rawValue);
  assert.deepEqual(await post('/api/observations', firstBody), first);
  await post('/api/observations', { ...firstBody, rawValue: firstBody.rawValue + 1 }, 409);
  await post('/api/observations', observation(records[0]), 409);
  assert.equal((await getRound()).version, 2);
  check('DBH persists once and retries cannot silently duplicate or overwrite the measurement');

  const secondDbh = records[1].dbhCm + 0.75;
  const secondBody = observation(records[1], { inputType: 'gbh', rawValue: secondDbh * Math.PI });
  const second = await post('/api/observations', secondBody);
  almost(second.observation.dbhCm, secondDbh, 'GBH conversion');
  const density = records[1].woodDensity;
  const expectedStock = (0.251 * density * secondDbh ** 2.46 + 0.199 * density ** 0.899 * secondDbh ** 2.22) / 1000 * 0.4715 * (44 / 12);
  almost(second.observation.stockTco2e, expectedStock, 'GBH carbon calculation');
  const revisedBody = observation(records[0], { rawValue: records[0].dbhCm + 1, expectedVersion: 1 });
  const revised = await post('/api/observations', revisedBody);
  assert.equal(revised.observation.version, 2);
  await post('/api/observations', observation(records[0], { expectedVersion: 1, rawValue: 500 }), 409);
  const persisted = (await get('/api/state')).observations.filter((row) => row.roundId === roundId);
  assert.equal(persisted.length, 2);
  assert.deepEqual(persisted.find((row) => row.recordId === records[0].id), revised.observation);
  assert.deepEqual(persisted.find((row) => row.recordId === records[1].id), second.observation);
  check('GBH conversion, revised observations, and stale revision conflicts survive reloading state');

  const partial = await get(`/api/reports/${roundId}`);
  assert.equal(partial.summary.expected, 14);
  assert.equal(partial.summary.recorded, 2);
  assert.equal(partial.summary.pairedCount, 2);
  assert.equal(partial.summary.certifiedCredits, null);
  assert.equal(partial.source.measurementDate, null);
  almost(partial.summary.pairedCurrentTco2e, revised.observation.stockTco2e + second.observation.stockTco2e, 'paired stock');
  await post(`/api/rounds/${roundId}/lock`, { expectedVersion: 1 }, 409);
  await post(`/api/rounds/${roundId}/lock`, { expectedVersion: partial.round.version }, 400);
  check('partial reports show coverage and paired stock; stale or incomplete lock attempts are blocked');

  const formulaNote = '=HYPERLINK("https://example.invalid","fixture")';
  for (let index = 2; index < records.length; index++) {
    const status = index === 2 ? 'dead' : index === 3 ? 'not_found' : index === 4 ? 'alive' : 'unmeasurable';
    const body = observation(records[index], {
      status,
      rawValue: 9, // Must be discarded for nonalive statuses, never made zero.
      samePomConfirmed: index !== 4,
      notes: index === 4 ? 'Point of measurement moved; deliberately excluded from paired comparison' : index === 5 ? formulaNote : `Local fixture status: ${status}`,
    });
    const saved = (await post('/api/observations', body)).observation;
    if (status !== 'alive') {
      assert.equal(saved.rawValue, null);
      assert.equal(saved.dbhCm, null);
      assert.equal(saved.stockTco2e, null);
    }
    if (status === 'not_found') assert.ok(saved.flags.includes('NOT_FOUND_IS_NOT_DEAD'));
  }
  const full = await get(`/api/reports/${roundId}`);
  assert.equal(full.summary.recorded, 14);
  assert.equal(full.summary.coverage, 1);
  assert.deepEqual(full.summary.statusCounts, { alive: 3, dead: 1, not_found: 1, unmeasurable: 9 });
  assert.equal(full.summary.pairedCount, 2);
  almost(full.summary.pairedCurrentTco2e, partial.summary.pairedCurrentTco2e, 'excluded states do not change paired stock');
  almost(full.summary.pairedBaselineTco2e, records[0].stockTco2e + records[1].stockTco2e, 'paired baseline scope');
  check('all 14 records addressed; dead, not found, unmeasurable, and changed-POM records do not become zero-carbon pairs');

  const photoOperation = randomUUID();
  const uploaded = await post('/api/evidence', photoForm(photoOperation, records[0].id), 201);
  assert.equal(uploaded.evidence.id, photoOperation);
  assert.equal(uploaded.evidence.size, photo.length);
  assert.equal(uploaded.evidence.mimeType, 'image/png');
  assert.deepEqual(await post('/api/evidence', photoForm(photoOperation, records[0].id), 201), uploaded);
  // A valid PNG can contain trailing data; the bytes must still be distinguished.
  await post('/api/evidence', photoForm(photoOperation, records[0].id, Buffer.concat([photo, Buffer.from('\n')])), 409);
  const photoResponse = await fetch(new URL(uploaded.evidence.url, base), { redirect: 'error', signal: AbortSignal.timeout(30000) });
  assert.equal(photoResponse.status, 200);
  assert.equal(photoResponse.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await photoResponse.arrayBuffer()), photo);
  const stateBeforeLock = await get('/api/state');
  assert.equal(stateBeforeLock.evidence.filter((row) => row.roundId === roundId).length, 1);
  const beforeLock = stateBeforeLock.rounds.find((round) => round.id === roundId);
  assert.equal(beforeLock.version, 17); // create + 15 successful observation writes + one photo.
  check('photo bytes persist; exact retries create one evidence row and checksum conflicts preserve the original');

  const locked = await post(`/api/rounds/${roundId}/lock`, { expectedVersion: beforeLock.version });
  assert.equal(locked.round.status, 'locked');
  assert.equal(locked.round.version, beforeLock.version + 1);
  assert.equal(locked.snapshot.locked, true);
  assert.equal(locked.snapshot.summary.recorded, 14);
  assert.equal(locked.snapshot.summary.pairedCount, 2);
  assert.equal(locked.snapshot.evidence.length, 1);
  assert.equal(locked.snapshot.baselineRecords.length, 14);
  assert.equal(locked.snapshot.source.sha256, baseline.meta.sha256);
  assert.deepEqual(await get(`/api/reports/${roundId}`), locked.snapshot);
  assert.deepEqual(await post(`/api/rounds/${roundId}/lock`, { expectedVersion: beforeLock.version }), locked);
  await post('/api/observations', observation(records[0], { expectedVersion: 2, rawValue: 600 }), 409);
  await post('/api/evidence', photoForm(randomUUID(), records[0].id), 409);
  assert.deepEqual(await post('/api/observations', revisedBody), revised);
  assert.deepEqual(await post('/api/evidence', photoForm(photoOperation, records[0].id), 201), uploaded);
  assert.deepEqual(await get(`/api/reports/${roundId}`), locked.snapshot);
  assert.deepEqual(await getRound(), locked.round);
  check('lock freezes a source-linked report; subsequent edits are rejected and exact receipt retries leave it unchanged');

  const audit = await get(`/api/audit/${roundId}`);
  const counts = audit.events.reduce((counts, event) => { counts[event.action] = (counts[event.action] || 0) + 1; return counts; }, {});
  assert.deepEqual(counts, { round_created: 1, observation_created: 14, observation_revised: 1, evidence_added: 1, round_locked: 1 });
  assert.equal(new Set(audit.events.map((event) => event.id)).size, 18);
  assert.ok(audit.events.every((event) => event.actor === 'development-preview'));
  const revisionEvent = audit.events.find((event) => event.action === 'observation_revised');
  assert.equal(JSON.parse(revisionEvent.payload).version, 2);
  assert.deepEqual(await get(`/api/export?roundId=${roundId}&type=json`), locked.snapshot);
  const { data: csv, response: csvResponse } = await request(`/api/export?roundId=${roundId}&type=csv`);
  assert.match(csvResponse.headers.get('content-type'), /text\/csv/);
  const csvRows = parseCsv(csv);
  const [header, ...csvData] = csvRows;
  assert.equal(csvData.length, 14);
  const column = (name) => { const index = header.indexOf(name); assert.ok(index >= 0); return index; };
  const byRecord = new Map(csvData.map((row) => [row[column('record_id')], row]));
  assert.equal(byRecord.get(records[5].id)[column('notes')], `'${formulaNote}`);
  assert.equal(byRecord.get(records[2].id)[column('current_stock_tco2e')], '');
  assert.equal(byRecord.get(records[3].id)[column('current_dbh_cm')], '');
  assert.equal(byRecord.get(records[0].id)[column('revision')], '2');
  assert.ok(csvData.every((row) => row[column('report_status')] === 'locked'));
  check('audit contains only committed writes, JSON exports the frozen report, and CSV preserves missing values and neutralizes formulas');
  console.log(JSON.stringify({ result: 'PASS', checks, localTarget: base.origin, roundId, observations: 14, evidence: 1, auditEvents: audit.events.length, productionDataTouched: false }));
} catch (error) {
  console.error(JSON.stringify({ result: 'FAIL', passedChecks: checks, localTarget: base.origin, roundId: roundId || null, productionDataTouched: false }));
  console.error(error);
  process.exitCode = 1;
}
