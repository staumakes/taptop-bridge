const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, path.basename(path.dirname(__dirname)) === 'system' ? '../..' : '..');

test('the installed CLI and system tests resolve from the distributed root', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.bin['taptop-bridge'], 'system/bin/taptop.js');
  assert.equal(pkg.scripts.toolkit, 'node system/bin/taptop.js');
  assert.ok(fs.existsSync(path.join(root, 'system/test/project-system.test.js')));
  assert.ok(fs.existsSync(path.join(root, 'system/examples/ui-kit-default/source/ui-kit.html')));
  const result = spawnSync(process.execPath, [path.join(root, pkg.bin['taptop-bridge'])], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});
