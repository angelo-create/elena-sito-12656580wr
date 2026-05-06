// /api/club-payment-intent — crea uno Stripe PaymentIntent per Stripe Elements (full custom checkout).
//
// Body atteso:
//   firstName, lastName, email, phone (obbligatori)
//   plan: 'partecipanti-club' | 'partecipanti-evento' | 'partecipanti-bundle'
//       | 'pubblico' | 'evento-pubblico' | 'pubblico-bundle'
//   utm_*, fbclid, gclid, msclkid, referrer, landing_url (opzionali)
//
// Ritorna: { clientSecret, paymentIntentId, plan }
//   -> il client chiama stripe.confirmCardPayment(clientSecret, { payment_method: { card: cardElement, ... } })
//
// Env richieste:
//   STRIPE_SECRET_KEY  (sk_live_... oppure sk_test_...)
//
// I prezzi sono inline (PLAN_PRICES). Backend = source of truth, no manomissione client.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PLAN_PRICES = {
  'partecipanti-club':    { amount: 14700, name: 'Club delle Inarrestabili (partecipante)' },
  'partecipanti-evento':  { amount: 12700, name: 'Nel Corpo Che Vuoi Live (partecipante)' },
  'partecipanti-bundle':  { amount: 24700, name: 'Club + Evento (bundle partecipante)' },
  'pubblico':             { amount: 16700, name: 'Club delle Inarrestabili' },
  'evento-pubblico':      { amount: 15700, name: 'Nel Corpo Che Vuoi Live' },
  'pubblico-bundle':      { amount: 29400, name: 'Club + Evento (bundle)' }
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe non configurato' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }
    if (!body) return res.status(400).json({ error: 'Body invalido' });

    const firstName = body.firstName ? String(body.firstName).trim().slice(0, 80) : '';
    const lastName  = body.lastName  ? String(body.lastName).trim().slice(0, 80)  : '';
    const email     = body.email     ? String(body.email).trim().toLowerCase()    : '';
    const phoneRaw  = body.phone     ? String(body.phone).trim()                  : '';
    const phoneDigits = phoneRaw.replace(/[^\d+]/g, '');

    if (!firstName) return res.status(400).json({ error: 'Nome obbligatorio' });
    if (!lastName)  return res.status(400).json({ error: 'Cognome obbligatorio' });
    if (!email)     return res.status(400).json({ error: 'Email obbligatoria' });
    if (!phoneRaw)  return res.status(400).json({ error: 'Telefono obbligatorio' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email non valida' });
    }
    if (phoneDigits.replace(/^\+/, '').length < 8) {
      return res.status(400).json({ error: 'Telefono non valido' });
    }

    const planRaw = String(body.plan || '').toLowerCase();
    let planKey;
    if (PLAN_PRICES[planRaw]) {
      planKey = planRaw;
    } else if (planRaw === 'partecipanti') {
      const bumpOn = body.bump === 1 || body.bump === '1' || body.bump === true || body.bump === 'true';
      planKey = bumpOn ? 'partecipanti-bundle' : 'partecipanti-club';
    } else {
      planKey = 'pubblico-bundle';
    }

    const product = PLAN_PRICES[planKey];
    if (!product) {
      return res.status(400).json({ error: 'Plan non valido' });
    }

    // Metadata propagate al webhook tramite paymentIntent.metadata
    const metadata = {
      plan: planKey,
      product_name: product.name,
      firstName,
      lastName,
      phone: phoneDigits
    };
    const attrFields = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid','msclkid','referrer','landing_url'];
    attrFields.forEach(k => {
      if (body[k]) metadata[k] = String(body[k]).slice(0, 500);
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: product.amount,
      currency: 'eur',
      receipt_email: email,
      description: product.name,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata
    });

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: product.amount,
      plan: planKey
    });
  } catch (err) {
    console.error('[club-payment-intent] Error:', err.message);
    return res.status(500).json({ error: 'Errore creazione pagamento', message: err.message });
  }
};
