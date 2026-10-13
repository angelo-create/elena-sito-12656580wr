const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const { createHash } = require('node:crypto');
const handler = require('../api/liberatoria-escape');
const { generaPDF } = require('../api/_lib/genera-pdf');
const { payload, mockGhl, pngSignature } = require('./escape-fixtures.cjs');
const realFetch = global.fetch;
const savedEnv = { ...process.env };
afterEach(() => { global.fetch = realFetch; process.env = { ...savedEnv }; });

async function call(data, method = 'POST') {
  let result;
  const res = { setHeader() {}, status(status) { this.code = status; return this; }, json(body) { result = { status: this.code, body }; } };
  await handler({ method, body: data, headers: { 'x-forwarded-for': '127.0.0.1', 'user-agent': 'Escape test' } }, res);
  return result;
}
function setup() {
  const state = mockGhl(); global.fetch = state.fetch;
  process.env.GHL_PIT_TOKEN = 'fixture'; process.env.GHL_LOCATION_ID = 'fixture';
  delete process.env.GHL_ESCAPE_EMAIL_WEBHOOK_URL;
  return state;
}

test('saves real signed PDF, independent history, hash, Escape fields and additive tag', async () => {
  const state = setup(), data = payload();
  const result = await call(data);
  assert.equal(result.status, 200); assert.equal(result.body.success, true);
  assert.equal(result.body.emailStatus, 'not_configured');
  assert.equal(state.notes[0].body, 'Historical Coach signature');
  assert.equal(state.fields.legacy, 'previous-coach.pdf'); assert.equal(state.fields.marketing, 'true');
  assert.equal(state.fields.escape_2026_consenso_newsletter, 'false');
  assert.ok(state.tags.includes('coach')); assert.ok(state.tags.includes('liberatoria-firmata-escape-2026'));
  assert.equal(state.calls.find(c => c.path === '/contacts/upsert').body.tags, undefined);
  assert.equal(createHash('sha256').update(state.uploads[0]).digest('hex'), result.body.hash);
  const pdf = await PDFDocument.load(state.uploads[0]);
  assert.ok(pdf.getPageCount() >= 3); assert.match(pdf.getAuthor(), /X77/); assert.match(pdf.getSubject(), /escape-2026-v1.0/);
  const again = await call(data);
  assert.equal(again.body.alreadySaved, true); assert.equal(state.uploads.length, 1); assert.equal(state.notes.length, 2);
});

test('each new signature keeps earlier Escape and Coach records', async () => {
  const state = setup();
  const first = payload();
  assert.equal((await call(first)).status, 200);
  assert.equal((await call(payload({ consensoNewsletter: true }))).status, 200);
  assert.equal(state.notes.length, 3); assert.equal(state.uploads.length, 2);
  assert.equal(state.fields.escape_2026_consenso_newsletter, 'true');
  assert.equal((await call(first)).status, 200);
  assert.equal(state.fields.escape_2026_consenso_newsletter, 'true');
});

test('rejects stale version, minors, impossible dates, missing mandatory images and invalid signature', async () => {
  const state = setup();
  for (const changes of [{ textVersion: 'old' }, { dataNascita: '2020-01-01' }, { dataNascita: '1980-02-31' }, { consensoImmagini: false }, { firmaPng: 'data:image/png;base64,aGVsbG8=' }]) {
    const result = await call(payload(changes)); assert.ok([409, 422].includes(result.status));
  }
  assert.equal(state.notes.length, 1); assert.equal(state.uploads.length, 0);
  assert.equal(state.calls.filter(c => c.method === 'POST').length, 0);
});

test('upload or archive failures never report success or trigger email', async () => {
  for (const fail of ['POST /medias/upload-file', 'POST /contacts/existing-contact/notes']) {
    const state = setup(); state.fail = fail;
    process.env.GHL_ESCAPE_EMAIL_WEBHOOK_URL = 'https://hooks.example.invalid/escape-email';
    assert.equal((await call(payload({ email: fail.includes('notes') ? 'notes@example.invalid' : 'upload@example.invalid' }))).status, 502);
    assert.ok(!state.calls.some(c => c.path === '/escape-email'));
  }
});

test('missing configuration fails closed', async () => {
  const state = setup(); delete process.env.GHL_PIT_TOKEN;
  assert.equal((await call(payload())).status, 502); assert.equal(state.calls.length, 0);
});

test('email failure retains saved signature; accepted webhook is requested, never delivered', async () => {
  const state = setup(); process.env.GHL_ESCAPE_EMAIL_WEBHOOK_URL = 'https://hooks.example.invalid/escape-email';
  state.fail = 'POST /escape-email';
  let result = await call(payload({ email: 'mailfail@example.invalid' }));
  assert.equal(result.status, 200); assert.equal(result.body.emailStatus, 'failed');
  state.fail = '';
  result = await call(payload({ email: 'mailok@example.invalid' }));
  assert.equal(result.body.emailStatus, 'requested'); assert.equal(state.notes.length, 3);
});

test('partial CRM indexing failure keeps archive and is repaired on retry', async () => {
  const state = setup(); state.fail = 'PUT /contacts/existing-contact';
  const data = payload({ email: 'index@example.invalid' });
  const result = await call(data);
  assert.equal(result.status, 502); assert.equal(state.notes.length, 2);
  state.fail = '';
  assert.equal((await call(data)).status, 200);
  assert.equal(state.uploads.length, 1); assert.equal(state.notes.length, 2);
  assert.ok(state.tags.includes('liberatoria-firmata-escape-2026'));
});

test('reusing a saved submission ID with changed content is rejected', async () => {
  const state = setup(); const data = payload({ email: 'conflict@example.invalid' });
  assert.equal((await call(data)).status, 200);
  assert.equal((await call({ ...data, consensoNewsletter: true })).status, 409);
  assert.equal(state.uploads.length, 1);
});

test('existing Coach PDF still uses its own text and author', async () => {
  const buffer = await generaPDF({ ...payload(), firmaPngBytes: pngSignature(), timestamp: new Date().toISOString(), ip: '127.0.0.1' });
  const pdf = await PDFDocument.load(buffer);
  assert.match(pdf.getAuthor(), /Elena Giordani/); assert.match(pdf.getSubject(), /v1.2/); assert.doesNotMatch(pdf.getSubject(), /escape/);
});
