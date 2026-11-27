'use strict';

const { randomUUID } = require('node:crypto');
const { buffer } = require('micro');
const { normalizePhone } = require('./_lib/normalize-phone');
const { AMOUNT, EVENT_RE, stripeClient, isS7gIntent, upsert, addTags, addPaymentNote, sendCapi } = require('./_lib/s7g');

const PURCHASE_TAGS = ['il_primo_passo', 'sfida-purchased-day0', 's7g-go-acquisto'];
const LEASE_MS = 120000;

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
    phone: phone || undefined
  };
}

async function fulfill(stripe, id, eventTime) {
  const intent = await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge', 'payment_method'] });
  const md = intent.metadata;
  if (!isS7gIntent(intent) || intent.status !== 'succeeded' || intent.amount_received !== AMOUNT) return;
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
      const idContatto = await upsert(buyer, md.ghl_contact_id ? {} : md);
      await addTags(idContatto, PURCHASE_TAGS);
      await addPaymentNote(idContatto, intent);
      await stripe.paymentIntents.update(id, { metadata: { s7g_crm: '1', ghl_contact_id: idContatto } });
      crmOk = true;
    } catch (error) {
      console.error('[s7g-webhook] GHL non completato:', error.type || error.name);
    }
  }

  const results = await sendCapi('Purchase', buyer, md, eventTime, md);
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
  if (!isS7gIntent(intent)) return res.status(200).json({ received: true });
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
