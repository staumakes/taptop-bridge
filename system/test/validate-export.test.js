const assert = require('node:assert');
const { test } = require('node:test');
const { validateExport } = require('../lib/validate-export');
const { finalizeClipboardData } = require('../lib/runtime-shape');

function validFixture() {
  return finalizeClipboardData({
    action: 'COPY_COMPONENT',
    tagID: 'iroot0001',
    copiedLayout: {
      tree: {
        version: '3.1.0',
        root: 'iroot0001',
        tags: {
          iroot0001: { id: 'iroot0001', widgetName: 'section', type: 'section', className: 'section', classNameIds: ['class_i00000001'], children: ['ichild001'], can: ['SELECT', 'INSERT'], dataAccess: 7, name: 'root' },
          ichild001: { id: 'ichild001', widgetName: 'div', type: 'div', className: 'div', classNameIds: ['class_i00000002'], parent: 'iroot0001', children: [], can: ['SELECT', 'INSERT'], dataAccess: 7, name: 'child' }
        }
      },
      mainClassNameCollection: { map: {
        class_i00000001: { id: 'class_i00000001', value: 'section' },
        class_i00000002: { id: 'class_i00000002', value: 'div' }
      } },
      designClassNameCollection: { map: {} },
      mainSelectorCollection: { map: {
        'screen/.section': { media: 'screen', selectorText: '.section', rules: {} }
      } },
      designSelectorCollection: { map: {} },
      cmSelectorCollection: { map: {} },
      animationSelectorCollection: { map: {} }
    }
  });
}

test('a well-formed export has no errors', () => {
  assert.deepStrictEqual(validateExport(validFixture()), []);
});

test('rejects clipboard shapes missing native collection metadata and tree stores', () => {
  const data = validFixture();
  delete data.copiedLayout.tree.dataCollection;
  delete data.copiedLayout.tree.forms;
  delete data.copiedLayout.mainClassNameCollection.countMap;
  delete data.copiedLayout.mainClassNameCollection.sortMap;
  delete data.copiedLayout.mainClassNameCollection.head;
  const errors = validateExport(data);
  assert.ok(errors.some((error) => error.includes('dataCollection.map')));
  assert.ok(errors.some((error) => error.includes('tree.forms')));
  assert.ok(errors.some((error) => error.includes('mainClassNameCollection.countMap')));
  assert.ok(errors.some((error) => error.includes('mainClassNameCollection.sortMap')));
  assert.ok(errors.some((error) => error.includes('mainClassNameCollection.head')));
});

test('rejects missing or non-boolean native clipboard state flags', () => {
  const data = validFixture();
  delete data.isElementInCollection;
  data.hasQuantityInSubtree = 'false';
  delete data.isElementInOrderSummary;
  data.isElementInShop = null;
  const errors = validateExport(data);
  assert.ok(errors.some((error) => error.includes('isElementInCollection')));
  assert.ok(errors.some((error) => error.includes('hasQuantityInSubtree')));
  assert.ok(errors.some((error) => error.includes('isElementInOrderSummary')));
  assert.ok(errors.some((error) => error.includes('isElementInShop')));
});

test('catches a classNameId that does not exist in mainClassNameCollection', () => {
  const data = validFixture();
  data.copiedLayout.tree.tags.iroot0001.classNameIds.push('class_iMISSING');
  const errors = validateExport(data);
  assert.ok(errors.some((e) => e.includes('class_iMISSING')));
});

test('catches a child id that does not exist in the tag map', () => {
  const data = validFixture();
  data.copiedLayout.tree.tags.iroot0001.children.push('iGHOST0001');
  const errors = validateExport(data);
  assert.ok(errors.some((e) => e.includes('iGHOST0001')));
});

test('catches a child whose parent pointer disagrees with the tree', () => {
  const data = validFixture();
  data.copiedLayout.tree.tags.ichild001.parent = 'iroot0001';
  data.copiedLayout.tree.tags.iroot0001.children = ['ichild001'];
  data.copiedLayout.tree.tags.ichild001.parent = 'iWRONGPARENT';
  data.copiedLayout.tree.tags.iWRONGPARENT = { id: 'iWRONGPARENT', widgetName: 'div', type: 'div', className: 'div', classNameIds: [], children: [], can: ['SELECT', 'INSERT'], dataAccess: 7, name: 'wrong', parent: 'iroot0001' };
  data.copiedLayout.tree.tags.iroot0001.children.push('iWRONGPARENT');
  const errors = validateExport(data);
  assert.ok(errors.some((e) => e.includes('does not point back')));
});

test('catches more or fewer than exactly one root tag', () => {
  const data = validFixture();
  delete data.copiedLayout.tree.tags.ichild001.parent;
  const errors = validateExport(data);
  assert.ok(errors.some((e) => e.includes('Expected exactly 1 root tag')));
});

test('catches a selector collection key that disagrees with its own media/selectorText', () => {
  const data = validFixture();
  data.copiedLayout.mainSelectorCollection.map['screen/.wrong-key'] = { media: 'screen', selectorText: '.section', rules: {} };
  const errors = validateExport(data);
  assert.ok(errors.some((e) => e.includes('screen/.wrong-key')));
});

test('catches payload.tagID not matching the actual root tag id', () => {
  const data = validFixture();
  data.tagID = 'iSOMETHINGELSE';
  const errors = validateExport(data);
  assert.ok(errors.some((e) => e.includes('iSOMETHINGELSE') && e.includes('iroot0001')));
});

test('catches copiedLayout.tree.root not matching the actual root tag id', () => {
  const data = validFixture();
  data.copiedLayout.tree.root = 'iSOMETHINGELSE';
  const errors = validateExport(data);
  assert.ok(errors.some((e) => e.includes('tree.root') && e.includes('iSOMETHINGELSE') && e.includes('iroot0001')));
});

test('catches a missing copiedLayout.tree.root', () => {
  const data = validFixture();
  delete data.copiedLayout.tree.root;
  const errors = validateExport(data);
  assert.ok(errors.some((e) => e.includes('tree.root')));
});

test('catches a media value that is not one of Taptop\'s 4 real breakpoints', () => {
  const data = validFixture();
  data.copiedLayout.mainSelectorCollection.map['(max-width: 768px)/.section'] = { media: '(max-width: 768px)', selectorText: '.section', rules: {} };
  const errors = validateExport(data);
  assert.ok(errors.some((e) => e.includes('(max-width: 768px)')));
});

test('catches a tag with no classNameIds at all', () => {
  const data = validFixture();
  data.copiedLayout.tree.tags.ichild001.classNameIds = [];
  const errors = validateExport(data);
  assert.ok(errors.some((e) => e.includes('ichild001') && e.includes('no classNameIds')));
});

test('catches a classNameId whose class has no real name — the real bug behind a confirmed Taptop paste crash ("У любого тега должен быть класс")', () => {
  const data = validFixture();
  data.copiedLayout.mainClassNameCollection.map.class_i00000002.value = undefined;
  const errors = validateExport(data);
  assert.ok(errors.some((e) => e.includes('class_i00000002') && e.includes('no real name')));
});

test('accepts a classNameId that resolves in designClassNameCollection instead of mainClassNameCollection — confirmed real shape: a button widget mixes both', () => {
  const data = validFixture();
  data.copiedLayout.designClassNameCollection.map.class_idesign001 = { id: 'class_idesign001', value: 'btn--primary__fill' };
  data.copiedLayout.tree.tags.ichild001.classNameIds.push('class_idesign001');
  const errors = validateExport(finalizeClipboardData(data));
  assert.deepStrictEqual(errors, []);
});

test('catches a classNameId that resolves in neither mainClassNameCollection nor designClassNameCollection', () => {
  const data = validFixture();
  data.copiedLayout.tree.tags.ichild001.classNameIds.push('class_iGHOST');
  const errors = validateExport(data);
  assert.ok(errors.some((e) => e.includes('class_iGHOST') && e.includes('unknown classNameId')));
});

test('catches an unresolved var(...) left in a rule value', () => {
  const data = validFixture();
  data.copiedLayout.mainSelectorCollection.map['screen/.section'] = {
    media: 'screen',
    selectorText: '.section',
    rules: { color: { name: 'color', value: 'var(--c-text-main)', isCustom: false, serializeValue: 'var(--c-text-main)' } }
  };
  const errors = validateExport(data);
  assert.ok(errors.some((e) => e.includes('var(') && e.includes('color')));
});
