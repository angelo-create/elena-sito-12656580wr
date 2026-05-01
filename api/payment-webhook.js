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
async function notifyMetaCAPI({ eventId, email, firstName, lastName, value, currency, sourceUrl }) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!pixelId || !accessToken) {
    console.log('META_PIXEL_ID/META_ACCESS_TOKEN not set, skipping CAPI');
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
    console.log('Meta CAPI Purchase server-side:', eventId, JSON.stringify(result));
  } catch (err) {
    console.error('Meta CAPI error:', err.message);
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
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log('Checkout completed:', session.id, session.metadata);

      const email = session.customer_email || session.metadata?.customer_email || '';
      const name = session.metadata?.customer_name || '';
      const firstName = name.split(' ')[0] || '';
      const lastName = name.split(' ').slice(1).join(' ') || '';

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
        notifyMetaCAPI({
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
          notifyMetaCAPI({
            eventId: pi.id,
            email,
            firstName,
            lastName,
            value: (pi.amount || 0) / 100,
            currency: (pi.currency || 'eur').toUpperCase(),
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
