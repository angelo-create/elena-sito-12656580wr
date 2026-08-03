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
const { buildUtmPayload } = require('./_lib/build-utm-payload');

function hash(value) {
  return crypto.createHash('sha256').update(String(value).toLowerCase().trim()).digest('hex');
}

async function notifyMetaCAPIPixel1({ eventId, email, firstName, lastName, phone, fbc, fbp, sourceUrl, userAgent, clientIp, contentName, landingUrl }) {
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
      event_source_url: sourceUrl || landingUrl,
      action_source: 'website',
      user_data: userData,
      custom_data: {
        content_name: contentName,
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
    console.log('[webinar-lead] Meta CAPI Lead pixel 1:', eventId, JSON.stringify(result));
  } catch (err) {
    console.error('[webinar-lead] Meta CAPI pixel 1 error:', err.message);
  }
}

// Pixel 2 isolato: Lead + CompleteRegistration con EMQ enrichment (external_id GHL + country).
// Vedi plan: signal stacking per abbassare CPL sul nuovo BM, senza toccare il pixel 1.
async function notifyMetaCAPIPixel2({
  eventIdLead, eventIdRegister,
  email, firstName, lastName, phone, fbc, fbp,
  sourceUrl, userAgent, clientIp, contactId, contentName, landingUrl
}) {
  const pixelId = process.env.META_PIXEL_ID_2;
  const accessToken = process.env.META_ACCESS_TOKEN_2;
  if (!pixelId || !accessToken) return;

  const userData = {};
  if (email)      userData.em = [hash(email)];
  if (firstName)  userData.fn = [hash(firstName)];
  if (lastName)   userData.ln = [hash(lastName)];
  if (phone)      userData.ph = [hash(phone.replace(/\D/g, ''))];
  userData.country = [hash('it')];
  if (contactId)  userData.external_id = [hash(contactId)];
  if (fbc)        userData.fbc = fbc;
  if (fbp)        userData.fbp = fbp;
  if (clientIp)   userData.client_ip_address = clientIp;
  if (userAgent)  userData.client_user_agent = userAgent;

  const baseEvent = {
    event_time: Math.floor(Date.now() / 1000),
    event_source_url: sourceUrl || landingUrl,
    action_source: 'website',
    user_data: userData,
    custom_data: {
      content_name: contentName,
      content_category: 'webinar',
    },
  };

  const data = [];
  if (eventIdLead)     data.push({ ...baseEvent, event_name: 'Lead',                 event_id: eventIdLead });
  if (eventIdRegister) data.push({ ...baseEvent, event_name: 'CompleteRegistration', event_id: eventIdRegister });
  if (data.length === 0) return;

  try {
    const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    const result = await resp.json();
    console.log('[webinar-lead] Meta CAPI pixel 2:', JSON.stringify(result));
  } catch (err) {
    console.error('[webinar-lead] Meta CAPI pixel 2 error:', err.message);
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
    // questo campo source. Tutte le LP lo passano esplicitamente:
    // il default qui sotto è solo una rete di sicurezza.
    const source = body.source ? String(body.source).slice(0, 120) : 'webinar-25-26-27-agosto-2026';
    const srcLc = source.toLowerCase();

    // Registro degli eventi webinar. Per lanciare un nuovo webinar si aggiunge
    // UNA riga qui, con lo stesso `source` che passa la landing.
    //
    // Perché una mappa e non un if/else: la versione precedente derivava il tag
    // con `srcLc.includes('luglio') ? ... : 'webinar-maggio-2026'`, quindi
    // QUALSIASI source nuovo ereditava silenziosamente il tag di maggio,
    // inquinando la coorte di un evento passato e facendo partire il workflow
    // GHL sbagliato.
    //
    // `slug` è la pagina pubblica (l'URL non cambia quando si rinomina il tag)
    // e serve solo come fallback di event_source_url per Meta CAPI.
    const WEBINAR_EVENTS = {
      'webinar-25-26-27-agosto-2026':        { tag: 'webinar-25-26-27-agosto-2026', contentName: 'Webinar 25-26-27 Agosto 2026', slug: 'webinar-agosto' },
      'webinar-luglio-lipedema':             { tag: 'webinar-luglio-lipedema',      contentName: 'Webinar Lipedema 2026',        slug: 'webinar-luglio'    },
      'webinar-maggio-estate-inarrestabile': { tag: 'webinar-maggio-2026',          contentName: 'Estate Inarrestabile 2026',    slug: 'webinar-maggio'    },
      'webinar-maggio-2026':                 { tag: 'webinar-maggio-2026',          contentName: 'Estate Inarrestabile 2026',    slug: 'webinar-maggio'    },
    };

    function slugify(s) {
      return s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    }

    let event = WEBINAR_EVENTS[srcLc];
    if (!event) {
      // Source non registrato: non ereditiamo MAI il tag di un evento esistente.
      // Deriviamo uno slug dal source, così il lead resta attribuito al suo
      // evento e il tag orfano si nota subito in GHL.
      const derived = slugify(source) || 'webinar-non-attribuito';
      event = { tag: derived, contentName: source, slug: derived };
      console.warn('[webinar-lead] source non registrato in WEBINAR_EVENTS:', source, '-> tag derivato:', derived);
    }

    // Tag dedicati al webinar — riconoscibili dai workflow GHL.
    // Il primo è universale per tutte le iscrizioni webinar Elena,
    // il secondo è specifico dell'evento.
    const eventTag = event.tag;
    const contentName = event.contentName;
    const landingUrl = `https://go.elenagiordani.com/${event.slug}`;
    const tags = ['webinar-iscritta', eventTag];

    // NB: NON passiamo `tags` in upsert. /contacts/upsert con `tags` sovrascrive
    // l'array tag del contatto (cancella newsletter/altri tag preesistenti).
    // I tag vengono aggiunti dopo via POST /contacts/{id}/tags (additivo nativo).
    const payload = {
      email,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      phone: phoneDigits,
      locationId,
      source
    };

    // Attribution: UTM + click IDs + referrer + landing URL.
    // Vanno sia in attributionSource (tab Attribution GHL) sia in customFields[]
    // (scheda contatto + smart list + export). Vedi api/README.md REGOLA #4.
    const utmPayload = buildUtmPayload(body);
    if (utmPayload.attributionSource) payload.attributionSource = utmPayload.attributionSource;
    if (utmPayload.customFields.length > 0) payload.customFields = utmPayload.customFields;

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

    if (contactId) {
      try {
        const addTagsRes = await fetch(`https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}/tags`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Version': '2021-07-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ tags })
        });
        if (!addTagsRes.ok) {
          const errText = await addTagsRes.text();
          console.error('[webinar-lead] Add tags failed:', addTagsRes.status, errText.slice(0, 200));
        } else {
          console.log('[webinar-lead] Tags added (additive):', tags.join(', '), '|', contactId);
        }
      } catch (tagErr) {
        console.error('[webinar-lead] Add tags error (non-blocking):', tagErr.message);
      }
    }

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

        // GHL espone DUE identificatori per ogni custom value e non coincidono:
        //   name     = etichetta leggibile, es. "Link Webinar", "Codice accesso"
        //   fieldKey = "{{ custom_values.link_webinar }}"
        // Le chiavi snake_case che cerchiamo vivono solo in fieldKey. Indicizzare
        // per il solo `name` (com'era prima) faceva fallire tutti e tre i lookup
        // in silenzio: webinarInfo tornava sempre vuoto e la thank-you restava
        // senza link Zoom. Ora indicizziamo per fieldKey, per name e per lo slug
        // normalizzato del name, così rinominare l'etichetta dalla UI non rompe più niente.
        const slug = (s) => String(s)
          .normalize('NFD').replace(/[̀-ͯ]/g, '')   // via gli accenti
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');

        const map = {};
        (cvData.customValues || []).forEach((cv) => {
          if (!cv) return;
          if (cv.name) {
            map[cv.name] = cv.value;
            map[slug(cv.name)] = cv.value;
          }
          // "{{ custom_values.link_webinar }}" -> "link_webinar"
          const fk = /custom_values\.([a-z0-9_]+)/i.exec(cv.fieldKey || '');
          if (fk) map[fk[1]] = cv.value;
        });

        webinarInfo = {
          link: map['link_webinar'] || '',
          codice: map['codice_accesso_webinar'] || map['codice_accesso'] || '',
          idRiunione: map['id_riunione'] || ''
        };
        if (!webinarInfo.link) {
          console.warn('[webinar-lead] link_webinar non risolto. Chiavi disponibili:', Object.keys(map).join(', '));
        }
      } else {
        const errText = await cvRes.text();
        console.warn('[webinar-lead] Custom values fetch failed:', cvRes.status, errText.slice(0, 200));
      }
    } catch (cvErr) {
      console.warn('[webinar-lead] Custom values fetch error:', cvErr.message);
    }

    // Fire Meta CAPI Lead — fire-and-forget, non blocca la risposta al client.
    // Pixel 1: invariato (solo Lead). Pixel 2: Lead + CompleteRegistration con EMQ enrichment.
    if (body.event_id) {
      const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress;
      const userAgent = body.user_agent || req.headers['user-agent'];

      notifyMetaCAPIPixel1({
        eventId: body.event_id,
        email,
        firstName,
        lastName,
        phone: phoneDigits,
        fbc: body.fbc,
        fbp: body.fbp,
        sourceUrl: body.event_source_url,
        userAgent,
        clientIp,
        contentName,
        landingUrl,
      }).catch((err) => console.error('[webinar-lead] CAPI pixel 1 fire-and-forget error:', err.message));

      notifyMetaCAPIPixel2({
        eventIdLead: body.event_id,
        eventIdRegister: body.event_id_register,
        email,
        firstName,
        lastName,
        phone: phoneDigits,
        fbc: body.fbc,
        fbp: body.fbp,
        sourceUrl: body.event_source_url,
        userAgent,
        clientIp,
        contactId,
        contentName,
        landingUrl,
      }).catch((err) => console.error('[webinar-lead] CAPI pixel 2 fire-and-forget error:', err.message));
    }

    return res.status(200).json({ success: true, contactId, webinarInfo });
  } catch (err) {
    console.error('[webinar-lead] Error:', err.message);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
