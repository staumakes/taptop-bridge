const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const registry = require('../contracts/behaviors/adapter-registry.json');
const {
  assessBehaviorCoverage,
  validateBehaviorAdapterRegistry
} = require('../lib/behavior-adapter-registry');

test('registry lists every planned behavior family without claiming unsupported adapters are ready', () => {
  assert.deepStrictEqual(validateBehaviorAdapterRegistry(registry), []);
  const categories = new Set(registry.adapters.map((adapter) => adapter.category));
  assert.deepStrictEqual(categories, new Set(['accordion', 'animation', 'cms', 'form', 'menu', 'slider', 'tabs', 'video']));
  assert.ok(registry.adapters.every((adapter) => adapter.status !== 'editor-verified'));
});

test('every source-observed adapter points to a parseable local observation for the same adapter id', () => {
  const exportRoot = path.resolve(__dirname, '..');
  for (const adapter of registry.adapters.filter((item) => item.status === 'source-observed')) {
    assert.ok(adapter.observations.length > 0, `${adapter.id} needs an observation`);
    for (const reference of adapter.observations) {
      const absolute = path.join(exportRoot, reference);
      assert.ok(fs.existsSync(absolute), `${reference} must exist`);
      const observation = JSON.parse(fs.readFileSync(absolute, 'utf8'));
      assert.strictEqual(observation.adapter, adapter.id);
      assert.strictEqual(observation.evidenceLevel, 'source-observed');
    }
  }
});

test('registry cannot mark an adapter editor-verified without all four evidence gates', () => {
  const invalid = structuredClone(registry);
  invalid.adapters[0].status = 'editor-verified';
  assert.ok(validateBehaviorAdapterRegistry(invalid).some((error) => error.includes('all evidence gates')));
});

test('unknown adapter is distinguished from a catalogued adapter that still lacks evidence', () => {
  const unknown = assessBehaviorCoverage({
    'hero/open': { key: 'hero/open', adapter: 'future/dialog-open', nodeKeys: ['cta'], config: {} }
  }, registry);
  assert.deepStrictEqual(unknown.ready, []);
  assert.strictEqual(unknown.blockers[0].code, 'UNKNOWN_BEHAVIOR_ADAPTER');
  assert.strictEqual(unknown.blockers[0].adapter, 'future/dialog-open');

  const planned = assessBehaviorCoverage({
    'faq/toggle': { key: 'faq/toggle', adapter: 'taptop/accordion-v1', nodeKeys: ['faq'], config: {} }
  }, registry);
  assert.deepStrictEqual(planned.ready, []);
  assert.strictEqual(planned.blockers[0].code, 'UNSUPPORTED_BEHAVIOR_ADAPTER');
  assert.strictEqual(planned.blockers[0].adapter, 'taptop/accordion-v1');
  assert.deepStrictEqual(planned.blockers[0].missingEvidence, [
    'nativeFixture', 'contract', 'serializerAdapter', 'editorRoundtrip'
  ]);
});

test('empty behavior map has complete coverage', () => {
  assert.deepStrictEqual(assessBehaviorCoverage({}, registry), { ready: [], blockers: [] });
});
