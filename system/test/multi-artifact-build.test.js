const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { version } = require('../../package.json');
const { addArtifact } = require('../lib/project-artifacts');
const { buildArtifact } = require('../lib/build-artifact');
const { readCatalog, artifactStatuses } = require('../lib/output-catalog');
const { initProject } = require('../lib/project');
const { managedProject, pageHtml, tempWorkspace, write, ROLE_CSS } = require('../test-support/managed-project');

const json = (root, file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const listing = root => ['output/html', 'output/json'].flatMap(dir => fs.readdirSync(path.join(root, dir)).map(name => `${dir}/${name}`)).sort();

function addPage(root, slug, { html = pageHtml(`${slug}-page`), css = '', dependsOn = ['ui-kit'], folder = `input/${slug}` } = {}) {
  write(root, `${folder}/index.html`, html);
  write(root, `${folder}/styles.css`, `.${slug}-page { display: flex; flex-direction: column; row-gap: 16px; }\n${css}`);
  return addArtifact(root, { key: `pages/${slug}`, html: `${folder}/index.html`, stylesheets: ['design-system/roles.css', `${folder}/styles.css`], dependsOn });
}

test('the UI-kit generator registers its artifact once', t => {
  const { root } = managedProject(t);
  assert.deepEqual(json(root, 'source/artifacts.json').artifacts.map(item => item.key), ['ui-kit']);
});

test('UI kit then two index.html pages build into separate paired outputs with shared class identities', async t => {
  const { root } = managedProject(t);
  const kit = await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  assert.equal(kit.status, 'built');
  addPage(root, 'home');
  addPage(root, 'about');
  const home = await buildArtifact({ projectRoot: root, artifactKey: 'pages/home' });
  const about = await buildArtifact({ projectRoot: root, artifactKey: 'pages/about' });
  for (const result of [kit, home, about]) {
    assert.match(result.buildId, /^\d{8}T\d{6}Z-[a-f0-9]{8}$/);
    assert.equal(result.jsonPath, `output/json/${result.slug}--${result.buildId}.json`);
    assert.equal(result.htmlPath, `output/html/${result.slug}--${result.buildId}/page.html`);
    assert.ok(fs.existsSync(path.join(root, result.jsonPath)));
    assert.ok(fs.existsSync(path.join(root, result.htmlPath)));
    assert.ok(fs.existsSync(path.join(root, path.dirname(result.htmlPath), 'taptop-preview.css')));
  }
  const kitPackage = json(root, kit.jsonPath);
  const homePackage = json(root, home.jsonPath);
  const aboutPackage = json(root, about.jsonPath);
  assert.equal(homePackage.syncPackage.componentKey, 'synthetic-site/pages/home');
  assert.equal(aboutPackage.syncPackage.componentKey, 'synthetic-site/pages/about');
  const kitClasses = new Map(kitPackage.syncPackage.classes.map(item => [item.name, item]));
  for (const pagePackage of [homePackage, aboutPackage]) {
    for (const name of ['type-title', 'btn', 'btn--secondary', 'text-link']) {
      const role = pagePackage.syncPackage.classes.find(item => item.name === name);
      assert.ok(role, `${name} missing`);
      assert.equal(role.stableKey, `synthetic-site/class/${name}`);
      assert.equal(kitClasses.get(name).stableKey, role.stableKey);
      assert.deepEqual(role.ownedRules, kitClasses.get(name).ownedRules, `${name} differs from the UI kit`);
    }
  }
  const catalog = readCatalog(root);
  assert.equal(catalog.artifacts['pages/home'].current, home.buildId);
  assert.deepEqual(catalog.artifacts['pages/home'].builds[0].dependencies, { 'ui-kit': kit.buildId });
  assert.equal(catalog.artifacts['pages/home'].builds[0].toolkitVersion, version);
  const index = fs.readFileSync(path.join(root, 'output/html/index.html'), 'utf8');
  for (const result of [kit, home, about]) {
    assert.ok(index.includes(`href="${result.slug}--${result.buildId}/page.html"`));
    assert.ok(index.includes(`href="../json/${result.slug}--${result.buildId}.json"`));
  }
  assert.deepEqual(artifactStatuses(root).map(item => [item.key, item.status]), [['pages/about', 'current'], ['pages/home', 'current'], ['ui-kit', 'current']]);
});

test('a repeated build with unchanged inputs keeps the same revision and publishes nothing', async t => {
  const { root } = managedProject(t);
  const first = await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  const before = listing(root);
  const second = await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  assert.equal(second.status, 'up-to-date');
  assert.equal(second.buildId, first.buildId);
  assert.equal(second.sourceRevision, first.sourceRevision);
  assert.deepEqual(listing(root), before);
});

test('a page that needs the UI kit cannot build before it, and the error names the next step', async t => {
  const { root } = managedProject(t);
  addPage(root, 'home');
  await assert.rejects(buildArtifact({ projectRoot: root, artifactKey: 'pages/home' }), /DEPENDENCY_NOT_BUILT: ui-kit/);
  assert.deepEqual(listing(root), []);
});

test('a failure halfway keeps the previous result current and hides the partial output', async t => {
  const { root } = managedProject(t);
  const kit = await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  addPage(root, 'home');
  const good = await buildArtifact({ projectRoot: root, artifactKey: 'pages/home' });
  const catalogBefore = fs.readFileSync(path.join(root, '.taptop/outputs.json'), 'utf8');
  write(root, 'input/home/index.html', pageHtml('home-page', 'Changed heading'));
  for (const step of ['normalized', 'compiled', 'preview-assembled', 'outputs-copied']) {
    await assert.rejects(buildArtifact({ projectRoot: root, artifactKey: 'pages/home', failAfter: step }), new RegExp(`INJECTED_FAILURE: ${step}`));
    assert.equal(fs.readFileSync(path.join(root, '.taptop/outputs.json'), 'utf8'), catalogBefore, step);
    assert.equal(fs.existsSync(path.join(root, '.taptop/lock')), false, `lock left after ${step}`);
    assert.equal(readCatalog(root).artifacts['pages/home'].current, good.buildId);
  }
  assert.equal(artifactStatuses(root).find(item => item.key === 'pages/home').status, 'stale');
  const recovered = await buildArtifact({ projectRoot: root, artifactKey: 'pages/home' });
  assert.equal(recovered.status, 'built');
  assert.notEqual(recovered.buildId, good.buildId);
  assert.ok(fs.existsSync(path.join(root, good.jsonPath)), 'previous JSON must remain');
  assert.equal(readCatalog(root).artifacts['pages/home'].builds.length, 2);
  assert.equal(kit.status, 'built');
});

test('a changed UI kit marks pages stale and a page keeping old role rules is refused', async t => {
  const { root } = managedProject(t);
  await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  write(root, 'input/home/roles-copy.css', ROLE_CSS);
  write(root, 'input/home/index.html', pageHtml('home-page'));
  write(root, 'input/home/styles.css', '.home-page { display: flex; }');
  addArtifact(root, { key: 'pages/home', html: 'input/home/index.html', stylesheets: ['input/home/roles-copy.css', 'input/home/styles.css'], dependsOn: ['ui-kit'] });
  await buildArtifact({ projectRoot: root, artifactKey: 'pages/home' });
  write(root, 'design-system/roles.css', ROLE_CSS.replace('#426e51', '#7a3f8c'));
  const { writeUiKit } = require('../lib/ui-kit/write');
  writeUiKit(root, { data: 'design-system/kit.json', replace: true });
  const changedKit = await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  assert.equal(changedKit.status, 'built');
  assert.equal(artifactStatuses(root).find(item => item.key === 'pages/home').status, 'stale');
  await assert.rejects(buildArtifact({ projectRoot: root, artifactKey: 'pages/home' }), /UI_KIT_CLASS_MISMATCH: btn--secondary/);
  write(root, 'input/home/roles-copy.css', ROLE_CSS.replace('#426e51', '#7a3f8c'));
  assert.equal((await buildArtifact({ projectRoot: root, artifactKey: 'pages/home' })).status, 'built');
});

test('two pages that disagree about a shared class are refused; system class names are renamed', async t => {
  const { root } = managedProject(t);
  await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  addPage(root, 'home', { html: '<section class="home-page"><p class="card-title">One</p></section>', css: '.card-title { color: #222222; }' });
  addPage(root, 'about', { html: '<section class="about-page"><p class="card-title">Two</p></section>', css: '.card-title { color: #993322; }' });
  await buildArtifact({ projectRoot: root, artifactKey: 'pages/home' });
  await assert.rejects(buildArtifact({ projectRoot: root, artifactKey: 'pages/about' }), /CLASS_RULE_CONFLICT: card-title .*pages\/home/);
  addPage(root, 'contact', { html: '<section class="contact-page"><p class="text">Hi</p><a class="button" href="#">Go</a></section>', css: '.text { color: #222222; }\n.button { display: inline-flex; padding: 8px 12px; }' });
  const contact = await buildArtifact({ projectRoot: root, artifactKey: 'pages/contact' });
  const names = json(root, contact.jsonPath).syncPackage.classes.map(item => item.name);
  assert.ok(names.includes('u-text') && names.includes('u-button'), names.join(','));
  assert.equal(names.includes('text') || names.includes('button'), false, 'Taptop system classes never become project classes');
});

test('local images travel with the preview and the package; unsupported HTML leaves no output', async t => {
  const { root } = managedProject(t);
  await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
  write(root, 'input/gallery/images/dot.png', png);
  addPage(root, 'gallery', { folder: 'input/gallery', html: '<section class="gallery-page"><img class="gallery-image" src="images/dot.png" width="1" height="1" alt=""></section>', css: '.gallery-image { display: block; }' });
  const gallery = await buildArtifact({ projectRoot: root, artifactKey: 'pages/gallery' });
  assert.deepEqual(fs.readFileSync(path.join(root, path.dirname(gallery.htmlPath), 'images/dot.png')), png);
  assert.equal(json(root, gallery.jsonPath).embeddedAssets.length, 1);
  assert.deepEqual(readCatalog(root).artifacts['pages/gallery'].builds[0].inputs.map(item => item.path).sort(), ['design-system/roles.css', 'input/gallery/images/dot.png', 'input/gallery/index.html', 'input/gallery/styles.css']);
  write(root, 'input/gallery/images/dot.png', Buffer.concat([png, Buffer.from([0])]));
  assert.equal(artifactStatuses(root).find(item => item.key === 'pages/gallery').status, 'stale');
  const before = listing(root);
  addPage(root, 'scripted', { html: '<section class="scripted-page"><p class="note">Hi</p><iframe class="map" src="https://example.test/map"></iframe></section>', css: '.note { color: #222222; }' });
  await assert.rejects(buildArtifact({ projectRoot: root, artifactKey: 'pages/scripted' }), /NORMALIZATION_FAILED|UNSUPPORTED_HTML/);
  assert.deepEqual(listing(root), before);
  assert.equal(readCatalog(root).artifacts['pages/scripted'], undefined);
});

test('a held lock blocks a second writer; a lock from a finished process is recovered', async t => {
  const { root } = managedProject(t);
  fs.writeFileSync(path.join(root, '.taptop/lock'), JSON.stringify({ pid: process.pid, host: require('node:os').hostname(), operation: 'build', startedAt: new Date().toISOString() }));
  await assert.rejects(buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' }), /PROJECT_LOCKED/);
  fs.writeFileSync(path.join(root, '.taptop/lock'), JSON.stringify({ pid: 2147483646, host: require('node:os').hostname(), operation: 'build', startedAt: new Date().toISOString() }));
  assert.equal((await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' })).status, 'built');
  assert.equal(fs.existsSync(path.join(root, '.taptop/lock')), false);
});

test('two builds of one project at the same time: one waits for nothing and fails clearly', async t => {
  const { root } = managedProject(t);
  const results = await Promise.allSettled([
    buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' }),
    buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' })
  ]);
  assert.deepEqual(results.map(item => item.status).sort(), ['fulfilled', 'rejected']);
  assert.match(results.find(item => item.status === 'rejected').reason.message, /PROJECT_LOCKED/);
});

test('managed builds refuse legacy layout and corrupted catalogues instead of guessing', async t => {
  const workspace = tempWorkspace(t);
  const legacy = path.join(workspace, 'projects/legacy');
  initProject(legacy, 'legacy');
  const config = json(legacy, 'taptop.project.json');
  delete config.layoutVersion;
  fs.writeFileSync(path.join(legacy, 'taptop.project.json'), JSON.stringify(config));
  await assert.rejects(buildArtifact({ projectRoot: legacy, artifactKey: 'ui-kit' }), /MANAGED_BUILD_REQUIRES_LAYOUT_2/);
  const { root } = managedProject(t, { namespace: 'other-site' });
  fs.writeFileSync(path.join(root, '.taptop/outputs.json'), '{broken');
  await assert.rejects(buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' }), /CATALOG_CORRUPT/);
  assert.equal(fs.readFileSync(path.join(root, '.taptop/outputs.json'), 'utf8'), '{broken');
});

test('an input edit that does not change the result revalidates the current build instead of leaving it stale', async t => {
  const { root } = managedProject(t);
  await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  addPage(root, 'home');
  const first = await buildArtifact({ projectRoot: root, artifactKey: 'pages/home' });
  fs.appendFileSync(path.join(root, 'input/home/styles.css'), '\n/* reviewed */\n');
  assert.equal(artifactStatuses(root).find(item => item.key === 'pages/home').status, 'stale');
  const again = await buildArtifact({ projectRoot: root, artifactKey: 'pages/home' });
  assert.equal(again.status, 'up-to-date');
  assert.equal(again.buildId, first.buildId);
  assert.equal(artifactStatuses(root).find(item => item.key === 'pages/home').status, 'current');
  assert.ok(readCatalog(root).artifacts['pages/home'].builds[0].revalidatedAt);
});

test('a shared component is built once, reused by two pages, and guards its own class rules', async t => {
  const { root } = managedProject(t);
  await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  const card = '<article class="card"><span class="type-title">Card title</span><a class="text-link" href="#">Details</a></article>';
  const cardCss = '.card { display: flex; flex-direction: column; row-gap: 8px; padding: 16px; background-color: #f2f2f2; }';
  write(root, 'source/components/card/index.html', `<section class="card-demo">${card}</section>`);
  write(root, 'source/components/card/card.css', `.card-demo { display: block; }\n${cardCss}`);
  addArtifact(root, { key: 'components/card', html: 'source/components/card/index.html', stylesheets: ['design-system/roles.css', 'source/components/card/card.css'], dependsOn: ['ui-kit'] });
  const component = await buildArtifact({ projectRoot: root, artifactKey: 'components/card' });
  for (const slug of ['home', 'about']) {
    write(root, `source/pages/${slug}/index.html`, `<section class="${slug}-page">${card}</section>`);
    write(root, `source/pages/${slug}/page.css`, `.${slug}-page { display: block; }`);
    addArtifact(root, { key: `pages/${slug}`, html: `source/pages/${slug}/index.html`, stylesheets: ['design-system/roles.css', 'source/components/card/card.css', `source/pages/${slug}/page.css`], dependsOn: ['ui-kit', 'components/card'] });
  }
  const home = await buildArtifact({ projectRoot: root, artifactKey: 'pages/home' });
  await buildArtifact({ projectRoot: root, artifactKey: 'pages/about' });
  const componentCard = json(root, component.jsonPath).syncPackage.classes.find(item => item.name === 'card');
  const homeCard = json(root, home.jsonPath).syncPackage.classes.find(item => item.name === 'card');
  assert.equal(homeCard.stableKey, 'synthetic-site/class/card');
  assert.deepEqual(homeCard.ownedRules, componentCard.ownedRules);
  assert.deepEqual(readCatalog(root).artifacts['pages/home'].builds[0].dependencies, { 'components/card': component.buildId, 'ui-kit': readCatalog(root).artifacts['ui-kit'].current });
  write(root, 'source/pages/about/page.css', '.about-page { display: block; }\n.card { background-color: #e0d4c0; }');
  await assert.rejects(buildArtifact({ projectRoot: root, artifactKey: 'pages/about' }), /DEPENDENCY_CLASS_MISMATCH: card differs from components\/card/);
});

test('a broken kit.json is reported with its file name and leaves the UI kit untouched', t => {
  const { root } = managedProject(t);
  const before = fs.readFileSync(path.join(root, 'source/ui-kit/ui-kit.html'));
  fs.writeFileSync(path.join(root, 'design-system/kit.json'), '{ "projectName": ');
  const { writeUiKit } = require('../lib/ui-kit/write');
  assert.throws(() => writeUiKit(root, { data: 'design-system/kit.json', replace: true }), /INVALID_KIT_DATA: design-system\/kit\.json/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'source/ui-kit/ui-kit.html')), before);
});

test('two projects build at the same time without touching each other', async t => {
  const first = managedProject(t, { namespace: 'north-site' });
  const second = managedProject(t, { namespace: 'south-site' });
  const [a, b] = await Promise.all([
    buildArtifact({ projectRoot: first.root, artifactKey: 'ui-kit' }),
    buildArtifact({ projectRoot: second.root, artifactKey: 'ui-kit' })
  ]);
  assert.equal(a.status, 'built');
  assert.equal(b.status, 'built');
  assert.equal(json(first.root, a.jsonPath).syncPackage.namespace, 'north-site');
  assert.equal(json(second.root, b.jsonPath).syncPackage.namespace, 'south-site');
  assert.ok(json(second.root, b.jsonPath).syncPackage.classes.every(item => item.stableKey.startsWith('south-site/class/')));
  assert.deepEqual(Object.keys(readCatalog(first.root).artifacts), ['ui-kit']);
  assert.equal(fs.readdirSync(path.join(first.root, 'output/json')).some(name => name.includes(b.buildId)), false);
});

test('a changed registration marks the result stale; a failed build keeps only its journal', async t => {
  const { root } = managedProject(t);
  await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  addPage(root, 'home');
  await buildArtifact({ projectRoot: root, artifactKey: 'pages/home' });
  const registry = json(root, 'source/artifacts.json');
  registry.artifacts.find(item => item.key === 'pages/home').rootSelector = '.home-page';
  fs.writeFileSync(path.join(root, 'source/artifacts.json'), JSON.stringify(registry));
  const row = artifactStatuses(root).find(item => item.key === 'pages/home');
  assert.equal(row.status, 'stale');
  assert.ok(row.reasons.some(reason => reason.startsWith('registration changed')), row.reasons.join('; '));
  write(root, 'input/home/index.html', pageHtml('home-page', 'Another heading'));
  await assert.rejects(buildArtifact({ projectRoot: root, artifactKey: 'pages/home', failAfter: 'preview-assembled' }));
  const failed = fs.readdirSync(path.join(root, '.taptop/builds/pages--home')).find(id => json(root, `.taptop/builds/pages--home/${id}/build.json`).status === 'failed');
  assert.ok(failed, 'a failed journal is kept');
  assert.deepEqual(fs.readdirSync(path.join(root, '.taptop/builds/pages--home', failed)), ['build.json']);
  assert.equal(json(root, `.taptop/builds/pages--home/${failed}/build.json`).status, 'failed');
});

test('a results page that cannot be written does not turn a finished build into a failure', async t => {
  const { root } = managedProject(t);
  fs.mkdirSync(path.join(root, 'output/html/index.html'));
  const result = await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  assert.equal(result.status, 'built');
  assert.ok(result.warnings.some(item => item.code === 'CATALOG_PAGE_NOT_UPDATED'));
  assert.equal(readCatalog(root).artifacts['ui-kit'].current, result.buildId);
  assert.equal(json(root, `.taptop/builds/ui-kit/${result.buildId}/build.json`).status, 'succeeded');
});

test('every build ships a keyed copy of the original next to its preview for the comparison', async t => {
  const { root } = managedProject(t);
  await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  addPage(root, 'home');
  const home = await buildArtifact({ projectRoot: root, artifactKey: 'pages/home' });
  const original = fs.readFileSync(path.join(root, path.dirname(home.htmlPath), 'original.html'), 'utf8');
  assert.match(original, /<base href="\.\.\/\.\.\/\.\.\/input\/home\/">/);
  assert.match(original, /data-taptop-key="/);
  const { nextAction } = require('../lib/next-action');
  const step = nextAction(root);
  assert.equal(step.action, 'check-local');
});

test('a change that only reaches the embed stylesheet is a new build, not up-to-date', async t => {
  const { root } = managedProject(t);
  await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  addPage(root, 'home', { css: '.home-page::before { content: "a"; }' });
  const first = await buildArtifact({ projectRoot: root, artifactKey: 'pages/home' });
  write(root, 'input/home/styles.css', '.home-page { display: flex; flex-direction: column; row-gap: 16px; }\n.home-page::before { content: "b"; }');
  const second = await buildArtifact({ projectRoot: root, artifactKey: 'pages/home' });
  assert.equal(second.status, 'built');
  assert.notEqual(second.sourceRevision, first.sourceRevision);
  assert.match(JSON.stringify(json(root, second.jsonPath).behaviorPackages), /content: \\"b\\"/);
});

// Live 2026-10-12: a 97 773-character Embed made Taptop refuse every save
// ("DE_ERROR_NOTIFICATION_EMBED_LIMIT_EXCEEDED", limit 50 000 characters).
test('embed CSS longer than the Taptop limit ships as several Embeds, in order', async t => {
  const { splitEmbedCss, EMBED_CODE_LIMIT } = require('../lib/compile-project');
  const css = Array.from({ length: 2000 }, (_, index) => `@media (min-width: ${index + 1}px) { .home-page::before { content: "${'y'.repeat(30)}"; } }`).join('\n');
  const parts = splitEmbedCss(css);
  assert.ok(parts.length >= 3);
  assert.ok(parts.every(part => part.length < EMBED_CODE_LIMIT - 100));
  assert.equal(parts.join('\n'), require('postcss').parse(css).nodes.map(node => node.toString().trim()).join('\n'));
  const { root } = managedProject(t);
  await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  addPage(root, 'home', { css });
  const built = await buildArtifact({ projectRoot: root, artifactKey: 'pages/home' });
  const styles = json(root, built.jsonPath).behaviorPackages.filter(item => item.adapter === 'taptop/embed-styles-v1');
  assert.ok(styles.length >= 3);
  for (const item of styles) assert.ok(JSON.stringify(item).length > 0);
});
