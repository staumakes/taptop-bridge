const fs = require('node:fs');
const path = require('node:path');
const { loadProject } = require('./project');

function listProjects(workspaceRoot) {
  const base = path.resolve(workspaceRoot, 'projects');
  let baseStat;
  try { baseStat = fs.lstatSync(base); }
  catch (error) {
    if (error.code === 'ENOENT') return { projects: [], issues: [], warnings: [] };
    throw error;
  }
  if (!baseStat.isDirectory() || baseStat.isSymbolicLink()) {
    return { projects: [], issues: [{ code: 'INVALID_PROJECTS_DIRECTORY', relativePath: 'projects', message: 'projects must be a real directory' }], warnings: [] };
  }
  const projects = [];
  const issues = [];
  for (const name of fs.readdirSync(base).sort()) {
    const projectRoot = path.join(base, name);
    const relativePath = `projects/${name}`;
    const stat = fs.lstatSync(projectRoot);
    if (stat.isSymbolicLink()) {
      issues.push({ code: 'SYMLINK_PROJECT', relativePath, message: 'Project directories cannot be symlinks' });
      continue;
    }
    if (!stat.isDirectory()) continue;
    try {
      const config = loadProject(projectRoot);
      const displayName = config.displayName === undefined ? name : config.displayName;
      if (typeof displayName !== 'string' || !displayName.trim()) throw new Error('INVALID_DISPLAY_NAME');
      projects.push({ namespace: config.namespace, displayName, relativePath, projectRoot });
    } catch (error) {
      issues.push({ code: 'INVALID_PROJECT', relativePath, message: error.message });
    }
  }
  const byNamespace = new Map();
  for (const project of projects) {
    const group = byNamespace.get(project.namespace) || [];
    group.push(project);
    byNamespace.set(project.namespace, group);
  }
  const valid = projects.filter(project => {
    if (byNamespace.get(project.namespace).length === 1) return true;
    issues.push({ code: 'DUPLICATE_NAMESPACE', relativePath: project.relativePath, message: `Namespace ${project.namespace} is used by multiple projects. A copied folder needs its own project: create one with init and move only its input files.` });
    return false;
  });
  // Display names are labels for people. Selection always uses the folder path,
  // so equal labels are allowed but reported: a person must not pick by label.
  const warnings = [];
  for (const project of valid) {
    if (valid.filter(item => item.displayName.trim().toLowerCase() === project.displayName.trim().toLowerCase()).length > 1) {
      warnings.push({ code: 'DUPLICATE_DISPLAY_NAME', relativePath: project.relativePath, message: `Display name "${project.displayName}" is shared; select the project by its folder path` });
    }
  }
  return { projects: valid, issues, warnings };
}

function resolveProject({ workspaceRoot, explicitProject, taskProject }) {
  const { projects, issues } = listProjects(workspaceRoot);
  const selection = explicitProject || taskProject;
  if (selection) {
    const projectRoot = path.resolve(workspaceRoot, selection);
    const relativePath = path.relative(workspaceRoot, projectRoot).split(path.sep).join('/');
    const withinDefault = relativePath.startsWith('projects/');
    if (withinDefault) {
      const match = projects.find(item => item.relativePath === relativePath);
      if (match) return { status: 'selected', projectRoot: match.projectRoot, namespace: match.namespace, relativePath: match.relativePath };
      const known = issues.filter(item => item.relativePath === relativePath);
      return { status: 'invalid-selection', issues: known.length ? known : [{ code: 'INVALID_SELECTION', relativePath, message: 'Selected project folder does not exist under projects/' }] };
    }
    if (!path.isAbsolute(selection)) {
      return { status: 'invalid-selection', issues: [{ code: 'INVALID_SELECTION', relativePath, message: 'Use projects/<folder> or an absolute external project path' }] };
    }
    try {
      if (fs.lstatSync(projectRoot).isSymbolicLink()) throw new Error('SYMLINK_PROJECT');
      const config = loadProject(projectRoot);
      return { status: 'selected', projectRoot, namespace: config.namespace, relativePath: null };
    } catch (error) {
      return { status: 'invalid-selection', issues: [{ code: 'INVALID_SELECTION', relativePath, message: error.message }] };
    }
  }
  if (issues.length || projects.length > 1) return { status: 'needs-selection', projects, issues };
  if (projects.length === 0) return { status: 'empty', projects, issues };
  const [project] = projects;
  return { status: 'selected', projectRoot: project.projectRoot, namespace: project.namespace, relativePath: project.relativePath };
}

module.exports = { listProjects, resolveProject };
