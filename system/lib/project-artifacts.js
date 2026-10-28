const fs = require('node:fs');
const path = require('node:path');
const { inside, loadProject, readProjectFile, ensureProjectDirectory } = require('./project');
const { isSafeRelativePath } = require('./html-ir-contract');

// The artifact registry names every buildable unit of one project: its UI kit,
// reusable components and pages. Keys are logical and never derived from a file
// name, so two pages may both be called index.html.
const REGISTRY = 'source/artifacts.json';
const SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*';
const KEY = new RegExp(`^(?:ui-kit|components/${SEGMENT}|pages/${SEGMENT})$`);
const FIELDS = new Set(['key', 'title', 'html', 'stylesheets', 'rootSelector', 'intake', 'dependsOn']);
const KINDS = { 'ui-kit': 'ui-kit', components: 'component', pages: 'page' };
const GENERATED = ['output/', '.taptop/', 'source/normalized/'];

function artifactSlug(key) {
  if (!KEY.test(key || '')) throw new Error(`INVALID_ARTIFACT_KEY: ${key}`);
  return key.replace('/', '--');
}

function kindOf(key) { return KINDS[key.split('/')[0]]; }

function checkSource(root, file, extension, { mustExist }) {
  if (typeof file !== 'string' || !isSafeRelativePath(file) || file.startsWith('./')) throw new Error(`UNSAFE_PROJECT_PATH: ${file}`);
  if (!file.endsWith(extension)) throw new Error(`INVALID_ARTIFACT_SOURCE: ${file} must end with ${extension}`);
  if (GENERATED.some(prefix => file.startsWith(prefix))) throw new Error(`ARTIFACT_SOURCE_LOCATION: ${file} is a generated location; use input/ or source/`);
  if (!mustExist) return;
  if (!fs.existsSync(path.join(root, file))) throw new Error(`ARTIFACT_SOURCE_MISSING: ${file}`);
  if (!inside(fs.realpathSync(root), fs.realpathSync(path.join(root, file)))) throw new Error(`OUTSIDE_PROJECT: ${file}`);
}

function normalizeEntry(root, entry, { mustExist }) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('INVALID_ARTIFACT_REGISTRY: artifact must be an object');
  for (const field of Object.keys(entry)) if (!FIELDS.has(field)) throw new Error(`INVALID_ARTIFACT_FIELD: ${field}`);
  artifactSlug(entry.key);
  checkSource(root, entry.html, '.html', { mustExist });
  if (!Array.isArray(entry.stylesheets) || entry.stylesheets.length === 0) throw new Error(`MISSING_STYLESHEETS: ${entry.key}`);
  for (const file of entry.stylesheets) checkSource(root, file, '.css', { mustExist });
  if (new Set(entry.stylesheets).size !== entry.stylesheets.length) throw new Error(`DUPLICATE_STYLESHEET: ${entry.key}`);
  if (entry.intake !== undefined) checkSource(root, entry.intake, '.json', { mustExist });
  if (entry.rootSelector !== undefined && !/^\.[_a-zA-Z-][_a-zA-Z0-9-]*$/.test(entry.rootSelector)) throw new Error(`INVALID_ROOT_SELECTOR: ${entry.rootSelector}`);
  if (entry.title !== undefined && (typeof entry.title !== 'string' || !entry.title.trim())) throw new Error(`INVALID_ARTIFACT_TITLE: ${entry.key}`);
  const dependsOn = entry.dependsOn === undefined ? [] : entry.dependsOn;
  if (!Array.isArray(dependsOn) || dependsOn.some(key => typeof key !== 'string')) throw new Error(`INVALID_DEPENDENCIES: ${entry.key}`);
  return { ...entry, dependsOn: [...new Set(dependsOn)].sort() };
}

function validateRegistry(root, registry, { mustExist = false } = {}) {
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.artifacts)) throw new Error('INVALID_ARTIFACT_REGISTRY: expected {"schemaVersion":1,"artifacts":[]}');
  const artifacts = registry.artifacts.map(entry => normalizeEntry(root, entry, { mustExist }));
  const byKey = new Map();
  for (const item of artifacts) {
    if (byKey.has(item.key)) throw new Error(`DUPLICATE_ARTIFACT: ${item.key}`);
    byKey.set(item.key, item);
  }
  for (const item of artifacts) {
    for (const key of item.dependsOn) {
      if (key === item.key) throw new Error(`DEPENDENCY_CYCLE: ${item.key}`);
      if (!byKey.has(key)) throw new Error(`UNKNOWN_DEPENDENCY: ${key}`);
      if (kindOf(item.key) === 'ui-kit') throw new Error(`INVALID_DEPENDENCY: the UI kit cannot depend on ${key}`);
      if (kindOf(key) === 'page') throw new Error(`INVALID_DEPENDENCY: ${item.key} cannot depend on page ${key}`);
    }
  }
  const state = new Map();
  const visit = key => {
    if (state.get(key) === 'done') return;
    if (state.get(key) === 'active') throw new Error(`DEPENDENCY_CYCLE: ${key}`);
    state.set(key, 'active');
    for (const next of byKey.get(key).dependsOn) visit(next);
    state.set(key, 'done');
  };
  for (const key of byKey.keys()) visit(key);
  return { schemaVersion: 1, artifacts };
}

function readArtifacts(root) {
  loadProject(root);
  let text;
  try { text = readProjectFile(root, REGISTRY); }
  catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion: 1, artifacts: [] };
    throw error;
  }
  let registry;
  try { registry = JSON.parse(text); }
  catch (error) { throw new Error(`INVALID_ARTIFACT_REGISTRY: ${REGISTRY} is not valid JSON (${error.message})`); }
  return validateRegistry(root, registry);
}

function describe(namespace, item) {
  return { ...item, kind: kindOf(item.key), slug: artifactSlug(item.key), componentKey: `${namespace}/${item.key}` };
}

function getArtifact(root, key) {
  const { namespace } = loadProject(root);
  const item = readArtifacts(root).artifacts.find(entry => entry.key === key);
  if (!item) throw new Error(`UNKNOWN_ARTIFACT: ${key}`);
  return describe(namespace, item);
}

function listArtifacts(root) {
  const { namespace } = loadProject(root);
  return readArtifacts(root).artifacts.map(item => describe(namespace, item));
}

// Registration is validated in full (including the files) before the registry
// is replaced, so a rejected entry never leaves a half-written registry.
// `replace` swaps an existing registration in place (same position); its
// builds stay in the catalog and become stale until the next build.
function addArtifact(root, entry, { replace = false } = {}) {
  const current = readArtifacts(root);
  const clean = Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined));
  const position = current.artifacts.findIndex(item => item.key === clean.key);
  if (replace && position < 0) throw new Error(`UNKNOWN_ARTIFACT: ${clean.key} — --replace changes an existing registration; register it without --replace`);
  const artifacts = replace ? current.artifacts.map((item, index) => (index === position ? clean : item)) : [...current.artifacts, clean];
  const next = validateRegistry(root, { schemaVersion: 1, artifacts }, { mustExist: true });
  ensureProjectDirectory(root, path.posix.dirname(REGISTRY));
  const file = path.join(root, REGISTRY);
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, file);
  return getArtifact(root, clean.key);
}

module.exports = { REGISTRY, readArtifacts, getArtifact, listArtifacts, addArtifact, artifactSlug };
