// Turns a project's kit data (JSON from Figma, a brief or HTML) into the kit
// model the renderer draws inside the fixed shell. Components are declared as
// labelled rows of elements that use the project's own role classes; their CSS
// comes verbatim from the project stylesheet.
const { h } = require('./markup');

const TAGS = new Set(['a', 'button', 'div', 'span', 'p']);

function element(item, where) {
  if (!item || !TAGS.has(item.tag || 'div')) throw new Error(`UI_KIT_DATA: ${where} needs a tag of ${[...TAGS].join(', ')}`);
  const classes = Array.isArray(item.classes) ? item.classes : [item.classes];
  if (!classes.length || classes.some(name => !/^[_a-zA-Z-][_a-zA-Z0-9-]*$/.test(name || ''))) throw new Error(`UI_KIT_DATA: ${where} needs valid classes`);
  const tag = item.tag || 'div';
  const attrs = tag === 'a' ? { href: item.href || '#' } : tag === 'button' ? { type: 'button' } : {};
  return h(tag, classes, item.children ? item.children.map((child, index) => element(child, `${where}.${index}`)) : String(item.text ?? ''), attrs);
}

function component(entry) {
  if (!entry?.id || !entry?.title || !Array.isArray(entry.panels) || !entry.panels.length) throw new Error('UI_KIT_DATA: a component needs id, title and panels');
  const panels = entry.panels.map((panel, panelIndex) => h('div', 'kit-panel', [
    panel.label ? h('div', 'kit-subtitle', panel.label) : null,
    (panel.rows || []).map((row, rowIndex) => h('div', 'kit-row', row.map((item, itemIndex) => element(item, `${entry.id}.${panelIndex}.${rowIndex}.${itemIndex}`))))
  ]));
  return { id: entry.id, title: entry.title, description: entry.description, content: [h('div', 'kit-stack', panels)] };
}

function projectKit(data, projectCss = '') {
  if (!data?.fonts?.primary) throw new Error('UI_KIT_DATA: fonts.primary is required');
  return {
    projectName: data.projectName,
    fonts: data.fonts,
    colors: data.colors || [],
    typography: data.typography || [],
    spacing: data.spacing || [],
    radius: data.radius || [],
    shadows: data.shadows || [],
    icons: [],
    components: (data.components || []).map(component),
    projectCss
  };
}

module.exports = { projectKit };
