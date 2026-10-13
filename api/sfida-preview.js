'use strict';
const {createService,PreviewError} = require('./_lib/sfida-preview');
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({error:'Metodo non consentito.'}); }
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return res.status(415).json({error:'Formato richiesta non valido.'});
  // JSON + same-origin only; no permissive CORS for a checkout endpoint.
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({error:'Origine non consentita.'}); }
    catch { return res.status(403).json({error:'Origine non valida.'}); }
  }
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || JSON.stringify(req.body).length > 16000) throw new PreviewError('Richiesta non valida.');
    return res.status(200).json(await createService(process.env).run(req.body.action,req.body));
  } catch (error) {
    if (!(error instanceof PreviewError)) console.error('sfida-preview failure', {type:error.type || error.name});
    return res.status(error.status || 500).json({error:error instanceof PreviewError ? error.message : 'Non siamo riusciti a completare la prova. Riprova tra poco.'});
  }
};
