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

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

const PLAN_TAGS = {
  'partecipanti-club':    ['club-membro-attivo', 'acquisto-partecipante'],
  'partecipanti-evento':  ['evento-ncv-2026', 'acquisto-partecipante'],
  'partecipanti-bundle':  ['club-membro-attivo', 'evento-ncv-2026', 'acquisto-partecipante', 'acquisto-bundle'],
  'pubblico':             ['club-membro-attivo', 'acquisto-pubblico'],
  'evento-pubblico':      ['evento-ncv-2026', 'acquisto-pubblico']
};

const PLAN_SOURCES = {
  'partecipanti-club':    'stripe-club-partecipanti-club',
  'partecipanti-evento':  'stripe-club-partecipanti-evento',
  'partecipanti-bundle':  'stripe-club-partecipanti-bundle',
  'pubblico':             'stripe-club-pubblico',
  'evento-pubblico':      'stripe-evento-pubblico'
};

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
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, ignored: event.type });
  }

  const session = event.data.object;
  const md = session.metadata || {};
  const planKey = (md.plan && PLAN_TAGS[md.plan]) ? md.plan : 'partecipanti-bundle';
  const tags = PLAN_TAGS[planKey] || [];
  const source = PLAN_SOURCES[planKey] || 'stripe-checkout';

  const apiKey = process.env.GHL_API_KEY || process.env.GHL_PIT_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) {
    console.error('[stripe-webhook] GHL credentials missing — payment OK ma contatto non sincronizzato', session.id);
    return res.status(500).json({ error: 'GHL not configured' });
  }

  const email = (session.customer_details && session.customer_details.email) || session.customer_email || '';
  const firstName = md.firstName || (session.customer_details && session.customer_details.name && session.customer_details.name.split(' ')[0]) || '';
  const lastName  = md.lastName  || (session.customer_details && session.customer_details.name && session.customer_details.name.split(' ').slice(1).join(' ')) || '';
  const phone = md.phone || (session.customer_details && session.customer_details.phone) || '';

  if (!email) {
    console.error('[stripe-webhook] Missing email in session', session.id);
    return res.status(400).json({ error: 'Missing email' });
  }

  // Custom field GHL: tracciamento pagamento
  const amountTotal = (session.amount_total || 0) / 100;
  const paidAt = new Date((event.created || 0) * 1000).toISOString();
  const customFields = [
    { key: 'stripe_session_id',     field_value: session.id || '' },
    { key: 'stripe_customer_id',    field_value: session.customer || '' },
    { key: 'stripe_payment_intent', field_value: session.payment_intent || '' },
    { key: 'stripe_amount_eur',     field_value: amountTotal.toFixed(2) },
    { key: 'stripe_currency',       field_value: (session.currency || 'eur').toUpperCase() },
    { key: 'stripe_paid_at',        field_value: paidAt },
    { key: 'stripe_plan_key',       field_value: planKey }
  ];

  // Attribution dai metadata
  const attr = {};
  if (md.utm_source)   attr.utmSource   = md.utm_source;
  if (md.utm_medium)   attr.medium      = md.utm_medium;
  if (md.utm_campaign) attr.campaign    = md.utm_campaign;
  if (md.utm_content)  attr.utmContent  = md.utm_content;
  if (md.utm_term)     attr.utmKeyword  = md.utm_term;
  if (md.referrer)     attr.referrer    = md.referrer;
  if (md.landing_url)  attr.url         = md.landing_url;
  if (md.fbclid)       attr.fbclid      = md.fbclid;
  if (md.gclid)        attr.gclid       = md.gclid;
  if (md.msclkid)      attr.msclikid    = md.msclkid;
  const attributionSource = Object.keys(attr).length > 0 ? attr : undefined;

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
