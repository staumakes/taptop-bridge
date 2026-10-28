const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { version } = require('../../package.json');
const { loadProject, ensureProjectDirectory } = require('./project');
const { listArtifacts } = require('./project-artifacts');

// `.taptop/outputs.json` is the authoritative list of finished builds. It is
// replaced in one rename after every output file exists, so a build that stops
// earlier is never listed. `output/html/index.html` is a view generated from it.
const CATALOG = '.taptop/outputs.json';
const INDEX = 'output/html/index.html';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function emptyCatalog(namespace) { return { schemaVersion: 1, namespace, artifacts: {} }; }

function readCatalog(root) {
  const { namespace } = loadProject(root);
  let text;
  try { text = fs.readFileSync(path.join(root, CATALOG), 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return emptyCatalog(namespace);
    throw error;
  }
  let catalog;
  try { catalog = JSON.parse(text); }
  catch { throw new Error(`CATALOG_CORRUPT: ${CATALOG} is not valid JSON. Do not delete outputs; restore the file from .taptop/history/ or run doctor.`); }
  if (catalog?.schemaVersion !== 1 || typeof catalog.artifacts !== 'object' || catalog.artifacts === null || Array.isArray(catalog.artifacts)) {
    throw new Error(`CATALOG_CORRUPT: ${CATALOG} has an unknown structure`);
  }
  if (catalog.namespace !== namespace) throw new Error(`CATALOG_CORRUPT: ${CATALOG} belongs to namespace ${catalog.namespace}, not ${namespace}`);
  return catalog;
}

function writeAtomically(root, relative, text) {
  ensureProjectDirectory(root, path.posix.dirname(relative));
  const file = path.join(root, relative);
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, text, { flag: 'wx' });
  fs.renameSync(temporary, file);
}

function writeCatalog(root, catalog) {
  const previous = path.join(root, CATALOG);
  if (fs.existsSync(previous)) {
    ensureProjectDirectory(root, '.taptop/history/outputs');
    fs.copyFileSync(previous, path.join(root, '.taptop/history/outputs', `outputs-${new Date().toISOString().replace(/[-:.]/g, '')}-${process.pid}.json`));
  }
  writeAtomically(root, CATALOG, `${JSON.stringify(catalog, null, 2)}\n`);
}

function fileHash(root, relative) {
  try { return sha256(fs.readFileSync(path.join(root, relative))); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// Current state of every registered artifact, computed from files on disk.
function artifactStatuses(root, catalog = readCatalog(root)) {
  const registered = listArtifacts(root);
  const keys = new Set(registered.map(item => item.key));
  const current = key => {
    const entry = catalog.artifacts[key];
    return entry?.current ? entry.builds.find(build => build.buildId === entry.current) : null;
  };
  const rows = registered.map(artifact => {
    const build = current(artifact.key);
    if (!build) return { key: artifact.key, kind: artifact.kind, status: 'never-built', reasons: [] };
    const reasons = [];
    for (const input of build.inputs) {
      const now = fileHash(root, input.path);
      if (now === null) reasons.push(`input missing: ${input.path}`);
      else if (now !== input.sha256) reasons.push(`input changed: ${input.path}`);
    }
    if (build.registration) {
      const now = { html: artifact.html, stylesheets: artifact.stylesheets, rootSelector: artifact.rootSelector || null, intake: artifact.intake || null, dependsOn: artifact.dependsOn };
      for (const field of Object.keys(now)) {
        if (JSON.stringify(now[field]) !== JSON.stringify(build.registration[field])) reasons.push(`registration changed: ${field}`);
      }
    } else {
      const declared = [artifact.html, ...artifact.stylesheets, ...(artifact.intake ? [artifact.intake] : [])];
      for (const file of declared) if (!build.inputs.some(input => input.path === file)) reasons.push(`source list changed: ${file}`);
    }
    for (const dependency of artifact.dependsOn) {
      const used = build.dependencies[dependency];
      const latest = catalog.artifacts[dependency]?.current;
      if (!latest) reasons.push(`dependency not built: ${dependency}`);
      else if (used !== latest) reasons.push(`dependency rebuilt: ${dependency}`);
    }
    if (build.toolkitVersion !== version) reasons.push(`built with Bridge ${build.toolkitVersion}`);
    const missing = [build.json, build.html].filter(file => !fs.existsSync(path.join(root, file)));
    if (missing.length) return { key: artifact.key, kind: artifact.kind, status: 'output-missing', reasons: missing.map(file => `missing: ${file}`), build };
    if (fileHash(root, build.json) !== build.jsonSha256) return { key: artifact.key, kind: artifact.kind, status: 'output-modified', reasons: [`changed after build: ${build.json}`], build };
    return { key: artifact.key, kind: artifact.kind, status: reasons.length ? 'stale' : 'current', reasons, build };
  });
  for (const key of Object.keys(catalog.artifacts)) {
    if (!keys.has(key)) rows.push({ key, kind: null, status: 'unregistered', reasons: ['artifact removed from source/artifacts.json'], build: current(key) });
  }
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const relativeFromIndex = file => file.startsWith('output/html/') ? file.slice('output/html/'.length) : `../${file.slice('output/'.length)}`;

function renderIndex(root, catalog) {
  const config = loadProject(root);
  const rows = artifactStatuses(root, catalog);
  const label = { 'ui-kit': 'UI kit', component: 'Component', page: 'Page' };
  const order = { 'ui-kit': 0, component: 1, page: 2 };
  rows.sort((a, b) => (order[a.kind] ?? 3) - (order[b.kind] ?? 3) || a.key.localeCompare(b.key));
  const checks = build => ['local', 'editor', 'published'].map(level => `${level}: ${escapeHtml(build.verification?.[level] || 'not-recorded')}`).join(' · ');
  const body = rows.map(row => {
    const build = row.build;
    const links = build ? `<a href="${escapeHtml(relativeFromIndex(build.html))}">Preview</a> · <a href="${escapeHtml(relativeFromIndex(build.json))}">JSON</a>` : '—';
    const history = (catalog.artifacts[row.key]?.builds || []).filter(item => item.buildId !== build?.buildId)
      .map(item => `<li><code>${escapeHtml(item.buildId)}</code> <a href="${escapeHtml(relativeFromIndex(item.html))}">Preview</a> · <a href="${escapeHtml(relativeFromIndex(item.json))}">JSON</a></li>`).join('');
    return `<tr class="status-${escapeHtml(row.status)}">
  <td><strong>${escapeHtml(row.key)}</strong><br><span class="muted">${escapeHtml(label[row.kind] || 'Not registered')}</span></td>
  <td><span class="badge">${escapeHtml(row.status)}</span>${row.reasons.length ? `<ul>${row.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>` : ''}</td>
  <td>${build ? `<code>${escapeHtml(build.buildId)}</code><br><span class="muted">${escapeHtml(checks(build))}</span>` : '—'}</td>
  <td>${links}${history ? `<details><summary>Earlier builds</summary><ul>${history}</ul></details>` : ''}</td>
</tr>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(config.displayName || config.namespace)} — Taptop Bridge results</title>
<style>
body { margin: 0; padding: 24px 16px; font: 14px/1.5 system-ui, sans-serif; color: #1d1d1f; background: #ffffff; }
main { max-width: 1100px; margin: 0 auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; vertical-align: top; padding: 10px 8px; border-bottom: 1px solid #e3e3e6; }
code { font-size: 12px; }
.muted { color: #6e6e73; font-size: 12px; }
.badge { display: inline-block; padding: 1px 8px; border-radius: 10px; background: #ececf0; font-size: 12px; }
.status-current .badge { background: #dff3e4; }
.status-stale .badge, .status-output-missing .badge, .status-output-modified .badge { background: #fbe9d0; }
ul { margin: 4px 0 0; padding-left: 18px; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(config.displayName || config.namespace)}</h1>
<p class="muted">Namespace <code>${escapeHtml(config.namespace)}</code>. Generated ${escapeHtml(new Date().toISOString())}; statuses are as of that moment — run <code>npm run toolkit -- doctor --project &lt;project&gt;</code> for the live state. “local”, “editor” and “published” are separate checks: a built JSON is not a verified Taptop import.</p>
<table>
<thead><tr><th>Artifact</th><th>Status</th><th>Build</th><th>Files</th></tr></thead>
<tbody>
${body || '<tr><td colspan="4">No artifacts are registered yet.</td></tr>'}
</tbody>
</table>
</main>
</body>
</html>
`;
}

function writeIndex(root, catalog = readCatalog(root)) {
  writeAtomically(root, INDEX, renderIndex(root, catalog));
  return INDEX;
}

module.exports = { CATALOG, INDEX, readCatalog, writeCatalog, writeIndex, artifactStatuses, emptyCatalog, sha256, fileHash, writeAtomically };
