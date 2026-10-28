const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { packageToolkit } = require('../scripts/package-toolkit');

// Executes every `sh` block of the user walkthrough, verbatim, on a fresh copy
// of the distribution. When the system and the walkthrough drift apart, this fails.
const ROOT = path.resolve(__dirname, '../..');

test('the getting-started walkthrough runs verbatim on a fresh distribution', { timeout: 120000 }, t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop walkthrough '));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const toolkit = path.join(parent, 'taptop-bridge');
  packageToolkit(toolkit);
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(toolkit, 'node_modules'), 'dir');
  const guide = fs.readFileSync(path.join(toolkit, 'system/docs/getting-started.md'), 'utf8');
  const blocks = [...guide.matchAll(/```sh\n([\s\S]*?)```/g)].map(match => match[1]);
  assert.ok(blocks.length >= 4, 'the walkthrough has its command blocks');
  // Installing and the full suite are covered elsewhere; running them here would recurse.
  const script = ['set -euo pipefail', ...blocks.map(block => block.split('\n').filter(line => !/^npm (ci|test)\s*$/.test(line.trim())).join('\n'))].join('\n');
  const result = spawnSync('bash', ['-c', script], { cwd: toolkit, encoding: 'utf8', env: { ...process.env, npm_config_loglevel: 'silent' } });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const statuses = [...result.stdout.matchAll(/"status": "(built|up-to-date)"/g)].map(match => match[1]);
  assert.deepEqual(statuses.slice(0, 3), ['built', 'built', 'up-to-date']);
  assert.match(result.stdout, /"ok": true/);
  const project = path.join(toolkit, 'projects/sample-site');
  assert.ok(fs.readdirSync(path.join(project, 'output/json')).some(name => name.startsWith('pages--home--')));
  assert.ok(fs.existsSync(path.join(project, 'output/html/index.html')));
});
