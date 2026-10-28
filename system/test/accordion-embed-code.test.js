const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildAccordionEmbedCode } = require('../lib/accordion-embed-code');

test('builds one scoped multi-instance accordion runtime from a declarative class contract', () => {
  const code = buildAccordionEmbedCode({
    rootClass: 'accordion', itemClass: 'accordion-item', triggerClass: 'accordion-trigger', panelClass: 'accordion-panel', openClass: 'is-open'
  });

  assert.match(code, /document\.querySelectorAll\(config\.rootSelector\)/);
  assert.match(code, /root\.querySelectorAll\(config\.itemSelector\)/);
  assert.match(code, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(code, /item\.classList\.toggle\(config\.openClass, shouldOpen\)/);
  assert.doesNotMatch(code, /innerHTML|eval\(|new Function/);
});

test('rejects unsafe or incomplete accordion class contracts', () => {
  assert.throws(() => buildAccordionEmbedCode({ rootClass: 'accordion bad', itemClass: 'item', triggerClass: 'trigger', panelClass: 'panel' }), /ACCORDION_CONFIG_INVALID/);
  assert.throws(() => buildAccordionEmbedCode({ rootClass: 'accordion', itemClass: 'item' }), /ACCORDION_CONFIG_INVALID/);
});

test('delivers open/closed panel CSS and the runtime as embed HTML', () => {
  const code = buildAccordionEmbedCode({ rootClass: 'faq', itemClass: 'accordion-item', triggerClass: 'accordion-trigger', panelClass: 'accordion-panel', openClass: 'is-open' });
  assert.match(code, /^<style>/);
  assert.match(code, /\.faq \.accordion-item\.is-open \.accordion-panel \{ display: block; \}/);
  assert.match(code, /\.faq \.accordion-item:not\(\.is-open\) \.accordion-panel \{ display: none; \}/);
  assert.match(code, /<script>\n\(function \(\) \{[\s\S]*\}\)\(\);\n<\/script>$/);
});

test('requires a panel class so the embed can show the open answer', () => {
  assert.throws(() => buildAccordionEmbedCode({ rootClass: 'faq', itemClass: 'item', triggerClass: 'trigger' }), /ACCORDION_CONFIG_INVALID/);
});

test('waits for the page markup because Scripts sits before the content in Root', () => {
  const code = buildAccordionEmbedCode({ rootClass: 'faq', itemClass: 'accordion-item', triggerClass: 'accordion-trigger', panelClass: 'accordion-panel', openClass: 'is-open' });
  assert.match(code, /document\.readyState === 'loading'/);
  assert.match(code, /addEventListener\('DOMContentLoaded', init\)/);
});

test('hides its own Embed block on the published page even if Taptop keeps an older class', () => {
  const code = buildAccordionEmbedCode({ rootClass: 'faq', itemClass: 'accordion-item', triggerClass: 'accordion-trigger', panelClass: 'accordion-panel', openClass: 'is-open' });
  assert.match(code, /\.toolkit-behavior \{ display: none; \}/);
});
