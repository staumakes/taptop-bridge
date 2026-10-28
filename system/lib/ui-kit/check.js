const path = require('node:path');
const postcss = require('postcss');
const { loadProject, readProjectFile } = require('../project');
const { projectKit } = require('./project-kit');
const { renderUiKitDocument } = require('./render');
const { RESERVED_CLASS_NAMES, renamedClass, counterSafeClass } = require('../taptop-system-classes');

// Read-only check of design-system/kit.json and its role CSS before the UI kit
// is generated. `ok` means no errors and no warnings; empty sections are only
// information (a value the source does not show stays MISSING, never invented).
const SECTIONS = ['colors', 'typography', 'spacing', 'radius', 'shadows', 'components'];

function classesOf(items, out = new Set()) {
  for (const item of items || []) {
    for (const name of Array.isArray(item.classes) ? item.classes : [item.classes]) if (name) out.add(name);
    classesOf(item.children, out);
  }
  return out;
}

function checkUiKitData(root, { data }) {
  loadProject(root);
  const issues = [];
  const add = (level, code, message) => issues.push({ level, code, message });
  const finish = summary => ({ ok: !issues.some(item => item.level !== 'info'), summary, issues });
  let model;
  try { model = JSON.parse(readProjectFile(root, data)); }
  catch (error) {
    add('error', error instanceof SyntaxError ? 'INVALID_KIT_DATA' : 'KIT_DATA_UNREADABLE', `${data}: ${error.message}`);
    return finish(null);
  }
  let css = '';
  if (model.css) {
    try { css = readProjectFile(root, path.posix.join(path.posix.dirname(data), model.css)); }
    catch (error) { add('error', 'ROLE_CSS_UNREADABLE', `${model.css}: ${error.message}`); return finish(null); }
  } else add('warning', 'ROLE_CSS_MISSING', 'kit.json has no "css" file with the project role classes');
  try { renderUiKitDocument(projectKit(model, css)); }
  catch (error) {
    add('error', (/^([A-Z_]+):/.exec(error.message) || [, 'UI_KIT_DATA'])[1], error.message);
    return finish(null);
  }
  const summary = Object.fromEntries(SECTIONS.map(key => [key, Array.isArray(model[key]) ? model[key].length : 0]));
  for (const key of SECTIONS) if (!summary[key]) add('info', 'SECTION_EMPTY', `${key}: nothing in the source yet — leave it empty and report it as MISSING, never fill it from the default kit`);

  const defined = new Set();
  try { postcss.parse(css).walkRules(rule => { for (const match of rule.selector.matchAll(/\.([_a-zA-Z-][_a-zA-Z0-9-]*)/g)) defined.add(match[1]); }); }
  catch (error) { add('error', 'ROLE_CSS_INVALID', error.message); }
  const used = new Set((model.typography || []).map(row => row.className).filter(Boolean));
  for (const component of model.components || []) for (const panel of component.panels || []) for (const row of panel.rows || []) classesOf(row, used);
  for (const name of [...used].sort()) {
    if (name.startsWith('kit-') || name === 'kit') add('error', 'SHELL_CLASS_IN_PROJECT', `${name}: kit-* classes belong to the generator's shell; use a project class`);
    else if (RESERVED_CLASS_NAMES.has(name)) add('error', 'RESERVED_CLASS_NAME', `${name}: Taptop uses this name itself; use ${renamedClass(name)} (the normalizer renames source classes the same way)`);
    else if (counterSafeClass(name) !== name) add('error', 'CLASS_NAME_RESPELLED', `${name}: Taptop reads the trailing -number as its duplicate counter and would store another name; use ${counterSafeClass(name)} (the normalizer renames source classes the same way)`);
    else if (!defined.has(name)) add('warning', 'ROLE_WITHOUT_CSS', `${name} is shown in the kit but roles.css has no rule for it`);
  }
  for (const name of [...defined].sort()) if (!used.has(name)) add('warning', 'CSS_NOT_SHOWN', `${name} has rules in roles.css but is not shown in kit.json (typography or a component row)`);
  return finish(summary);
}

module.exports = { checkUiKitData };
