#!/usr/bin/env node
// Configura il metadata `plan` su ognuno dei 6 Stripe Payment Link mappati,
// matchando per URL pubblico (buy.stripe.com/...). Idempotente: se il metadata
// e' gia' settato col valore corretto, skippa.
//
// Usage:
//   STRIPE_SECRET_KEY=sk_live_xxx node scripts/setup-stripe-payment-link-metadata.js
//
// Use `sk_test_xxx` per testare in modalita' test (account di test Stripe separato).

const SK = process.env.STRIPE_SECRET_KEY;
if (!SK) {
  console.error('ERRORE: serve STRIPE_SECRET_KEY come env var.');
  console.error('Esempio:');
  console.error('  STRIPE_SECRET_KEY=sk_live_xxx node scripts/setup-stripe-payment-link-metadata.js');
  process.exit(1);
}

const stripe = require('stripe')(SK);

// URL pubblico Payment Link -> planKey usato dal webhook (api/club-stripe-webhook.js).
// Aggiungere/rimuovere righe se Angelo crea nuovi Payment Link.
const URL_TO_PLAN = {
  'https://buy.stripe.com/4gMeVd7U943C4iieDv77O0w': 'partecipanti-club',
  'https://buy.stripe.com/fZudR9b6l9nWcOO66Z77O0x': 'partecipanti-evento',
  'https://buy.stripe.com/dRmfZh0rHgQo4ii7b377O0y': 'partecipanti-bundle',
  'https://buy.stripe.com/aFa7sL7U99nW7uu3YR77O0z': 'pubblico',
  'https://buy.stripe.com/5kQdR9b6l1Vu7uufHz77O0A': 'evento-pubblico',
  'https://buy.stripe.com/6oUfZhb6l9nW9CCcvn77O0B': 'pubblico-bundle'
};

(async () => {
  console.log('[stripe-metadata] Lista Payment Links del tuo account Stripe...');

  const links = [];
  for await (const link of stripe.paymentLinks.list({ limit: 100 })) {
    links.push(link);
  }
  console.log(`[stripe-metadata] Trovati ${links.length} Payment Link totali.\n`);

  let okCount = 0, skipCount = 0, missCount = 0, errCount = 0;

  for (const [url, planKey] of Object.entries(URL_TO_PLAN)) {
    const link = links.find(l => l.url === url);
    if (!link) {
      console.warn(`[MISS] ${planKey}: nessun Payment Link con url ${url}`);
      missCount++;
      continue;
    }

    const currentPlan = link.metadata && link.metadata.plan;
    if (currentPlan === planKey) {
      console.log(`[SKIP] ${planKey}: gia' configurato (${link.id})`);
      skipCount++;
      continue;
    }

    try {
      await stripe.paymentLinks.update(link.id, {
        metadata: Object.assign({}, link.metadata || {}, { plan: planKey })
      });
      const note = currentPlan ? ` [sovrascritto: ${currentPlan} -> ${planKey}]` : '';
      console.log(`[OK]   ${planKey}: metadata aggiornato (${link.id})${note}`);
      okCount++;
    } catch (err) {
      console.error(`[ERR]  ${planKey}: ${err.message}`);
      errCount++;
    }
  }

  console.log(`\n[stripe-metadata] Risultato: ${okCount} aggiornati, ${skipCount} gia' OK, ${missCount} non trovati, ${errCount} errori.`);

  if (missCount > 0) {
    console.warn('\nAlcuni URL non sono stati trovati nel tuo account. Possibili cause:');
    console.warn('  - Stai usando STRIPE_SECRET_KEY di un account diverso (test vs live).');
    console.warn('  - I Payment Link sono stati cancellati o ricreati con URL diverso.');
    console.warn('  - Gli URL nella mappa URL_TO_PLAN sono cambiati.');
  }

  if (errCount > 0 || missCount > 0) {
    process.exit(1);
  }
})().catch(err => {
  console.error('[stripe-metadata] Errore fatale:', err.message);
  process.exit(1);
});
