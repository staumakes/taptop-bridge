const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createHash } = require('node:crypto');
const { packageToolkit, checkContent } = require('../scripts/package-toolkit');

test('the release candidate contains only allowlisted, project-free files', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-dist-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const destination = path.join(parent, 'candidate');
  packageToolkit(destination);
  const manifest = JSON.parse(fs.readFileSync(path.join(destination, 'DISTRIBUTION-MANIFEST.json'), 'utf8'));
  const files = manifest.files.map(item => item.path);
  assert.deepEqual(files.filter(file => file.startsWith('projects/')), ['projects/README.md']);
  for (const file of files) {
    assert.doesNotMatch(file, /^(?:node_modules|\.work|\.git|dist)\/|^\.claude\/(?!skills\/|settings\.json$)|\.DS_Store$|^system\/docs\/(?:handoffs|superpowers|references)\//, file);
  }
  for (const required of ['README.md', 'AGENTS.md', 'CLAUDE.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', '.claude/skills/taptop-site-transfer/SKILL.md', '.agents/skills/taptop-site-transfer/SKILL.md', '.claude/settings.json', 'system/scripts/agent-docs-hook.js', 'system/docs/cli-reference.md', 'package.json', 'package-lock.json', 'system/bin/taptop.js', 'system/skills/taptop-site-transfer/SKILL.md', 'system/examples/ui-kit-default/source/ui-kit.html', 'system/docs/tools/normalize-compare.html']) {
    assert.ok(files.includes(required), required);
  }
  for (const item of manifest.files) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(destination, item.path))).digest('hex'), item.sha256, item.path);
  }
  assert.throws(() => packageToolkit(destination), /OUTPUT_EXISTS/);
});

test('private projects, author paths, access URLs and broken links are refused', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-dist-check-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text); };
  write('projects/client/taptop.project.json', '{}');
  write('system/docs/a.md', `See [b](b.md) and ${os.homedir()}/notes.`);
  write('system/docs/c.md', `Open https://site.example/?${['access', 'abcdefghijklmnop'].join('=')}`);
  write('system/test/x.test.js', "const p = '/Users/person/image.png';");
  write('system/docs/d.md', 'Read `system/docs/gone.md` and `system/docs/handoffs/notes.md`.');
  const problems = checkContent(root, ['projects/client/taptop.project.json', 'system/docs/a.md', 'system/docs/c.md', 'system/docs/d.md', 'system/test/x.test.js']);
  assert.ok(problems.some(item => item.startsWith('PRIVATE_PATH: projects/client')), problems.join('\n'));
  assert.ok(problems.some(item => item.startsWith('AUTHOR_PATH: system/docs/a.md')));
  assert.ok(problems.some(item => item.startsWith('BROKEN_LINK: system/docs/a.md -> b.md')));
  assert.ok(problems.some(item => item.startsWith('ACCESS_TOKEN_URL: system/docs/c.md')));
  assert.ok(problems.includes('DANGLING_PATH: system/docs/d.md mentions system/docs/gone.md'), problems.join('\n'));
  assert.equal(problems.some(item => item.includes('handoffs/notes.md')), false, 'maintainers-only mentions are allowed');
  assert.equal(problems.some(item => item.includes('x.test.js')), false, 'the synthetic placeholder home path is allowed');
});
