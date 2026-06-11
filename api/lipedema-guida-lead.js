// /api/lipedema-guida-lead — opt-in lead magnet "Guida Lipedema: 7 errori".
// Clone semplice del pattern metabolismo-guida: upsert GHL + tag dedicati.
//
// Tag:
//   - `trigger-lipedema-guida-dm`  → trigger del workflow GHL che invia la guida
//                                     (email + WhatsApp con il link di download).
//   - `lead-lipedema-guida`        → tag-segmento durevole (smart list, nurture,
//                                     retarget verso il webinar lipedema 7 luglio).
//
// La consegna della guida e' gestita da GHL sul tag trigger. La thank-you page
// offre comunque il download diretto del PDF, quindi il lead riceve la guida
// all'istante anche se l'email tarda.

const { buildUtmPayload } = require('./_lib/build-utm-payload');

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

    const source = 'lipedema-guida-landing';
    const tags = ['trigger-lipedema-guida-dm', 'lead-lipedema-guida'];

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
      console.error('[lipedema-guida-lead] GHL upsert failed:', upsertRes.status, text);
      return res.status(upsertRes.status).json({ error: 'Invio non riuscito' });
    }

    let contactId = null;
    try {
      const data = JSON.parse(text);
      contactId = data.contact ? data.contact.id : null;
    } catch (e) {}

    console.log('[lipedema-guida-lead] Lead captured:', email, '| contactId:', contactId);

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
          console.error('[lipedema-guida-lead] Add tags failed:', addTagsRes.status, errText.slice(0, 200));
        } else {
          console.log('[lipedema-guida-lead] Tags added (additive):', tags.join(', '), '|', contactId);
        }
      } catch (tagErr) {
        console.error('[lipedema-guida-lead] Add tags error (non-blocking):', tagErr.message);
      }
    }

    return res.status(200).json({ success: true, contactId });
  } catch (err) {
    console.error('[lipedema-guida-lead] Error:', err.message);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
