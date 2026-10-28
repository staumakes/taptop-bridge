const CLASS_NAME = /^-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/;

function buildAccordionEmbedCode(config) {
  const required = ['rootClass', 'itemClass', 'triggerClass', 'panelClass'];
  if (!config || typeof config !== 'object' || required.some((key) => !CLASS_NAME.test(config[key] || '')) || (config.openClass !== undefined && !CLASS_NAME.test(config.openClass))) {
    throw new TypeError('ACCORDION_CONFIG_INVALID');
  }
  const runtimeConfig = {
    rootSelector: `.${config.rootClass}`,
    itemSelector: `.${config.itemClass}`,
    triggerSelector: `.${config.triggerClass}`,
    openClass: config.openClass || 'is-open'
  };
  // Taptop classes cannot express "panel inside an open item", so the embed
  // carries that state CSS. It applies only on the published page; in the
  // editor every panel keeps its own class styles and stays editable.
  const { rootSelector, itemSelector, openClass } = runtimeConfig;
  const panelSelector = `.${config.panelClass}`;
  const style = `<style>
.toolkit-behavior { display: none; }
${rootSelector} ${itemSelector}.${openClass} ${panelSelector} { display: block; }
${rootSelector} ${itemSelector}:not(.${openClass}) ${panelSelector} { display: none; }
</style>`;
  return `${style}
<script>
(function () {
  'use strict';
  const config = ${JSON.stringify(runtimeConfig)};
  const activate = (root, nextItem) => {
    const items = root.querySelectorAll(config.itemSelector);
    items.forEach((item) => {
      const shouldOpen = item === nextItem;
      item.classList.toggle(config.openClass, shouldOpen);
      const trigger = item.querySelector(config.triggerSelector);
      if (trigger) trigger.setAttribute('aria-expanded', String(shouldOpen));
    });
  };
  // Scripts is the first layer in Root, so this runs before the content exists.
  const init = () => document.querySelectorAll(config.rootSelector).forEach((root) => {
    if (root.dataset.taptopAccordionBound === 'true') return;
    root.dataset.taptopAccordionBound = 'true';
    root.querySelectorAll(config.itemSelector).forEach((item) => {
      const trigger = item.querySelector(config.triggerSelector);
      if (!trigger) return;
      const open = item.classList.contains(config.openClass);
      trigger.setAttribute('role', 'button');
      trigger.setAttribute('tabindex', '0');
      trigger.setAttribute('aria-expanded', String(open));
      const toggle = () => activate(root, item);
      trigger.addEventListener('click', toggle);
      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      });
    });
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
</script>`;
}

module.exports = { buildAccordionEmbedCode };
