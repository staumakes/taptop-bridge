const assert = require('node:assert/strict');
const test = require('node:test');
const { buildImportSyncPackage } = require('../lib/build-import-sync-package');
const { validateImportPackage } = require('../lib/import-sync-contract');

const pathOf = (channel, media, selector, property) => JSON.stringify([channel, media, selector, property]);
const rule = (name, value) => ({ name, value, serializeValue: value, isCustom: false });

function clipboard(mainId = 'random_1', reverse = false) {
  const mainRules = {
    color: rule('color', 'red'),
    display: rule('display', 'flex')
  };
  const mainMap = { 'screen/.hero': { media: 'screen', selectorText: '.hero', rules: mainRules } };
  const cmMap = { 'screen/.hero:hover': { media: 'screen', selectorText: '.hero:hover', rules: { opacity: { ...rule('opacity', '0.5'), isCustom: true } } } };
  const layout = {
    mainClassNameCollection: { map: { [mainId]: { id: mainId, value: 'hero' } } },
    designClassNameCollection: { map: { fill_random: { id: 'fill_random', value: 'hero-fill' } } },
    mainSelectorCollection: { map: reverse ? Object.fromEntries(Object.entries(mainMap).reverse()) : mainMap },
    designSelectorCollection: { map: { 'screen/.hero-fill': { media: 'screen', selectorText: '.hero-fill', rules: { background: rule('background', 'blue') } } } },
    cmSelectorCollection: { map: cmMap }, animationSelectorCollection: { map: {} }
  };
  return { copiedLayout: layout };
}

function manifest() {
  return {
    schemaVersion: 1, namespace: 'acme/site', componentKey: 'hero/main',
    classes: [{
      stableKey: 'hero/base', name: 'hero', collection: 'main', ownedPaths: [
        { path: pathOf('main', 'screen', '.hero', 'color'), required: true },
        { path: pathOf('cm', 'screen', '.hero:hover', 'opacity'), required: true },
        { path: pathOf('main', '(max-width: 479px)', '.hero', 'padding'), required: false }
      ]
    }, {
      stableKey: 'hero/fill', name: 'hero-fill', collection: 'design', ownedPaths: [
        { path: pathOf('design', 'screen', '.hero-fill', 'background'), required: true }
      ]
    }],
    instances: [{ stableKey: 'hero-instance/home', rootLogicalNodeKey: 'hero/root' }]
  };
}

test('extracts explicitly owned rules across selector channels and omits an optional missing override', () => {
  const result = buildImportSyncPackage(clipboard(), manifest());
  assert.deepEqual(result.classes[0].ownedRules, {
    main: { 'screen/.hero': { color: rule('color', 'red') } },
    cm: { 'screen/.hero:hover': { opacity: { ...rule('opacity', '0.5'), isCustom: true } } }
  });
  assert.deepEqual(result.classes[1].ownedRules.design['screen/.hero-fill'].background, rule('background', 'blue'));
  assert.deepEqual(validateImportPackage(result), []);
});

test('revision is independent of random source IDs and object insertion order', () => {
  const a = buildImportSyncPackage(clipboard('random_a', false), manifest());
  const b = buildImportSyncPackage(clipboard('random_b', true), manifest());
  assert.equal(a.revision, b.revision);
  assert.deepEqual(a, b);
});

test('package revision changes when source bytes change without class changes', () => {
  const previous = buildImportSyncPackage(clipboard(), manifest(), { sourceRevision: 'a'.repeat(64) });
  const next = buildImportSyncPackage(clipboard(), manifest(), { sourceRevision: 'b'.repeat(64) });
  assert.notEqual(previous.revision, next.revision);
  assert.deepEqual(previous.classes, next.classes);
});

test('required missing rules and source classes stop the build', () => {
  const missingRule = manifest();
  missingRule.classes[0].ownedPaths[0].path = pathOf('main', 'screen', '.hero', 'missing');
  assert.throws(() => buildImportSyncPackage(clipboard(), missingRule), /required.*missing/i);
  const missingClass = manifest();
  missingClass.classes[0].name = 'unknown';
  assert.throws(() => buildImportSyncPackage(clipboard(), missingClass), /source class/i);
});

test('duplicate stable keys and ownership of one path by two classes are rejected', () => {
  const duplicateKey = manifest();
  duplicateKey.classes[1].stableKey = duplicateKey.classes[0].stableKey;
  assert.throws(() => buildImportSyncPackage(clipboard(), duplicateKey), /stableKey/i);
  const duplicatePath = manifest();
  duplicatePath.classes[1].ownedPaths = [structuredClone(duplicatePath.classes[0].ownedPaths[0])];
  assert.throws(() => buildImportSyncPackage(clipboard(), duplicatePath), /owned by more than one/i);
});

test('never mutates clipboard data or the identity manifest', () => {
  const source = clipboard();
  const identities = manifest();
  const before = structuredClone({ source, identities });
  buildImportSyncPackage(source, identities);
  assert.deepEqual({ source, identities }, before);
});

test('checks instance root identities against compiler IR node keys when supplied', () => {
  assert.doesNotThrow(() => buildImportSyncPackage(clipboard(), manifest(), { logicalNodeKeys: ['hero/root'] }));
  assert.throws(
    () => buildImportSyncPackage(clipboard(), manifest(), { logicalNodeKeys: ['different/root'] }),
    /rootLogicalNodeKey.*hero\/root.*compiler IR/
  );
});
