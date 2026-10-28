const assert = require('node:assert');
const { test } = require('node:test');
const { buildTokenTable, resolveTokensForBreakpoint, resolveValue } = require('../lib/tokens');

const FIXTURE = `
:root {
  --font-sz: 48px;
  --pd: 32px;
}
[data-theme="dark"] {
  --font-sz: 999px;
}
@media (max-width: 991px) {
  :root { --font-sz: 40px; }
}
@media (max-width: 767px) {
  :root { --font-sz: 36px; }
}
@media (max-width: 479px) {
  :root { --pd: 16px; }
}
`;

test('buildTokenTable reads :root and ignores [data-theme="dark"]', () => {
  const table = buildTokenTable(FIXTURE);
  assert.strictEqual(table.screen.get('--font-sz'), '48px');
  assert.strictEqual(table.screen.get('--pd'), '32px');
});

test('resolveTokensForBreakpoint merges cumulatively across the max-width chain', () => {
  const table = buildTokenTable(FIXTURE);
  assert.strictEqual(resolveTokensForBreakpoint('screen', table).get('--font-sz'), '48px');
  assert.strictEqual(resolveTokensForBreakpoint('(max-width: 991px)', table).get('--font-sz'), '40px');
  assert.strictEqual(resolveTokensForBreakpoint('(max-width: 767px)', table).get('--font-sz'), '36px');
  // no --font-sz override at 479px: the 767px value must carry forward
  assert.strictEqual(resolveTokensForBreakpoint('(max-width: 479px)', table).get('--font-sz'), '36px');
  assert.strictEqual(resolveTokensForBreakpoint('(max-width: 479px)', table).get('--pd'), '16px');
});

test('resolveValue substitutes a single var() using a resolved token map', () => {
  const table = buildTokenTable(FIXTURE);
  const tokens767 = resolveTokensForBreakpoint('(max-width: 767px)', table);
  assert.strictEqual(resolveValue('var(--font-sz)', tokens767), '36px');
});

test('resolveValue substitutes multiple var() references in one shorthand value', () => {
  const tokens = new Map([['--a', '10px'], ['--b', '20px']]);
  assert.strictEqual(resolveValue('var(--a) var(--b) 0', tokens), '10px 20px 0');
});

test('resolveValue falls back when the token is missing and a fallback is given', () => {
  assert.strictEqual(resolveValue('var(--missing, 4px)', new Map()), '4px');
});

test('resolveValue throws on an unknown token with no fallback', () => {
  assert.throws(() => resolveValue('var(--missing)', new Map()), /Unknown token/);
});

test('resolveValue handles a fallback containing a nested function call', () => {
  assert.strictEqual(resolveValue('var(--missing, calc(2px + 1px))', new Map()), 'calc(2px + 1px)');
});

test('resolveValue recursively resolves a fallback that itself contains a var() reference', () => {
  const tokens = new Map([['--known', '8px']]);
  assert.strictEqual(resolveValue('var(--missing, var(--known))', tokens), '8px');
});
