const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { migrateLegacyV1 } = require('../lib/migrate-legacy-v1');
const { preflightImportPackage } = require('../lib/import-package-preflight');
const { createSyntheticImagePackage } = require('../test-support/synthetic-image-package');

function legacyPackage(t) {
  const { wrapper, bytes } = createSyntheticImagePackage(t);
  const image = Object.values(wrapper.clipboardData.copiedLayout.tree.tags).find(tag => tag.widgetName === 'image__img');
  image.__pendingUpload = { url: 'http://localhost:4747/assets/images/pixel.png' };
  wrapper.version = 1;
  wrapper.embeddedAssets = [];
  return { wrapper, bytes };
}

test('migrates a localhost v1 package into a valid self-contained v2 package', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-v1-migration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { wrapper: legacy, bytes } = legacyPackage(t);
  fs.mkdirSync(path.join(root, 'assets/images'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/images/pixel.png'), bytes);

  const migrated = migrateLegacyV1({ wrapper: legacy, assetRoot: root });

  assert.equal(migrated.version, 2);
  assert.equal(migrated.embeddedAssets.length, 1);
  assert.equal(migrated.embeddedAssets[0].mimeType, 'image/png');
  assert.ok(Object.values(migrated.clipboardData.copiedLayout.tree.tags).every(tag => !tag.__pendingUpload || Object.keys(tag.__pendingUpload).join() === 'assetKey'));
  assert.equal(preflightImportPackage(migrated).ok, true, preflightImportPackage(migrated).errors.join('\n'));
  assert.equal(Object.values(legacy.clipboardData.copiedLayout.tree.tags).find(tag => tag.widgetName === 'image__img').__pendingUpload.url, 'http://localhost:4747/assets/images/pixel.png');
});

test('rejects remote and traversal asset URLs during migration', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-v1-migration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { wrapper: legacy } = legacyPackage(t);
  const image = Object.values(legacy.clipboardData.copiedLayout.tree.tags).find(tag => tag.widgetName === 'image__img');
  image.__pendingUpload.url = 'https://example.com/image.png';
  assert.throws(() => migrateLegacyV1({ wrapper: legacy, assetRoot: root }), /LOCALHOST_ASSET_URL_REQUIRED/);
  image.__pendingUpload.url = 'http://localhost:4747/assets/%2e%2e/secret.png';
  assert.throws(() => migrateLegacyV1({ wrapper: legacy, assetRoot: root }), /UNSAFE_ASSET_PATH/);
});
