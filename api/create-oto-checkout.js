const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { customerEmail, customerName, successParams } = req.body || {};

    const priceId = process.env.STRIPE_PRICE_ID_OTO;

    if (!priceId) {
      return res.status(500).json({ error: 'Configurazione pagamento OTO non disponibile.' });
    }

    // Build success/cancel URLs preserving webinar params
    const params = successParams || {};
    const queryString = Object.keys(params)
      .filter(function(k) { return params[k]; })
      .map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');

    const baseSuccess = process.env.SITE_URL + '/webinar-marzo-grazie';
    const baseCancel = process.env.SITE_URL + '/webinar-marzo-oto';

    const successUrl = baseSuccess + (queryString ? '?' + queryString + '&' : '?') + 'paid=true';
    const cancelUrl = baseCancel + (queryString ? '?' + queryString : '');

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      customer_email: customerEmail || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        product: 'sfida-7-giorni',
        customer_name: customerName || '',
      },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe OTO error:', err.message);
    res.status(500).json({ error: 'Errore nella creazione del pagamento.' });
  }
};
