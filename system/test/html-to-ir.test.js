const assert = require('node:assert');
const { test } = require('node:test');
const { parseHtmlToIr } = require('../lib/compiler/html-to-ir');
const { validateHtmlIr } = require('../lib/html-ir-contract');

function manifest(overrides = {}) {
  return {
    schemaVersion: 1, componentKey: 'pilot/hero', html: 'html-export/pages/pilot.html',
    rootSelector: '.hero', stylesheets: [], breakpointMap: {}, ...overrides
  };
}

test('parses one selected component into stable container, text, link and image IR nodes', async () => {
  const html = `<!doctype html><html><body>
    <section class="hero" data-taptop-key="hero/root">
      <h1 class="hero__title">A &amp; B</h1>
      <a class="hero__link" href="/more">Read more</a>
      <img class="hero__image" src="assets/hero.png" alt="Preview" width="1200" height="800">
    </section>
  </body></html>`;
  const ir = await parseHtmlToIr({ manifest: manifest(), htmlText: html, manifestText: JSON.stringify(manifest()), assetContents: { 'html-export/pages/assets/hero.png': Buffer.from('png') } });
  assert.deepStrictEqual(validateHtmlIr(ir), []);
  assert.strictEqual(ir.rootKey, 'hero/root');
  assert.strictEqual(ir.nodes['hero__title'].text, 'A & B');
  assert.strictEqual(ir.nodes['hero__link'].kind, 'link');
  assert.strictEqual(ir.nodes['hero__link'].attributes.href, '/more');
  assert.deepStrictEqual(ir.nodes['hero__image'].asset, {
    path: 'assets/hero.png', sourcePath: 'html-export/pages/assets/hero.png', alt: 'Preview', intrinsicWidth: 1200, intrinsicHeight: 800
  });
  assert.ok(ir.sources.some((source) => source.role === 'asset' && source.path === 'html-export/pages/assets/hero.png'));
});

test('requires exactly one root selector match', async () => {
  await assert.rejects(
    () => parseHtmlToIr({ manifest: manifest(), htmlText: '<section class="hero"></section><section class="hero"></section>', manifestText: '{}' }),
    /matched 2 elements/
  );
});

test('rejects positional identity for repeated ambiguous classes and reports a DOM path', async () => {
  const html = `<section class="hero" data-taptop-key="hero/root">
    <div class="card"><p class="card__text">One</p></div>
    <div class="card"><p class="card__text">Two</p></div>
  </section>`;
  await assert.rejects(
    () => parseHtmlToIr({ manifest: manifest(), htmlText: html, manifestText: '{}' }),
    (error) => error.code === 'AMBIGUOUS_NODE_KEY' && error.message.includes('section.hero > div.card:nth-of-type(1)')
  );
});

test('explicit data-taptop-key keeps repeated item identity stable when a sibling is inserted', async () => {
  const before = `<section class="hero" data-taptop-key="hero/root"><div class="card" data-taptop-key="card/a">A</div><div class="card" data-taptop-key="card/b">B</div></section>`;
  const after = `<section class="hero" data-taptop-key="hero/root"><div class="card" data-taptop-key="card/new">New</div><div class="card" data-taptop-key="card/a">A</div><div class="card" data-taptop-key="card/b">B</div></section>`;
  const first = await parseHtmlToIr({ manifest: manifest(), htmlText: before, manifestText: '{}' });
  const second = await parseHtmlToIr({ manifest: manifest(), htmlText: after, manifestText: '{}' });
  assert.ok(first.nodes['card/a'] && first.nodes['card/b']);
  assert.ok(second.nodes['card/a'] && second.nodes['card/b'] && second.nodes['card/new']);
});

test('rejects image assets without positive intrinsic width and height', async () => {
  const html = `<section class="hero" data-taptop-key="hero/root"><img class="hero__image" src="assets/hero.png" width="1200"></section>`;
  await assert.rejects(
    () => parseHtmlToIr({ manifest: manifest(), htmlText: html, manifestText: '{}' }),
    (error) => error.code === 'IMAGE_INTRINSIC_SIZE_REQUIRED' && error.message.includes('img.hero__image')
  );
});

test('requires every declared stylesheet and referenced image in source evidence', async () => {
  const withCss = manifest({ stylesheets: ['html-export/assets/css/hero.css'] });
  await assert.rejects(
    () => parseHtmlToIr({ manifest: withCss, htmlText: '<section class="hero"></section>', manifestText: '{}' }),
    /MISSING_SOURCE_EVIDENCE/
  );
  await assert.rejects(
    () => parseHtmlToIr({ manifest: manifest(), htmlText: '<section class="hero"><img class="hero__image" src="assets\/hero.png" width="1" height="1"><\/section>', manifestText: '{}' }),
    /MISSING_SOURCE_EVIDENCE/
  );
});

test('rejects unsupported form controls instead of silently dropping them', async () => {
  const html = `<section class="hero" data-taptop-key="hero/root"><input class="hero__input" type="email"></section>`;
  await assert.rejects(
    () => parseHtmlToIr({ manifest: manifest(), htmlText: html, manifestText: '{}' }),
    (error) => error.code === 'UNSUPPORTED_HTML_TAG' && error.message.includes('input.hero__input')
  );
});

test('requires every behavioral data attribute to be declared and carries the declaration into IR evidence', async () => {
  const html = `<section class="hero" data-taptop-key="hero/root"><button class="btn" data-action="open">Open</button></section>`;
  await assert.rejects(
    () => parseHtmlToIr({ manifest: manifest(), htmlText: html, manifestText: '{}' }),
    (error) => error.code === 'UNDECLARED_BEHAVIOR' && error.message.includes('data-action')
  );
  const declaredManifest = manifest({ behaviorManifest: 'taptop-bridge/compiler/behaviors/hero.json' });
  const behaviorManifest = { schemaVersion: 1, behaviors: [{ key: 'hero/open', adapter: 'future/dialog-open', nodeKeys: ['btn'] }] };
  const ir = await parseHtmlToIr({
    manifest: declaredManifest, htmlText: html, manifestText: '{}', behaviorManifest,
    behaviorText: JSON.stringify(behaviorManifest)
  });
  assert.strictEqual(ir.nodes.btn.behaviorKey, 'hero/open');
  assert.strictEqual(ir.behaviors['hero/open'].adapter, 'future/dialog-open');
  assert.ok(ir.sources.some((source) => source.role === 'behavior'));
});
