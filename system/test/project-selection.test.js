const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { initProject } = require('../lib/project');
const { listProjects, resolveProject } = require('../lib/workspace-projects');

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-workspace-'));
  fs.mkdirSync(path.join(root, 'projects'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function add(root, directory, namespace = directory) {
  const project = path.join(root, 'projects', directory);
  initProject(project, namespace);
  return project;
}

test('zero, one and multiple projects have explicit selection outcomes', t => {
  const root = workspace(t);
  assert.deepEqual(resolveProject({ workspaceRoot: root }), { status: 'empty', projects: [], issues: [] });
  const first = add(root, 'first');
  assert.equal(resolveProject({ workspaceRoot: root }).projectRoot, first);
  add(root, 'second');
  const result = resolveProject({ workspaceRoot: root });
  assert.equal(result.status, 'needs-selection');
  assert.deepEqual(result.projects.map(item => item.relativePath), ['projects/first', 'projects/second']);
});

test('explicit project wins over task context; stale task path never chooses its neighbor', t => {
  const root = workspace(t);
  const first = add(root, 'first');
  const second = add(root, 'second');
  assert.equal(resolveProject({ workspaceRoot: root, explicitProject: 'projects/second', taskProject: 'projects/first' }).projectRoot, second);
  assert.equal(resolveProject({ workspaceRoot: root, taskProject: 'projects/first' }).projectRoot, first);
  assert.equal(resolveProject({ workspaceRoot: root, taskProject: 'projects/gone' }).status, 'invalid-selection');
  assert.equal(resolveProject({ workspaceRoot: root, taskProject: 'projects/gone' }).projectRoot, undefined);
  assert.equal(resolveProject({ workspaceRoot: root, explicitProject: 'second' }).status, 'invalid-selection');
  assert.equal(resolveProject({ workspaceRoot: root, explicitProject: second }).projectRoot, second);
});

test('invalid entries, duplicate namespace and symlink entries do not become implicit selections', t => {
  const root = workspace(t);
  add(root, 'first', 'same');
  add(root, 'second', 'same');
  fs.mkdirSync(path.join(root, 'projects', 'broken'));
  fs.symlinkSync(os.tmpdir(), path.join(root, 'projects', 'outside'));
  const list = listProjects(root);
  assert.deepEqual(list.projects, []);
  assert.deepEqual(list.issues.map(item => item.code).sort(), ['DUPLICATE_NAMESPACE', 'DUPLICATE_NAMESPACE', 'INVALID_PROJECT', 'SYMLINK_PROJECT'].sort());
  assert.equal(resolveProject({ workspaceRoot: root }).status, 'needs-selection');
  assert.equal(resolveProject({ workspaceRoot: root, explicitProject: 'projects/first' }).status, 'invalid-selection');
});

test('CLI projects reports projects without changing either project or shared state', t => {
  const root = workspace(t);
  const first = add(root, 'first');
  add(root, 'second');
  const before = fs.readFileSync(path.join(first, 'taptop.project.json'));
  const cli = path.resolve(__dirname, '../bin/taptop.js');
  const result = spawnSync(process.execPath, [cli, 'projects', root], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).projects.map(item => item.namespace), ['first', 'second']);
  assert.deepEqual(fs.readFileSync(path.join(first, 'taptop.project.json')), before);
  assert.equal(fs.existsSync(path.join(root, '.taptop')), false);
});

test('a symlinked projects root is an error rather than an empty workspace', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-workspace-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.symlinkSync(path.join(root, 'missing'), path.join(root, 'projects'));
  assert.deepEqual(listProjects(root).issues.map(item => item.code), ['INVALID_PROJECTS_DIRECTORY']);
  assert.equal(resolveProject({ workspaceRoot: root }).status, 'needs-selection');
});

test('a refused selection names the actual problem, and equal display names are a warning', t => {
  const root = workspace(t);
  add(root, 'first', 'same');
  add(root, 'copy-of-first', 'same');
  const refused = resolveProject({ workspaceRoot: root, explicitProject: 'projects/copy-of-first' });
  assert.equal(refused.status, 'invalid-selection');
  assert.deepEqual(refused.issues.map(item => item.code), ['DUPLICATE_NAMESPACE']);
  for (const [directory, namespace] of [['north', 'north'], ['south', 'south']]) {
    const project = add(root, directory, namespace);
    const file = path.join(project, 'taptop.project.json');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), displayName: 'Shop' }));
  }
  const list = listProjects(root);
  assert.deepEqual(list.projects.map(item => item.relativePath), ['projects/north', 'projects/south']);
  assert.deepEqual(list.warnings.map(item => [item.code, item.relativePath]), [['DUPLICATE_DISPLAY_NAME', 'projects/north'], ['DUPLICATE_DISPLAY_NAME', 'projects/south']]);
  assert.equal(resolveProject({ workspaceRoot: root, explicitProject: 'projects/south' }).namespace, 'south');
});
