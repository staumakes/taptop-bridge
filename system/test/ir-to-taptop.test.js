const assert = require('node:assert');
const { test } = require('node:test');
const { compileIrToTaptop } = require('../lib/compiler/ir-to-taptop');
const { validateExport } = require('../lib/validate-export');

function loc(path) { return { path: 'page.html', line: 1, column: 1, domPath: path }; }
function fixture() {
  return {
    manifest: {
      schemaVersion: 1, componentKey: 'pilot/hero', html: 'page.html', rootSelector: '.hero',
      stylesheets: ['hero.css'], breakpointMap: { '(max-width: 767px)': '(max-width: 767px)' },
      selectorMappings: [{ sourceSelector: '.btn:hover', targetClass: 'btn', channel: 'cm', pseudoSuffix: ':hover' }]
    },
    ir: {
      schemaVersion: 1, componentKey: 'pilot/hero', sourceRevision: 'a'.repeat(64),
      sources: [{ role: 'html', path: 'page.html', sha256: 'b'.repeat(64) }], diagnostics: [], rootKey: 'root',
      nodes: {
        root: { key: 'root', kind: 'container', tagName: 'section', classes: ['hero'], attributes: {}, children: ['title', 'cta', 'image'], source: loc('section.hero') },
        title: { key: 'title', kind: 'text', tagName: 'h1', classes: ['hero__title'], attributes: {}, text: 'Hello', children: [], source: loc('section.hero > h1.hero__title') },
        cta: { key: 'cta', kind: 'button', tagName: 'button', classes: ['btn'], attributes: { type: 'button' }, text: 'Go', children: [], source: loc('section.hero > button.btn') },
        image: { key: 'image', kind: 'image', tagName: 'img', classes: ['hero__image'], attributes: {}, children: [], asset: { path: 'assets/hero.png', sourcePath: 'assets/hero.png', alt: 'Hero', intrinsicWidth: 1200, intrinsicHeight: 800 }, source: loc('section.hero > img.hero__image') }
      }
    },
    stylesheetTexts: {
      'hero.css': `.hero { display:flex } .hero__title { color:#111 } .btn { color:#fff; background-color:#00f } .btn:hover { background-color:#009 } .hero__image { display:block; width:100%; height:auto } @media (max-width: 767px) { .hero { display:block } }`
    }
  };
}

test('compiles generic IR kinds through shared Taptop builders and selector channels', () => {
  const input = fixture();
  input.assetKeys = { 'assets/hero.png': 'asset/example' };
  const { clipboardData, nodeBindings } = compileIrToTaptop(input);
  assert.deepStrictEqual(validateExport(clipboardData), []);
  assert.strictEqual(Object.keys(clipboardData.copiedLayout.tree.tags).length, 6, 'button and image each add one confirmed internal child');
  assert.deepStrictEqual(Object.keys(nodeBindings).sort(), ['cta', 'image', 'root', 'title']);
  const layout = clipboardData.copiedLayout;
  assert.strictEqual(layout.mainSelectorCollection.map['(max-width: 767px)/.hero'].rules.display.value, 'block');
  assert.strictEqual(layout.cmSelectorCollection.map['screen/.btn:hover'].rules['background-color'].value, '#009');
  const imageTag = layout.tree.tags[nodeBindings.image];
  assert.strictEqual(imageTag.widgetSettings.screen.maxWidth, '1200');
  assert.strictEqual(imageTag.widgetSettings.screen.maxHeight, '800');
});

test('rejects a source media query that the manifest did not explicitly map', () => {
  const input = fixture();
  input.stylesheetTexts['hero.css'] += '@media (max-width: 1199px) { .hero { gap:10px } }';
  assert.throws(() => compileIrToTaptop(input), /UNMAPPED_BREAKPOINT.*1199px/);
});

test('rejects selector mappings to a class that is absent from the IR', () => {
  const input = fixture();
  input.manifest.selectorMappings.push({ sourceSelector: '.ghost', targetClass: 'ghost', channel: 'main' });
  assert.throws(() => compileIrToTaptop(input), /UNKNOWN_TARGET_CLASS.*ghost/);
});

test('distinguishes an unknown behavior adapter from a catalogued unsupported adapter', () => {
  const input = fixture();
  input.ir.behaviors = { 'hero/go': { key: 'hero/go', adapter: 'future/dialog-open', nodeKeys: ['cta'], config: {} } };
  input.ir.nodes.cta.behaviorKey = 'hero/go';
  assert.throws(() => compileIrToTaptop(input), /UNKNOWN_BEHAVIOR_ADAPTER.*future\/dialog-open/);

  input.ir.behaviors['hero/go'].adapter = 'taptop/accordion-v1';
  assert.throws(
    () => compileIrToTaptop(input),
    /UNSUPPORTED_BEHAVIOR_ADAPTER.*taptop\/accordion-v1.*nativeFixture.*editorRoundtrip/
  );
});

test('builds a separate fixture-backed Embed package for a declared accordion', () => {
  const input = fixture();
  input.assetKeys = { 'assets/hero.png': 'asset/example' };
  input.ir.behaviors = {
    'faq/toggle': {
      key: 'faq/toggle', adapter: 'taptop/embed-accordion-v1', nodeKeys: ['root', 'cta'],
      config: { rootClass: 'hero', itemClass: 'hero', triggerClass: 'btn', panelClass: 'hero-copy', openClass: 'is-open' }
    }
  };
  input.ir.nodes.root.behaviorKey = 'faq/toggle';
  input.ir.nodes.cta.behaviorKey = 'faq/toggle';

  const result = compileIrToTaptop(input);
  assert.equal(result.behaviorPackages.length, 1);
  assert.equal(result.behaviorPackages[0].adapter, 'taptop/embed-accordion-v1');
  const embed = result.behaviorPackages[0].clipboardData;
  const root = embed.copiedLayout.tree.tags[embed.copiedLayout.tree.root];
  assert.equal(root.widgetName, 'tt_embed');
  assert.match(root.embedCode, /document\.querySelectorAll\(config\.rootSelector\)/);
});

test('compiles a link with nested parts as an editable link block', () => {
  const input = fixture();
  input.ir.nodes.root.children.push('cta-link');
  Object.assign(input.ir.nodes, {
    'cta-link': { key: 'cta-link', kind: 'link-block', tagName: 'a', classes: ['hero__cta'], attributes: { href: '#contact' }, children: ['cta-text', 'cta-arrow'], source: loc('a.hero__cta') },
    'cta-text': { key: 'cta-text', kind: 'text', tagName: 'span', classes: ['hero__cta-text'], attributes: {}, text: 'Write', children: [], source: loc('span.hero__cta-text') },
    'cta-arrow': { key: 'cta-arrow', kind: 'text', tagName: 'span', classes: ['hero__cta-arrow'], attributes: {}, text: '→', children: [], source: loc('span.hero__cta-arrow') }
  });
  input.assetKeys = { 'assets/hero.png': 'asset/example' };
  const { clipboardData, nodeBindings } = compileIrToTaptop(input);
  assert.deepStrictEqual(validateExport(clipboardData), []);
  const tags = clipboardData.copiedLayout.tree.tags;
  const link = tags[nodeBindings['cta-link']];
  assert.strictEqual(link.type, 'tt_link_block');
  assert.strictEqual(link.data.href.value, '#contact');
  assert.deepStrictEqual(link.children, [nodeBindings['cta-text'], nodeBindings['cta-arrow']]);
  assert.strictEqual(tags[nodeBindings['cta-arrow']].data.text.value, '→');
});

test('writes a line-height that is not px as a custom rule (the native control would store 0px)', () => {
  for (const value of ['1.5', '120%', '1.2em', 'clamp(26px, calc(0.926vw + 22.667px), 36px)']) {
    const input = fixture();
    input.assetKeys = { 'assets/hero.png': 'asset/example' };
    input.stylesheetTexts['hero.css'] += ` .hero__title { line-height: ${value} }`;
    const output = compileIrToTaptop(input);
    const rule = Object.values(output.clipboardData.copiedLayout.mainSelectorCollection.map).find(item => item.rules?.['line-height'])?.rules['line-height'];
    assert.equal(rule.isCustom, true, value);
    assert.equal(rule.value, value);
    assert.equal(rule.number, undefined);
  }
  const input = fixture();
  input.assetKeys = { 'assets/hero.png': 'asset/example' };
  input.stylesheetTexts['hero.css'] += ' .hero__title { line-height: 32px }';
  assert.doesNotThrow(() => compileIrToTaptop(input));
});
