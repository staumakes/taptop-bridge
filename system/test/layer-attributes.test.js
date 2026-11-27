const assert = require('node:assert/strict');
const test = require('node:test');
const { validateExport } = require('../lib/validate-export');
const { preflightImportPackage } = require('../lib/import-package-preflight');
const { createSyntheticImagePackage } = require('../test-support/synthetic-image-package');
const { buildEmbedBehaviorPackage } = require('../lib/behavior-package');
const fixture = require('../contracts/behaviors/fixtures/tt-embed-v1.json');

test('reserved layer id attributes are rejected at export and package boundaries', t => {
  const { wrapper } = createSyntheticImagePackage(t);
  for (const field of ['attr', 'data']) for (const name of ['id', 'ID', ' id ']) {
    const changed = structuredClone(wrapper);
    const tree = changed.clipboardData.copiedLayout.tree;
    tree.tags[tree.root][field] = { [name]: field === 'data' ? { type: 'STRING', value: 'anchor' } : 'anchor' };
    assert.match(validateExport(changed.clipboardData).join('\n'), /RESERVED_TAG_ATTRIBUTE/);
    assert.equal(preflightImportPackage(changed).ok, false);
  }
});

test('behavior layers cannot bypass the reserved id check', t => {
  const { wrapper } = createSyntheticImagePackage(t);
  const behavior = buildEmbedBehaviorPackage({ fixture, key: 'probe/embed', adapter: 'taptop/embed-styles-v1', name: 'probe', embedCode: '<style>.probe{color:red}</style>' });
  wrapper.behaviorPackages = [behavior];
  const tree = behavior.clipboardData.copiedLayout.tree;
  tree.tags[tree.root].data = { id: { type: 'STRING', value: 'anchor' } };
  assert.match(preflightImportPackage(wrapper).errors.join('\n'), /RESERVED_TAG_ATTRIBUTE/);
});

test('native layer identities and IDs inside SVG or rich text are not custom layer attributes', t => {
  const { wrapper } = createSyntheticImagePackage(t);
  const tree = wrapper.clipboardData.copiedLayout.tree;
  const root = tree.tags[tree.root];
  root.attr = { 'data-probe': 'id', role: 'region' };
  root.data = { text: { type: 'HTML', value: '<svg><defs><linearGradient id="paint"/></defs><path fill="url(#paint)"/></svg>' } };
  assert.equal(preflightImportPackage(wrapper).ok, true);
  assert.equal(root.id, tree.root);
});
