const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '../bin/taptop.js');
const PNG_1X1 = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cff01f00050001ff89993d1d0000000049454e44ae426082', 'hex');

function run(...args) { return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' }); }

function createSyntheticImagePackage(t) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-synthetic-image-'));
  const root = path.join(parent, 'project');
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const init = run('init', root, 'synthetic-image');
  assert.equal(init.status, 0, init.stderr);
  fs.mkdirSync(path.join(root, 'source/assets'));
  fs.writeFileSync(path.join(root, 'source/assets/pixel.png'), PNG_1X1);
  fs.writeFileSync(path.join(root, 'source/page.html'), '<section class="panel" data-taptop-key="root"><img class="panel-image" data-taptop-key="image" src="assets/pixel.png" width="1" height="1"></section>');
  fs.writeFileSync(path.join(root, 'source/page.css'), '.panel { display: block; } .panel-image { display: block; width: 1px; height: 1px; }');
  fs.writeFileSync(path.join(root, 'source/manifest.json'), JSON.stringify({ schemaVersion: 1, componentKey: 'synthetic/image', html: 'source/page.html', rootSelector: '.panel', stylesheets: ['source/page.css'], breakpointMap: {} }));
  const output = path.join(root, 'output/layer.json');
  const compile = run('compile', root, 'source/manifest.json', output);
  assert.equal(compile.status, 0, compile.stderr);
  return { root, output, bytes: PNG_1X1, wrapper: JSON.parse(fs.readFileSync(output, 'utf8')) };
}

module.exports = { PNG_1X1, createSyntheticImagePackage };
