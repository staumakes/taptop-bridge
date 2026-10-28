const CLASS_NAME = /^-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/;

// Mobile menu: a toggle opens and closes a panel by adding openClass to the
// root. How the open menu looks is ordinary page CSS (`.root.is-open .panel`),
// which the normalizer keeps in the embed stylesheet; the editor shows the
// closed state and every layer stays editable.
function buildMenuEmbedCode(config) {
  const required = ['rootClass', 'toggleClass', 'panelClass'];
  const optional = ['backdropClass', 'openClass', 'anchorPrefix'];
  if (!config || typeof config !== 'object'
    || required.some((key) => !CLASS_NAME.test(config[key] || ''))
    || optional.some((key) => config[key] !== undefined && !CLASS_NAME.test(config[key]))) {
    throw new TypeError('MENU_CONFIG_INVALID');
  }
  const runtimeConfig = {
    rootSelector: `.${config.rootClass}`,
    toggleSelector: `.${config.toggleClass}`,
    panelSelector: `.${config.panelClass}`,
    backdropSelector: config.backdropClass ? `.${config.backdropClass}` : null,
    openClass: config.openClass || 'is-open',
    // Taptop layers keep no id: a link to #name scrolls to .<anchorPrefix>name.
    anchorPrefix: config.anchorPrefix || null,
    desktopQuery: '(min-width: 992px)'
  };
  return `<style>
.toolkit-behavior { display: none; }
</style>
<script>
(function () {
  'use strict';
  const config = ${JSON.stringify(runtimeConfig)};
  const bind = (root) => {
    if (root.dataset.taptopMenuBound === 'true') return;
    root.dataset.taptopMenuBound = 'true';
    const toggle = root.querySelector(config.toggleSelector);
    const panel = root.querySelector(config.panelSelector);
    if (!toggle || !panel) return;
    const set = (open) => {
      root.classList.toggle(config.openClass, open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.setAttribute('role', 'button');
    toggle.setAttribute('tabindex', '0');
    toggle.setAttribute('aria-label', 'Menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => set(!root.classList.contains(config.openClass)));
    toggle.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        set(!root.classList.contains(config.openClass));
      }
    });
    panel.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (!link) return;
      const hash = link.getAttribute('href');
      if (config.anchorPrefix && /^#[\w-]+$/.test(hash)) {
        const target = document.getElementById(hash.slice(1)) || document.querySelector('.' + config.anchorPrefix + hash.slice(1));
        if (target) {
          event.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      set(false);
    });
    if (config.backdropSelector) root.querySelectorAll(config.backdropSelector).forEach((backdrop) => backdrop.addEventListener('click', () => set(false)));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') set(false); });
    const desktop = window.matchMedia(config.desktopQuery);
    desktop.addEventListener('change', () => { if (desktop.matches) set(false); });
  };
  // Scripts is the first layer in Root, so this runs before the content exists.
  const init = () => document.querySelectorAll(config.rootSelector).forEach(bind);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
</script>`;
}

module.exports = { buildMenuEmbedCode };
