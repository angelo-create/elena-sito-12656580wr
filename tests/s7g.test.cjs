'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createHash } = require('node:crypto');

const stripePath = require.resolve('stripe');
const Stripe = require(stripePath);
const signatureApi = Stripe('sk_test_fixture').webhooks;
const secret = 'whsec_fixture';
const fabricatedPaymentId = 'pi_fakes7g01234';
const requestId = 's7g_12345678-1234-4123-8123-123456789012';
const contactId = 'fakeContact';
const input = {
  name: 'Maria Rossi', email: 'maria@example.test', phone: '333 123 4567',
  event_id: requestId, utm_source: 'meta', utm_campaign: 'c'.repeat(501), fbp: 'fb.1.123.456', fbc: 'fb.1.123.abc'
};
const created = 1795770000;

let intent, createdWith, updateKeys, fetchCalls, notes, ghlDown, rejectedPixel;
const paymentIntents = {
  async create(params, { idempotencyKey }) {
    if (createdWith) {
      assert.deepEqual(createdWith, { params, idempotencyKey });
    } else {
      createdWith = { params, idempotencyKey };
      intent = { id: fabricatedPaymentId, ...structuredClone(params), created, client_secret: 'fake-payment-secret', status: 'requires_payment_method' };
    }
    return structuredClone(intent);
  },
  async retrieve(id) {
    if (id !== intent.id) throw Object.assign(new Error('missing'), { code: 'resource_missing' });
    return structuredClone(intent);
  },
  async update(id, params, options) {
    assert.equal(id, intent.id);
    const key = options?.idempotencyKey;
    if (key && updateKeys.has(key)) {
      if (JSON.stringify(params) !== JSON.stringify(updateKeys.get(key))) {
        throw Object.assign(new Error('idempotency mismatch'), { type: 'StripeIdempotencyError' });
      }
      return structuredClone(intent);
    }
    if (key) updateKeys.set(key, structuredClone(params));
    Object.assign(intent.metadata, params.metadata);
    return structuredClone(intent);
  }
};

require.cache[stripePath].exports = () => ({ paymentIntents, webhooks: signatureApi });
const checkout = require('../api/s7g-checkout');
const order = require('../api/s7g-ordine');
const webhook = require('../api/s7g-stripe-webhook');
require.cache[stripePath].exports = Stripe;

beforeEach(t => {
  intent = undefined;
  createdWith = undefined;
  updateKeys = new Map();
  fetchCalls = [];
  notes = [];
  ghlDown = false;
  rejectedPixel = null;
  const env = {
    STRIPE_WEBHOOK_SECRET_S7G: secret,
    GHL_API_KEY: 'fixture', GHL_LOCATION_ID: 'fixture-location',
    META_PIXEL_ID: '101', META_ACCESS_TOKEN: 'fixture-1',
    META_PIXEL_ID_2: '102', META_ACCESS_TOKEN_2: 'fixture-2'
  };
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'info', () => {});
  const old = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  t.mock.method(global, 'fetch', async (url, init) => {
    const { hostname, pathname } = new URL(url);
    const method = init.method;
    const data = init.body ? JSON.parse(init.body) : undefined;
    fetchCalls.push({ hostname, pathname, method, data });
    const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
    if (hostname === 'graph.facebook.com') {
      return pathname.includes('/' + rejectedPixel + '/') ? json({}, 503) : json({ events_received: 1 });
    }
    assert.equal(hostname, 'services.leadconnectorhq.com');
    if (ghlDown) return json({}, 503);
    if (pathname === '/contacts/upsert') return json({ contact: { id: contactId } });
    if (pathname === '/contacts/fakeContact/tags') return json({});
    assert.equal(pathname, '/contacts/fakeContact/notes');
    if (method === 'GET') return json({ notes });
    notes.push(data);
    return json({});
  });
});

async function invoke(handler, req) {
  const res = {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return res;
}

function checkoutRequest(body, headers = {}) {
  return {
    method: 'POST', body, headers: {
      'content-type': 'application/json', origin: 'https://go.elenagiordani.com',
      host: 'go.elenagiordani.com', 'x-forwarded-proto': 'https', 'x-forwarded-for': '203.0.113.4',
      'user-agent': 'a'.repeat(510), ...headers
    }
  };
}

function webhookRequest(type, validSignature = true) {
  const payload = JSON.stringify({ id: 'evt_fixture', type, created, data: { object: intent } });
  const header = signatureApi.generateTestHeaderString({ payload, secret: validSignature ? secret : 'whsec_invalid' });
  const req = Readable.from([Buffer.from(payload)]);
  req.method = 'POST';
  req.headers = { 'stripe-signature': header };
  return req;
}

async function paidIntent() {
  const res = await invoke(checkout, checkoutRequest(input));
  assert.equal(res.code, 200);
  Object.assign(intent, {
    status: 'succeeded',
    amount_received: 3700,
    payment_method: { billing_details: { name: input.name, email: input.email, phone: '+393331234567' }, type: 'card' },
    latest_charge: { payment_method_details: { type: 'card', card: { wallet: { type: 'apple_pay' } } } }
  });
  fetchCalls.length = 0;
}

test('checkout rifiuta origini esterne e valida i campi prima delle chiamate', async () => {
  const origin = await invoke(checkout, checkoutRequest(input, { origin: 'https://www.elenagiordani.com' }));
  assert.equal(origin.code, 403);
  const bad = await invoke(checkout, checkoutRequest({ ...input, name: 'Maria', email: 'no', phone: '+39' }));
  assert.equal(bad.code, 400);
  assert.deepEqual(bad.body.fields, { name: 'invalid', email: 'invalid', phone: 'invalid' });
  assert.equal(fetchCalls.length, 0);
  assert.equal(createdWith, undefined);
});

test('checkout con UTM, tag additivi, PaymentIntent idempotente e CAPI sui due pixel', async () => {
  const res = await invoke(checkout, checkoutRequest(input));
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { client_secret: intent.client_secret });
  assert.equal(res.headers['Cache-Control'], 'no-store');
  const [upsert, addTag, ...pixels] = fetchCalls;
  assert.equal(upsert.pathname, '/contacts/upsert');
  assert.equal(Object.hasOwn(upsert.data, 'tags'), false);
  assert.equal(upsert.data.phone, '+393331234567');
  assert.equal(upsert.data.attributionSource.utmSource, 'meta');
  assert.ok(upsert.data.customFields.some(field => field.value === 'meta'));
  assert.equal(addTag.pathname, '/contacts/fakeContact/tags');
  assert.deepEqual(addTag.data, { tags: ['s7g-go-carrello'] });
  const { params, idempotencyKey } = createdWith;
  assert.equal(params.amount, 3700);
  assert.equal(params.currency, 'eur');
  assert.equal(params.receipt_email, input.email);
  assert.deepEqual(params.automatic_payment_methods, { enabled: true });
  assert.equal(intent.metadata.ghl_contact_id, contactId);
  assert.equal(params.metadata.product, 'sfida-7-giorni-go');
  assert.equal(params.metadata.event_id, requestId);
  assert.equal(params.metadata.fbp, input.fbp);
  assert.equal(params.metadata.fbc, input.fbc);
  assert.equal(params.metadata.utm_campaign.length, 500);
  assert.equal(params.metadata.user_agent.length, 500);
  assert.equal(params.metadata.client_ip, '203.0.113.4');
  assert.equal(idempotencyKey, `s7g-checkout-${requestId}`);
  assert.deepEqual(pixels.map(call => call.pathname), ['/v21.0/101/events', '/v21.0/102/events']);
  assert.ok(pixels.every(({ data }) => data.data[0].event_id === requestId && data.data[0].event_name === 'InitiateCheckout'));
  assert.deepEqual((await invoke(checkout, checkoutRequest(input))).body, res.body);
});

test('Stripe parte durante un errore GHL e il retry recupera il riferimento GHL', async () => {
  ghlDown = true;
  const first = await invoke(checkout, checkoutRequest(input));
  assert.equal(first.code, 200);
  assert.equal(intent.metadata.ghl_contact_id, undefined);
  ghlDown = false;
  const second = await invoke(checkout, checkoutRequest(input));
  assert.deepEqual(second.body, first.body);
  assert.equal(intent.metadata.ghl_contact_id, contactId);
});

test('riepilogo risponde con i soli campi pubblici e rifiuta gli intent degli altri prodotti', async () => {
  await paidIntent();
  const req = { method: 'GET', query: { payment_intent: fabricatedPaymentId } };
  let res = await invoke(order, req);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { status: 'succeeded', amount: 3700, event_id: requestId });
  intent.metadata.product = 'altro';
  res = await invoke(order, req);
  assert.equal(res.code, 404);
  res = await invoke(order, { ...req, query: { payment_intent: [fabricatedPaymentId] } });
  assert.equal(res.code, 400);
});

test('webhook usa firma e secret dedicati e ignora errori di pagamento senza scritture', async () => {
  await paidIntent();
  const type = 'payment_intent.succeeded';
  const bad = await invoke(webhook, webhookRequest(type, false));
  assert.equal(bad.code, 400);
  const failed = await invoke(webhook, webhookRequest('payment_intent.payment_failed'));
  assert.equal(failed.code, 200);
  delete process.env.STRIPE_WEBHOOK_SECRET_S7G;
  const missing = await invoke(webhook, webhookRequest(type));
  assert.equal(missing.code, 500);
  assert.equal(fetchCalls.length, 0);
});

test('webhook idempotente su retry e consegne simultanee, con Purchase deduplicabile', async () => {
  await paidIntent();
  const type = 'payment_intent.succeeded';
  const results = await Promise.all([
    invoke(webhook, webhookRequest(type)), invoke(webhook, webhookRequest(type))
  ]);
  assert.ok(results.some(result => result.code === 200));
  assert.equal((await invoke(webhook, webhookRequest(type))).code, 200);
  assert.equal(intent.metadata.s7g_fulfilled, '1');
  assert.equal(notes.length, 1);
  assert.ok(notes[0].body.includes(fabricatedPaymentId));
  assert.ok(notes[0].body.includes('apple_pay'));
  const [upsert, tags, list, note, ...pixels] = fetchCalls;
  assert.equal(upsert.pathname, '/contacts/upsert');
  assert.equal(Object.hasOwn(upsert.data, 'tags'), false);
  assert.deepEqual(tags.data.tags, ['il_primo_passo', 'sfida-purchased-day0', 's7g-go-acquisto']);
  assert.equal(list.method, 'GET');
  assert.equal(note.method, 'POST');
  assert.equal(pixels.length, 2);
  const event = pixels[0].data.data[0];
  assert.equal(event.event_id, requestId);
  assert.equal(event.event_name, 'Purchase');
  assert.equal(event.event_source_url, 'https://go.elenagiordani.com/riepilogo-ordine');
  assert.deepEqual(event.custom_data, { value: 37, currency: 'EUR', content_name: 'Sfida 7 Giorni go' });
  assert.deepEqual(event.user_data.em, [createHash('sha256').update(input.email).digest('hex')]);
  for (const field of ['fn', 'ln', 'ph']) assert.match(event.user_data[field][0], /^[0-9a-f]{64}$/);
  assert.equal(event.user_data.fbc, input.fbc);
});

test('webhook riprende dal checkpoint quando un solo pixel rifiuta il Purchase', async () => {
  await paidIntent();
  rejectedPixel = '102';
  assert.equal((await invoke(webhook, webhookRequest('payment_intent.succeeded'))).code, 500);
  fetchCalls.length = 0;
  rejectedPixel = null;
  assert.equal((await invoke(webhook, webhookRequest('payment_intent.succeeded'))).code, 200);
  assert.deepEqual(fetchCalls.map(call => call.pathname), ['/v21.0/102/events']);
  assert.equal(notes.length, 1);
});
