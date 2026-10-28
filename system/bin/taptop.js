#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { initProject, readProjectFile, loadProject } = require('../lib/project');
const { compileProject } = require('../lib/compile-project');
const { validateIntake } = require('../lib/intake');
const { migrateLegacyV1 } = require('../lib/migrate-legacy-v1');
const { preflightImportPackage } = require('../lib/import-package-preflight');
const { writeUiKit } = require('../lib/ui-kit/write');
const { normalizeProject } = require('../lib/normalize-project');
const { listProjects, resolveProject } = require('../lib/workspace-projects');
const { addArtifact } = require('../lib/project-artifacts');
const { buildArtifact } = require('../lib/build-artifact');
const { artifactStatuses, writeIndex } = require('../lib/output-catalog');
const { acquireProjectLock } = require('../lib/project-lock');
const { doctorProject } = require('../lib/doctor-project');
const { recordCheck } = require('../lib/record-check');
const { startStaticServer } = require('../lib/static-server');
const { getArtifact } = require('../lib/project-artifacts');
const { nextAction } = require('../lib/next-action');
const { checkUiKitData } = require('../lib/ui-kit/check');
const { figmaExport, figmaLink } = require('../lib/figma-export');

const TOOLKIT_ROOT = path.resolve(__dirname, '../..');
const SERVE_PORT = 4320;

const { USAGE } = require('../lib/cli-usage');

const print = value => console.log(JSON.stringify(value, null, 2));

// --name value pairs; repeatable options collect arrays; flags take no value.
function options(values, { repeatable = [], flags = [], allowed }) {
  const result = {};
  for (let index = 0; index < values.length; index++) {
    const token = values[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument ${token}\n${USAGE}`);
    const name = token.slice(2);
    if (!allowed.includes(name)) throw new Error(`Unknown option ${token}\n${USAGE}`);
    if (flags.includes(name)) { result[name] = true; continue; }
    const value = values[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`Option ${token} needs a value`);
    if (repeatable.includes(name)) (result[name] ||= []).push(value);
    else if (Object.hasOwn(result, name)) throw new Error(`Option ${token} was given twice`);
    else result[name] = value;
  }
  return result;
}

// Resolves --project to exactly one validated project. A missing, invalid or
// duplicated project is an error; another project is never chosen instead.
function selectProject(value) {
  if (!value) throw new Error('--project is required: pass projects/<folder>. Run "npm run toolkit -- projects" to list projects.');
  const absolute = path.resolve(process.cwd(), value);
  const parent = path.dirname(absolute);
  const workspaceRoot = path.basename(parent) === 'projects' ? path.dirname(parent) : process.cwd();
  const result = resolveProject({ workspaceRoot, explicitProject: absolute });
  if (result.status !== 'selected') throw new Error(result.issues.map(item => `${item.code}: ${item.relativePath} — ${item.message}`).join('\n'));
  return result.projectRoot;
}

function projectArgument(root) {
  const relative = path.relative(process.cwd(), root).split(path.sep).join('/');
  return relative && !relative.startsWith('..') ? relative : root;
}

async function main(args) {
  const [command, ...values] = args;
  if (command === 'init' && values.length === 2) {
    initProject(...values);
    console.log('Empty project created. No existing project was modified.');
  } else if (command === 'projects' && values.length <= 1) {
    const result = listProjects(values[0] || path.resolve(__dirname, '../..'));
    print({ projects: result.projects.map(({ namespace, displayName, relativePath }) => ({ namespace, displayName, relativePath })), issues: result.issues, warnings: result.warnings });
    if (result.issues.length) process.exitCode = 1;
  } else if (command === 'artifact' && values[0] === 'add') {
    const opts = options(values.slice(1), { repeatable: ['css', 'depends'], flags: ['replace'], allowed: ['project', 'key', 'title', 'html', 'css', 'root', 'intake', 'depends', 'replace'] });
    const root = selectProject(opts.project);
    const release = acquireProjectLock(root, `artifact add ${opts.key}`);
    try {
      const artifact = addArtifact(root, { key: opts.key, title: opts.title, html: opts.html, stylesheets: opts.css || [], rootSelector: opts.root, intake: opts.intake, dependsOn: opts.depends }, { replace: opts.replace === true });
      print({ artifact, next: `npm run toolkit -- build --project ${projectArgument(root)} --artifact ${artifact.key}` });
    } finally { release(); }
  } else if ((command === 'artifact' && values[0] === 'list') || command === 'artifacts') {
    const opts = options(command === 'artifacts' ? values : values.slice(1), { allowed: ['project'] });
    const root = selectProject(opts.project);
    print({ artifacts: artifactStatuses(root).map(row => ({ key: row.key, kind: row.kind, status: row.status, reasons: row.reasons, buildId: row.build?.buildId || null, html: row.build?.html || null, json: row.build?.json || null })) });
  } else if (command === 'build') {
    const opts = options(values, { allowed: ['project', 'artifact'] });
    const root = selectProject(opts.project);
    if (!opts.artifact) throw new Error('--artifact is required (see "artifact list")');
    const result = await buildArtifact({ projectRoot: root, artifactKey: opts.artifact });
    const links = {};
    const fromToolkit = path.relative(TOOLKIT_ROOT, root).split(path.sep).join('/');
    if (!fromToolkit.startsWith('..') && !path.isAbsolute(fromToolkit)) {
      const base = `http://127.0.0.1:${SERVE_PORT}/${fromToolkit}`;
      links.serve = 'npm run toolkit -- serve';
      links.results = `${base}/output/html/index.html`;
      links.preview = `${base}/${result.htmlPath}`;
      links.compare = `http://127.0.0.1:${SERVE_PORT}/system/docs/tools/normalize-compare.html?original=/${fromToolkit}/${path.posix.dirname(result.htmlPath)}/original.html&normalized=/${fromToolkit}/${result.htmlPath}`;
    }
    print({ ...result, results: 'output/html/index.html', links, note: 'Built and preflighted locally; this is not a verified Taptop import. Compare the preview, then import the JSON and check the editor.' });
  } else if (command === 'doctor') {
    const opts = options(values, { allowed: ['project'] });
    if (!opts.project) throw new Error('--project is required');
    const root = path.resolve(process.cwd(), opts.project);
    if (!fs.existsSync(root) || fs.lstatSync(root).isSymbolicLink()) throw new Error(`INVALID_SELECTION: ${opts.project} is not a project folder`);
    const report = doctorProject(root);
    print(report);
    if (!report.ok) process.exitCode = 1;
  } else if (command === 'catalog') {
    const opts = options(values, { allowed: ['project'] });
    const root = selectProject(opts.project);
    const release = acquireProjectLock(root, 'catalog');
    try { print({ index: writeIndex(root) }); } finally { release(); }
  } else if (command === 'next') {
    const opts = options(values, { allowed: ['project'] });
    if (!opts.project) throw new Error('--project is required');
    const root = path.resolve(process.cwd(), opts.project);
    if (!fs.existsSync(root) || fs.lstatSync(root).isSymbolicLink()) throw new Error(`INVALID_SELECTION: ${opts.project} is not a project folder`);
    print(nextAction(root));
  } else if (command === 'check') {
    const opts = options(values, { allowed: ['project', 'artifact', 'level', 'result', 'note'] });
    const root = selectProject(opts.project);
    print(recordCheck({ projectRoot: root, artifactKey: opts.artifact, level: opts.level, result: opts.result, note: opts.note }));
  } else if (command === 'figma-export') {
    const opts = options(values, { allowed: ['project', 'artifact', 'widths'] });
    const root = selectProject(opts.project);
    if (!opts.artifact) throw new Error('--artifact is required (see "artifact list")');
    const result = await figmaExport({ projectRoot: root, artifactKey: opts.artifact, widths: opts.widths });
    print({ ...result, next: `Import ${result.exports.map(item => item.file).join(', ')} into Figma (each ${result.cssSelector} element becomes one frame), assemble the component, then: npm run toolkit -- figma-link --project ${projectArgument(root)} --artifact ${opts.artifact} --file <figma-file-key> --node <component-set-id>` });
  } else if (command === 'figma-link') {
    const opts = options(values, { allowed: ['project', 'artifact', 'file', 'node'] });
    const root = selectProject(opts.project);
    if (!opts.artifact) throw new Error('--artifact is required (see "artifact list")');
    print(figmaLink({ projectRoot: root, artifactKey: opts.artifact, fileKey: opts.file, nodeId: opts.node }));
  } else if (command === 'serve') {
    const opts = options(values, { allowed: ['port'] });
    const port = opts.port === undefined ? SERVE_PORT : Number(opts.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port must be a port number');
    await startStaticServer({ root: TOOLKIT_ROOT, port });
    console.log(`Serving ${TOOLKIT_ROOT} read-only at http://127.0.0.1:${port}/ (this computer only). Results: /projects/<folder>/output/html/index.html. Stop with Ctrl+C.`);
  } else if (command === 'compile' && values.length === 3) {
    print(await compileProject(...values));
    console.log('Package validated locally. Live Taptop import is not verified.');
  } else if (command === 'intake' && values.length === 2) {
    loadProject(values[0]);
    const intake = JSON.parse(readProjectFile(values[0], values[1]));
    const report = validateIntake(intake);
    print(report);
    if (!report.valid) process.exitCode = 1;
  } else if (command === 'migrate-v1' && values.length === 3) {
    const [legacyFile, assetRoot, outputFile] = values;
    if (path.resolve(legacyFile) === path.resolve(outputFile)) throw new Error('OUTPUT_MUST_NOT_REPLACE_LEGACY_FILE');
    const legacy = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
    const migrated = migrateLegacyV1({ wrapper: legacy, assetRoot });
    const report = preflightImportPackage(migrated);
    if (!report.ok) throw new Error(`MIGRATION_PREFLIGHT_FAILED: ${report.errors.join('; ')}`);
    fs.writeFileSync(outputFile, `${JSON.stringify(migrated, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    print({ outputFile, summary: report.summary, warnings: report.warnings });
  } else if (command === 'normalize' && (values.length === 3 || (values.length === 5 && values[3] === '--root'))) {
    const result = await normalizeProject(values[0], values[1], values[2], { rootSelector: values[4] });
    const summary = {};
    for (const item of result.items) summary[item.level] = (summary[item.level] || 0) + 1;
    print({ ok: result.ok, summary, manifest: result.manifest, report: result.report });
    for (const item of result.items.filter(entry => entry.level !== 'info')) console.log(`${item.level.toUpperCase()} ${item.code}: ${item.reason}${item.source ? ` (${item.source})` : ''}`);
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'ui-kit' && values.length >= 1) {
    const opts = options(values.slice(1), { flags: ['replace', 'check'], allowed: ['font', 'data', 'replace', 'check'] });
    const root = values[0];
    const config = loadProject(root);
    if (opts.check) {
      if (!opts.data) throw new Error('--check needs --data <kit.json>');
      const report = checkUiKitData(root, { data: opts.data });
      print(report);
      if (!report.ok) process.exitCode = 1;
      return;
    }
    const release = config.layoutVersion === 2 ? acquireProjectLock(root, 'ui-kit') : () => {};
    let files;
    try { files = writeUiKit(root, opts); } finally { release(); }
    const project = projectArgument(path.resolve(root));
    print({ files, next: config.layoutVersion === 2
      ? [`npm run toolkit -- build --project ${project} --artifact ui-kit`]
      : [`npm run toolkit -- normalize ${project} source/ui-kit/ui-kit.html source/ui-kit/ui-kit.css`, `npm run toolkit -- compile ${project} source/normalized/manifest.json <new-output-file>`] });
  } else {
    throw new Error(USAGE);
  }
}
main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
