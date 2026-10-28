const assert = require('node:assert/strict');
const test = require('node:test');
const { finalizeClassCollection, finalizeClipboardData } = require('../lib/runtime-shape');

test('finalizes class collections with the linked metadata present in native Taptop exports', () => {
  const input = { map: {
    class_a: { id: 'class_a', value: 'alpha' },
    class_b: { id: 'class_b', value: 'beta' }
  } };
  assert.deepEqual(finalizeClassCollection(input), {
    map: input.map,
    countMap: { alpha: 1, beta: 1 },
    sortMap: { class_a: 'class_b', class_b: '' },
    head: { id: 'class_a', value: 'alpha' }
  });
  assert.deepEqual(input, { map: input.map });
});

test('finalizes empty collections and tree stores without inventing a head class', () => {
  const source = {
    action: 'copy', tagID: 'root',
    copiedLayout: {
      tree: { version: '3.1.0', root: 'root', tags: {} },
      mainClassNameCollection: { map: {} },
      designClassNameCollection: { map: {} }
    }
  };
  const result = finalizeClipboardData(source);
  assert.deepEqual(result.copiedLayout.tree.dataCollection, { map: {} });
  assert.deepEqual(result.copiedLayout.tree.forms, {});
  assert.deepEqual(result.copiedLayout.mainClassNameCollection, { map: {}, countMap: {}, sortMap: {} });
  assert.equal('head' in result.copiedLayout.mainClassNameCollection, false);
  assert.equal(result.isElementInCollection, false);
  assert.equal(result.hasQuantityInSubtree, false);
  assert.equal(source.copiedLayout.tree.dataCollection, undefined);
});
