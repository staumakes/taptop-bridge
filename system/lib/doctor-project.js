const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { loadProject } = require('./project');
const { listArtifacts } = require('./project-artifacts');
const { readCatalog, artifactStatuses, INDEX } = require('./output-catalog');
const { lockState } = require('./project-lock');
const { listProjects } = require('./workspace-projects');
const { validateIntake } = require('./intake');
const { readLibrary, LIBRARY_FILE } = require('./figma-export');

// Read-only project diagnosis. Every issue names the affected path and one
// concrete next action; nothing is repaired, deleted or re-pinned here.
const PROJECT_FOLDERS = ['input', 'design-system', 'source', 'output', 'output/html', 'output/json', '.taptop'];

function projectLabel(root) {
  const parent = path.dirname(root);
  return path.basename(parent) === 'projects' ? `projects/${path.basename(root)}` : root;
}

function doctorProject(projectRoot) {
  const root = path.resolve(projectRoot);
  const label = projectLabel(root);
  const issues = [];
  const add = (level, code, file, message, nextAction) => issues.push({ level, code, path: file, message, nextAction });
  const build = key => `npm run toolkit -- build --project ${label} --artifact ${key}`;
  const finish = (project, artifacts = []) => ({ ok: !issues.some(item => item.level === 'error'), project, issues, artifacts });

  let config;
  try { config = loadProject(root); }
  catch (error) {
    add('error', 'PROJECT_CONFIG_INVALID', 'taptop.project.json', error.message, /INCOMPATIBLE_TOOLKIT/.test(error.message)
      ? 'Use the Bridge version pinned in taptop.project.json, or migrate the project deliberately; never edit the pinned version to silence this.'
      : 'Restore taptop.project.json and design-system/registry.json from your backup; doctor cannot guess their values.');
    return finish(null);
  }
  const project = { namespace: config.namespace, displayName: config.displayName || path.basename(root), layoutVersion: config.layoutVersion || 1, toolkitVersion: config.toolkitVersion, path: label };

  if (path.basename(path.dirname(root)) === 'projects') {
    const workspace = listProjects(path.dirname(path.dirname(root)));
    for (const item of workspace.issues.filter(entry => entry.relativePath === label && entry.code === 'DUPLICATE_NAMESPACE')) {
      add('error', 'DUPLICATE_NAMESPACE', 'taptop.project.json', item.message, 'Keep one folder per namespace. For an independent site create a new project with init and copy only its input files; never share receipts between them.');
    }
  }
  if (!config.layoutVersion) {
    add('info', 'LEGACY_LAYOUT', 'taptop.project.json', 'This project uses the legacy layout: only normalize and compile are available.', 'Keep using normalize/compile, or create a new project with init for managed builds; no automatic migration rewrites a project.');
    return finish(project);
  }

  for (const folder of PROJECT_FOLDERS) {
    const stat = fs.lstatSync(path.join(root, folder), { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) add('error', 'SYMLINKED_PROJECT_FOLDER', folder, `${folder} is a symbolic link; generated files could land outside the project.`, `Replace ${folder} with a real folder inside the project.`);
  }

  const lock = lockState(root);
  if (lock.state === 'held') add('info', 'LOCK_HELD', '.taptop/lock', `A task is writing this project: ${lock.lock.operation} since ${lock.lock.startedAt}.`, 'Wait for it to finish before starting another build.');
  if (lock.state === 'abandoned') add('warning', 'LOCK_ABANDONED', '.taptop/lock', `The task that locked the project (process ${lock.lock.pid}) no longer runs.`, 'The next build records and removes this lock automatically.');
  if (lock.state === 'unknown') add('error', 'LOCK_UNREADABLE', '.taptop/lock', 'The project lock cannot be read.', 'Make sure no Bridge task is running for this project, then delete .taptop/lock yourself.');

  let artifacts;
  try { artifacts = listArtifacts(root); }
  catch (error) {
    add('error', 'ARTIFACT_REGISTRY_INVALID', 'source/artifacts.json', error.message, 'Fix source/artifacts.json (it must list ui-kit, components/<name> and pages/<name> entries) or restore it from backup.');
    return finish(project);
  }
  for (const artifact of artifacts) {
    for (const file of [artifact.html, ...artifact.stylesheets, ...(artifact.intake ? [artifact.intake] : [])]) {
      if (!fs.existsSync(path.join(root, file))) add('error', 'ARTIFACT_SOURCE_MISSING', file, `${artifact.key} needs ${file}, which does not exist.`, `Restore ${file}, or register the artifact again with the correct path.`);
    }
    if (artifact.intake && fs.existsSync(path.join(root, artifact.intake))) {
      let report;
      try { report = validateIntake(JSON.parse(fs.readFileSync(path.join(root, artifact.intake), 'utf8'))); }
      catch (error) { report = { valid: false, errors: [{ code: 'UNREADABLE', message: error.message }] }; }
      if (!report.valid) add('error', 'INTAKE_INVALID', artifact.intake, report.errors.map(item => item.code).join(', '), 'Complete the intake with the real source evidence; leave missing values as MISSING instead of inventing them.');
    }
  }

  const record = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, '.taptop/ui-kit-generation.json'), 'utf8')); } catch { return null; } })();
  if (record) {
    for (const [file, expected] of Object.entries(record.files || {})) {
      const bytes = fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file)) : null;
      if (!bytes || createHash('sha256').update(bytes).digest('hex') !== expected) {
        add('warning', 'UI_KIT_MODIFIED', file, `${file} differs from what the UI-kit generator wrote.`, 'Move manual changes into design-system data (kit.json, roles.css), restore the generated file from .taptop/history/ui-kit/, then run ui-kit --replace.');
      }
    }
  }

  let catalog;
  try { catalog = readCatalog(root); }
  catch (error) {
    add('error', 'CATALOG_CORRUPT', '.taptop/outputs.json', error.message, 'Restore the latest copy from .taptop/history/outputs/; do not delete output files.');
    return finish(project);
  }

  const statuses = artifactStatuses(root, catalog);
  for (const row of statuses) {
    if (row.status === 'never-built') add('info', 'NOT_BUILT', row.key, `${row.key} has no build yet.`, build(row.key));
    if (row.status === 'stale') add('warning', 'STALE_RESULT', row.build.json, `${row.key}: ${row.reasons.join('; ')}.`, `${build(row.key)} — the previous files stay available.`);
    if (row.status === 'output-missing') add('error', 'OUTPUT_MISSING', row.key, row.reasons.join('; '), `${build(row.key)} to produce a new pair; restore the files if you need that exact build.`);
    if (row.status === 'output-modified') add('warning', 'OUTPUT_MODIFIED', row.build.json, row.reasons.join('; '), `Do not edit generated JSON; ${build(row.key)}.`);
    if (row.status === 'unregistered') add('warning', 'UNREGISTERED_RESULT', row.key, `${row.key} has results but is no longer registered.`, 'Register it again or keep its files only as history.');
  }

  const byKey = new Map(artifacts.map(item => [item.key, item]));
  const closure = key => { const seen = new Set(); const visit = next => { for (const dep of byKey.get(next)?.dependsOn || []) if (!seen.has(dep)) { seen.add(dep); visit(dep); } }; visit(key); return seen; };
  const current = statuses.filter(row => row.status === 'current' && row.build && byKey.has(row.key));
  for (let i = 0; i < current.length; i++) {
    for (let j = i + 1; j < current.length; j++) {
      const [a, b] = [current[i], current[j]];
      if (closure(a.key).has(b.key) || closure(b.key).has(a.key)) continue;
      for (const [name, fingerprint] of Object.entries(a.build.classes || {})) {
        const other = b.build.classes?.[name];
        if (other && other !== fingerprint) add('warning', 'CLASS_RULE_CONFLICT', name, `Class ${name} has different rules in ${a.key} and ${b.key}.`, 'Give the class one rule set (normally in the UI kit), then rebuild both artifacts.');
      }
    }
  }

  let library = null;
  try { library = readLibrary(root); }
  catch (error) { add('warning', 'FIGMA_LIBRARY_INVALID', LIBRARY_FILE, error.message, 'Restore the file from your backup or link the components again with figma-link.'); }
  for (const [key, link] of Object.entries(library?.links || {})) {
    const row = statuses.find(item => item.key === key);
    const latest = row?.build?.buildId;
    if (latest && latest === link.buildId) continue;
    add('warning', 'FIGMA_LINK_STALE', key, row ? `Figma node ${link.nodeId} shows build ${link.buildId}; the current build is ${latest || 'missing'}.` : `Figma node ${link.nodeId} shows ${key}, which is no longer registered.`,
      row ? `npm run toolkit -- figma-export --project ${label} --artifact ${key}, refresh the component in Figma (references/figma-library.md), then figma-link it again.` : 'Remove the Figma component or register the artifact again.');
  }

  const listed = new Set(Object.values(catalog.artifacts).flatMap(entry => entry.builds.flatMap(item => [item.json, path.posix.dirname(item.html)])));
  for (const folder of ['output/json', 'output/html']) {
    const stat = fs.lstatSync(path.join(root, folder), { throwIfNoEntry: false });
    if (!stat?.isDirectory() || stat.isSymbolicLink()) continue;
    for (const name of fs.readdirSync(path.join(root, folder))) {
      const file = `${folder}/${name}`;
      if (file === INDEX || name === '.DS_Store' || listed.has(file)) continue;
      add('warning', 'ORPHAN_OUTPUT', file, `${file} is not a finished, catalogued build (left by an interrupted build or added by hand).`, 'Do not import it. Delete it yourself when you no longer need it, or rebuild the artifact.');
    }
  }

  const builds = path.join(root, '.taptop/builds');
  if (fs.existsSync(builds) && lock.state !== 'held') {
    for (const slug of fs.readdirSync(builds)) {
      if (!fs.statSync(path.join(builds, slug)).isDirectory()) continue;
      for (const id of fs.readdirSync(path.join(builds, slug))) {
        const journal = path.join(builds, slug, id, 'build.json');
        let state;
        try { state = JSON.parse(fs.readFileSync(journal, 'utf8')); } catch { continue; }
        if (state.status === 'started') add('warning', 'INTERRUPTED_BUILD', `.taptop/builds/${slug}/${id}`, `Build ${id} of ${state.artifactKey} stopped before it finished; it was never published.`, `${build(state.artifactKey)} — the last finished result is unchanged.`);
      }
    }
  }

  const anyBuild = Object.values(catalog.artifacts).some(entry => entry.current);
  if (anyBuild) {
    const indexFile = path.join(root, INDEX);
    if (!fs.existsSync(indexFile)) add('warning', 'CATALOG_PAGE_MISSING', INDEX, 'The results page is missing.', `npm run toolkit -- catalog --project ${label}`);
    else {
      const text = fs.readFileSync(indexFile, 'utf8');
      const missing = statuses.filter(row => row.build && !text.includes(row.build.buildId));
      if (missing.length) add('warning', 'CATALOG_PAGE_OUT_OF_DATE', INDEX, `The results page does not list ${missing.map(row => row.key).join(', ')}.`, `npm run toolkit -- catalog --project ${label}`);
    }
  }

  return finish(project, statuses.map(row => ({ key: row.key, kind: row.kind, status: row.status, reasons: row.reasons, buildId: row.build?.buildId || null, html: row.build?.html || null, json: row.build?.json || null })));
}

module.exports = { doctorProject };
