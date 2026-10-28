const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { initProject } = require('../lib/project');
const { addArtifact, getArtifact, readArtifacts, artifactSlug } = require('../lib/project-artifacts');

function project(t, namespace = 'north-site') {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-artifacts-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, namespace);
  initProject(root, namespace);
  return root;
}
function write(root, file, text = '') {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

test('a new project has an empty artifact registry', t => {
  const root = project(t);
  assert.deepEqual(readArtifacts(root), { schemaVersion: 1, artifacts: [] });
});

test('two index.html pages are distinct artifacts with distinct component keys', t => {
  const root = project(t);
  write(root, 'input/home/index.html');
  write(root, 'input/home/styles.css');
  write(root, 'input/about/index.html');
  write(root, 'input/about/styles.css');
  addArtifact(root, { key: 'pages/home', html: 'input/home/index.html', stylesheets: ['input/home/styles.css'] });
  addArtifact(root, { key: 'pages/about', html: 'input/about/index.html', stylesheets: ['input/about/styles.css'] });
  const home = getArtifact(root, 'pages/home');
  const about = getArtifact(root, 'pages/about');
  assert.equal(home.kind, 'page');
  assert.equal(home.componentKey, 'north-site/pages/home');
  assert.equal(about.componentKey, 'north-site/pages/about');
  assert.equal(artifactSlug('pages/home'), 'pages--home');
  assert.notEqual(artifactSlug('pages/home'), artifactSlug('pages/about'));
});

test('artifact keys, kinds, paths and dependencies are validated before writing', t => {
  const root = project(t);
  write(root, 'source/ui-kit/ui-kit.html');
  write(root, 'source/ui-kit/ui-kit.css');
  write(root, 'source/pages/home.html');
  write(root, 'source/pages/home.css');
  const before = fs.readFileSync(path.join(root, 'source/artifacts.json'), 'utf8');
  const page = { key: 'pages/home', html: 'source/pages/home.html', stylesheets: ['source/pages/home.css'] };
  assert.throws(() => addArtifact(root, { ...page, key: 'home' }), /INVALID_ARTIFACT_KEY/);
  assert.throws(() => addArtifact(root, { ...page, key: 'pages/Home' }), /INVALID_ARTIFACT_KEY/);
  assert.throws(() => addArtifact(root, { ...page, key: 'pages/a--b' }), /INVALID_ARTIFACT_KEY/);
  assert.throws(() => addArtifact(root, { ...page, html: '../other/page.html' }), /UNSAFE_PROJECT_PATH/);
  assert.throws(() => addArtifact(root, { ...page, html: 'output/html/page.html' }), /ARTIFACT_SOURCE_LOCATION/);
  assert.throws(() => addArtifact(root, { ...page, html: '.taptop/work/x.html' }), /ARTIFACT_SOURCE_LOCATION/);
  assert.throws(() => addArtifact(root, { ...page, html: 'source/pages/missing.html' }), /ARTIFACT_SOURCE_MISSING/);
  assert.throws(() => addArtifact(root, { ...page, stylesheets: [] }), /MISSING_STYLESHEETS/);
  assert.throws(() => addArtifact(root, { ...page, dependsOn: ['ui-kit'] }), /UNKNOWN_DEPENDENCY: ui-kit/);
  assert.throws(() => addArtifact(root, { ...page, dependsOn: ['pages/home'] }), /DEPENDENCY_CYCLE/);
  assert.equal(fs.readFileSync(path.join(root, 'source/artifacts.json'), 'utf8'), before);
  addArtifact(root, { key: 'ui-kit', html: 'source/ui-kit/ui-kit.html', stylesheets: ['source/ui-kit/ui-kit.css'] });
  assert.throws(() => addArtifact(root, { key: 'ui-kit', html: 'source/ui-kit/ui-kit.html', stylesheets: ['source/ui-kit/ui-kit.css'], dependsOn: ['pages/home'] }), /DUPLICATE_ARTIFACT/);
  addArtifact(root, { ...page, dependsOn: ['ui-kit'] });
  assert.deepEqual(getArtifact(root, 'pages/home').dependsOn, ['ui-kit']);
  assert.throws(() => getArtifact(root, 'pages/gone'), /UNKNOWN_ARTIFACT: pages\/gone/);
});

test('a hand-edited registry with a cycle, unknown field or symlinked source is rejected', t => {
  const root = project(t);
  write(root, 'source/components/a.html');
  write(root, 'source/components/a.css');
  const file = path.join(root, 'source/artifacts.json');
  const entry = key => ({ key, html: 'source/components/a.html', stylesheets: ['source/components/a.css'] });
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, artifacts: [{ ...entry('components/a'), dependsOn: ['components/b'] }, { ...entry('components/b'), dependsOn: ['components/a'] }] }));
  assert.throws(() => readArtifacts(root), /DEPENDENCY_CYCLE/);
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, artifacts: [{ ...entry('components/a'), output: '/tmp/x' }] }));
  assert.throws(() => readArtifacts(root), /INVALID_ARTIFACT_FIELD: output/);
  fs.writeFileSync(file, '{broken');
  assert.throws(() => readArtifacts(root), /INVALID_ARTIFACT_REGISTRY/);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'x.html'), '');
  fs.symlinkSync(path.join(outside, 'x.html'), path.join(root, 'source/components/link.html'));
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, artifacts: [] }));
  assert.throws(() => addArtifact(root, { ...entry('components/link'), html: 'source/components/link.html' }), /OUTSIDE_PROJECT/);
});

test('the published artifact schema states the same key and path rules as the runtime', () => {
  const schema = require('../contracts/project/artifacts.schema.json');
  const item = schema.properties.artifacts.items.properties;
  const key = new RegExp(item.key.pattern);
  const projectPath = new RegExp(schema.$defs.projectPath.pattern);
  for (const value of ['ui-kit', 'pages/home', 'components/hero-card']) {
    assert.ok(key.test(value), value);
    assert.doesNotThrow(() => artifactSlug(value));
  }
  for (const value of ['home', 'pages/Home', 'pages/a--b', 'components/', 'ui-kit/x']) {
    assert.equal(key.test(value), false, value);
    assert.throws(() => artifactSlug(value), /INVALID_ARTIFACT_KEY/);
  }
  for (const value of ['input/home/index.html', 'design-system/roles.css']) assert.ok(projectPath.test(value), value);
  for (const value of ['../x.html', '/abs.html', 'output/html/a.html', '.taptop/work/a.html', 'source/normalized/page.html', 'a/../b.html']) assert.equal(projectPath.test(value), false, value);
});

test('--replace changes an existing registration in place and refuses an unknown key', t => {
  const root = project(t);
  write(root, 'input/home/index.html');
  write(root, 'input/home/styles.css');
  write(root, 'input/home/intake.json', '{}');
  write(root, 'input/about/index.html');
  write(root, 'input/about/styles.css');
  addArtifact(root, { key: 'pages/home', html: 'input/home/index.html', stylesheets: ['input/home/styles.css'] });
  addArtifact(root, { key: 'pages/about', html: 'input/about/index.html', stylesheets: ['input/about/styles.css'] });
  assert.throws(() => addArtifact(root, { key: 'pages/home', html: 'input/home/index.html', stylesheets: ['input/home/styles.css'] }), /DUPLICATE_ARTIFACT/);
  addArtifact(root, { key: 'pages/home', html: 'input/home/index.html', stylesheets: ['input/home/styles.css'], intake: 'input/home/intake.json' }, { replace: true });
  assert.deepEqual(readArtifacts(root).artifacts.map(item => [item.key, item.intake]), [['pages/home', 'input/home/intake.json'], ['pages/about', undefined]]);
  assert.throws(() => addArtifact(root, { key: 'pages/contact', html: 'input/home/index.html', stylesheets: ['input/home/styles.css'] }, { replace: true }), /UNKNOWN_ARTIFACT/);
});
