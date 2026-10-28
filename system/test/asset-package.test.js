const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { readLocalAsset, embeddedAssetRecords } = require('../lib/asset-package');

const PNG_1X1 = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cff01f00050001ff89993d1d0000000049454e44ae426082', 'hex');
const GIF_1X1 = Buffer.from('47494638396101000100800000000000ffffff2c00000000010001000002024401003b', 'hex');
const JPEG_1X1 = Buffer.from('ffd8ffc0000b080001000103011102110311ffd9', 'hex');
const WEBP_1X1 = Buffer.from('524946461600000057454250565038580a00000000000000000000000000', 'hex');
const SVG_24 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>');

function folder(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taptop-assets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'source'));
  return root;
}

test('reads a local PNG with portable metadata', t => {
  const root = folder(t);
  fs.writeFileSync(path.join(root, 'source/pixel.png'), PNG_1X1);
  const asset = readLocalAsset(root, 'source/pixel.png');
  assert.equal(asset.mimeType, 'image/png');
  assert.equal(asset.width, 1);
  assert.equal(asset.height, 1);
  assert.match(asset.sha256, /^[a-f0-9]{64}$/);
});

test('reads supported GIF, JPEG and WebP headers', t => {
  const root = folder(t);
  for (const [name, bytes, mimeType] of [['pixel.gif', GIF_1X1, 'image/gif'], ['pixel.jpg', JPEG_1X1, 'image/jpeg'], ['pixel.webp', WEBP_1X1, 'image/webp']]) {
    fs.writeFileSync(path.join(root, 'source', name), bytes);
    const asset = readLocalAsset(root, `source/${name}`);
    assert.equal(asset.mimeType, mimeType);
    assert.equal(asset.width, 1);
    assert.equal(asset.height, 1);
  }
});

test('uses JPEG metadata when a legacy .png path contains JPEG bytes', t => {
  const root = folder(t);
  fs.writeFileSync(path.join(root, 'source/legacy-name.png'), JPEG_1X1);
  const asset = readLocalAsset(root, 'source/legacy-name.png');
  assert.equal(asset.mimeType, 'image/jpeg');
  assert.equal(asset.extension, '.jpg');
});

test('reads an SVG using its declared view dimensions', t => {
  const root = folder(t);
  fs.writeFileSync(path.join(root, 'source/icon.svg'), SVG_24);
  const asset = readLocalAsset(root, 'source/icon.svg');
  assert.equal(asset.mimeType, 'image/svg+xml');
  assert.equal(asset.width, 24);
  assert.equal(asset.height, 24);
});

test('reads an SVG with fractional design-tool dimensions, rounded up to whole pixels', t => {
  const root = folder(t);
  fs.writeFileSync(path.join(root, 'source/sized.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="11.0379" height="12.8667" viewBox="0 0 11.0379 12.8667"><path d="M0 0h11v12H0z"/></svg>');
  fs.writeFileSync(path.join(root, 'source/boxed.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20.5 7.25"><path d="M0 0h20v7H0z"/></svg>');
  const sized = readLocalAsset(root, 'source/sized.svg');
  assert.deepEqual([sized.width, sized.height], [12, 13]);
  const boxed = readLocalAsset(root, 'source/boxed.svg');
  assert.deepEqual([boxed.width, boxed.height], [21, 8]);
});

test('embeds equal asset bytes once in a portable base64 record', t => {
  const root = folder(t);
  fs.writeFileSync(path.join(root, 'source/one.png'), PNG_1X1);
  fs.writeFileSync(path.join(root, 'source/two.png'), PNG_1X1);
  const first = readLocalAsset(root, 'source/one.png');
  const second = readLocalAsset(root, 'source/two.png');
  const assets = embeddedAssetRecords([first, second]);
  assert.equal(assets.length, 1);
  assert.equal(assets[0].encoding, 'base64');
  assert.equal(assets[0].data, PNG_1X1.toString('base64'));
  assert.equal(assets[0].stableKey, first.stableKey);
  assert.equal(Object.hasOwn(assets[0], 'path'), false);
});

test('embedded asset order is stable regardless of source order', t => {
  const root = folder(t);
  fs.writeFileSync(path.join(root, 'source/one.png'), PNG_1X1);
  fs.writeFileSync(path.join(root, 'source/two.gif'), GIF_1X1);
  const first = readLocalAsset(root, 'source/one.png');
  const second = readLocalAsset(root, 'source/two.gif');
  assert.deepEqual(embeddedAssetRecords([first, second]), embeddedAssetRecords([second, first]));
});

test('rejects outside paths and non-images', t => {
  const root = folder(t);
  fs.writeFileSync(path.join(root, 'outside.png'), PNG_1X1);
  fs.writeFileSync(path.join(root, 'source/not-image.png'), 'not an image');
  assert.throws(() => readLocalAsset(root, '../outside.png'), /UNSAFE_ASSET_PATH/);
  assert.throws(() => readLocalAsset(root, 'source/not-image.png'), /UNSUPPORTED_ASSET/);
});
