const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { renderUiKit, renderUiKitDocument } = require('../lib/ui-kit/render');
const { DEFAULT_KIT } = require('../lib/ui-kit/default-kit');
const { writeUiKit } = require('../lib/ui-kit/write');
const { compileProject } = require('../lib/compile-project');
const { normalizeProject } = require('../lib/normalize-project');
const { normalizeHtmlSource } = require('../lib/html-normalizer');
const { projectKit } = require('../lib/ui-kit/project-kit');

const example = path.join(__dirname, '..', 'examples', 'ui-kit-default');

test('default kit is titled UI Kit with plain descriptions and no iconography description', () => {
  const { html, sections } = renderUiKit(DEFAULT_KIT);
  assert.match(html, /<h1 class="kit-title"[^>]*>UI Kit<\/h1>/);
  assert.deepEqual(sections, ['colors', 'type', 'spacing', 'radius', 'elevation', 'icons', 'buttons', 'inputs', 'selectors', 'badges', 'alerts', 'cards', 'nav', 'tabs', 'table', 'avatar', 'feedback']);
  const icons = html.slice(html.indexOf('kit-section--icons'), html.indexOf('kit-section--buttons'));
  assert.doesNotMatch(icons, /kit-section-text/);
});

test('the primary font replaces Inter Tight everywhere and JetBrains Mono always stays', () => {
  const { css, html } = renderUiKitDocument({ ...DEFAULT_KIT, fonts: { primary: 'Manrope' } });
  assert.doesNotMatch(css, /Inter Tight/);
  assert.doesNotMatch(html, /Inter Tight/);
  assert.match(css, /font-family: Manrope;/);
  assert.match(css, /font-family: JetBrains Mono;/);
  assert.match(html, /family=Manrope:wght/);
  assert.match(html, /family=JetBrains\+Mono:wght/);
  assert.match(html, />Manrope · JetBrains Mono</);
});

test('sections and navigation entries exist only for supplied data', () => {
  const kit = { projectName: 'Studio', fonts: { primary: 'Manrope' }, colors: [{ title: 'Brand', layout: 'tokens', items: [{ name: 'brand', value: '#3290ff' }] }], typography: [], components: [] };
  const { html, sections } = renderUiKit(kit);
  assert.deepEqual(sections, ['colors']);
  assert.match(html, /href="#colors"/);
  assert.doesNotMatch(html, /href="#buttons"|kit-section--type|>Components</);
});

test('the generated kit normalizes cleanly and opens its menu on phones', async () => {
  const { css, html } = renderUiKitDocument(DEFAULT_KIT);
  assert.doesNotMatch(css, /var\(|url\(|clamp\(|!important|@font-face|@keyframes/);
  assert.doesNotMatch(html, /style=|<script|<input|<select|<textarea| id=/);
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  assert.equal(result.report.ok, true, JSON.stringify(result.report.items.filter(item => item.level === 'error')));
  assert.deepEqual(result.behaviors.behaviors.map(item => [item.adapter, item.config]), [['taptop/embed-menu-v1', { rootClass: 'kit', toggleClass: 'kit-burger', panelClass: 'kit-sidebar', openClass: 'is-open', backdropClass: 'kit-backdrop', anchorPrefix: 'kit-section--' }]]);
  assert.match(result.embedCss, /\.kit\.is-open \.kit-sidebar \{[^}]*position: fixed/);
});

test('typography specs do not use an auto margin that overrides their phone breakpoint', async () => {
  const { css, html } = renderUiKitDocument(DEFAULT_KIT);
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  assert.doesNotMatch(result.embedCss, /\.kit-type-spec \{[^}]*margin-left:\s*auto/);
});

test('project kit data fills the same shell with the project role classes', () => {
  const kit = projectKit({
    projectName: 'Studio', fonts: { primary: 'Manrope' },
    colors: [{ title: 'Palette', layout: 'ramp', items: [{ name: 'ink', value: '#111111' }] }],
    typography: [{ className: 'type-title', spec: '40 / 400' }],
    components: [{ id: 'buttons', title: 'Buttons', panels: [{ label: 'Primary', rows: [[{ tag: 'a', classes: ['cta'], text: 'Buy' }, { tag: 'a', classes: ['cta', 'cta--hover'], text: 'Hover' }]] }] }]
  }, '.cta { color: #111111; }\n.cta:hover { color: #222222; }');
  const { html, css, sections } = renderUiKit(kit);
  assert.deepEqual(sections, ['colors', 'type', 'buttons']);
  assert.match(html, /<a class="cta cta--hover"[^>]*href="#">Hover<\/a>/);
  assert.match(html, /class="kit-type-sample type-title"/);
  assert.match(css, /\.cta:hover \{ color: #222222; \}/);
  assert.match(html, /class="kit" [^>]*data-taptop-behavior="menu"/);
});

test('the checked-in default example matches the generator', () => {
  const { html, css } = renderUiKitDocument(DEFAULT_KIT);
  assert.equal(fs.readFileSync(path.join(example, 'source', 'ui-kit.html'), 'utf8'), html);
  assert.equal(fs.readFileSync(path.join(example, 'source', 'ui-kit.css'), 'utf8'), css);
});

test('the default kit compiles into a valid Taptop package', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-ui-kit-'));
  fs.writeFileSync(path.join(root, 'taptop.project.json'), fs.readFileSync(path.join(example, 'taptop.project.json')));
  fs.mkdirSync(path.join(root, 'source'));
  for (const file of ['ui-kit.html', 'ui-kit.css']) fs.copyFileSync(path.join(example, 'source', file), path.join(root, 'source', file));
  const normalized = await normalizeProject(root, 'source/ui-kit.html', 'source/ui-kit.css');
  assert.equal(normalized.ok, true);
  const result = await compileProject(root, normalized.manifest, path.join(root, 'ui-kit.json'));
  assert.ok(JSON.parse(fs.readFileSync(path.join(root, 'ui-kit.json'), 'utf8')).behaviorPackages.some(item => /behavior-menu/.test(JSON.stringify(item).slice(0, 4000)) || /taptopMenuBound/.test(JSON.stringify(item))));
  assert.ok(result.nodes > 400);
  assert.ok(result.classes > 200);
});

test('writeUiKit creates the kit in a project without overwriting', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-ui-kit-write-'));
  fs.writeFileSync(path.join(root, 'taptop.project.json'), fs.readFileSync(path.join(example, 'taptop.project.json')));
  const files = writeUiKit(root, { font: 'Manrope' });
  assert.deepEqual(files, ['source/ui-kit/ui-kit.html', 'source/ui-kit/ui-kit.css']);
  assert.match(fs.readFileSync(path.join(root, 'source/ui-kit/ui-kit.css'), 'utf8'), /font-family: Manrope;/);
  assert.throws(() => writeUiKit(root, { font: 'Manrope' }), /UI_KIT_EXISTS/);
});

// Taptop pages use `* { box-sizing: border-box }`, the local original does not:
// a fixed-size box with a border is 1px taller in the original than in Taptop
// unless the generator states border-box itself (found 2026-10-11: colour token
// preview 65px vs 64px, one difference per token row in the comparison).
test('every fixed-size shell box with a border states border-box sizing', () => {
  const { css } = renderUiKitDocument({ ...DEFAULT_KIT, colors: [{ title: 'Tokens', layout: 'tokens', items: [{ name: 'brand', value: '#3290ff' }] }] });
  const offenders = [];
  for (const [, selector, body] of css.matchAll(/(^|\n)\s*([^{}@]+?)\s*\{([^{}]*)\}/g).map(m => [m[0], m[2], m[3]])) {
    const fixed = /(^|[;\s])(height|width):\s*\d+(\.\d+)?px/.test(body);
    const bordered = /border(-(top|right|bottom|left))?-width:\s*(?!0px)\d/.test(body);
    if (selector.trim().startsWith('.kit-') && fixed && bordered && !/box-sizing:\s*border-box/.test(body)) offenders.push(selector.trim());
  }
  assert.deepEqual(offenders, []);
});
