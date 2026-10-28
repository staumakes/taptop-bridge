const assert = require('node:assert/strict');
const test = require('node:test');
const { parse } = require('parse5');
const { parseSelector, staticPart, selectMatching, specificity } = require('../lib/selector-match');

function domOf(html) {
  const document = parse(html);
  const all = [];
  const visit = node => { for (const child of node.childNodes || []) if (child.tagName) { all.push(child); visit(child); } };
  visit(document);
  const dom = {
    tag: node => node.tagName,
    attr: (node, name) => node.attrs.find(item => item.name === name)?.value,
    classes: node => (node.attrs.find(item => item.name === 'class')?.value || '').split(/\s+/).filter(Boolean),
    parent: node => (node.parentNode?.tagName ? node.parentNode : null),
    children: node => (node.childNodes || []).filter(child => child.tagName),
    isEmpty: node => !(node.childNodes || []).length
  };
  return { all, dom, select: selector => selectMatching(parseSelector(selector), all, dom).map(node => dom.attr(node, 'data-k')) };
}

const page = '<div id="hero" class="hero"><div aria-hidden="true"><i data-k="1"></i><i data-k="2"></i><i data-k="3" class="x"></i></div><div><p data-k="p1">a</p><p data-k="p2" lang="en-US">b</p></div></div><a href="#" data-k="a"></a>';

test('matches relational, attribute and structural selectors on the source page', () => {
  const { select } = domOf(page);
  assert.deepEqual(select('#hero > div[aria-hidden="true"] > i:nth-child(3)'), ['3']);
  assert.deepEqual(select('#hero > div:nth-child(2) > p:first-child'), ['p1']);
  assert.deepEqual(select('.hero i:not(.x)'), ['1', '2']);
  assert.deepEqual(select('i + i'), ['2', '3']);
  assert.deepEqual(select('i:first-child ~ i'), ['2', '3']);
  assert.deepEqual(select('p[lang|="en"]'), ['p2']);
  assert.deepEqual(select('div :is(p, .x):last-child'), ['3', 'p2']);
  assert.deepEqual(select('i:nth-child(2n+1)'), ['1', '3']);
  assert.deepEqual(select('a:link'), ['a']);
});

test('dynamic parts of the selected element become a suffix; elsewhere they are refused', () => {
  const split = staticPart(parseSelector('#hero > div i.x:hover::after'));
  assert.equal(split.suffix, ':hover::after');
  assert.equal(split.steps[split.steps.length - 1].compound.pseudos.length, 0);
  assert.equal(staticPart(parseSelector('.card:hover .title')), null);
  assert.equal(parseSelector('a[href'), null);
});

test('specificity counts ids, ids turned into classes, classes and tags', () => {
  assert.deepEqual(specificity(parseSelector('#a .b > p:nth-child(2)')), [1, 2, 1]);
  assert.deepEqual(specificity(parseSelector('.hero .b'), { idClasses: new Set(['hero']) }), [1, 1, 0]);
  assert.deepEqual(specificity(parseSelector(':where(#a) p:not(.x, #y)')), [1, 0, 1]);
});
