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
    const firstName = body.first_name ? String(body.first_name).trim().slice(0, 80) : '';
    const lastName = body.last_name ? String(body.last_name).trim().slice(0, 80) : '';

    // Basic email sanity
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'invalid email' });
    }

    const tags = ['newsletter', `newsletter-${source}`];

    // Upsert WITHOUT tags — GHL upsert overwrites existing tags, which would
    // wipe tags on returning contacts (e.g. existing students/customers).
    // Tags are added additively via /contacts/:id/tags after the upsert.
    const payload = {
      email,
      locationId,
      source
    };
    if (firstName) payload.firstName = firstName;
    if (lastName) payload.lastName = lastName;
    if (firstName || lastName) payload.name = [firstName, lastName].filter(Boolean).join(' ');

    // Attribution: UTM + click IDs + referrer + landing URL
    const attr = {};
    const clip = (v, max = 500) => v ? String(v).slice(0, max) : undefined;
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
      console.error('[newsletter] GHL upsert failed:', upsertRes.status, text);
      return res.status(upsertRes.status).json({ error: 'subscription failed' });
    }

    let contactId = null;
    try {
      const data = JSON.parse(text);
      contactId = data.contact ? data.contact.id : null;
    } catch (e) {}

    // Add tags additively (preserves any tags the contact already has)
    let tagsAdded = false;
    if (contactId) {
      try {
        const tagsRes = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/tags`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Version': '2021-07-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ tags })
        });
        if (tagsRes.ok) {
          tagsAdded = true;
        } else {
          const tagsErr = await tagsRes.text();
          console.error('[newsletter] GHL add-tags failed:', tagsRes.status, tagsErr);
        }
      } catch (tagsErr) {
        console.error('[newsletter] GHL add-tags error:', tagsErr.message);
      }
    }

    console.log('[newsletter] Subscribed:', email, '| source:', source, '| contactId:', contactId, '| tagsAdded:', tagsAdded);
    return res.status(200).json({ success: true, contactId, tagsAdded });
  } catch (err) {
    console.error('[newsletter] Error:', err.message);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
