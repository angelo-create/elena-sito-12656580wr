'use strict';

(() => {
  const page = document.body.dataset.s7gPage;
  const data = { value: 37, currency: 'EUR', content_name: 'Sfida 7 Giorni go' };

  for (const link of document.querySelectorAll('[data-s7g-query]')) {
    const target = new URL(link.href);
    target.search = location.search;
    link.href = target.href;
  }

  function trackOnce(name, id) {
    if (!window.fbq || !id) return;
    const key = `s7g:event:${name}:${id}`;
    const send = () => {
      try {
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, '1');
      } catch {
        // Meta deduplica per eventID anche se il browser blocca lo storage.
      }
      window.fbq('track', name, data, { eventID: id });
    };
    if (navigator.locks) navigator.locks.request(key, send).catch(() => {});
    else send();
  }

  window.s7gTrackOnce = trackOnce;

  // Attiva la misura sui domini pubblici del funnel.
  if (!['go.elenagiordani.com', 'www.elenagiordani.com'].includes(location.hostname)) return;

  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');

  window.fbq('init', '446130387840122');
  window.fbq('init', '1717291565951434');
  window.fbq('track', 'PageView');
  if (page === 'landing') window.fbq('track', 'ViewContent', data);
})();
