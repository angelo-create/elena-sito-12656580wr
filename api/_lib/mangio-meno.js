// Funzioni comuni a api/mangio-meno-lead.js e api/mangio-meno-candidatura.js.
//
// Regole GHL (api/README.md):
// - upsert SENZA `tags` (REGOLA #1): i tag si aggiungono dopo con POST /contacts/{id}/tags;
// - UTM sia in attributionSource sia nei custom field (REGOLA #4), via buildUtmPayload.
//
// Nei log non finiscono mai dati personali: niente nome, email o telefono,
// l'id del contatto solo abbreviato a 6 caratteri.

const crypto = require('crypto');
const { buildUtmPayload } = require('./build-utm-payload');
const { normalizePhone } = require('./normalize-phone');

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const LOCATION_ID = 'whfxv9CQCrjAmBTZJwMw';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_RE = /^[A-Za-z0-9]{15,40}$/;
const EVENT_ID_RE = /^[A-Za-z0-9_.:-]{8,100}$/;
const LIMITI = { nome: 80, email: 254, telefono: 30 };

function breve(id) {
  return id ? String(id).slice(0, 6) : '-';
}

function parseBody(req) {
  let b = req.body;
  if (typeof b === 'string') {
    if (b.length > 20000) return null;
    try { b = JSON.parse(b); } catch (e) { return null; }
  }
  return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
}

// Testo pulito: stringa, senza caratteri di controllo, spazi ridotti.
function testo(v) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Stringa breve e innocua (event_id, fbc, fbp, user agent): altrimenti vuota.
function opzionale(v, max) {
  return typeof v === 'string' && v.length > 0 && v.length <= max ? v : '';
}

// Nome, email e WhatsApp. Restituisce { errore } oppure { firstName, email, phone }.
function validaContatto(body) {
  const firstName = testo(body.first_name);
  const email = testo(body.email).toLowerCase();
  const phoneRaw = typeof body.phone === 'string' ? body.phone.trim() : '';

  if (!firstName) return { errore: 'Nome obbligatorio' };
  if (firstName.length > LIMITI.nome) return { errore: 'Nome troppo lungo' };
  if (!email) return { errore: 'Email obbligatoria' };
  if (email.length > LIMITI.email || !EMAIL_RE.test(email)) return { errore: 'Email non valida' };
  if (!phoneRaw) return { errore: 'Telefono obbligatorio' };
  if (phoneRaw.length > LIMITI.telefono) return { errore: 'Telefono non valido' };
  const phone = normalizePhone(phoneRaw);
  const cifre = phone.replace(/\D/g, '').length;
  if (cifre < 8 || cifre > 15) return { errore: 'Telefono non valido' };
  return { firstName, email, phone };
}

function ghlHeaders(apiKey) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json'
  };
}

// Upsert del contatto. NB: niente `tags` qui dentro (api/README.md, REGOLA #1):
// /contacts/upsert con `tags` sostituisce tutti i tag gia' presenti.
// Niente lastName se vuoto: un contatto esistente tiene il suo cognome.
// Restituisce l'id del contatto (o null). Lancia un errore se GHL rifiuta.
// `campi`: campi personalizzati in piu' (risposte del quiz o della candidatura,
// api/_lib/mangio-meno-campi.js), insieme a quelli degli UTM.
async function upsertContatto(apiKey, { firstName, email, phone, source, campi }, body, etichetta) {
  const payload = { locationId: LOCATION_ID, email, firstName, phone };
  if (source) payload.source = source;
  const utm = buildUtmPayload(body);
  if (utm.attributionSource) payload.attributionSource = utm.attributionSource;
  const customFields = utm.customFields.concat(Array.isArray(campi) ? campi : []);
  if (customFields.length > 0) payload.customFields = customFields;

  const r = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
    method: 'POST',
    headers: ghlHeaders(apiKey),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000)
  });
  const txt = await r.text();
  if (!r.ok) {
    // Il testo della risposta GHL puo' contenere i dati inviati: nel log va solo lo stato.
    console.error(`[${etichetta}] upsert GHL non riuscito, stato`, r.status);
    const err = new Error('upsert');
    err.status = r.status;
    throw err;
  }
  try {
    const data = JSON.parse(txt);
    return data && data.contact && data.contact.id ? data.contact.id : null;
  } catch (e) {
    return null;
  }
}

// POST /contacts/{id}/tags e' additivo: non tocca i tag gia' presenti.
async function aggiungiTag(apiKey, contactId, tags, etichetta) {
  try {
    const r = await fetch(`${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}/tags`, {
      method: 'POST',
      headers: ghlHeaders(apiKey),
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) {
      console.error(`[${etichetta}] tag non aggiunti, stato`, r.status, '|', breve(contactId));
      return false;
    }
    console.log(`[${etichetta}] tag aggiunti:`, tags.join(', '), '|', breve(contactId));
    return true;
  } catch (err) {
    console.error(`[${etichetta}] errore tag (non bloccante):`, err.name, '|', breve(contactId));
    return false;
  }
}

async function aggiungiNota(apiKey, contactId, corpo, etichetta) {
  try {
    const r = await fetch(`${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}/notes`, {
      method: 'POST',
      headers: ghlHeaders(apiKey),
      body: JSON.stringify({ body: corpo }),
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) {
      console.error(`[${etichetta}] nota non salvata, stato`, r.status, '|', breve(contactId));
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[${etichetta}] errore nota (non bloccante):`, err.name, '|', breve(contactId));
    return false;
  }
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value).toLowerCase().trim()).digest('hex');
}

function datiRichiesta(req, body) {
  const headers = req.headers || {};
  const ip = String(headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || '';
  const url = opzionale(body.event_source_url, 1000);
  return {
    clientIp: ip,
    userAgent: opzionale(body.user_agent, 500) || headers['user-agent'] || '',
    fbc: opzionale(body.fbc, 300),
    fbp: opzionale(body.fbp, 300),
    sourceUrl: /^https:\/\//.test(url) ? url : ''
  };
}

// Evento a Meta CAPI sugli stessi due pixel e con le stesse variabili d'ambiente
// di api/webinar-lead.js. Stesso event_id del pixel nel browser: Meta tiene uno
// solo dei due. Pixel 1 come webinar-lead (dati base), pixel 2 con external_id
// (id GHL) e paese. Si aspetta la risposta di Meta (massimo 5 secondi) prima di
// rispondere al browser: in serverless un invio lasciato a meta' puo' perdersi.
async function inviaCapi({ eventName, eventId, email, firstName, phone, contactId, richiesta, sourceUrlPredefinito, customData, etichetta }) {
  if (!eventId || !EVENT_ID_RE.test(eventId)) return;

  const base = {};
  if (email) base.em = [hash(email)];
  if (firstName) base.fn = [hash(firstName)];
  if (phone) base.ph = [hash(phone.replace(/\D/g, ''))];
  if (richiesta.fbc) base.fbc = richiesta.fbc;
  if (richiesta.fbp) base.fbp = richiesta.fbp;
  if (richiesta.clientIp) base.client_ip_address = richiesta.clientIp;
  if (richiesta.userAgent) base.client_user_agent = richiesta.userAgent;

  const pixel = [
    { nome: 'pixel 1', id: process.env.META_PIXEL_ID, token: process.env.META_ACCESS_TOKEN, user: base },
    {
      nome: 'pixel 2', id: process.env.META_PIXEL_ID_2, token: process.env.META_ACCESS_TOKEN_2,
      user: Object.assign({}, base, { country: [hash('it')] }, contactId ? { external_id: [hash(contactId)] } : {})
    }
  ].filter((px) => px.id && px.token);

  await Promise.allSettled(pixel.map(async (px) => {
    const payload = {
      data: [{
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: richiesta.sourceUrl || sourceUrlPredefinito,
        action_source: 'website',
        user_data: px.user,
        custom_data: customData
      }]
    };
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${px.id}/events?access_token=${px.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000)
      });
      const out = await r.json().catch(() => ({}));
      if (r.ok) console.log(`[${etichetta}] CAPI ${eventName} ${px.nome}: ricevuti`, out.events_received, '|', eventId);
      else console.error(`[${etichetta}] CAPI ${eventName} ${px.nome}: stato`, r.status, (out.error && out.error.message) || '');
    } catch (err) {
      console.error(`[${etichetta}] CAPI ${eventName} ${px.nome}: errore`, err.name);
    }
  }));
}

function rispondiErrore(res, status, messaggio) {
  return res.status(status).json({ success: false, error: messaggio });
}

module.exports = {
  ID_RE,
  breve,
  parseBody,
  testo,
  validaContatto,
  upsertContatto,
  aggiungiTag,
  aggiungiNota,
  datiRichiesta,
  inviaCapi,
  rispondiErrore
};
