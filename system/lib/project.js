const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../../package.json');
const { isSafeRelativePath } = require('./html-ir-contract');
function inside(root, target) {
  const rel = path.relative(root, target);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}
function readProjectFile(root, relative) {
  if (!isSafeRelativePath(relative)) throw new Error('UNSAFE_PROJECT_PATH');
  const realRoot = fs.realpathSync(root);
  const file = fs.realpathSync(path.resolve(root, relative));
  if (!inside(realRoot, file)) throw new Error('OUTSIDE_PROJECT');
  return fs.readFileSync(file, 'utf8');
}
// Creates (or accepts) a project-relative directory one segment at a time.
// Every existing segment must be a real directory: a symlink anywhere on the
// way could redirect generated files into another project or outside it.
function ensureProjectDirectory(root, relative) {
  if (!isSafeRelativePath(relative)) throw new Error(`UNSAFE_PROJECT_PATH: ${relative}`);
  let current = root;
  for (const segment of relative.split('/').filter(item => item && item !== '.')) {
    current = path.join(current, segment);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      fs.mkdirSync(current);
      continue;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`UNSAFE_PROJECT_PATH: ${path.relative(root, current).split(path.sep).join('/')} must be a real directory inside the project`);
  }
  return current;
}
function loadProject(root) {
  const config = JSON.parse(readProjectFile(root, 'taptop.project.json'));
  if (config.schemaVersion !== 1 || config.toolkitVersion !== version) throw new Error('INCOMPATIBLE_TOOLKIT: use the project-pinned toolkit version');
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(config.namespace)) throw new Error('INVALID_NAMESPACE');
  if (config.layoutVersion !== undefined && config.layoutVersion !== 2) throw new Error('UNSUPPORTED_PROJECT_LAYOUT: migrate the project explicitly');
  if (config.displayName !== undefined && (typeof config.displayName !== 'string' || !config.displayName.trim())) throw new Error('INVALID_DISPLAY_NAME');
  if (config.layoutVersion === 2) {
    let registryText;
    try { registryText = readProjectFile(root, 'design-system/registry.json'); }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error('MISSING_PROJECT_REGISTRY');
      throw error;
    }
    const registry = JSON.parse(registryText);
    if (!registry || !Array.isArray(registry.components) || !Array.isArray(registry.sections)) throw new Error('INVALID_PROJECT_REGISTRY');
  }
  return config;
}
function initProject(destination, namespace) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(namespace || '')) throw new Error('INVALID_NAMESPACE: use lowercase letters, numbers and hyphens');
  // No recursive creation of the destination: even an existing empty directory is protected.
  fs.mkdirSync(destination);
  fs.cpSync(path.join(__dirname, '../templates/project'), destination, { recursive: true, force: false, errorOnExist: true });
  for (const dir of ['input', 'source/ui-kit', 'source/components', 'source/pages', 'output/html', 'output/json', '.taptop/builds', '.taptop/history', '.taptop/receipts']) fs.mkdirSync(path.join(destination, dir), { recursive: true });
  fs.writeFileSync(path.join(destination, 'taptop.project.json'), JSON.stringify({ schemaVersion: 1, layoutVersion: 2, toolkitVersion: version, namespace }, null, 2) + '\n', { flag: 'wx' });
}
module.exports = { inside, readProjectFile, loadProject, initProject, ensureProjectDirectory };
