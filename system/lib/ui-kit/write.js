const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { inside, loadProject, readProjectFile, ensureProjectDirectory } = require('../project');
const { projectKit } = require('./project-kit');
const { renderUiKitDocument } = require('./render');
const { DEFAULT_KIT } = require('./default-kit');

const DIRECTORY = 'source/ui-kit';
const RECORD = '.taptop/ui-kit-generation.json';
const FILES = [`${DIRECTORY}/ui-kit.html`, `${DIRECTORY}/ui-kit.css`];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function readRecord(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, RECORD), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error(`UI_KIT_RECORD_CORRUPT: ${RECORD} (${error.message})`); }
}

// Generated files may be replaced only while they are exactly what the
// generator wrote; a manual edit is kept and blocks the replacement. The
// previous copy is moved to .taptop/history/ first.
function prepareReplacement(root, directory) {
  const record = readRecord(root);
  if (!record) throw new Error(`UI_KIT_EXISTS: ${DIRECTORY} has no generation record; it was not written by this Bridge version. Move it aside deliberately.`);
  const present = fs.readdirSync(directory).sort();
  if (JSON.stringify(present) !== JSON.stringify(FILES.map(file => path.posix.basename(file)).sort())) throw new Error(`UI_KIT_MODIFIED: ${DIRECTORY} contains files the generator did not write`);
  for (const file of FILES) {
    if (sha256(fs.readFileSync(path.join(root, file))) !== record.files[file]) throw new Error(`UI_KIT_MODIFIED: ${file} was edited after generation. Change design-system data instead; the generator owns this file.`);
  }
  const backup = `.taptop/history/ui-kit/${new Date().toISOString().replace(/[-:.]/g, '')}`;
  ensureProjectDirectory(root, path.posix.dirname(backup));
  fs.renameSync(directory, path.join(root, backup));
  fs.mkdirSync(directory);
  return backup;
}

function registerKitArtifact(root) {
  // Required lazily: project-artifacts depends on project.js only.
  const { readArtifacts, addArtifact } = require('../project-artifacts');
  if (readArtifacts(root).artifacts.some(item => item.key === 'ui-kit')) return false;
  addArtifact(root, { key: 'ui-kit', title: 'UI kit', html: FILES[0], stylesheets: [FILES[1]] });
  return true;
}

// Writes the UI kit page (source HTML/CSS) into a Bridge project. It then goes
// through the normalizer and compiler like any other page.
function writeUiKit(root, { font, projectName, data, replace = false } = {}) {
  const config = loadProject(root);
  let kit = { ...DEFAULT_KIT, fonts: { primary: font || DEFAULT_KIT.fonts.primary }, projectName: projectName || DEFAULT_KIT.projectName };
  if (data) {
    let model;
    try { model = JSON.parse(readProjectFile(root, data)); }
    catch (error) {
      if (error instanceof SyntaxError) throw new Error(`INVALID_KIT_DATA: ${data} is not valid JSON (${error.message})`);
      throw error;
    }
    const css = model.css ? readProjectFile(root, path.posix.join(path.posix.dirname(data), model.css)) : '';
    kit = projectKit({ ...model, fonts: font ? { primary: font } : model.fonts }, css);
  }
  const { html, css } = renderUiKitDocument(kit);
  const files = [[FILES[0], html], [FILES[1], css]];
  const directory = path.join(root, DIRECTORY);
  const sourceDirectory = path.join(root, 'source');
  if (fs.existsSync(sourceDirectory) && (fs.lstatSync(sourceDirectory).isSymbolicLink() || !inside(fs.realpathSync(root), fs.realpathSync(sourceDirectory)))) throw new Error('UNSAFE_PROJECT_PATH: source must stay inside project');
  if (fs.existsSync(directory) || fs.lstatSync(directory, { throwIfNoEntry: false })) {
    if (fs.lstatSync(directory).isSymbolicLink() || !fs.statSync(directory).isDirectory()) throw new Error(`UI_KIT_EXISTS: ${DIRECTORY} is a symlink or a file`);
    if (fs.readdirSync(directory).length) {
      if (!replace) throw new Error(`UI_KIT_EXISTS: ${DIRECTORY} already contains files; pass --replace to regenerate unchanged generated files`);
      prepareReplacement(root, directory);
    }
  } else {
    ensureProjectDirectory(root, DIRECTORY);
  }
  for (const [file, content] of files) fs.writeFileSync(path.join(root, file), content, { flag: 'wx' });
  if (config.layoutVersion === 2) {
    ensureProjectDirectory(root, '.taptop');
    fs.writeFileSync(path.join(root, RECORD), `${JSON.stringify({ schemaVersion: 1, data: data || null, files: Object.fromEntries(files.map(([file, content]) => [file, sha256(Buffer.from(content, 'utf8'))])) }, null, 2)}\n`);
    registerKitArtifact(root);
  }
  return files.map(([file]) => file);
}

module.exports = { writeUiKit };
