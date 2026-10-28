const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateExport } = require('../lib/validate-export');
const { finalizeClipboardData } = require('../lib/runtime-shape');

function fixture() {
  return finalizeClipboardData({ tagID: 'r', copiedLayout: { tree: { root: 'r', tags: {
    r: { id: 'r', widgetName: 'div', classNameIds: ['c'], children: ['a'] },
    a: { id: 'a', parent: 'r', widgetName: 'div', classNameIds: ['c'], children: [] }
  } }, mainClassNameCollection: { map: { c: { id: 'c', value: 'div' } } } } });
}

test('rejects a disconnected cycle even when the visible tree has one root', () => {
  const p = fixture();
  for (const [id, other] of [['b', 'c'], ['c', 'b']]) {
    p.copiedLayout.tree.tags[id] = { id, parent: other, children: [other], widgetName: 'div', classNameIds: ['c'] };
  }
  const errors = validateExport(p);
  assert.ok(errors.some(e => /cycle/i.test(e)), errors.join('\n'));
  assert.ok(errors.some(e => /unreachable/i.test(e)), errors.join('\n'));
});

test('rejects a parent pointer without its matching child edge', () => {
  const p = fixture(); p.copiedLayout.tree.tags.r.children = [];
  assert.ok(validateExport(p).some(e => /not listed|unreachable/i.test(e)));
});

test('rejects duplicate child edges', () => {
  const p = fixture(); p.copiedLayout.tree.tags.r.children.push('a');
  assert.ok(validateExport(p).some(e => /duplicate child/i.test(e)));
});

test('reports a malformed node and a disconnected cycle together', () => {
  const p = fixture();
  p.copiedLayout.tree.tags.broken = null;
  p.copiedLayout.tree.tags.loop = { id: 'loop', parent: 'loop', children: ['loop'], classNameIds: ['c'], widgetName: 'div' };
  const errors = validateExport(p);
  assert.ok(errors.some(e => e.includes('broken')));
  assert.ok(errors.some(e => /cycle/i.test(e)));
});

test('rejects a tag map key that disagrees with its id', () => {
  const p = fixture(); p.copiedLayout.tree.tags.a.id = 'different';
  assert.ok(validateExport(p).some(e => /key.*id/i.test(e)));
});

for (const [label, mutate] of [
  ['null node', p => { p.copiedLayout.tree.tags.a = null; }],
  ['invalid children', p => { p.copiedLayout.tree.tags.r.children = 'a'; }],
  ['invalid classNameIds', p => { p.copiedLayout.tree.tags.a.classNameIds = 'c'; }]
]) test(`malformed ${label} returns diagnostics rather than throwing`, () => {
  const p = fixture(); mutate(p);
  let errors;
  assert.doesNotThrow(() => { errors = validateExport(p); });
  assert.ok(errors.length);
});

test('valid deep tree is checked without recursion or input changes', () => {
  const p = fixture(); const tags = {};
  const count = 15000;
  for (let i = 0; i < count; i++) tags[String(i)] = {
    id: String(i), parent: i ? String(i - 1) : undefined,
    children: i + 1 < count ? [String(i + 1)] : [], widgetName: 'div', classNameIds: ['c']
  };
  p.tagID = '0'; p.copiedLayout.tree = { root: '0', tags };
  const before = JSON.stringify(p);
  assert.deepEqual(validateExport(finalizeClipboardData(p)), []);
  assert.equal(JSON.stringify(p), before);
});
