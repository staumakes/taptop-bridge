const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { buildEmbedBehaviorPackage } = require('../lib/behavior-package');

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'contracts', 'behaviors', 'fixtures', 'tt-embed-v1.json'),
  'utf8'
));

test('builds a verified Embed clipboard package while retaining the fixture layer shape', () => {
  const result = buildEmbedBehaviorPackage({
    fixture,
    key: 'behavior/faq-accordion',
    adapter: 'taptop/embed-accordion-v1',
    name: 'toolkit-faq-accordion',
    embedCode: '<script>window.__taptopBridgeAccordion = true;</script>'
  });

  const tags = result.clipboardData.copiedLayout.tree.tags;
  const rootId = result.clipboardData.copiedLayout.tree.root;
  const root = tags[rootId];
  assert.equal(result.key, 'behavior/faq-accordion');
  assert.equal(result.adapter, 'taptop/embed-accordion-v1');
  assert.equal(result.name, 'toolkit-faq-accordion');
  assert.match(result.codeSha256, /^[a-f0-9]{64}$/);
  assert.equal(root.widgetName, 'tt_embed');
  assert.equal(root.embedCode, '<script>window.__taptopBridgeAccordion = true;</script>');
  assert.equal(root.name, 'toolkit-faq-accordion');
  assert.deepEqual(root.can, ['SELECT', 'SET_EMBED_CODE']);
});

test('refuses a fixture that does not contain exactly one Embed root', () => {
  assert.throws(() => buildEmbedBehaviorPackage({
    fixture: { clipboardData: { tagID: 'x', copiedLayout: { tree: { tags: { x: { id: 'x', widgetName: 'div' } } } } } },
    key: 'behavior/bad', adapter: 'taptop/embed-accordion-v1', name: 'bad', embedCode: '<script></script>'
  }), /EMBED_FIXTURE_INVALID/);
});

test('marks the Embed with its own hidden class instead of a project-shared helper class', () => {
  const result = buildEmbedBehaviorPackage({ fixture, key: 'behavior/faq', adapter: 'taptop/embed-accordion-v1', name: 'faq', embedCode: '<script></script>' });
  const layout = result.clipboardData.copiedLayout;
  const root = layout.tree.tags[layout.tree.root];
  const names = root.classNameIds.map(id => layout.mainClassNameCollection.map[id]?.value || layout.designClassNameCollection.map[id]?.value);
  assert.ok(names.includes('toolkit-behavior'));
  assert.ok(!JSON.stringify(layout).includes('helper--d-none'));
  assert.deepEqual(layout.mainSelectorCollection.map['screen/.toolkit-behavior'].rules.display, { name: 'display', value: 'none', isCustom: false, serializeValue: 'none' });
});
