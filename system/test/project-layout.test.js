const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { initProject, loadProject } = require('../lib/project');
const { writeUiKit } = require('../lib/ui-kit/write');

test('a new project has separate source and result folders with empty design data', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-layout-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'first-site');
  initProject(root, 'first-site');
  assert.equal(loadProject(root).layoutVersion, 2);
  for (const directory of ['input', 'source/ui-kit', 'source/components', 'source/pages', 'output/html', 'output/json', '.taptop/builds', '.taptop/history', '.taptop/receipts']) {
    assert.ok(fs.statSync(path.join(root, directory)).isDirectory(), `${directory} missing`);
  }
  assert.ok(fs.existsSync(path.join(root, 'README.md')));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'design-system/foundations.json'))), { colors: {}, typography: {}, spacing: {}, radius: {}, shadows: {} });
  assert.equal(fs.existsSync(path.join(root, 'design-system/kit.json')), false);
  assert.equal(fs.existsSync(path.join(root, 'design-system/roles.css')), false);
  // Project state is computed by doctor/next from files on disk, never kept in a static file.
  assert.equal(fs.existsSync(path.join(root, '.taptop/state.json')), false);
});

test('a new project starts with an empty project context that every file of its map describes', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-layout-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'site');
  initProject(root, 'site');
  const map = fs.readFileSync(path.join(root, 'context/README.md'), 'utf8');
  for (const file of ['product.md', 'segments.md', 'voice.md', 'objections.md', 'facts.md', 'competitors.md']) {
    assert.match(map, new RegExp(`\\| \`${file.replace('.', '\\.')}\` \\|.*\\| пусто \\|`), `context/README.md does not list ${file} as empty`);
    assert.match(fs.readFileSync(path.join(root, 'context', file), 'utf8'), /^Статус: пусто/m, `${file} is not an empty template`);
  }
  assert.ok(fs.existsSync(path.join(root, 'context/sources/README.md')));
  assert.equal(fs.readdirSync(path.join(root, 'context')).length, 8);
});

test('agents are told to read the project context before asking the user', () => {
  const ROOT = path.resolve(__dirname, '../..');
  for (const file of ['AGENTS.md', 'system/templates/project/AGENTS.md', 'system/skills/taptop-site-transfer/SKILL.md', 'system/docs/project-layout.md']) {
    assert.match(fs.readFileSync(path.join(ROOT, file), 'utf8'), /context\/README\.md/, `${file} does not point at context/README.md`);
  }
});

test('an existing version-1 project remains readable, while an unknown layout fails', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-layout-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'legacy');
  initProject(root, 'legacy');
  const file = path.join(root, 'taptop.project.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete config.layoutVersion;
  fs.writeFileSync(file, JSON.stringify(config));
  assert.equal(loadProject(root).namespace, 'legacy');
  config.layoutVersion = 99;
  fs.writeFileSync(file, JSON.stringify(config));
  assert.throws(() => loadProject(root), /UNSUPPORTED_PROJECT_LAYOUT/);
});

test('UI-kit generator accepts the empty reserved directory and rejects a symlink', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-layout-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'site');
  initProject(root, 'site');
  writeUiKit(root);
  assert.ok(fs.existsSync(path.join(root, 'source/ui-kit/ui-kit.html')));
  assert.throws(() => writeUiKit(root), /UI_KIT_EXISTS/);
  fs.rmSync(path.join(root, 'source/ui-kit'), { recursive: true });
  fs.symlinkSync(parent, path.join(root, 'source/ui-kit'));
  assert.throws(() => writeUiKit(root), /UI_KIT_EXISTS/);
  assert.equal(fs.existsSync(path.join(parent, 'ui-kit.html')), false);
  fs.rmSync(path.join(root, 'source/ui-kit'));
  fs.rmSync(path.join(root, 'source'), { recursive: true });
  fs.symlinkSync(parent, path.join(root, 'source'));
  assert.throws(() => writeUiKit(root), /OUTSIDE_PROJECT|UNSAFE_PROJECT_PATH/);
  assert.equal(fs.existsSync(path.join(parent, 'ui-kit.html')), false);
});

test('new layout rejects a missing registry and invalid display name', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-layout-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'site');
  initProject(root, 'site');
  const configPath = path.join(root, 'taptop.project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.displayName = '  ';
  fs.writeFileSync(configPath, JSON.stringify(config));
  assert.throws(() => loadProject(root), /INVALID_DISPLAY_NAME/);
  delete config.displayName;
  fs.writeFileSync(configPath, JSON.stringify(config));
  fs.rmSync(path.join(root, 'design-system/registry.json'));
  assert.throws(() => loadProject(root), /MISSING_PROJECT_REGISTRY/);
});
