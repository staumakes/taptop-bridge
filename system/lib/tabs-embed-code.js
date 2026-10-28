const CLASS_NAME = /^-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/;

// Tabs: the n-th trigger of a root shows the n-th panel. The active class sits
// on the chosen trigger and its panel; the source markup decides the start tab.
function buildTabsEmbedCode(config) {
  const required = ['rootClass', 'triggerClass', 'panelClass', 'activeClass'];
  if (!config || typeof config !== 'object' || required.some((key) => !CLASS_NAME.test(config[key] || ''))) {
    throw new TypeError('TABS_CONFIG_INVALID');
  }
  const runtimeConfig = {
    rootSelector: `.${config.rootClass}`,
    triggerSelector: `.${config.triggerClass}`,
    panelSelector: `.${config.panelClass}`,
    activeClass: config.activeClass
  };
  const { rootSelector, panelSelector, activeClass } = runtimeConfig;
  // As with the accordion, Taptop classes cannot express "only the active
  // panel"; the published page gets that state from this embed.
  const style = `<style>
.toolkit-behavior { display: none; }
${rootSelector} ${panelSelector}.${activeClass} { display: block; }
${rootSelector} ${panelSelector}:not(.${activeClass}) { display: none; }
</style>`;
  return `${style}
<script>
(function () {
  'use strict';
  const config = ${JSON.stringify(runtimeConfig)};
  const select = (root, index) => {
    root.querySelectorAll(config.triggerSelector).forEach((trigger, position) => {
      const active = position === index;
      trigger.classList.toggle(config.activeClass, active);
      trigger.setAttribute('aria-selected', String(active));
      trigger.setAttribute('tabindex', active ? '0' : '-1');
    });
    root.querySelectorAll(config.panelSelector).forEach((panel, position) => {
      panel.classList.toggle(config.activeClass, position === index);
    });
  };
  // Scripts is the first layer in Root, so this runs before the content exists.
  const init = () => document.querySelectorAll(config.rootSelector).forEach((root) => {
    if (root.dataset.taptopTabsBound === 'true') return;
    root.dataset.taptopTabsBound = 'true';
    const triggers = Array.from(root.querySelectorAll(config.triggerSelector));
    const start = Math.max(0, triggers.findIndex((trigger) => trigger.classList.contains(config.activeClass)));
    triggers.forEach((trigger, index) => {
      trigger.setAttribute('role', 'tab');
      trigger.addEventListener('click', () => select(root, index));
      trigger.addEventListener('keydown', (event) => {
        const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(root, index); }
        if (step) {
          event.preventDefault();
          const next = (index + step + triggers.length) % triggers.length;
          select(root, next);
          triggers[next].focus();
        }
      });
    });
    select(root, start);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
</script>`;
}

module.exports = { buildTabsEmbedCode };
