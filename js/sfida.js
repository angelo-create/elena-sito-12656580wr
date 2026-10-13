(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const PREFIX = 'sfida37-preview:';
  const page = document.body.dataset.page;
  const ATTR_KEYS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','campaign_id','adset_id','ad_id'];
  let consent = false, config = null, busy = false, requestId = null, fingerprint = null;
  let observing = Promise.resolve();
  function read(key, persistent = false) {
    try { return JSON.parse((persistent ? localStorage : sessionStorage).getItem(PREFIX+key) || 'null'); } catch { return null; }
  }
  function write(key, value, persistent = false) {
    try { (persistent ? localStorage : sessionStorage).setItem(PREFIX+key,JSON.stringify(value)); return true; } catch { return false; }
  }
  function remove(key,persistent = false) { try { (persistent ? localStorage : sessionStorage).removeItem(PREFIX+key); } catch {} }
  function currentAttribution() {
    const params = new URLSearchParams(location.search), found = {};
    for (const key of ATTR_KEYS) if (params.has(key)) found[key] = params.get(key);
    return found;
  }
  async function api(action, data = {}) {
    const response = await fetch('/api/sfida-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(20000)});
    let result;
    try { result = await response.json(); } catch { throw new Error('Il servizio di anteprima non è disponibile. Riprova tra poco.'); }
    if (!response.ok) throw new Error(result.error || 'Non siamo riusciti a completare la prova.');
    return result;
  }
  function renderEvents() { if ($('#event-log')) $('#event-log').textContent = JSON.stringify(read('events') || [],null,2); }
  function record(name, id, data = {}) {
    if (!consent) return;
    const events = read('events') || [];
    if (events.some(event => event.event_id === id && event.event_name === name)) return;
    events.push({event_name:name,event_id:id,event_time:Math.floor(Date.now()/1000),environment:'preview',sent_to_meta:false,...data});
    write('events',events.slice(-300)); renderEvents();
  }
  function recordPage() {
    if (!consent) return;
    const navigationId = document.documentElement.dataset.navigationId ||= crypto.randomUUID();
    record('PageView','page_'+navigationId,{path:location.pathname});
    if (page === 'landing') record('ViewContent','view_'+navigationId,{value:37,currency:'EUR',content_ids:['sfida-primo-passo-37-preview']});
    if ((page === 'checkout' && config) || page === 'funnel-checkout' || page === 'optimized-checkout') record('InitiateCheckout','checkout_'+navigationId,{value:37,currency:'EUR',variant:page === 'optimized-checkout' ? 'checkout_cro_v1' : 'original'});
  }
  async function observe() {
    if (!consent) return;
    const current = currentAttribution();
    if (Object.keys(current).length) write('last',current);
    try {
      const result = await api('visit',{consent:true,visit:read('visit',true),attribution:current});
      if (consent) write('visit',result.visit,true);
    } catch { /* Attribution is optional. A failed measurement must not block a checkout. */ }
  }
  function setConsent(yes) {
    consent = yes; write('consent',yes,true);
    if (!yes) { remove('visit',true); remove('last'); remove('events'); renderEvents(); }
    else { observing = observe(); recordPage(); }
    if ($('.consent')) $('.consent').hidden = true;
  }
  document.querySelectorAll('[data-consent]').forEach(button => button.addEventListener('click',() => setConsent(button.dataset.consent === 'yes')));
  document.querySelectorAll('[data-consent-open]').forEach(button => button.addEventListener('click',() => {
    $('.consent').hidden = false; $('.consent button').focus();
  }));
  document.querySelectorAll('[data-export]').forEach(button => button.addEventListener('click',() => {
    const blob = new Blob([JSON.stringify(read('events') || [],null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'sfida-eventi-di-prova.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }));
  const savedConsent = read('consent',true);
  consent = savedConsent === true;
  if (savedConsent === null && $('.consent')) $('.consent').hidden = false;
  if (consent) observing = observe();
  recordPage(); renderEvents();
  function showError(error) {
    const message = error.name === 'TimeoutError' ? 'La richiesta sta impiegando troppo tempo. Puoi riprovare.' : error.message;
    $('#checkout-error').textContent = message; $('#checkout-error').hidden = false;
  }
  function setBusy(value) {
    busy = value;
    ['#checkout-submit','#demo-success','#demo-fail','#demo-back'].forEach(selector => { if ($(selector)) $(selector).disabled = value; });
  }
  // Shared preview primitives for the faithful copies of the remaining funnel pages.
  window.SfidaPreview = {
    api, read, write, record,
    prepare: async function(allowMeasurement) {
      setConsent(allowMeasurement); await observing;
      return {consent, visit:consent ? read('visit',true) : null, attribution:consent ? read('last') || {} : {}};
    }
  };
  if (page === 'checkout') {
    if (new URLSearchParams(location.search).has('cancelled')) {
      $('#checkout-error').textContent = 'Pagamento annullato. Puoi riprendere la prova quando vuoi.'; $('#checkout-error').hidden = false;
    }
    api('config').then(result => {
      config = result;
      $('#checkout-mode').textContent = result.mode === 'stripe-test' ? 'Stripe in modalità test. Usa soltanto una carta di prova, ad esempio 4242 4242 4242 4242.' : 'Checkout simulato. Puoi usare un nome inventato e un’email di esempio: non inviamo messaggi e non servono dati della carta.';
      $('#checkout-submit').disabled = false; recordPage();
    }).catch(error => { $('#checkout-mode').textContent = 'Checkout momentaneamente non disponibile.'; showError(error); });
    $('#checkout-form').addEventListener('submit', async event => {
      event.preventDefault(); if (busy || !config) return;
      $('#checkout-error').hidden = true;
      if (!write('storage-test',true)) { showError(new Error('Per proseguire serve l’archivio di sessione del browser. Abilitalo e riprova.')); return; }
      remove('storage-test'); setBusy(true);
      try {
        await observing;
        const data = new FormData(event.currentTarget);
        const payload = {name:data.get('name').trim(),email:data.get('email').trim(),terms:data.get('terms') === 'on',consent,visit:consent ? read('visit',true) : null,attribution:consent ? read('last') || {} : {}};
        const nextFingerprint = JSON.stringify(payload);
        if (nextFingerprint !== fingerprint) { requestId = crypto.randomUUID(); fingerprint = nextFingerprint; }
        const result = await api('create',{...payload,requestId});
        if (!write('ticket',result.ticket)) throw new Error('Impossibile conservare la sessione di prova. Riprova con l’archivio del browser abilitato.');
        remove('receipt');
        if (result.url) { location.assign(result.url); return; }
        $('#checkout-form').hidden = true; $('#demo-panel').hidden = false; $('#demo-panel').focus();
      } catch (error) { showError(error); } finally { setBusy(false); }
    });
    async function complete(outcome) {
      if (busy) return; setBusy(true); $('#checkout-error').hidden = true;
      try {
        const result = await api('complete',{ticket:read('ticket'),outcome});
        if (!write('receipt',result.receipt)) throw new Error('Impossibile conservare il risultato. Riprova.');
        location.assign('/sfida-esito');
      } catch (error) { showError(error); } finally { setBusy(false); }
    }
    $('#demo-success').addEventListener('click',() => complete('success'));
    $('#demo-fail').addEventListener('click',() => complete('declined'));
    $('#demo-back').addEventListener('click',() => { $('#demo-panel').hidden = true; $('#checkout-form').hidden = false; $('#name').focus(); });
  }
  if (page === 'receipt') {
    // Session IDs are not proof of payment. The API retrieves the signed ticket's own session.
    if (location.search) history.replaceState(null,'',location.pathname);
    async function receipt() {
      $('#receipt-retry').hidden = true;
      try {
        const result = await api('receipt',{receipt:read('receipt'),ticket:read('ticket')});
        $('#receipt-icon').textContent = '✓';
        $('#receipt-title').textContent = 'Il tuo primo passo, provato.';
        $('#receipt-status').textContent = 'Pagamento di prova confermato per 37 €. Il percorso di acquisto è arrivato alla conferma.';
        $('#receipt-info').textContent = 'Ordine di prova: '+result.orderId;
        $('#receipt-debug').textContent = JSON.stringify(result,null,2);
        if (result.tracking) record('Purchase',result.tracking.browser.eventID,{value:37,currency:'EUR',order_id:result.orderId});
        renderEvents();
      } catch (error) {
        $('#receipt-icon').textContent = '!'; $('#receipt-title').textContent = 'Nessun acquisto confermato.';
        $('#receipt-status').textContent = error.message; $('#receipt-retry').hidden = false;
      }
    }
    $('#receipt-retry').addEventListener('click',receipt); receipt();
  }
})();
