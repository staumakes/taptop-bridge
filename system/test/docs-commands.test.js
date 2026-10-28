const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const ACTIVE = [
  'README.md', 'AGENTS.md', 'projects/README.md',
  'system/templates/project/README.md', 'system/templates/project/AGENTS.md',
  'system/docs/project-layout.md', 'system/docs/html-normalizer.md', 'system/docs/source-intake.md',
  'system/docs/troubleshooting.md', 'system/docs/updating.md', 'system/docs/getting-started.md',
  ...fs.readdirSync(path.join(ROOT, 'system/skills/taptop-site-transfer/references')).map(name => `system/skills/taptop-site-transfer/references/${name}`),
  'system/skills/taptop-site-transfer/SKILL.md'
];

test('every command shown in user and agent documentation exists in the CLI', () => {
  const usage = spawnSync(process.execPath, [path.join(ROOT, 'system/bin/taptop.js')], { encoding: 'utf8' }).stderr;
  const commands = new Set([...usage.matchAll(/^\s{2}([a-z][a-z0-9-]*(?: (?:add|list))?)/gm)].map(match => match[1]));
  assert.ok(commands.has('build') && commands.has('artifact add') && commands.has('doctor'), usage);
  for (const file of ACTIVE) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(text, /node (?:system\/)?bin\/taptop\.js/, `${file} uses the raw script path; use npm run toolkit --`);
    for (const match of text.matchAll(/npm run toolkit -- ([a-z][a-z0-9-]*)(?: (add|list)\b)?/g)) {
      const command = match[2] && match[1] === 'artifact' ? `artifact ${match[2]}` : match[1];
      assert.ok(commands.has(command), `${file}: unknown command "${command}"`);
    }
  }
});

test('active documents do not point at removed pilot or extension folders', () => {
  for (const file of ACTIVE) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(text, /(?:^|[\s`(])(?:pilot|extension)\/[a-z]/m, `${file} mentions a removed folder`);
    assert.doesNotMatch(text, /\/Users\/(?!person\/)/, `${file} contains an absolute home path`);
  }
});
