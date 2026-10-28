const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProjectSystem } = require('../lib/project-system');

const sources = {
  'figma-with-kit': { schemaVersion: 1, sourceType: 'figma-with-kit', figma: { fileUrl: 'https://www.figma.com/design/example/Site', screens: ['Home'], uiKit: { location: 'same-file' } } },
  'figma-without-kit': { schemaVersion: 1, sourceType: 'figma-without-kit', figma: { fileUrl: 'https://www.figma.com/design/example/Site', screens: ['Home'] }, foundationStrategy: 'extract-from-screens' },
  'ai-generated': { schemaVersion: 1, sourceType: 'ai-generated', ai: { brief: 'Site for a small studio', visualDirection: 'Light editorial layout', approved: true } },
  html: { schemaVersion: 1, sourceType: 'html', html: { entry: 'source/page.html', stylesheets: ['source/page.css'] } }
};

function sourceSystem(sourceType) {
  return {
    intake: sources[sourceType],
    evidence: [{ id: 'source-1', kind: 'source', ref: `${sourceType}:button` }],
    foundations: { colors: { accent: { value: '#3290ff', evidenceIds: ['source-1'] } } },
    components: [{ stableKey: 'button', evidenceIds: ['source-1'], classes: [{ role: 'button/primary', declarations: { screen: { color: '#3290ff', padding: '12px' } }, evidenceIds: ['source-1'] }] }],
    pages: [{ stableKey: 'home', componentKeys: ['button'], evidenceIds: ['source-1'] }]
  };
}

for (const mode of Object.keys(sources)) {
  test(`${mode} normalizes to the same project-system contract`, () => {
    const system = normalizeProjectSystem(sourceSystem(mode));
    assert.deepEqual(Object.keys(system), ['schemaVersion', 'sourceType', 'foundations', 'classes', 'components', 'pages', 'evidence']);
    assert.equal(system.sourceType, mode);
    assert.equal(system.foundations.colors.accent.value, '#3290ff');
    assert.equal(system.components[0].classKeys[0], system.classes[0].stableKey);
    assert.deepEqual(system.pages[0].componentKeys, ['button']);
  });
}

test('a second page and component reuse one exact semantic class with combined evidence', () => {
  const source = sourceSystem('figma-without-kit');
  source.evidence.push({ id: 'source-2', kind: 'source', ref: 'figma:footer' });
  source.components.push({ stableKey: 'footer-button', evidenceIds: ['source-2'], classes: [{ role: 'button/primary', declarations: { screen: { padding: '12px', color: '#3290ff' } }, evidenceIds: ['source-2'] }] });
  source.pages.push({ stableKey: 'about', componentKeys: ['footer-button'], evidenceIds: ['source-2'] });
  const system = normalizeProjectSystem(source);
  assert.equal(system.classes.length, 1);
  assert.equal(system.components[0].classKeys[0], system.components[1].classKeys[0]);
  assert.deepEqual(system.classes[0].evidenceIds, ['source-1', 'source-2']);
});

test('same role with different literal values gets a deterministic distinct class', () => {
  const source = sourceSystem('ai-generated');
  source.components.push({ stableKey: 'secondary-button', evidenceIds: ['source-1'], classes: [{ role: 'button/primary', declarations: { screen: { color: '#000000', padding: '12px' } }, evidenceIds: ['source-1'] }] });
  const first = normalizeProjectSystem(source);
  const second = normalizeProjectSystem(source);
  assert.equal(first.classes.length, 2);
  assert.notEqual(first.classes[0].stableKey, first.classes[1].stableKey);
  assert.deepEqual(first, second);
});

test('a later revision keeps the prior class key when its literal declarations change', () => {
  const source = sourceSystem('figma-with-kit');
  const previousSystem = normalizeProjectSystem(source);
  source.components[0].classes[0].declarations.screen.color = '#2873cc';
  const revised = normalizeProjectSystem({ ...source, previousSystem });
  assert.equal(revised.classes.length, 1);
  assert.equal(revised.classes[0].stableKey, previousSystem.classes[0].stableKey);
  assert.equal(revised.classes[0].name, previousSystem.classes[0].name);
  assert.equal(revised.classes[0].declarations.screen.color, '#2873cc');
});

test('simultaneous divergent variants require an explicit prior key when revision matching is ambiguous', () => {
  const source = sourceSystem('figma-with-kit');
  const previousSystem = normalizeProjectSystem(source);
  source.components[0].classes[0].declarations.screen.color = '#2873cc';
  source.components.push({ stableKey: 'button-alt', evidenceIds: ['source-1'], classes: [{ role: 'button/primary', declarations: { screen: { color: '#000000', padding: '12px' } }, evidenceIds: ['source-1'] }] });
  assert.throws(() => normalizeProjectSystem({ ...source, previousSystem }), /AMBIGUOUS_CLASS_REVISION/);
  source.components[0].classes[0].priorStableKey = previousSystem.classes[0].stableKey;
  const revised = normalizeProjectSystem({ ...source, previousSystem });
  assert.equal(revised.classes.length, 2);
  assert.equal(revised.components.find(item => item.stableKey === 'button').classKeys[0], previousSystem.classes[0].stableKey);
  assert.notEqual(revised.components.find(item => item.stableKey === 'button-alt').classKeys[0], previousSystem.classes[0].stableKey);
});

test('rejects CSS variables, unknown evidence and invented component references', () => {
  const source = sourceSystem('html');
  source.components[0].classes[0].declarations.screen.color = 'var(--accent)';
  assert.throws(() => normalizeProjectSystem(source), /UNSUPPORTED_CSS_VARIABLE/);
  source.components[0].classes[0].declarations.screen.color = '#3290ff';
  source.foundations.colors.accent.evidenceIds = ['missing'];
  assert.throws(() => normalizeProjectSystem(source), /MISSING_EVIDENCE/);
  source.foundations.colors.accent.evidenceIds = ['source-1'];
  source.pages[0].componentKeys = ['unknown'];
  assert.throws(() => normalizeProjectSystem(source), /MISSING_COMPONENT/);
});

test('requires explicit source evidence and does not mutate inputs', () => {
  const source = sourceSystem('figma-with-kit');
  const before = JSON.stringify(source);
  normalizeProjectSystem(source);
  assert.equal(JSON.stringify(source), before);
  source.components[0].classes[0].evidenceIds = [];
  assert.throws(() => normalizeProjectSystem(source), /MISSING_EVIDENCE/);
});
