module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // GHL inbound webhook — triggers a workflow that upserts the contact and
  // adds the newsletter tags. The workflow branches on `source` to add the
  // per-channel tag (newsletter-home / newsletter-popup-scroll). Using the
  // webhook keeps tag assignment additive (GHL's Add Tag action preserves
  // existing tags, unlike /contacts/upsert which overwrites them).
  const WEBHOOK_URL = process.env.GHL_NEWSLETTER_WEBHOOK_URL;
  if (!WEBHOOK_URL) return res.status(500).json({ error: 'Webhook URL not configured' });

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
    const phone = body.phone ? String(body.phone).trim().slice(0, 30) : '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'invalid email' });
    }

    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const payload = {
      email,
      source,
      tag_source: `newsletter-${source}`
    };
    if (firstName) payload.first_name = firstName;
    if (lastName) payload.last_name = lastName;
    if (fullName) payload.name = fullName;
    if (phone) payload.phone = phone;

    const clip = (v, max = 500) => v ? String(v).slice(0, max) : undefined;
    if (body.utm_source)   payload.utm_source   = clip(body.utm_source);
    if (body.utm_medium)   payload.utm_medium   = clip(body.utm_medium);
    if (body.utm_campaign) payload.utm_campaign = clip(body.utm_campaign);
    if (body.utm_content)  payload.utm_content  = clip(body.utm_content);
    if (body.utm_term)     payload.utm_term     = clip(body.utm_term);
    if (body.referrer)     payload.referrer     = clip(body.referrer, 1000);
    if (body.landing_url)  payload.landing_url  = clip(body.landing_url, 1000);
    if (body.fbclid)       payload.fbclid       = clip(body.fbclid);
    if (body.gclid)        payload.gclid        = clip(body.gclid);
    if (body.msclkid)      payload.msclkid      = clip(body.msclkid);

    const webhookRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!webhookRes.ok) {
      const text = await webhookRes.text();
      console.error('[newsletter] Webhook failed:', webhookRes.status, text);
      return res.status(webhookRes.status).json({ error: 'subscription failed' });
    }

    console.log('[newsletter] Sent to GHL webhook:', email, '| source:', source);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[newsletter] Error:', err.message);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
