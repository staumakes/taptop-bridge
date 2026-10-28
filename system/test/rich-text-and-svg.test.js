const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { addArtifact } = require('../lib/project-artifacts');
const { buildArtifact } = require('../lib/build-artifact');
const { managedProject, write } = require('../test-support/managed-project');

// Formats observed in a disposable Taptop project on 2026-10-11 (native copy,
// save, reload): Rich Text is one tt_rich_text tag whose data.text is
// { type: 'RICH_TEXT', value: '<html>' }; SVG Icon is one tt_svg_icon <span>
// with class svg-icon and data.text { type: 'HTML', value: '<svg …>' }.
test('rich text and inline SVG compile to the native Taptop widgets', async t => {
  const { root } = managedProject(t);
  write(root, 'input/page/index.html', '<section class="hero"><p class="lead">Start <strong>now</strong><br>and <span class="chip">FBS</span></p><svg class="hero-icon" width="24" height="24" viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg></section>');
  write(root, 'input/page/styles.css', '.hero { display: block; } .lead { font-size: 20px; line-height: 28px; } .chip { background-color: #ebf4ff; } .hero-icon { display: block; }');
  addArtifact(root, { key: 'pages/page', html: 'input/page/index.html', stylesheets: ['input/page/styles.css'] });
  const result = await buildArtifact({ projectRoot: root, artifactKey: 'pages/page' });
  const pkg = JSON.parse(fs.readFileSync(path.join(root, result.jsonPath), 'utf8'));
  const tags = Object.values(pkg.clipboardData.copiedLayout.tree.tags);
  const rich = tags.find(tag => tag.widgetName === 'tt_rich_text');
  assert.ok(rich, 'a tt_rich_text tag is built');
  assert.equal(rich.type, 'tt_rich_text');
  assert.equal(rich.className, 'tt-rich-text');
  assert.deepEqual(rich.data.text, { type: 'RICH_TEXT', value: 'Start <strong>now</strong><br>and <span class="chip">FBS</span>' });
  assert.deepEqual(rich.can, ['SELECT', 'SET_RICH_TEXT']);
  assert.equal(rich.children.length, 0);
  const icon = tags.find(tag => tag.widgetName === 'tt_svg_icon');
  assert.ok(icon, 'a tt_svg_icon tag is built');
  assert.equal(icon.tagName, 'span');
  assert.equal(icon.className, 'svg-icon');
  assert.equal(icon.data.text.type, 'HTML');
  assert.match(icon.data.text.value, /^<svg width="24" height="24" viewBox="0 0 24 24"><path d="M1 1h22v22H1z"><\/path><\/svg>$/);
  assert.deepEqual(icon.can, ['SELECT', 'SET_ATTR_SRC_SVG']);
  assert.ok(pkg.syncPackage.classes.some(item => item.name === 'hero-icon'));
  assert.ok((pkg.behaviorPackages || []).some(item => JSON.stringify(item).includes('.chip')), 'the inner rich-text class travels in the embed stylesheet');
});

test('an image without width/height attributes takes its intrinsic size from the file', async t => {
  const { root } = managedProject(t);
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
  write(root, 'input/logo/images/logo.png', png);
  write(root, 'input/logo/index.html', '<header class="top"><img class="logo" src="images/logo.png" alt="Logo"></header>');
  write(root, 'input/logo/styles.css', '.top { display: block; } .logo { width: 120px; height: 32px; }');
  addArtifact(root, { key: 'pages/logo', html: 'input/logo/index.html', stylesheets: ['input/logo/styles.css'] });
  const result = await buildArtifact({ projectRoot: root, artifactKey: 'pages/logo' });
  const pkg = JSON.parse(fs.readFileSync(path.join(root, result.jsonPath), 'utf8'));
  const image = Object.values(pkg.clipboardData.copiedLayout.tree.tags).find(tag => tag.widgetName === 'tt_image');
  assert.equal(image.widgetSettings.screen.maxWidth, '1');
  assert.equal(image.widgetSettings.screen.maxHeight, '1');
});
