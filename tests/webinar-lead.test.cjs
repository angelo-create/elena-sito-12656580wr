const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/webinar-lead');
const realFetch = global.fetch;
const savedEnv = { ...process.env };
afterEach(() => { global.fetch = realFetch; process.env = { ...savedEnv }; });

const NUOVA = 'NuovaIscritta0000001';
const AMICA = 'AmicaCheInvita000001';

function mockGhl() {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const path = new URL(url).pathname;
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ path, body });
    let data = {};
    if (path === '/contacts/upsert') data = { contact: { id: NUOVA } };
    if (path.endsWith('/customValues')) data = { customValues: [] };
    return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
  };
  process.env.GHL_API_KEY = 'fixture';
  return calls;
}

async function call(extra = {}) {
  let result;
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { result = { status: this.code, body }; }, end() {} };
  const body = { first_name: 'Anna', last_name: 'Rossi', email: 'anna@example.com', phone: '+39 333 1234567', source: 'webinar-10-novembre-2026', ...extra };
  await handler({ method: 'POST', body, headers: {} }, res);
  return result;
}

const tagsOf = (calls, id) => calls.filter(c => c.path === `/contacts/${id}/tags`).flatMap(c => c.body.tags);

test('invito valido: tag alla nuova iscritta e a chi l\'ha invitata, mai tag nell\'upsert', async () => {
  const calls = mockGhl();
  const r = await call({ invitata_da: AMICA });
  assert.equal(r.status, 200);
  assert.equal(calls.find(c => c.path === '/contacts/upsert').body.tags, undefined);
  assert.deepEqual(tagsOf(calls, NUOVA), ['webinar-iscritta', 'webinar-10-novembre-2026', 'invitata-da-amica-novembre']);
  assert.deepEqual(tagsOf(calls, AMICA), ['ha-invitato-amica-novembre']);
});

test('senza invito, id malformato o auto-invito: nessun tag d\'invito', async () => {
  for (const invitata_da of [undefined, 'abc', '../contacts/x', NUOVA]) {
    const calls = mockGhl();
    await call(invitata_da ? { invitata_da } : {});
    assert.deepEqual(tagsOf(calls, NUOVA), ['webinar-iscritta', 'webinar-10-novembre-2026']);
    assert.equal(calls.filter(c => c.path.endsWith('/tags')).length, 1);
  }
});

test('eventi senza invito configurato ignorano invitata_da', async () => {
  const calls = mockGhl();
  await call({ source: 'webinar-25-26-27-agosto-2026', invitata_da: AMICA });
  assert.deepEqual(tagsOf(calls, NUOVA), ['webinar-iscritta', 'webinar-25-26-27-agosto-2026']);
  assert.deepEqual(tagsOf(calls, AMICA), []);
});
