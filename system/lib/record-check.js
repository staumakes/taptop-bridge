const { loadProject } = require('./project');
const { getArtifact } = require('./project-artifacts');
const { readCatalog, writeCatalog, writeIndex } = require('./output-catalog');
const { acquireProjectLock } = require('./project-lock');

// Records one human or agent check on the current build of an artifact. The
// three levels stay separate: a passing local comparison says nothing about the
// editor import, and neither says anything about a published page.
const LEVELS = new Set(['local', 'editor', 'published']);
const RESULTS = new Set(['passed', 'failed']);

function recordCheck({ projectRoot, artifactKey, level, result, note }) {
  loadProject(projectRoot);
  if (!LEVELS.has(level)) throw new Error('INVALID_CHECK_LEVEL: use local, editor or published');
  if (!RESULTS.has(result)) throw new Error('INVALID_CHECK_RESULT: use passed or failed');
  if (typeof note !== 'string' || !note.trim()) throw new Error('EVIDENCE_REQUIRED: describe what was checked (widths, canvases, save/reload) in --note');
  const release = acquireProjectLock(projectRoot, `check ${artifactKey}`);
  try {
    getArtifact(projectRoot, artifactKey);
    const catalog = readCatalog(projectRoot);
    const entry = catalog.artifacts[artifactKey];
    const build = entry?.builds.find(item => item.buildId === entry.current);
    if (!build) throw new Error(`NOT_BUILT: ${artifactKey} has no current build to check`);
    const checkedAt = new Date().toISOString();
    build.verification = { local: 'not-recorded', editor: 'not-recorded', published: 'not-recorded', ...build.verification, [level]: result };
    build.checks = [...(build.checks || []), { level, result, note: note.trim(), checkedAt }];
    writeCatalog(projectRoot, catalog);
    writeIndex(projectRoot, catalog);
    return { artifactKey, buildId: build.buildId, verification: build.verification };
  } finally {
    release();
  }
}

module.exports = { recordCheck };
