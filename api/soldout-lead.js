// /api/soldout-lead — endpoint per liste d'attesa eventi sold-out.
// Usato da evento-novembre.html e lista-attesa-eventi.html.
//
// Convertito da webhook a upsert API diretta per uniformità con webinar-lead.js
// e per poter passare gli UTM come custom field GHL (vedi api/README.md REGOLA #4).
//
// Il tag applicato dipende dal `source` passato dal client:
//   - 'evento-novembre-lista-attesa' (default) -> tag 'lista-attesa-evento-novembre'
//   - 'lista-attesa-eventi-generica'           -> tag 'lista-attesa-eventi-generica'
//   - altrimenti                               -> tag 'lista-attesa-eventi-' + source (sanificato)
//
// Eventuali workflow GHL esistenti agganciati al webhook GHL_SOLDOUT_WEBHOOK
// vanno rilinkati per triggerare sul tag corrispondente.

const { buildUtmPayload } = require('./_lib/build-utm-payload');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const locationId = 'whfxv9CQCrjAmBTZJwMw';
    const apiKey = process.env.GHL_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    try {
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) {}
        }
        if (!body) return res.status(400).json({ error: 'invalid body' });

        const rawName = body.name ? String(body.name).trim() : '';
        const email = body.email ? String(body.email).trim().toLowerCase() : '';
        const phoneRaw = body.phone ? String(body.phone).trim() : '';
        const phoneDigits = phoneRaw.replace(/[^\d+]/g, '');

        if (!rawName) return res.status(400).json({ error: 'Nome obbligatorio' });
        if (!email)   return res.status(400).json({ error: 'Email obbligatoria' });
        if (!phoneRaw) return res.status(400).json({ error: 'Telefono obbligatorio' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Email non valida' });
        }

        // Split name -> first/last (best effort: tutto ciò che non è prima parola = cognome)
        const nameParts = rawName.split(/\s+/);
        const firstName = nameParts[0].slice(0, 80);
        const lastName = nameParts.slice(1).join(' ').slice(0, 80) || '';

        const source = body.source ? String(body.source).slice(0, 120) : 'evento-novembre-lista-attesa';
        const tagBySource = {
            'evento-novembre-lista-attesa': 'lista-attesa-evento-novembre',
            'lista-attesa-eventi-generica': 'lista-attesa-eventi-generica'
        };
        const tag = tagBySource[source]
            || ('lista-attesa-eventi-' + source.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80));
        const tags = [tag];

        const payload = {
            email,
            firstName,
            lastName,
            name: rawName.slice(0, 160),
            phone: phoneDigits,
            locationId,
            source
        };

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
            console.error('[soldout-lead] GHL upsert failed:', upsertRes.status, text);
            return res.status(upsertRes.status).json({ error: 'Invio non riuscito' });
        }

        let contactId = null;
        try {
            const data = JSON.parse(text);
            contactId = data.contact ? data.contact.id : null;
        } catch (e) {}

        console.log('[soldout-lead] Lead captured:', email, '| contactId:', contactId);

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
                    console.error('[soldout-lead] Add tags failed:', addTagsRes.status, errText.slice(0, 200));
                } else {
                    console.log('[soldout-lead] Tags added (additive):', tags.join(', '), '|', contactId);
                }
            } catch (tagErr) {
                console.error('[soldout-lead] Add tags error (non-blocking):', tagErr.message);
            }
        }

        return res.status(200).json({ ok: true, contactId });
    } catch (err) {
        console.error('[soldout-lead] Error:', err.message);
        return res.status(500).json({ error: 'Failed to send lead' });
    }
};
