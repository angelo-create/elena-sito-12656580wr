module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    var webhookUrl = process.env.GHL_SOLDOUT_WEBHOOK;
    if (!webhookUrl) {
        return res.status(500).json({ error: 'Webhook not configured' });
    }

    var { name, email, phone } = req.body || {};
    if (!name || !email || !phone) {
        return res.status(400).json({ error: 'Nome, email e telefono sono obbligatori' });
    }

    try {
        var response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, email: email, phone: phone })
        });

        if (!response.ok) {
            throw new Error('Webhook responded with ' + response.status);
        }

        return res.status(200).json({ ok: true });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to send lead' });
    }
};
