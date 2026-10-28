const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildArtifact } = require('../lib/build-artifact');
const { recordCheck } = require('../lib/record-check');
const { readCatalog } = require('../lib/output-catalog');
const { startStaticServer } = require('../lib/static-server');
const { managedProject } = require('../test-support/managed-project');

test('verification levels are recorded separately on the current build only', async t => {
  const { root } = managedProject(t);
  const kit = await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  assert.throws(() => recordCheck({ projectRoot: root, artifactKey: 'ui-kit', level: 'editor', result: 'passed' }), /EVIDENCE_REQUIRED/);
  recordCheck({ projectRoot: root, artifactKey: 'ui-kit', level: 'local', result: 'passed', note: '8 widths, 0 differences' });
  recordCheck({ projectRoot: root, artifactKey: 'ui-kit', level: 'editor', result: 'failed', note: 'tablet canvas overflow' });
  const build = readCatalog(root).artifacts['ui-kit'].builds[0];
  assert.equal(build.buildId, kit.buildId);
  assert.equal(build.verification.local, 'passed');
  assert.equal(build.verification.editor, 'failed');
  assert.equal(build.verification.published, 'not-recorded');
  assert.equal(build.checks.length, 2);
  assert.ok(fs.readFileSync(path.join(root, 'output/html/index.html'), 'utf8').includes('editor: failed'));
  assert.throws(() => recordCheck({ projectRoot: root, artifactKey: 'ui-kit', level: 'visual', result: 'passed', note: 'x' }), /INVALID_CHECK_LEVEL/);
  assert.throws(() => recordCheck({ projectRoot: root, artifactKey: 'pages/none', level: 'local', result: 'passed', note: 'x' }), /UNKNOWN_ARTIFACT/);
});

test('the local server only serves files under its root, on the loopback interface', async t => {
  const { workspace, root } = managedProject(t);
  await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  fs.writeFileSync(path.join(path.dirname(workspace), `${path.basename(workspace)}-secret.txt`), 'secret');
  t.after(() => fs.rmSync(path.join(path.dirname(workspace), `${path.basename(workspace)}-secret.txt`), { force: true }));
  const server = await startStaticServer({ root: workspace, port: 0 });
  t.after(() => server.close());
  assert.equal(server.address().address, '127.0.0.1');
  const base = `http://127.0.0.1:${server.address().port}`;
  const index = await fetch(`${base}/projects/synthetic-site/output/html/index.html`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /text\/html/);
  for (const attempt of ['/../secret.txt', '/%2e%2e/secret.txt', `/..%2f${path.basename(workspace)}-secret.txt`, '/projects/synthetic-site/../../x']) {
    const response = await fetch(`${base}${attempt}`);
    assert.notEqual(response.status, 200, attempt);
  }
  assert.equal((await fetch(`${base}/projects/synthetic-site/output/html/index.html`, { method: 'POST' })).status, 405);
});
