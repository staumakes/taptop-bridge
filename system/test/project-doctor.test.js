const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { doctorProject } = require('../lib/doctor-project');
const { buildArtifact } = require('../lib/build-artifact');
const { addArtifact } = require('../lib/project-artifacts');
const { initProject } = require('../lib/project');
const { managedProject, pageHtml, write } = require('../test-support/managed-project');

function snapshot(root) {
  const files = {};
  const walk = dir => {
    for (const name of fs.readdirSync(path.join(root, dir))) {
      const relative = dir ? `${dir}/${name}` : name;
      const stat = fs.lstatSync(path.join(root, relative));
      if (stat.isDirectory()) walk(relative);
      else files[relative] = stat.isSymbolicLink() ? `link:${fs.readlinkSync(path.join(root, relative))}` : fs.readFileSync(path.join(root, relative)).toString('base64');
    }
  };
  walk('');
  return files;
}
const codes = report => report.issues.map(item => item.code).sort();

test('doctor on a fresh project is ok, read-only and explains the next step', t => {
  const { root } = managedProject(t);
  const before = snapshot(root);
  const report = doctorProject(root);
  assert.equal(report.ok, true);
  assert.equal(report.project.namespace, 'synthetic-site');
  assert.deepEqual(report.artifacts.map(item => [item.key, item.status]), [['ui-kit', 'never-built']]);
  assert.deepEqual(codes(report), ['NOT_BUILT']);
  assert.match(report.issues[0].nextAction, /build --project .* --artifact ui-kit/);
  assert.deepEqual(snapshot(root), before);
});

test('doctor reports stale results, missing sources, orphans, interrupted builds and catalogue drift', async t => {
  const { root } = managedProject(t);
  await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  write(root, 'input/home/index.html', pageHtml('home-page'));
  write(root, 'input/home/styles.css', '.home-page { display: flex; }');
  addArtifact(root, { key: 'pages/home', html: 'input/home/index.html', stylesheets: ['design-system/roles.css', 'input/home/styles.css'], dependsOn: ['ui-kit'] });
  await buildArtifact({ projectRoot: root, artifactKey: 'pages/home' });
  assert.deepEqual(codes(doctorProject(root)), []);

  write(root, 'input/home/styles.css', '.home-page { display: block; }');
  await assert.rejects(buildArtifact({ projectRoot: root, artifactKey: 'pages/home', failAfter: 'compiled' }));
  const interrupted = fs.readdirSync(path.join(root, '.taptop/builds/pages--home')).find(id => JSON.parse(fs.readFileSync(path.join(root, '.taptop/builds/pages--home', id, 'build.json'), 'utf8')).status === 'failed');
  const journal = path.join(root, '.taptop/builds/pages--home', interrupted, 'build.json');
  fs.writeFileSync(journal, JSON.stringify({ ...JSON.parse(fs.readFileSync(journal, 'utf8')), status: 'started' }));
  write(root, 'output/json/pages--home--19990101T000000Z-deadbeef.json', '{}');
  fs.rmSync(path.join(root, 'output/html/index.html'));
  fs.rmSync(path.join(root, 'input/home/index.html'));
  const before = snapshot(root);
  const report = doctorProject(root);
  assert.equal(report.ok, false);
  assert.deepEqual(codes(report), ['ARTIFACT_SOURCE_MISSING', 'CATALOG_PAGE_MISSING', 'INTERRUPTED_BUILD', 'ORPHAN_OUTPUT', 'STALE_RESULT']);
  for (const issue of report.issues) assert.ok(issue.nextAction && issue.message && issue.level, issue.code);
  assert.equal(report.artifacts.find(item => item.key === 'pages/home').status, 'stale');
  assert.deepEqual(snapshot(root), before);
});

test('doctor names a copied project, a corrupted catalogue and a wrong Bridge version without fixing them', async t => {
  const { workspace, root } = managedProject(t);
  const copy = path.join(workspace, 'projects/site-copy');
  fs.cpSync(root, copy, { recursive: true });
  assert.ok(codes(doctorProject(copy)).includes('DUPLICATE_NAMESPACE'));
  fs.writeFileSync(path.join(root, '.taptop/outputs.json'), '{broken');
  assert.ok(codes(doctorProject(root)).includes('CATALOG_CORRUPT'));
  const config = JSON.parse(fs.readFileSync(path.join(copy, 'taptop.project.json'), 'utf8'));
  fs.writeFileSync(path.join(copy, 'taptop.project.json'), JSON.stringify({ ...config, toolkitVersion: '0.0.1' }));
  const report = doctorProject(copy);
  assert.equal(report.ok, false);
  assert.deepEqual(codes(report), ['PROJECT_CONFIG_INVALID']);
  assert.match(report.issues[0].nextAction, /pinned/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(copy, 'taptop.project.json'), 'utf8')).toolkitVersion, '0.0.1');
});

test('doctor flags a symlinked project folder, an abandoned lock and an edited UI kit', t => {
  const { root } = managedProject(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.rmSync(path.join(root, 'output'), { recursive: true });
  fs.symlinkSync(outside, path.join(root, 'output'));
  fs.writeFileSync(path.join(root, '.taptop/lock'), JSON.stringify({ pid: 2147483646, host: os.hostname(), operation: 'build ui-kit', startedAt: '2026-01-01T00:00:00.000Z' }));
  fs.appendFileSync(path.join(root, 'source/ui-kit/ui-kit.css'), '\n.kit { color: #000000; }\n');
  assert.deepEqual(codes(doctorProject(root)), ['LOCK_ABANDONED', 'NOT_BUILT', 'SYMLINKED_PROJECT_FOLDER', 'UI_KIT_MODIFIED']);
});

test('doctor accepts a legacy-layout project and reports what is unavailable', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-doctor-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'legacy');
  initProject(root, 'legacy');
  const file = path.join(root, 'taptop.project.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete config.layoutVersion;
  fs.writeFileSync(file, JSON.stringify(config));
  const report = doctorProject(root);
  assert.equal(report.ok, true);
  assert.deepEqual(codes(report), ['LEGACY_LAYOUT']);
});
