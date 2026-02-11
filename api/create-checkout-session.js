const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { earlyBird, customerEmail } = req.body || {};

    const priceId = earlyBird
      ? process.env.STRIPE_PRICE_ID_EARLY
      : process.env.STRIPE_PRICE_ID;

    if (!priceId) {
      return res.status(500).json({ error: 'Configurazione pagamento non disponibile.' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      customer_email: customerEmail || undefined,
      success_url: `${process.env.SITE_URL}/pagamento-successo.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/percorso-coach.html?cancelled=true`,
      metadata: {
        product: 'percorso-coach-1-livello',
        earlyBird: earlyBird ? 'true' : 'false',
      },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: 'Errore nella creazione del pagamento.' });
  }
};
