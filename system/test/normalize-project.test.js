const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { version } = require('../../package.json');
const { normalizeProject } = require('../lib/normalize-project');

test('normalizing a page carries its local image beside prepared HTML', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-normalize-'));
  try {
    fs.mkdirSync(path.join(root, 'source/assets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'taptop.project.json'), JSON.stringify({ schemaVersion: 1, toolkitVersion: version, namespace: 'asset-test' }));
    fs.writeFileSync(path.join(root, 'source/index.html'), '<div class="page"><img class="hero-image" src="assets/pixel.png" width="1" height="1" alt=""></div>');
    fs.writeFileSync(path.join(root, 'source/styles.css'), '.page { display: block; } .hero-image { display: block; }');
    const bytes = Buffer.from([137, 80, 78, 71]);
    fs.writeFileSync(path.join(root, 'source/assets/pixel.png'), bytes);

    await normalizeProject(root, 'source/index.html', 'source/styles.css', { rootSelector: '.page' });
    assert.deepEqual(fs.readFileSync(path.join(root, 'source/normalized/assets/pixel.png')), bytes);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('normalizing never writes through a source directory that links outside the project', async t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-normalize-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'site');
  const outside = path.join(parent, 'outside');
  fs.mkdirSync(path.join(root, 'input'), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(root, 'taptop.project.json'), JSON.stringify({ schemaVersion: 1, toolkitVersion: version, namespace: 'link-test' }));
  fs.writeFileSync(path.join(root, 'input/page.html'), '<section class="page"><p class="copy">Text</p></section>');
  fs.writeFileSync(path.join(root, 'input/page.css'), '.page { display: block; } .copy { color: #111111; }');
  fs.symlinkSync(outside, path.join(root, 'source'));

  await assert.rejects(normalizeProject(root, 'input/page.html', 'input/page.css'), /UNSAFE_PROJECT_PATH/);
  assert.deepEqual(fs.readdirSync(outside), []);
});
