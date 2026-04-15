module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const secret = process.env.DEBUG_SECRET || 'xfit2024';
  if (req.query.key !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const locationId = 'whfxv9CQCrjAmBTZJwMw';
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GHL_API_KEY not configured' });

  // Our field map from candidatura.js
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
    const ghlRes = await fetch(`https://services.leadconnectorhq.com/locations/${locationId}/customFields`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-07-28'
      }
    });

    if (!ghlRes.ok) {
      const errText = await ghlRes.text();
      return res.status(ghlRes.status).json({ error: 'GHL API error', details: errText });
    }

    const data = await ghlRes.json();
    const ghlFields = data.customFields || [];
    const ghlFieldIds = new Set(ghlFields.map(f => f.id));

    const report = {
      total_in_map: Object.keys(fieldMap).length,
      total_in_ghl: ghlFields.length,
      valid: [],
      invalid: []
    };

    for (const [formKey, ghlId] of Object.entries(fieldMap)) {
      if (ghlFieldIds.has(ghlId)) {
        const ghlField = ghlFields.find(f => f.id === ghlId);
        report.valid.push({ formKey, ghlId, ghlName: ghlField.name, ghlType: ghlField.dataType });
      } else {
        report.invalid.push({ formKey, ghlId, reason: 'ID not found in GHL' });
      }
    }

    return res.status(200).json(report);
  } catch (err) {
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
