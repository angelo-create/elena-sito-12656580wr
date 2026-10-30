// Firma elettronica delle liberatorie evento (Escape 2026, Nel Corpo Che Vuoi Live 7 novembre 2026).
// Ogni evento ha testo, cartella GHL, tag e prefisso nota propri: una firma non finisce mai nell'archivio di un altro evento.
const crypto = require('node:crypto');
const { PDFDocument } = require('pdf-lib');
const { generaPDF } = require('./genera-pdf.js');
const { isValidCodiceFiscale } = require('./codice-fiscale.js');

const ESCAPE_FIELDS = [
  'pdf_url', 'pdf_file_id', 'pdf_filename', 'signed_at', 'text_version',
  'pdf_hash_sha256', 'submission_id', 'consenso_liberatoria', 'consenso_dati',
  'consenso_immagini', 'consenso_newsletter'
].map(key => ({ key: `escape_2026_${key}`, name: `Escape 2026 - ${key}`, dataType: 'TEXT' }));

const EVENTI = {
  escape: {
    id: 'escape-2026', nome: 'Escape', text: require('../../js/escape-text.js'),
    folderName: 'Liberatorie Escape 2026', tag: 'liberatoria-firmata-escape-2026',
    // Campi del contatto con la firma più recente; le note tengono lo storico.
    fields: ESCAPE_FIELDS, fieldPrefix: 'escape_2026_',
    notePrefix: 'ESCAPE_SIGNATURE_V1\n', source: 'liberatoria-escape-2026',
    filePrefix: 'escape-2026', emailWebhookEnv: 'GHL_ESCAPE_EMAIL_WEBHOOK_URL'
  },
  ncvNov: {
    id: 'ncv-nov-2026', nome: 'Nel Corpo Che Vuoi Live', text: require('../../js/ncv-nov-text.js'),
    folderName: 'Liberatorie Nel Corpo Che Vuoi Live 7 novembre 2026', tag: 'liberatoria_evento_7nov',
    // Nessun campo dedicato: PDF nella cartella, nota sul contatto e tag.
    fields: [], fieldPrefix: '',
    notePrefix: 'NCV_NOV_2026_SIGNATURE_V1\n', source: 'liberatoria-ncv-nov-2026',
    filePrefix: 'ncv-7nov-2026', emailWebhookEnv: 'GHL_NCV_NOV_EMAIL_WEBHOOK_URL'
  }
};

function createClient(evento, env = process.env, fetcher = fetch) {
  const locationId = env.GHL_LOCATION_ID;
  if (!locationId || !env.GHL_PIT_TOKEN) throw new Error('Configurazione GHL mancante');
  async function request(path, options = {}) {
    const response = await fetcher(`https://services.leadconnectorhq.com${path}`, {
      ...options,
      signal: AbortSignal.timeout(12000),
      headers: {
        Authorization: `Bearer ${env.GHL_PIT_TOKEN}`, Version: '2021-07-28',
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers
      }
    });
    if (!response.ok) throw new Error(`GHL ${options.method || 'GET'} ${path.split('?')[0]}: HTTP ${response.status}`);
    return response.json();
  }
  async function findFolder() {
    const { files = [] } = await request(`/medias/files?${new URLSearchParams({ altId: locationId, altType: 'location', sortBy: 'createdAt', sortOrder: 'desc', type: 'folder', query: evento.folderName, limit: '100' })}`);
    return files.find(f => f.name === evento.folderName && f.type === 'folder' && !f.deleted);
  }
  async function configuration() {
    let fieldIds = {};
    if (evento.fields.length) {
      const { customFields = [] } = await request(`/locations/${locationId}/customFields?model=contact`);
      fieldIds = Object.fromEntries(customFields.map(f => [(f.fieldKey || '').replace(/^contact\./, ''), f.id]));
      const missing = evento.fields.filter(f => !fieldIds[f.key]);
      if (missing.length) throw new Error(`Campi ${evento.nome} mancanti: ${missing.map(f => f.key).join(', ')}`);
    }
    // Search by exact name: never silently store a signature in another event's folder.
    const folder = await findFolder();
    if (!folder) throw new Error(`Cartella ${evento.nome} mancante`);
    return { folderId: folder._id || folder.id, fieldIds };
  }
  return { request, configuration, findFolder, locationId };
}

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function validate(body, text) {
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

function createSignatureHandler(evento) {
  const { text } = evento;
  const attempts = new Map();
  const inFlight = new Map();

  function throttle(ip, email) {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
    const key = sha256(`${ip}:${email}`);
    const item = attempts.get(key) || { count: 0, until: now + 3600000 };
    attempts.set(key, item); return ++item.count <= 15;
  }

  async function indexSignature(client, config, contactPath, record) {
    if (evento.fields.length) {
      const values = { pdf_url: record.pdfUrl, pdf_file_id: record.fileId, pdf_filename: record.fileName,
        signed_at: record.signedAt, text_version: record.textVersion, pdf_hash_sha256: record.hash,
        submission_id: record.submissionId, consenso_liberatoria: 'true', consenso_dati: 'true',
        consenso_immagini: 'true', consenso_newsletter: String(record.consents.newsletter) };
      await client.request(contactPath, { method: 'PUT', body: JSON.stringify({ customFields: Object.entries(values).map(([key, value]) => ({ id: config.fieldIds[`${evento.fieldPrefix}${key}`], field_value: value })) }) });
    }
    await client.request(`${contactPath}/tags`, { method: 'POST', body: JSON.stringify({ tags: [evento.tag] }) });
  }

  async function saveSignature(data, req) {
    const client = createClient(evento);
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
      phone: data.telefono, source: evento.source
    }) });
    const contactId = upsert.contact?.id;
    if (!contactId) throw new Error('Contatto GHL senza identificativo');
    const contactPath = `/contacts/${encodeURIComponent(contactId)}`;
    const { notes = [] } = await client.request(`${contactPath}/notes`);
    let record;
    let latestSignedAt = '';
    for (const note of notes) {
      if (!note.body?.startsWith(evento.notePrefix)) continue;
      try {
        const candidate = JSON.parse(note.body.slice(evento.notePrefix.length));
        if (candidate.event === evento.id && candidate.signedAt > latestSignedAt) latestSignedAt = candidate.signedAt;
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
    const pdfBuffer = Buffer.from(await generaPDF({ ...data, firmaPngBytes, timestamp: signedAt, ip, userAgent, eventTag: evento.tag }, text, { strictSignature: true }));
    const hash = sha256(pdfBuffer);
    const fileName = `${evento.filePrefix}-${data.submissionId}-${hash.slice(0, 16)}.pdf`;
    const form = new FormData();
    form.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), fileName);
    form.append('hosted', 'false'); form.append('name', fileName); form.append('parentId', config.folderId);
    const uploaded = await client.request(`/medias/upload-file?locationId=${encodeURIComponent(client.locationId)}`, { method: 'POST', body: form });
    const pdfUrl = uploaded.url || uploaded.fileUrl;
    const fileId = uploaded.fileId || uploaded.id || uploaded._id;
    if (!pdfUrl || !/^https:\/\//.test(pdfUrl) || !fileId) throw new Error('Upload PDF senza riferimento valido');

    record = { event: evento.id, submissionId: data.submissionId, requestHash, signedAt,
      textVersion: text.TEXT_VERSION, pdfUrl, fileId, fileName, hash, ip, userAgent,
      consents: { partecipazione: true, privacy: true, immagini: true, newsletter: data.consensoNewsletter } };
    // Append, never overwrite. The signed PDF is the snapshot of text, personal data and signature.
    const archive = await client.request(`${contactPath}/notes`, { method: 'POST', body: JSON.stringify({ body: evento.notePrefix + JSON.stringify(record, null, 2) }) });
    if (!archive.note?.id) throw new Error('Archivio firma non confermato');

    await indexSignature(client, config, contactPath, record);

    // Dedicated webhook ONLY. Never reuse a Coach/NCV automation with unknown content.
    let emailStatus = 'not_configured';
    const webhookUrl = process.env[evento.emailWebhookEnv];
    if (webhookUrl) {
      try {
        const response = await fetch(webhookUrl, { method: 'POST', signal: AbortSignal.timeout(8000),
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_id: contactId, email: data.email,
            first_name: data.nome, last_name: data.cognome, pdf_url: pdfUrl, pdf_filename: fileName,
            signed_at: signedAt, event_tag: evento.tag, event_name: evento.nome, submission_id: data.submissionId }) });
        emailStatus = response.ok ? 'requested' : 'failed';
      } catch { emailStatus = 'failed'; }
    }
    return { status: 200, body: { success: true, pdfUrl, hash, timestamp: signedAt, textVersion: text.TEXT_VERSION, emailStatus } };
  }

  async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Richiesta non valida.' }); } }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Richiesta non valida.' });
    const { data, errors } = validate(body, text);
    if (errors.length) return res.status(errors.includes('textVersion') ? 409 : 422).json({ error: errors.includes('textVersion') ? 'Il testo è stato aggiornato. Ricarica la pagina e rileggilo prima di firmare.' : 'Controlla i dati e i consensi richiesti.', fields: errors });
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '');
    if (!throttle(ip, data.email)) return res.status(429).json({ error: 'Troppe richieste. Riprova più tardi.' });
    const key = sha256(JSON.stringify(data));
    try {
      if (!inFlight.has(key)) inFlight.set(key, saveSignature(data, req));
      const result = await inFlight.get(key);
      return res.status(result.status).json(result.body);
    } catch (error) {
      console.error(`[${evento.id}] Save failed`, data.submissionId, error.message);
      return res.status(502).json({ error: 'Non è stato possibile confermare il salvataggio. Riprova senza ricaricare la pagina. Se il problema persiste, scrivi a info.xfitacademy@gmail.com.' });
    } finally { inFlight.delete(key); }
  }
  handler.validate = body => validate(body, text);
  return handler;
}

module.exports = { EVENTI, createClient, createSignatureHandler };
