const fs = require('node:fs');
const path = require('node:path');
const { doctorProject } = require('./doctor-project');
const { listArtifacts } = require('./project-artifacts');
const { readCatalog } = require('./output-catalog');

// One recommended next step for a project, decided from files on disk rather
// than from an agent's memory. Read-only. Order: blocking issues → UI-kit data →
// builds in dependency order → failed checks → local comparison → editor
// import → done.
const BUILD_STATUSES = new Set(['never-built', 'stale', 'output-missing', 'output-modified']);
const BLOCKING_WARNINGS = new Set(['UI_KIT_MODIFIED', 'LOCK_ABANDONED', 'CLASS_RULE_CONFLICT', 'CATALOG_PAGE_MISSING', 'CATALOG_PAGE_OUT_OF_DATE']);

function dependencyOrder(artifacts) {
  const byKey = new Map(artifacts.map(item => [item.key, item]));
  const order = [];
  const seen = new Set();
  const visit = key => {
    if (seen.has(key) || !byKey.has(key)) return;
    seen.add(key);
    for (const dep of byKey.get(key).dependsOn) visit(dep);
    order.push(key);
  };
  for (const key of [...byKey.keys()].sort((a, b) => (a === 'ui-kit' ? -1 : b === 'ui-kit' ? 1 : a.localeCompare(b)))) visit(key);
  return order;
}

function nextAction(projectRoot) {
  const root = path.resolve(projectRoot);
  const report = doctorProject(root);
  const label = report.project?.path || root;
  const cmd = rest => `npm run toolkit -- ${rest}`;
  const error = report.issues.find(item => item.level === 'error');
  if (error) return { action: 'fix', code: error.code, path: error.path, reason: error.message, command: error.nextAction };
  if (report.issues.some(item => item.code === 'LEGACY_LAYOUT')) {
    return { action: 'legacy-project', reason: 'Legacy layout: managed builds are unavailable.', command: cmd(`normalize ${label} <html> <css>`), docs: 'system/docs/html-normalizer.md' };
  }
  const warning = report.issues.find(item => BLOCKING_WARNINGS.has(item.code));
  if (warning) return { action: 'fix', code: warning.code, path: warning.path, reason: warning.message, command: warning.nextAction };

  const artifacts = listArtifacts(root);
  const hasKit = artifacts.some(item => item.key === 'ui-kit');
  if (!hasKit) {
    if (!fs.existsSync(path.join(root, 'design-system/kit.json'))) {
      return { action: 'prepare-ui-kit-data', reason: 'The project has no UI-kit data yet. Write design-system/kit.json and design-system/roles.css from confirmed source values only; mark everything else MISSING.', docs: 'system/skills/taptop-site-transfer/references/kit-data.md' };
    }
    return { action: 'generate-ui-kit', reason: 'UI-kit data exists but the UI kit has not been generated.', command: cmd(`ui-kit ${label} --data design-system/kit.json`) };
  }

  const rows = new Map(report.artifacts.map(row => [row.key, row]));
  const order = dependencyOrder(artifacts);
  for (const key of order) {
    const row = rows.get(key);
    if (row && BUILD_STATUSES.has(row.status)) {
      return { action: 'build', artifact: key, reason: row.status === 'never-built' ? `${key} has no build yet.` : `${key} is ${row.status}: ${row.reasons.join('; ')}`, command: cmd(`build --project ${label} --artifact ${key}`) };
    }
  }

  const catalog = readCatalog(root);
  const current = key => {
    const entry = catalog.artifacts[key];
    return entry?.builds.find(build => build.buildId === entry.current);
  };
  const compareUrl = (key, build) => {
    const artifact = artifacts.find(item => item.key === key);
    const original = fs.existsSync(path.join(root, path.posix.dirname(build.html), 'original.html')) ? `${path.posix.dirname(build.html)}/original.html` : artifact.html;
    return label.startsWith('projects/') ? `http://127.0.0.1:4320/system/docs/tools/normalize-compare.html?original=/${label}/${original}&normalized=/${label}/${build.html}` : null;
  };
  for (const key of order) {
    const build = current(key);
    const failed = Object.entries(build?.verification || {}).find(([, result]) => result === 'failed');
    if (failed) {
      const note = [...(build.checks || [])].reverse().find(check => check.level === failed[0])?.note;
      return { action: 'fix-failed-check', artifact: key, level: failed[0], reason: `The ${failed[0]} check of ${key} failed${note ? `: ${note}` : ''}. Find the cause, fix the source or the Bridge rule, rebuild, check again.`, docs: 'AGENTS.md' };
    }
  }
  for (const key of order) {
    const build = current(key);
    if (build && build.verification?.local !== 'passed') {
      return { action: 'check-local', artifact: key, reason: `Compare the original and ${key} at 1440/992/768/480/320/900/700/375 (start the server with: ${cmd('serve')}), then record the result.`, compare: compareUrl(key, build), command: cmd(`check --project ${label} --artifact ${key} --level local --result passed|failed --note "<widths, matched elements, differences>"`) };
    }
  }
  for (const key of order) {
    const build = current(key);
    if (build && build.verification?.editor !== 'passed') {
      return { action: 'import-and-check-editor', artifact: key, json: build.json, reason: `Ask the user to import ${build.json} with the Taptop Bridge Extension (UI kit before pages), check Computer/768/480/320, scroll, save, reload. Record only what was actually seen.`, command: cmd(`check --project ${label} --artifact ${key} --level editor --result passed|failed --note "<what was checked>"`) };
    }
  }
  return { action: 'done', reason: 'Every registered artifact is built, compared locally and checked in the editor. Register the next page or component, or check the published page only with explicit consent.', command: cmd(`artifact add --project ${label} --key pages/<name> --html <file.html> --css design-system/roles.css --css <file.css> --depends ui-kit`) };
}

module.exports = { nextAction };
