'use strict';

const { timingSafeEqual } = require('node:crypto');
const { INTENT_RE, EVENT_RE, stripeClient, offerFromIntent, userHashes, buyerFrom } = require('./_lib/s7g');

// Il codice segreto del pagamento arriva solo a chi ha pagato (return_url di Stripe).
function sameSecret(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method' });
  }
  const id = req.query?.payment_intent;
  if (typeof id !== 'string' || !INTENT_RE.test(id)) return res.status(400).json({ error: 'request' });

  try {
    const intent = await stripeClient().paymentIntents.retrieve(id, { expand: ['latest_charge', 'payment_method'] });
    const offer = offerFromIntent(intent);
    if (!offer) return res.status(404).json({ error: 'not_found' });
    // Dati cifrati per il pixel del browser (advanced matching), uguali a quelli della CAPI.
    const user = intent.status === 'succeeded' && sameSecret(req.query?.payment_intent_client_secret, intent.client_secret)
      ? userHashes(buyerFrom(intent)) : undefined;
    return res.status(200).json({
      status: intent.status,
      amount: intent.amount,
      value: offer.amount / 100,
      content_name: offer.content_name,
      cart_path: offer.cartPath,
      event_id: EVENT_RE.test(intent.metadata.event_id || '') ? intent.metadata.event_id : null,
      ...(user ? { user } : {})
    });
  } catch (error) {
    if (error.code === 'resource_missing') return res.status(404).json({ error: 'not_found' });
    console.error('[s7g-ordine] Stripe:', error.type || error.name);
    return res.status(503).json({ error: 'unavailable' });
  }
};
