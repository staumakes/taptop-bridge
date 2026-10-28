const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { decodeEmbeddedAsset } = require('../lib/embedded-assets');

const bytes = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cff01f00050001ff89993d1d0000000049454e44ae426082', 'hex');
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const record = () => ({ stableKey: `asset/${sha256}`, sha256, mimeType: 'image/png', width: 1, height: 1, byteLength: bytes.length, encoding: 'base64', data: bytes.toString('base64') });

test('decodes a standalone PNG record into its exact bytes', () => {
  assert.deepEqual(decodeEmbeddedAsset(record()), bytes);
});

test('rejects malformed Base64, incorrect length, wrong hash, unsupported MIME and uppercase digest', () => {
  for (const [patch, expected] of [
    [{ data: 'abc$' }, /Base64/i],
    [{ data: '' }, /Base64/i],
    [{ byteLength: bytes.length + 1 }, /byteLength/i],
    [{ sha256: 'a'.repeat(64) }, /SHA-256/i],
    [{ mimeType: 'image/svg+xml' }, /mimeType/i],
    [{ sha256: sha256.toUpperCase() }, /SHA-256/i]
  ]) {
    assert.throws(() => decodeEmbeddedAsset({ ...record(), ...patch }), expected);
  }
});

test('rejects extra path and media-id fields in a portable record', () => {
  assert.throws(() => decodeEmbeddedAsset({ ...record(), path: '/Users/person/image.png' }), /unexpected.*path/i);
  assert.throws(() => decodeEmbeddedAsset({ ...record(), image_id: 123 }), /unexpected.*image_id/i);
});

test('rejects a supported MIME label that disagrees with the image bytes', () => {
  assert.throws(() => decodeEmbeddedAsset({ ...record(), mimeType: 'image/jpeg' }), /mimeType.*bytes/i);
  assert.throws(() => decodeEmbeddedAsset({ ...record(), width: 2 }), /dimensions.*bytes/i);
});
