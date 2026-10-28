const assert = require('node:assert');
const { test } = require('node:test');
const { collectBySelectorAndMedia } = require('../lib/css-collect');

test('groups declarations by selector then media, defaulting to screen', () => {
  const css = `
    :root { --a: 1px; }
    @media (max-width: 991px) {
      :root { --a: 2px; }
    }
    .x { color: red; }
  `;
  const collected = collectBySelectorAndMedia(css);
  assert.strictEqual(collected.get(':root').get('screen').get('--a'), '1px');
  assert.strictEqual(collected.get(':root').get('(max-width: 991px)').get('--a'), '2px');
  assert.strictEqual(collected.get('.x').get('screen').get('color'), 'red');
});

test('splits comma-separated selector lists into separate entries', () => {
  const css = `.a, .b { color: green; }`;
  const collected = collectBySelectorAndMedia(css);
  assert.strictEqual(collected.get('.a').get('screen').get('color'), 'green');
  assert.strictEqual(collected.get('.b').get('screen').get('color'), 'green');
});

test('a later declaration for the same selector/media/property wins', () => {
  const css = `.x { color: red; } .x { color: blue; }`;
  const collected = collectBySelectorAndMedia(css);
  assert.strictEqual(collected.get('.x').get('screen').get('color'), 'blue');
});
