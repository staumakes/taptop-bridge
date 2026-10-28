const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { validateImportPackage, validateImportReceipt } = require('../lib/import-sync-contract');

const revision = 'a'.repeat(64);
const colorPath = JSON.stringify(['main', 'screen', '.hero__title', 'color']);
function validPackage() {
  return {
    schemaVersion: 1, namespace: 'client-a', componentKey: 'hero/main', revision,
    classes: [{
      stableKey: 'hero/title', name: 'hero__title', collection: 'main',
      ownedRules: { main: { 'screen/.hero__title': { color: { name: 'color', value: '#000000', serializeValue: '#000000', isCustom: false } } } }
    }],
    instances: [{ stableKey: 'hero-instance/home', rootLogicalNodeKey: 'hero/root' }]
  };
}
function validReceipt() {
  return {
    schemaVersion: 1, targetKey: 'site:9219526:version:9308506', namespace: 'client-a',
    componentKey: 'hero/main', packageRevision: revision,
    classBindings: [{
      stableKey: 'hero/title', targetClassId: 'class_i12345678', name: 'hero__title', collection: 'main',
      ownedPaths: [colorPath],
      baseline: { [colorPath]: { name: 'color', value: '#000000', serializeValue: '#000000', isCustom: false } }
    }],
    instanceBindings: [{ stableKey: 'hero-instance/home', targetTagId: 'i12345678' }]
  };
}

test('contract schemas are parseable JSON Schema 2020-12 documents', () => {
  for (const file of ['package.schema.json', 'receipt.schema.json', 'identity-manifest.schema.json', 'embedded-asset.schema.json']) {
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../contracts/import-sync', file)));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.additionalProperties, false);
  }
});

test('embedded asset schema declares the exact one-file record shape', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../contracts/import-sync/embedded-asset.schema.json')));
  assert.deepEqual(schema.required, ['stableKey', 'sha256', 'mimeType', 'width', 'height', 'byteLength', 'encoding', 'data']);
  assert.equal(schema.properties.encoding.const, 'base64');
  assert.equal(schema.additionalProperties, false);
});

test('accepts a minimal package and receipt', () => {
  assert.deepEqual(validateImportPackage(validPackage()), []);
  assert.deepEqual(validateImportReceipt(validReceipt()), []);
});

test('rejects unstable identities, duplicate keys and malformed revisions', () => {
  const p = validPackage();
  p.revision = 'latest';
  p.classes.push({ ...p.classes[0] });
  const errors = validateImportPackage(p);
  assert.ok(errors.some(e => /revision/i.test(e)));
  assert.ok(errors.some(e => /duplicate.*stableKey/i.test(e)));
});

test('rejects access-bearing target keys and mismatched receipt baselines', () => {
  const r = validReceipt();
  r.targetKey = 'https://site/?access=secret';
  r.classBindings[0].ownedPaths = [JSON.stringify(['main', 'screen', '.hero__title', 'font-size'])];
  const errors = validateImportReceipt(r);
  assert.ok(errors.some(e => /targetKey/i.test(e)));
  assert.ok(errors.some(e => /baseline.*ownedPaths/i.test(e)));
});

test('requires unambiguous structured rule paths in receipts', () => {
  const r = validReceipt();
  r.classBindings[0].ownedPaths = ['screen/.hero__title/color'];
  assert.ok(validateImportReceipt(r).some(e => /rule path/i.test(e)));
});

test('rejects path-based assets in the class synchronization package and duplicate instances', () => {
  const p = validPackage();
  p.assets = [{ stableKey: 'hero/image', sha256: revision, path: '/Users/person/image.png' }];
  p.instances.push({ ...p.instances[0] });
  const errors = validateImportPackage(p);
  assert.ok(errors.some(e => /assets.*embeddedAssets/i.test(e)));
  assert.ok(errors.some(e => /duplicate.*instance/i.test(e)));
});

test('requires image bytes to stay out of syncPackage', () => {
  const p = validPackage();
  p.assets = [{ stableKey: 'hero/image', sha256: revision, path: 'layer-assets/pixel.png', mimeType: 'image/png', width: 1, height: 1 }];
  assert.ok(validateImportPackage(p).some(error => /assets.*embeddedAssets/i.test(error)));
});

test('validation never mutates a package or receipt', () => {
  for (const [value, validate] of [[validPackage(), validateImportPackage], [validReceipt(), validateImportReceipt]]) {
    const before = JSON.stringify(value);
    validate(value);
    assert.equal(JSON.stringify(value), before);
  }
});
