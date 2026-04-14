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
    // Parse body - Vercel should auto-parse JSON but let's be safe
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }

    console.log('[calendar-book] Body received:', JSON.stringify(body));

    const { selectedSlot, name, email, phone } = body || {};

    if (!selectedSlot || !name || !email) {
      console.error('[calendar-book] Missing fields:', { selectedSlot: !!selectedSlot, name: !!name, email: !!email });
      return res.status(400).json({ error: 'selectedSlot, name and email are required', received: { selectedSlot, name, email } });
    }

    // First, create or find contact
    const contactUrl = 'https://services.leadconnectorhq.com/contacts/';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Version': '2021-04-15',
      'Content-Type': 'application/json'
    };

    // Create contact
    console.log('[calendar-book] Creating contact...');
    const contactRes = await fetch(contactUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: name,
        email: email,
        phone: phone || '',
        locationId: 'whfxv9CQCrjAmBTZJwMw'
      })
    });
    const contactData = await contactRes.json();
    console.log('[calendar-book] Contact response:', contactRes.status, JSON.stringify(contactData));

    const contactId = contactData.contact ? contactData.contact.id : (contactData.id || null);

    if (!contactId) {
      // If contact already exists, search for it
      console.log('[calendar-book] No contact ID, searching...');
      const searchRes = await fetch(contactUrl + 'search/duplicate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: email, locationId: 'whfxv9CQCrjAmBTZJwMw' })
      });
      const searchData = await searchRes.json();
      console.log('[calendar-book] Search response:', searchRes.status, JSON.stringify(searchData));
      var finalContactId = searchData.contact ? searchData.contact.id : null;
    } else {
      var finalContactId = contactId;
    }

    if (!finalContactId) {
      return res.status(500).json({ error: 'Could not create or find contact', contactData });
    }

    // Create appointment
    const appointmentUrl = 'https://services.leadconnectorhq.com/calendars/events/appointments';
    const appointmentBody = {
      calendarId: calendarId,
      locationId: 'whfxv9CQCrjAmBTZJwMw',
      contactId: finalContactId,
      startTime: selectedSlot,
      endTime: new Date(new Date(selectedSlot).getTime() + 45 * 60000).toISOString(),
      title: 'Chiamata Conoscitiva - Coach Fitness Femminile',
      appointmentStatus: 'confirmed',
      selectedTimezone: 'Europe/Rome'
    };

    console.log('[calendar-book] Creating appointment:', JSON.stringify(appointmentBody));

    const appointmentRes = await fetch(appointmentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(appointmentBody)
    });

    const appointmentText = await appointmentRes.text();
    console.log('[calendar-book] Appointment response:', appointmentRes.status, appointmentText);

    if (!appointmentRes.ok) {
      return res.status(appointmentRes.status).json({ error: 'GHL appointment error', details: appointmentText });
    }

    return res.status(200).json(JSON.parse(appointmentText));
  } catch (err) {
    console.error('[calendar-book] Error:', err.message);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
