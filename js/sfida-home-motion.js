'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  if (!body.classList.contains('sfida-home-motion')) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const toggle = document.querySelector('.motion-toggle');
  let paused = false;
  try { paused = sessionStorage.getItem('sfida-motion-paused') === 'true'; } catch { /* Preference is optional. */ }
  function syncMotion() {
    const stopped = paused || reduced.matches;
    body.toggleAttribute('data-motion-paused', stopped);
    if (!toggle) return;
    toggle.hidden = false;
    toggle.disabled = reduced.matches;
    toggle.setAttribute('aria-pressed', String(stopped));
    toggle.setAttribute('aria-label', stopped ? 'Attiva le animazioni' : 'Metti in pausa le animazioni');
    toggle.querySelector('[data-motion-label]').textContent = reduced.matches ? 'Movimento ridotto' : paused ? 'Animazioni in pausa' : 'Animazioni attive';
    toggle.querySelector('.motion-toggle-icon').textContent = stopped ? '▷' : 'Ⅱ';
  }
  toggle?.addEventListener('click', () => {
    paused = !paused;
    try { sessionStorage.setItem('sfida-motion-paused', String(paused)); } catch { /* Keep working without storage. */ }
    syncMotion();
  });
  reduced.addEventListener('change', syncMotion);
  syncMotion();

  if ('IntersectionObserver' in window) {
    const reveal = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        reveal.unobserve(entry.target);
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -25px 0px' });
    document.querySelectorAll('[data-reveal]').forEach(element => {
      reveal.observe(element);
      element.classList.add('motion-reveal-pending');
    });
    // Continuous animations run only while their content is on screen.
    const motion = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.target.classList.toggle('is-motion-visible', entry.isIntersecting));
    }, { threshold: 0.05 });
    document.querySelectorAll('.hero-video-section-opt,.motion-method,.motion-include-1,.motion-include-4').forEach(element => motion.observe(element));
  } else {
    document.querySelectorAll('[data-reveal]').forEach(element => element.classList.add('is-revealed'));
  }

  const dialog = document.querySelector('.motion-media-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const player = dialog.querySelector('video');
  const photo = dialog.querySelector('.motion-modal-image');
  const title = dialog.querySelector('#motion-media-title');
  const error = dialog.querySelector('.motion-media-error');
  const close = dialog.querySelector('.motion-modal-close');
  let opener = null;
  document.querySelectorAll('[data-media-video],[data-media-image]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      title.textContent = link.dataset.mediaTitle || 'Esperienze con Elena';
      error.hidden = true;
      error.querySelector('a').href = link.href;
      const isVideo = link.hasAttribute('data-media-video');
      player.hidden = !isVideo;
      photo.hidden = isVideo;
      if (isVideo) {
        document.querySelectorAll('video').forEach(video => { if (video !== player) video.pause(); });
        player.poster = link.querySelector('img')?.src || '';
        player.src = link.href;
      } else {
        photo.src = link.href;
        photo.alt = link.dataset.mediaTitle || '';
      }
      body.setAttribute('data-media-open', '');
      dialog.showModal();
      close.focus();
      if (isVideo) player.play().catch(() => { /* Native controls remain available. */ });
    });
  });
  player.addEventListener('error', () => { if (dialog.open && !player.hidden) error.hidden = false; });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    player.pause();
    player.removeAttribute('src');
    player.load();
    photo.removeAttribute('src');
    body.removeAttribute('data-media-open');
    opener?.focus({ preventScroll: true });
  });
});
