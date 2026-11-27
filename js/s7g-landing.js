'use strict';

for (const [wrapper, videoId, control, overlay] of [
  ['video-thumbnail-opt', 'hero-video-player-opt', 'video-controls-opt', 'video-overlay-opt'],
  ['video-thumbnail', 'hero-video', 'video-control', null]
]) {
  const thumbnail = document.getElementById(wrapper);
  const video = document.getElementById(videoId);
  if (!thumbnail || !video) continue;

  function play() {
    thumbnail.hidden = true;
    const customControls = document.getElementById(control);
    if (customControls) customControls.hidden = true;
    const videoOverlay = overlay && document.getElementById(overlay);
    if (videoOverlay) videoOverlay.hidden = true;
    video.controls = true;
    video.style.display = 'block';
    video.focus();
    video.play().catch(() => {});
  }

  thumbnail.tabIndex = 0;
  thumbnail.setAttribute('role', 'button');
  thumbnail.setAttribute('aria-label', 'Riproduci il video della sfida');
  thumbnail.addEventListener('click', play);
  thumbnail.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    play();
  });
}
