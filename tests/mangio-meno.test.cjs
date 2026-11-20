// Funnel «Mangio meno e non dimagrisco»: calcolo del profilo (js/mangio-meno-quiz.js),
// validazione e chiamate di api/mangio-meno-lead.js e api/mangio-meno-candidatura.js
// (con fetch finto: nessuna chiamata vera a GHL o Meta), eventi in api/replay-evento.js.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const quiz = require('../js/mangio-meno-quiz.js');
const lead = require('../api/mangio-meno-lead');
const candidatura = require('../api/mangio-meno-candidatura');
const replay = require('../api/replay-evento');

const realFetch = global.fetch;
const savedEnv = { ...process.env };
afterEach(() => { global.fetch = realFetch; process.env = { ...savedEnv }; });

const crypto = require('crypto');
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');

const CONTATTO = 'ContattoMangioMeno01';
const ALTRO = 'AltroContatto0000001';

// ───────────────────────── calcolo del profilo ─────────────────────────

const base = { d1: '45-49', d2: 'regolare', d3: 'braccia-reggiseno', d4: 'non-perdo', d5: 'quasi-mai', d6: 'salto', d7: 'bene' };
const r = (extra) => ({ ...base, ...extra });

test('profilo risparmio: punti A dalle risposte su dieta, colazione e allenamento', () => {
  const e = quiz.calcolaProfilo(base);
  assert.equal(e.profilo, 'risparmio');
  assert.deepEqual(e.punti, { risparmio: 6, pancia: 0, muscolo: 1 });
  assert.equal(e.sonno, false);
  assert.equal(e.eta, false);
});

test('profilo pancia, con eta dai 55 anni; niente riquadro sonno per il profilo pancia', () => {
  const e = quiz.calcolaProfilo({ d1: '55-59', d2: 'menopausa-meno-5', d3: 'pancia-fianchi', d4: 'mai-provato', d5: 'forza-2', d6: 'dolce', d7: 'sveglio-notte' });
  assert.equal(e.profilo, 'pancia');
  assert.deepEqual(e.punti, { risparmio: 1, pancia: 7, muscolo: 0 });
  assert.equal(e.sonno, false);
  assert.equal(e.eta, true);
});

test('profilo muscolo, con riquadro sonno', () => {
  const e = quiz.calcolaProfilo({ d1: '50-54', d2: 'regolare', d3: 'tono-forza', d4: 'svuotata', d5: 'cardio', d6: 'proteine', d7: 'fatico' });
  assert.equal(e.profilo, 'muscolo');
  assert.deepEqual(e.punti, { risparmio: 0, pancia: 1, muscolo: 7 });
  assert.equal(e.sonno, true);
  assert.equal(e.eta, false);
});

test('parita\': vince B, poi A, poi C', () => {
  // A 3, B 3, C 1 -> pancia
  let e = quiz.calcolaProfilo({ d2: 'irregolare', d3: 'gonfia', d4: 'non-perdo', d5: 'forza-2', d6: 'proteine', d7: 'bene' });
  assert.deepEqual(e.punti, { risparmio: 3, pancia: 3, muscolo: 1 });
  assert.equal(e.profilo, 'pancia');
  // A 4, B 0, C 4 -> risparmio
  e = quiz.calcolaProfilo({ d2: 'regolare', d3: 'braccia-reggiseno', d4: 'svuotata', d5: 'palestra-senza-forza', d6: 'salto', d7: 'bene' });
  assert.deepEqual(e.punti, { risparmio: 4, pancia: 0, muscolo: 4 });
  assert.equal(e.profilo, 'risparmio');
  // A 0, B 3, C 3 -> pancia
  e = quiz.calcolaProfilo({ d2: 'irregolare', d3: 'tono-forza', d4: 'mai-provato', d5: 'forza-2', d6: 'proteine', d7: 'bene' });
  assert.deepEqual(e.punti, { risparmio: 0, pancia: 3, muscolo: 3 });
  assert.equal(e.profilo, 'pancia');
  // Nessun punto -> pancia (B vince la parita' a zero)
  assert.equal(quiz.calcolaProfilo({}).profilo, 'pancia');
});

test('riquadro sonno: solo se D7 non e\' «Bene» e il profilo non e\' pancia', () => {
  for (const d7 of ['sveglio-notte', 'fatico', 'sveglio-stanca']) {
    assert.equal(quiz.calcolaProfilo(r({ d7 })).sonno, true, d7);
  }
  assert.equal(quiz.calcolaProfilo(r({ d7: 'bene' })).sonno, false);
});

test('riquadro eta: D1 da 55 in su oppure menopausa da piu\' di 5 anni', () => {
  assert.equal(quiz.calcolaProfilo(r({ d1: '55-59' })).eta, true);
  assert.equal(quiz.calcolaProfilo(r({ d1: '60-piu' })).eta, true);
  assert.equal(quiz.calcolaProfilo(r({ d1: '50-54' })).eta, false);
  assert.equal(quiz.calcolaProfilo(r({ d1: 'meno-40', d2: 'menopausa-piu-5' })).eta, true);
  assert.equal(quiz.calcolaProfilo(r({ d1: '40-44', d2: 'menopausa-meno-5' })).eta, false);
});

test('ogni risposta ha i punti del file dei testi', () => {
  const atteso = {
    d2: { regolare: {}, irregolare: { B: 1 }, 'menopausa-meno-5': { B: 1 }, 'menopausa-piu-5': { B: 1 } },
    d3: { 'pancia-fianchi': { B: 2 }, 'braccia-reggiseno': { A: 1, C: 1 }, gonfia: { A: 1, B: 1 }, 'tono-forza': { C: 2 } },
    d4: { 'non-perdo': { A: 2 }, 'perdo-riprendo': { A: 2 }, svuotata: { C: 2 }, 'mai-provato': { B: 1 } },
    d5: { 'quasi-mai': { A: 1 }, cardio: { C: 2 }, 'palestra-senza-forza': { A: 1, C: 1 }, 'forza-2': { B: 1 } },
    d6: { salto: { A: 2 }, dolce: { A: 1, B: 1 }, proteine: { C: 1 }, cambia: { A: 1 } },
    d7: { bene: {}, 'sveglio-notte': { B: 1 }, fatico: { B: 1 }, 'sveglio-stanca': { B: 1 } }
  };
  for (const [d, risposte] of Object.entries(atteso)) {
    for (const [id, punti] of Object.entries(risposte)) {
      const e = quiz.calcolaProfilo({ [d]: id });
      assert.deepEqual(e.punti, { risparmio: punti.A || 0, pancia: punti.B || 0, muscolo: punti.C || 0 }, `${d}=${id}`);
    }
  }
  // D1 non da' punti
  for (const risp of quiz.DOMANDE[0].risposte) {
    assert.deepEqual(quiz.calcolaProfilo({ d1: risp.id }).punti, { risparmio: 0, pancia: 0, muscolo: 0 });
  }
});

test('validaRisposte: tutte e 7, solo valori esistenti, chiavi in piu\' ignorate', () => {
  assert.deepEqual(quiz.validaRisposte({ ...base, extra: 'x' }), base);
  const { d4, ...senzaD4 } = base;
  for (const cattive of [null, undefined, 'x', [], senzaD4, r({ d3: 'inventata' }), r({ d1: 45 }), r({ d7: 'constructor' }), r({ d7: '__proto__' })]) {
    assert.equal(quiz.validaRisposte(cattive), null, JSON.stringify(cattive));
  }
  assert.equal(quiz.validaRisposte(Object.create({ d1: '45-49' })), null);
});

test('riepilogo: le 7 domande con la risposta in chiaro', () => {
  const righe = quiz.riepilogo(base);
  assert.equal(righe.length, 7);
  assert.equal(righe[0], '1. Quanti anni hai? 45-49');
  assert.equal(righe[6], '7. Come dormi? Bene');
});

// ───────────────────────── fetch finto ─────────────────────────

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

const ghl = (calls) => calls.filter((c) => c.host === 'services.leadconnectorhq.com');
const meta = (calls) => calls.filter((c) => c.host === 'graph.facebook.com');
const tagsDi = (calls, id) => calls.filter((c) => c.path === `/contacts/${id}/tags`).flatMap((c) => c.body.tags);
const notaDi = (calls, id) => calls.find((c) => c.path === `/contacts/${id}/notes`);

// ───────────────────────── /api/mangio-meno-lead ─────────────────────────

const leadValido = (extra = {}) => ({
  first_name: 'Anna', email: 'Anna@Example.com', phone: '333 123 4567', consenso: true,
  risposte: { ...base }, event_id: 'lead_1700000000000_abc123xyz',
  utm_source: 'ig', utm_campaign: 'mangio-meno', fbc: 'fb.1.1.abc', fbp: 'fb.1.1.def',
  event_source_url: 'https://go.elenagiordani.com/mangio-meno?utm_source=ig', ...extra
});

test('lead: upsert senza tag, tag additivi, nota con le 7 risposte, Lead CAPI sui due pixel', async () => {
  const calls = mockFetch();
  const r = await chiama(lead, leadValido({ risposte: { d1: '60-piu', d2: 'regolare', d3: 'tono-forza', d4: 'svuotata', d5: 'cardio', d6: 'proteine', d7: 'fatico' } }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { success: true, contactId: CONTATTO });

  const upsert = calls.find((c) => c.path === '/contacts/upsert');
  assert.equal(upsert.body.tags, undefined);
  assert.equal(upsert.body.email, 'anna@example.com');
  assert.equal(upsert.body.firstName, 'Anna');
  assert.equal(upsert.body.lastName, undefined);
  assert.equal(upsert.body.phone, '+393331234567');
  assert.equal(upsert.body.source, 'mangio-meno-quiz');
  assert.equal(upsert.body.attributionSource.utmSource, 'ig');
  assert.ok(Array.isArray(upsert.body.customFields));

  assert.deepEqual(tagsDi(calls, CONTATTO), ['mangio-meno-quiz', 'mangio-meno-profilo-muscolo', 'mangio-meno-sonno', 'mangio-meno-eta']);

  const nota = notaDi(calls, CONTATTO).body.body;
  for (const riga of quiz.riepilogo({ d1: '60-piu', d2: 'regolare', d3: 'tono-forza', d4: 'svuotata', d5: 'cardio', d6: 'proteine', d7: 'fatico' })) {
    assert.ok(nota.includes(riga), riga);
  }
  assert.ok(nota.includes('Ti muovi tanto, ma ti manca il muscolo'));

  const capi = meta(calls);
  assert.equal(capi.length, 2);
  assert.deepEqual(capi.map((c) => c.path).sort(), ['/v21.0/111/events', '/v21.0/222/events']);
  for (const c of capi) {
    const ev = c.body.data[0];
    assert.equal(ev.event_name, 'Lead');
    assert.equal(ev.event_id, 'lead_1700000000000_abc123xyz');
    assert.equal(ev.action_source, 'website');
    assert.match(ev.user_data.em[0], /^[a-f0-9]{64}$/);
    assert.equal(ev.user_data.fbc, 'fb.1.1.abc');
  }
  // id del contatto e paese su tutti e due i pixel (il pixel 1 e' quello della campagna)
  for (const c of capi) {
    const u = c.body.data[0].user_data;
    assert.deepEqual(u.external_id, [sha(CONTATTO.toLowerCase())]);
    assert.deepEqual(u.country, [sha('it')]);
    assert.deepEqual(u.fn, [sha('anna')]);
    assert.equal(u.ln, undefined);
  }
});

test('lead: il profilo lo decide il server dalle risposte, non un campo del client', async () => {
  const calls = mockFetch();
  await chiama(lead, leadValido({ profilo: 'muscolo', p: 'muscolo' }));
  assert.deepEqual(tagsDi(calls, CONTATTO), ['mangio-meno-quiz', 'mangio-meno-profilo-risparmio']);
});

test('lead: dati mancanti o sbagliati -> 400 e nessuna chiamata a GHL o Meta', async () => {
  const { d5, ...seiRisposte } = base;
  const cattivi = [
    leadValido({ first_name: '' }),
    leadValido({ first_name: '   ' }),
    leadValido({ first_name: 'A'.repeat(81) }),
    leadValido({ first_name: 123 }),
    leadValido({ email: '' }),
    leadValido({ email: 'anna@' }),
    leadValido({ email: 'a'.repeat(250) + '@x.it' }),
    leadValido({ phone: '' }),
    leadValido({ phone: '1234' }),
    leadValido({ phone: '1'.repeat(31) }),
    leadValido({ phone: '+39 333 123 4567 890 12' }),
    leadValido({ consenso: false }),
    leadValido({ consenso: 'true' }),
    leadValido({ risposte: seiRisposte }),
    leadValido({ risposte: { ...base, d3: 'inventata' } }),
    leadValido({ risposte: 'tutte' }),
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

test('lead: corpo arrivato come testo JSON viene letto', async () => {
  const calls = mockFetch();
  const out = await chiama(lead, JSON.stringify(leadValido()));
  assert.equal(out.status, 200);
  assert.equal(ghl(calls).length, 3);
});

test('lead: solo POST; GHL che rifiuta l\'upsert -> 502 senza tag ne\' nota', async () => {
  let calls = mockFetch();
  for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await chiama(lead, leadValido(), { method })).status, 405);
  assert.equal(calls.length, 0);

  calls = mockFetch({ upsertOk: false });
  const out = await chiama(lead, leadValido());
  assert.equal(out.status, 502);
  assert.equal(out.body.success, false);
  assert.equal(calls.filter((c) => c.path.endsWith('/tags') || c.path.endsWith('/notes')).length, 0);
  assert.equal(meta(calls).length, 0);
});

test('lead: senza event_id valido nessuna CAPI; senza chiave GHL 500 senza chiamate', async () => {
  let calls = mockFetch();
  await chiama(lead, leadValido({ event_id: '' }));
  assert.equal(meta(calls).length, 0);
  calls = mockFetch();
  await chiama(lead, leadValido({ event_id: 'x<script>' }));
  assert.equal(meta(calls).length, 0);

  calls = mockFetch();
  delete process.env.GHL_API_KEY;
  assert.equal((await chiama(lead, leadValido())).status, 500);
  assert.equal(calls.length, 0);
});

test('lead: nei log niente nome, email, telefono o id intero', async () => {
  const righe = await catturaLog(async () => {
    mockFetch(); await chiama(lead, leadValido());
    mockFetch({ upsertOk: false }); await chiama(lead, leadValido());
  });
  assert.ok(righe.length >= 2);
  for (const riga of righe) {
    for (const vietato of ['Anna', 'anna@example.com', '3331234567', '333 123 4567', CONTATTO]) {
      assert.ok(!riga.includes(vietato), riga);
    }
  }
});

// ───────────────────────── /api/mangio-meno-candidatura ─────────────────────────

const candValida = (extra = {}) => ({
  first_name: 'Anna', email: 'anna@example.com', phone: '+39 333 1234567',
  obiettivo: 'Perdere la pancia e tornare forte', anno: 'si', investire: 'si', iniziare: 'si', call: 'si',
  c: CONTATTO, event_id: 'app_1700000000000_abc123xyz', ...extra
});

test('candidatura qualificata: tag qualificata, nota con le risposte, SubmitApplication CAPI', async () => {
  const calls = mockFetch();
  const out = await chiama(candidatura, candValida());
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { success: true, contactId: CONTATTO, qualificata: true });
  assert.equal(calls.find((c) => c.path === '/contacts/upsert').body.tags, undefined);
  assert.deepEqual(tagsDi(calls, CONTATTO), ['mangio-meno-candidatura', 'mangio-meno-qualificata']);
  const nota = notaDi(calls, CONTATTO).body.body;
  assert.ok(nota.includes('Qual è il tuo obiettivo principale? Perdere la pancia e tornare forte'));
  assert.ok(nota.includes('Puoi iniziare entro 15 giorni? Sì'));
  const capi = meta(calls);
  assert.equal(capi.length, 2);
  for (const c of capi) {
    assert.equal(c.body.data[0].event_name, 'SubmitApplication');
    assert.equal(c.body.data[0].event_id, 'app_1700000000000_abc123xyz');
  }
});

test('candidatura con almeno un no: tag non-qualificata e nessuna CAPI', async () => {
  for (const k of ['anno', 'investire', 'iniziare', 'call']) {
    const calls = mockFetch();
    const out = await chiama(candidatura, candValida({ [k]: 'no' }));
    assert.equal(out.status, 200);
    assert.equal(out.body.qualificata, false);
    assert.deepEqual(tagsDi(calls, CONTATTO), ['mangio-meno-candidatura', 'mangio-meno-non-qualificata']);
    assert.ok(notaDi(calls, CONTATTO).body.body.includes('non qualificata'));
    assert.equal(meta(calls).length, 0);
  }
});

test('candidatura: GHL trova un contatto diverso da ?c= -> si scrive su quello dell\'upsert', async () => {
  const calls = mockFetch({ upsertId: ALTRO });
  const out = await chiama(candidatura, candValida());
  assert.equal(out.body.contactId, ALTRO);
  assert.deepEqual(tagsDi(calls, CONTATTO), []);
  assert.deepEqual(tagsDi(calls, ALTRO), ['mangio-meno-candidatura', 'mangio-meno-qualificata']);
});

test('candidatura: dati mancanti o sbagliati -> 400 e nessuna chiamata', async () => {
  const cattivi = [
    candValida({ first_name: '' }),
    candValida({ email: 'non-email' }),
    candValida({ phone: '12' }),
    candValida({ obiettivo: '' }),
    candValida({ obiettivo: '   ' }),
    candValida({ obiettivo: 'x'.repeat(501) }),
    candValida({ obiettivo: 42 }),
    candValida({ anno: undefined }),
    candValida({ investire: 'sì' }),
    candValida({ iniziare: 'yes' }),
    candValida({ call: true }),
    'non json',
    null
  ];
  for (const body of cattivi) {
    const calls = mockFetch();
    const out = await chiama(candidatura, body);
    assert.equal(out.status, 400, JSON.stringify(body).slice(0, 80));
    assert.equal(calls.length, 0);
  }
});

test('candidatura: c malformato si ignora, upsert fallito -> 502, solo POST', async () => {
  let calls = mockFetch();
  assert.equal((await chiama(candidatura, candValida({ c: '../contacts/x' }))).status, 200);
  assert.deepEqual(tagsDi(calls, CONTATTO), ['mangio-meno-candidatura', 'mangio-meno-qualificata']);

  calls = mockFetch({ upsertOk: false });
  assert.equal((await chiama(candidatura, candValida())).status, 502);
  assert.equal(calls.length, 1);

  calls = mockFetch();
  assert.equal((await chiama(candidatura, candValida(), { method: 'GET' })).status, 405);
  assert.equal(calls.length, 0);
});

test('candidatura: nei log niente dati personali', async () => {
  const righe = await catturaLog(async () => {
    mockFetch({ upsertId: ALTRO }); await chiama(candidatura, candValida());
    mockFetch({ upsertOk: false }); await chiama(candidatura, candValida());
  });
  assert.ok(righe.length >= 2);
  for (const riga of righe) {
    for (const vietato of ['Anna', 'anna@example.com', '3331234567', 'Perdere la pancia', CONTATTO, ALTRO]) {
      assert.ok(!riga.includes(vietato), riga);
    }
  }
});

// ───────────────────────── /api/replay-evento: eventi mangio-meno ─────────────────────────

test('replay-evento: ogni evento delle lezioni diventa il tag mangio-meno-<evento>', async () => {
  const eventi = ['lezione-1-avviata', 'lezione-2-avviata', 'lezione-3-avviata', 'lezione-1-finita', 'lezione-2-finita', 'lezione-3-finita', 'clic-candidatura', 'clic-whatsapp'];
  let ip = 0;
  for (const evento of eventi) {
    const calls = mockFetch();
    const out = { headers: {} };
    const res = { setHeader() {}, status(c) { out.status = c; return this; }, json() { return this; }, end() { return this; } };
    await replay({ method: 'POST', body: { c: CONTATTO, replay: 'mangio-meno', evento }, headers: { 'x-forwarded-for': `198.51.100.${++ip}` } }, res);
    assert.equal(out.status, 204);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, `/contacts/${CONTATTO}/tags`);
    assert.deepEqual(calls[0].body, { tags: [`mangio-meno-${evento}`] });
  }
  for (const evento of ['lezione-4-avviata', 'avviato', 'visto-50']) {
    const calls = mockFetch();
    const out = {};
    const res = { setHeader() {}, status(c) { out.status = c; return this; }, json() { return this; }, end() { return this; } };
    await replay({ method: 'POST', body: { c: CONTATTO, replay: 'mangio-meno', evento }, headers: { 'x-forwarded-for': `198.51.100.${++ip}` } }, res);
    assert.equal(out.status, 400, evento);
    assert.equal(calls.length, 0);
  }
});

// ───────────────────────── campi personalizzati «Mangio meno · …» ─────────────────────────

const campiGhl = require('../api/_lib/mangio-meno-campi');
const valoreCampo = (upsert, id) => (upsert.body.customFields.find((f) => f.id === id) || {}).value;

test('lead: le 7 risposte in chiaro e il profilo vanno nei campi, insieme agli UTM', async () => {
  const calls = mockFetch();
  await chiama(lead, leadValido({ risposte: { d1: '60-piu', d2: 'regolare', d3: 'tono-forza', d4: 'svuotata', d5: 'cardio', d6: 'proteine', d7: 'fatico' } }));
  const upsert = calls.find((c) => c.path === '/contacts/upsert');
  const ID = campiGhl.ID;
  assert.equal(valoreCampo(upsert, ID.eta), '60 o più');
  assert.equal(valoreCampo(upsert, ID.ciclo), 'Regolare');
  assert.equal(valoreCampo(upsert, ID.corpo), 'Ho perso tono e forza');
  assert.equal(valoreCampo(upsert, ID.mangiare_meno), 'Perdo peso, ma mi sento svuotata e molle');
  assert.equal(valoreCampo(upsert, ID.allenamento), 'Cammino o faccio cardio, anche tanto');
  assert.equal(valoreCampo(upsert, ID.colazione), 'Uova, yogurt o altre proteine');
  assert.equal(valoreCampo(upsert, ID.sonno), 'Fatico ad addormentarmi');
  assert.equal(valoreCampo(upsert, ID.profilo), 'muscolo');
  // gli UTM restano: utm_source e utm_campaign del lead di prova
  assert.ok(upsert.body.customFields.some((f) => f.value === 'ig'));
  assert.equal(upsert.body.customFields.length, 8 + 2);
});

test('candidatura: obiettivo e risposte sì/no nei campi; niente campi del quiz', async () => {
  const calls = mockFetch();
  await chiama(candidatura, candValida({ iniziare: 'no' }));
  const upsert = calls.find((c) => c.path === '/contacts/upsert');
  const ID = campiGhl.ID;
  assert.equal(valoreCampo(upsert, ID.obiettivo), 'Perdere la pancia e tornare forte');
  assert.equal(valoreCampo(upsert, ID.anno), 'Sì');
  assert.equal(valoreCampo(upsert, ID.investire), 'Sì');
  assert.equal(valoreCampo(upsert, ID.iniziare), 'No');
  assert.equal(valoreCampo(upsert, ID.call), 'Sì');
  assert.equal(valoreCampo(upsert, ID.profilo), undefined);
  assert.equal(valoreCampo(upsert, ID.eta), undefined);
});

test('campi: 13 ID diversi, e ogni domanda del quiz ha il suo campo', () => {
  const ids = Object.values(campiGhl.ID);
  assert.equal(ids.length, 13);
  assert.equal(new Set(ids).size, 13);
  const campi = campiGhl.campiQuiz({ d1: '40-44', d2: 'irregolare', d3: 'gonfia', d4: 'non-perdo', d5: 'quasi-mai', d6: 'salto', d7: 'bene' }, 'risparmio');
  assert.equal(campi.length, 8);
  assert.ok(campi.every((c) => typeof c.value === 'string' && c.value.length > 0));
});

// ───────────────────────── nome e cognome per Meta ─────────────────────────

const mm = require('../api/_lib/mangio-meno');

test('nomeMeta: nome e cognome scritti insieme nel campo Nome si dividono; punteggiatura via', () => {
  assert.deepEqual(mm.nomeMeta('Anna'), { fn: 'Anna', ln: '' });
  assert.deepEqual(mm.nomeMeta('  Anna   Rossi '), { fn: 'Anna', ln: 'Rossi' });
  assert.deepEqual(mm.nomeMeta('Maria Grazia Rossi'), { fn: 'Maria Grazia', ln: 'Rossi' });
  assert.deepEqual(mm.nomeMeta("Anna D'Angelo"), { fn: 'Anna', ln: 'DAngelo' });
  assert.deepEqual(mm.nomeMeta('Maria Grazia', 'Rossi'), { fn: 'Maria Grazia', ln: 'Rossi' });
  assert.deepEqual(mm.nomeMeta('', ''), { fn: '', ln: '' });
});

test('lead: «Anna Rossi» nel campo Nome -> fn anna e ln rossi a Meta; GHL riceve il nome come scritto', async () => {
  const calls = mockFetch();
  const r = await chiama(lead, leadValido({ first_name: 'Anna Rossi' }));
  assert.equal(r.status, 200);
  assert.equal(calls.find((c) => c.path === '/contacts/upsert').body.firstName, 'Anna Rossi');
  for (const c of meta(calls)) {
    assert.deepEqual(c.body.data[0].user_data.fn, [sha('anna')]);
    assert.deepEqual(c.body.data[0].user_data.ln, [sha('rossi')]);
  }
});

// ───────────────────────── lezioni a Meta (replay-evento) ─────────────────────────

async function evento(body, ip) {
  const out = {};
  const res = { setHeader() {}, status(c) { out.status = c; return this; }, json() { return this; }, end() { return this; } };
  await replay({ method: 'POST', body, headers: { 'x-forwarded-for': ip, 'user-agent': 'ua-server' } }, res);
  return out;
}

test('replay-evento mangio-meno con event_id: tag in GHL e lo stesso evento a Meta CAPI sui due pixel', async () => {
  const calls = mockFetch();
  const out = await evento({
    c: CONTATTO, replay: 'mangio-meno', evento: 'lezione-2-finita', event_id: 'mm_1700000000000_abc123xyz',
    fbc: 'fb.1.1.abc', fbp: 'fb.1.1.def', event_source_url: 'https://go.elenagiordani.com/mangio-meno-lezioni',
    user_agent: 'Mozilla/5.0 test'
  }, '198.51.100.201');
  assert.equal(out.status, 204);
  assert.deepEqual(tagsDi(calls, CONTATTO), ['mangio-meno-lezione-2-finita']);
  const capi = meta(calls);
  assert.deepEqual(capi.map((c) => c.path).sort(), ['/v21.0/111/events', '/v21.0/222/events']);
  for (const c of capi) {
    const ev = c.body.data[0];
    assert.equal(ev.event_name, 'LezioneFinita');
    assert.equal(ev.event_id, 'mm_1700000000000_abc123xyz');
    assert.deepEqual(ev.custom_data, { content_name: 'Lezione 2 Mangio meno', content_category: 'mangio-meno' });
    assert.equal(ev.event_source_url, 'https://go.elenagiordani.com/mangio-meno-lezioni');
    assert.deepEqual(ev.user_data.external_id, [sha(CONTATTO.toLowerCase())]);
    assert.equal(ev.user_data.fbc, 'fb.1.1.abc');
    assert.equal(ev.user_data.client_user_agent, 'Mozilla/5.0 test');
    assert.equal(ev.user_data.client_ip_address, '198.51.100.201');
    assert.equal(ev.user_data.em, undefined);
    assert.equal(ev.user_data.ph, undefined);
  }
});

test('replay-evento: senza event_id valido, o per il replay del webinar, nessuna CAPI', async () => {
  let calls = mockFetch();
  await evento({ c: CONTATTO, replay: 'mangio-meno', evento: 'clic-candidatura' }, '198.51.100.202');
  assert.equal(meta(calls).length, 0);
  calls = mockFetch();
  await evento({ c: CONTATTO, replay: 'mangio-meno', evento: 'clic-candidatura', event_id: 'x' }, '198.51.100.203');
  assert.equal(meta(calls).length, 0);
  calls = mockFetch();
  await evento({ c: CONTATTO, replay: 'webinar-10-novembre-2026', evento: 'avviato', event_id: 'mm_1700000000000_abc123xyz' }, '198.51.100.204');
  assert.equal(meta(calls).length, 0);
  assert.equal(ghl(calls).length, 1);
});

test('replay-evento: senza chiave GHL l\'evento va comunque a Meta, e risponde 204', async () => {
  const calls = mockFetch();
  delete process.env.GHL_API_KEY;
  const righe = await catturaLog(async () => {
    const out = await evento({ c: CONTATTO, replay: 'mangio-meno', evento: 'lezione-1-avviata', event_id: 'mm_1700000000000_abc123xyz' }, '198.51.100.205');
    assert.equal(out.status, 204);
  });
  assert.equal(ghl(calls).length, 0);
  assert.equal(meta(calls).length, 2);
  assert.ok(righe.every((x) => !x.includes(CONTATTO)));
});

test('nomi degli eventi Meta uguali nel browser (js/mangio-meno.js) e nel server (replay-evento)', () => {
  const fs = require('fs');
  const path = require('path');
  const js = fs.readFileSync(path.join(__dirname, '..', 'js', 'mangio-meno.js'), 'utf8');
  const blocco = js.slice(js.indexOf('var META = {'), js.indexOf('};', js.indexOf('var META = {')));
  const browser = {};
  for (const m of blocco.matchAll(/'([a-z0-9-]+)': \['([A-Za-z]+)', '([^']+)'\]/g)) browser[m[1]] = { nome: m[2], contenuto: m[3] };
  assert.deepEqual(browser, replay.META_MANGIO_MENO);
  assert.deepEqual(Object.keys(replay.META_MANGIO_MENO).sort(), Object.keys(replay.REPLAY['mangio-meno']).sort());
});

test('pulsante WhatsApp: unico passo dopo risultato e lezioni, stesso link nel JS e nel redirect delle email, stesso numero del link in bio', () => {
  const fs = require('fs');
  const path = require('path');
  const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const redirects = JSON.parse(leggi('vercel.json')).redirects;
  const email = redirects.find((x) => x.source === '/whatsapp-check-up');
  const bio = redirects.find((x) => x.source === '/bio');
  assert.ok(email && email.permanent === false);
  const js = leggi('js/mangio-meno.js').match(/var WHATSAPP = '([^']+)';/);
  assert.ok(js);
  assert.equal(js[1], email.destination);
  const u = new URL(email.destination);
  assert.equal(u.hostname, 'wa.me');
  assert.equal(u.pathname, new URL(bio.destination).pathname);
  // il testo che Flinky riconosce e che usiamo per contare chi scrive da sola
  assert.equal(u.searchParams.get('text'), "Ciao Elena! Ho fatto il Check-Up e vorrei sapere come funziona l'X-Fit Academy.");
  // Funnel lineare: dopo il risultato e le lezioni si scrive su WhatsApp; la candidatura arriva
  // dopo, con il link mandato in chat. Su queste due pagine non ci deve essere.
  for (const pagina of ['mangio-meno-risultato.html', 'mangio-meno-lezioni.html']) {
    const html = leggi(pagina);
    assert.doesNotMatch(html, /mangio-meno-candidatura|data-candidatura/, pagina + ': niente candidatura');
    const bottoni = [...html.matchAll(/<a\b[^>]*\bdata-whatsapp\b[^>]*>/g)].map((m) => m[0]);
    assert.ok(bottoni.length >= 1, pagina);
    for (const b of bottoni) assert.match(b, /href="\/whatsapp-check-up"/, pagina);
    // ogni pulsante porta l'icona di WhatsApp (non un'altra icona della pagina)
    const conIcona = [...html.matchAll(/<a\b[^>]*\bdata-whatsapp\b[^>]*><svg[^>]*><path[^>]*d="M17\.47 14\.38/g)];
    assert.equal(conIcona.length, bottoni.length, pagina + ': icona WhatsApp');
    assert.ok(html.indexOf('/js/mangio-meno.js') > html.lastIndexOf('data-whatsapp'), pagina + ': lo script va dopo i pulsanti');
  }
});
