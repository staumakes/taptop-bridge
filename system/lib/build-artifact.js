const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { version } = require('../../package.json');
const { loadProject, readProjectFile, ensureProjectDirectory } = require('./project');
const { getArtifact, listArtifacts } = require('./project-artifacts');
const { normalizeInto } = require('./normalize-project');
const { compileProject } = require('./compile-project');
const { validateIntake } = require('./intake');
const { acquireProjectLock } = require('./project-lock');
const { readCatalog, writeCatalog, writeIndex, artifactStatuses, sha256, fileHash } = require('./output-catalog');

// Safety net after the normalizer's rename (see taptop-system-classes.js).
const { RESERVED_CLASS_NAMES, counterSafeClass } = require('./taptop-system-classes');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

// What the registry says about how to build this artifact. A change here (other
// stylesheets, root selector, intake, dependencies) makes the result stale.
function registrationOf(artifact) {
  return { html: artifact.html, stylesheets: artifact.stylesheets, rootSelector: artifact.rootSelector || null, intake: artifact.intake || null, dependsOn: artifact.dependsOn };
}

function buildIdFor(date = new Date()) {
  return `${date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${randomBytes(4).toString('hex')}`;
}

// Source classes only: the compiler itself adds Taptop's layer base classes
// (div, text, link-block …) to the clipboard data, and those are expected.
function sourceClassNames(html) {
  return new Set([...html.matchAll(/\sclass="([^"]*)"/g)].flatMap(match => match[1].split(/\s+/)).filter(Boolean));
}

function classFingerprints(pkg) {
  return Object.fromEntries(pkg.syncPackage.classes.map(item => [item.name, sha256(JSON.stringify(canonical(item.ownedRules)))]).sort(([a], [b]) => a.localeCompare(b)));
}

function dependencyClosure(artifacts, key) {
  const byKey = new Map(artifacts.map(item => [item.key, item]));
  const seen = new Set();
  const visit = next => { for (const dep of byKey.get(next)?.dependsOn || []) if (!seen.has(dep)) { seen.add(dep); visit(dep); } };
  visit(key);
  return seen;
}

// A shared class must have one rule set in the whole project. The UI kit (and
// any other dependency) is authoritative; an unrelated current artifact that
// disagrees is a conflict; dependants are not checked — they become stale.
function checkClasses(root, artifact, pkg, catalog, html) {
  for (const name of sourceClassNames(html)) {
    if (RESERVED_CLASS_NAMES.has(name)) throw new Error(`RESERVED_CLASS_NAME: ${name} — Taptop uses this name itself; rename the class in the source`);
  }
  // Every class the package creates, including compiler-generated ones.
  for (const { name } of pkg.syncPackage.classes) {
    if (counterSafeClass(name) !== name) throw new Error(`CLASS_NAME_RESPELLED: ${name} — Taptop would store it as a duplicate counter under another name; use ${counterSafeClass(name)}`);
  }
  const fingerprints = classFingerprints(pkg);
  const artifacts = listArtifacts(root);
  const dependencies = dependencyClosure(artifacts, artifact.key);
  const statuses = new Map(artifactStatuses(root, catalog).map(row => [row.key, row]));
  const warnings = [];
  for (const other of artifacts) {
    if (other.key === artifact.key) continue;
    const row = statuses.get(other.key);
    if (!row?.build) continue;
    const isDependency = dependencies.has(other.key);
    if (!isDependency && dependencyClosure(artifacts, other.key).has(artifact.key)) continue;
    if (!isDependency && row.status !== 'current') continue;
    for (const [name, fingerprint] of Object.entries(fingerprints)) {
      const theirs = row.build.classes?.[name];
      if (!theirs || theirs === fingerprint) continue;
      if (isDependency && other.kind === 'ui-kit') throw new Error(`UI_KIT_CLASS_MISMATCH: ${name} differs from UI kit build ${row.build.buildId}. Change the UI kit first, rebuild it, then use exactly its rules here.`);
      if (isDependency) throw new Error(`DEPENDENCY_CLASS_MISMATCH: ${name} differs from ${other.key} build ${row.build.buildId}`);
      throw new Error(`CLASS_RULE_CONFLICT: ${name} has different rules in ${other.key} build ${row.build.buildId}. One class name must keep one rule set in a project.`);
    }
  }
  if (artifact.dependsOn.includes('ui-kit')) {
    const kit = statuses.get('ui-kit')?.build;
    if (kit && !Object.keys(fingerprints).some(name => kit.classes?.[name])) {
      warnings.push({ code: 'NO_UI_KIT_ROLES_USED', message: 'This artifact depends on the UI kit but uses none of its classes. Use the exact UI-kit role classes for text, buttons and links.' });
    }
  }
  return { fingerprints, warnings };
}

async function buildArtifact({ projectRoot, artifactKey, failAfter = null }) {
  const root = path.resolve(projectRoot);
  const config = loadProject(root);
  if (config.layoutVersion !== 2) throw new Error('MANAGED_BUILD_REQUIRES_LAYOUT_2: this project uses the legacy layout; keep using normalize/compile or create a new project with init');
  // The lock is taken before the first await, so two calls in one process are
  // ordered too.
  const release = acquireProjectLock(root, `build ${artifactKey}`);
  const created = [];
  let staging = null;
  const journal = state => fs.writeFileSync(path.join(root, staging, 'build.json'), `${JSON.stringify({ schemaVersion: 1, artifactKey, toolkitVersion: version, ...state }, null, 2)}\n`);
  const step = name => { if (failAfter === name) throw new Error(`INJECTED_FAILURE: ${name}`); };
  const startedAt = new Date().toISOString();
  let buildId = null;
  let finished = false;
  try {
    const artifact = getArtifact(root, artifactKey);
    const catalog = readCatalog(root);
    const dependencies = {};
    for (const key of artifact.dependsOn) {
      const current = catalog.artifacts[key]?.current;
      if (!current) throw new Error(`DEPENDENCY_NOT_BUILT: ${key} — build it first: npm run toolkit -- build --project <project> --artifact ${key}`);
      dependencies[key] = current;
    }
    let intake = null;
    if (artifact.intake) {
      try { intake = JSON.parse(readProjectFile(root, artifact.intake)); }
      catch (error) { throw new Error(`INVALID_INTAKE: ${artifact.intake} cannot be read (${error.message})`); }
      const report = validateIntake(intake);
      if (!report.valid) throw new Error(`INVALID_INTAKE: ${report.errors.map(item => item.code).join(', ')}`);
    }
    // Inputs are hashed before they are read for the build; a file edited during
    // the build then shows the result as stale instead of silently current.
    const declared = [artifact.html, ...artifact.stylesheets, ...(artifact.intake ? [artifact.intake] : [])];
    const inputs = declared.map(file => { readProjectFile(root, file); return { path: file, sha256: fileHash(root, file) }; });

    buildId = buildIdFor();
    staging = `.taptop/builds/${artifact.slug}/${buildId}`;
    ensureProjectDirectory(root, path.posix.dirname(staging));
    fs.mkdirSync(path.join(root, staging));
    journal({ buildId, status: 'started', startedAt });

    const work = `.taptop/work/${artifact.slug}`;
    ensureProjectDirectory(root, '.taptop/work');
    fs.rmSync(path.join(root, work), { recursive: true, force: true });
    const normalized = await normalizeInto(root, { htmlPath: artifact.html, cssPaths: artifact.stylesheets, rootSelector: artifact.rootSelector, componentKey: artifact.componentKey, directory: work, sliders: intake?.html?.sliders });
    if (!normalized.ok) {
      const codes = [...new Set(normalized.items.filter(item => item.level === 'error').map(item => item.code))];
      throw new Error(`NORMALIZATION_FAILED: ${codes.join(', ')} — see ${normalized.report}`);
    }
    for (const asset of normalized.assets) if (!inputs.some(item => item.path === asset)) inputs.push({ path: asset, sha256: fileHash(root, asset) });
    step('normalized');

    const packagePath = `${staging}/package.json`;
    const compiled = await compileProject(root, normalized.manifest, path.join(root, packagePath), { projectClassKeys: true });
    const packageBytes = fs.readFileSync(path.join(root, packagePath));
    const pkg = JSON.parse(packageBytes.toString('utf8'));
    step('compiled');
    const { fingerprints, warnings } = checkClasses(root, artifact, pkg, catalog, readProjectFile(root, `${work}/page.html`));

    const registration = registrationOf(artifact);
    const entry = catalog.artifacts[artifact.key];
    const previous = entry?.current ? entry.builds.find(item => item.buildId === entry.current) : null;
    if (previous && previous.sourceRevision === compiled.sourceRevision && previous.toolkitVersion === version
      && JSON.stringify(canonical(previous.dependencies)) === JSON.stringify(canonical(dependencies))
      && JSON.stringify(canonical(previous.registration || registration)) === JSON.stringify(canonical(registration))
      && fileHash(root, previous.json) === previous.jsonSha256 && fs.existsSync(path.join(root, previous.html))) {
      journal({ buildId, status: 'up-to-date', startedAt, finishedAt: new Date().toISOString(), currentBuildId: previous.buildId });
      fs.rmSync(path.join(root, packagePath), { force: true });
      // Inputs changed without changing the result (a comment, a reset the
      // normalizer drops): the current build is valid for them, so record their
      // new hashes instead of leaving the result stale forever.
      const sameInputs = JSON.stringify(canonical(previous.inputs)) === JSON.stringify(canonical(inputs)) && previous.registration;
      if (!sameInputs) {
        const next = structuredClone(catalog);
        const record = next.artifacts[artifact.key].builds.find(item => item.buildId === previous.buildId);
        record.inputs = inputs;
        record.registration = registration;
        record.revalidatedAt = new Date().toISOString();
        writeCatalog(root, next);
        writeIndex(root, next);
      }
      return { status: 'up-to-date', artifactKey: artifact.key, slug: artifact.slug, buildId: previous.buildId, sourceRevision: previous.sourceRevision, htmlPath: previous.html, jsonPath: previous.json, warnings };
    }

    const preview = `${staging}/html`;
    fs.cpSync(path.join(root, work), path.join(root, preview), { recursive: true, errorOnExist: true, force: false });
    step('preview-assembled');

    const name = `${artifact.slug}--${buildId}`;
    const htmlDirectory = `output/html/${name}`;
    const jsonPath = `output/json/${name}.json`;
    ensureProjectDirectory(root, 'output/html');
    ensureProjectDirectory(root, 'output/json');
    const partialHtml = `output/html/.${name}.partial`;
    const partialJson = `output/json/.${name}.json.partial`;
    created.push(partialHtml, partialJson, htmlDirectory, jsonPath);
    fs.cpSync(path.join(root, preview), path.join(root, partialHtml), { recursive: true, errorOnExist: true, force: false });
    fs.renameSync(path.join(root, partialHtml), path.join(root, htmlDirectory));
    fs.writeFileSync(path.join(root, partialJson), packageBytes, { flag: 'wx' });
    fs.renameSync(path.join(root, partialJson), path.join(root, jsonPath));
    step('outputs-copied');

    const record = {
      buildId, status: 'succeeded', createdAt: new Date().toISOString(), toolkitVersion: version,
      componentKey: artifact.componentKey, sourceRevision: compiled.sourceRevision,
      html: `${htmlDirectory}/page.html`, json: jsonPath, jsonSha256: sha256(packageBytes),
      registration, dependencies, inputs, classes: fingerprints, warnings,
      verification: { local: 'not-recorded', editor: 'not-recorded', published: 'not-recorded' }
    };
    const next = structuredClone(catalog);
    next.artifacts[artifact.key] = { current: buildId, builds: [record, ...(entry?.builds || [])] };
    writeCatalog(root, next);
    created.length = 0; // listed in the catalogue: never clean these up any more
    finished = true;
    step('catalog-written');
    // The build is finished once it is catalogued. Later housekeeping problems
    // become warnings; they never turn a published result into a failure.
    try { writeIndex(root, next); }
    catch (error) { warnings.push({ code: 'CATALOG_PAGE_NOT_UPDATED', message: `${error.message}. Run the catalog command.` }); }
    try {
      journal({ buildId, status: 'succeeded', startedAt, finishedAt: record.createdAt });
      fs.rmSync(path.join(root, preview), { recursive: true, force: true });
      fs.rmSync(path.join(root, packagePath), { force: true });
    } catch (error) { warnings.push({ code: 'STAGING_NOT_CLEANED', message: error.message }); }
    return { status: 'built', artifactKey: artifact.key, slug: artifact.slug, buildId, sourceRevision: compiled.sourceRevision, htmlPath: record.html, jsonPath, warnings, nodes: compiled.nodes, classes: compiled.classes };
  } catch (error) {
    for (const file of created.reverse()) fs.rmSync(path.join(root, file), { recursive: true, force: true });
    if (staging) {
      // Keep only the journal of a failed build; its package and preview were never published.
      try {
        if (!finished) {
          fs.rmSync(path.join(root, staging, 'package.json'), { force: true });
          fs.rmSync(path.join(root, staging, 'html'), { recursive: true, force: true });
        }
        journal({ buildId, status: finished ? 'succeeded' : 'failed', startedAt, finishedAt: new Date().toISOString(), error: error.message });
      } catch {}
    }
    throw error;
  } finally {
    release();
  }
}

module.exports = { buildArtifact, registrationOf, RESERVED_CLASS_NAMES };
