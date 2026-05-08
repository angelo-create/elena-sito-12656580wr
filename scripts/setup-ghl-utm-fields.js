#!/usr/bin/env node
// Crea (idempotente) la cartella "UTM Attribution" e i 5 custom field UTM
// in GHL, poi aggiorna api/_lib/utm-fields.js con gli ID restituiti.
//
// Usage:
//   GHL_PIT_TOKEN=pit-xxxx GHL_LOCATION_ID=loc-xxxx node scripts/setup-ghl-utm-fields.js

const fs = require('fs');
const path = require('path');

const PIT = process.env.GHL_PIT_TOKEN;
const LOC = process.env.GHL_LOCATION_ID;

if (!PIT || !LOC) {
  console.error('ERRORE: serve GHL_PIT_TOKEN e GHL_LOCATION_ID come env var.');
  console.error('Esempio:');
  console.error('  GHL_PIT_TOKEN=pit-xxxx GHL_LOCATION_ID=loc-xxxx node scripts/setup-ghl-utm-fields.js');
  process.exit(1);
}

const API = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';
const FOLDER_NAME = 'UTM Attribution';

const FIELDS = [
  { name: 'UTM Source',   key: 'utm_source',   utmKey: 'utm_source' },
  { name: 'UTM Medium',   key: 'utm_medium',   utmKey: 'utm_medium' },
  { name: 'UTM Campaign', key: 'utm_campaign', utmKey: 'utm_campaign' },
  { name: 'UTM Content',  key: 'utm_content',  utmKey: 'utm_content' },
  { name: 'UTM Term',     key: 'utm_term',     utmKey: 'utm_term' }
];

const headers = {
  Authorization: `Bearer ${PIT}`,
  Version: VERSION,
  'Content-Type': 'application/json'
};

async function listExistingFields() {
  const url = `${API}/locations/${LOC}/customFields?model=contact`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`List fields failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.customFields || []).map(f => ({
    id: f.id,
    name: f.name,
    fieldKey: f.fieldKey,
    parentId: f.parentId,
    dataType: f.dataType
  }));
}

async function listFolders() {
  // GET /locations/{locationId}/customFields/folder o simile.
  // L'endpoint custom-fields stesso di solito ritorna anche le folder come voci
  // con dataType=FOLDER. Provo entrambe le strade.
  const url = `${API}/locations/${LOC}/customFields/folder?model=contact`;
  try {
    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json();
      return data.folders || data.customFieldsFolders || [];
    }
  } catch {}
  // Fallback: filtro dalla lista custom fields (alcune versioni API espongono cosi')
  return [];
}

async function createFolder(name) {
  const url = `${API}/locations/${LOC}/customFields/folder`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, model: 'contact', objectKey: 'contact' })
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Folder create failed: ${res.status} ${txt.slice(0, 250)}`);
  try {
    const data = JSON.parse(txt);
    return data.id || (data.customFieldsFolder && data.customFieldsFolder.id);
  } catch {
    return null;
  }
}

async function createField(field, parentId) {
  const url = `${API}/locations/${LOC}/customFields`;
  const body = {
    name: field.name,
    dataType: 'TEXT',
    fieldKey: field.key,
    model: 'contact'
  };
  if (parentId) body.parentId = parentId;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`status ${res.status}: ${txt.slice(0, 250)}`);
  try { return JSON.parse(txt); } catch { return txt; }
}

function writeUtmFieldsFile(idMap) {
  const filePath = path.join(__dirname, '..', 'api', '_lib', 'utm-fields.js');
  const content = `// Mappa UTM -> ID custom field GHL (location: ${LOC}).
//
// Generato da scripts/setup-ghl-utm-fields.js. Per rigenerare:
//   GHL_PIT_TOKEN=... GHL_LOCATION_ID=${LOC} node scripts/setup-ghl-utm-fields.js
//
// Questi ID puntano ai 5 custom field nella folder "${FOLDER_NAME}" di GHL.
// Se un ID e' vuoto, build-utm-payload.js salta quel campo silently.

module.exports = {
    utm_source:   '${idMap.utm_source || ''}',
    utm_medium:   '${idMap.utm_medium || ''}',
    utm_campaign: '${idMap.utm_campaign || ''}',
    utm_content:  '${idMap.utm_content || ''}',
    utm_term:     '${idMap.utm_term || ''}'
};
`;
  fs.writeFileSync(filePath, content);
  console.log(`\n[WRITE] ${filePath}`);
}

(async () => {
  console.log('Fetching custom field esistenti...');
  let existing;
  try {
    existing = await listExistingFields();
  } catch (err) {
    console.error('Impossibile leggere i custom field. Verifica PIT token / scope.');
    console.error('Errore:', err.message);
    process.exit(1);
  }

  console.log(`Trovati ${existing.length} custom field gia' presenti sul contatto.`);

  // Folder: cerca "UTM Attribution", se non esiste prova a crearla.
  let folderId = null;
  try {
    const folders = await listFolders();
    const found = folders.find(f => (f.name || '').toLowerCase() === FOLDER_NAME.toLowerCase());
    if (found) {
      folderId = found.id;
      console.log(`[FOLDER] "${FOLDER_NAME}" gia' esistente: ${folderId}`);
    } else {
      try {
        folderId = await createFolder(FOLDER_NAME);
        console.log(`[FOLDER] "${FOLDER_NAME}" creata: ${folderId || '(id non restituito, ok)'}`);
      } catch (err) {
        console.warn(`[FOLDER] creazione fallita (non bloccante): ${err.message}`);
        console.warn('         I campi verranno creati senza folder (root). Puoi spostarli a mano dopo.');
      }
    }
  } catch (err) {
    console.warn(`[FOLDER] list fallita: ${err.message}. Procedo senza folder.`);
  }

  console.log();

  const existingByKey = new Map();
  existing.forEach(f => {
    const key = (f.fieldKey || '').replace(/^contact\./, '');
    existingByKey.set(key, f);
  });

  const idMap = {};
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const field of FIELDS) {
    const found = existingByKey.get(field.key);
    if (found) {
      console.log(`[SKIP]   ${field.key.padEnd(15)} gia' presente -> ${found.id}`);
      idMap[field.utmKey] = found.id;
      skipped++;
      continue;
    }
    try {
      const result = await createField(field, folderId);
      const newId = (result && (result.id || (result.customField && result.customField.id))) || null;
      console.log(`[CREATE] ${field.key.padEnd(15)} OK -> ${newId || '(id mancante)'}`);
      if (newId) idMap[field.utmKey] = newId;
      created++;
    } catch (err) {
      console.log(`[FAIL]   ${field.key.padEnd(15)} ${err.message}`);
      failed++;
    }
  }

  console.log();
  console.log(`Riepilogo: ${created} creati, ${skipped} gia' presenti, ${failed} falliti.`);

  if (Object.keys(idMap).length > 0) {
    writeUtmFieldsFile(idMap);
    console.log('\nID UTM mappati:');
    Object.entries(idMap).forEach(([k, v]) => console.log(`  ${k.padEnd(15)} = ${v}`));
  }

  if (failed) process.exit(2);
})();
