const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/replay-evento');
const realFetch = global.fetch;
const savedEnv = { ...process.env };
afterEach(() => { global.fetch = realFetch; process.env = { ...savedEnv }; });

const CONTATTO = 'ContattoReplay000001';
let ipSeq = 0;

function mockGhl({ ok = true, status = 200, fail = false } = {}) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method, body: opts.body ? JSON.parse(opts.body) : undefined });
    if (fail) throw new Error('rete');
    return { ok, status, json: async () => ({}), text: async () => '' };
  };
  process.env.GHL_API_KEY = 'fixture';
  return calls;
}

async function call(body, { method = 'POST', ip } = {}) {
  const out = { headers: {} };
  const res = {
    setHeader(k, v) { out.headers[k] = v; },
    status(code) { out.status = code; return this; },
    json(b) { out.body = b; return this; },
    end() { return this; }
  };
  ipSeq += 1;
  await handler({ method, body, headers: { 'x-forwarded-for': ip || `10.0.0.${ipSeq}` } }, res);
  return out;
}

const valido = (extra = {}) => ({ c: CONTATTO, replay: 'webinar-10-novembre-2026', evento: 'avviato', ...extra });

test('ogni evento ammesso aggiunge il suo tag con POST /contacts/{id}/tags, e nient\'altro', async () => {
  const attesi = {
    'avviato': 'replay-10-novembre-avviato',
    'visto-5min': 'replay-10-novembre-visto-5min',
    'visto-50': 'replay-10-novembre-visto-50',
    'clic-candidatura': 'replay-10-novembre-clic-candidatura'
  };
  for (const [evento, tag] of Object.entries(attesi)) {
    const calls = mockGhl();
    const r = await call(valido({ evento }));
    assert.equal(r.status, 204);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
    assert.equal(new URL(calls[0].url).pathname, `/contacts/${CONTATTO}/tags`);
    assert.deepEqual(calls[0].body, { tags: [tag] });
  }
});

test('il corpo arrivato come testo (sendBeacon) viene letto lo stesso', async () => {
  const calls = mockGhl();
  const r = await call(JSON.stringify(valido({ evento: 'visto-50' })));
  assert.equal(r.status, 204);
  assert.deepEqual(calls[0].body, { tags: ['replay-10-novembre-visto-50'] });
});

test('id malformato, evento o replay fuori lista, corpo rotto: 400 e nessuna chiamata a GHL', async () => {
  const cattivi = [
    valido({ c: 'abc' }),
    valido({ c: '../contacts/x' }),
    valido({ c: CONTATTO + '/tags' }),
    valido({ c: 12345678901234567890 }),
    valido({ evento: 'tag-inventato' }),
    valido({ evento: 'constructor' }),
    valido({ evento: '__proto__' }),
    valido({ replay: 'webinar-agosto' }),
    valido({ replay: 'constructor' }),
    { c: CONTATTO },
    'non json',
    'x'.repeat(600),
    undefined,
    null
  ];
  for (const body of cattivi) {
    const calls = mockGhl();
    const r = await call(body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(calls.length, 0);
  }
});

test('solo POST', async () => {
  const calls = mockGhl();
  for (const method of ['GET', 'PUT', 'DELETE', 'OPTIONS']) {
    const r = await call(valido(), { method });
    assert.equal(r.status, 405);
    assert.equal(r.headers.Allow, 'POST');
  }
  assert.equal(calls.length, 0);
});

test('contatto che in GHL non esiste, GHL giu\' o chiave mancante: 204 senza errori', async () => {
  for (const opts of [{ ok: false, status: 404 }, { ok: false, status: 400 }, { ok: false, status: 500 }, { fail: true }]) {
    mockGhl(opts);
    assert.equal((await call(valido())).status, 204);
  }
  const calls = mockGhl();
  delete process.env.GHL_API_KEY;
  assert.equal((await call(valido())).status, 204);
  assert.equal(calls.length, 0);
});

test('raffica dallo stesso indirizzo: dopo 20 richieste al minuto risponde 429 e non chiama GHL', async () => {
  const calls = mockGhl();
  const ip = '203.0.113.9';
  for (let i = 0; i < 20; i++) assert.equal((await call(valido(), { ip })).status, 204);
  assert.equal((await call(valido(), { ip })).status, 429);
  assert.equal(calls.length, 20);
});

test('nei log non finisce mai l\'id intero del contatto', async () => {
  const righe = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (...a) => righe.push(a.join(' '));
  try {
    mockGhl(); await call(valido());
    mockGhl({ ok: false, status: 404 }); await call(valido());
    mockGhl({ fail: true }); await call(valido());
  } finally { Object.assign(console, orig); }
  assert.ok(righe.length >= 3);
  for (const r of righe) assert.ok(!r.includes(CONTATTO), r);
});
