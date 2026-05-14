// /api/webhook-reconciliation — reconciliation Stripe ↔ GHL.
//
// Eseguito da Vercel Cron (vedi vercel.json) ogni mattina alle 10:00 UTC.
// Copre i casi che il self-check NON vede:
//
//   A) Stripe non manda mai il webhook (outage, retry exhausted, attempt
//      timeout). Acquisto reale persiste, contatto GHL senza tag.
//   B) Workflow GHL disabilitato manualmente / config Stripe rotta dopo
//      modifiche manuali in dashboard.
//   C) Eventi abilitati Stripe modificati (es. tolto payment_intent.succeeded).
//   D) Tag sbagliato applicato per regression nel codice.
//   E) Cron self-check non gira (dead-man switch implicito: se questo
//      reconciliation non gira più, te ne accorgi alla prima discrepanza).
//
// Per ogni acquisto Stripe succeeded delle ultime 24h:
//   1. Estrae email + product/plan + amount
//   2. Cerca il contatto in GHL per email
//   3. Verifica che abbia il tag atteso (PRODUCT_TO_TAG / PLAN_TO_TAG)
//   4. Se mancante / contatto inesistente -> logga MISSING + manda Telegram alert
//
// Anche check Stripe API: i 2 webhook endpoint hanno gli eventi abilitati
// corretti (signal di config rotta lato dashboard Stripe).
//
// Auth: Bearer CRON_SECRET o header x-vercel-cron (idem self-check).

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';
const GHL_LOCATION_ID = 'whfxv9CQCrjAmBTZJwMw';

// Map product -> tag atteso in GHL (mirror del codice nei webhook).
// Aggiornare se aggiungi nuovi prodotti / cambi convention tag.
const PRODUCT_TO_TAG = {
  'sfida-7-giorni': 'oto-sfida-7-giorni',
};

const PLAN_TO_TAG = {
  'partecipanti-club':    'partecipanti-club',
  'partecipanti-evento':  'partecipanti-evento',
  'partecipanti-bundle':  'partecipanti-bundle',
  'pubblico':             'pubblico-club',
  'evento-pubblico':      'pubblico-evento',
  'pubblico-bundle':      'pubblico-bundle',
};

// Eventi Stripe attesi per ciascun webhook endpoint live.
const STRIPE_ENDPOINT_EXPECTATIONS = {
  '/api/payment-webhook':       ['payment_intent.succeeded', 'checkout.session.completed'],
  '/api/club-stripe-webhook':   ['payment_intent.succeeded', 'checkout.session.completed'],
};

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function listStripePurchasesLast24h() {
  const sinceTs = Math.floor(Date.now() / 1000) - 24 * 3600;
  const purchases = [];

  // PaymentIntents succeeded
  let starting_after;
  for (let page = 0; page < 5; page++) {
    const pis = await stripe.paymentIntents.list({
      limit: 100,
      created: { gte: sinceTs },
      ...(starting_after ? { starting_after } : {}),
    });
    for (const p of pis.data) {
      if (p.status !== 'succeeded') continue;
      const md = p.metadata || {};
      purchases.push({
        kind: 'pi',
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        created: p.created,
        email: md.customer_email || p.receipt_email || '',
        product: md.product || null,
        plan: md.plan || null,
      });
    }
    if (!pis.has_more) break;
    starting_after = pis.data[pis.data.length - 1]?.id;
  }

  // Checkout Sessions completed (paid)
  starting_after = undefined;
  for (let page = 0; page < 5; page++) {
    const ss = await stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: sinceTs },
      ...(starting_after ? { starting_after } : {}),
    });
    for (const s of ss.data) {
      if (s.payment_status !== 'paid') continue;
      const md = s.metadata || {};
      const cd = s.customer_details || {};
      purchases.push({
        kind: 'cs',
        id: s.id,
        amount: s.amount_total,
        currency: s.currency,
        created: s.created,
        email: cd.email || s.customer_email || '',
        product: md.product || null,
        plan: md.plan || null,
      });
    }
    if (!ss.has_more) break;
    starting_after = ss.data[ss.data.length - 1]?.id;
  }

  return purchases;
}

async function ghlGetContactByEmail({ apiKey, email }) {
  const url = `${GHL_API_BASE}/contacts/search/duplicate?email=${encodeURIComponent(email)}&locationId=${GHL_LOCATION_ID}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Version': GHL_API_VERSION,
    },
  });
  if (!res.ok) return null;
  const d = await res.json().catch(() => null);
  return d?.contact || null;
}

async function checkStripeEndpointsConfig() {
  const issues = [];
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  for (const [pathExpected, eventsExpected] of Object.entries(STRIPE_ENDPOINT_EXPECTATIONS)) {
    const matching = endpoints.data.filter((e) => e.url.endsWith(pathExpected) && e.status === 'enabled');
    if (matching.length === 0) {
      issues.push(`Nessun endpoint Stripe enabled per ${pathExpected}`);
      continue;
    }
    for (const ep of matching) {
      for (const evt of eventsExpected) {
        if (!ep.enabled_events.includes(evt)) {
          issues.push(`Endpoint ${ep.id} (${pathExpected}) manca evento ${evt}`);
        }
      }
    }
  }
  return issues;
}

async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log('[reconciliation] Telegram non configurato, skip notifica');
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.error('[reconciliation] Telegram error:', err.message);
  }
}

module.exports = async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'] || '';
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  if (cronSecret && auth !== `Bearer ${cronSecret}` && !isVercelCron) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey || !process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'GHL_API_KEY or STRIPE_SECRET_KEY missing' });
  }

  const missing = [];
  const unknown = [];
  let checked = 0;

  try {
    const stripeIssues = await checkStripeEndpointsConfig();

    const purchases = await listStripePurchasesLast24h();
    for (const p of purchases) {
      if (!p.email) continue;
      const expectedTag = (p.product && PRODUCT_TO_TAG[p.product])
        || (p.plan && PLAN_TO_TAG[p.plan])
        || null;
      if (!expectedTag) {
        // product/plan non riconosciuto: non un errore di sincronia, ma
        // segnaliamo per visibilità (potrebbe essere un nuovo prodotto).
        unknown.push({ id: p.id, email: p.email, product: p.product, plan: p.plan, amount: p.amount });
        continue;
      }
      checked++;
      const contact = await ghlGetContactByEmail({ apiKey, email: p.email });
      const tags = contact?.tags || [];
      if (!contact) {
        missing.push({ id: p.id, email: p.email, expected: expectedTag, amount: p.amount, reason: 'contact_not_found' });
      } else if (!tags.includes(expectedTag)) {
        missing.push({ id: p.id, email: p.email, expected: expectedTag, amount: p.amount, reason: 'tag_missing', contactId: contact.id, actualTags: tags });
      }
    }

    const allOk = missing.length === 0 && stripeIssues.length === 0;

    // Log diagnostico (Vercel logs)
    console.log(`[reconciliation] window 24h | purchases=${purchases.length} | checked=${checked} | missing=${missing.length} | unknown=${unknown.length} | stripeConfigIssues=${stripeIssues.length}`);
    if (stripeIssues.length) console.log('[reconciliation] Stripe config issues:', JSON.stringify(stripeIssues));
    for (const m of missing) {
      console.log(`[reconciliation] MISSING ${m.reason} | ${m.email} | expected=${m.expected} | stripe=${m.id} | amount=€${(m.amount || 0) / 100}`);
    }
    for (const u of unknown) {
      console.log(`[reconciliation] UNKNOWN product/plan: ${u.product || u.plan || '(none)'} | ${u.email} | stripe=${u.id} | amount=€${(u.amount || 0) / 100}`);
    }

    // Notifica Telegram solo se ci sono problemi
    if (!allOk) {
      const lines = [
        `<b>[ELENA] Webhook reconciliation FAILED</b>`,
        `<i>${new Date().toISOString()}</i>`,
        '',
        `Acquisti Stripe 24h: <b>${purchases.length}</b> (verificati ${checked})`,
        `Tag mancanti: <b>${missing.length}</b>`,
        `Product/plan sconosciuti: ${unknown.length}`,
        `Stripe config issues: ${stripeIssues.length}`,
      ];
      if (missing.length) {
        lines.push('', '<b>Mancanti:</b>');
        missing.slice(0, 10).forEach((m) => {
          lines.push(`• ${m.email} | tag <code>${m.expected}</code> | ${m.reason} | €${(m.amount || 0) / 100}`);
        });
        if (missing.length > 10) lines.push(`...e altri ${missing.length - 10}`);
      }
      if (stripeIssues.length) {
        lines.push('', '<b>Stripe config:</b>');
        stripeIssues.forEach((i) => lines.push(`• ${i}`));
      }
      await notifyTelegram(lines.join('\n'));
    }

    return res.status(allOk ? 200 : 500).json({
      ok: allOk,
      summary: {
        window_hours: 24,
        purchases_found: purchases.length,
        purchases_checked: checked,
        missing_count: missing.length,
        unknown_count: unknown.length,
        stripe_config_issues: stripeIssues.length,
      },
      missing,
      unknown,
      stripeIssues,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[reconciliation] fatal error:', err.message, err.stack);
    await notifyTelegram(`<b>[ELENA] Reconciliation crashed</b>\n${err.message}`);
    return res.status(500).json({ error: err.message });
  }
};
