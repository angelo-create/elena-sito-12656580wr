// /api/feedback-negativo — riceve il feedback privato e anonimo di chi vota
// 1-3 stelle su /recensione-vh8kqm (slug non indicizzato, raggiungibile solo
// da link diretto). Nessuna chiamata GHL qui: niente nome, email o telefono
// vengono letti o inoltrati, per design (vedi nota di compliance nell'HTML
// sul motivo del gating 4-5 stelle -> Trustpilot).
//
// Lo storage e' un Google Sheet: questo endpoint fa da relay verso un Google
// Apps Script deployato come Web App (URL in FEEDBACK_SHEET_WEBHOOK_URL),
// stesso pattern gia' usato per GHL_NEWSLETTER_WEBHOOK_URL/GHL_WEBHOOK_URL
// ma qui la scrittura sul Sheet e' l'azione primaria (non un side-effect
// non bloccante): se fallisce, va segnalato con un errore, non ignorato.

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

function clip(v, max = 500) {
  return v ? String(v).slice(0, max) : undefined;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const WEBHOOK_URL = process.env.FEEDBACK_SHEET_WEBHOOK_URL;
  const SHARED_SECRET = process.env.FEEDBACK_SHEET_SECRET;
  if (!WEBHOOK_URL || !SHARED_SECRET) {
    console.error('[feedback-negativo] FEEDBACK_SHEET_WEBHOOK_URL/FEEDBACK_SHEET_SECRET non configurate');
    return res.status(500).json({ error: 'Servizio non ancora configurato.' });
  }

  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    console.warn('[feedback-negativo] rate limit hit:', ip);
    return res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche minuto.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }
    if (!body) return res.status(400).json({ error: 'invalid body' });

    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 3) {
      return res.status(400).json({ error: 'Valutazione non valida.' });
    }

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
      return res.status(400).json({ error: 'Scrivi qualcosa prima di inviare.' });
    }
    if (message.length > 2000) {
      return res.status(422).json({ error: 'Il messaggio è troppo lungo.' });
    }

    // Nessun nome/email/telefono: anche se presenti nel body, non li leggiamo
    // ne' li inoltriamo. Il ramo e' anonimo per requisito.
    const row = {
      secret: SHARED_SECRET,
      timestamp: new Date().toISOString(),
      rating,
      message,
      source_page: 'recensione',
      utm_source: clip(body.utm_source),
      utm_medium: clip(body.utm_medium),
      utm_campaign: clip(body.utm_campaign),
      landing_url: clip(body.landing_url, 1000),
      referrer: clip(body.referrer, 1000)
    };

    let webhookRes;
    try {
      webhookRes = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row)
      });
    } catch (fetchErr) {
      // Fallimento di rete (host irraggiungibile, DNS, timeout...): stesso
      // esito utente di una risposta non-ok, la scrittura non e' avvenuta.
      console.error('[feedback-negativo] Sheet webhook unreachable:', fetchErr.message);
      return res.status(502).json({ error: 'Errore di salvataggio. Riprova tra qualche minuto.' });
    }

    if (!webhookRes.ok) {
      const text = await webhookRes.text();
      console.error('[feedback-negativo] Sheet webhook failed:', webhookRes.status, text.slice(0, 200));
      return res.status(502).json({ error: 'Errore di salvataggio. Riprova tra qualche minuto.' });
    }

    console.log('[feedback-negativo] Feedback registrato, rating:', rating);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[feedback-negativo] Error:', err.message);
    return res.status(500).json({ error: 'Errore interno. Riprova.' });
  }
};
