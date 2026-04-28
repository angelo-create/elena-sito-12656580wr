#!/usr/bin/env node
// Crea i custom field GHL necessari alla liberatoria firma digitale.
// Idempotente: salta i campi gia' esistenti.
//
// Usage:
//   GHL_PIT_TOKEN=pit-xxxx GHL_LOCATION_ID=loc-xxxx node scripts/setup-ghl-liberatoria-fields.js

const PIT = process.env.GHL_PIT_TOKEN;
const LOC = process.env.GHL_LOCATION_ID;

if (!PIT || !LOC) {
  console.error('ERRORE: serve GHL_PIT_TOKEN e GHL_LOCATION_ID come env var.');
  console.error('Esempio:');
  console.error('  GHL_PIT_TOKEN=pit-xxxx GHL_LOCATION_ID=loc-xxxx node scripts/setup-ghl-liberatoria-fields.js');
  process.exit(1);
}

const API = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

const FIELDS = [
  { name: 'Codice Fiscale',                key: 'codice_fiscale',              dataType: 'TEXT' },
  { name: 'Liberatoria - PDF URL',         key: 'liberatoria_pdf_url',         dataType: 'TEXT' },
  { name: 'Liberatoria - PDF File ID',     key: 'liberatoria_pdf_file_id',     dataType: 'TEXT' },
  { name: 'Liberatoria - PDF Filename',    key: 'liberatoria_pdf_filename',    dataType: 'TEXT' },
  { name: 'Liberatoria - Firmata il',      key: 'liberatoria_signed_at',       dataType: 'DATE' },
  { name: 'Liberatoria - IP firmatario',   key: 'liberatoria_ip',              dataType: 'TEXT' },
  { name: 'Liberatoria - User Agent',      key: 'liberatoria_user_agent',      dataType: 'LARGE_TEXT' },
  { name: 'Liberatoria - Versione testo',  key: 'liberatoria_text_version',    dataType: 'TEXT' },
  { name: 'Liberatoria - Hash SHA-256',    key: 'liberatoria_pdf_hash_sha256', dataType: 'TEXT' },
  { name: 'Consenso - Liberatoria',        key: 'consenso_liberatoria',        dataType: 'TEXT' },
  { name: 'Consenso - Trattamento dati',   key: 'consenso_dati',               dataType: 'TEXT' },
  { name: 'Consenso - Marketing',          key: 'consenso_marketing',          dataType: 'TEXT' },
  { name: 'Consenso - Immagini e video',   key: 'consenso_immagini_video',     dataType: 'TEXT' }
];

const headers = {
  Authorization: `Bearer ${PIT}`,
  Version: VERSION,
  'Content-Type': 'application/json'
};

async function listExisting() {
  const url = `${API}/locations/${LOC}/customFields?model=contact`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`List failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  // GHL ritorna { customFields: [...] }
  return (data.customFields || []).map(f => ({
    id: f.id,
    name: f.name,
    fieldKey: f.fieldKey,
    dataType: f.dataType
  }));
}

async function createField(field) {
  const url = `${API}/locations/${LOC}/customFields`;
  const body = {
    name: field.name,
    dataType: field.dataType,
    fieldKey: field.key, // GHL antepone "contact." automaticamente al fieldKey, NON aggiungere il prefisso
    model: 'contact'
  };
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`status ${res.status}: ${txt.slice(0, 250)}`);
  try { return JSON.parse(txt); } catch { return txt; }
}

(async () => {
  console.log('Fetching custom field esistenti...');
  let existing;
  try {
    existing = await listExisting();
  } catch (err) {
    console.error('Impossibile leggere i custom field. Verifica PIT token / scope.');
    console.error('Errore:', err.message);
    process.exit(1);
  }

  console.log(`Trovati ${existing.length} custom field gia' presenti sul contatto.`);
  console.log();

  const existingKeys = new Set(existing.map(f => (f.fieldKey || '').replace(/^contact\./, '')));

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const field of FIELDS) {
    if (existingKeys.has(field.key)) {
      console.log(`[SKIP]   ${field.key.padEnd(38)} gia' presente`);
      skipped++;
      continue;
    }
    try {
      await createField(field);
      console.log(`[CREATE] ${field.key.padEnd(38)} OK (${field.dataType})`);
      created++;
    } catch (err) {
      console.log(`[FAIL]   ${field.key.padEnd(38)} ${err.message}`);
      failed++;
    }
  }

  console.log();
  console.log(`Riepilogo: ${created} creati, ${skipped} gia' presenti, ${failed} falliti.`);
  if (failed) process.exit(2);
})();
