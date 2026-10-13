
document.addEventListener('DOMContentLoaded', function() {
  const thumbnail = document.getElementById('video-thumbnail-opt');
  const video = document.getElementById('hero-video-player-opt');
  const videoControls = document.getElementById('video-controls-opt');
  const videoOverlay = document.getElementById('video-overlay-opt');
  const playPauseBtn = document.getElementById('play-pause-opt');
  const pauseIcon = playPauseBtn?.querySelector('.pause-icon-opt');
  const playIcon = playPauseBtn?.querySelector('.play-icon-opt');
  
  if (thumbnail && video && playPauseBtn) {
    
    thumbnail.addEventListener('click', function() {
      thumbnail.style.display = 'none';
      videoOverlay.style.display = 'none';
      video.style.display = 'block';
      videoControls.style.display = 'block';
      video.play().catch(() => { video.setAttribute('controls', ''); });
      updatePlayPauseIcon();
    });
    
    playPauseBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (video.paused) {
        video.play().catch(() => { video.setAttribute('controls', ''); });
      } else {
        video.pause();
      }
      updatePlayPauseIcon();
    });
    
    video.addEventListener('click', function() {
      if (video.paused) {
        video.play().catch(() => { video.setAttribute('controls', ''); });
      } else {
        video.pause();
      }
      updatePlayPauseIcon();
    });
    
    function updatePlayPauseIcon() {
      if (video.paused) {
        pauseIcon.style.display = 'none';
        playIcon.style.display = 'block';
      } else {
        pauseIcon.style.display = 'block';
        playIcon.style.display = 'none';
      }
    }
    
    video.addEventListener('play', updatePlayPauseIcon);
    video.addEventListener('pause', updatePlayPauseIcon);
  }
});


document.addEventListener('DOMContentLoaded', function() {
  const thumbnail = document.getElementById('video-thumbnail');
  const video = document.getElementById('hero-video');
  const videoControl = document.getElementById('video-control');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const pauseIcon = playPauseBtn?.querySelector('.pause-icon');
  const playIconSmall = playPauseBtn?.querySelector('.play-icon-small');
  
  if (thumbnail && video && playPauseBtn) {
    
    // CLICK SUL THUMBNAIL - Avvia video
    thumbnail.addEventListener('click', function() {
      thumbnail.style.display = 'none';
      video.style.display = 'block';
      videoControl.style.display = 'block';
      video.play().catch(() => { video.setAttribute('controls', ''); });
      updatePlayPauseIcon();
    });
    
    // CLICK SUL BOTTONE PLAY/PAUSE
    playPauseBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (video.paused) {
        video.play().catch(() => { video.setAttribute('controls', ''); });
      } else {
        video.pause();
      }
      updatePlayPauseIcon();
    });
    
    // CLICK SUL VIDEO - Toggle play/pause
    video.addEventListener('click', function() {
      if (video.paused) {
        video.play().catch(() => { video.setAttribute('controls', ''); });
      } else {
        video.pause();
      }
      updatePlayPauseIcon();
    });
    
    // AGGIORNA ICONA PLAY/PAUSE
    function updatePlayPauseIcon() {
      if (video.paused) {
        pauseIcon.style.display = 'none';
        playIconSmall.style.display = 'block';
      } else {
        pauseIcon.style.display = 'block';
        playIconSmall.style.display = 'none';
      }
    }
    
    // LISTENER per cambio stato video
    video.addEventListener('play', updatePlayPauseIcon);
    video.addEventListener('pause', updatePlayPauseIcon);
    
    // AUTO-PAUSE quando esci dal viewport (opzionale)
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting && !video.paused) {
          video.pause();
          updatePlayPauseIcon();
        }
      });
    }, { threshold: 0.5 });
    
    observer.observe(video);
  }
});


// Smooth scroll behavior
document.addEventListener('DOMContentLoaded', function() {
  const scrollButton = document.querySelector('.scroll-down-button');
  
  if (scrollButton) {
    scrollButton.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      const targetElement = document.querySelector(targetId);
      
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.hasAttribute('data-motion-paused') ? 'auto' : 'smooth',
          block: 'start'
        });
      }
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  ['video-thumbnail-opt','video-thumbnail'].forEach(id => {
    const element = document.getElementById(id);
    if (!element) return;
    element.tabIndex = 0; element.setAttribute('role','button'); element.setAttribute('aria-label','Riproduci il video della sfida');
    element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') {event.preventDefault();element.click();} });
  });
  // Keep the real production landing on the existing live checkout. The local preview
  // continues to use the isolated test cart so it can never create a live order.
  const liveHost = /(^|\.)elenagiordani\.com$/i.test(location.hostname);
  const checkoutBase = liveHost ? 'https://lp.elenagiordani.com/carrello-sfida-7giorni' : '/sfida-checkout';
  document.querySelectorAll('[data-checkout]').forEach(link => { link.href = checkoutBase; });
  // Carry the current campaign to the checkout without storing anything before consent.
  const params = new URLSearchParams(location.search);
  const allowed = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','campaign_id','adset_id','ad_id'];
  const query = new URLSearchParams();
  allowed.forEach(key => { const value = params.get(key); if(value && !/[@<>]|https?:/i.test(value)) query.set(key,value.slice(0,100)); });
  if (query.size) document.querySelectorAll('[data-checkout]').forEach(link => { link.href=checkoutBase+'?'+query.toString(); });
});
