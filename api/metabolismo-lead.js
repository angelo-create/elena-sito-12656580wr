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
    const firstName = body.nome ? String(body.nome).trim().slice(0, 80) : '';
    const lastName  = body.cognome ? String(body.cognome).trim().slice(0, 80) : '';
    const email     = body.email ? String(body.email).trim().toLowerCase() : '';
    const phoneRaw  = body.telefono ? String(body.telefono).trim() : '';
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

    const source = 'metabolismo-guida-landing';
    const tags = ['trigger-metabolismo-dm', 'metabolismo-guida'];

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

    // Attribution: UTM + click IDs + referrer + landing URL (same pattern as newsletter.js)
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
      console.error('[metabolismo-lead] GHL upsert failed:', upsertRes.status, text);
      return res.status(upsertRes.status).json({ error: 'Invio non riuscito' });
    }

    let contactId = null;
    try {
      const data = JSON.parse(text);
      contactId = data.contact ? data.contact.id : null;
    } catch (e) {}

    console.log('[metabolismo-lead] Lead captured:', email, '| contactId:', contactId);

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
          console.error('[metabolismo-lead] Add tags failed:', addTagsRes.status, errText.slice(0, 200));
        } else {
          console.log('[metabolismo-lead] Tags added (additive):', tags.join(', '), '|', contactId);
        }
      } catch (tagErr) {
        console.error('[metabolismo-lead] Add tags error (non-blocking):', tagErr.message);
      }
    }

    return res.status(200).json({ success: true, contactId });
  } catch (err) {
    console.error('[metabolismo-lead] Error:', err.message);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
