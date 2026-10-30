const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const { createHash } = require('node:crypto');
const handler = require('../api/liberatoria-ncv-nov');
const { EVENTI } = require('../api/_lib/firma-eventi');
const text = require('../js/ncv-nov-text');
const { payload, mockGhl } = require('./escape-fixtures.cjs');
const realFetch = global.fetch;
const savedEnv = { ...process.env };
afterEach(() => { global.fetch = realFetch; process.env = { ...savedEnv }; });

const NCV_FOLDER = { _id: 'ncv-folder', name: EVENTI.ncvNov.folderName, type: 'folder' };
const ESCAPE_FOLDER = { _id: 'escape-folder', name: EVENTI.escape.folderName, type: 'folder' };
const ncvPayload = (overrides = {}) => payload({ email: 'ncv-test@example.invalid', textVersion: text.TEXT_VERSION, ...overrides });

async function call(data) {
  let result;
  const res = { setHeader() {}, status(status) { this.code = status; return this; }, json(body) { result = { status: this.code, body }; } };
  await handler({ method: 'POST', body: data, headers: { 'x-forwarded-for': '127.0.0.2', 'user-agent': 'NCV test' } }, res);
  return result;
}
function setup(folders = [ESCAPE_FOLDER, NCV_FOLDER]) {
  const state = mockGhl(folders); global.fetch = state.fetch;
  process.env.GHL_PIT_TOKEN = 'fixture'; process.env.GHL_LOCATION_ID = 'fixture';
  delete process.env.GHL_NCV_NOV_EMAIL_WEBHOOK_URL;
  return state;
}

test('text is the May NCV liberatoria with the 7 November date', () => {
  assert.equal(text.EVENTO.date, '7 Novembre 2026');
  assert.match(text.DETTAGLI_EVENTO, /7 Novembre 2026 presso Shangri-La, Viale Algeria 141/);
  assert.doesNotMatch(JSON.stringify(text), /Maggio|Corso di Formazione|Box R1|Escape/);
});

test('saves the signed PDF in its own folder with tag liberatoria_evento_7nov and no custom fields', async () => {
  const state = setup(), data = ncvPayload();
  const result = await call(data);
  assert.equal(result.status, 200); assert.equal(result.body.success, true);
  assert.equal(result.body.emailStatus, 'not_configured');
  assert.deepEqual(state.parents, ['ncv-folder']);
  assert.ok(state.tags.includes('liberatoria_evento_7nov')); assert.ok(state.tags.includes('coach'));
  assert.ok(!state.tags.includes('liberatoria-firmata-escape-2026'));
  assert.ok(!state.calls.some(c => c.method === 'PUT' || c.path.endsWith('/customFields')));
  assert.equal(state.calls.find(c => c.path === '/contacts/upsert').body.tags, undefined);
  assert.ok(state.notes[1].body.startsWith('NCV_NOV_2026_SIGNATURE_V1\n'));
  assert.equal(createHash('sha256').update(state.uploads[0]).digest('hex'), result.body.hash);
  const pdf = await PDFDocument.load(state.uploads[0]);
  assert.match(pdf.getAuthor(), /Elena Giordani/); assert.match(pdf.getSubject(), /ncv-nov-2026-v1.0/);
  assert.match(pdf.getTitle(), /Nel Corpo Che Vuoi Live/);
  const again = await call(data);
  assert.equal(again.body.alreadySaved, true); assert.equal(state.uploads.length, 1);
});

test('never falls back to the Escape folder when the NCV folder is missing', async () => {
  const state = setup([ESCAPE_FOLDER]);
  assert.equal((await call(ncvPayload())).status, 502);
  assert.equal(state.uploads.length, 0); assert.ok(!state.calls.some(c => c.path === '/contacts/upsert'));
});

test('rejects the Escape text version and an Escape signature record is not reused', async () => {
  const state = setup();
  assert.equal((await call(ncvPayload({ textVersion: 'escape-2026-v1.0' }))).status, 409);
  const data = ncvPayload();
  state.notes.push({ id: 'escape-note', body: 'ESCAPE_SIGNATURE_V1\n' + JSON.stringify({ event: 'escape-2026', submissionId: data.submissionId, signedAt: '2026-10-01T00:00:00Z', pdfUrl: 'https://x.invalid/a.pdf', hash: 'x' }) });
  const result = await call(data);
  assert.equal(result.status, 200); assert.equal(result.body.alreadySaved, undefined); assert.equal(state.uploads.length, 1);
});
