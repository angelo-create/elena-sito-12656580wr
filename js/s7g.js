'use strict';

(() => {
  const page = document.body.dataset.s7gPage;
  const isBf = document.body.dataset.s7gOffer === 'bf';
  const copyBf = {
    contentName: 'Sfida 7 Giorni Black Friday', // COPY-BF: nome Meta, allineato a api/_lib/s7g.js.
    countdown: (days, clock) => (days ? `${days} g · ${clock}` : clock) // COPY-BF: formato conto alla rovescia.
  };
  const data = {
    value: isBf ? 7 : 37,
    currency: 'EUR',
    content_name: isBf ? copyBf.contentName : 'Sfida 7 Giorni go'
  };

  if (isBf) {
    const endsAt = Date.parse('2026-12-01T00:00:00+01:00');
    const countdowns = document.querySelectorAll('[data-s7g-countdown]');
    const parts = document.querySelectorAll('[data-s7g-cd]');
    const fallback = page === 'landing' ? '/s7g' : '/carrello-sfida-7giorni';

    function checkDeadline() {
      const remaining = endsAt - Date.now();
      if (remaining <= 0) {
        window.s7gOfferExpired = true;
        location.replace(fallback + location.search);
        return;
      }
      if (!countdowns.length && !parts.length) return;
      const seconds = Math.ceil(remaining / 1000);
      const days = Math.floor(seconds / 86400);
      const time = {
        d: String(days),
        h: String(Math.floor(seconds / 3600) % 24).padStart(2, '0'),
        m: String(Math.floor(seconds / 60) % 60).padStart(2, '0'),
        s: String(seconds % 60).padStart(2, '0')
      };
      const clock = [time.h, time.m, time.s].join(':');
      for (const el of countdowns) el.textContent = copyBf.countdown(days, clock);
      for (const el of parts) el.textContent = time[el.dataset.s7gCd];
      setTimeout(checkDeadline, Math.min(1000, remaining));
    }

    checkDeadline();
    if (window.s7gOfferExpired) return;

    const banner = document.querySelector('[data-s7g-banner]');
    if (banner) {
      function syncBannerHeight() {
        const height = banner.getBoundingClientRect().height;
        document.documentElement.style.setProperty('--s7g-bf-banner-height', height + 'px');
      }
      syncBannerHeight();
      new ResizeObserver(syncBannerHeight).observe(banner);

      // La riga fissa compare solo quando il riquadro dell'offerta esce dallo schermo.
      const card = document.querySelector('[data-s7g-offer-card]');
      if (card && 'IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => {
          banner.classList.toggle('is-hidden', entry.isIntersecting);
        }).observe(card);
      } else {
        banner.classList.remove('is-hidden');
      }
    }

    window.addEventListener('pageshow', event => {
      if (event.persisted && Date.now() >= endsAt) checkDeadline();
    });
  }

  for (const link of document.querySelectorAll('[data-s7g-query]')) {
    const target = new URL(link.href);
    target.search = location.search;
    link.href = target.href;
  }

  function trackOnce(name, id, eventData = data) {
    if (!window.fbq || !id) return;
    const key = `s7g:event:${name}:${id}`;
    const send = () => {
      try {
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, '1');
      } catch {
        // Meta deduplica per eventID anche se il browser blocca lo storage.
      }
      window.fbq('track', name, eventData, { eventID: id });
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
