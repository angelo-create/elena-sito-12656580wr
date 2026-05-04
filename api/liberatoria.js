const crypto = require('crypto');
const { generaPDF } = require('./_lib/genera-pdf.js');
const { isValidCodiceFiscale } = require('./_lib/codice-fiscale.js');
const { TEXT_VERSION } = require('./_lib/liberatoria-text.js');

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

const rateLimit = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function checkRateLimit(ip) {
  if (!ip) return true;
  const now = Date.now();
  const times = (rateLimit.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (times.length >= RATE_LIMIT_MAX) {
    rateLimit.set(ip, times);
    return false;
  }
  times.push(now);
  rateLimit.set(ip, times);
  return true;
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || '';
}

function validatePayload(body) {
  const errors = [];
  if (!body.nome || typeof body.nome !== 'string' || body.nome.trim().length < 2) errors.push('nome');
  if (!body.cognome || typeof body.cognome !== 'string' || body.cognome.trim().length < 2) errors.push('cognome');
  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) errors.push('email');
  if (!body.telefono || !/^[+\d\s().-]{6,20}$/.test(body.telefono)) errors.push('telefono');
  if (!body.dataNascita || !/^\d{4}-\d{2}-\d{2}$/.test(body.dataNascita)) {
    errors.push('dataNascita');
  } else {
    const dob = new Date(body.dataNascita + 'T00:00:00Z');
    if (Number.isNaN(dob.getTime())) {
      errors.push('dataNascita');
    } else {
      const minAdult = new Date();
      minAdult.setUTCFullYear(minAdult.getUTCFullYear() - 18);
      if (dob > minAdult) errors.push('dataNascita_minorenne');
    }
  }
  if (!body.codiceFiscale || !isValidCodiceFiscale(body.codiceFiscale)) errors.push('codiceFiscale');
  if (!body.indirizzo || body.indirizzo.trim().length < 3) errors.push('indirizzo');
  if (!body.citta || body.citta.trim().length < 2) errors.push('citta');
  if (!body.cap || !/^\d{5}$/.test(body.cap)) errors.push('cap');
  if (!body.provincia || !/^[A-Z]{2}$/.test(body.provincia)) errors.push('provincia');
  if (body.consensoLiberatoria !== true) errors.push('consensoLiberatoria');
  if (body.consensoDati !== true) errors.push('consensoDati');
  if (!body.firmaPng || typeof body.firmaPng !== 'string' || !body.firmaPng.startsWith('data:image/png;base64,')) {
    errors.push('firma');
  }
  return errors;
}

async function uploadToGhlMedia({ pdfBuffer, fileName, locationId, pitToken, parentId }) {
  const fd = new FormData();
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
  fd.append('file', blob, fileName);
  fd.append('hosted', 'false');
  fd.append('name', fileName);
  if (parentId) fd.append('parentId', parentId);

  const url = `${GHL_API_BASE}/medias/upload-file?locationId=${encodeURIComponent(locationId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pitToken}`,
      Version: GHL_API_VERSION
    },
    body: fd
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GHL upload failed: ${res.status} ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`GHL upload returned non-JSON: ${text.slice(0, 300)}`);
  }
}

// Upsert contatto GHL via API diretta. Match per email -> mai duplicati.
// IMPORTANTE: NON passiamo `tags` qui. /contacts/upsert con campo `tags`
// SOVRASCRIVE l'array tag del contatto (cancella i tag preesistenti come
// newsletter, webinar, ecc.). I tag vanno aggiunti dopo l'upsert tramite
// `addTagsToContact` che usa POST /contacts/{id}/tags (additivo nativo).
async function upsertContactViaApi({ data, locationId, pitToken, customFields, timestamp }) {
  const url = `${GHL_API_BASE}/contacts/upsert`;
  const body = {
    locationId,
    email: data.email,
    firstName: data.nome,
    lastName: data.cognome,
    name: `${data.nome} ${data.cognome}`,
    phone: data.telefono,
    address1: data.indirizzo,
    city: data.citta,
    postalCode: data.cap,
    state: data.provincia,
    country: 'IT',
    dateOfBirth: data.dataNascita,
    source: 'liberatoria-firma-digitale',
    customFields
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pitToken}`,
      Version: GHL_API_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GHL upsert failed: ${res.status} ${text.slice(0, 400)}`);
  }
  try { return JSON.parse(text); } catch { return null; }
}

// Aggiunge tag a un contatto GHL in modo additivo, senza toccare i tag esistenti.
// Endpoint nativo additivo, no-op su tag già presenti.
async function addTagsToContact({ contactId, pitToken, tags }) {
  if (!contactId || !Array.isArray(tags) || tags.length === 0) return null;
  const url = `${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}/tags`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pitToken}`,
      Version: GHL_API_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tags })
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GHL add tags failed: ${res.status} ${text.slice(0, 300)}`);
  }
  try { return JSON.parse(text); } catch { return null; }
}

// Webhook fallback (legacy) — chiamato solo se non ho PIT/Location.
async function pushContactWebhook(payload, webhookUrl) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Contact webhook failed: ${res.status} ${text.slice(0, 300)}`);
  }
}

// Inbound Webhook GHL per il trigger dell'email post-firma. Sostituisce il
// trigger "Tag Added" che non è affidabile via API upsert (non emette se il
// contatto già aveva il tag). Non bloccante: errori loggati ma non propagati.
async function triggerEmailWebhook(payload, webhookUrl) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Email trigger webhook failed: ${res.status} ${text.slice(0, 300)}`);
  }
}

function safeFilenamePart(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = getClientIp(req);

  if (!checkRateLimit(ip)) {
    console.warn('[liberatoria] rate limit hit:', ip);
    return res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche minuto.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Empty body' });

  body.nome = String(body.nome || '').trim();
  body.cognome = String(body.cognome || '').trim();
  body.email = String(body.email || '').trim().toLowerCase();
  body.telefono = String(body.telefono || '').trim();
  body.codiceFiscale = String(body.codiceFiscale || '').trim().toUpperCase();
  body.provincia = String(body.provincia || '').trim().toUpperCase();
  body.cap = String(body.cap || '').trim();
  body.indirizzo = String(body.indirizzo || '').trim();
  body.citta = String(body.citta || '').trim();
  body.dataNascita = String(body.dataNascita || '').trim();

  body.consensoLiberatoria = body.consensoLiberatoria === true;
  body.consensoDati = body.consensoDati === true;
  body.consensoNewsletter = body.consensoNewsletter === true;
  body.consensoImmagini = body.consensoImmagini === true;

  const errors = validatePayload(body);
  if (errors.length) {
    return res.status(422).json({ error: 'Validation failed', fields: errors });
  }

  const timestamp = new Date().toISOString();
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
  const eventTag = String(body.eventTag || process.env.LIBERATORIA_DEFAULT_TAG || 'liberatoria-firmata-ncv-live-2026').slice(0, 80);

  try {
    const firmaBase64 = body.firmaPng.replace(/^data:image\/png;base64,/, '');
    const firmaPngBytes = Buffer.from(firmaBase64, 'base64');
    if (firmaPngBytes.length < 1024) {
      return res.status(422).json({ error: 'Validation failed', fields: ['firma_troppo_breve'] });
    }

    const pdfBytes = await generaPDF({
      nome: body.nome,
      cognome: body.cognome,
      email: body.email,
      telefono: body.telefono,
      dataNascita: body.dataNascita,
      codiceFiscale: body.codiceFiscale,
      indirizzo: body.indirizzo,
      citta: body.citta,
      cap: body.cap,
      provincia: body.provincia,
      consensoLiberatoria: body.consensoLiberatoria,
      consensoDati: body.consensoDati,
      consensoNewsletter: body.consensoNewsletter,
      consensoImmagini: body.consensoImmagini,
      firmaPngBytes,
      timestamp,
      ip,
      userAgent,
      eventTag
    });

    const pdfBuffer = Buffer.from(pdfBytes);
    const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    const shortHash = hash.slice(0, 16);
    const isoForFile = timestamp.replace(/[:.]/g, '-');
    const fileName = `liberatoria-${safeFilenamePart(body.cognome)}-${safeFilenamePart(body.nome)}-${isoForFile}-${shortHash}.pdf`;

    const PIT = process.env.GHL_PIT_TOKEN;
    const LOCATION_ID = process.env.GHL_LOCATION_ID;
    const FOLDER_ID = process.env.GHL_LIBERATORIE_FOLDER_ID;
    const WEBHOOK_URL = process.env.GHL_LIBERATORIA_WEBHOOK_URL;
    const EMAIL_TRIGGER_WEBHOOK_URL = process.env.GHL_LIBERATORIA_EMAIL_WEBHOOK_URL;

    let pdfUrl = '';
    let pdfFileId = '';

    if (PIT && LOCATION_ID) {
      try {
        const up = await uploadToGhlMedia({
          pdfBuffer,
          fileName,
          locationId: LOCATION_ID,
          pitToken: PIT,
          parentId: FOLDER_ID
        });
        pdfUrl = up.url || up.fileUrl || up.link || '';
        pdfFileId = up.fileId || up.id || up._id || '';
        console.log('[liberatoria] PDF uploaded:', pdfFileId, pdfUrl);
      } catch (err) {
        console.error('[liberatoria] GHL media upload failed:', err.message);
        // non bloccante — proseguiamo per non perdere la firma
      }
    } else {
      console.warn('[liberatoria] GHL_PIT_TOKEN/GHL_LOCATION_ID assenti — skip upload media');
    }

    const customFieldsArr = [
      { key: 'codice_fiscale',              field_value: body.codiceFiscale },
      { key: 'liberatoria_pdf_url',         field_value: pdfUrl },
      { key: 'liberatoria_pdf_file_id',     field_value: pdfFileId },
      { key: 'liberatoria_pdf_filename',    field_value: fileName },
      { key: 'liberatoria_signed_at',       field_value: timestamp },
      { key: 'liberatoria_ip',              field_value: ip },
      { key: 'liberatoria_user_agent',      field_value: userAgent },
      { key: 'liberatoria_text_version',    field_value: TEXT_VERSION },
      { key: 'liberatoria_pdf_hash_sha256', field_value: hash },
      { key: 'consenso_liberatoria',        field_value: body.consensoLiberatoria ? 'true' : 'false' },
      { key: 'consenso_dati',               field_value: body.consensoDati ? 'true' : 'false' },
      { key: 'consenso_marketing',          field_value: body.consensoNewsletter ? 'true' : 'false' },
      { key: 'consenso_immagini_video',     field_value: body.consensoImmagini ? 'true' : 'false' }
    ];

    let contactId = '';
    if (PIT && LOCATION_ID) {
      try {
        const upsertRes = await upsertContactViaApi({
          data: body,
          locationId: LOCATION_ID,
          pitToken: PIT,
          customFields: customFieldsArr,
          timestamp
        });
        contactId = upsertRes && upsertRes.contact ? upsertRes.contact.id : (upsertRes ? upsertRes.id : '');
        console.log('[liberatoria] Contact upserted (no duplicate):', body.email, '|', contactId);
      } catch (err) {
        console.error('[liberatoria] GHL contact upsert failed:', err.message);
        return res.status(502).json({ error: 'Errore di salvataggio. Riprova tra qualche minuto.' });
      }

      if (contactId) {
        try {
          await addTagsToContact({ contactId, pitToken: PIT, tags: [eventTag] });
          console.log('[liberatoria] Tag added (additive):', eventTag, '|', contactId);
        } catch (err) {
          console.error('[liberatoria] Add tag failed (non-blocking):', err.message);
        }
      }
    } else if (WEBHOOK_URL) {
      // Fallback legacy: webhook GHL. Il workflow GHL deve usare l'azione
      // "Add Tag" (additiva), NON "Update Contact" con campo tags, altrimenti
      // sovrascrive i tag preesistenti del contatto.
      const contactPayload = {
        email: body.email,
        first_name: body.nome,
        last_name: body.cognome,
        phone: body.telefono,
        address1: body.indirizzo,
        city: body.citta,
        postal_code: body.cap,
        state: body.provincia,
        country: 'IT',
        date_of_birth: body.dataNascita,
        tags: [eventTag],
        source: 'liberatoria-firma-digitale',
        custom_fields: customFieldsArr.reduce((acc, cf) => { acc[cf.key] = cf.field_value; return acc; }, {})
      };
      try {
        await pushContactWebhook(contactPayload, WEBHOOK_URL);
        console.log('[liberatoria] Contact pushed via webhook:', body.email);
      } catch (err) {
        console.error('[liberatoria] Contact webhook failed:', err.message);
        return res.status(502).json({ error: 'Errore di salvataggio. Riprova tra qualche minuto.' });
      }
    } else {
      console.warn('[liberatoria] GHL_PIT_TOKEN/GHL_LOCATION_ID assenti — skip upsert contatto');
    }

    if (EMAIL_TRIGGER_WEBHOOK_URL) {
      try {
        await triggerEmailWebhook({
          contact_id: contactId,
          email: body.email,
          first_name: body.nome,
          last_name: body.cognome,
          phone: body.telefono,
          pdf_url: pdfUrl,
          pdf_filename: fileName,
          signed_at: timestamp,
          event_tag: eventTag
        }, EMAIL_TRIGGER_WEBHOOK_URL);
        console.log('[liberatoria] Email trigger webhook fired:', body.email);
      } catch (err) {
        console.error('[liberatoria] Email trigger webhook failed (non-blocking):', err.message);
      }
    }

    return res.status(200).json({
      success: true,
      pdfUrl,
      hash,
      timestamp,
      textVersion: TEXT_VERSION
    });
  } catch (err) {
    console.error('[liberatoria] Error:', err.message, err.stack);
    return res.status(500).json({ error: 'Errore interno. Riprova.' });
  }
};
