'use strict';

const { INTENT_RE, EVENT_RE, stripeClient, isS7gIntent } = require('./_lib/s7g');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method' });
  }
  const id = req.query?.payment_intent;
  if (typeof id !== 'string' || !INTENT_RE.test(id)) return res.status(400).json({ error: 'request' });

  try {
    const intent = await stripeClient().paymentIntents.retrieve(id);
    if (!isS7gIntent(intent)) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json({
      status: intent.status,
      amount: intent.amount,
      event_id: EVENT_RE.test(intent.metadata.event_id || '') ? intent.metadata.event_id : null
    });
  } catch (error) {
    if (error.code === 'resource_missing') return res.status(404).json({ error: 'not_found' });
    console.error('[s7g-ordine] Stripe:', error.type || error.name);
    return res.status(503).json({ error: 'unavailable' });
  }
};
