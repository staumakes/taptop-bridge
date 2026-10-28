const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initProject } = require('../lib/project');
const { writeUiKit } = require('../lib/ui-kit/write');

// Synthetic values only: neutral copy, made-up colors, no client material.
const KIT_DATA = {
  projectName: 'Synthetic Site', fonts: { primary: 'Inter' }, css: 'roles.css',
  typography: [{ className: 'type-title', spec: '36 / 800', sample: 'Example heading' }],
  components: [{ id: 'buttons', title: 'Buttons', panels: [{ label: 'Actions', rows: [[
    { tag: 'button', classes: ['btn'], text: 'Continue' },
    { tag: 'button', classes: ['btn', 'btn--secondary'], text: 'Later' },
    { tag: 'a', classes: ['text-link'], text: 'Details' }
  ]] }] }]
};
const ROLE_CSS = [
  '.type-title { font-family: Inter; font-size: 36px; font-weight: 800; line-height: 44px; }',
  '.btn { display: inline-flex; padding: 12px 16px; background-color: #3461a2; color: #ffffff; }',
  '.btn--secondary { background-color: #426e51; }',
  '.text-link { color: #3461a2; text-decoration: underline; }',
  '@media (max-width: 479px) { .type-title { font-size: 28px; line-height: 34px; } }'
].join('\n');

function tempWorkspace(t, prefix = 'taptop-managed-') {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  if (t) t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  fs.mkdirSync(path.join(parent, 'projects'));
  return parent;
}

function write(root, file, content) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

function managedProject(t, { namespace = 'synthetic-site', roleCss = ROLE_CSS } = {}) {
  const workspace = tempWorkspace(t);
  const root = path.join(workspace, 'projects', namespace);
  initProject(root, namespace);
  write(root, 'design-system/kit.json', JSON.stringify(KIT_DATA));
  write(root, 'design-system/roles.css', roleCss);
  writeUiKit(root, { data: 'design-system/kit.json' });
  return { workspace, root };
}

// A page that uses the UI-kit roles on the same layer types as the showcase.
function pageHtml(rootClass, heading = 'Example heading') {
  return `<section class="${rootClass}"><span class="type-title">${heading}</span><button class="btn btn--secondary" type="button">Later</button><a class="text-link" href="#">Details</a></section>`;
}

module.exports = { KIT_DATA, ROLE_CSS, tempWorkspace, managedProject, pageHtml, write };
