const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Catalogo OTO lato server: l'importo NON arriva mai dal client (anti-tampering).
// Il client passa solo la chiave `product`; default = sfida-7-giorni (retro-compat OTO maggio).
const OTO_PRODUCTS = {
  'sfida-7-giorni': 2700, // €27.00
  'mappa-lipedema': 700, // €7.00
};

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { customerEmail, customerName, product } = req.body || {};
    const productKey = OTO_PRODUCTS[product] ? product : 'sfida-7-giorni';
    const amount = OTO_PRODUCTS[productKey];

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      receipt_email: customerEmail || undefined,
      metadata: {
        product: productKey,
        customer_name: customerName || '',
        customer_email: customerEmail || '',
      },
    });

    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

    if (!publishableKey) {
      console.error('STRIPE_PUBLISHABLE_KEY is not set');
      return res.status(500).json({ error: 'Configurazione pagamento incompleta.' });
    }

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      publishableKey: publishableKey,
    });
  } catch (err) {
    console.error('Stripe OTO error:', err.message);
    res.status(500).json({ error: 'Errore nella creazione del pagamento.' });
  }
};
