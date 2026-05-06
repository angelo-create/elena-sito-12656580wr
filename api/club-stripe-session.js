// /api/club-stripe-session — crea una Stripe Checkout Session per i carrelli.
//
// Body atteso:
//   firstName, lastName, email, phone (obbligatori)
//   plan: 'partecipanti-club' | 'partecipanti-evento' | 'partecipanti-bundle'
//       | 'pubblico' | 'evento-pubblico' | 'pubblico-bundle'
//   utm_*, fbclid, gclid, msclkid, referrer, landing_url (opzionali)
//
// Ritorna: { url } -> il client fa window.location = url
//
// Env richieste:
//   STRIPE_SECRET_KEY
//   SITE_URL (default: https://go.elenagiordani.com)
//
// I prezzi sono inline via price_data (no Stripe Prices da creare): cambiare
// PLAN_PRICES qui per modificare gli importi. Il backend e' source of truth.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Prezzi in centesimi EUR. Backend = source of truth (no manomissione lato client).
const PLAN_PRICES = {
  'partecipanti-club':    { amount: 14700, name: 'Club delle Inarrestabili (partecipante)' },
  'partecipanti-evento':  { amount: 12700, name: 'Nel Corpo Che Vuoi Live (partecipante)' },
  'partecipanti-bundle':  { amount: 24700, name: 'Club + Evento (bundle partecipante)' },
  'pubblico':             { amount: 16700, name: 'Club delle Inarrestabili' },
  'evento-pubblico':      { amount: 15700, name: 'Nel Corpo Che Vuoi Live' },
  'pubblico-bundle':      { amount: 29400, name: 'Club + Evento (bundle)' }
};

function buildLineItems(planKey) {
  const p = PLAN_PRICES[planKey];
  if (!p) return null;
  return [{
    price_data: {
      currency: 'eur',
      product_data: { name: p.name },
      unit_amount: p.amount
    },
    quantity: 1
  }];
}

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
    if (!body) return res.status(400).json({ error: 'invalid body' });

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

    const lineItems = buildLineItems(planKey);
    if (!lineItems) {
      console.error('[club-stripe-session] Plan non valido', planKey);
      return res.status(500).json({ error: 'Plan non valido.' });
    }

    const SITE_URL = process.env.SITE_URL || 'https://go.elenagiordani.com';

    // Metadata: vengono propagati al webhook tramite session.metadata
    const metadata = {
      plan: planKey,
      firstName,
      lastName,
      phone: phoneDigits
    };
    const attrFields = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid','msclkid','referrer','landing_url'];
    attrFields.forEach(k => {
      if (body[k]) metadata[k] = String(body[k]).slice(0, 500);
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      customer_email: email,
      allow_promotion_codes: true,
      success_url: `${SITE_URL}/club-grazie?plan=${encodeURIComponent(planKey)}&order={CHECKOUT_SESSION_ID}&nome=${encodeURIComponent(firstName)}&email=${encodeURIComponent(email)}`,
      cancel_url: `${SITE_URL}/club-pagamento?plan=${encodeURIComponent(planKey)}&cancelled=1`,
      metadata
    });

    return res.status(200).json({ url: session.url, sessionId: session.id, plan: planKey });
  } catch (err) {
    console.error('[club-stripe-session] Error:', err.message);
    return res.status(500).json({ error: 'Errore nella creazione del pagamento.', message: err.message });
  }
};
