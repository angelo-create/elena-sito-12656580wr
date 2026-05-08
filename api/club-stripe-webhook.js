// /api/club-stripe-webhook — riceve eventi Stripe (checkout.session.completed)
// e crea/aggiorna il contatto in GHL con i tag corretti + custom field di
// tracciamento pagamento (stripe_session_id, stripe_customer_id, importo).
//
// Pattern GHL: vedere athens/api/README.md (no `tags` in upsert, sempre
// POST /contacts/{id}/tags additivo).
//
// Env richieste:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET
//   GHL_API_KEY (o GHL_PIT_TOKEN)
//   GHL_LOCATION_ID
//
// Setup Vercel:
//   - Stripe Dashboard -> Webhooks -> aggiungere endpoint
//     https://go.elenagiordani.com/api/club-stripe-webhook
//   - Eventi: checkout.session.completed
//   - Copiare il signing secret in STRIPE_WEBHOOK_SECRET (env Vercel)

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { buffer } = require('micro');
const { buildUtmPayload } = require('./_lib/build-utm-payload');

// Decodifica il client_reference_id costruito da club-checkout.html (formato
// 'u_<base64url(JSON con chiavi corte s/m/c/n/t)>'). Rimappa alle chiavi
// utm_*. Ritorna {} se mancante/invalido. Vedi encodeUtmRef() in
// club-checkout.html.
function decodeUtmRef(ref) {
  if (!ref || typeof ref !== 'string' || !ref.startsWith('u_')) return {};
  try {
    const url = ref.slice(2);
    const std = url.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - url.length % 4) % 4);
    const json = Buffer.from(std, 'base64').toString('utf-8');
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return {};
    const keyMap = { s: 'utm_source', m: 'utm_medium', c: 'utm_campaign', n: 'utm_content', t: 'utm_term' };
    const out = {};
    Object.keys(keyMap).forEach(function(k) {
      if (parsed[k]) out[keyMap[k]] = parsed[k];
    });
    return out;
  } catch {
    return {};
  }
}

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

const PLAN_TAGS = {
  'partecipanti-club':    ['club-membro-attivo', 'acquisto-partecipante'],
  'partecipanti-evento':  ['evento-ncv-2026', 'acquisto-partecipante'],
  'partecipanti-bundle':  ['club-membro-attivo', 'evento-ncv-2026', 'acquisto-partecipante', 'acquisto-bundle'],
  'pubblico':             ['club-membro-attivo', 'acquisto-pubblico'],
  'evento-pubblico':      ['evento-ncv-2026', 'acquisto-pubblico'],
  'pubblico-bundle':      ['club-membro-attivo', 'evento-ncv-2026', 'acquisto-pubblico', 'acquisto-bundle']
};

const PLAN_SOURCES = {
  'partecipanti-club':    'stripe-club-partecipanti-club',
  'partecipanti-evento':  'stripe-club-partecipanti-evento',
  'partecipanti-bundle':  'stripe-club-partecipanti-bundle',
  'pubblico':             'stripe-club-pubblico',
  'evento-pubblico':      'stripe-evento-pubblico',
  'pubblico-bundle':      'stripe-club-pubblico-bundle'
};

// Fallback 1: mappa prezzi unici -> plan key. Si rompe solo se metti coupon
// Stripe sul Payment Link o cambi prezzo. In quel caso la cascata continua.
const AMOUNT_TO_PLAN = {
  14700: 'partecipanti-club',
  12700: 'partecipanti-evento',
  24700: 'partecipanti-bundle',
  16700: 'pubblico',
  15700: 'evento-pubblico',
  29400: 'pubblico-bundle'
};

// Fallback 2: fuzzy match sul product name (description di line_items).
// Riconosce parole chiave: bundle/club+evento, club, evento, partecipante.
function inferFromProductName(name) {
  if (!name) return null;
  const n = String(name).toLowerCase();
  const isPart   = n.includes('partecipant');
  const isBundle = n.includes('bundle') || (n.includes('club') && n.includes('evento'));
  const isClub   = n.includes('club') || n.includes('inarrestabili');
  const isEvento = n.includes('evento') || n.includes('corpo che vuoi') || n.includes('ncv');

  if (isBundle && isPart) return 'partecipanti-bundle';
  if (isBundle)           return 'pubblico-bundle';
  if (isEvento && !isClub && isPart) return 'partecipanti-evento';
  if (isEvento && !isClub)           return 'evento-pubblico';
  if (isClub && isPart) return 'partecipanti-club';
  if (isClub)           return 'pubblico';
  return null;
}

// Cascata di rilevamento planKey. Ritorna { plan, source } dove `source`
// indica con quale strategia il plan e' stato dedotto (utile per debug log).
async function detectPlanKey(obj) {
  const md = obj.metadata || {};

  // 1. metadata.plan -> piu' affidabile
  if (md.plan && PLAN_TAGS[md.plan]) {
    return { plan: md.plan, via: 'metadata' };
  }

  // 2. amount_total exact match
  const amount = obj.amount_total || obj.amount_received || obj.amount || 0;
  if (AMOUNT_TO_PLAN[amount]) {
    return { plan: AMOUNT_TO_PLAN[amount], via: 'amount' };
  }

  // 3. product name dal line_items (Sessions) o description (PI)
  try {
    let productName = obj.description || '';
    if (!productName && obj.id && String(obj.id).startsWith('cs_')) {
      const session = await stripe.checkout.sessions.retrieve(obj.id, { expand: ['line_items'] });
      productName = (session.line_items && session.line_items.data && session.line_items.data[0] && session.line_items.data[0].description) || '';
    }
    const inferred = inferFromProductName(productName);
    if (inferred) {
      return { plan: inferred, via: 'product_name', name: productName };
    }
  } catch (e) {
    console.warn('[stripe-webhook] line_items lookup failed:', e.message);
  }

  // 4. fallback: nessuna mappatura. Verra' applicato tag di investigazione.
  return { plan: null, via: 'fallback' };
}

async function ghlUpsertContact({ apiKey, locationId, email, firstName, lastName, phone, source, customFields, attributionSource }) {
  const payload = {
    locationId,
    email,
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim(),
    phone,
    source,
    customFields
  };
  if (attributionSource) payload.attributionSource = attributionSource;

  const res = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Version': GHL_API_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GHL upsert failed: ${res.status} ${text.slice(0, 300)}`);
  }
  try {
    const data = JSON.parse(text);
    return data.contact ? data.contact.id : (data.id || null);
  } catch {
    return null;
  }
}

async function ghlAddTags({ apiKey, contactId, tags }) {
  if (!contactId || !Array.isArray(tags) || tags.length === 0) return;
  const res = await fetch(`${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}/tags`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Version': GHL_API_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tags })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL add tags failed: ${res.status} ${text.slice(0, 300)}`);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET non configurato');
    return res.status(500).end('Webhook secret missing');
  }

  let event;
  try {
    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'];
    // .trim() difensivo: paste del secret dalla Stripe Dashboard si porta dietro \n
    // o spazi finali, e Stripe rifiuta la firma con "signing secret contains whitespace".
    const secret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
    event = stripe.webhooks.constructEvent(buf, sig, secret);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Stripe Elements -> ascoltiamo payment_intent.succeeded.
  // Lasciamo anche checkout.session.completed per retro-compat con vecchio flow.
  if (event.type !== 'payment_intent.succeeded' && event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, ignored: event.type });
  }

  const obj = event.data.object;
  const isPaymentIntent = event.type === 'payment_intent.succeeded';
  const md = obj.metadata || {};

  // Cascata: metadata -> amount -> product name -> investiga
  const detected = await detectPlanKey(obj);
  const planKey = detected.plan;
  const tags = planKey ? PLAN_TAGS[planKey] : ['acquisto-da-investigare'];
  const source = planKey ? (PLAN_SOURCES[planKey] || 'stripe-checkout') : 'stripe-unknown';
  console.log('[stripe-webhook] planKey detected via', detected.via, '->', planKey || 'unknown', detected.name ? `(name: ${detected.name})` : '');

  const apiKey = process.env.GHL_API_KEY || process.env.GHL_PIT_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) {
    console.error('[stripe-webhook] GHL credentials missing — payment OK ma contatto non sincronizzato', obj.id);
    return res.status(500).json({ error: 'GHL not configured' });
  }

  // Estrae info contatto:
  //  - PaymentIntent: receipt_email + metadata + charges[0].billing_details
  //  - Session:       customer_details + customer_email
  let email, firstName, lastName, phone, customerId, paymentIntentId, amountCents, currency;
  if (isPaymentIntent) {
    const charge = (obj.charges && obj.charges.data && obj.charges.data[0]) || null;
    const bd = (charge && charge.billing_details) || {};
    email = obj.receipt_email || bd.email || '';
    const fullName = bd.name || '';
    firstName = md.firstName || (fullName ? fullName.split(' ')[0] : '');
    lastName  = md.lastName  || (fullName ? fullName.split(' ').slice(1).join(' ') : '');
    phone = md.phone || bd.phone || '';
    customerId = obj.customer || '';
    paymentIntentId = obj.id || '';
    amountCents = obj.amount_received || obj.amount || 0;
    currency = obj.currency || 'eur';
  } else {
    const cd = obj.customer_details || {};
    email = cd.email || obj.customer_email || '';
    firstName = md.firstName || (cd.name ? cd.name.split(' ')[0] : '');
    lastName  = md.lastName  || (cd.name ? cd.name.split(' ').slice(1).join(' ') : '');
    phone = md.phone || cd.phone || '';
    customerId = obj.customer || '';
    paymentIntentId = obj.payment_intent || '';
    amountCents = obj.amount_total || 0;
    currency = obj.currency || 'eur';
  }

  if (!email) {
    console.error('[stripe-webhook] Missing email in event', obj.id);
    return res.status(400).json({ error: 'Missing email' });
  }

  const amountTotal = amountCents / 100;
  const paidAt = new Date((event.created || 0) * 1000).toISOString();
  const customFields = [
    { key: 'stripe_session_id',     field_value: isPaymentIntent ? '' : (obj.id || '') },
    { key: 'stripe_customer_id',    field_value: customerId },
    { key: 'stripe_payment_intent', field_value: paymentIntentId },
    { key: 'stripe_amount_eur',     field_value: amountTotal.toFixed(2) },
    { key: 'stripe_currency',       field_value: currency.toUpperCase() },
    { key: 'stripe_paid_at',        field_value: paidAt },
    { key: 'stripe_plan_key',       field_value: planKey || 'unknown' },
    { key: 'stripe_plan_via',       field_value: detected.via }
  ];

  // Attribution: Payment Links statici non accettano metadata custom via URL,
  // quindi club-checkout.html passa UTM via `client_reference_id` con encoding
  // base64url. Stripe Checkout Session API (futuro) puo' invece passarli direttamente
  // in `metadata`. Mergio entrambe le fonti con priorita' ai metadata.
  const refUtm = isPaymentIntent ? {} : decodeUtmRef(obj.client_reference_id || '');
  const attrInput = {
    utm_source:   md.utm_source   || refUtm.utm_source,
    utm_medium:   md.utm_medium   || refUtm.utm_medium,
    utm_campaign: md.utm_campaign || refUtm.utm_campaign,
    utm_content:  md.utm_content  || refUtm.utm_content,
    utm_term:     md.utm_term     || refUtm.utm_term,
    referrer:     md.referrer,
    landing_url:  md.landing_url,
    fbclid:       md.fbclid,
    gclid:        md.gclid,
    msclkid:      md.msclkid
  };
  const utmPayload = buildUtmPayload(attrInput);
  const attributionSource = utmPayload.attributionSource || undefined;
  // Append UTM custom fields (formato API: { id, value }) all'array esistente.
  // I campi stripe_* usano formato { key, field_value } legacy: non li tocco.
  utmPayload.customFields.forEach(function(f) { customFields.push(f); });

  try {
    const contactId = await ghlUpsertContact({
      apiKey, locationId, email, firstName, lastName, phone,
      source, customFields, attributionSource
    });
    console.log('[stripe-webhook] Contact upserted:', email, '| plan:', planKey, '| contactId:', contactId, '| amount:', amountTotal);

    if (contactId) {
      await ghlAddTags({ apiKey, contactId, tags });
      console.log('[stripe-webhook] Tags added (additive):', tags.join(', '), '|', contactId);
    }

    return res.status(200).json({ received: true, contactId, plan: planKey, tags });
  } catch (err) {
    console.error('[stripe-webhook] GHL sync failed:', err.message);
    // 500 -> Stripe ritenta il webhook (fino a 3 giorni). Sicuro per evitare data loss.
    return res.status(500).json({ error: 'GHL sync failed', message: err.message });
  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
