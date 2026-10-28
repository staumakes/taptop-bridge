const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { preflightImportPackage } = require('../lib/import-package-preflight');
const { buildEmbedBehaviorPackage } = require('../lib/behavior-package');
const { PNG_1X1, createSyntheticImagePackage } = require('../test-support/synthetic-image-package');

const CLI = path.resolve(__dirname, '../bin/taptop.js');

function run(...args) { return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' }); }
const imagePackage = createSyntheticImagePackage;

test('preflight verifies embedded image bytes without a package directory', t => {
  const { wrapper } = imagePackage(t);
  const result = preflightImportPackage(wrapper);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.summary.assets, 1);
  const changedBytes = Buffer.from(PNG_1X1);
  changedBytes[changedBytes.length - 1] ^= 1;
  const tampered = preflightImportPackage({ ...wrapper, embeddedAssets: [{ ...wrapper.embeddedAssets[0], data: changedBytes.toString('base64') }] });
  assert.equal(tampered.ok, false);
  assert.ok(tampered.errors.some(error => /sha-?256/i.test(error)));
});

test('preflight rejects old two-part packages with a migration message', t => {
  const { wrapper } = imagePackage(t);
  const legacy = { ...wrapper, version: 1 };
  const result = preflightImportPackage(legacy);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => /earlier package.*separate asset folder.*Compile again/i.test(error)));
});

test('preflight rejects a missing referenced image and duplicate stable keys', t => {
  const { wrapper } = imagePackage(t);
  const missing = structuredClone(wrapper);
  missing.embeddedAssets = [];
  assert.ok(preflightImportPackage(missing).errors.some(error => /assetKey/i.test(error)));
  const duplicate = structuredClone(wrapper);
  duplicate.embeddedAssets.push({ ...duplicate.embeddedAssets[0] });
  assert.ok(preflightImportPackage(duplicate).errors.some(error => /duplicate/i.test(error)));
});

test('preflight rejects extra pending upload metadata', t => {
  const { wrapper } = imagePackage(t);
  const image = Object.values(wrapper.clipboardData.copiedLayout.tree.tags).find(tag => tag.widgetName === 'image__img');
  image.__pendingUpload.assetPath = '/Users/person/image.png';
  assert.ok(preflightImportPackage(wrapper).errors.some(error => /assetKey only/i.test(error)));
});

test('preflight reports malformed class lists without throwing', t => {
  const { wrapper } = imagePackage(t);
  wrapper.syncPackage.classes = {};
  assert.doesNotThrow(() => preflightImportPackage(wrapper));
  assert.equal(preflightImportPackage(wrapper).ok, false);
});

test('preflight rejects target media IDs in a portable image node', t => {
  const { wrapper } = imagePackage(t);
  const image = Object.values(wrapper.clipboardData.copiedLayout.tree.tags).find(tag => tag.widgetName === 'image__img');
  image.data.src = { type: 'IMAGE2', value: { image_id: 9, src: 'https://example.test/image.png' } };
  assert.ok(preflightImportPackage(wrapper).errors.some(error => /media ID/i.test(error)));
});

test('the compiled image widget keeps the embedded asset dimensions', t => {
  const { wrapper: imagePackage } = createSyntheticImagePackage(t);
  const tags = imagePackage.clipboardData.copiedLayout.tree.tags;
  const image = Object.values(tags).find(tag => tag.widgetName === 'image__img');
  const wrapper = tags[image.parent];
  const asset = imagePackage.embeddedAssets.find(item => item.stableKey === image.__pendingUpload.assetKey);
  assert.equal(wrapper.widgetSettings.screen.maxWidth, String(asset.width));
  assert.equal(wrapper.widgetSettings.screen.maxHeight, String(asset.height));
});

test('preflight accepts a fixture-backed Embed behavior and rejects a non-Embed behavior root', t => {
  const { wrapper } = imagePackage(t);
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts/behaviors/fixtures/tt-embed-v1.json'), 'utf8'));
  wrapper.behaviorPackages = [buildEmbedBehaviorPackage({
    fixture, key: 'behavior/faq-accordion', adapter: 'taptop/embed-accordion-v1',
    name: 'behavior-faq-accordion', embedCode: '<script>void 0</script>'
  })];
  assert.equal(preflightImportPackage(wrapper).ok, true, preflightImportPackage(wrapper).errors.join('\n'));
  wrapper.behaviorPackages[0].clipboardData.copiedLayout.tree.tags[wrapper.behaviorPackages[0].clipboardData.copiedLayout.tree.root].embedCode = '<script>changed</script>';
  assert.ok(preflightImportPackage(wrapper).errors.some(error => /codeSha256.*match/i.test(error)));
  wrapper.behaviorPackages[0] = buildEmbedBehaviorPackage({
    fixture, key: 'behavior/faq-accordion', adapter: 'taptop/embed-accordion-v1',
    name: 'behavior-faq-accordion', embedCode: '<script>void 0</script>'
  });
  wrapper.behaviorPackages[0].clipboardData.copiedLayout.tree.tags[wrapper.behaviorPackages[0].clipboardData.copiedLayout.tree.root].widgetName = 'div';
  assert.ok(preflightImportPackage(wrapper).errors.some(error => /tt_embed/i.test(error)));
});

test('compiler serializes a declared accordion as a separate Embed behavior package', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-accordion-'));
  const root = path.join(parent, 'project');
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  assert.equal(run('init', root, 'accordion-project').status, 0);
  fs.writeFileSync(path.join(root, 'source/page.html'), '<section class="panel" data-taptop-key="root" data-taptop-behavior="accordion"><div class="panel-trigger" data-taptop-key="trigger">Open</div></section>');
  fs.writeFileSync(path.join(root, 'source/page.css'), '.panel { display: block; } .panel-trigger { display: block; }');
  fs.writeFileSync(path.join(root, 'source/behaviors.json'), JSON.stringify({
    schemaVersion: 1,
    behaviors: [{
      key: 'faq/toggle', adapter: 'taptop/embed-accordion-v1', nodeKeys: ['root', 'trigger'],
      config: { rootClass: 'panel', itemClass: 'panel', triggerClass: 'panel-trigger', panelClass: 'panel-body', openClass: 'is-open' }
    }]
  }));
  fs.writeFileSync(path.join(root, 'source/manifest.json'), JSON.stringify({
    schemaVersion: 1, componentKey: 'test/accordion', html: 'source/page.html', rootSelector: '.panel',
    stylesheets: ['source/page.css'], behaviorManifest: 'source/behaviors.json', breakpointMap: {}
  }));
  const output = path.join(root, 'output/layer.json');
  const result = run('compile', root, 'source/manifest.json', output);
  assert.equal(result.status, 0, result.stderr);
  const wrapper = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(wrapper.behaviorPackages.length, 1);
  assert.equal(wrapper.behaviorPackages[0].adapter, 'taptop/embed-accordion-v1');
  assert.equal(preflightImportPackage(wrapper).ok, true, preflightImportPackage(wrapper).errors.join('\n'));
});

test('preflight rejects a managed system class before Taptop can try to update it', t => {
  const { wrapper } = imagePackage(t);
  wrapper.syncPackage.classes[0].name = 'body';
  const result = preflightImportPackage(wrapper);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('RESERVED_SYNC_CLASS_NAME: .body')));
});
