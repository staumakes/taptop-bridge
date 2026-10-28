const CLASS_NAME = /^-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/;

function buildRevealEmbedCode(config) {
  if (!config || !CLASS_NAME.test(config.targetClass || '') || !CLASS_NAME.test(config.startedClass || '')) {
    throw new TypeError('REVEAL_CONFIG_INVALID');
  }
  const safe = JSON.stringify(config).replace(/</g, '\\u003c');
  return `<style>
.${config.targetClass}.toolkit-animate-visible { opacity: 1 !important; }
</style>
<script>
(function () {
  'use strict';
  const config = ${safe};
  const reveal = target => {
    if (target.dataset.taptopRevealBound === 'true') return;
    target.dataset.taptopRevealBound = 'true';
    target.classList.add(config.startedClass);
    // Some Tilda effects depend on runtime-only classes. Keep their authored
    // animation when present, then guarantee that a missed effect cannot hide
    // content permanently.
    window.setTimeout(() => target.classList.add('toolkit-animate-visible'), 1400);
  };
  const init = () => {
    const targets = [...document.querySelectorAll('.' + config.targetClass)];
    if (!targets.length) return;
    if (!('IntersectionObserver' in window)) { targets.forEach(reveal); return; }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        reveal(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.01, rootMargin: '0px 0px 20% 0px' });
    targets.forEach(target => observer.observe(target));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
</script>`;
}

module.exports = { buildRevealEmbedCode };
