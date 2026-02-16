module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // AppPago - 24 rate mensili
  // Stub: sara' implementato quando arrivano le credenziali merchant
  //
  // Environment variables necessarie:
  // - APPPAGO_API_KEY
  // - APPPAGO_MERCHANT_ID
  // - APPPAGO_API_URL

  res.status(503).json({
    error: 'Pagamento rateale AppPago non ancora disponibile.',
    message: 'Il pagamento in 24 rate con AppPago sara\u0300 disponibile a breve. Contattaci per maggiori informazioni.',
    available: false
  });
};
