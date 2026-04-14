module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const calendarId = '7FMLgGMP7b3DmEQeq684';
  const locationId = 'whfxv9CQCrjAmBTZJwMw';
  const apiKey = process.env.GHL_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Version': '2021-04-15',
    'Content-Type': 'application/json'
  };

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }

    const { selectedSlot, name, email, phone } = body || {};

    if (!selectedSlot || !name || !email) {
      return res.status(400).json({ error: 'selectedSlot, name and email are required' });
    }

    console.log('[calendar-book] Booking for:', name, email, selectedSlot);

    // Step 1: Upsert contact — create or update if exists
    let contactId = null;

    // Try to create
    const createRes = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: name,
        email: email,
        phone: phone || '',
        locationId: locationId
      })
    });
    const createText = await createRes.text();
    console.log('[calendar-book] Upsert contact:', createRes.status, createText);

    try {
      const data = JSON.parse(createText);
      contactId = data.contact ? data.contact.id : (data.id || null);
    } catch(e) {}

    // Fallback: search duplicate by email
    if (!contactId) {
      console.log('[calendar-book] Upsert failed, searching by email...');
      const searchRes = await fetch('https://services.leadconnectorhq.com/contacts/search/duplicate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: email, locationId: locationId })
      });
      const searchText = await searchRes.text();
      console.log('[calendar-book] Search by email:', searchRes.status, searchText);

      try {
        const data = JSON.parse(searchText);
        contactId = data.contact ? data.contact.id : null;
      } catch(e) {}
    }

    // Fallback: search duplicate by phone
    if (!contactId && phone) {
      console.log('[calendar-book] Not found by email, searching by phone...');
      const phoneRes = await fetch('https://services.leadconnectorhq.com/contacts/search/duplicate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone: phone, locationId: locationId })
      });
      const phoneText = await phoneRes.text();
      console.log('[calendar-book] Search by phone:', phoneRes.status, phoneText);

      try {
        const data = JSON.parse(phoneText);
        contactId = data.contact ? data.contact.id : null;
        // Update the existing contact with the new email
        if (contactId) {
          console.log('[calendar-book] Found by phone, updating contact with email...');
          await fetch('https://services.leadconnectorhq.com/contacts/' + contactId, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ name: name, email: email, phone: phone })
          });
        }
      } catch(e) {}
    }

    if (!contactId) {
      console.error('[calendar-book] No contactId found');
      return res.status(500).json({ error: 'Could not create or find contact' });
    }

    console.log('[calendar-book] contactId:', contactId);

    // Step 2: Create appointment
    const appointmentBody = {
      calendarId: calendarId,
      locationId: locationId,
      contactId: contactId,
      startTime: selectedSlot,
      endTime: new Date(new Date(selectedSlot).getTime() + 45 * 60000).toISOString(),
      title: 'Chiamata Conoscitiva - Coach Fitness Femminile',
      appointmentStatus: 'confirmed',
      selectedTimezone: 'Europe/Rome'
    };

    console.log('[calendar-book] Creating appointment...');

    const appointmentRes = await fetch('https://services.leadconnectorhq.com/calendars/events/appointments', {
      method: 'POST',
      headers,
      body: JSON.stringify(appointmentBody)
    });

    const appointmentText = await appointmentRes.text();
    console.log('[calendar-book] Appointment:', appointmentRes.status, appointmentText);

    if (!appointmentRes.ok) {
      return res.status(appointmentRes.status).json({ error: 'Booking failed', details: appointmentText });
    }

    return res.status(200).json(JSON.parse(appointmentText));
  } catch (err) {
    console.error('[calendar-book] Error:', err.message);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
