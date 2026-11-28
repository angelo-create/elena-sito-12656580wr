'use strict';

const crypto = require('node:crypto');
const Stripe = require('stripe');
const { buildUtmPayload } = require('./build-utm-payload');
const { nomeMeta } = require('./mangio-meno');
const { normalizePhone } = require('./normalize-phone');

const OFFERS = {
  standard: {
    product: 'sfida-7-giorni-go',
    amount: 3700,
    content_name: 'Sfida 7 Giorni go',
    cartTags: ['s7g-go-carrello'],
    purchaseTags: ['il_primo_passo', 'sfida-purchased-day0', 's7g-go-acquisto'],
    cartPath: '/carrello-sfida-7giorni',
    orderPath: '/riepilogo-ordine'
  },
  bf: {
    product: 'sfida-7-giorni-bf-2026',
    amount: 700,
    content_name: 'Sfida 7 Giorni Black Friday', // COPY-BF: nome in Meta e nella nota GHL, allineato a js/s7g.js.
    cartTags: ['s7g-go-carrello'], // stessi tag della Sfida a 37 € (Angelo, 27/11)
    purchaseTags: ['il_primo_passo', 'sfida-purchased-day0', 's7g-go-acquisto'], // le vendite BF si distinguono da metadata.product su Stripe e dalla nota GHL
    cartPath: '/carrello-sfida-7giorni-black-friday',
    orderPath: '/riepilogo-ordine',
    landingPath: '/s7g-black-friday',
    endsAt: Date.parse('2026-12-01T00:00:00+01:00')
  }
};
const CURRENCY = 'eur';
const SITE = 'https://go.elenagiordani.com';
const INTENT_RE = /^pi_[A-Za-z0-9]{8,100}$/;
const EVENT_RE = /^s7g_[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'msclkid', 'landing_url', 'referrer'];

function stripeClient() {
  return Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 8000, maxNetworkRetries: 1 });
}

function clip(value, length = 500) {
  return typeof value === 'string' ? Array.from(value.trim()).slice(0, length).join('') : '';
}

function contactFrom(body) {
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const phone = normalizePhone(rawPhone);
  const fields = {};
  const parts = name.split(' ');
  if (parts.length < 2 || name.length > 120 || !parts.every(part => /\p{L}/u.test(part)) ||
      !/^[\p{L}\p{M} .’'\-]+$/u.test(name)) fields.name = 'invalid';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'invalid';
  if (rawPhone.length > 35 || !/^\+?[\d\s().-]+$/.test(rawPhone) ||
      !/^\+[1-9]\d{7,14}$/.test(phone) || /^\+39\d{0,6}$/.test(phone)) fields.phone = 'invalid';
  const lastName = parts.pop();
  return { fields, contact: { firstName: parts.join(' '), lastName, email, phone } };
}

async function ghl(path, method, data) {
  const token = process.env.GHL_API_KEY || process.env.GHL_PIT_TOKEN;
  if (!token) throw new Error('GHL non configurato');
  const response = await fetch(`https://services.leadconnectorhq.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json'
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`GHL ${method} ${response.status}`);
  return response;
}

async function upsert(contact, attribution) {
  const { attributionSource, customFields } = buildUtmPayload(attribution);
  // /contacts/upsert sostituisce i tag esistenti se riceve il campo tags.
  const payload = { locationId: process.env.GHL_LOCATION_ID || 'whfxv9CQCrjAmBTZJwMw', ...contact };
  if (attributionSource) payload.attributionSource = attributionSource;
  if (customFields.length) payload.customFields = customFields;
  const result = await (await ghl('/contacts/upsert', 'POST', payload)).json();
  if (!result.contact?.id) throw new Error('ID contatto GHL assente');
  return result.contact.id;
}

function contactPath(id) {
  return `/contacts/${encodeURIComponent(id)}`;
}

function addTags(id, tags) {
  return ghl(`${contactPath(id)}/tags`, 'POST', { tags });
}

async function addPaymentNote(id, intent, offer) {
  const path = `${contactPath(id)}/notes`;
  const { notes } = await (await ghl(path, 'GET')).json();
  if (!Array.isArray(notes)) throw new Error('Elenco note GHL non disponibile');
  // Recupera anche il caso in cui GHL abbia salvato la nota prima di un timeout.
  const reference = `Pagamento Stripe: ${intent.id}`;
  if (notes.some(note => (note.bodyText || note.body || '').includes(reference))) return;
  const details = intent.latest_charge?.payment_method_details;
  const method = details?.card?.wallet?.type || details?.type || intent.payment_method?.type || 'Stripe';
  const amount = (intent.amount_received / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  await ghl(path, 'POST', { body: `Il Primo Passo (${offer.content_name})\nImporto: ${amount}\n${reference}\nMetodo: ${method}` });
}

function hash(value) {
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

// Dati della persona cifrati come li vuole Meta, uguali per server e browser.
// external_id = id del contatto GHL, cifrato come in api/_lib/mangio-meno.js e
// api/webinar-lead.js: la stessa persona ha lo stesso codice in tutti i funnel.
// Paese dall'indirizzo di fatturazione Stripe; senza indirizzo, Italia solo se il
// telefono è italiano (gli altri funnel mandano sempre Italia).
function userHashes(contact) {
  const { fn, ln } = nomeMeta(contact.firstName, contact.lastName);
  const out = {};
  for (const [key, value] of Object.entries({
    em: contact.email, ph: contact.phone?.replace(/\D/g, ''), fn, ln,
    external_id: contact.externalId,
    country: /^[A-Za-z]{2}$/.test(contact.country || '') ? contact.country
      : (!contact.phone || contact.phone.startsWith('+39') ? 'it' : undefined)
  })) {
    if (value) out[key] = hash(value);
  }
  return out;
}

function buyerFrom(intent) {
  const charge = intent.latest_charge?.billing_details || {};
  const method = intent.payment_method?.billing_details || {};
  const parts = (method.name || charge.name || '').trim().split(/\s+/);
  const lastName = parts.length > 1 ? parts.pop() : '';
  const phone = normalizePhone(method.phone || charge.phone);
  return {
    email: intent.receipt_email || method.email || charge.email,
    firstName: parts.join(' ') || undefined,
    lastName: lastName || undefined,
    phone: phone || undefined,
    country: method.address?.country || charge.address?.country || undefined,
    externalId: intent.metadata?.ghl_contact_id || undefined
  };
}

async function sendCapi(eventName, contact, metadata, eventTime, offer, completed = {}) {
  const suffixes = ['', '_2'];
  const user = Object.fromEntries(Object.entries(userHashes(contact)).map(([key, value]) => [key, [value]]));
  for (const [key, value] of Object.entries({
    fbp: metadata.fbp, fbc: metadata.fbc, client_ip_address: metadata.client_ip, client_user_agent: metadata.user_agent
  })) {
    if (value) user[key] = value;
  }
  const purchase = eventName === 'Purchase';
  const event = {
    event_name: eventName,
    event_id: metadata.event_id,
    event_time: eventTime,
    event_source_url: SITE + (purchase ? offer.orderPath : offer.cartPath),
    action_source: 'website',
    user_data: user,
    custom_data: { value: offer.amount / 100, currency: 'EUR', content_name: offer.content_name }
  };

  const results = await Promise.all(suffixes.map(async (suffix, index) => {
    const checkpoint = `s7g_capi_${index + 1}`;
    if (completed[checkpoint] === '1') return [checkpoint, true];
    const pixelId = process.env[`META_PIXEL_ID${suffix}`];
    const token = process.env[`META_ACCESS_TOKEN${suffix}`];
    if (!pixelId || !token) {
      console.error(`[s7g] CAPI ${eventName}: configurazione pixel ${index + 1} mancante`);
      return [checkpoint, false];
    }
    try {
      const response = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: [event] }),
        signal: AbortSignal.timeout(5000)
      });
      const result = response.ok ? await response.json() : null;
      if (result?.events_received > 0) return [checkpoint, true];
      console.error(`[s7g] CAPI ${eventName}: pixel ${index + 1}, HTTP ${response.status}`);
    } catch {
      console.error(`[s7g] CAPI ${eventName}: pixel ${index + 1} non raggiungibile`);
    }
    return [checkpoint, false];
  }));
  return Object.fromEntries(results);
}

function offerFromIntent(intent) {
  if (intent?.currency !== CURRENCY) return undefined;
  return Object.values(OFFERS).find(offer =>
    intent.metadata?.product === offer.product && intent.amount === offer.amount
  );
}

module.exports = {
  OFFERS, CURRENCY, INTENT_RE, EVENT_RE, ATTR_KEYS,
  stripeClient, clip, contactFrom, upsert, addTags, addPaymentNote, sendCapi, offerFromIntent,
  userHashes, buyerFrom
};
