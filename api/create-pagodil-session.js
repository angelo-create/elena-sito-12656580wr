module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // PagoDil (Cofidis) - 12 rate mensili
  // Stub: sara' implementato quando arrivano le credenziali merchant
  //
  // Environment variables necessarie:
  // - PAGODIL_MERCHANT_ID
  // - PAGODIL_API_KEY
  // - PAGODIL_API_URL

  res.status(503).json({
    error: 'Pagamento rateale PagoDil non ancora disponibile.',
    message: 'Il pagamento in 12 rate con PagoDil sara\u0300 disponibile a breve. Contattaci per maggiori informazioni.',
    available: false
  });
};
