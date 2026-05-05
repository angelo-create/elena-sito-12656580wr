// /api/club-checkout — riceve i dati del form di pagamento del carrello
// Club / Evento e crea/aggiorna il contatto in GoHighLevel con i tag
// corretti in base al plan acquistato.
//
// IMPORTANTE: rispetta la procedura `athens/api/README.md` — niente
// campo `tags` nel payload upsert (sovrascrive l'array tag esistente).
// I tag vengono aggiunti dopo via POST /contacts/{id}/tags (additivo).
//
// Body atteso:
//   firstName, lastName, email, phone (obbligatori)
//   plan: 'partecipanti' | 'pubblico' | 'evento-pubblico' (default: 'partecipanti')
//   bump: 1|0|'1'|'0'|true|false (rilevante solo per plan=partecipanti)
//   utm_*, fbclid, gclid, msclkid, referrer, landing_url (opzionali, attribution)

const PLAN_TAGS = {
  // Partecipanti senza bump = solo Club al prezzo riservato
  'partecipanti-no-bump': ['club-membro-attivo', 'acquisto-partecipante'],
  // Partecipanti con bump = Club + Evento bundle al prezzo riservato
  'partecipanti-bump':    ['club-membro-attivo', 'evento-ncv-2026', 'acquisto-partecipante', 'acquisto-bundle'],
  // Pubblico Club = solo Club al prezzo aperto
  'pubblico':             ['club-membro-attivo', 'acquisto-pubblico'],
  // Pubblico Evento = solo Evento al prezzo aperto
  'evento-pubblico':      ['evento-ncv-2026', 'acquisto-pubblico']
};

const PLAN_SOURCES = {
  'partecipanti-no-bump': 'club-checkout-partecipanti',
  'partecipanti-bump':    'club-checkout-partecipanti-bundle',
  'pubblico':             'club-checkout-pubblico',
  'evento-pubblico':      'evento-checkout-pubblico'
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const locationId = process.env.GHL_LOCATION_ID || 'whfxv9CQCrjAmBTZJwMw';
  const apiKey = process.env.GHL_API_KEY || process.env.GHL_PIT_TOKEN;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }
    if (!body) return res.status(400).json({ error: 'invalid body' });

    const clip = (v, max = 500) => v ? String(v).slice(0, max) : undefined;
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

    // Plan + bump -> chiave di mapping unica
    const planRaw = String(body.plan || 'partecipanti').toLowerCase();
    const bumpOn  = body.bump === 1 || body.bump === '1' || body.bump === true || body.bump === 'true';

    let planKey;
    if (planRaw === 'pubblico')                planKey = 'pubblico';
    else if (planRaw === 'evento-pubblico')    planKey = 'evento-pubblico';
    else                                        planKey = bumpOn ? 'partecipanti-bump' : 'partecipanti-no-bump';

    const tags = PLAN_TAGS[planKey] || [];
    const source = PLAN_SOURCES[planKey] || 'club-checkout';

    // Step 1: upsert SENZA `tags` (mai sovrascrivere i tag esistenti).
    const payload = {
      email,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      phone: phoneDigits,
      locationId,
      source
    };

    // Attribution
    const attr = {};
    if (body.utm_source)   attr.utmSource   = clip(body.utm_source);
    if (body.utm_medium)   attr.medium      = clip(body.utm_medium);
    if (body.utm_campaign) attr.campaign    = clip(body.utm_campaign);
    if (body.utm_content)  attr.utmContent  = clip(body.utm_content);
    if (body.utm_term)     attr.utmKeyword  = clip(body.utm_term);
    if (body.referrer)     attr.referrer    = clip(body.referrer, 1000);
    if (body.landing_url)  attr.url         = clip(body.landing_url, 1000);
    if (body.fbclid)       attr.fbclid      = clip(body.fbclid);
    if (body.gclid)        attr.gclid       = clip(body.gclid);
    if (body.msclkid)      attr.msclikid    = clip(body.msclkid);
    if (Object.keys(attr).length > 0) payload.attributionSource = attr;

    const upsertRes = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const upsertText = await upsertRes.text();
    if (!upsertRes.ok) {
      console.error('[club-checkout] GHL upsert failed:', upsertRes.status, upsertText);
      return res.status(upsertRes.status).json({ error: 'Invio non riuscito' });
    }
    let contactId = null;
    try {
      const data = JSON.parse(upsertText);
      contactId = data.contact ? data.contact.id : null;
    } catch (e) {}

    console.log('[club-checkout] Contact upserted:', email, '| plan:', planKey, '| contactId:', contactId);

    // Step 2: add tags additivo (POST /contacts/{id}/tags), no-op su tag già presenti.
    if (contactId && tags.length > 0) {
      try {
        const tagsRes = await fetch(`https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}/tags`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Version': '2021-07-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ tags })
        });
        if (!tagsRes.ok) {
          const errText = await tagsRes.text();
          console.error('[club-checkout] Add tags failed:', tagsRes.status, errText.slice(0, 200));
        } else {
          console.log('[club-checkout] Tags added (additive):', tags.join(', '), '|', contactId);
        }
      } catch (tagErr) {
        console.error('[club-checkout] Add tags error (non-blocking):', tagErr.message);
      }
    }

    return res.status(200).json({ success: true, contactId, plan: planKey, tags });
  } catch (err) {
    console.error('[club-checkout] Error:', err.message);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
