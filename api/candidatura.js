// Labels for email formatting (Italian question text)
const questionLabels = {
  full_name: 'Nome e Cognome',
  email: 'Email',
  phone: 'Telefono',
  age: 'Età',
  city: 'Città',
  know_elena: 'Da quanto tempo conosci Elena e/o segui XFit Academy?',
  work_fitness: 'Hai già lavorato nel settore fitness/salute?',
  work_description: 'Descrizione del lavoro',
  certifications: 'Hai già certificazioni?',
  certifications_detail: 'Quali certificazioni?',
  motivation: 'Cosa ti ha spinto a candidarti a questo corso?',
  why_female_fitness: 'Perché vuoi specializzarti nell\'allenamento femminile?',
  relationship_fitness: 'Come descriveresti il tuo rapporto con il fitness femminile oggi?',
  after_certification: 'Cosa vorresti fare dopo la certificazione?',
  diploma_importance: 'Quanto è importante per te il Diploma OPES/CONI?',
  team_interest: 'Ti interessa entrare nel team XFit Academy?',
  payment_preference: 'Quale modalità di pagamento stai valutando?',
  about_you: 'Raccontami qualcosa di te...'
};

async function sendBackupEmail(body) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn('[candidatura] RESEND_API_KEY not configured, skipping backup email');
    return;
  }

  const rows = Object.entries(questionLabels)
    .filter(([key]) => body[key] !== undefined && body[key] !== '')
    .map(([key, label]) => `<tr><td style="padding:8px 12px;border:1px solid #e0e0e0;font-weight:600;background:#f9f9f9;width:35%;vertical-align:top">${label}</td><td style="padding:8px 12px;border:1px solid #e0e0e0">${String(body[key]).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td></tr>`)
    .join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#b8860b">Nuova Candidatura Coach</h2>
      <p>Una nuova candidatura è stata ricevuta dal percorso coach.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">${rows}</table>
      <p style="color:#888;font-size:12px">Email generata automaticamente dal sito elenagiorgianni.com</p>
    </div>`;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Elena Giorgianni <noreply@elenagiorgianni.com>',
      to: ['info.xfitacademy@gmail.com'],
      subject: `Nuova Candidatura Coach: ${body.full_name || 'Sconosciuto'}`,
      html
    })
  });

  if (!emailRes.ok) {
    const errText = await emailRes.text();
    console.error('[candidatura] Resend email failed:', emailRes.status, errText);
  } else {
    console.log('[candidatura] Backup email sent for:', body.full_name);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const locationId = 'whfxv9CQCrjAmBTZJwMw';
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json'
  };

  // Map form field names to GHL custom field IDs (folder: Candidatura Coach)
  const fieldMap = {
    age:                  'ilbdooo2j4bu6dwA8J5D',
    city:                 'EF6deo23wjaUYzD7LZXQ',
    know_elena:           'd4aCVMKre4k3Tszuh1lI',
    work_fitness:         'b7xjJhUrplIqEfInPsOt',
    work_description:     '06E3BRqA5ats1ma3An15',
    certifications:       'FYKzSnkYjZfp1MTB5nou',
    certifications_detail:'j5RFOxYBSzFmR3YlPmev',
    motivation:           'b71FLFxmkDDuiu1Cdw4m',
    why_female_fitness:   'POUlESaN7C0ATZnurSsp',
    relationship_fitness: '2nj0sKDTApsYBLchcD4c',
    after_certification:  'jjKJYx5Z79kqDAW3xPgP',
    diploma_importance:   'ITZJL2OMndWm0RDlgnHJ',
    team_interest:        '4k46MnpKBMfiiVOkEp89',
    payment_preference:   'czpOlOUPdp8gNizakdSi',
    about_you:            'VUbUhhCxuIi6oSg12lRq'
  };

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }
    if (!body) return res.status(400).json({ error: 'Missing body' });

    const { full_name, email, phone } = body;
    if (!full_name || !email) {
      return res.status(400).json({ error: 'full_name and email are required' });
    }

    // Build custom fields array
    const customFields = [];
    for (const [formKey, ghlId] of Object.entries(fieldMap)) {
      if (body[formKey] !== undefined && body[formKey] !== '') {
        customFields.push({ id: ghlId, value: String(body[formKey]) });
      }
    }

    console.log('[candidatura] Upserting contact:', full_name, email, '| custom fields:', customFields.length);

    // Upsert contact with custom fields
    const upsertRes = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: full_name,
        email: email,
        phone: phone || '',
        locationId: locationId,
        customFields: customFields,
        tags: ['candidatura-coach']
      })
    });

    const upsertText = await upsertRes.text();
    console.log('[candidatura] Upsert response:', upsertRes.status, upsertText);

    if (!upsertRes.ok) {
      return res.status(upsertRes.status).json({ error: 'GHL upsert failed', details: upsertText });
    }

    const upsertData = JSON.parse(upsertText);
    const contactId = upsertData.contact ? upsertData.contact.id : null;

    // Diagnostic: compare fields sent vs saved
    if (upsertData.contact && upsertData.contact.customFields) {
      const savedFields = upsertData.contact.customFields;
      const savedIds = savedFields.map(f => f.id);
      const sentIds = customFields.map(f => f.id);
      const missing = sentIds.filter(id => !savedIds.includes(id));
      const reverseMap = Object.fromEntries(Object.entries(fieldMap).map(([k, v]) => [v, k]));
      console.log(`[candidatura] Fields sent: ${sentIds.length} | saved: ${savedIds.length} | missing: ${missing.length}`);
      if (missing.length > 0) {
        missing.forEach(id => console.warn(`[candidatura] Missing field: ${reverseMap[id] || 'unknown'} (${id})`));
      }
    }

    // Send backup email with all responses (fire-and-forget)
    sendBackupEmail(body).catch(err => console.error('[candidatura] Backup email error:', err.message));

    // Also fire the webhook for workflow automation
    const webhookUrl = process.env.GHL_CANDIDATURA_WEBHOOK;
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, contactId })
      }).catch(err => console.error('[candidatura] Webhook error:', err.message));
    }

    return res.status(200).json({ success: true, contactId });
  } catch (err) {
    console.error('[candidatura] Error:', err.message);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
