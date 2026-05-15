const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { buffer } = require('micro');
const crypto = require('crypto');

// Disable Vercel's automatic body parsing — Stripe needs raw body for signature verification
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function hash(value) {
  return crypto.createHash('sha256').update(String(value).toLowerCase().trim()).digest('hex');
}

// Applica il tag `oto-sfida-7-giorni` al contatto in GHL tramite API diretta.
// Pattern in 2 step (vedi api/README.md REGOLA #1): upsert senza `tags`, poi
// POST /contacts/{id}/tags additivo. NON sovrascrive i tag preesistenti.
// Il tag funziona da "evento centrale" per workflow GHL con trigger
// Contact Tag → Added → oto-sfida-7-giorni.
async function tagOtoBuyerInGHL({ email, firstName, lastName }) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey || !email) {
    console.log('[oto-tag] skip: GHL_API_KEY o email mancante');
    return null;
  }
  const locationId = 'whfxv9CQCrjAmBTZJwMw';
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json'
  };
  try {
    const upsertBody = { email, locationId };
    if (firstName) upsertBody.firstName = firstName;
    if (lastName) upsertBody.lastName = lastName;
    const upsertRes = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'POST', headers, body: JSON.stringify(upsertBody)
    });
    const upsertJson = await upsertRes.json();
    if (!upsertRes.ok) {
      console.error('[oto-tag] upsert failed:', upsertRes.status, JSON.stringify(upsertJson).slice(0, 300));
      return null;
    }
    const contactId = upsertJson?.contact?.id;
    if (!contactId) {
      console.error('[oto-tag] no contactId in upsert response');
      return null;
    }
    const tagRes = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/tags`, {
      method: 'POST', headers, body: JSON.stringify({ tags: ['oto-sfida-7-giorni'] })
    });
    if (!tagRes.ok) {
      const errText = await tagRes.text();
      console.error('[oto-tag] add-tag failed:', tagRes.status, errText.slice(0, 300));
      return contactId;
    }
    console.log('[oto-tag] Tag applied: oto-sfida-7-giorni |', email, '|', contactId);
    return contactId;
  } catch (err) {
    console.error('[oto-tag] error:', err.message);
    return null;
  }
}

// Forward purchase data to GHL via Inbound Webhook (workflow trigger)
async function notifyGHL(data) {
  const ghlWebhookUrl = process.env.GHL_WEBHOOK_URL;
  if (!ghlWebhookUrl) {
    console.log('GHL_WEBHOOK_URL not set, skipping GHL notification');
    return;
  }
  try {
    const resp = await fetch(ghlWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    console.log('GHL webhook response:', resp.status);
  } catch (err) {
    console.error('GHL webhook error:', err.message);
  }
}

// Server-side Purchase event to Meta CAPI — same event_id as the client-side pixel
// (we use the Stripe payment_intent.id, which the client also reads from the
// return_url query string). Meta deduplicates by event_id so this is safe.
async function notifyMetaCAPIPixel1({ eventId, email, firstName, lastName, value, currency, sourceUrl }) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!pixelId || !accessToken) {
    console.log('META_PIXEL_ID/META_ACCESS_TOKEN not set, skipping CAPI pixel 1');
    return;
  }

  const userData = {};
  if (email)     userData.em = [hash(email)];
  if (firstName) userData.fn = [hash(firstName)];
  if (lastName)  userData.ln = [hash(lastName)];

  const payload = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: sourceUrl || 'https://go.elenagiordani.com/webinar-maggio-grazie.html?paid=true',
      action_source: 'website',
      user_data: userData,
      custom_data: {
        content_name: 'Sfida 7 Giorni',
        value: value,
        currency: currency,
      },
    }],
  };

  try {
    const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await resp.json();
    console.log('Meta CAPI Purchase pixel 1:', eventId, JSON.stringify(result));
  } catch (err) {
    console.error('Meta CAPI pixel 1 error:', err.message);
  }
}

// Pixel 2 isolato: solo Purchase OTO €27 con EMQ enrichment (external_id GHL + country).
// Vedi plan: signal stacking per nuovo BM, abbassa CPL ottimizzando con bottom-funnel signal.
async function notifyMetaCAPIPixel2({ eventId, email, firstName, lastName, value, currency, sourceUrl, contactId }) {
  const pixelId = process.env.META_PIXEL_ID_2;
  const accessToken = process.env.META_ACCESS_TOKEN_2;
  if (!pixelId || !accessToken || !eventId) return;

  const userData = {};
  if (email)     userData.em = [hash(email)];
  if (firstName) userData.fn = [hash(firstName)];
  if (lastName)  userData.ln = [hash(lastName)];
  userData.country = [hash('it')];
  if (contactId) userData.external_id = [hash(contactId)];

  const payload = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: sourceUrl || 'https://www.elenagiordani.com/webinar-maggio-grazie.html?paid=true',
      action_source: 'website',
      user_data: userData,
      custom_data: {
        content_name: 'Sfida 7 Giorni',
        value: value,
        currency: currency,
      },
    }],
  };

  try {
    const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await resp.json();
    console.log('Meta CAPI Purchase pixel 2:', eventId, JSON.stringify(result));
  } catch (err) {
    console.error('Meta CAPI pixel 2 error:', err.message);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await buffer(req);
    // Sanitize difensivo: strip `\n` letterale (gotcha printf+vercel env pull) + trim.
    // Vedi docs/feedback memory `feedback_vercel_env_secret_trailing_newline`.
    const rawSecret = process.env.STRIPE_WEBHOOK_SECRET_OTO || process.env.STRIPE_WEBHOOK_SECRET || '';
    const secret = rawSecret.replace(/\\n$/g, '').trim();
    if (!secret.startsWith('whsec_') || secret.length < 32) {
      console.error('[payment-webhook] secret malformato — len:', secret.length, 'tail:', JSON.stringify(secret.slice(-6)));
    }
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  // Skip eventi di health-check inviati da /api/webhook-self-check.
  // Identificati da metadata.product='healthcheck' (PI) o metadata.plan='healthcheck' (Session).
  // Restituiscono 200 senza side-effect (no tag, no Meta CAPI, no GHL).
  const md = event.data?.object?.metadata || {};
  if (md.product === 'healthcheck' || md.plan === 'healthcheck') {
    console.log('[payment-webhook] healthcheck skipped:', event.id);
    return res.status(200).json({ received: true, healthcheck: true });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log('Checkout completed:', session.id, session.metadata);

      const email = session.customer_email || session.metadata?.customer_email || '';
      const name = session.metadata?.customer_name || '';
      const firstName = name.split(' ')[0] || '';
      const lastName = name.split(' ').slice(1).join(' ') || '';

      // Club / altri prodotti via Checkout Session → SOLO pixel 1 (no signal stacking sul nuovo BM).
      await Promise.all([
        notifyGHL({
          event: 'purchase',
          product: session.metadata?.product || '',
          email,
          name,
          amount: session.amount_total,
          currency: session.currency,
          stripe_session_id: session.id,
        }),
        notifyMetaCAPIPixel1({
          eventId: session.id,
          email,
          firstName,
          lastName,
          value: (session.amount_total || 0) / 100,
          currency: (session.currency || 'eur').toUpperCase(),
        }),
      ]);
      break;
    }

    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      console.log('Payment intent succeeded:', pi.id, pi.metadata);

      // Solo per OTO Sfida 7 Giorni (gli altri PaymentIntent del progetto possono avere
      // product diversi; il filtro evita di firare Purchase fuori contesto).
      if (pi.metadata?.product === 'sfida-7-giorni') {
        const email = pi.metadata.customer_email || pi.receipt_email || '';
        const name = pi.metadata.customer_name || '';
        const firstName = name.split(' ')[0] || '';
        const lastName = name.split(' ').slice(1).join(' ') || '';
        const value = (pi.amount || 0) / 100;
        const currency = (pi.currency || 'eur').toUpperCase();

        // tagOtoBuyerInGHL ritorna contactId → usato come external_id per EMQ boost su pixel 2.
        // Eseguito prima per avere il contactId disponibile, poi gli altri side-effect in parallelo.
        const contactId = await tagOtoBuyerInGHL({ email, firstName, lastName });

        await Promise.all([
          notifyGHL({
            event: 'purchase',
            product: pi.metadata.product,
            email,
            name,
            amount: pi.amount,
            currency: pi.currency,
            stripe_payment_id: pi.id,
          }),
          // event_id = pi.id → matcha l'event_id che il client legge da
          // ?payment_intent=pi_xxx nel return_url → Meta dedupica.
          notifyMetaCAPIPixel1({
            eventId: pi.id,
            email,
            firstName,
            lastName,
            value,
            currency,
          }),
          // Pixel 2: stesso event_id (dedup browser↔server su entrambi i pixel) + EMQ enrichment.
          notifyMetaCAPIPixel2({
            eventId: pi.id,
            email,
            firstName,
            lastName,
            value,
            currency,
            contactId,
          }),
        ]);
      }
      break;
    }

    default:
      console.log('Unhandled event type:', event.type);
  }

  res.status(200).json({ received: true });
};
