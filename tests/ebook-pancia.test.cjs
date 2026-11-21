// Ebook «La pancia che non se ne va»: api/ebook-pancia-lead.js (con fetch finto:
// nessuna chiamata vera a GHL o Meta), eventi della pagina di grazie in
// api/replay-evento.js, pagine e redirect.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lead = require('../api/ebook-pancia-lead');
const replay = require('../api/replay-evento');

const realFetch = global.fetch;
const savedEnv = { ...process.env };
afterEach(() => { global.fetch = realFetch; process.env = { ...savedEnv }; });

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const ROOT = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CONTATTO = 'ContattoEbookPancia1';

function mockFetch({ upsertOk = true, upsertId = CONTATTO } = {}) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ host: u.host, path: u.pathname, body });
    let data = {};
    let ok = true;
    let status = 200;
    if (u.pathname === '/contacts/upsert') {
      ok = upsertOk; status = upsertOk ? 200 : 422;
      data = upsertOk ? { contact: { id: upsertId } } : { message: 'errore con anna@example.com' };
    }
    if (u.host === 'graph.facebook.com') data = { events_received: 1 };
    return { ok, status, json: async () => data, text: async () => JSON.stringify(data) };
  };
  process.env.GHL_API_KEY = 'fixture';
  process.env.META_PIXEL_ID = '111';
  process.env.META_ACCESS_TOKEN = 'tok1';
  process.env.META_PIXEL_ID_2 = '222';
  process.env.META_ACCESS_TOKEN_2 = 'tok2';
  return calls;
}

async function chiama(handler, body, { method = 'POST' } = {}) {
  const out = { headers: {} };
  const res = {
    setHeader(k, v) { out.headers[k] = v; },
    status(code) { out.status = code; return this; },
    json(b) { out.body = b; return this; },
    end() { return this; }
  };
  await handler({ method, body, headers: { 'x-forwarded-for': '203.0.113.5', 'user-agent': 'test' } }, res);
  return out;
}

function catturaLog(fn) {
  const righe = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (...a) => righe.push(a.join(' '));
  return Promise.resolve().then(fn).finally(() => Object.assign(console, orig)).then(() => righe);
}

const meta = (calls) => calls.filter((c) => c.host === 'graph.facebook.com');
const tagsDi = (calls, id) => calls.filter((c) => c.path === `/contacts/${id}/tags`).flatMap((c) => c.body.tags);
const notaDi = (calls, id) => calls.find((c) => c.path === `/contacts/${id}/notes`);

const valido = (extra = {}) => ({
  first_name: 'Anna Rossi', email: 'Anna@Example.com', phone: '333 123 4567', consenso: true, sito: '',
  event_id: 'lead_1700000000000_abc123xyz',
  utm_source: 'ig', utm_campaign: 'ebook-pancia', fbc: 'fb.1.1.abc', fbp: 'fb.1.1.def',
  event_source_url: 'https://go.elenagiordani.com/ebook-pancia?utm_source=ig', ...extra
});

// ───────────────────────── /api/ebook-pancia-lead ─────────────────────────

test('lead: upsert senza tag e senza source, tag ebook-pancia additivo, nota col consenso, Lead CAPI sui due pixel', async () => {
  const calls = mockFetch();
  const r = await chiama(lead, valido());
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { success: true, contactId: CONTATTO });

  const upsert = calls.find((c) => c.path === '/contacts/upsert');
  assert.equal(upsert.body.tags, undefined);
  assert.equal(upsert.body.source, undefined);
  assert.equal(upsert.body.email, 'anna@example.com');
  assert.equal(upsert.body.firstName, 'Anna Rossi');
  assert.equal(upsert.body.phone, '+393331234567');
  assert.equal(upsert.body.locationId, 'whfxv9CQCrjAmBTZJwMw');
  assert.equal(upsert.body.attributionSource.utmSource, 'ig');
  assert.equal(upsert.body.attributionSource.campaign, 'ebook-pancia');

  assert.deepEqual(tagsDi(calls, CONTATTO), ['ebook-pancia']);
  const nota = notaDi(calls, CONTATTO).body.body;
  assert.match(nota, /La pancia che non se ne va/);
  assert.match(nota, /Consenso privacy e messaggi: accettato il \d{4}-\d{2}-\d{2}/);

  const capi = meta(calls);
  assert.deepEqual(capi.map((c) => c.path).sort(), ['/v21.0/111/events', '/v21.0/222/events']);
  for (const c of capi) {
    const ev = c.body.data[0];
    assert.equal(ev.event_name, 'Lead');
    assert.equal(ev.event_id, 'lead_1700000000000_abc123xyz');
    assert.equal(ev.custom_data.content_name, 'Ebook La pancia che non se ne va');
    assert.equal(ev.custom_data.content_category, 'ebook');
    assert.equal(ev.event_source_url, 'https://go.elenagiordani.com/ebook-pancia?utm_source=ig');
    assert.deepEqual(ev.user_data.external_id, [sha(CONTATTO.toLowerCase())]);
    assert.deepEqual(ev.user_data.fn, [sha('anna')]);
    assert.deepEqual(ev.user_data.ln, [sha('rossi')]);
    assert.equal(ev.user_data.fbc, 'fb.1.1.abc');
  }
});

test('lead: dati mancanti o sbagliati -> 400 e nessuna chiamata a GHL o Meta', async () => {
  const cattivi = [
    valido({ first_name: '' }),
    valido({ first_name: 'A'.repeat(81) }),
    valido({ email: '' }),
    valido({ email: 'anna@' }),
    valido({ phone: '' }),
    valido({ phone: '1234' }),
    valido({ phone: '1'.repeat(31) }),
    valido({ consenso: false }),
    valido({ consenso: 'true' }),
    'non json',
    [],
    null
  ];
  for (const body of cattivi) {
    const calls = mockFetch();
    const out = await chiama(lead, body);
    assert.equal(out.status, 400, JSON.stringify(body).slice(0, 80));
    assert.equal(out.body.success, false);
    assert.equal(calls.length, 0);
  }
});

test('lead: campo nascosto pieno (bot) -> 200 finto, niente GHL ne\' Meta', async () => {
  const calls = mockFetch();
  const out = await catturaLog(() => chiama(lead, valido({ sito: 'https://spam.example' })));
  const r = await chiama(lead, valido({ sito: 'x' }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { success: true, contactId: null });
  assert.equal(calls.length, 0);
  assert.ok(out.length >= 1);
});

test('lead: solo POST; GHL che rifiuta l\'upsert -> 502 senza tag, nota ne\' CAPI', async () => {
  let calls = mockFetch();
  const get = await chiama(lead, valido(), { method: 'GET' });
  assert.equal(get.status, 405);
  assert.equal(calls.length, 0);

  calls = mockFetch({ upsertOk: false });
  const r = await chiama(lead, valido());
  assert.equal(r.status, 502);
  assert.equal(calls.length, 1);
});

test('lead: nei log niente email, telefono o nome', async () => {
  mockFetch();
  const righe = await catturaLog(() => chiama(lead, valido()));
  const tutto = righe.join('\n');
  assert.doesNotMatch(tutto, /anna@example\.com|3331234567|Anna Rossi/i);
  assert.match(tutto, /Contat/); // id abbreviato a 6 caratteri
  assert.doesNotMatch(tutto, new RegExp(CONTATTO));
});

test('lead: corpo arrivato come testo JSON viene letto', async () => {
  const calls = mockFetch();
  const out = await chiama(lead, JSON.stringify(valido()));
  assert.equal(out.status, 200);
  assert.ok(calls.some((c) => c.path === '/contacts/upsert'));
});

// ───────────────────────── /api/replay-evento (pagina di grazie) ─────────────────────────

test('replay-evento ebook-pancia: download e clic WhatsApp diventano tag, niente CAPI', async () => {
  for (const [evento, tag] of [['scaricato', 'ebook-pancia-scaricato'], ['clic-whatsapp', 'ebook-pancia-clic-whatsapp']]) {
    const calls = mockFetch();
    const out = await chiama(replay, { c: CONTATTO, replay: 'ebook-pancia', evento, event_id: 'x_1700000000000_abc' });
    assert.equal(out.status, 204);
    assert.deepEqual(tagsDi(calls, CONTATTO), [tag]);
    assert.equal(meta(calls).length, 0);
  }
  const calls = mockFetch();
  const out = await chiama(replay, { c: CONTATTO, replay: 'ebook-pancia', evento: 'inventato' });
  assert.equal(out.status, 400);
  assert.equal(calls.length, 0);
});

// ───────────────────────── pagine e redirect ─────────────────────────

test('landing: modulo verso l\'endpoint, Lead col content_name della CAPI, niente candidatura', () => {
  const html = leggi('ebook-pancia.html');
  assert.match(html, /fetch\('\/api\/ebook-pancia-lead'/);
  assert.match(html, /var CONTENUTO = 'Ebook La pancia che non se ne va'/);
  assert.equal(lead.CONTENUTO, 'Ebook La pancia che non se ne va');
  assert.match(html, /fbq\('init', '446130387840122'\)/);
  assert.match(html, /fbq\('init', '1717291565951434'\)/);
  assert.match(html, /\/js\/utm-capture\.js/);
  assert.match(html, /name="consenso"/);
  assert.match(html, /name="sito"/);
  assert.doesNotMatch(html, /selezione|candidatura|mangio-meno-candidatura/);
  assert.match(html, /location\.href = '\/ebook-pancia-grazie'/);
});

test('pagine: niente em dash, niente cifra dell\'Academy, immagini presenti', () => {
  for (const f of ['ebook-pancia.html', 'ebook-pancia-grazie.html']) {
    const html = leggi(f);
    assert.doesNotMatch(html, /—|&mdash;/, f + ': em dash');
    assert.doesNotMatch(html, /€|euro/i, f + ': cifre');
    for (const m of html.matchAll(/src="\/(img\/ebook-pancia\/[^"]+)"/g)) {
      assert.ok(fs.existsSync(path.join(ROOT, m[1])), f + ': manca ' + m[1]);
    }
  }
});

test('grazie: PDF che esiste, WhatsApp dal redirect, eventi della lista chiusa', () => {
  const html = leggi('ebook-pancia-grazie.html');
  const pdf = html.match(/href="\/(assets\/ebook\/[^"]+\.pdf)"/)[1];
  assert.ok(fs.existsSync(path.join(ROOT, pdf)), 'manca il PDF');
  assert.match(html, /href="\/whatsapp-ebook-pancia"/);
  assert.match(html, /segna\('scaricato'/);
  assert.match(html, /segna\('clic-whatsapp'/);
  assert.doesNotMatch(html, /fbq\('track', 'Lead'/, 'il Lead parte solo dal modulo');
});

test('vercel.json: redirect WhatsApp, landing su go., PDF noindex', () => {
  const cfg = JSON.parse(leggi('vercel.json'));
  const wa = cfg.redirects.find((r) => r.source === '/whatsapp-ebook-pancia');
  assert.ok(wa && wa.destination.startsWith('https://wa.me/393773692181?text='));
  assert.match(decodeURIComponent(wa.destination), /ebook sulla pancia/);
  for (const s of ['/ebook-pancia', '/ebook-pancia-grazie']) {
    const r = cfg.redirects.find((x) => x.source === s);
    assert.ok(r, s);
    assert.equal(r.destination, 'https://go.elenagiordani.com' + s);
    assert.equal(r.has[0].value, '(?!go\\.elenagiordani\\.com).*');
  }
  const h = cfg.headers.find((x) => x.source === '/assets/ebook/(.*)');
  assert.ok(h.headers.some((x) => x.key === 'X-Robots-Tag' && /noindex/.test(x.value)));
});
