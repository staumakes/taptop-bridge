const assert = require('node:assert');
const { test } = require('node:test');
const { buildRevealEmbedCode } = require('../lib/reveal-embed-code');

test('buildRevealEmbedCode starts Tilda animation classes and has a visibility fallback', () => {
  const code = buildRevealEmbedCode({ targetClass: 't-animate', startedClass: 't-animate_started' });
  assert.match(code, /IntersectionObserver/);
  assert.match(code, /t-animate_started/);
  assert.match(code, /toolkit-animate-visible/);
});

test('buildRevealEmbedCode rejects an unsafe class contract', () => {
  assert.throws(() => buildRevealEmbedCode({ targetClass: 't-animate bad', startedClass: 't-animate_started' }), /REVEAL_CONFIG_INVALID/);
});
