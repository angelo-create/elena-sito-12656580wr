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
      try { body = JSON.parse(body); } catch(e) {}
    }
    if (!body || !body.email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const email = String(body.email).trim().toLowerCase();
    const source = body.source ? String(body.source).slice(0, 120) : 'website';

    // Basic email sanity
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'invalid email' });
    }

    const upsertRes = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        locationId,
        tags: ['newsletter', `newsletter-${source}`],
        source
      })
    });

    const text = await upsertRes.text();
    if (!upsertRes.ok) {
      console.error('[newsletter] GHL upsert failed:', upsertRes.status, text);
      return res.status(upsertRes.status).json({ error: 'subscription failed' });
    }

    let contactId = null;
    try {
      const data = JSON.parse(text);
      contactId = data.contact ? data.contact.id : null;
    } catch (e) {}

    console.log('[newsletter] Subscribed:', email, '| source:', source, '| contactId:', contactId);
    return res.status(200).json({ success: true, contactId });
  } catch (err) {
    console.error('[newsletter] Error:', err.message);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
