'use strict';

const { isIP } = require('node:net');
const { OFFERS, CURRENCY, EVENT_RE, ATTR_KEYS, stripeClient, clip, contactFrom, upsert, addTags, sendCapi } = require('./_lib/s7g');

function sameOrigin(req) {
  const { origin, host, 'sec-fetch-site': site } = req.headers;
  if (site && !['same-origin', 'none'].includes(site)) return false;
  if (!origin) return true;
  const protocol = req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http');
  return origin === `${protocol}://${host}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method' });
  }
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    return res.status(415).json({ error: 'format' });
  }
  if (!sameOrigin(req)) return res.status(403).json({ error: 'origin' });
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 16000) {
    return res.status(400).json({ error: 'request' });
  }
  const { offer: offerKey = 'standard' } = body;
  if (offerKey !== 'standard' && offerKey !== 'bf') return res.status(400).json({ error: 'request' });
  const offer = OFFERS[offerKey];
  if (offer.endsAt !== undefined && Date.now() >= offer.endsAt) {
    return res.status(410).json({ error: 'expired' });
  }

  // Senza il webhook dedicato il pagamento passerebbe senza consegna (tag GHL, CAPI): meglio non incassare.
  if (!(process.env.STRIPE_WEBHOOK_SECRET_S7G || '').trim()) {
    console.error('[s7g-checkout] STRIPE_WEBHOOK_SECRET_S7G non configurato: carrello chiuso');
    return res.status(503).json({ error: 'unavailable' });
  }
  if (typeof body.event_id !== 'string' || !EVENT_RE.test(body.event_id)) {
    return res.status(400).json({ error: 'request' });
  }
  const { contact, fields } = contactFrom(body);
  if (Object.keys(fields).length) return res.status(400).json({ error: 'validation', fields });

  const attribution = {};
  for (const key of ATTR_KEYS) {
    const value = clip(body[key]);
    if (value) attribution[key] = value;
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const metadata = {
    product: offer.product,
    event_id: body.event_id,
    fbp: clip(body.fbp, 300),
    fbc: clip(body.fbc, 300),
    client_ip: isIP(ip) ? ip : '',
    user_agent: clip(req.headers['user-agent'])
  };
  for (const key of Object.keys(attribution)) {
    if (key.startsWith('utm_')) metadata[key] = attribution[key];
  }

  try {
    const stripe = stripeClient();
    let contactId;
    try {
      contactId = await upsert(contact, attribution);
      await addTags(contactId, offer.cartTags);
    } catch (error) {
      console.error('[s7g-checkout] GHL non completato:', error.name);
    }

    // Il contatto GHL può essere assente durante il primo tentativo e disponibile
    // al retry. Lo agganciamo a parte per tenere stabile la richiesta idempotente.
    const keyPrefix = offerKey === 'bf' ? 's7g-checkout-bf' : 's7g-checkout';
    const intent = await stripe.paymentIntents.create({
      amount: offer.amount,
      currency: CURRENCY,
      automatic_payment_methods: { enabled: true },
      receipt_email: contact.email,
      metadata
    }, { idempotencyKey: `${keyPrefix}-${body.event_id}` });

    if (contactId) {
      try {
        await stripe.paymentIntents.update(intent.id, { metadata: { ghl_contact_id: clip(contactId) } });
      } catch (error) {
        console.error('[s7g-checkout] Riferimento GHL non salvato:', error.type || error.name);
      }
    }
    await sendCapi('InitiateCheckout', { ...contact, externalId: contactId }, metadata, intent.created, offer);
    return res.status(200).json({ client_secret: intent.client_secret });
  } catch (error) {
    console.error('[s7g-checkout] Stripe:', error.type || error.name);
    return res.status(503).json({ error: 'unavailable' });
  }
};
