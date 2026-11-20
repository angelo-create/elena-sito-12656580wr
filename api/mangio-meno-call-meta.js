// /api/mangio-meno-call-meta: cron Vercel ogni 15 minuti (vercel.json).
//
// Dal 18/11/2026 la candidatura «Mangio meno» usa il calendario classico
// «Consulenza Sbloccata Marco», che dopo la prenotazione porta alla pagina di
// grazie di GHL: nessuna pagina del sito vede la prenotazione, quindi l'evento
// Schedule a Meta lo manda questo endpoint.
//
// 1. legge da GHL le prenotazioni del calendario di Marco create nelle ultime 48 ore
//    (non annullate);
// 2. per ogni contatto con il tag mangio-meno-quiz che non ha ancora il tag
//    mangio-meno-call-prenotata manda Schedule «Call Marco Mangio meno» a Meta CAPI
//    sui due pixel (la conversione personalizzata «MANGIO MENO · Call prenotata»
//    conta Schedule con questo content_name). event_id = schedule_<id appuntamento>,
//    event_time = ora della prenotazione;
// 3. se almeno un pixel l'ha accettato, aggiunge il tag mangio-meno-call-prenotata
//    (POST /contacts/{id}/tags, additivo). Il tag dice «ha prenotato la call»:
//    evita il secondo invio ed e' anche l'uscita della sequenza email del quiz.
//
// Dati per riconoscere la persona: email, telefono, nome e cognome, id del contatto
// (external_id, come Lead e lezioni), paese, e _fbc ricostruito dal fbclid
// dell'annuncio salvato in GHL al Check-Up. Il browser della persona qui non c'e'.
//
// Solo lettura su GHL, a parte il tag. Nei log niente dati personali.

const mm = require('./_lib/mangio-meno');

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const LOCATION_ID = 'whfxv9CQCrjAmBTZJwMw';
const CALENDARIO = 'HiNWYwGpEGZvIesthFA6'; // Consulenza Sbloccata Marco
const PAGINA_CALENDARIO = `https://api.leadconnectorhq.com/widget/booking/${CALENDARIO}`;
const TAG_QUIZ = 'mangio-meno-quiz';
const TAG_FATTO = 'mangio-meno-call-prenotata';
const FINESTRA_MS = 48 * 3600 * 1000;
const GIORNO_MS = 24 * 3600 * 1000;
const MAX_CONTATTI = 40;
const ETICHETTA = 'mangio-meno-call-meta';
const FBCLID_RE = /^[A-Za-z0-9_-]{10,500}$/;

function ghlHeaders(apiKey) {
  return { 'Authorization': `Bearer ${apiKey}`, 'Version': '2021-07-28', 'Content-Type': 'application/json' };
}

async function ghlGet(apiKey, percorso) {
  const r = await fetch(`${GHL_API_BASE}${percorso}`, { headers: ghlHeaders(apiKey), signal: AbortSignal.timeout(10000) });
  if (!r.ok) {
    const err = new Error('ghl');
    err.status = r.status;
    throw err;
  }
  return r.json();
}

// Le prenotazioni si cercano per data della call: si prende da 2 giorni fa a
// 28 giorni avanti (il calendario si prenota fino a 20 giorni avanti), in due pezzi.
async function prenotazioniRecenti(apiKey, adesso) {
  const pezzi = [[adesso - 2 * GIORNO_MS, adesso + 13 * GIORNO_MS], [adesso + 13 * GIORNO_MS, adesso + 28 * GIORNO_MS]];
  const tutte = new Map();
  for (const [da, a] of pezzi) {
    const d = await ghlGet(apiKey, `/calendars/events?locationId=${LOCATION_ID}&calendarId=${CALENDARIO}&startTime=${da}&endTime=${a}`);
    for (const e of (d && d.events) || []) if (e && e.id) tutte.set(e.id, e);
  }
  const recenti = [];
  for (const e of tutte.values()) {
    const creata = Date.parse(e.dateAdded);
    const stato = String(e.appointmentStatus || '').toLowerCase();
    if (!e.contactId || !Number.isFinite(creata)) continue;
    if (adesso - creata > FINESTRA_MS || creata > adesso) continue;
    if (stato === 'cancelled' || stato === 'invalid' || e.deleted) continue;
    recenti.push({ id: String(e.id), contactId: String(e.contactId), creata });
  }
  // Una sola call per contatto: la prima prenotazione della finestra.
  const perContatto = new Map();
  for (const p of recenti.sort((x, y) => x.creata - y.creata)) {
    if (!perContatto.has(p.contactId)) perContatto.set(p.contactId, p);
  }
  return [...perContatto.values()];
}

function fbcDaContatto(contatto) {
  const a = contatto.attributionSource || {};
  const creato = Date.parse(contatto.dateAdded);
  if (!FBCLID_RE.test(String(a.fbclid || '')) || !Number.isFinite(creato)) return '';
  return `fb.1.${creato}.${a.fbclid}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const segreto = process.env.CRON_SECRET;
  if (!segreto) {
    console.error(`[${ETICHETTA}] CRON_SECRET mancante`);
    return res.status(500).json({ error: 'Configurazione mancante' });
  }
  if (((req.headers && req.headers.authorization) || '') !== `Bearer ${segreto}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) {
    console.error(`[${ETICHETTA}] GHL_API_KEY mancante`);
    return res.status(500).json({ error: 'Configurazione mancante' });
  }

  const esito = { prenotazioni: 0, quiz: 0, inviate: 0, gia_inviate: 0, errori: 0 };
  let prenotazioni;
  try {
    prenotazioni = await prenotazioniRecenti(apiKey, Date.now());
  } catch (err) {
    console.error(`[${ETICHETTA}] calendario non letto, stato`, err.status || err.name);
    return res.status(502).json({ error: 'GHL non raggiungibile' });
  }
  esito.prenotazioni = prenotazioni.length;

  for (const p of prenotazioni.slice(0, MAX_CONTATTI)) {
    let contatto;
    try {
      const d = await ghlGet(apiKey, `/contacts/${encodeURIComponent(p.contactId)}`);
      contatto = d && d.contact;
    } catch (err) {
      console.error(`[${ETICHETTA}] contatto non letto, stato`, err.status || err.name, '|', mm.breve(p.contactId));
      esito.errori += 1;
      continue;
    }
    const tag = Array.isArray(contatto && contatto.tags) ? contatto.tags : [];
    if (!tag.includes(TAG_QUIZ)) continue;
    esito.quiz += 1;
    if (tag.includes(TAG_FATTO)) { esito.gia_inviate += 1; continue; }

    const accettato = await mm.inviaCapi({
      eventName: 'Schedule',
      eventId: `schedule_${p.id}`,
      eventTime: Math.floor(p.creata / 1000),
      email: contatto.email || '',
      firstName: contatto.firstName || '',
      lastName: contatto.lastName || '',
      phone: contatto.phone || '',
      contactId: p.contactId,
      richiesta: { fbc: fbcDaContatto(contatto), sourceUrl: PAGINA_CALENDARIO },
      sourceUrlPredefinito: PAGINA_CALENDARIO,
      customData: { content_name: 'Call Marco Mangio meno', content_category: 'mangio-meno' },
      etichetta: ETICHETTA
    });
    if (accettato > 0) {
      esito.inviate += 1;
      await mm.aggiungiTag(apiKey, p.contactId, [TAG_FATTO], ETICHETTA);
    } else {
      esito.errori += 1;
    }
  }

  console.log(`[${ETICHETTA}]`, JSON.stringify(esito));
  return res.status(200).json(esito);
};
