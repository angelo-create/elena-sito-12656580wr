const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { buffer } = require('micro');

// Disable Vercel's automatic body parsing — Stripe needs raw body for signature verification
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

// Forward purchase data to GHL via Inbound Webhook
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Read raw body buffer — required for Stripe signature verification
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

      await notifyGHL({
        event: 'purchase',
        product: session.metadata?.product || '',
        email: session.customer_email || session.metadata?.customer_email || '',
        name: session.metadata?.customer_name || '',
        amount: session.amount_total,
        currency: session.currency,
        stripe_session_id: session.id,
      });
      break;
    }

    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      console.log('Payment intent succeeded:', pi.id, pi.metadata);

      // OTO uses PaymentIntent directly (not Checkout Session)
      if (pi.metadata?.product === 'sfida-7-giorni') {
        await notifyGHL({
          event: 'purchase',
          product: pi.metadata.product,
          email: pi.metadata.customer_email || pi.receipt_email || '',
          name: pi.metadata.customer_name || '',
          amount: pi.amount,
          currency: pi.currency,
          stripe_payment_id: pi.id,
        });
      }
      break;
    }

    default:
      console.log('Unhandled event type:', event.type);
  }

  res.status(200).json({ received: true });
};
