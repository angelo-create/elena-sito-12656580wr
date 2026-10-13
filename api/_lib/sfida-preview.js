'use strict';
// Deliberately test-only. Never reads the existing production Stripe/Meta/GHL credentials.
const crypto = require('node:crypto');
const PRODUCT = 'sfida-primo-passo-37-preview';
const AMOUNT = 3700;
const DAY = 86400000;
const ATTR_KEYS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','campaign_id','adset_id','ad_id'];
class PreviewError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
function sign(data, secret) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}
function verify(token, secret, kind, now) {
  if (typeof token !== 'string' || token.length > 12000) throw new PreviewError('Sessione non valida. Ricomincia dal checkout.');
  const [payload, signature, extra] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(payload || '').digest();
  let actual; try { actual = Buffer.from(signature || '', 'base64url'); } catch { throw new PreviewError('Sessione non valida.'); }
  if (extra || actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw new PreviewError('Sessione non valida.');
  let data; try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw new PreviewError('Sessione non valida.'); }
  if (data.kind !== kind || !Number.isFinite(data.expires) || data.expires < now) throw new PreviewError('Sessione scaduta. Ricomincia dal checkout.');
  return data;
}
function attribution(input) {
  const out = {};
  for (const key of ATTR_KEYS) {
    const value = input && input[key];
    // Campaign labels/IDs only: discard email-like values and URLs, never copy arbitrary URL params.
    if (typeof value === 'string' && !/[@<>\r\n]|https?:/i.test(value)) out[key] = value.replace(/[^\p{L}\p{N} _.,:|\-]/gu, '').slice(0, 30);
  }
  return out;
}
function purchasePayload(order) {
  return { event_name:'Purchase', event_id:'sfida37_' + order.id, event_time:order.paidAt,
    action_source:'website', custom_data:{currency:'EUR', value:37, content_ids:[PRODUCT], content_type:'product', order_id:order.id} };
}
function createService(env, options = {}) {
  const now = options.now || Date.now;
  const secret = env.SFIDA_PREVIEW_SECRET;
  const mode = env.SFIDA_PREVIEW_MODE || 'simulation';
  const enabled = env.VERCEL_ENV !== 'production' && typeof secret === 'string' && secret.length >= 32;
  let stripe;
  function client() {
    const key = env.SFIDA_STRIPE_TEST_SECRET_KEY || '';
    if (!/^sk_test_/.test(key)) throw new PreviewError('Stripe test non configurato. Nessun pagamento è stato creato.', 503);
    if (!stripe) stripe = options.stripe || require('stripe')(key);
    return stripe;
  }
  async function run(action, input = {}) {
    if (!enabled) throw new PreviewError('Checkout di anteprima non attivo.', 503);
    if (!['simulation','stripe-test'].includes(mode)) throw new PreviewError('Modalità di anteprima non valida.', 503);
    if (action === 'config') return {mode, amount:AMOUNT, currency:'EUR', product:PRODUCT, live:false};
    if (action === 'visit') {
      if (input.consent !== true) return {visit:null};
      let visit;
      try { visit = verify(input.visit,secret,'visit',now()); } catch { /* Start a new observation; never trust a client timestamp. */ }
      if (!visit) visit = {kind:'visit', id:crypto.randomUUID(), firstSeen:now(), first:attribution(input.attribution), expires:now()+90*DAY};
      return {visit:sign(visit,secret), firstSeen:visit.firstSeen, eligibleAfter:visit.firstSeen+10*DAY};
    }
    if (action === 'create') {
      if (input.terms !== true) throw new PreviewError('Conferma di aver letto le condizioni.');
      if (typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new PreviewError('Inserisci un indirizzo email valido.');
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100) throw new PreviewError('Inserisci il tuo nome.');
      if (typeof input.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.requestId)) throw new PreviewError('Richiesta non valida. Ricarica la pagina.');
      let visit = null;
      if (input.consent === true) {
        try { visit = verify(input.visit,secret,'visit',now()); } catch { /* Missing observation is explicitly unknown. */ }
      }
      const order = {kind:'checkout', id:input.requestId, product:PRODUCT, amount:AMOUNT, currency:'EUR', mode,
        consent:input.consent === true, firstSeen:visit?.firstSeen || null, first:visit?.first || {},
        last:input.consent === true ? attribution(input.attribution) : {}, expires:now()+DAY};
      let url = null;
      if (mode === 'stripe-test') {
        const base = env.SFIDA_PREVIEW_BASE_URL;
        if (!base || !/^https:\/\/[^/?#]+$/.test(base)) throw new PreviewError('URL di anteprima Stripe non configurato.',503);
        const session = await client().checkout.sessions.create({
          mode:'payment', payment_method_types:['card'], customer_email:input.email.trim(),
          client_reference_id:order.id,
          line_items:[{price_data:{currency:'eur',unit_amount:AMOUNT,product_data:{name:'Il Primo Passo · Sfida 7 giorni (TEST)'}},quantity:1}],
          metadata:{product:PRODUCT, order_id:order.id, marketing_consent:String(order.consent), first_observed_at:order.firstSeen ? String(order.firstSeen) : '',
            first_touch:JSON.stringify(order.first), last_touch:JSON.stringify(order.last)},
          payment_intent_data:{metadata:{product:PRODUCT,order_id:order.id}},
          success_url:base+'/sfida-esito?session_id={CHECKOUT_SESSION_ID}', cancel_url:base+'/sfida-checkout?cancelled=1'
        },{idempotencyKey:'sfida37-preview-'+order.id});
        if (session.livemode !== false || !session.id.startsWith('cs_test_') || !session.url?.startsWith('https://checkout.stripe.com/')) throw new PreviewError('Sessione di test non valida.',502);
        order.stripeSession = session.id; url = session.url;
      }
      return {ticket:sign(order,secret), orderId:order.id, mode, url};
    }
    if (action === 'complete') {
      const order = verify(input.ticket,secret,'checkout',now());
      if (mode !== 'simulation' || order.mode !== 'simulation') throw new PreviewError('Questa azione è disponibile soltanto nel simulatore.');
      if (input.outcome !== 'success') throw new PreviewError('Pagamento di prova rifiutato. Puoi riprovare.',402);
      return {receipt:sign({...order,kind:'receipt',paidAt:Math.floor(now()/1000),status:'paid'},secret)};
    }
    if (action === 'receipt') {
      let order;
      if (mode === 'stripe-test') {
        order = verify(input.ticket,secret,'checkout',now());
        if (order.mode !== 'stripe-test' || !order.stripeSession) throw new PreviewError('Sessione di test non valida.');
        const session = await client().checkout.sessions.retrieve(order.stripeSession);
        if (session.livemode !== false || session.payment_status !== 'paid' || session.status !== 'complete') throw new PreviewError('Il pagamento non è ancora confermato. Riprova tra poco.',409);
        if (session.amount_total !== AMOUNT || session.currency !== 'eur' || session.metadata?.product !== PRODUCT || session.client_reference_id !== order.id) throw new PreviewError('Il riepilogo non corrisponde a questa offerta.',409);
        order = {...order,status:'paid',paidAt:session.created};
      } else order = verify(input.receipt,secret,'receipt',now());
      if (order.amount !== AMOUNT || order.product !== PRODUCT || order.status !== 'paid') throw new PreviewError('Ordine non valido.');
      return {mode, orderId:order.id, amount:AMOUNT,currency:'EUR',status:'paid', accessActivated:false,
        firstSeen:order.firstSeen, eligibleAfter:order.firstSeen ? order.firstSeen+10*DAY : null,
        attribution:order.consent ? {first:order.first,last:order.last} : null,
        // Contract preview only. No calls to advertising platforms or fulfillment systems.
        tracking:order.consent ? {browser:{event:'Purchase',eventID:'sfida37_'+order.id,value:37,currency:'EUR'},server:purchasePayload(order),sent:false} : null};
    }
    throw new PreviewError('Azione non disponibile.',404);
  }
  return {run};
}
module.exports = {createService,PreviewError,attribution,sign,verify,PRODUCT,AMOUNT};
