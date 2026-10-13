#!/usr/bin/env node
// Match lista Kajabi -> CRM GHL e applicazione tag di segmento (SOLO additivo).
//
// Prende un export contatti Kajabi (CSV con colonne Name, Email, Tags, ...),
// per ogni email cerca il contatto in GHL e, se trovato, applica UN tag via
// POST /contacts/{id}/tags (endpoint nativo additivo: no-op sui tag gia'
// presenti, quindi rieseguibile in sicurezza). NON usa mai /contacts/upsert
// con `tags` (sovrascriverebbe l'array tag: REGOLA #1 del progetto).
//
// Chi e' in Kajabi ma NON nel CRM finisce solo nel report: nessun contatto
// viene creato.
//
// Usage (dry-run di default: nessuna scrittura):
//   set -a; source .env.vercel.local; set +a
//   node scripts/match-kajabi-tags.js .context/kajabi-iscritte.csv
//
//   # Giro reale (scrive i tag):
//   LIVE=1 node scripts/match-kajabi-tags.js .context/kajabi-iscritte.csv
//
//   # Tag custom (default: iscritte-academy):
//   TAG=academy-attiva LIVE=1 node scripts/match-kajabi-tags.js file.csv
//
//   # Filtra le righe Kajabi per un tag della colonna Tags (default "Iscritta Academy").
//   # Per processare tutte le righe con email: FILTER_TAG=""
//   FILTER_TAG="Iscritta Academy" node scripts/match-kajabi-tags.js file.csv

const fs = require('fs');
const path = require('path');

const PIT = process.env.GHL_PIT_TOKEN || process.env.GHL_API_KEY;
const LOC = process.env.GHL_LOCATION_ID;
const LIVE = process.env.LIVE === '1' || process.env.LIVE === 'true';
const DRY_RUN = !LIVE; // sicuro di default
const TAG = (process.env.TAG || 'iscritte-academy').trim();
const FILTER_TAG = process.env.FILTER_TAG !== undefined ? process.env.FILTER_TAG : 'Iscritta Academy';
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 5));

const API = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

const csvPath = process.argv[2];

if (!csvPath) {
  console.error('ERRORE: passa il path del CSV come argomento.');
  console.error('Usage: node scripts/match-kajabi-tags.js path/to/kajabi.csv');
  process.exit(1);
}
if (!PIT) {
  console.error('ERRORE: serve GHL_PIT_TOKEN (o GHL_API_KEY) come env var.');
  process.exit(1);
}
if (!LOC) {
  console.error('ERRORE: serve GHL_LOCATION_ID come env var.');
  process.exit(1);
}
if (!fs.existsSync(csvPath)) {
  console.error(`ERRORE: file non trovato: ${csvPath}`);
  process.exit(1);
}

// --- CSV parser con supporto quoting (stesso dello script restore-tags) ---
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

function pickField(record, candidates) {
  const keys = Object.keys(record);
  for (const cand of candidates) {
    const k = keys.find(h => h.toLowerCase() === cand.toLowerCase());
    if (k && record[k]) return record[k];
  }
  return '';
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ghlFetch(url, opts = {}, attempt = 0) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${PIT}`,
      Version: VERSION,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {})
    }
  });
  // Retry su rate limit / errori transitori del server.
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(1000 * 2 ** attempt, 15000);
    await sleep(wait);
    return ghlFetch(url, opts, attempt + 1);
  }
  return res;
}

// Elenca i tag della location che contengono `needle` (per confermare lo slug).
async function listMatchingTags(needle) {
  const url = `${API}/locations/${encodeURIComponent(LOC)}/tags`;
  try {
    const res = await ghlFetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const tags = (data.tags || []).map(t => t.name || t).filter(Boolean);
    const n = needle.toLowerCase();
    return tags.filter(t => String(t).toLowerCase().includes(n));
  } catch { return null; }
}

async function findContactIdByEmail(email) {
  const url = `${API}/contacts/search/duplicate?locationId=${encodeURIComponent(LOC)}&email=${encodeURIComponent(email)}`;
  const res = await ghlFetch(url);
  if (!res.ok) return { id: '', status: res.status };
  try {
    const data = await res.json();
    return { id: (data.contact && data.contact.id) || '', status: res.status };
  } catch { return { id: '', status: res.status }; }
}

async function addTag(contactId, tag) {
  const url = `${API}/contacts/${encodeURIComponent(contactId)}/tags`;
  const res = await ghlFetch(url, { method: 'POST', body: JSON.stringify({ tags: [tag] }) });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${txt.slice(0, 200)}`);
  return txt;
}

// Pool a concorrenza fissa.
async function runPool(items, worker, concurrency) {
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const my = idx++;
      await worker(items[my], my);
    }
  });
  await Promise.all(runners);
}

(async () => {
  console.log(`Loading CSV: ${csvPath}`);
  const text = fs.readFileSync(csvPath, 'utf8');
  const { headers, records } = parseCsv(text);
  console.log(`Records nel CSV: ${records.length}`);

  // Filtro opzionale per tag Kajabi (colonna Tags).
  let filtered = records;
  if (FILTER_TAG) {
    filtered = records.filter(r => {
      const tagsCol = pickField(r, ['Tags']);
      return tagsCol && tagsCol.toLowerCase().includes(FILTER_TAG.toLowerCase());
    });
    console.log(`Filtro tag Kajabi "${FILTER_TAG}": ${filtered.length} righe`);
  }

  // Estrai + normalizza + dedup email (usa la colonna "Email").
  const byEmail = new Map();
  let noEmail = 0;
  let invalid = 0;
  for (const r of filtered) {
    const raw = pickField(r, ['Email', 'La Tua Email (email)', 'E-mail (custom_14)']);
    const email = String(raw).trim().toLowerCase();
    if (!email) { noEmail++; continue; }
    if (!EMAIL_RE.test(email)) { invalid++; continue; }
    if (!byEmail.has(email)) {
      byEmail.set(email, { email, name: pickField(r, ['Name', 'First Name']) || '' });
    }
  }
  const list = Array.from(byEmail.values());

  console.log(`Email uniche valide: ${list.length}  (senza email: ${noEmail}, invalide: ${invalid})`);
  console.log(`Tag da applicare: "${TAG}"`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (nessuna scrittura)' : 'LIVE (scrive i tag su GHL)'}`);
  console.log('---');

  // Safety check: tag "academy" gia' esistenti in GHL, per confermare lo slug.
  const academyTags = await listMatchingTags('academy');
  if (academyTags === null) {
    console.log('Nota: impossibile leggere la lista tag della location (endpoint /locations/{id}/tags). Procedo comunque.');
  } else if (academyTags.length === 0) {
    console.log(`Nessun tag "academy" esiste ancora in GHL: verra' creato "${TAG}".`);
  } else {
    console.log(`Tag "academy" gia' presenti in GHL: ${academyTags.map(t => `"${t}"`).join(', ')}`);
    if (!academyTags.map(t => t.toLowerCase()).includes(TAG.toLowerCase())) {
      console.log(`ATTENZIONE: "${TAG}" non e' tra quelli sopra: se vuoi usarne uno esistente rilancia con TAG="...".`);
    }
  }
  console.log('---');

  const result = { tagged: [], notFound: [], errors: [] };
  let done = 0;

  await runPool(list, async (item) => {
    try {
      const { id, status } = await findContactIdByEmail(item.email);
      if (!id) {
        result.notFound.push({ email: item.email, name: item.name, status });
      } else if (DRY_RUN) {
        result.tagged.push({ email: item.email, contactId: id, dry: true });
      } else {
        await addTag(id, TAG);
        result.tagged.push({ email: item.email, contactId: id });
      }
    } catch (err) {
      result.errors.push({ email: item.email, message: err.message });
    }
    done++;
    if (done % 50 === 0) console.log(`... ${done}/${list.length}`);
  }, CONCURRENCY);

  console.log('---');
  console.log(`Match trovati${DRY_RUN ? ' (taggerei)' : ' e taggati'}: ${result.tagged.length}`);
  console.log(`Non trovati nel CRM: ${result.notFound.length}`);
  console.log(`Errori: ${result.errors.length}`);
  if (result.errors.length) {
    result.errors.slice(0, 10).forEach(e => console.log(`  ERR ${e.email}: ${e.message}`));
  }

  // Report su file (gitignored).
  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = path.join(process.cwd(), '.context');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `kajabi-match-report-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    csv: csvPath,
    tag: TAG,
    mode: DRY_RUN ? 'dry-run' : 'live',
    totals: {
      emails: list.length,
      tagged: result.tagged.length,
      notFound: result.notFound.length,
      errors: result.errors.length
    },
    ...result
  }, null, 2));
  console.log('---');
  console.log(`Report: ${outPath}`);
  if (DRY_RUN) console.log('(nessuna scrittura effettuata: era un dry-run. Rilancia con LIVE=1 per taggare davvero.)');
})().catch(err => {
  console.error('Errore fatale:', err.message);
  process.exit(1);
});
