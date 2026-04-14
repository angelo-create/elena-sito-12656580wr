module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const calendarId = '7FMLgGMP7b3DmEQeq684';
  const apiKey = process.env.GHL_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { selectedSlot, name, email, phone } = req.body || {};

    if (!selectedSlot || !name || !email) {
      return res.status(400).json({ error: 'selectedSlot, name and email are required' });
    }

    const url = 'https://services.leadconnectorhq.com/calendars/events/appointments';

    const locationId = 'whfxv9CQCrjAmBTZJwMw';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-04-15',
        'Content-Type': 'application/json',
        'Location': locationId
      },
      body: JSON.stringify({
        calendarId: calendarId,
        selectedSlot: selectedSlot,
        selectedTimezone: 'Europe/Rome',
        contact: {
          name: name,
          email: email,
          phone: phone || ''
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'GHL API error', details: errText });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
