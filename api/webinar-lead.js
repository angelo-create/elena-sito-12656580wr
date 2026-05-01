// /api/webinar-lead — endpoint dedicato per le iscrizioni al webinar
// (separato da /api/newsletter, che è solo per la newsletter homepage).
//
// Usa GHL contacts/upsert API direttamente con tag dedicati: il workflow
// GHL "Webinar — Estate Inarrestabile" può triggerare sul tag
// `webinar-maggio-2026` per inviare l'email di benvenuto + link Zoom.
//
// Inoltre fira un evento Lead a Meta CAPI server-side con lo stesso event_id
// generato dal client → Meta dedupica pixel client + CAPI server. Email,
// nome, cognome e telefono sono hashati SHA-256 lowercase come richiesto da Meta.

const crypto = require('crypto');

function hash(value) {
  return crypto.createHash('sha256').update(String(value).toLowerCase().trim()).digest('hex');
}

async function notifyMetaCAPI({ eventId, email, firstName, lastName, phone, fbc, fbp, sourceUrl, userAgent, clientIp }) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!pixelId || !accessToken || !eventId) return;

  const userData = {};
  if (email)     userData.em = [hash(email)];
  if (firstName) userData.fn = [hash(firstName)];
  if (lastName)  userData.ln = [hash(lastName)];
  if (phone)     userData.ph = [hash(phone.replace(/\D/g, ''))];
  if (fbc)       userData.fbc = fbc;
  if (fbp)       userData.fbp = fbp;
  if (clientIp)  userData.client_ip_address = clientIp;
  if (userAgent) userData.client_user_agent = userAgent;

  const payload = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: sourceUrl || 'https://go.elenagiordani.com/webinar-maggio',
      action_source: 'website',
      user_data: userData,
      custom_data: {
        content_name: 'Estate Inarrestabile 2026',
        content_category: 'webinar',
      },
    }],
  };

  try {
    const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await resp.json();
    console.log('[webinar-lead] Meta CAPI Lead:', eventId, JSON.stringify(result));
  } catch (err) {
    console.error('[webinar-lead] Meta CAPI error:', err.message);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const locationId = 'whfxv9CQCrjAmBTZJwMw';
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }
    if (!body) return res.status(400).json({ error: 'invalid body' });

    const clip = (v, max = 500) => v ? String(v).slice(0, max) : undefined;
    const firstName = body.first_name ? String(body.first_name).trim().slice(0, 80) : '';
    const lastName  = body.last_name ? String(body.last_name).trim().slice(0, 80) : '';
    const email     = body.email ? String(body.email).trim().toLowerCase() : '';
    const phoneRaw  = body.phone ? String(body.phone).trim() : '';
    const phoneDigits = phoneRaw.replace(/[^\d+]/g, '');

    if (!firstName)  return res.status(400).json({ error: 'Nome obbligatorio' });
    if (!lastName)   return res.status(400).json({ error: 'Cognome obbligatorio' });
    if (!email)      return res.status(400).json({ error: 'Email obbligatoria' });
    if (!phoneRaw)   return res.status(400).json({ error: 'Telefono obbligatorio' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email non valida' });
    }
    if (phoneDigits.replace(/^\+/, '').length < 8) {
      return res.status(400).json({ error: 'Telefono non valido' });
    }

    // Source identifica il webinar specifico — il workflow GHL
    // può differenziare tag/email per webinar diversi guardando
    // questo campo source.
    const source = body.source ? String(body.source).slice(0, 120) : 'webinar-maggio-2026';

    // Tag dedicati al webinar — riconoscibili dai workflow GHL.
    // Il primo è universale per tutte le iscrizioni webinar Elena, il
    // secondo è specifico dell'evento.
    const tags = ['webinar-iscritta', 'webinar-maggio-2026'];

    const payload = {
      email,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      phone: phoneDigits,
      locationId,
      tags,
      source
    };

    // Attribution: UTM + click IDs + referrer + landing URL
    const attr = {};
    if (body.utm_source)   attr.utmSource   = clip(body.utm_source);
    if (body.utm_medium)   attr.medium      = clip(body.utm_medium);
    if (body.utm_campaign) attr.campaign    = clip(body.utm_campaign);
    if (body.utm_content)  attr.utmContent  = clip(body.utm_content);
    if (body.utm_term)     attr.utmKeyword  = clip(body.utm_term);
    if (body.referrer)     attr.referrer    = clip(body.referrer, 1000);
    if (body.landing_url)  attr.url         = clip(body.landing_url, 1000);
    if (body.fbclid)       attr.fbclid      = clip(body.fbclid);
    if (body.gclid)        attr.gclid       = clip(body.gclid);
    if (body.msclkid)      attr.msclikid    = clip(body.msclkid);
    if (Object.keys(attr).length > 0) {
      payload.attributionSource = attr;
    }

    const upsertRes = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await upsertRes.text();
    if (!upsertRes.ok) {
      console.error('[webinar-lead] GHL upsert failed:', upsertRes.status, text);
      return res.status(upsertRes.status).json({ error: 'Invio non riuscito' });
    }

    let contactId = null;
    try {
      const data = JSON.parse(text);
      contactId = data.contact ? data.contact.id : null;
    } catch (e) {}

    console.log('[webinar-lead] Lead captured:', email, '| source:', source, '| contactId:', contactId);

    // Fetch custom values GHL per la thank-you page (link Zoom, passcode, ecc.)
    // Non bloccante: se fallisce, la thank-you mostra placeholder/email-only.
    let webinarInfo = {};
    try {
      const cvRes = await fetch(`https://services.leadconnectorhq.com/locations/${locationId}/customValues`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Version': '2021-07-28'
        }
      });
      if (cvRes.ok) {
        const cvData = await cvRes.json();
        const map = {};
        (cvData.customValues || []).forEach((cv) => {
          if (cv && cv.name) map[cv.name] = cv.value;
        });
        webinarInfo = {
          link: map['link_webinar'] || '',
          codice: map['codice_accesso_webinar'] || '',
          idRiunione: map['id_riunione'] || ''
        };
      } else {
        const errText = await cvRes.text();
        console.warn('[webinar-lead] Custom values fetch failed:', cvRes.status, errText.slice(0, 200));
      }
    } catch (cvErr) {
      console.warn('[webinar-lead] Custom values fetch error:', cvErr.message);
    }

    // Fire Meta CAPI Lead — fire-and-forget, non blocca la risposta al client
    if (body.event_id) {
      const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress;
      notifyMetaCAPI({
        eventId: body.event_id,
        email,
        firstName,
        lastName,
        phone: phoneDigits,
        fbc: body.fbc,
        fbp: body.fbp,
        sourceUrl: body.event_source_url,
        userAgent: body.user_agent || req.headers['user-agent'],
        clientIp,
      }).catch((err) => console.error('[webinar-lead] CAPI fire-and-forget error:', err.message));
    }

    return res.status(200).json({ success: true, contactId, webinarInfo });
  } catch (err) {
    console.error('[webinar-lead] Error:', err.message);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
