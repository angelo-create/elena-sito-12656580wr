#!/usr/bin/env node
// Crea (idempotente) i 6 prodotti GHL che corrispondono ai 6 Payment Link
// Stripe attivi sul Club delle Inarrestabili Academy. Per ognuno crea
// product + price. Skippa se gia' esiste un prodotto con lo stesso name.
//
// Usage:
//   GHL_PIT_TOKEN=pit-xxxx GHL_LOCATION_ID=loc-xxxx node scripts/setup-ghl-products-from-stripe.js

// Priorita': GHL_API_KEY ha sempre full scope, PIT solo se autorizzato a products.*
const PIT = process.env.GHL_API_KEY || process.env.GHL_PIT_TOKEN;
const LOC = process.env.GHL_LOCATION_ID;

if (!PIT || !LOC) {
  console.error('ERRORE: serve GHL_PIT_TOKEN (o GHL_API_KEY) e GHL_LOCATION_ID.');
  process.exit(1);
}

const BASE = 'https://services.leadconnectorhq.com';
const VER = '2021-07-28';
const PRODUCTS_VER = '2023-02-21'; // products endpoint usa version diversa

const H = {
  'Authorization': 'Bearer ' + PIT,
  'Version': PRODUCTS_VER,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};

const CATALOG = [
  { planKey: 'pubblico-bundle',     name: 'Club+Evento Academy',                 amount: 294.00 },
  { planKey: 'evento-pubblico',     name: 'Evento Academy',                      amount: 157.00 },
  { planKey: 'pubblico',            name: 'club delle inarrestabili Academy',    amount: 167.00 },
  { planKey: 'partecipanti-bundle', name: 'partecipanti- Club+Evento',           amount: 247.00 },
  { planKey: 'partecipanti-evento', name: 'partecipanti-evento',                 amount: 127.00 },
  { planKey: 'partecipanti-club',   name: 'partecipanti-Club delle Inarrestabili', amount: 147.00 }
];

async function listProducts() {
  // GHL list products: GET /products?locationId=...&limit=100
  const url = `${BASE}/products?locationId=${encodeURIComponent(LOC)}&limit=100`;
  const res = await fetch(url, { headers: H });
  const txt = await res.text();
  if (!res.ok) {
    console.error('list products failed:', res.status, txt.slice(0, 500));
    return [];
  }
  try {
    const data = JSON.parse(txt);
    return data.products || data.data || [];
  } catch { return []; }
}

async function createProduct(name) {
  const body = {
    name,
    description: name,
    productType: 'DIGITAL',
    locationId: LOC,
    availableInStore: true
  };
  const res = await fetch(`${BASE}/products/`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const txt = await res.text();
  if (!res.ok) throw new Error(`create product "${name}" failed: ${res.status} ${txt.slice(0, 500)}`);
  return JSON.parse(txt);
}

async function createPrice(productId, name, amount) {
  const body = {
    name,
    type: 'one_time',
    currency: 'EUR',
    amount: Math.round(amount * 100), // GHL amount in centesimi (verifica con API)
    locationId: LOC
  };
  const res = await fetch(`${BASE}/products/${encodeURIComponent(productId)}/price`, {
    method: 'POST', headers: H, body: JSON.stringify(body)
  });
  const txt = await res.text();
  if (!res.ok) {
    // Se 422 magari amount va in decimali — riprovo
    if (res.status === 422) {
      const body2 = { ...body, amount: amount };
      const res2 = await fetch(`${BASE}/products/${encodeURIComponent(productId)}/price`, {
        method: 'POST', headers: H, body: JSON.stringify(body2)
      });
      const txt2 = await res2.text();
      if (res2.ok) return JSON.parse(txt2);
      throw new Error(`create price retry decimal failed: ${res2.status} ${txt2.slice(0, 500)}`);
    }
    throw new Error(`create price failed: ${res.status} ${txt.slice(0, 500)}`);
  }
  return JSON.parse(txt);
}

(async () => {
  console.log(`[ghl-products] Lista prodotti esistenti per location ${LOC}...`);
  const existing = await listProducts();
  const existingByName = new Map();
  for (const p of existing) {
    if (p && p.name) existingByName.set(p.name.toLowerCase().trim(), p);
  }
  console.log(`[ghl-products] Trovati ${existing.length} prodotti gia' presenti.\n`);

  let okCount = 0, skipCount = 0, errCount = 0;

  for (const item of CATALOG) {
    const key = item.name.toLowerCase().trim();
    if (existingByName.has(key)) {
      console.log(`[SKIP] ${item.name}: gia' esiste (id=${existingByName.get(key)._id || existingByName.get(key).id})`);
      skipCount++;
      continue;
    }
    try {
      const prod = await createProduct(item.name);
      const prodId = prod._id || prod.id || prod.product?._id;
      console.log(`[OK]   ${item.name} -> product ${prodId}`);
      try {
        const price = await createPrice(prodId, item.name, item.amount);
        const priceId = price._id || price.id || price.price?._id;
        console.log(`       └─ price ${priceId} (${item.amount}€)`);
      } catch (pe) {
        console.error(`       └─ ❌ price errore: ${pe.message}`);
        errCount++;
      }
      okCount++;
    } catch (err) {
      console.error(`[ERR]  ${item.name}: ${err.message}`);
      errCount++;
    }
  }

  console.log(`\n[ghl-products] Risultato: ${okCount} creati, ${skipCount} gia' OK, ${errCount} errori.`);
  process.exit(errCount > 0 ? 1 : 0);
})().catch(e => {
  console.error('[ghl-products] Errore fatale:', e.message);
  process.exit(1);
});
