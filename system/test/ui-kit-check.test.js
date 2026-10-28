const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { checkUiKitData } = require('../lib/ui-kit/check');
const { initProject } = require('../lib/project');
const { tempWorkspace, write, KIT_DATA, ROLE_CSS } = require('../test-support/managed-project');

function project(t) {
  const root = path.join(tempWorkspace(t), 'projects/check-site');
  initProject(root, 'check-site');
  return root;
}
const codes = report => report.issues.map(item => `${item.level}:${item.code}`).sort();

test('valid kit data passes without writing anything and reports empty sections as MISSING candidates', t => {
  const root = project(t);
  write(root, 'design-system/kit.json', JSON.stringify(KIT_DATA));
  write(root, 'design-system/roles.css', ROLE_CSS);
  const report = checkUiKitData(root, { data: 'design-system/kit.json' });
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  assert.deepEqual(report.summary, { colors: 0, typography: 1, spacing: 0, radius: 0, shadows: 0, components: 1 });
  assert.deepEqual(codes(report), ['info:SECTION_EMPTY', 'info:SECTION_EMPTY', 'info:SECTION_EMPTY', 'info:SECTION_EMPTY']);
  assert.equal(fs.existsSync(path.join(root, 'source/ui-kit/ui-kit.html')), false);
});

test('role classes without CSS, shell-prefixed and reserved classes and bad structure are reported', t => {
  const root = project(t);
  const data = structuredClone(KIT_DATA);
  data.typography.push({ className: 'type-caption', spec: '12 / 400' });
  data.components[0].panels[0].rows[0].push({ tag: 'span', classes: ['kit-badge'], text: 'x' }, { tag: 'span', classes: ['text'], text: 'y' }, { tag: 'span', classes: ['gap-1'], text: 'z' });
  write(root, 'design-system/kit.json', JSON.stringify(data));
  write(root, 'design-system/roles.css', `${ROLE_CSS}\n.badge { color: #111111; }`);
  const report = checkUiKitData(root, { data: 'design-system/kit.json' });
  assert.equal(report.ok, false);
  assert.ok(codes(report).includes('warning:ROLE_WITHOUT_CSS'));
  assert.ok(report.issues.some(item => item.code === 'ROLE_WITHOUT_CSS' && item.message.includes('type-caption')));
  assert.ok(codes(report).includes('error:SHELL_CLASS_IN_PROJECT'));
  assert.ok(codes(report).includes('error:RESERVED_CLASS_NAME'));
  assert.ok(report.issues.some(item => item.code === 'CLASS_NAME_RESPELLED' && item.message.includes('gap_1')));
  assert.ok(report.issues.some(item => item.code === 'CSS_NOT_SHOWN' && item.message.includes('badge')));
  write(root, 'design-system/kit.json', JSON.stringify({ ...KIT_DATA, fonts: {} }));
  assert.deepEqual(codes(checkUiKitData(root, { data: 'design-system/kit.json' })), ['error:UI_KIT_DATA']);
  write(root, 'design-system/kit.json', '{oops');
  assert.deepEqual(codes(checkUiKitData(root, { data: 'design-system/kit.json' })), ['error:INVALID_KIT_DATA']);
});
