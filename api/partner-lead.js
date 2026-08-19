// /api/partner-lead — richieste di partnership/sponsorship dal form di /partner.
//
// Prima di questo endpoint il form non era collegato a nulla: submit nativo GET
// sulla stessa pagina, richieste perse in silenzio.
//
// Pattern GHL di casa (vedi api/README.md):
// - REGOLA #1: upsert SENZA tags, poi POST /contacts/{id}/tags (additivo)
// - REGOLA #4: attribution via buildUtmPayload (attributionSource + customFields)
// I dettagli della richiesta (azienda, tipo, budget, messaggio) finiscono in una
// nota sul contatto, così il team li vede nella timeline GHL senza campi custom nuovi.
// Il workflow GHL di notifica va triggerato sul tag `partner-richiesta`.

const { buildUtmPayload } = require('./_lib/build-utm-payload');

const GHL_BASE = 'https://services.leadconnectorhq.com';
const LOCATION_ID = 'whfxv9CQCrjAmBTZJwMw';
const TAG = 'partner-richiesta';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }
    if (!body) return res.status(400).json({ error: 'invalid body' });

    const company = body.company ? String(body.company).trim().slice(0, 120) : '';
    const name    = body.name ? String(body.name).trim().slice(0, 120) : '';
    const email   = body.email ? String(body.email).trim().toLowerCase() : '';
    const phone   = body.phone ? String(body.phone).trim().slice(0, 40) : '';
    const type    = body.type ? String(body.type).trim().slice(0, 60) : '';
    const budget  = body.budget ? String(body.budget).trim().slice(0, 60) : '';
    const message = body.message ? String(body.message).trim().slice(0, 3000) : '';

    if (!company) return res.status(400).json({ error: 'Nome azienda obbligatorio' });
    if (!name)    return res.status(400).json({ error: 'Nome e cognome obbligatori' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email non valida' });
    }
    if (!type)    return res.status(400).json({ error: 'Tipo di collaborazione obbligatorio' });
    if (!message) return res.status(400).json({ error: 'Messaggio obbligatorio' });

    const parts = name.split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
    };

    const utm = buildUtmPayload(body);

    // Step 1: upsert SENZA tags (REGOLA #1)
    const upsertBody = {
      locationId: LOCATION_ID,
      email,
      firstName,
      lastName,
      companyName: company,
      source: 'partner-form',
    };
    if (phone) upsertBody.phone = phone;
    if (utm.attributionSource) upsertBody.attributionSource = utm.attributionSource;
    if (utm.customFields && utm.customFields.length) upsertBody.customFields = utm.customFields;

    const upsertRes = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method: 'POST',
      headers,
      body: JSON.stringify(upsertBody),
    });
    const text = await upsertRes.text();
    if (!upsertRes.ok) {
      console.error('[partner-lead] GHL upsert failed:', upsertRes.status, text);
      return res.status(502).json({ error: 'Invio non riuscito' });
    }

    let contactId = null;
    try { contactId = JSON.parse(text).contact?.id || null; } catch (e) {}

    if (contactId) {
      // Step 2: tag additivo
      const tagRes = await fetch(`${GHL_BASE}/contacts/${encodeURIComponent(contactId)}/tags`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ tags: [TAG] }),
      });
      if (!tagRes.ok) {
        console.error('[partner-lead] add tag failed:', tagRes.status, await tagRes.text());
      }

      // Step 3: dettagli richiesta come nota in timeline
      const nota = [
        'RICHIESTA PARTNERSHIP dal sito (/partner)',
        `Azienda: ${company}`,
        `Referente: ${name}`,
        phone ? `Telefono: ${phone}` : null,
        `Tipo collaborazione: ${type}`,
        budget ? `Budget indicato: ${budget}` : null,
        '',
        'Messaggio:',
        message,
      ].filter(Boolean).join('\n');

      const noteRes = await fetch(`${GHL_BASE}/contacts/${encodeURIComponent(contactId)}/notes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body: nota.slice(0, 5000) }),
      });
      if (!noteRes.ok) {
        console.error('[partner-lead] add note failed:', noteRes.status, await noteRes.text());
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[partner-lead] error:', err);
    return res.status(500).json({ error: 'Errore interno' });
  }
};
