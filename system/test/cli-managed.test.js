const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { KIT_DATA, ROLE_CSS, tempWorkspace, pageHtml, write } = require('../test-support/managed-project');

const CLI = path.resolve(__dirname, '../bin/taptop.js');
function cli(cwd, ...args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { ...result, json: (() => { try { return JSON.parse(result.stdout); } catch { return null; } })() };
}

test('the documented managed flow runs end to end through the CLI', t => {
  const workspace = tempWorkspace(t, 'taptop cli workspace ');
  assert.equal(cli(workspace, 'init', 'projects/north-site', 'north-site').status, 0);
  assert.equal(cli(workspace, 'init', 'projects/south-site', 'south-site').status, 0);
  const root = path.join(workspace, 'projects/north-site');
  const southBefore = fs.readdirSync(path.join(workspace, 'projects/south-site'), { recursive: true }).sort();
  write(root, 'design-system/kit.json', JSON.stringify(KIT_DATA));
  write(root, 'design-system/roles.css', ROLE_CSS);
  const kit = cli(workspace, 'ui-kit', 'projects/north-site', '--data', 'design-system/kit.json');
  assert.equal(kit.status, 0, kit.stderr);
  assert.ok(kit.json.next.some(line => line.includes('build --project projects/north-site --artifact ui-kit')));
  const built = cli(workspace, 'build', '--project', 'projects/north-site', '--artifact', 'ui-kit');
  assert.equal(built.status, 0, built.stderr);
  assert.equal(built.json.status, 'built');
  assert.ok(fs.existsSync(path.join(root, built.json.jsonPath)));
  assert.match(built.stdout, /not a verified Taptop import/);

  write(root, 'input/home/index.html', pageHtml('home-page'));
  write(root, 'input/home/styles.css', '.home-page { display: flex; }');
  const added = cli(workspace, 'artifact', 'add', '--project', 'projects/north-site', '--key', 'pages/home', '--html', 'input/home/index.html', '--css', 'design-system/roles.css', '--css', 'input/home/styles.css', '--depends', 'ui-kit');
  assert.equal(added.status, 0, added.stderr);
  assert.deepEqual(added.json.artifact.stylesheets, ['design-system/roles.css', 'input/home/styles.css']);
  assert.equal(cli(workspace, 'build', '--project', 'projects/north-site', '--artifact', 'pages/home').status, 0);
  const again = cli(workspace, 'build', '--project', 'projects/north-site', '--artifact', 'pages/home');
  assert.equal(again.json.status, 'up-to-date');
  const list = cli(workspace, 'artifact', 'list', '--project', 'projects/north-site');
  assert.deepEqual(list.json.artifacts.map(item => [item.key, item.status]), [['pages/home', 'current'], ['ui-kit', 'current']]);
  const doctor = cli(workspace, 'doctor', '--project', 'projects/north-site');
  assert.equal(doctor.status, 0, doctor.stdout);
  assert.equal(doctor.json.ok, true);
  fs.rmSync(path.join(root, 'output/html/index.html'));
  assert.equal(cli(workspace, 'catalog', '--project', 'projects/north-site').status, 0);
  assert.ok(fs.existsSync(path.join(root, 'output/html/index.html')));
  assert.deepEqual(fs.readdirSync(path.join(workspace, 'projects/south-site'), { recursive: true }).sort(), southBefore);
});

test('a missing, ambiguous or duplicated project is refused without touching a neighbor', t => {
  const workspace = tempWorkspace(t);
  cli(workspace, 'init', 'projects/first', 'first');
  fs.cpSync(path.join(workspace, 'projects/first'), path.join(workspace, 'projects/first-copy'), { recursive: true });
  cli(workspace, 'init', 'projects/other', 'other');
  const before = fs.readdirSync(path.join(workspace, 'projects/other'), { recursive: true }).sort();
  const missing = cli(workspace, 'build', '--project', 'projects/gone', '--artifact', 'ui-kit');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /INVALID_SELECTION/);
  const duplicate = cli(workspace, 'build', '--project', 'projects/first-copy', '--artifact', 'ui-kit');
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /DUPLICATE_NAMESPACE/);
  const none = cli(workspace, 'build', '--artifact', 'ui-kit');
  assert.equal(none.status, 1);
  assert.match(none.stderr, /--project is required/);
  assert.deepEqual(fs.readdirSync(path.join(workspace, 'projects/other'), { recursive: true }).sort(), before);
});
