const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { customerEmail, customerName } = req.body || {};

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 2700, // €27.00
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      receipt_email: customerEmail || undefined,
      metadata: {
        product: 'sfida-7-giorni',
        customer_name: customerName || '',
        customer_email: customerEmail || '',
      },
    });

    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PK || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

    if (!publishableKey) {
      console.error('STRIPE_PUBLISHABLE_KEY env var is missing. Available env keys:', Object.keys(process.env).filter(k => k.includes('STRIPE')).join(', '));
    }

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      publishableKey: publishableKey || null,
    });
  } catch (err) {
    console.error('Stripe OTO error:', err.message);
    res.status(500).json({ error: 'Errore nella creazione del pagamento.' });
  }
};
