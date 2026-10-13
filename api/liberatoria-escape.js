const crypto = require('node:crypto');
const { PDFDocument } = require('pdf-lib');
const text = require('../js/escape-text.js');
const { generaPDF } = require('./_lib/genera-pdf.js');
const { isValidCodiceFiscale } = require('./_lib/codice-fiscale.js');
const { createClient, TAG } = require('./_lib/escape-ghl.js');

const attempts = new Map();
const inFlight = new Map();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const NOTE_PREFIX = 'ESCAPE_SIGNATURE_V1\n';

function validate(body) {
  const errors = [];
  const data = {};
  for (const field of ['nome', 'cognome', 'email', 'telefono', 'dataNascita', 'codiceFiscale', 'indirizzo', 'citta', 'cap', 'provincia']) {
    data[field] = typeof body[field] === 'string' ? body[field].trim() : '';
    if (!data[field] || data[field].length > 180 || /[\x00-\x1f]/.test(data[field])) errors.push(field);
  }
  data.email = data.email.toLowerCase();
  data.codiceFiscale = data.codiceFiscale.toUpperCase();
  data.provincia = data.provincia.toUpperCase();
  if (data.nome.length < 2 || data.cognome.length < 2) errors.push('nome_cognome');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('email');
  if (!/^[+\d\s().-]{6,20}$/.test(data.telefono)) errors.push('telefono');
  if (!isValidCodiceFiscale(data.codiceFiscale)) errors.push('codiceFiscale');
  if (!/^\d{5}$/.test(data.cap) || !/^[A-Z]{2}$/.test(data.provincia)) errors.push('indirizzo');
  const dob = new Date(data.dataNascita + 'T00:00:00Z');
  const adult = new Date(); adult.setUTCFullYear(adult.getUTCFullYear() - 18);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.dataNascita) || Number.isNaN(dob.getTime()) || dob.toISOString().slice(0, 10) !== data.dataNascita || dob > adult || dob.getUTCFullYear() < 1900) errors.push('dataNascita');
  for (const field of ['consensoLiberatoria', 'consensoDati', 'consensoImmagini']) {
    if (body[field] !== true) errors.push(field);
    data[field] = body[field] === true;
  }
  if (typeof body.consensoNewsletter !== 'boolean') errors.push('consensoNewsletter');
  data.consensoNewsletter = body.consensoNewsletter === true;
  if (body.textVersion !== text.TEXT_VERSION) errors.push('textVersion');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.submissionId || '')) errors.push('submissionId');
  data.submissionId = body.submissionId;
  if (typeof body.firmaPng !== 'string' || body.firmaPng.length > 700000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.firmaPng)) errors.push('firma');
  data.firmaPng = body.firmaPng;
  return { data, errors: [...new Set(errors)] };
}

function throttle(ip, email) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
  const key = sha256(`${ip}:${email}`);
  const item = attempts.get(key) || { count: 0, until: now + 3600000 };
  attempts.set(key, item); return ++item.count <= 15;
}

async function indexSignature(client, config, contactPath, record) {
  const values = { pdf_url: record.pdfUrl, pdf_file_id: record.fileId, pdf_filename: record.fileName,
    signed_at: record.signedAt, text_version: record.textVersion, pdf_hash_sha256: record.hash,
    submission_id: record.submissionId, consenso_liberatoria: 'true', consenso_dati: 'true',
    consenso_immagini: 'true', consenso_newsletter: String(record.consents.newsletter) };
  await client.request(contactPath, { method: 'PUT', body: JSON.stringify({ customFields: Object.entries(values).map(([key, value]) => ({ id: config.fieldIds[`escape_2026_${key}`], field_value: value })) }) });
  await client.request(`${contactPath}/tags`, { method: 'POST', body: JSON.stringify({ tags: [TAG] }) });
}

async function saveSignature(data, req) {
  const client = createClient();
  const config = await client.configuration();
  const requestHash = sha256(JSON.stringify(data));
  const signedAt = new Date().toISOString();
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 80);
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
  const firmaPngBytes = Buffer.from(data.firmaPng.split(',')[1], 'base64');
  // Decode before ANY CRM contact write; reject corrupt images instead of an unsigned PDF.
  try {
    if (firmaPngBytes.length < 1024) throw new Error('Firma troppo breve');
    // Inspect dimensions before decoding an untrusted PNG.
    if (firmaPngBytes.length < 24 || firmaPngBytes.readUInt32BE(16) > 4096 || firmaPngBytes.readUInt32BE(20) > 4096) throw new Error('Dimensioni firma non valide');
    const probe = await PDFDocument.create();
    const png = await probe.embedPng(firmaPngBytes);
    if (png.width < 10 || png.height < 10) throw new Error('Firma troppo piccola');
  } catch { return { status: 422, body: { error: 'Firma non valida. Cancella e firma nuovamente.' } }; }

  // No legacy custom fields or tags in upsert: preserve other events and marketing preferences.
  const upsert = await client.request('/contacts/upsert', { method: 'POST', body: JSON.stringify({
    locationId: client.locationId, email: data.email, firstName: data.nome, lastName: data.cognome,
    phone: data.telefono, source: 'liberatoria-escape-2026'
  }) });
  const contactId = upsert.contact?.id;
  if (!contactId) throw new Error('Contatto GHL senza identificativo');
  const contactPath = `/contacts/${encodeURIComponent(contactId)}`;
  const { notes = [] } = await client.request(`${contactPath}/notes`);
  let record;
  let latestSignedAt = '';
  for (const note of notes) {
    if (!note.body?.startsWith(NOTE_PREFIX)) continue;
    try {
      const candidate = JSON.parse(note.body.slice(NOTE_PREFIX.length));
      if (candidate.event === 'escape-2026' && candidate.signedAt > latestSignedAt) latestSignedAt = candidate.signedAt;
      if (candidate.submissionId === data.submissionId) record = candidate;
    } catch { /* Unrelated or edited notes cannot be treated as a saved signature. */ }
  }
  if (record) {
    if (record.requestHash !== requestHash) return { status: 409, body: { error: 'Questa firma è già registrata con dati diversi. Ricarica la pagina per una nuova firma.' } };
    if (!record.pdfUrl || !record.hash) throw new Error('Registro firma incompleto');
    // A retry repairs indexing/tag failures without duplicating the PDF or historical note.
    if (record.signedAt >= latestSignedAt) await indexSignature(client, config, contactPath, record);
    return { status: 200, body: { success: true, pdfUrl: record.pdfUrl, hash: record.hash, timestamp: record.signedAt, textVersion: record.textVersion, emailStatus: 'not_requested', alreadySaved: true } };
  }
  const pdfBuffer = Buffer.from(await generaPDF({ ...data, firmaPngBytes, timestamp: signedAt, ip, userAgent, eventTag: TAG }, text, { strictSignature: true }));
  const hash = sha256(pdfBuffer);
  const fileName = `escape-2026-${data.submissionId}-${hash.slice(0, 16)}.pdf`;
  const form = new FormData();
  form.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), fileName);
  form.append('hosted', 'false'); form.append('name', fileName); form.append('parentId', config.folderId);
  const uploaded = await client.request(`/medias/upload-file?locationId=${encodeURIComponent(client.locationId)}`, { method: 'POST', body: form });
  const pdfUrl = uploaded.url || uploaded.fileUrl;
  const fileId = uploaded.fileId || uploaded.id || uploaded._id;
  if (!pdfUrl || !/^https:\/\//.test(pdfUrl) || !fileId) throw new Error('Upload PDF senza riferimento valido');

  record = { event: 'escape-2026', submissionId: data.submissionId, requestHash, signedAt,
    textVersion: text.TEXT_VERSION, pdfUrl, fileId, fileName, hash, ip, userAgent,
    consents: { partecipazione: true, privacy: true, immagini: true, newsletter: data.consensoNewsletter } };
  // Append, never overwrite. The signed PDF is the snapshot of text, personal data and signature.
  const archive = await client.request(`${contactPath}/notes`, { method: 'POST', body: JSON.stringify({ body: NOTE_PREFIX + JSON.stringify(record, null, 2) }) });
  if (!archive.note?.id) throw new Error('Archivio firma non confermato');

  await indexSignature(client, config, contactPath, record);

  // Dedicated webhook ONLY. Never reuse a Coach/NCV automation with unknown content.
  let emailStatus = 'not_configured';
  if (process.env.GHL_ESCAPE_EMAIL_WEBHOOK_URL) {
    try {
      const response = await fetch(process.env.GHL_ESCAPE_EMAIL_WEBHOOK_URL, { method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_id: contactId, email: data.email,
          first_name: data.nome, last_name: data.cognome, pdf_url: pdfUrl, pdf_filename: fileName,
          signed_at: signedAt, event_tag: TAG, event_name: 'Escape', submission_id: data.submissionId }) });
      emailStatus = response.ok ? 'requested' : 'failed';
    } catch { emailStatus = 'failed'; }
  }
  return { status: 200, body: { success: true, pdfUrl, hash, timestamp: signedAt, textVersion: text.TEXT_VERSION, emailStatus } };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Richiesta non valida.' }); } }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Richiesta non valida.' });
  const { data, errors } = validate(body);
  if (errors.length) return res.status(errors.includes('textVersion') ? 409 : 422).json({ error: errors.includes('textVersion') ? 'Il testo è stato aggiornato. Ricarica la pagina e rileggilo prima di firmare.' : 'Controlla i dati e i consensi richiesti.', fields: errors });
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '');
  if (!throttle(ip, data.email)) return res.status(429).json({ error: 'Troppe richieste. Riprova più tardi.' });
  const key = sha256(JSON.stringify(data));
  try {
    if (!inFlight.has(key)) inFlight.set(key, saveSignature(data, req));
    const result = await inFlight.get(key);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('[escape] Save failed', data.submissionId, error.message);
    return res.status(502).json({ error: 'Non è stato possibile confermare il salvataggio. Riprova senza ricaricare la pagina. Se il problema persiste, scrivi a info.xfitacademy@gmail.com.' });
  } finally { inFlight.delete(key); }
};
module.exports.validate = validate;
