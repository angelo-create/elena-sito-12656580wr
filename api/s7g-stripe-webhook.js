'use strict';

const { randomUUID } = require('node:crypto');
const { buffer } = require('micro');
const { EVENT_RE, stripeClient, offerFromIntent, upsert, addTags, addPaymentNote, sendCapi, buyerFrom } = require('./_lib/s7g');

const LEASE_MS = 120000;

async function fulfill(stripe, id, eventTime) {
  const intent = await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge', 'payment_method'] });
  const offer = offerFromIntent(intent);
  if (!offer || intent.status !== 'succeeded' || intent.amount_received !== offer.amount) return;
  const md = intent.metadata;
  if (md.s7g_fulfilled === '1') return;

  // Stripe serializza la prima scrittura con questa chiave. Consegne concorrenti
  // della stessa generazione inviano un valore diverso e ricevono un conflitto.
  // La scadenza consente il recupero se un'istanza si interrompe prima del rilascio.
  const previous = md.s7g_lease || '0:initial';
  if (Number(previous.split(':')[0]) > Date.now()) throw new Error('Pagamento già in lavorazione');
  const owner = randomUUID();
  await stripe.paymentIntents.update(id, {
    metadata: { s7g_lease: `${Date.now() + LEASE_MS}:${owner}` }
  }, { idempotencyKey: `s7g-lease-${id}-${previous}` });

  const buyer = buyerFrom(intent);
  if (!buyer.email || !EVENT_RE.test(md.event_id || '')) throw new Error('Dati acquisto incompleti');

  let crmOk = md.s7g_crm === '1';
  if (!crmOk) {
    try {
      // A GHL solo i campi di sempre: paese e codice Meta servono solo alla CAPI.
      const { email, firstName, lastName, phone } = buyer;
      const idContatto = await upsert({ email, firstName, lastName, phone }, md.ghl_contact_id ? {} : md);
      await addTags(idContatto, offer.purchaseTags);
      await addPaymentNote(idContatto, intent, offer);
      await stripe.paymentIntents.update(id, { metadata: { s7g_crm: '1', ghl_contact_id: idContatto } });
      buyer.externalId = idContatto;
      crmOk = true;
    } catch (error) {
      console.error('[s7g-webhook] GHL non completato:', error.type || error.name);
    }
  }

  // external_id: id GHL del checkout o quello appena restituito dall'upsert.
  const results = await sendCapi('Purchase', buyer, md, eventTime, offer, md);
  const checkpoints = Object.fromEntries(Object.entries(results).filter(([, ok]) => ok).map(([key]) => [key, '1']));
  const completed = crmOk && Object.values(results).every(Boolean);
  await stripe.paymentIntents.update(id, {
    metadata: { ...checkpoints, s7g_lease: `0:${owner}`, ...(completed ? { s7g_fulfilled: '1' } : {}) }
  });
  if (!completed) throw new Error('Consegna acquisto incompleta');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const secret = (process.env.STRIPE_WEBHOOK_SECRET_S7G || '').trim().replace(/\\n$/, '');
  if (!secret) {
    console.error('[s7g-webhook] STRIPE_WEBHOOK_SECRET_S7G non configurato');
    return res.status(500).end();
  }

  let stripe;
  try {
    stripe = stripeClient();
  } catch {
    console.error('[s7g-webhook] Stripe non configurato');
    return res.status(500).end();
  }

  let event;
  try {
    const raw = await buffer(req, { limit: '1mb' });
    event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], secret);
  } catch {
    console.error('[s7g-webhook] Firma Stripe non valida');
    return res.status(400).end();
  }

  const intent = event.data.object;
  if (!offerFromIntent(intent)) return res.status(200).json({ received: true });
  if (event.type === 'payment_intent.payment_failed') {
    console.info('[s7g-webhook] Pagamento fallito:', String(intent.id).slice(-6));
  } else if (event.type === 'payment_intent.succeeded') {
    try {
      await fulfill(stripe, intent.id, event.created);
    } catch (error) {
      console.error('[s7g-webhook] Elaborazione da riprovare:', error.type || error.name);
      return res.status(500).end();
    }
  }
  return res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };
