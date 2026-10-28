const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { normalizeProjectSystem } = require('../lib/project-system');

const root = path.join(__dirname, 'fixtures', 'source-modes');
const modes = ['figma-with-kit', 'figma-without-kit', 'ai-generated', 'html'];

function readJson(...parts) {
  return JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf8'));
}

function inputFor(mode) {
  return readJson(mode, 'project-system.input.json');
}

test('every synthetic source mode has a valid intake and one shared primary-button class', () => {
  const systems = modes.map(mode => {
    const intake = readJson(mode, 'intake.json');
    const input = inputFor(mode);
    assert.deepEqual(input.intake, intake, `${mode} input must use its declared intake`);
    const system = normalizeProjectSystem(input);
    assert.equal(system.sourceType, mode);
    assert.equal(system.classes.length, 1, `${mode} must avoid an equivalent duplicate class`);
    const primary = system.components.find(component => component.stableKey === 'primary-button');
    const footer = system.components.find(component => component.stableKey === 'footer-cta');
    assert.deepEqual(primary.classKeys, footer.classKeys, `${mode} must reuse the primary-button class`);
    return system;
  });

  const identities = systems.map(system => ({ stableKey: system.classes[0].stableKey, name: system.classes[0].name }));
  assert.deepEqual(identities, Array(modes.length).fill(identities[0]), 'the same semantic literal class must have the same project-system identity in all source modes');
});

test('an unambiguous revision preserves the synthetic source-mode class identity', () => {
  const firstInput = inputFor('figma-with-kit');
  const first = normalizeProjectSystem(firstInput);
  const revisedInput = structuredClone(firstInput);
  for (const component of revisedInput.components) {
    for (const entry of component.classes) entry.declarations.screen['background-color'] = '#2873cc';
  }
  const revised = normalizeProjectSystem({ ...revisedInput, previousSystem: first });
  assert.equal(revised.classes.length, 1);
  assert.equal(revised.classes[0].stableKey, first.classes[0].stableKey);
  assert.equal(revised.classes[0].name, first.classes[0].name);
  assert.equal(revised.classes[0].declarations.screen['background-color'], '#2873cc');
});
