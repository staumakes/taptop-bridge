const assert = require('node:assert/strict');
const test = require('node:test');
const { validateIntake } = require('../lib/intake');

const figmaWithKit = {
  schemaVersion: 1,
  sourceType: 'figma-with-kit',
  figma: { fileUrl: 'https://www.figma.com/design/abc123/Website', screens: ['Desktop home'], uiKit: { location: 'same-file' } }
};

test('accepts a Figma source with a declared UI kit and reports its required evidence', () => {
  const report = validateIntake(figmaWithKit);
  assert.equal(report.valid, true);
  assert.equal(report.mode, 'figma-with-kit');
  assert.deepEqual(report.requiredEvidence, ['foundations', 'components', 'responsive-variants', 'assets', 'states']);
});

test('keeps the no-kit Figma flow distinct and requires an extraction decision', () => {
  const report = validateIntake({
    schemaVersion: 1,
    sourceType: 'figma-without-kit',
    figma: { fileUrl: 'https://www.figma.com/design/abc123/Website', screens: ['Desktop home'] },
    foundationStrategy: 'extract-from-screens'
  });
  assert.equal(report.valid, true);
  assert.match(report.warnings[0].message, /не найден/i);
});

test('requires prepared HTML to explicitly name its entry point and stylesheets', () => {
  const valid = validateIntake({
    schemaVersion: 1,
    sourceType: 'html',
    html: { entry: 'source/page.html', stylesheets: ['source/page.css'] }
  });
  assert.equal(valid.valid, true);
  assert.equal(validateIntake({ schemaVersion: 1, sourceType: 'html', html: { entry: '../index.html', stylesheets: [] } }).valid, false);
});

test('accepts an approved AI brief and direction, but rejects an undecided one', () => {
  const intake = { schemaVersion: 1, sourceType: 'ai-generated', ai: { brief: 'Studio website', visualDirection: 'Light editorial', approved: true } };
  assert.equal(validateIntake(intake).valid, true);
  intake.ai.approved = false;
  assert.equal(validateIntake(intake).valid, false);
  assert.ok(validateIntake(intake).errors.some(item => item.code === 'MISSING_APPROVED_DIRECTION'));
});

test('does not pretend an incomplete source is ready for layout work', () => {
  const report = validateIntake({ schemaVersion: 1, sourceType: 'figma-with-kit', figma: { screens: [] } });
  assert.equal(report.valid, false);
  assert.ok(report.errors.some(item => item.code === 'MISSING_FIGMA_FILE'));
  assert.ok(report.errors.some(item => item.code === 'MISSING_SCREENS'));
});
