// /api/replay-evento: segna in GHL cosa fa un contatto sulla pagina della
// registrazione del webinar (webinar-novembre-replay.html).
//
// La pagina riceve l'id del contatto GHL in ?c= (dai link in email, WhatsApp
// e chat) e chiama questo endpoint una volta per evento. Qui si aggiunge UN
// tag al contatto, con POST /contacts/{id}/tags: e' additivo, non tocca i tag
// gia' presenti (vedi api/README.md, REGOLA #1). Nessun upsert, nessun dato
// personale in ingresso o nei log.
//
// Gli eventi ammessi sono una lista chiusa: dal client non puo' arrivare un
// nome di tag arbitrario.

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const ID_RE = /^[A-Za-z0-9]{15,40}$/;

const REPLAY = {
  'webinar-10-novembre-2026': {
    'avviato':           'replay-10-novembre-avviato',
    'visto-5min':        'replay-10-novembre-visto-5min',
    'visto-50':          'replay-10-novembre-visto-50',
    'clic-candidatura':  'replay-10-novembre-clic-candidatura'
  }
};

// Freno minimo contro le raffiche: per istanza, in memoria. Una persona vera
// manda al massimo 4 eventi; 20 al minuto per indirizzo bastano e avanzano.
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
  if (typeof b === 'string') {
    if (b.length > 500) return null;
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

  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) {
    console.error('[replay-evento] GHL_API_KEY mancante');
    return res.status(204).end();
  }

  // Da qui in poi si risponde sempre 204: la pagina non deve accorgersi di
  // niente, e un id che in GHL non esiste (link vecchio, contatto cancellato)
  // non e' un errore da mostrare.
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
  return res.status(204).end();
};

module.exports.REPLAY = REPLAY;
