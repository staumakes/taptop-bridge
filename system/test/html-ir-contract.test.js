const assert = require('node:assert');
const { test } = require('node:test');
const { validateHtmlCompilerManifest, computeSourceRevision, validateHtmlIr } = require('../lib/html-ir-contract');

function manifest() {
  return {
    schemaVersion: 1, componentKey: 'landing/hero-vertical', html: 'html-export/pages/landing.html',
    rootSelector: '.hero-vertical', stylesheets: ['html-export/assets/css/sections.css'],
    breakpointMap: { '(max-width: 767px)': '(max-width: 767px)', '(max-width: 479px)': '(max-width: 479px)' }
  };
}

function location(domPath) {
  return { path: 'html-export/pages/landing.html', line: 1, column: 1, domPath };
}

function validIr() {
  const evidence = computeSourceRevision({ manifest: manifest(), sources: [
    { role: 'manifest', path: 'taptop-bridge/compiler/hero.json', content: '{}' },
    { role: 'html', path: 'html-export/pages/landing.html', content: '<section></section>' }
  ] });
  return {
    schemaVersion: 1, componentKey: 'landing/hero-vertical', sourceRevision: evidence.revision, sources: evidence.sources,
    rootKey: 'hero/root', diagnostics: [],
    nodes: {
      'hero/root': { key: 'hero/root', kind: 'container', tagName: 'section', classes: ['hero-vertical'], attributes: {}, children: ['hero/title'], source: location('section.hero-vertical') },
      'hero/title': { key: 'hero/title', kind: 'text', tagName: 'h1', classes: ['hero-vertical__title'], attributes: {}, text: 'Title', children: [], source: location('section.hero-vertical > h1.hero-vertical__title') }
    }
  };
}

test('accepts a portable ordered manifest and rejects absolute/traversal/duplicate paths', () => {
  assert.deepStrictEqual(validateHtmlCompilerManifest(manifest()), []);
  const bad = manifest();
  bad.html = '/Users/person/project/page.html';
  bad.stylesheets = ['../secret.css', '../secret.css'];
  const errors = validateHtmlCompilerManifest(bad);
  assert.ok(errors.some((error) => error.includes('manifest.html')));
  assert.ok(errors.some((error) => error.includes('safe relative')));
  assert.ok(errors.some((error) => error.includes('duplicate path')));
});

test('validates explicit typography composition rules', () => {
  const input = manifest();
  input.typographyCompositions = [{
    sourceClass: 'hero-vertical__title',
    tokenClass: 'display--lg',
    omitProperties: ['margin', 'color', 'font-size', 'font-weight', 'line-height', 'letter-spacing']
  }];
  assert.deepStrictEqual(validateHtmlCompilerManifest(input), []);

  input.typographyCompositions.push({ sourceClass: '', tokenClass: '', omitProperties: [''] });
  const errors = validateHtmlCompilerManifest(input);
  assert.ok(errors.some((error) => error.includes('sourceClass')));
  assert.ok(errors.some((error) => error.includes('tokenClass')));
  assert.ok(errors.some((error) => error.includes('omitProperties')));
});

test('source revision is stable across object key order but changes with approved source bytes', () => {
  const sources = [{ role: 'html', path: 'page.html', content: '<div>A</div>' }];
  const first = computeSourceRevision({ manifest: manifest(), sources });
  const reordered = { breakpointMap: manifest().breakpointMap, stylesheets: manifest().stylesheets, rootSelector: manifest().rootSelector, html: manifest().html, componentKey: manifest().componentKey, schemaVersion: 1 };
  const second = computeSourceRevision({ manifest: reordered, sources });
  const changed = computeSourceRevision({ manifest: manifest(), sources: [{ ...sources[0], content: '<div>B</div>' }] });
  assert.strictEqual(first.revision, second.revision);
  assert.notStrictEqual(first.revision, changed.revision);
});

test('validates a portable connected IR with no target-specific ids', () => {
  assert.deepStrictEqual(validateHtmlIr(validIr()), []);
});

test('rejects mismatched keys, missing children, cycles and unreachable nodes', () => {
  const ir = validIr();
  ir.nodes['hero/title'].key = 'wrong';
  ir.nodes['hero/title'].children = ['hero/root', 'missing'];
  ir.nodes.orphan = { key: 'orphan', kind: 'container', tagName: 'div', classes: ['orphan'], attributes: {}, children: [], source: location('div.orphan') };
  const errors = validateHtmlIr(ir);
  assert.ok(errors.some((error) => error.includes('does not match node.key')));
  assert.ok(errors.some((error) => error.includes('missing child')));
  assert.ok(errors.some((error) => error.includes('cycle')));
  assert.ok(errors.some((error) => error.includes('unreachable')));
});

test('rejects unsupported node kinds and missing design classes before a Taptop tree exists', () => {
  const ir = validIr();
  ir.nodes['hero/title'].kind = 'form';
  ir.nodes['hero/title'].classes = [];
  const errors = validateHtmlIr(ir);
  assert.ok(errors.some((error) => error.includes('unsupported kind')));
  assert.ok(errors.some((error) => error.includes('at least one real class')));
});
