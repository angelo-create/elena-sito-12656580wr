module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GHL_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Version': '2021-04-15',
    'Accept': 'application/json'
  };

  try {
    const { startDate, endDate, debug } = req.query;

    // Debug mode: list all calendars to find the correct ID
    if (debug === '1') {
      console.log('[calendar-slots] DEBUG: listing calendars');
      const listRes = await fetch('https://services.leadconnectorhq.com/calendars/', { headers });
      const listText = await listRes.text();
      console.log('[calendar-slots] Calendars response:', listRes.status, listText);
      return res.status(listRes.status).json({ raw: listText });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required (YYYY-MM-DD)' });
    }

    const calendarId = '7FMLgGMP7b3DmEQeq684';
    const timezone = 'Europe/Rome';

    // Convert YYYY-MM-DD to epoch milliseconds as required by GHL API
    const startMs = new Date(startDate + 'T00:00:00').getTime();
    const endMs = new Date(endDate + 'T23:59:59').getTime();
    const url = `https://services.leadconnectorhq.com/calendars/${calendarId}/free-slots?startDate=${startMs}&endDate=${endMs}&timezone=${encodeURIComponent(timezone)}`;

    console.log('[calendar-slots] Fetching:', url);

    let response = await fetch(url, { headers });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[calendar-slots] GHL error:', response.status, errText);

      // If failed, try to list calendars to find the correct ID
      console.log('[calendar-slots] Trying to list calendars to find correct ID...');
      const listRes = await fetch('https://services.leadconnectorhq.com/calendars/', { headers });
      const listText = await listRes.text();
      console.log('[calendar-slots] Calendars list:', listRes.status, listText);

      return res.status(response.status).json({ error: 'GHL API error', status: response.status, details: errText, calendars_debug: listText });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
