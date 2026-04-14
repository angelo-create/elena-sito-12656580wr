module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const calendarId = '7FMLgGMP7b3DmEQeq684';
  const apiKey = process.env.GHL_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required (YYYY-MM-DD)' });
    }

    const timezone = 'Europe/Rome';
    const url = `https://services.leadconnectorhq.com/calendars/${calendarId}/free-slots?startDate=${startDate}&endDate=${endDate}&timezone=${encodeURIComponent(timezone)}`;

    console.log('[calendar-slots] Fetching:', url);
    console.log('[calendar-slots] API key prefix:', apiKey ? apiKey.substring(0, 6) : 'none');

    // Try multiple auth approaches
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Version': '2021-04-15',
      'Accept': 'application/json'
    };

    console.log('[calendar-slots] Attempt 1: Bearer + Version 2021-04-15');
    let response = await fetch(url, { headers });

    // If 401, try with Version 2021-07-28
    if (response.status === 401) {
      console.log('[calendar-slots] 401, trying Version 2021-07-28');
      headers['Version'] = '2021-07-28';
      response = await fetch(url, { headers });
    }

    // If still 401, try without Bearer prefix
    if (response.status === 401) {
      console.log('[calendar-slots] Still 401, trying without Bearer prefix');
      headers['Authorization'] = apiKey;
      response = await fetch(url, { headers });
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error('[calendar-slots] GHL error:', response.status, errText);
      return res.status(response.status).json({ error: 'GHL API error', status: response.status, details: errText });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
