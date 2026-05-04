#!/usr/bin/env node
// Recovery: ripristina i tag GHL persi quando un contatto ha firmato la liberatoria
// e l'API /contacts/upsert ha sovrascritto l'array tag (bug pre-fix).
//
// Input: CSV dell'Audit Log GHL esportato da
//   Sub-Account -> Settings -> Audit Logs
//   Filtri: Module=Contacts, Action=Update, Time Range=finestra dall'incidente
//
// Logica: cerca righe con cambio del campo `tags` in cui il NUOVO valore
// contiene il tag liberatoria (es. liberatoria-firmata-ncv-live-2026) e il
// VECCHIO valore conteneva tag aggiuntivi. Per ogni contatto chiama
// POST /contacts/{id}/tags con i tag mancanti (additivo nativo, no-op su
// tag gia' presenti — quindi rieseguibile in sicurezza).
//
// Usage:
//   GHL_PIT_TOKEN=pit-xxxx GHL_LOCATION_ID=loc-xxxx \
//     node scripts/restore-tags-from-audit.js path/to/audit-log.csv
//
//   # Dry-run: stampa solo cosa farebbe, non chiama l'API
//   DRY_RUN=1 GHL_PIT_TOKEN=... node scripts/restore-tags-from-audit.js audit.csv
//
//   # Tag liberatoria custom (default: liberatoria-firmata-ncv-live-2026)
//   LIBERATORIA_TAG=mio-tag GHL_PIT_TOKEN=... node scripts/restore-tags-from-audit.js audit.csv
//
// IMPORTANTE: la struttura del CSV GHL audit log NON e' documentata
// pubblicamente. Lo script ipotizza colonne tipiche (Module, Action, Field,
// Old Value, New Value, Contact ID, Email, Timestamp). Se il CSV reale ha
// header diversi, modifica `extractEventFromRow` qui sotto adattando i nomi.

const fs = require('fs');
const path = require('path');

const PIT = process.env.GHL_PIT_TOKEN;
const LOC = process.env.GHL_LOCATION_ID;
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const LIBERATORIA_TAG = (process.env.LIBERATORIA_TAG || 'liberatoria-firmata-ncv-live-2026').toLowerCase();

const API = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

const csvPath = process.argv[2];

if (!csvPath) {
  console.error('ERRORE: passa il path del CSV come argomento.');
  console.error('Usage: node scripts/restore-tags-from-audit.js path/to/audit-log.csv');
  process.exit(1);
}
if (!PIT) {
  console.error('ERRORE: serve GHL_PIT_TOKEN come env var.');
  process.exit(1);
}
if (!fs.existsSync(csvPath)) {
  console.error(`ERRORE: file non trovato: ${csvPath}`);
  process.exit(1);
}

// --- Naive CSV parser con supporto quoting ---
function parseCsv(text) {
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        cur.push(field); field = '';
        if (cur.some(v => v !== '')) rows.push(cur);
        cur = [];
      } else { field += c; }
    }
  }
  if (field !== '' || cur.length) {
    cur.push(field);
    if (cur.some(v => v !== '')) rows.push(cur);
  }
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map(h => h.trim());
  const records = rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
    return obj;
  });
  return { headers, records };
}

// Estrae array di tag da stringhe del tipo:
//   "[\"newsletter-iscritta\", \"webinar-iscritta\"]"
//   "newsletter-iscritta, webinar-iscritta"
//   "newsletter-iscritta;webinar-iscritta"
function parseTagList(raw) {
  if (!raw) return [];
  const s = String(raw).trim();
  if (!s) return [];
  // JSON array
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map(t => String(t).trim().toLowerCase()).filter(Boolean);
    } catch {}
  }
  // CSV-style (virgole o punto-virgola), strip virgolette
  return s.replace(/^["']|["']$/g, '')
    .split(/[,;]/)
    .map(t => t.replace(/^["']|["']$/g, '').trim().toLowerCase())
    .filter(Boolean);
}

// Mappa nomi colonna possibili (case-insensitive) verso chiavi normalizzate.
function pickField(record, candidates) {
  const keys = Object.keys(record);
  for (const cand of candidates) {
    const k = keys.find(h => h.toLowerCase() === cand.toLowerCase());
    if (k && record[k]) return record[k];
  }
  return '';
}

// Estrae un evento utile dalla riga audit. Ritorna null se non rilevante.
function extractEventFromRow(record) {
  const moduleField = pickField(record, ['Module', 'Modulo']).toLowerCase();
  const actionField = pickField(record, ['Action', 'Action Type', 'Azione']).toLowerCase();
  const fieldName = pickField(record, ['Field', 'Field Name', 'Campo']).toLowerCase();
  const oldVal = pickField(record, ['Old Value', 'Before', 'Previous Value', 'Vecchio valore']);
  const newVal = pickField(record, ['New Value', 'After', 'Current Value', 'Nuovo valore']);
  const contactId = pickField(record, ['Contact ID', 'ContactId', 'Entity ID', 'Resource ID']);
  const email = pickField(record, ['Email', 'Contact Email']).toLowerCase();
  const timestamp = pickField(record, ['Timestamp', 'Time', 'Date', 'Data']);

  // Vogliamo solo update di contatti che toccano i tag.
  if (moduleField && !moduleField.includes('contact')) return null;
  if (actionField && !actionField.includes('update')) return null;
  if (fieldName && !fieldName.includes('tag')) return null;

  const oldTags = parseTagList(oldVal);
  const newTags = parseTagList(newVal);

  // Caso target: i nuovi tag contengono il tag liberatoria E i vecchi avevano
  // tag che ora mancano -> sono stati cancellati dall'upsert.
  if (!newTags.includes(LIBERATORIA_TAG)) return null;
  const lostTags = oldTags.filter(t => !newTags.includes(t));
  if (lostTags.length === 0) return null;

  return { contactId, email, lostTags, oldTags, newTags, timestamp };
}

async function addTagsToContact(contactId, tags) {
  const url = `${API}/contacts/${encodeURIComponent(contactId)}/tags`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PIT}`,
      Version: VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tags })
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${text.slice(0, 200)}`);
  }
  return text;
}

// Risolve contactId da email se mancante (alcuni audit log GHL non lo riportano).
async function findContactIdByEmail(email) {
  if (!LOC) return '';
  const url = `${API}/contacts/search/duplicate?locationId=${encodeURIComponent(LOC)}&email=${encodeURIComponent(email)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${PIT}`, Version: VERSION }
  });
  if (!res.ok) return '';
  try {
    const data = await res.json();
    return (data.contact && data.contact.id) || '';
  } catch { return ''; }
}

(async () => {
  console.log(`Loading CSV: ${csvPath}`);
  const text = fs.readFileSync(csvPath, 'utf8');
  const { headers, records } = parseCsv(text);
  console.log(`Headers: ${headers.join(' | ')}`);
  console.log(`Records: ${records.length}`);
  console.log(`Liberatoria tag (target): ${LIBERATORIA_TAG}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'LIVE (will call GHL API)'}`);
  console.log('---');

  const events = [];
  for (const r of records) {
    const ev = extractEventFromRow(r);
    if (ev) events.push(ev);
  }

  if (events.length === 0) {
    console.log('Nessun evento rilevante trovato. Verifica:');
    console.log('  - il CSV contiene update events su contatti con cambio tags');
    console.log('  - i nomi colonna nel CSV (modifica `extractEventFromRow` se servono adattamenti)');
    process.exit(0);
  }

  // Aggrega per contatto: somma tutti i tag persi nel tempo (idempotente).
  const byContact = new Map();
  for (const ev of events) {
    const key = ev.contactId || ev.email;
    if (!key) continue;
    if (!byContact.has(key)) {
      byContact.set(key, { contactId: ev.contactId, email: ev.email, lostTags: new Set(), timestamps: [] });
    }
    const entry = byContact.get(key);
    ev.lostTags.forEach(t => entry.lostTags.add(t));
    if (ev.timestamp) entry.timestamps.push(ev.timestamp);
  }

  console.log(`Contatti impattati: ${byContact.size}`);
  console.log('---');

  let restored = 0;
  let failed = 0;
  let skipped = 0;
  for (const [key, entry] of byContact) {
    const tags = Array.from(entry.lostTags);
    let cid = entry.contactId;
    if (!cid && entry.email) {
      cid = await findContactIdByEmail(entry.email);
    }
    if (!cid) {
      console.log(`SKIP  ${key} -> impossibile risolvere contactId | tags persi: ${tags.join(', ')}`);
      skipped++;
      continue;
    }
    const label = `${cid} (${entry.email || '?'})`;
    if (DRY_RUN) {
      console.log(`DRY   ${label} -> ripristinerei: ${tags.join(', ')}`);
      restored++;
      continue;
    }
    try {
      await addTagsToContact(cid, tags);
      console.log(`OK    ${label} -> ripristinati: ${tags.join(', ')}`);
      restored++;
    } catch (err) {
      console.error(`FAIL  ${label} -> ${err.message}`);
      failed++;
    }
  }

  console.log('---');
  console.log(`Restored: ${restored} | Failed: ${failed} | Skipped: ${skipped}`);
  if (DRY_RUN) console.log('(nessuna scrittura effettuata: era un dry-run)');
})().catch(err => {
  console.error('Errore fatale:', err.message);
  process.exit(1);
});
