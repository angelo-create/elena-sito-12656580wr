const crypto = require('crypto');

module.exports = async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    console.error('META_PIXEL_ID or META_ACCESS_TOKEN not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { event_name, event_id, event_source_url, user_data = {}, custom_data = {} } = req.body || {};

  if (!event_name || !event_id) {
    return res.status(400).json({ error: 'Missing event_name or event_id' });
  }

  // Build server-enriched user_data
  const serverUserData = {
    client_ip_address: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress,
    client_user_agent: req.headers['user-agent'],
  };

  // Facebook click/browser IDs (from cookies, passed by client)
  if (user_data.fbc) serverUserData.fbc = user_data.fbc;
  if (user_data.fbp) serverUserData.fbp = user_data.fbp;

  // Hash PII fields (Meta requires SHA-256 lowercase)
  if (user_data.em) {
    serverUserData.em = [hash(user_data.em)];
  }
  if (user_data.fn) {
    serverUserData.fn = [hash(user_data.fn)];
  }
  if (user_data.ln) {
    serverUserData.ln = [hash(user_data.ln)];
  }
  if (user_data.ph) {
    serverUserData.ph = [hash(user_data.ph)];
  }

  const payload = {
    data: [{
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id,
      event_source_url: event_source_url || '',
      action_source: 'website',
      user_data: serverUserData,
    }],
  };

  // Add custom_data if provided
  if (Object.keys(custom_data).length > 0) {
    payload.data[0].custom_data = custom_data;
  }

  try {
    const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await resp.json();
    console.log('Meta CAPI:', event_name, event_id, JSON.stringify(result));
    return res.status(200).json({ success: true, events_received: result.events_received });
  } catch (err) {
    console.error('Meta CAPI error:', err.message);
    return res.status(500).json({ error: 'Failed to send event' });
  }
};

function hash(value) {
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}
