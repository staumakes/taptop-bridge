const assert = require('node:assert');
const { test } = require('node:test');
const { buildCompilerIdentityManifest } = require('../lib/build-compiler-identity-manifest');

function clipboardFixture() {
  return {
    copiedLayout: {
      mainClassNameCollection: { map: {
        class_a: { id: 'class_a', value: 'section' },
        class_b: { id: 'class_b', value: 'card' }
      } },
      designClassNameCollection: { map: {} },
      mainSelectorCollection: { map: {
        'screen/.section': { media: 'screen', selectorText: '.section', rules: { display: { name: 'display', value: 'flex' } } },
        'screen/.card': { media: 'screen', selectorText: '.card', rules: { color: { name: 'color', value: '#000' } } },
        '(max-width: 767px)/.card': { media: '(max-width: 767px)', selectorText: '.card', rules: { display: { name: 'display', value: 'block' } } }
      } },
      designSelectorCollection: { map: {} },
      cmSelectorCollection: { map: {
        'screen/.card:hover': { media: 'screen', selectorText: '.card:hover', rules: { color: { name: 'color', value: '#111' } } }
      } },
      animationSelectorCollection: { map: {} }
    }
  };
}

test('derives deterministic owned paths from compiled selector channels using explicit stable class identities', () => {
  const result = buildCompilerIdentityManifest({
    clipboardData: clipboardFixture(), namespace: 'project', componentKey: 'cards',
    stableKeysByClass: { section: 'cards/root', card: 'shared/card' },
    instance: { stableKey: 'cards/template', rootLogicalNodeKey: 'cards/root-node' }
  });
  assert.deepStrictEqual(result.classes.map(({ stableKey, name }) => ({ stableKey, name })), [
    { stableKey: 'cards/root', name: 'section' },
    { stableKey: 'shared/card', name: 'card' }
  ]);
  assert.deepStrictEqual(result.classes[1].ownedPaths.map((item) => item.path), [
    '["main","(max-width: 767px)",".card","display"]',
    '["main","screen",".card","color"]',
    '["cm","screen",".card:hover","color"]'
  ]);
  assert.deepStrictEqual(result.instances, [{ stableKey: 'cards/template', rootLogicalNodeKey: 'cards/root-node' }]);
});

test('rejects an identity class absent from the compiled export or without owned selector rules', () => {
  assert.throws(() => buildCompilerIdentityManifest({
    clipboardData: clipboardFixture(), namespace: 'project', componentKey: 'cards',
    stableKeysByClass: { missing: 'cards/missing' }, instance: { stableKey: 'cards/template', rootLogicalNodeKey: 'root' }
  }), /missing from compiled class collections/);
  const clipboardData = clipboardFixture();
  clipboardData.copiedLayout.mainSelectorCollection.map = {};
  clipboardData.copiedLayout.cmSelectorCollection.map = {};
  assert.throws(() => buildCompilerIdentityManifest({
    clipboardData, namespace: 'project', componentKey: 'cards',
    stableKeysByClass: { card: 'shared/card' }, instance: { stableKey: 'cards/template', rootLogicalNodeKey: 'root' }
  }), /has no owned selector rules/);
});
