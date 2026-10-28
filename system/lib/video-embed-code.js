const CLASS_NAME = /^-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/;

function buildVideoEmbedCode(config) {
  let parsed;
  try { parsed = new URL(config?.src); } catch { /* rejected below */ }
  if (!config || !['inline', 'dialog'].includes(config.mode) || !CLASS_NAME.test(config.rootClass || '') || !parsed || parsed.protocol !== 'https:' || !parsed.pathname.toLowerCase().endsWith('.mp4') || (config.mode === 'dialog' && !/^#[A-Za-z][\w-]*$/.test(config.hook || ''))) {
    throw new TypeError('VIDEO_CONFIG_INVALID');
  }
  const safe = JSON.stringify(config).replace(/</g, '\\u003c');
  const style = config.mode === 'dialog' ? `<style>
.${config.rootClass}.toolkit-popup-open { display: block !important; opacity: 1 !important; }
</style>` : '';
  return `${style}
<script>
(function () {
  'use strict';
  const config = ${safe};
  const makeVideo = poster => {
    const video = document.createElement('video');
    video.src = config.src;
    video.controls = true;
    video.playsInline = true;
    video.style.width = '100%';
    video.style.height = '100%';
    if (poster) video.poster = poster;
    return video;
  };
  const init = () => document.querySelectorAll('.' + config.rootClass).forEach(root => {
    if (root.dataset.taptopVideoBound === 'true') return;
    root.dataset.taptopVideoBound = 'true';
    if (config.mode === 'inline') {
      const poster = root.querySelector('.toolkit-video-poster');
      const video = makeVideo(poster?.src);
      video.autoplay = true;
      video.muted = true;
      if (poster) poster.style.display = 'none';
      root.appendChild(video);
      video.play().catch(() => {});
      return;
    }
    const carrier = root.querySelector('.t1013__video-carier') || root;
    const video = makeVideo();
    carrier.appendChild(video);
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('tabindex', '-1');
    let returnFocus;
    const close = () => {
      root.classList.remove('toolkit-popup-open');
      video.pause();
      document.body.style.overflow = '';
      returnFocus?.focus();
    };
    document.querySelectorAll('a[href="' + config.hook + '"]').forEach(trigger => trigger.addEventListener('click', event => {
      event.preventDefault();
      returnFocus = trigger;
      root.classList.add('toolkit-popup-open');
      document.body.style.overflow = 'hidden';
      root.focus();
      video.play().catch(() => {});
    }));
    root.querySelectorAll('.t-popup__block-close, .t-popup__block-close-button').forEach(control => control.addEventListener('click', event => { event.stopPropagation(); close(); }));
    root.addEventListener('click', event => { if (event.target === root) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && root.classList.contains('toolkit-popup-open')) close(); });
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
</script>`;
}

module.exports = { buildVideoEmbedCode };
