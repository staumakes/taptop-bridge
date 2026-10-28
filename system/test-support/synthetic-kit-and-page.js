const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initProject } = require('../lib/project');
const { writeUiKit } = require('../lib/ui-kit/write');
const { normalizeProject } = require('../lib/normalize-project');
const { compileProject } = require('../lib/compile-project');

async function buildSyntheticKitAndPage(t, { pageRoleOverride = '' } = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-synthetic-kit-'));
  const root = path.join(parent, 'site');
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  initProject(root, 'synthetic-site');
  fs.mkdirSync(path.join(root, 'kit'));
  const kitData = {
    projectName: 'Synthetic Site', fonts: { primary: 'Inter' }, css: 'roles.css',
    typography: [{ className: 'type-title', spec: '36 / 800', sample: 'Example heading' }],
    components: [{ id: 'buttons', title: 'Buttons', panels: [{ label: 'Actions', rows: [[
      { tag: 'button', classes: ['btn'], text: 'Continue' },
      { tag: 'button', classes: ['btn', 'btn--secondary'], text: 'Later' },
      { tag: 'a', classes: ['text-link'], text: 'Details' }
    ]] }] }]
  };
  const roleCss = [
    '.type-title { font-family: Inter; font-size: 36px; font-weight: 800; line-height: 44px; }',
    '.btn { display: inline-flex; padding: 12px 16px; background-color: #3461a2; color: #ffffff; }',
    '.btn--secondary { background-color: #426e51; }',
    '.text-link { color: #3461a2; text-decoration: underline; }',
    '@media (max-width: 479px) { .type-title { font-size: 28px; line-height: 34px; } }'
  ].join('\n');
  fs.writeFileSync(path.join(root, 'kit/kit.json'), JSON.stringify(kitData));
  fs.writeFileSync(path.join(root, 'kit/roles.css'), roleCss);
  writeUiKit(root, { data: 'kit/kit.json' });
  const normalized = await normalizeProject(root, 'source/ui-kit/ui-kit.html', 'source/ui-kit/ui-kit.css');
  assert.equal(normalized.ok, true, JSON.stringify(normalized.items.filter(item => item.level === 'error')));
  const kitOutput = path.join(root, 'output/kit.json');
  await compileProject(root, normalized.manifest, kitOutput);
  const kit = JSON.parse(fs.readFileSync(kitOutput, 'utf8'));

  fs.writeFileSync(path.join(root, 'source/page.html'), '<section class="synthetic-page" data-taptop-key="page"><span class="type-title" data-taptop-key="title">Example heading</span><button class="btn btn--secondary" data-taptop-key="action" type="button">Later</button><a class="text-link" data-taptop-key="link" href="#">Details</a></section>');
  const kitManifest = JSON.parse(fs.readFileSync(path.join(root, normalized.manifest), 'utf8'));
  const pageCss = 'source/page.css';
  fs.writeFileSync(path.join(root, pageCss), fs.readFileSync(path.join(root, 'source/normalized/page.css'), 'utf8') + '\n' + pageRoleOverride);
  const pageManifest = { ...kitManifest, componentKey: 'synthetic-site/page', html: 'source/page.html', rootSelector: '.synthetic-page', stylesheets: [pageCss] };
  delete pageManifest.embedStylesheet;
  delete pageManifest.behaviorManifest;
  fs.writeFileSync(path.join(root, 'source/page-manifest.json'), JSON.stringify(pageManifest));
  const pageOutput = path.join(root, 'output/page.json');
  await compileProject(root, 'source/page-manifest.json', pageOutput);
  fs.writeFileSync(path.join(root, 'source/second-page-manifest.json'), JSON.stringify({ ...pageManifest, componentKey: 'synthetic-site/second-page' }));
  const secondPageOutput = path.join(root, 'output/second-page.json');
  await compileProject(root, 'source/second-page-manifest.json', secondPageOutput);
  return { kit, page: JSON.parse(fs.readFileSync(pageOutput, 'utf8')), secondPage: JSON.parse(fs.readFileSync(secondPageOutput, 'utf8')) };
}

module.exports = { buildSyntheticKitAndPage };
