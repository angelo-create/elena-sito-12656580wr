// /api/stripe-config — espone la Stripe publishable key al frontend.
//
// La publishable key e' pubblica per design (compare nel JS client),
// ma la teniamo in env vars invece di hardcodarla cosi' la chiave puo'
// essere ruotata senza redeploy del codice.
//
// Env richieste:
//   STRIPE_PUBLISHABLE_KEY  (pk_live_... oppure pk_test_...)

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const pk = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!pk) {
    return res.status(500).json({ error: 'Stripe non configurato' });
  }
  return res.status(200).json({ publishableKey: pk });
};
