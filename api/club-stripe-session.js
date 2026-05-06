// /api/club-stripe-session — crea una Stripe Checkout Session per i 3 carrelli.
//
// Body atteso:
//   firstName, lastName, email, phone (obbligatori)
//   plan: 'partecipanti' | 'pubblico' | 'evento-pubblico'
//   bump: 1|0|true|false (rilevante solo per plan=partecipanti)
//   utm_*, fbclid, gclid, msclkid, referrer, landing_url (opzionali)
//
// Ritorna: { url } -> il client fa window.location = url
//
// Env richieste (5 Prices Stripe):
//   STRIPE_SECRET_KEY
//   STRIPE_PRICE_PARTECIPANTI_CLUB     (Club partecipante a 147€)
//   STRIPE_PRICE_PARTECIPANTI_EVENTO   (Evento partecipante a 127€)
//   STRIPE_PRICE_PARTECIPANTI_BUNDLE   (Bundle Club+Evento a 247€)
//   STRIPE_PRICE_PUBBLICO_CLUB         (Club pubblico a 167€)
//   STRIPE_PRICE_PUBBLICO_EVENTO       (Evento pubblico a 157€)
//   SITE_URL (default: https://go.elenagiordani.com)

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

function buildLineItems(planKey) {
  switch (planKey) {
    case 'partecipanti-bundle':
      return [{ price: process.env.STRIPE_PRICE_PARTECIPANTI_BUNDLE, quantity: 1 }];
    case 'partecipanti-club':
      return [{ price: process.env.STRIPE_PRICE_PARTECIPANTI_CLUB,   quantity: 1 }];
    case 'partecipanti-evento':
      return [{ price: process.env.STRIPE_PRICE_PARTECIPANTI_EVENTO, quantity: 1 }];
    case 'pubblico':
      return [{ price: process.env.STRIPE_PRICE_PUBBLICO_CLUB,       quantity: 1 }];
    case 'evento-pubblico':
      return [{ price: process.env.STRIPE_PRICE_PUBBLICO_EVENTO,     quantity: 1 }];
    default:
      return null;
  }
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
    const VALID_PLANS = ['partecipanti-club', 'partecipanti-evento', 'partecipanti-bundle', 'pubblico', 'evento-pubblico'];
    let planKey;
    if (VALID_PLANS.indexOf(planRaw) !== -1) {
      planKey = planRaw;
    } else if (planRaw === 'partecipanti') {
      const bumpOn = body.bump === 1 || body.bump === '1' || body.bump === true || body.bump === 'true';
      planKey = bumpOn ? 'partecipanti-bundle' : 'partecipanti-club';
    } else {
      planKey = 'partecipanti-bundle';
    }

    const lineItems = buildLineItems(planKey);
    if (!lineItems || lineItems.some(li => !li.price)) {
      console.error('[club-stripe-session] Missing STRIPE_PRICE_* for plan', planKey);
      return res.status(500).json({ error: 'Configurazione prezzi non disponibile.' });
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
