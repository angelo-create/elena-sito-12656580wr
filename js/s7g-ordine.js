'use strict';

(() => {
  const params = new URLSearchParams(location.search);
  const id = params.get('payment_intent');
  if (!id) return;

  const status = document.getElementById('order-status');
  const message = document.getElementById('order-message');
  const retry = document.getElementById('order-retry');
  const order = document.getElementById('preview-container');
  let checks = 0;

  function returnToCheckout(cartPath = '/carrello-sfida-7giorni') {
    params.set('pagamento', 'fallito');
    for (const key of ['payment_intent', 'payment_intent_client_secret', 'redirect_status']) params.delete(key);
    location.replace(`${cartPath}?${params}`);
  }

  async function check() {
    retry.hidden = true;
    try {
      const response = await fetch(`/api/s7g-ordine?payment_intent=${encodeURIComponent(id)}`, {
        signal: AbortSignal.timeout(10000)
      });
      if (response.status === 400 || response.status === 404) {
        returnToCheckout();
        return;
      }
      if (!response.ok) throw new Error();
      const result = await response.json();

      if (result.status === 'succeeded' && Number.isFinite(result.value) && result.value > 0 &&
          result.amount === Math.round(result.value * 100) && result.content_name) {
        document.documentElement.classList.remove('s7g-pending');
        status.hidden = true;
        order.hidden = false;
        window.s7gTrackOnce('Purchase', result.event_id, {
          value: result.value, currency: 'EUR', content_name: result.content_name
        });
      } else if (['processing', 'requires_capture'].includes(result.status)) {
        message.textContent = 'Pagamento in elaborazione. Ti mostreremo qui la conferma appena sarà disponibile.';
        checks += 1;
        if (checks < 15) setTimeout(check, 4000);
        else retry.hidden = false;
      } else {
        returnToCheckout(result.cart_path);
      }
    } catch {
      message.textContent = 'Non riusciamo a verificare il pagamento in questo momento. Riprova tra poco.';
      retry.hidden = false;
    }
  }

  status.hidden = false;
  order.hidden = true;
  retry.addEventListener('click', () => { checks = 0; check(); });
  check();
})();
