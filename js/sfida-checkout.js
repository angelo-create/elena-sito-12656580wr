(() => {
  'use strict';
  const preview = window.SfidaPreview;
  if (!preview) return;
  const $ = selector => document.querySelector(selector);
  const form = $('#checkout-form');
  const submit = $('#checkout-submit');
  const decline = $('#simulate-decline');
  const consent = $('#measurement-consent');
  const error = $('#checkout-error');
  let config = null, busy = false, fingerprint = null, requestId = null, ticket = null;
  let reservationExpired = false, reservationDeadline = null;
  const fields = [$('#customer-email'), $('#customer-name'), $('#preview-ack')];
  const errorIds = ['email-error', 'name-error', 'ack-error'];
  const messages = ['Inserisci un indirizzo email valido, ad esempio nome@esempio.it.', 'Inserisci il tuo nome e cognome.', 'Conferma che si tratta di una prova senza addebiti.'];
  const mobile = matchMedia('(max-width: 800px)');
  // Prototype of the five-minute price reservation. The live payment must enforce its deadline server-side.
  // Persist the deadline within this tab so a reload does not reset the demonstration.
  const timer = $('.urgency-timer');
  if (timer?.dataset.timerMode === 'demo') {
    let deadline = preview.read('price-reservation-deadline');
    if (!Number.isFinite(deadline)) {
      deadline = Date.now() + 5 * 60 * 1000;
      preview.write('price-reservation-deadline', deadline);
    }
    reservationDeadline = deadline;
    function renderTimer() {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      $('#timer-minutes').textContent = String(Math.floor(remaining / 60)).padStart(2, '0');
      $('#timer-seconds').textContent = String(remaining % 60).padStart(2, '0');
      timer.classList.toggle('expired', remaining === 0);
      if (!remaining) {
        reservationExpired = true;
        $('#timer-title').textContent = 'Il tempo per il prezzo riservato è scaduto.';
        $('#timer-note').textContent = 'La prenotazione di prova è terminata.';
        $('#mobile-bar').hidden = true;
        if (!busy) setBusy(false);
      }
      return remaining;
    }
    if (renderTimer()) {
      const clock = setInterval(() => { if (!renderTimer()) clearInterval(clock); }, 1000);
    }
  }
  if (mobile.matches) $('.inclusions').open = false;
  consent.checked = preview.read('consent', true) === true;
  consent.addEventListener('change', () => { preview.prepare(consent.checked); });

  // Only campaign labels travel to the landing. Customer information never enters URLs.
  const params = new URLSearchParams(location.search), campaign = new URLSearchParams();
  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','campaign_id','adset_id','ad_id'].forEach(key => {
    const value = params.get(key);
    if (value && !/[@<>\r\n]|https?:/i.test(value)) campaign.set(key, value.slice(0, 100));
  });
  if (campaign.size) document.querySelectorAll('a[href="/sfida-7-giorni"],a[href="/sfida-checkout-originale"]').forEach(link => {
    link.search = campaign.toString();
  });

  function validate(index) {
    const input = fields[index];
    const valid = index === 2 ? input.checked : index === 0
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim()) && input.validity.valid
      : input.value.trim().length > 0 && input.value.length <= 100;
    input.setAttribute('aria-invalid', String(!valid));
    const message = document.getElementById(errorIds[index]);
    message.hidden = valid;
    message.textContent = valid ? '' : messages[index];
    return valid;
  }
  fields.forEach((input, index) => {
    input.addEventListener('blur', () => { if (input.value || input.getAttribute('aria-invalid') === 'true') validate(index); });
    input.addEventListener(index === 2 ? 'change' : 'input', () => {
      if (input.getAttribute('aria-invalid') === 'true') validate(index);
    });
  });
  function setBusy(value) {
    busy = value;
    form.setAttribute('aria-busy', String(value));
    fields.concat(consent).forEach(input => { input.disabled = value; });
    submit.disabled = value || !config || reservationExpired;
    decline.disabled = value || !config || config.mode !== 'simulation' || reservationExpired;
    submit.firstElementChild.textContent = value ? 'Conferma in corso…' : reservationExpired ? 'Prezzo riservato scaduto' : 'Completa la prova · 37,00 €';
    $('#payment-status').textContent = value ? 'Attendi la conferma. La richiesta è in corso.' : reservationExpired ? 'I 5 minuti sono terminati. La prova di acquisto non è più disponibile.' : 'Nessuna carta reale richiesta. Nessun importo addebitato.';
  }
  function showError(message) {
    error.textContent = message;
    error.hidden = false;
    error.focus();
  }
  async function loadConfig() {
    config = null;
    setBusy(false);
    $('#config-retry').hidden = true;
    try {
      const result = await preview.api('config');
      if (result.live !== false || result.amount !== 3700 || result.currency !== 'EUR' || !['simulation','stripe-test'].includes(result.mode)) throw new Error('La configurazione del pagamento di prova non corrisponde a questa offerta.');
      config = result;
      $('#payment-mode').textContent = result.mode === 'simulation'
        ? 'Pagamento simulato già predisposto. Non inserire dati di carte reali.'
        : 'Proseguirai su Stripe in modalità test. Usa esclusivamente una carta di prova.';
      $('#demo-card').hidden = result.mode !== 'simulation';
      decline.hidden = result.mode !== 'simulation';
      if (!params.has('cancelled')) error.hidden = true;
    } catch {
      $('#payment-mode').textContent = 'Il pagamento di prova non è disponibile. I dati inseriti rimangono nel modulo: riprova tra poco.';
      $('#config-retry').hidden = false;
    } finally { setBusy(false); }
  }
  $('#config-retry').addEventListener('click', loadConfig);
  if (params.has('cancelled')) showError('Pagamento di prova annullato. Puoi compilare il modulo e riprovare.');

  async function pay(outcome) {
    if (busy || !config) return;
    if (reservationExpired || (reservationDeadline !== null && Date.now() >= reservationDeadline)) {
      reservationExpired = true; setBusy(false); return;
    }
    error.hidden = true;
    const invalid = fields.map((_, i) => validate(i)).findIndex(valid => !valid);
    if (invalid !== -1) { fields[invalid].focus(); return; }
    if (!preview.write('storage-test', true)) { showError('Abilita l’archivio di sessione del browser per continuare la prova.'); return; }
    setBusy(true);
    const attempt = crypto.randomUUID();
    try {
      const attribution = await preview.prepare(consent.checked);
      if (reservationDeadline !== null && Date.now() >= reservationDeadline) {
        reservationExpired = true;
        throw new Error('Il tempo per il prezzo riservato è scaduto.');
      }
      const payload = {name:fields[1].value.trim(), email:fields[0].value.trim(), terms:fields[2].checked, ...attribution};
      const nextFingerprint = JSON.stringify(payload);
      if (fingerprint !== nextFingerprint) {
        fingerprint = nextFingerprint;
        requestId = crypto.randomUUID();
        ticket = null;
      }
      preview.record('CheckoutSubmit', 'submit_' + attempt, {variant:'checkout_cro_v1', value:37, currency:'EUR'});
      if (!ticket) {
        const created = await preview.api('create', {...payload, requestId});
        if (!preview.write('ticket', created.ticket) || !preview.write('receipt', null)) throw new Error('Impossibile salvare la sessione di prova.');
        ticket = created.ticket;
        if (created.url) { location.assign(created.url); return; }
      }
      const result = await preview.api('complete', {ticket, outcome});
      if (!preview.write('receipt', result.receipt)) throw new Error('Impossibile salvare la conferma di prova.');
      location.assign('/sfida-esito');
    } catch (failure) {
      // Never place email, name, payment details or raw API errors in analytics.
      preview.record('CheckoutError', 'error_' + attempt, {variant:'checkout_cro_v1', reason:failure.name === 'TimeoutError' ? 'timeout' : 'payment_or_network'});
      showError(failure.name === 'TimeoutError'
        ? 'La risposta sta impiegando troppo tempo. I dati sono ancora qui: puoi riprovare.'
        : failure instanceof TypeError ? 'Connessione interrotta. I dati sono ancora qui: controlla la rete e riprova.' : failure.message);
    } finally { setBusy(false); }
  }
  form.addEventListener('submit', event => { event.preventDefault(); pay('success'); });
  decline.addEventListener('click', () => pay('declined'));

  let mainButtonVisible = false;
  function updateBar() {
    const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    $('#mobile-bar').hidden = !mobile.matches || mainButtonVisible || editing || reservationExpired;
  }
  new IntersectionObserver(entries => { mainButtonVisible = entries[0].isIntersecting; updateBar(); }, {threshold:0}).observe(submit);
  document.addEventListener('focusin', updateBar);
  document.addEventListener('focusout', () => setTimeout(updateBar, 0));
  mobile.addEventListener('change', updateBar);
  $('#go-to-payment').addEventListener('click', () => {
    const target = fields.find(input => input.type === 'checkbox' ? !input.checked : !input.value.trim()) || submit;
    target.focus({preventScroll:true});
    target.scrollIntoView({block:'center', behavior:matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth'});
  });
  loadConfig();
})();
