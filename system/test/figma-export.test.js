const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { addArtifact } = require('../lib/project-artifacts');
const { buildArtifact } = require('../lib/build-artifact');
const { doctorProject } = require('../lib/doctor-project');
const { figmaExport, figmaLink, mediaVerdict, parseWidths, scopedCss } = require('../lib/figma-export');
const { managedProject, write } = require('../test-support/managed-project');

// Synthetic block: a heading that uses the kit role, a card grid that changes
// at 767px, and one local image.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
async function builtBlock(t) {
  const { root } = managedProject(t);
  await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  write(root, 'input/promo/index.html', '<section class="promo"><span class="type-title">Example heading</span><div class="promo-grid"><p class="promo-text">First point</p><p class="promo-text">Second point</p></div><img class="promo-image" src="photo.png" alt="Example" width="1" height="1"><span class="promo-icon"><svg viewBox="0 0 20 20"><rect width="20" height="20"/></svg></span></section>');
  write(root, 'input/promo/styles.css', [
    '.promo { display: flex; flex-direction: column; row-gap: 24px; padding: 40px; }',
    '.promo-grid { display: flex; flex-direction: row; column-gap: 20px; }',
    '.promo-text { margin: 0; font-size: 16px; color: #333333; }',
    '.promo-image { width: 100%; }',
    '.promo-icon { width: 32px; height: 32px; }',
    '@media (max-width: 767px) { .promo-grid { flex-direction: column; } }'
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'input/promo/photo.png'), PIXEL);
  addArtifact(root, { key: 'components/promo', html: 'input/promo/index.html', stylesheets: ['design-system/roles.css', 'input/promo/styles.css'], dependsOn: ['ui-kit'] });
  const build = await buildArtifact({ projectRoot: root, artifactKey: 'components/promo' });
  return { root, build };
}

test('media queries resolve per width and selectors are scoped to that width copy', () => {
  assert.equal(mediaVerdict('(max-width: 767px)', 480), true);
  assert.equal(mediaVerdict('(max-width: 767px)', 768), false);
  assert.equal(mediaVerdict('screen and (min-width: 768px) and (max-width: 991px)', 800), true);
  assert.equal(mediaVerdict('print', 1440), false);
  assert.equal(mediaVerdict('(prefers-reduced-motion: reduce)', 1440), null);
  const css = scopedCss('body { margin: 0 } .a, .b > i { width: 50vw } @media (max-width: 479px) { .a { color: red } } @keyframes k { from { opacity: 0 } }', 370);
  assert.match(css, /\.figma-bp-370 \{ margin: 0 \}/);
  assert.match(css, /\.figma-bp-370 \.a, \.figma-bp-370 \.b > i \{ width: 185px \}/);
  assert.match(css, /\.figma-bp-370 \.a \{ color: red \}/);
  assert.doesNotMatch(css, /@media/);
  assert.match(css, /@keyframes k \{ from \{ opacity: 0 \} \}/);
  assert.doesNotMatch(scopedCss('@media (max-width: 479px) { .a { color: red } }', 1440), /red/);
  assert.deepEqual(parseWidths(undefined), [1440, 768, 480, 370]);
  assert.throws(() => parseWidths('1440,1440'), /FIGMA_WIDTHS_INVALID/);
  assert.throws(() => parseWidths('50'), /FIGMA_WIDTHS_INVALID/);
});

test('figma-export writes one self-contained width copy per canvas and a manifest of text roles', async t => {
  const { root, build } = await builtBlock(t);
  const result = await figmaExport({ projectRoot: root, artifactKey: 'components/promo' });
  assert.equal(result.status, 'written');
  assert.deepEqual(result.exports, [{ file: `output/figma/components--promo--${build.buildId}/export.html`, widths: [1440, 768, 480, 370] }]);
  const html = fs.readFileSync(path.join(root, result.exports[0].file), 'utf8');
  for (const width of [1440, 768, 480, 370]) assert.match(html, new RegExp(`class="figma-bp figma-bp-${width}" aria-label="Breakpoint=${width}" style="width:${width}px"`));
  assert.doesNotMatch(html, /@media \(max-width/);
  assert.doesNotMatch(html, /<script|<link /);
  assert.match(html, /src="data:image\/png;base64,/);
  assert.match(html, /aria-label="tt:1:type-title"/);
  assert.match(html, /aria-label="tt:2"/);
  // The 767px rule exists only in the copies at or below that width.
  assert.match(html, /\.figma-bp-480 \.promo-grid[^{]*\{[^}]*flex-direction: column/);
  assert.doesNotMatch(html, /\.figma-bp-768 \.promo-grid[^{]*\{[^}]*flex-direction: column/);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, result.manifest), 'utf8'));
  assert.equal(manifest.buildId, build.buildId);
  assert.equal(manifest.cssSelector, '.figma-bp');
  const title = manifest.textRoles.find(role => role.name === 'type-title');
  assert.deepEqual([title.widths[1440].fontSize, title.widths[370].fontSize, title.widths[370].lineHeight], [36, 28, 34]);
  assert.equal(title.widths[768].fontWeight, 800);
  assert.deepEqual(result.warnings.map(item => item.code), ['BLOCK_USAGE_MISSING']);
  assert.equal((await figmaExport({ projectRoot: root, artifactKey: 'components/promo' })).status, 'up-to-date');
});

test('an export too heavy for one Figma import is split into one document per width', async t => {
  const { root, build } = await builtBlock(t);
  // A 3 MB image embedded four times exceeds the 8 MB single-document limit.
  const big = Buffer.concat([PIXEL, Buffer.alloc(3 * 1024 * 1024)]);
  const preview = path.join(root, path.dirname(build.htmlPath));
  const image = fs.readdirSync(preview, { recursive: true }).find(name => String(name).endsWith('.png'));
  fs.writeFileSync(path.join(preview, String(image)), big);
  const result = await figmaExport({ projectRoot: root, artifactKey: 'components/promo' });
  assert.deepEqual(result.exports.map(item => item.widths), [[1440], [768], [480], [370]]);
  for (const item of result.exports) {
    const html = fs.readFileSync(path.join(root, item.file), 'utf8');
    assert.equal((html.match(/class="figma-bp /g) || []).length, 1);
    assert.match(html, new RegExp(`figma-bp-${item.widths[0]}"`));
  }
  assert.equal(fs.existsSync(path.join(root, path.dirname(result.manifest), 'export.html')), false);
});

test('a CSS background the build left out of the preview is taken from the sources and reported', async t => {
  const { root } = managedProject(t);
  await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  write(root, 'input/cover/index.html', '<section class="cover"><p class="cover-text">Cover</p></section>');
  write(root, 'input/cover/styles.css', '.cover { display: flex; padding: 40px; background-image: url(assets/bg.png); }\n.cover-text { margin: 0; }');
  fs.mkdirSync(path.join(root, 'input/cover/assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'input/cover/assets/bg.png'), PIXEL);
  addArtifact(root, { key: 'components/cover', html: 'input/cover/index.html', stylesheets: ['design-system/roles.css', 'input/cover/styles.css'], dependsOn: ['ui-kit'] });
  const build = await buildArtifact({ projectRoot: root, artifactKey: 'components/cover' });
  // The build moves the background to the Embed and does not copy the file.
  assert.equal(fs.existsSync(path.join(root, path.dirname(build.htmlPath), 'assets/bg.png')), false);
  const result = await figmaExport({ projectRoot: root, artifactKey: 'components/cover' });
  const html = fs.readFileSync(path.join(root, result.exports[0].file), 'utf8');
  // Figma keeps large <img> but drops large CSS backgrounds: the background
  // becomes an image layer behind the content.
  assert.match(html, /<section class="cover[^"]*"[^>]*style="position:relative;isolation:isolate"><img src="data:image\/png;base64,[^"]+" alt="" aria-label="Background image" style="position:absolute;inset:0;/);
  assert.match(html, /background-image: none/);
  assert.doesNotMatch(html, /background-image: url\("data:/);
  const warning = result.warnings.find(item => item.code === 'FIGMA_IMAGE_FROM_SOURCE');
  assert.match(warning.message, /input\/cover\/assets\/bg\.png/);
  // A JPEG saved under a .png name is declared by its content.
  fs.writeFileSync(path.join(root, 'input/cover/assets/bg.png'), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]));
  const again = await figmaExport({ projectRoot: root, artifactKey: 'components/cover' });
  assert.match(fs.readFileSync(path.join(root, again.exports[0].file), 'utf8'), /src="data:image\/jpeg;base64,/);
});

test('translucent colour runs of a mixed text are listed for Figma, and a background icon keeps its size and place', async t => {
  const { root } = managedProject(t);
  await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  write(root, 'input/note/index.html', '<section class="note"><h2 class="note-title"><span class="note-strong">Bold start.</span> Muted   rest of the line.</h2><p class="note-badge">Done</p></section>');
  write(root, 'input/note/styles.css', [
    '.note { display: flex; flex-direction: column; padding: 40px; }',
    '.note-title { margin: 0; color: rgba(11, 11, 14, 0.5); }',
    '.note-strong { color: #0B0B0E; }',
    ".note-badge { margin: 0; padding: 4px 8px 4px 28px; background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14'%3E%3C/svg%3E\"); background-repeat: no-repeat; background-position: 9px 50%; }"
  ].join('\n'));
  addArtifact(root, { key: 'components/note', html: 'input/note/index.html', stylesheets: ['design-system/roles.css', 'input/note/styles.css'], dependsOn: ['ui-kit'] });
  await buildArtifact({ projectRoot: root, artifactKey: 'components/note' });
  const result = await figmaExport({ projectRoot: root, artifactKey: 'components/note' });
  assert.equal(result.textRuns, 1);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, result.manifest), 'utf8'));
  assert.deepEqual(Object.values(manifest.textRuns), [[{ text: 'Muted rest of the line.', color: '#0b0b0e', alpha: 0.5 }]]);
  const html = fs.readFileSync(path.join(root, result.exports[0].file), 'utf8');
  // Not stretched over the badge: 14 px at 9 px from the left, centred vertically.
  assert.match(html, /aria-label="Background icon" style="position:absolute;left:9px;top:50%;width:14px;height:14px;transform:translate\(0,-50%\)/);
  assert.doesNotMatch(html, /aria-label="Background image"/);
  const source = fs.readFileSync(path.join(__dirname, '../figma/assemble-block.js'), 'utf8');
  assert.match(source, /async function restoreRuns[\s\S]*setRangeFills\(start, end, \[paint\]\)/);
  assert.match(source, /await restoreRuns\(variants, B\.runs \|\| P\.runs\);\n\s+await bindTexts\(variants\)/);
});

test('usage notes go into the manifest; a malformed usage file stops the export', async t => {
  const { root } = await builtBlock(t);
  write(root, 'design-system/block-usage.json', JSON.stringify({ 'components/promo': { name: 'Section / Promo', category: 'Features', use: ['Explain two points side by side'], avoid: ['A process with steps'] } }));
  const result = await figmaExport({ projectRoot: root, artifactKey: 'components/promo' });
  assert.deepEqual(result.warnings, []);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, result.manifest), 'utf8'));
  assert.equal(manifest.title, 'Section / Promo');
  assert.deepEqual(manifest.usage.use, ['Explain two points side by side']);
  write(root, 'design-system/block-usage.json', JSON.stringify({ 'components/promo': { use: [] } }));
  await assert.rejects(figmaExport({ projectRoot: root, artifactKey: 'components/promo' }), /BLOCK_USAGE_INVALID/);
  write(root, 'design-system/block-usage.json', JSON.stringify({ 'components/promo': { use: ['x'], colour: 'red' } }));
  await assert.rejects(figmaExport({ projectRoot: root, artifactKey: 'components/promo' }), /BLOCK_USAGE_INVALID: .*unknown field colour/);
});

test('only a current build is exported', async t => {
  const { root } = await builtBlock(t);
  write(root, 'input/promo/styles.css', `${fs.readFileSync(path.join(root, 'input/promo/styles.css'), 'utf8')}\n.promo { row-gap: 32px; }`);
  await assert.rejects(figmaExport({ projectRoot: root, artifactKey: 'components/promo' }), /FIGMA_EXPORT_NEEDS_CURRENT_BUILD: components\/promo is stale/);
  await assert.rejects(figmaExport({ projectRoot: root, artifactKey: 'components/none' }), /UNKNOWN_ARTIFACT/);
});

test('figma-link records the linked build and doctor reports when the block moves on', async t => {
  const { root, build } = await builtBlock(t);
  assert.throws(() => figmaLink({ projectRoot: root, artifactKey: 'components/promo', fileKey: 'short', nodeId: '1:2' }), /FIGMA_LINK_INVALID/);
  assert.throws(() => figmaLink({ projectRoot: root, artifactKey: 'components/promo', fileKey: 'A'.repeat(22), nodeId: 'node' }), /FIGMA_LINK_INVALID/);
  const link = figmaLink({ projectRoot: root, artifactKey: 'components/promo', fileKey: 'A'.repeat(22), nodeId: '12-34' });
  assert.equal(link.nodeId, '12:34');
  assert.equal(link.buildId, build.buildId);
  assert.equal(link.url, `https://www.figma.com/design/${'A'.repeat(22)}?node-id=12-34`);
  assert.deepEqual(doctorProject(root).issues.filter(item => item.code.startsWith('FIGMA_')), []);
  write(root, 'input/promo/styles.css', `${fs.readFileSync(path.join(root, 'input/promo/styles.css'), 'utf8')}\n.promo { row-gap: 32px; }`);
  await buildArtifact({ projectRoot: root, artifactKey: 'components/promo' });
  const stale = doctorProject(root).issues.find(item => item.code === 'FIGMA_LINK_STALE');
  assert.equal(stale.path, 'components/promo');
  assert.match(stale.nextAction, /figma-export/);
  write(root, 'design-system/figma-library.json', '{"links": []}');
  assert.ok(doctorProject(root).issues.some(item => item.code === 'FIGMA_LIBRARY_INVALID'));
});

test('the UI kit exports foundations and one frame per distinct kit element', async t => {
  const { root } = managedProject(t);
  const kit = await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  const data = JSON.parse(fs.readFileSync(path.join(root, 'design-system/kit.json'), 'utf8'));
  data.colors = [{ title: 'Core', items: [{ name: 'ink', value: '#222222' }] }];
  data.components[0].panels.push({ label: 'Again', rows: [[{ tag: 'button', classes: ['btn'], text: 'Continue' }]] });
  write(root, 'design-system/kit.json', JSON.stringify(data));
  const result = await figmaExport({ projectRoot: root, artifactKey: 'ui-kit' });
  assert.equal(result.buildId, kit.buildId);
  assert.deepEqual(result.exports.map(item => [path.basename(item.file), item.cssSelector]), [['foundations.html', '.figma-sheet'], ['components.html', '.figma-item']]);
  const foundations = fs.readFileSync(path.join(root, result.exports[0].file), 'utf8');
  assert.match(foundations, /aria-label="Foundations \/ Colors"/);
  assert.match(foundations, /aria-label="color\/ink"/);
  assert.match(foundations, /class="fx-sample type-title"/);
  assert.match(foundations, /1440: 36\/44 · 768: 36\/44 · 480: 36\/44 · 370: 28\/34 · 800/);
  const components = fs.readFileSync(path.join(root, result.exports[1].file), 'utf8');
  assert.equal((components.match(/aria-label="Buttons \| btn"/g) || []).length, 1);
  assert.match(components, /aria-label="Buttons \| btn btn--secondary"><button class="btn btn--secondary">Later<\/button>/);
});

test('an inline svg carries its viewBox for the Figma assembly script, which scales the content to the frame', async t => {
  const { root } = await builtBlock(t);
  const result = await figmaExport({ projectRoot: root, artifactKey: 'components/promo' });
  const html = fs.readFileSync(path.join(root, result.exports[0].file), 'utf8');
  assert.match(html, /<svg[^>]*aria-label="svg:20:20"/);
  const source = fs.readFileSync(path.join(__dirname, '../figma/assemble-block.js'), 'utf8');
  assert.match(source, /function fitSvgFrames[\s\S]*child\.rescale\(k\)/);
  assert.match(source, /fitSvgFrames\(frame\);\n\s+frames\.push\(frame\)/);
});

test('the Figma-to-HTML converter is plain plugin code that parses and keeps no client values', () => {
  const source = fs.readFileSync(path.join(__dirname, '../figma/convert-set.js'), 'utf8');
  assert.doesNotThrow(() => new Function('PARAMS', 'figma', `return (async () => {\n${source}\n})`));
  assert.doesNotMatch(source.replace(/^\s*\/\/.*$/gm, ''), /Inter Tight|Atoms\/Button|display--lg/, 'role names, fonts and component names come from PARAMS');
  // An image-fill layer is positioned at every width, so no breakpoint resets it to static.
  assert.match(source, /for \(let i = 0; i < 4; i\+\+\) \{\n\s+put\(c2, i, 'display'[^\n]*\n\s+for \(const \[prop, value\] of \[\['position', 'absolute'\]/);
});

test('write-block expands a compact converter result into component sources', t => {
  const { writeBlock } = require('../figma/write-block');
  const root = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'write-block-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = {
    prefix: 'demo', set: 'demo 1:2',
    html: '<section class="demo"><p class="text--md-400 §1">Hello</p><img class="§2" src="images/m-2.png" alt=""></section>',
    css: '.demo{0,1}\n.§1{2}\n\n@media (max-width: 767px) {\n.§1{3}\n}',
    dict: ['width: 100%', 'display: flex', 'margin: 0', 'text-align: center'],
    media: { 'm-2.png': { id: '1:5' } }, mismatch: [], heights: [100, 100, 80, 80],
  };
  const written = writeBlock({ projectRoot: root, result, title: 'Demo' });
  const html = fs.readFileSync(path.join(written.dir, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(written.dir, 'styles.css'), 'utf8');
  assert.match(html, /<p class="text--md-400 demo__1">Hello<\/p>/);
  assert.match(css, /\.demo \{ width: 100%; display: flex; \}/);
  assert.match(css, /@media \(max-width: 767px\) \{\n\.demo__1 \{ text-align: center; \}\n\}/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(written.dir, 'media.json'), 'utf8')), result.media);
  assert.ok(fs.existsSync(path.join(written.dir, 'images')));
});

test('the Figma assembly script is plain plugin code that parses', () => {
  const source = fs.readFileSync(path.join(__dirname, '../figma/assemble-block.js'), 'utf8');
  assert.doesNotThrow(() => new Function('PARAMS', 'figma', `return (async () => {\n${source}\n})`));
  assert.match(source, /setExplicitVariableModeForCollection/);
});
