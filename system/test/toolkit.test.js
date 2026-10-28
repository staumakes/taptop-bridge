const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cli = path.resolve(__dirname, '../bin/taptop.js');
const PNG_1X1 = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cff01f00050001ff89993d1d0000000049454e44ae426082', 'hex');
function run(...args) { return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' }); }
function temp(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-bridge-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
function project(t) {
  const root = path.join(temp(t), 'project');
  const result = run('init', root, 'sample-project');
  assert.equal(result.status, 0, result.stderr);
  return root;
}
function sources(root) {
  fs.writeFileSync(path.join(root, 'source/page.html'), '<section class="panel" data-taptop-key="root"><h1 class="headline" data-taptop-key="heading">Example</h1></section>');
  fs.writeFileSync(path.join(root, 'source/page.css'), '.panel { display: flex; } .headline { font-size: 30px; } .brand-heading { font-size: 35px; } @media (max-width: 767px) { .brand-heading { font-size: 25px; } }');
  const manifest = { schemaVersion: 1, componentKey: 'sections/panel', html: 'source/page.html', rootSelector: '.panel', stylesheets: ['source/page.css'], breakpointMap: { '(max-width: 767px)': '(max-width: 767px)' }, typographyCompositions: [{ sourceClass: 'headline', tokenClass: 'brand-heading', omitProperties: ['font-size'] }] };
  fs.writeFileSync(path.join(root, 'source/manifest.json'), JSON.stringify(manifest));
  return manifest;
}
test('init creates an empty isolated project and refuses all existing destinations', t => {
  const root = project(t);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'taptop.project.json')));
  assert.equal(config.namespace, 'sample-project');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'design-system/registry.json'))), { components: [], sections: [] });
  const before = fs.readFileSync(path.join(root, 'taptop.project.json'), 'utf8');
  assert.notEqual(run('init', root, 'other').status, 0);
  assert.equal(fs.readFileSync(path.join(root, 'taptop.project.json'), 'utf8'), before);
});
test('intake validates a declared source without changing the project state', t => {
  const root = project(t);
  const listing = () => fs.readdirSync(root, { recursive: true }).filter(name => name !== 'source/intake.json').sort();
  const state = [fs.readFileSync(path.join(root, 'taptop.project.json'), 'utf8'), listing()];
  fs.writeFileSync(path.join(root, 'source/intake.json'), JSON.stringify({
    schemaVersion: 1,
    sourceType: 'html',
    html: { entry: 'source/page.html', stylesheets: ['source/page.css'] }
  }));
  const result = run('intake', root, 'source/intake.json');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).mode, 'html');
  assert.deepEqual([fs.readFileSync(path.join(root, 'taptop.project.json'), 'utf8'), listing()], state);
});
test('compiles external typography without the original project, preserves stable identities, refuses overwrite', t => {
  const root = project(t); sources(root);
  const output = path.join(root, 'output/first.json');
  const result = run('compile', root, 'source/manifest.json', output);
  assert.equal(result.status, 0, result.stderr);
  const first = JSON.parse(fs.readFileSync(output));
  const rules = first.clipboardData.copiedLayout.mainSelectorCollection.map;
  assert.equal(rules['screen/.brand-heading'].rules['font-size'].value, '35px');
  assert.equal(rules['(max-width: 767px)/.brand-heading'].rules['font-size'].value, '25px');
  assert.equal(first.syncPackage.namespace, 'sample-project');
  assert.notEqual(run('compile', root, 'source/manifest.json', output).status, 0);
  const secondPath = path.join(root, 'output/second.json');
  assert.equal(run('compile', root, 'source/manifest.json', secondPath).status, 0);
  const second = JSON.parse(fs.readFileSync(secondPath));
  assert.deepEqual(first.syncPackage.classes.map(x => x.stableKey), second.syncPackage.classes.map(x => x.stableKey));
  assert.equal(first.sourceRevision, second.sourceRevision);
});
test('blocks incompatible versions before writing a result', t => {
  const root = project(t); sources(root);
  const file = path.join(root, 'taptop.project.json');
  const config = JSON.parse(fs.readFileSync(file)); config.toolkitVersion = '99.0.0'; fs.writeFileSync(file, JSON.stringify(config));
  const result = run('compile', root, 'source/manifest.json', path.join(root, 'output/result.json'));
  assert.match(result.stderr, /INCOMPATIBLE_TOOLKIT/);
  assert.equal(fs.existsSync(path.join(root, 'output/result.json')), false);
});
test('blocks traversal and symlink input outside the project', t => {
  const root = project(t); const manifest = sources(root);
  manifest.html = '../outside.html'; fs.writeFileSync(path.join(root, 'source/manifest.json'), JSON.stringify(manifest));
  assert.notEqual(run('compile', root, 'source/manifest.json', path.join(root, 'output/a.json')).status, 0);
  manifest.html = 'source/escape.html'; fs.symlinkSync(__filename, path.join(root, manifest.html));
  fs.writeFileSync(path.join(root, 'source/manifest.json'), JSON.stringify(manifest));
  assert.match(run('compile', root, 'source/manifest.json', path.join(root, 'output/b.json')).stderr, /OUTSIDE_PROJECT/);
});
test('does not silently export scripts as a static success', t => {
  const root = project(t); sources(root);
  fs.writeFileSync(path.join(root, 'source/page.html'), '<section class="panel"><script>alert(1)</script></section>');
  const result = run('compile', root, 'source/manifest.json', path.join(root, 'output/result.json'));
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(path.join(root, 'output/result.json')), false);
});
test('packages a project image inside one JSON without a localhost reference', t => {
  const root = project(t); const manifest = sources(root);
  manifest.typographyCompositions = [];
  fs.writeFileSync(path.join(root, 'source/manifest.json'), JSON.stringify(manifest));
  fs.mkdirSync(path.join(root, 'source/assets'));
  fs.writeFileSync(path.join(root, 'source/assets/pixel.png'), PNG_1X1);
  fs.writeFileSync(path.join(root, 'source/page.html'), '<section class="panel" data-taptop-key="root"><img class="panel-image" data-taptop-key="image" src="assets/pixel.png" width="1" height="1" alt="Pixel"></section>');
  fs.appendFileSync(path.join(root, 'source/page.css'), '.panel-image { display: block; width: 1px; height: 1px; }');
  const output = path.join(root, 'output/layer.json');
  const result = run('compile', root, 'source/manifest.json', output);
  assert.equal(result.status, 0, result.stderr);
  const wrapper = JSON.parse(fs.readFileSync(output));
  assert.equal(wrapper.version, 2);
  assert.equal(wrapper.syncPackage.schemaVersion, 1);
  assert.equal(Object.hasOwn(wrapper.syncPackage, 'assets'), false);
  assert.equal(wrapper.embeddedAssets.length, 1);
  const [asset] = wrapper.embeddedAssets;
  assert.equal(asset.data, PNG_1X1.toString('base64'));
  assert.equal(asset.byteLength, PNG_1X1.length);
  assert.deepEqual(fs.readdirSync(path.join(root, 'output')), ['html', 'json', 'layer.json']);
  const tags = Object.values(wrapper.clipboardData.copiedLayout.tree.tags);
  const image = tags.find(tag => tag.widgetName === 'image__img');
  assert.equal(image.__pendingUpload.assetKey, asset.stableKey);
  assert.equal(JSON.stringify(wrapper).includes('localhost'), false);
});
test('refuses uncompiled CSS selectors and embedded resources instead of dropping them', t => {
  const root = project(t); sources(root);
  fs.appendFileSync(path.join(root, 'source/page.css'), 'h1 { color: red; }');
  let result = run('compile', root, 'source/manifest.json', path.join(root, 'output/result.json'));
  assert.match(result.stderr, /UNSUPPORTED_CSS_SELECTOR/);
  sources(root);
  fs.appendFileSync(path.join(root, 'source/page.css'), '.panel { background-image: url(image.png); }');
  result = run('compile', root, 'source/manifest.json', path.join(root, 'output/result.json'));
  assert.match(result.stderr, /UNSUPPORTED_CSS_VALUE/);
});
test('missing project typography is a blocking error', t => {
  const root = project(t); sources(root);
  fs.writeFileSync(path.join(root, 'source/page.css'), '.panel { display: block; } .headline { font-size: 30px; }');
  assert.match(run('compile', root, 'source/manifest.json', path.join(root, 'output/result.json')).stderr, /MISSING_PROJECT_TYPOGRAPHY/);
});
test('rejects grouped explicit selectors that the collector cannot preserve', t => {
  const root = project(t); const manifest = sources(root);
  manifest.selectorMappings = [{ sourceSelector: '.one, .two', targetClass: 'panel', channel: 'main' }];
  fs.writeFileSync(path.join(root, 'source/manifest.json'), JSON.stringify(manifest));
  fs.appendFileSync(path.join(root, 'source/page.css'), '.one, .two { color: red; }');
  assert.match(run('compile', root, 'source/manifest.json', path.join(root, 'output/result.json')).stderr, /UNSUPPORTED_CSS_SELECTOR/);
});
test('rejects ignored HTML attributes rather than losing visibility, anchors or link behavior', t => {
  const root = project(t); sources(root);
  for (const attr of ['hidden', 'disabled', 'id="destination"', 'target="_blank"']) {
    fs.writeFileSync(path.join(root, 'source/page.html'), `<section class="panel" ${attr}>Content</section>`);
    assert.match(run('compile', root, 'source/manifest.json', path.join(root, 'output/result.json')).stderr, /UNSUPPORTED_ATTRIBUTE/);
  }
});
