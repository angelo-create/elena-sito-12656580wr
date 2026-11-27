'use strict';

(() => {
  if (window.s7gOfferExpired) return;
  const isBf = document.body.dataset.s7gOffer === 'bf';
  const copyBf = {
    title: 'Il Primo Passo: la Sfida dei 7 giorni di Elena Giordani', // COPY-BF
    subtitle: 'Black Friday: 7 € invece di 37 € (prezzo più basso degli ultimi 30 giorni), pagamento unico, IVA inclusa. Offerta valida fino a lunedì 30 novembre alle 23:59.', // COPY-BF
    pay: 'Paga 7 € e inizia', // COPY-BF
    expired: 'L’offerta Black Friday è terminata il 30 novembre. Se vuoi partire subito, la mia Sfida dei 7 giorni ti aspetta a 37 €.', // COPY-BF
    expiredLink: 'Torna alla pagina della sfida' // COPY-BF
  };
  // Microcopy del carrello scritto da Gemini 4 Neon il 27/11/2026 (.context/s7g-go-2026-11-27/microcopy-carrello-neon.md).
  const copy = {
    title: 'Iscriviti alla mia sfida: «Il Primo Passo»',
    subtitle: 'Lasciami i tuoi dati e conferma: 37 € IVA inclusa, pagamento unico.',
    nameLabel: 'Nome e cognome',
    namePlaceholder: 'Laura Bianchi',
    emailLabel: 'Email',
    emailPlaceholder: 'laura.bianchi@esempio.it',
    emailHint: 'A questa email ti mando subito le credenziali di accesso.',
    phoneLabel: 'Numero di telefono',
    phonePlaceholder: '+39 347 123 4567',
    phoneHint: 'Uso questo numero per assisterti su WhatsApp nei 7 giorni.',
    paymentTitle: 'Scegli come pagare',
    pay: 'Paga 37 € e inizia',
    payHint: 'Appena paghi, ti mando subito via email le credenziali per app e browser.',
    privacy: 'Pagamento sicuro e dati protetti: non condivido mai i tuoi contatti.',
    privacyLink: 'Informativa sulla privacy',
    loading: 'Caricamento dei metodi di pagamento…',
    busy: 'Sto confermando il tuo pagamento...',
    nameError: 'Manca questo dato: compilalo prima di confermare il pagamento.',
    emailError: 'Questa email non sembra valida: ricontrollala così posso mandarti le credenziali.',
    phoneError: 'Inserisci un numero di telefono valido con il suo prefisso.',
    loadError: 'Il pagamento non è disponibile in questo momento.',
    reload: 'Ricarica la pagina',
    checkoutError: 'Non siamo riusciti ad avviare il pagamento. Riprova tra poco.',
    paymentError: 'Verifica i dati di pagamento e riprova.',
    declined: 'Il pagamento non è passato: controlla i dati o prova un altro metodo.',
    redirectFailed: 'Il pagamento non è stato completato. Puoi riprovare.',
    ...(isBf ? copyBf : {})
  };

  const form = document.getElementById('checkout-form');
  const pay = document.getElementById('pay');
  const status = document.getElementById('payment-status');
  const errorMessage = document.getElementById('payment-error');
  const fields = ['name', 'email', 'phone'].map(name => form.elements.namedItem(name));
  const inclusions = document.getElementById('inclusions');
  inclusions.open = matchMedia('(min-width: 800px)').matches;
  let stripe;
  let elements;
  let busy = false;
  let ready = false;
  let attempt;

  document.querySelectorAll('[data-copy]').forEach(node => { node.textContent = copy[node.dataset.copy]; });
  if (!isBf) document.title = 'Il Primo Passo · Carrello';
  fields.forEach(input => {
    input.placeholder = copy[`${input.name}Placeholder`];
    input.addEventListener('input', () => setFieldError(input, false));
  });

  function setFieldError(input, invalid) {
    const error = document.getElementById(`${input.name}-error`);
    input.setAttribute('aria-invalid', String(invalid));
    error.hidden = !invalid;
    error.textContent = invalid ? copy[`${input.name}Error`] : '';
  }

  function validate() {
    const name = fields[0].value.trim().replace(/\s+/g, ' ');
    const rawPhone = fields[2].value.trim();
    const digits = rawPhone.replace(/\D/g, '');
    const italianPrefix = rawPhone.startsWith('+39') || rawPhone.startsWith('0039');
    const phoneLength = rawPhone.startsWith('00') ? digits.length - 2 : digits.length;
    const invalid = [
      !/^[\p{L}\p{M} .’'\-]+$/u.test(name) || name.split(' ').length < 2 ||
        !name.split(' ').every(part => /\p{L}/u.test(part)),
      !fields[1].validity.valid || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields[1].value.trim()),
      !/^\+?[\d\s().-]+$/.test(rawPhone) || phoneLength > 15 ||
        phoneLength < (italianPrefix ? 9 : rawPhone.startsWith('+') || rawPhone.startsWith('00') ? 8 : 7)
    ];
    fields.forEach((input, index) => setFieldError(input, invalid[index]));
    const first = fields[invalid.indexOf(true)];
    if (first) first.focus();
    return !first;
  }

  function showError(message, focus = true) {
    errorMessage.textContent = message;
    errorMessage.hidden = !message;
    if (message && focus) errorMessage.focus();
  }

  function stripeError(error) {
    if (error.code === 'card_declined') return copy.declined;
    return ['card_error', 'validation_error'].includes(error.type) && error.message
      ? error.message : copy.paymentError;
  }

  async function setup() {
    try {
      const response = await fetch('/api/stripe-config', { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      const { publishableKey } = await response.json();
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      stripe = window.Stripe(publishableKey, { locale: 'it' });
      elements = stripe.elements({
        mode: 'payment',
        amount: isBf ? 700 : 3700,
        currency: 'eur',
        appearance: { variables: { colorPrimary: '#c01868', fontSizeBase: '16px', borderRadius: '10px' } }
      });
      const payment = elements.create('payment', {
        fields: { billingDetails: { name: 'never', email: 'never', phone: 'never' } },
        layout: 'accordion'
      });
      payment.on('ready', () => {
        ready = true;
        pay.disabled = busy;
        status.hidden = true;
      });
      payment.on('loaderror', unavailable);
      payment.mount('#payment-element');
    } catch {
      unavailable();
    }
  }

  function unavailable() {
    ready = false;
    pay.disabled = true;
    status.textContent = copy.loadError + ' ';
    const reload = document.createElement('a');
    reload.href = location.href;
    reload.textContent = copy.reload;
    status.append(reload);
    status.hidden = false;
  }

  function cookie(name) {
    return document.cookie.split('; ').find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
  }

  function prepareAttempt(details) {
    const fingerprint = JSON.stringify(details);
    if (fingerprint === attempt?.fingerprint) return attempt;
    const attribution = window.getAttribution();
    const current = new URLSearchParams(location.search);
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'msclkid']) {
      if (current.has(key)) attribution[key] = current.get(key);
    }
    const fbp = cookie('_fbp');
    const fbclid = attribution.fbclid;
    const savedFbc = cookie('_fbc');
    const fbc = fbclid && !savedFbc.endsWith(`.${fbclid}`) ? `fb.1.${Date.now()}.${fbclid}` : savedFbc;
    attempt = {
      fingerprint,
      payload: {
        ...attribution, ...details, fbp, fbc, event_id: `s7g_${crypto.randomUUID()}`,
        ...(isBf ? { offer: 'bf' } : {})
      }
    };
    return attempt;
  }

  function setBusy(value) {
    busy = value;
    pay.disabled = value || !ready;
    pay.textContent = value ? copy.busy : copy.pay;
    form.setAttribute('aria-busy', String(value));
    fields.forEach(input => { input.readOnly = value; });
  }

  function orderUrl() {
    const url = new URL('/riepilogo-ordine', location.origin);
    url.search = location.search;
    for (const key of ['pagamento', 'payment_intent', 'payment_intent_client_secret', 'redirect_status']) {
      url.searchParams.delete(key);
    }
    return url;
  }

  function showOrder(intent) {
    if (!['succeeded', 'processing', 'requires_capture'].includes(intent?.status)) return false;
    const url = orderUrl();
    url.searchParams.set('payment_intent', intent.id);
    location.assign(url);
    return true;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !ready) return;
    showError('');
    if (!validate()) return;
    const details = Object.fromEntries(fields.map(input => [input.name, input.value.trim()]));
    setBusy(true);
    let navigating = false;
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        showError(stripeError(submitError));
        return;
      }

      const current = prepareAttempt(details);
      const { payload } = current;
      if (!current.secret) {
        window.s7gTrackOnce('InitiateCheckout', payload.event_id);
        const response = await fetch('/api/s7g-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000)
        });
        if (response.status === 410 && isBf) {
          ready = false;
          showError(copyBf.expired + ' ', false);
          const link = document.createElement('a');
          link.href = '/s7g' + location.search;
          link.textContent = copyBf.expiredLink;
          errorMessage.append(link);
          errorMessage.focus();
          return;
        }
        const result = await response.json();
        if (result.fields) {
          for (const input of fields) setFieldError(input, Boolean(result.fields[input.name]));
          fields.find(input => result.fields[input.name])?.focus();
          return;
        }
        if (!response.ok || !result.client_secret) throw new Error();
        current.secret = result.client_secret;
      } else {
        const previous = await stripe.retrievePaymentIntent(current.secret);
        if (showOrder(previous.paymentIntent)) {
          navigating = true;
          return;
        }
        if (previous.paymentIntent?.status === 'canceled') {
          attempt = null;
          showError(copy.redirectFailed);
          return;
        }
      }

      const { paymentIntent, error } = await stripe.confirmPayment({
        elements,
        clientSecret: current.secret,
        confirmParams: {
          return_url: orderUrl().href,
          payment_method_data: { billing_details: details }
        },
        redirect: 'if_required'
      });
      navigating = showOrder(paymentIntent || error?.payment_intent);
      if (!navigating) showError(error ? stripeError(error) : copy.paymentError);
    } catch {
      showError(copy.checkoutError);
    } finally {
      if (!navigating) setBusy(false);
    }
  });

  if (new URLSearchParams(location.search).get('pagamento') === 'fallito') showError(copy.redirectFailed, false);
  setup();
})();
