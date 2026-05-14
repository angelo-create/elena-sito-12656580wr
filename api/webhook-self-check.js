// /api/webhook-self-check — health-check periodico dei webhook Stripe.
//
// Eseguito da Vercel Cron (vedi vercel.json) ogni mattina alle 09:00 UTC.
// Per ciascun webhook (OTO €27 e Club), genera un evento Stripe-style firmato
// con metadata.product='healthcheck' (o metadata.plan='healthcheck'), lo POSTa
// al webhook live e verifica HTTP 200.
//
// Se uno dei due webhook fallisce signature, log Vercel mostra
// "[self-check] FAILED" con dettagli — visibile in Vercel Dashboard, e (se
// configurato) Vercel invia alert email su error rate.
//
// I webhook stessi sono modificati per skippare il payload se metadata.product
// o metadata.plan === 'healthcheck' → zero side effect su CRM / Meta CAPI.
//
// Auth: Vercel Cron passa Authorization: Bearer <CRON_SECRET>. Se la env
// CRON_SECRET non è impostata, l'endpoint accetta solo da localhost
// (sviluppo). Mai esposto pubblicamente.

const crypto = require('crypto');

const BASE_URL = process.env.SITE_URL || 'https://go.elenagiordani.com';

function sanitizeSecret(raw) {
  return (raw || '').replace(/\\n$/g, '').trim();
}

function signPayload(body, secret, timestamp) {
  const sigPayload = `${timestamp}.${body}`;
  return crypto.createHmac('sha256', secret).update(sigPayload).digest('hex');
}

async function checkWebhook({ url, secret, eventType, metadata }) {
  if (!secret) return { url, ok: false, error: 'secret env not set' };
  const ts = Math.floor(Date.now() / 1000);
  const objectFields = eventType === 'checkout.session.completed'
    ? {
        id: `cs_healthcheck_${ts}`,
        object: 'checkout.session',
        amount_total: 100,
        currency: 'eur',
        payment_status: 'paid',
        mode: 'payment',
        customer_email: 'healthcheck@elenagiordani.dev',
        customer_details: { email: 'healthcheck@elenagiordani.dev', name: 'Healthcheck', phone: null },
        metadata,
        client_reference_id: null,
        payment_intent: null,
        customer: null,
      }
    : {
        id: `pi_healthcheck_${ts}`,
        object: 'payment_intent',
        amount: 100,
        currency: 'eur',
        status: 'succeeded',
        receipt_email: 'healthcheck@elenagiordani.dev',
        metadata,
      };
  const event = {
    id: `evt_healthcheck_${ts}`,
    object: 'event',
    type: eventType,
    created: ts,
    data: { object: objectFields },
  };
  const body = JSON.stringify(event);
  const sig = signPayload(body, secret, ts);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': `t=${ts},v1=${sig}`,
      },
      body,
    });
    return { url, ok: resp.status === 200, status: resp.status };
  } catch (err) {
    return { url, ok: false, error: err.message };
  }
}

module.exports = async function handler(req, res) {
  // Auth: Vercel Cron invia Authorization: Bearer <CRON_SECRET>.
  // Accettiamo anche header x-vercel-cron come fallback (Vercel lo aggiunge automaticamente).
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'] || '';
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  if (cronSecret) {
    if (auth !== `Bearer ${cronSecret}` && !isVercelCron) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  } else {
    console.warn('[self-check] CRON_SECRET not set, allowing request');
  }

  const otoSecret = sanitizeSecret(process.env.STRIPE_WEBHOOK_SECRET_OTO);
  const clubSecret = sanitizeSecret(process.env.STRIPE_WEBHOOK_SECRET_CLUB || process.env.STRIPE_WEBHOOK_SECRET);

  const results = await Promise.all([
    checkWebhook({
      url: `${BASE_URL}/api/payment-webhook`,
      secret: otoSecret,
      eventType: 'payment_intent.succeeded',
      metadata: { product: 'healthcheck' },
    }),
    checkWebhook({
      url: `${BASE_URL}/api/club-stripe-webhook`,
      secret: clubSecret,
      eventType: 'checkout.session.completed',
      metadata: { plan: 'healthcheck' },
    }),
  ]);

  const allOk = results.every((r) => r.ok);
  results.forEach((r) => {
    const tag = r.ok ? '[self-check] OK' : '[self-check] FAILED';
    console.log(`${tag} ${r.url} status=${r.status || 'n/a'} ${r.error ? `err=${r.error}` : ''}`);
  });

  res.status(allOk ? 200 : 500).json({ allOk, results, timestamp: new Date().toISOString() });
};
