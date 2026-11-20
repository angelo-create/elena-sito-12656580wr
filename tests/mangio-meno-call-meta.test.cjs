// api/mangio-meno-call-meta.js: dalle prenotazioni del calendario di Marco all'evento
// Schedule a Meta per i contatti del quiz «Mangio meno». fetch finto: nessuna
// chiamata vera a GHL o Meta.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const handler = require('../api/mangio-meno-call-meta');

const realFetch = global.fetch;
const savedEnv = { ...process.env };
afterEach(() => { global.fetch = realFetch; process.env = { ...savedEnv }; });

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const ORA = Date.now();
const iso = (msFa) => new Date(ORA - msFa).toISOString();
const ORE = 3600 * 1000;

const QUIZ = 'ContattoQuizCall00001';
const ALTRA = 'ContattoWebinar000001';
const FATTA = 'ContattoGiaInviato001';

const CONTATTI = {
  [QUIZ]: {
    id: QUIZ, email: 'anna@example.com', phone: '+393331234567', firstName: 'Anna Rossi', lastName: '',
    tags: ['mangio-meno-quiz', 'mangio-meno-profilo-pancia'], dateAdded: '2026-11-17T20:00:00.000Z',
    attributionSource: { utmSource: 'meta', campaign: 'mangio-meno-quiz', fbclid: 'IwAR1abcDEF_ghi-123' }
  },
  [ALTRA]: { id: ALTRA, email: 'b@example.com', phone: '+393330000000', firstName: 'Bea', tags: ['webinar-10-novembre-2026'], dateAdded: '2026-10-01T10:00:00.000Z' },
  [FATTA]: { id: FATTA, email: 'c@example.com', phone: '+393331111111', firstName: 'Carla', tags: ['mangio-meno-quiz', 'mangio-meno-call-prenotata'], dateAdded: '2026-11-17T10:00:00.000Z' }
};

const EVENTI = [
  { id: 'appQuiz1', contactId: QUIZ, dateAdded: iso(2 * ORE), appointmentStatus: 'confirmed', startTime: '2026-11-25T10:00:00+01:00' },
  { id: 'appQuiz2', contactId: QUIZ, dateAdded: iso(1 * ORE), appointmentStatus: 'confirmed' },
  { id: 'appAltra', contactId: ALTRA, dateAdded: iso(3 * ORE), appointmentStatus: 'confirmed' },
  { id: 'appFatta', contactId: FATTA, dateAdded: iso(5 * ORE), appointmentStatus: 'confirmed' },
  { id: 'appVecchia', contactId: QUIZ, dateAdded: iso(60 * ORE), appointmentStatus: 'confirmed' },
  { id: 'appAnnullata', contactId: FATTA, dateAdded: iso(1 * ORE), appointmentStatus: 'cancelled' }
];

function mockFetch({ eventi = EVENTI, metaOk = true, calendarioOk = true } = {}) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ host: u.host, path: u.pathname, query: u.searchParams, method: opts.method || 'GET', body });
    let data = {}; let ok = true; let status = 200;
    if (u.pathname === '/calendars/events') {
      ok = calendarioOk; status = calendarioOk ? 200 : 503;
      // lo stesso evento puo' tornare in tutti e due i pezzi della ricerca
      data = { events: eventi };
    } else if (u.pathname.startsWith('/contacts/') && !u.pathname.endsWith('/tags')) {
      data = { contact: CONTATTI[decodeURIComponent(u.pathname.split('/')[2])] };
    } else if (u.host === 'graph.facebook.com') {
      ok = metaOk; status = metaOk ? 200 : 400;
      data = metaOk ? { events_received: 1 } : { error: { message: 'errore' } };
    }
    return { ok, status, json: async () => data, text: async () => JSON.stringify(data) };
  };
  process.env.GHL_API_KEY = 'fixture';
  process.env.CRON_SECRET = 'segreto';
  process.env.META_PIXEL_ID = '111';
  process.env.META_ACCESS_TOKEN = 'tok1';
  process.env.META_PIXEL_ID_2 = '222';
  process.env.META_ACCESS_TOKEN_2 = 'tok2';
  return calls;
}

async function chiama({ auth = 'Bearer segreto' } = {}) {
  const out = { headers: {} };
  const res = {
    setHeader(k, v) { out.headers[k] = v; },
    status(code) { out.status = code; return this; },
    json(b) { out.body = b; return this; },
    end() { return this; }
  };
  await handler({ method: 'GET', headers: auth ? { authorization: auth } : {} }, res);
  return out;
}

function catturaLog(fn) {
  const righe = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (...a) => righe.push(a.join(' '));
  return Promise.resolve().then(fn).finally(() => Object.assign(console, orig)).then(() => righe);
}

const meta = (calls) => calls.filter((c) => c.host === 'graph.facebook.com');
const tag = (calls) => calls.filter((c) => c.path.endsWith('/tags'));

test('call del quiz: Schedule a Meta sui due pixel con l\'ora della prenotazione, poi il tag call-prenotata', async () => {
  const calls = mockFetch();
  const r = await chiama();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { prenotazioni: 3, quiz: 2, inviate: 1, gia_inviate: 1, errori: 0 });

  const capi = meta(calls);
  assert.deepEqual(capi.map((c) => c.path).sort(), ['/v21.0/111/events', '/v21.0/222/events']);
  for (const c of capi) {
    const ev = c.body.data[0];
    assert.equal(ev.event_name, 'Schedule');
    assert.equal(ev.event_id, 'schedule_appQuiz1'); // la prima prenotazione della finestra
    assert.equal(ev.event_time, Math.floor(Date.parse(EVENTI[0].dateAdded) / 1000));
    assert.equal(ev.action_source, 'website');
    assert.equal(ev.event_source_url, 'https://api.leadconnectorhq.com/widget/booking/HiNWYwGpEGZvIesthFA6');
    assert.deepEqual(ev.custom_data, { content_name: 'Call Marco Mangio meno', content_category: 'mangio-meno' });
    const u = ev.user_data;
    assert.deepEqual(u.em, [sha('anna@example.com')]);
    assert.deepEqual(u.ph, [sha('393331234567')]);
    assert.deepEqual(u.fn, [sha('anna')]);
    assert.deepEqual(u.ln, [sha('rossi')]);
    assert.deepEqual(u.external_id, [sha(QUIZ.toLowerCase())]);
    assert.deepEqual(u.country, [sha('it')]);
    assert.equal(u.fbc, `fb.1.${Date.parse('2026-11-17T20:00:00.000Z')}.IwAR1abcDEF_ghi-123`);
  }
  const t = tag(calls);
  assert.equal(t.length, 1);
  assert.equal(t[0].path, `/contacts/${QUIZ}/tags`);
  assert.deepEqual(t[0].body, { tags: ['mangio-meno-call-prenotata'] });
  // sola lettura per il resto: nessun upsert, nessuna scrittura sugli altri contatti
  assert.ok(calls.filter((c) => c.host === 'services.leadconnectorhq.com' && c.method !== 'GET').every((c) => c.path.endsWith('/tags')));
});

test('il calendario si legge da 2 giorni fa a 28 giorni avanti, solo quello di Marco', async () => {
  const calls = mockFetch({ eventi: [] });
  await chiama();
  const letture = calls.filter((c) => c.path === '/calendars/events');
  assert.equal(letture.length, 2);
  for (const l of letture) assert.equal(l.query.get('calendarId'), 'HiNWYwGpEGZvIesthFA6');
  const da = Math.min(...letture.map((l) => Number(l.query.get('startTime'))));
  const a = Math.max(...letture.map((l) => Number(l.query.get('endTime'))));
  assert.ok(Math.abs(da - (ORA - 48 * ORE)) < 60000);
  assert.ok(Math.abs(a - (ORA + 28 * 24 * ORE)) < 60000);
});

test('Meta rifiuta: nessun tag, cosi\' il prossimo giro riprova', async () => {
  const calls = mockFetch({ metaOk: false });
  const r = await chiama();
  assert.equal(r.body.inviate, 0);
  assert.equal(r.body.errori, 1);
  assert.equal(tag(calls).length, 0);
});

test('senza il segreto del cron: 401 e nessuna chiamata; senza CRON_SECRET: 500', async () => {
  let calls = mockFetch();
  assert.equal((await chiama({ auth: '' })).status, 401);
  assert.equal((await chiama({ auth: 'Bearer sbagliato' })).status, 401);
  assert.equal(calls.length, 0);
  calls = mockFetch();
  delete process.env.CRON_SECRET;
  assert.equal((await chiama()).status, 500);
  assert.equal(calls.length, 0);
});

test('GHL non risponde sul calendario: 502 e niente a Meta', async () => {
  const calls = mockFetch({ calendarioOk: false });
  const r = await chiama();
  assert.equal(r.status, 502);
  assert.equal(meta(calls).length, 0);
});

test('nei log niente email, telefono, nome o id intero', async () => {
  mockFetch();
  const righe = await catturaLog(() => chiama());
  const testo = righe.join('\n');
  for (const vietato of ['anna@example.com', '3331234567', 'Rossi', QUIZ, ALTRA, FATTA]) assert.ok(!testo.includes(vietato), vietato);
});
