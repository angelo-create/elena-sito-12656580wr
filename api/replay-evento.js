// /api/replay-evento: segna in GHL cosa fa un contatto sulla pagina della
// registrazione del webinar (webinar-novembre-replay.html), sulle pagine del
// funnel «Mangio meno» (mangio-meno-risultato.html, mangio-meno-lezioni.html)
// e sulla pagina di grazie dell'ebook «La pancia che non se ne va» (ebook-pancia-grazie.html,
// che prende l'id del contatto dalla risposta del modulo, non da ?c=).
//
// La pagina riceve l'id del contatto GHL in ?c= (dai link in email, WhatsApp
// e chat) e chiama questo endpoint una volta per evento. Qui si aggiunge UN
// tag al contatto, con POST /contacts/{id}/tags: e' additivo, non tocca i tag
// gia' presenti (vedi api/README.md, REGOLA #1). Nessun upsert, nei log niente
// dati personali (l'id del contatto solo a 6 caratteri).
//
// Gli eventi ammessi sono una lista chiusa: dal client non puo' arrivare un
// nome di tag arbitrario.
//
// Solo per «Mangio meno»: se la pagina manda anche event_id, lo stesso evento va
// a Meta CAPI sui due pixel (LezioneAvviata, LezioneFinita, ClicCandidatura, ClicWhatsApp), con
// lo stesso event_id dell'evento del pixel nel browser (js/mangio-meno.js).
// Per riconoscere la persona: id del contatto (external_id, come il Lead), paese,
// cookie _fbc/_fbp, IP e browser. Niente email ne' telefono: non arrivano qui.

const mm = require('./_lib/mangio-meno');

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const ID_RE = /^[A-Za-z0-9]{15,40}$/;
const LEZIONI_URL = 'https://go.elenagiordani.com/mangio-meno-lezioni';

const REPLAY = {
  'webinar-10-novembre-2026': {
    'avviato':           'replay-10-novembre-avviato',
    'visto-5min':        'replay-10-novembre-visto-5min',
    'visto-50':          'replay-10-novembre-visto-50',
    'clic-candidatura':  'replay-10-novembre-clic-candidatura'
  },
  // Funnel «Mangio meno»: lezione avviata, lezione finita (90% visto), clic sulla candidatura
  // e sul pulsante «Scrivi al mio team su WhatsApp».
  'mangio-meno': {
    'lezione-1-avviata': 'mangio-meno-lezione-1-avviata',
    'lezione-2-avviata': 'mangio-meno-lezione-2-avviata',
    'lezione-3-avviata': 'mangio-meno-lezione-3-avviata',
    'lezione-1-finita':  'mangio-meno-lezione-1-finita',
    'lezione-2-finita':  'mangio-meno-lezione-2-finita',
    'lezione-3-finita':  'mangio-meno-lezione-3-finita',
    'clic-candidatura':  'mangio-meno-clic-candidatura',
    'clic-whatsapp':     'mangio-meno-clic-whatsapp'
  },
  // Ebook «La pancia che non se ne va» (ebook-pancia-grazie.html): download del PDF
  // e clic su «Scrivi al mio team su WhatsApp». Solo tag, niente CAPI.
  'ebook-pancia': {
    'scaricato':         'ebook-pancia-scaricato',
    'clic-whatsapp':     'ebook-pancia-clic-whatsapp'
  }
};

// Eventi Meta di «Mangio meno»: stessi nomi di js/mangio-meno.js (il test lo controlla),
// altrimenti Meta non unisce l'evento del browser con quello del server.
const META_MANGIO_MENO = {
  'lezione-1-avviata': { nome: 'LezioneAvviata', contenuto: 'Lezione 1 Mangio meno' },
  'lezione-2-avviata': { nome: 'LezioneAvviata', contenuto: 'Lezione 2 Mangio meno' },
  'lezione-3-avviata': { nome: 'LezioneAvviata', contenuto: 'Lezione 3 Mangio meno' },
  'lezione-1-finita':  { nome: 'LezioneFinita',  contenuto: 'Lezione 1 Mangio meno' },
  'lezione-2-finita':  { nome: 'LezioneFinita',  contenuto: 'Lezione 2 Mangio meno' },
  'lezione-3-finita':  { nome: 'LezioneFinita',  contenuto: 'Lezione 3 Mangio meno' },
  'clic-candidatura':  { nome: 'ClicCandidatura', contenuto: 'Candidatura Mangio meno' },
  'clic-whatsapp':     { nome: 'ClicWhatsApp',    contenuto: 'WhatsApp Mangio meno' }
};

// Freno minimo contro le raffiche: per istanza, in memoria. Una persona vera
// manda al massimo 8 eventi (le 3 lezioni e i due clic); 20 al minuto per indirizzo bastano e avanzano.
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 20;
const hits = new Map();

function tooMany(ip) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const h = hits.get(ip);
  if (!h || now - h.start > WINDOW_MS) { hits.set(ip, { start: now, n: 1 }); return false; }
  h.n += 1;
  return h.n > MAX_PER_WINDOW;
}

function parseBody(req) {
  let b = req.body;
  // sendBeacon puo' arrivare come testo: lo leggiamo comunque come JSON.
  // 4000 caratteri: con i dati per Meta (browser, URL con gli UTM, cookie) il corpo cresce.
  if (typeof b === 'string') {
    if (b.length > 4000) return null;
    try { b = JSON.parse(b); } catch (e) { return null; }
  }
  return b && typeof b === 'object' ? b : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Richiesta non valida' });

  const contactId = typeof body.c === 'string' ? body.c : '';
  const eventi = REPLAY[typeof body.replay === 'string' ? body.replay : ''];
  const tag = eventi && typeof body.evento === 'string' && Object.prototype.hasOwnProperty.call(eventi, body.evento)
    ? eventi[body.evento] : null;
  if (!ID_RE.test(contactId) || !tag) return res.status(400).json({ error: 'Richiesta non valida' });

  const ip = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim() || 'sconosciuto';
  if (tooMany(ip)) return res.status(429).json({ error: 'Troppe richieste' });

  // Da qui in poi si risponde sempre 204: la pagina non deve accorgersi di
  // niente, e un id che in GHL non esiste (link vecchio, contatto cancellato)
  // non e' un errore da mostrare.
  const lavori = [aggiungiTag(contactId, tag)];
  const meta = body.replay === 'mangio-meno' ? META_MANGIO_MENO[body.evento] : null;
  if (meta && typeof body.event_id === 'string') {
    lavori.push(mm.inviaCapi({
      eventName: meta.nome,
      eventId: body.event_id,
      contactId,
      richiesta: mm.datiRichiesta(req, body),
      sourceUrlPredefinito: LEZIONI_URL,
      customData: { content_name: meta.contenuto, content_category: 'mangio-meno' },
      etichetta: 'replay-evento'
    }));
  }
  await Promise.allSettled(lavori);
  return res.status(204).end();
};

async function aggiungiTag(contactId, tag) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) {
    console.error('[replay-evento] GHL_API_KEY mancante');
    return;
  }
  try {
    const r = await fetch(`${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}/tags`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tags: [tag] }),
      signal: AbortSignal.timeout(8000)
    });
    if (r.ok) console.log('[replay-evento] tag aggiunto:', tag, '|', contactId.slice(0, 6));
    else console.warn('[replay-evento] tag non aggiunto:', tag, '| stato GHL', r.status, '|', contactId.slice(0, 6));
  } catch (err) {
    console.error('[replay-evento] errore GHL (non bloccante):', err.name);
  }
}

module.exports.REPLAY = REPLAY;
module.exports.META_MANGIO_MENO = META_MANGIO_MENO;
