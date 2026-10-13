#!/usr/bin/env node
'use strict';
// Isolated local server: exposes this preview only and never loads .env.vercel.local.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname,'..');
process.env.SFIDA_PREVIEW_SECRET ||= crypto.randomBytes(32).toString('hex');
process.env.SFIDA_PREVIEW_MODE ||= 'simulation';
const handler = require('../api/sfida-preview');
const port = Number(process.env.SFIDA_PREVIEW_PORT || 4173);
const types = {'.woff2':'font/woff2','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.ico':'image/x-icon'};
const allowed = new Set(['img/il-primo-passo-cover.jpg','css/sfida-home-motion.css','js/sfida-home-motion.js','img/evento-webp/EDO05134.webp','assets/sfida-home/esperienza-1.webp','assets/sfida-home/esperienza-2.webp','assets/sfida-home/esperienza-3.webp','assets/sfida-home/esperienza-4.webp','assets/sfida-home/esperienza-5.webp','assets/sfida-home/esperienza-6.webp','assets/sfida-home/testimonianza-1.webp','assets/sfida-home/testimonianza-2.webp','assets/sfida-home/testimonianza-3.webp','css/sfida-home.css','css/sfida-fonts.css','assets/sfida-funnel/poppins-400.woff2','assets/sfida-funnel/poppins-500.woff2','assets/sfida-funnel/poppins-600.woff2','assets/sfida-funnel/poppins-700.woff2','assets/sfida-funnel/poppins-800.woff2','assets/sfida-funnel/logo-primo-passo.webp','assets/sfida-funnel/prodotto-primo-passo.webp','sfida-checkout-originale.html','css/sfida-checkout.css','js/sfida-checkout.js','sfida-home-alternativa.html','sfida-carrello-alternativo.html','sfida-checkout-27.html','sfida-funnel.html','css/sfida-funnel.css','js/sfida-funnel.js','assets/sfida-funnel/carrello-sfida-7giorni-27euro-timer.js','assets/sfida-funnel/carrello-sfida-7giorni-timer.js','sfida-7-giorni.html','sfida-checkout.html','sfida-esito.html','css/sfida.css','js/sfida.js','js/sfida-originale.js','terms-and-conditions.html','assets/images/favicon-32x32.png','favicon.ico', ...['IMG_9824.webp','IMG_9822.webp','IMG_9184.webp'].map(name=>'img/elena-webp/'+name)]);
const server = http.createServer(async(req,res) => {
  res.setHeader('Cache-Control','no-store'); res.setHeader('X-Robots-Tag','noindex, nofollow'); res.setHeader('X-Content-Type-Options','nosniff');
  let pathname; try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if (pathname === '/api/sfida-preview') {
    let body = ''; let oversized = false;
    for await (const chunk of req) { body += chunk; if (body.length > 16000) { oversized = true; break; } }
    if (oversized) { res.writeHead(413).end(); return; }
    try { req.body = JSON.parse(body || '{}'); } catch { res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:'JSON non valido.'})); return; }
    res.status = code => { res.statusCode = code; return res; };
    res.json = object => { res.setHeader('Content-Type','application/json; charset=utf-8'); res.end(JSON.stringify(object)); };
    await handler(req,res); return;
  }
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405).end();return;}
  let name = pathname === '/' ? 'sfida-7-giorni.html' : pathname.slice(1);
  if (!path.extname(name)) name += '.html';
  if (!allowed.has(name)) { res.writeHead(404).end('Pagina non disponibile in questa anteprima.'); return; }
  const file = path.join(root,name);
  res.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream');
  if(req.method === 'HEAD')res.end(); else fs.createReadStream(file).pipe(res);
});
server.listen(port,'127.0.0.1',() => console.log('Sfida preview: http://localhost:'+port+'/sfida-7-giorni (test only, '+process.env.SFIDA_PREVIEW_MODE+')'));
