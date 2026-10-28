const assert = require('node:assert');
const { test } = require('node:test');
const { extractRulesForSelectors, toTaptopRule, expandShorthandProperty, gridTemplateColumnsItems } = require('../lib/css-rules');

test('extracts only the requested selectors, base and media-scoped', () => {
  const css = `
    .box { color: red; padding: 4px; }
    @media (max-width: 991px) { .box { padding: 2px; } }
    .other { color: blue; }
  `;
  const result = extractRulesForSelectors(css, ['.box']);
  assert.strictEqual(result.get('.box').get('screen').get('color'), 'red');
  assert.strictEqual(result.get('.box').get('screen').get('padding'), '4px');
  assert.strictEqual(result.get('.box').get('(max-width: 991px)').get('padding'), '2px');
  assert.ok(!result.has('.other'));
});

test('toTaptopRule shapes a pixel value with number/unit, matching real Taptop exports', () => {
  const rule = toTaptopRule('padding-top', '24px');
  assert.deepStrictEqual(rule, {
    name: 'padding-top', value: '24px', isCustom: false, serializeValue: '24px', number: 24, unit: 'px'
  });
});

test('toTaptopRule shapes a non-numeric value without number/unit', () => {
  const rule = toTaptopRule('color', 'rgba(107, 107, 102, 1)');
  assert.deepStrictEqual(rule, {
    name: 'color', value: 'rgba(107, 107, 102, 1)', isCustom: false, serializeValue: 'rgba(107, 107, 102, 1)'
  });
});

test('toTaptopRule keeps normal line-height on the custom path', () => {
  const rule = toTaptopRule('line-height', 'normal');
  assert.deepStrictEqual(rule, {
    name: 'line-height', value: 'normal', isCustom: true, serializeValue: 'normal'
  });
});

test('toTaptopRule marks properties outside the standard set as custom', () => {
  const rule = toTaptopRule('transition', 'background-color 160ms ease');
  assert.strictEqual(rule.isCustom, true);
});

// Native Taptop exports do not register the shorthand forms below as native
// style controls. In particular, a real Accordion export stores `gap` and
// `overflow` in the selector's custom list. Passing either one to the live
// runtime with isCustom=false makes its style registry look up a missing
// native classStyle handler and aborts a managed paste.
test('toTaptopRule keeps unsupported shorthand and modern layout properties on the custom CSS path', () => {
  for (const [property, value] of [
    ['gap', '24px'],
    ['overflow', 'hidden'],
    ['aspect-ratio', '16 / 9'],
    ['object-fit', 'cover']
  ]) {
    assert.strictEqual(toTaptopRule(property, value).isCustom, true, property);
  }
});

// A real native widget export (rule-shape-differences.json) marked
// `transform` isCustom:false, but a live paste of our generated
// `rotate(45deg)` rule proved that sample misleading: setCSS didn't throw,
// yet getCSS read back completely empty ({source,isCustom,available}, no
// value at all) — the native classStyle handler silently dropped it.
// transform-origin/perspective-origin share the same subsystem and are kept
// alongside it rather than waiting to hit the identical failure live.
test('toTaptopRule keeps transform, its origin properties, and the background positioning subsystem on the custom CSS path despite the static audit', () => {
  for (const [property, value] of [
    ['transform', 'rotate(45deg)'],
    ['transform-origin', 'center'],
    ['perspective-origin', 'center'],
    ['background-position', 'center'],
    ['background-repeat', 'no-repeat'],
    ['background-size', 'cover'],
    ['background-attachment', 'fixed']
  ]) {
    assert.strictEqual(toTaptopRule(property, value).isCustom, true, property);
  }
});

// Cross-checked against a live native-widget comparison: a real native widget
// export marks every one
// of these `isCustom:false`, but they were missing from STANDARD_PROPERTIES
// and so were wrongly generated as isCustom:true, breaking a live CSS
// readback the same way `background`/`gap` did before this was found.
test('toTaptopRule sends longhand border/background/transition/layout properties through the native path', () => {
  for (const [property, value] of [
    ['opacity', '1'], ['z-index', '10'], ['cursor', 'pointer'],
    ['flex-shrink', '0'], ['column-gap', '16px'], ['row-gap', '16px'],
    ['border-top-left-radius', '8px'], ['border-top-right-radius', '8px'],
    ['border-bottom-right-radius', '8px'], ['border-bottom-left-radius', '8px'],
    ['border-top-width', '1px'], ['border-right-width', '1px'],
    ['border-bottom-width', '1px'], ['border-left-width', '1px'],
    ['border-top-style', 'solid'], ['border-right-style', 'solid'],
    ['border-bottom-style', 'solid'], ['border-left-style', 'solid'],
    ['border-top-color', '#000'], ['border-right-color', '#000'],
    ['border-bottom-color', '#000'], ['border-left-color', '#000'],
    ['background-image', 'linear-gradient(#fff, #000)'],
    ['transition-property', 'background-color'], ['transition-duration', '160ms'],
    ['transition-delay', '0ms'], ['transition-timing-function', 'ease']
  ]) {
    assert.strictEqual(toTaptopRule(property, value).isCustom, false, property);
  }
});

test('toTaptopRule shapes auto side margins like other native auto values; the normalizer routes them to Embed CSS', () => {
  assert.deepStrictEqual(toTaptopRule('margin-left', 'auto'), {
    name: 'margin-left', value: 'auto', isCustom: false, serializeValue: 'auto', number: 0, unit: 'auto'
  });
});

test('toTaptopRule shapes non-margin "auto" as { number: 0, unit: "auto" }, matching a real Taptop export', () => {
  const rule = toTaptopRule('height', 'auto');
  assert.deepStrictEqual(rule, {
    name: 'height', value: 'auto', isCustom: false, serializeValue: 'auto', number: 0, unit: 'auto'
  });
});

test('toTaptopRule collapses internal whitespace/newlines from a multi-line value', () => {
  const rule = toTaptopRule('transition', 'background-color 160ms ease,\n    border-color 160ms ease');
  assert.strictEqual(rule.value, 'background-color 160ms ease, border-color 160ms ease');
  assert.strictEqual(rule.serializeValue, 'background-color 160ms ease, border-color 160ms ease');
});

// Confirmed via 4 real Taptop pastes (.tag, .link-row, .logo-link,
// .menu-bottom — all declared `width: max-content` in the real source):
// Taptop's renderer doesn't honor this keyword, the element stretches to
// fill instead of shrinking to fit. Applied globally now (not just to
// width) so any future selector with this value is safe automatically.
// The native control ignored `width: max-content` (element stretched); a custom
// rule keeps it exactly. Other properties still fall back to auto.
test('toTaptopRule keeps "max-content" of a length as a custom rule', () => {
  assert.deepStrictEqual(toTaptopRule('width', 'max-content'), { name: 'width', value: 'max-content', isCustom: true, serializeValue: 'max-content' });
  assert.strictEqual(toTaptopRule('height', 'max-content').isCustom, true);
});

// Real values pulled from components.css by build-ui-kit-full.js (not
// authored) — decomposed to longhand since `width: max-content` was
// confirmed to silently fail in real Taptop and shorthand is the same class
// of risk, not independently confirmed safe.
test('expandShorthandProperty decomposes a bare "flex: 1" (.spacing-bar-wrap)', () => {
  assert.deepStrictEqual(expandShorthandProperty('flex', '1'), {
    'flex-grow': '1', 'flex-shrink': '1', 'flex-basis': '0%'
  });
});

test('expandShorthandProperty decomposes "flex: 1 0 167px" (.menu-bottom__button)', () => {
  assert.deepStrictEqual(expandShorthandProperty('flex', '1 0 167px'), {
    'flex-grow': '1', 'flex-shrink': '0', 'flex-basis': '167px'
  });
});

test('expandShorthandProperty decomposes "flex: 1 1 0" (.card-horizontal__image)', () => {
  assert.deepStrictEqual(expandShorthandProperty('flex', '1 1 0'), {
    'flex-grow': '1', 'flex-shrink': '1', 'flex-basis': '0'
  });
});

test('expandShorthandProperty keeps a calc() flex basis together', () => {
  assert.deepStrictEqual(expandShorthandProperty('flex', '1 1 calc(100% - 20px)'), {
    'flex-grow': '1', 'flex-shrink': '1', 'flex-basis': 'calc(100% - 20px)'
  });
});

test('expandShorthandProperty decomposes "flex: 0 1 310px" (.card-horizontal__content)', () => {
  assert.deepStrictEqual(expandShorthandProperty('flex', '0 1 310px'), {
    'flex-grow': '0', 'flex-shrink': '1', 'flex-basis': '310px'
  });
});

test('expandShorthandProperty decomposes "flex: none" (.card-icon-m__icon)', () => {
  assert.deepStrictEqual(expandShorthandProperty('flex', 'none'), {
    'flex-grow': '0', 'flex-shrink': '0', 'flex-basis': 'auto'
  });
});

test('expandShorthandProperty decomposes "inset: 0" (.card-image-quote__overlay)', () => {
  assert.deepStrictEqual(expandShorthandProperty('inset', '0'), {
    top: '0', right: '0', bottom: '0', left: '0'
  });
});

test('expandShorthandProperty returns null for a property with no known expansion', () => {
  assert.strictEqual(expandShorthandProperty('gap', '8px'), null);
});

// Confirmed suspect via real paste feedback: .uikit-main's `margin: 0 auto`
// never actually centered it — toTaptopRule's confirmed special shape for
// "auto" ({number:0,unit:'auto'}) only applies to a value that IS exactly
// 'auto', not a compound string like "0 auto".
test('expandShorthandProperty decomposes "margin: 0 auto" (.uikit-main centering)', () => {
  assert.deepStrictEqual(expandShorthandProperty('margin', '0 auto'), {
    'margin-top': '0', 'margin-bottom': '0', 'margin-left': 'auto', 'margin-right': 'auto'
  });
});

test('expandShorthandProperty decomposes a 1-value "margin: 0"', () => {
  assert.deepStrictEqual(expandShorthandProperty('margin', '0'), {
    'margin-top': '0', 'margin-right': '0', 'margin-bottom': '0', 'margin-left': '0'
  });
});

test('expandShorthandProperty keeps calc() values together in box shorthands', () => {
  assert.deepStrictEqual(expandShorthandProperty('margin', 'calc(1px + 2px) auto'), {
    'margin-top': 'calc(1px + 2px)',
    'margin-bottom': 'calc(1px + 2px)',
    'margin-left': 'auto',
    'margin-right': 'auto'
  });
});

test('expandShorthandProperty decomposes padding with calc() values from the real HTML export', () => {
  assert.deepStrictEqual(expandShorthandProperty('padding', '0 calc(24px + 4px)'), {
    'padding-top': '0',
    'padding-bottom': '0',
    'padding-left': 'calc(24px + 4px)',
    'padding-right': 'calc(24px + 4px)'
  });
});

test('toTaptopRule shapes the auto produced by margin decomposition; normalizer moves it to Embed CSS', () => {
  const expanded = expandShorthandProperty('margin', '0 auto');
  const rule = toTaptopRule('margin-left', expanded['margin-left']);
  assert.deepStrictEqual(rule, {
    name: 'margin-left', value: 'auto', isCustom: false, serializeValue: 'auto', number: 0, unit: 'auto'
  });
});

// Confirmed via a real native-copy export of a genuine Taptop Grid container
// (localStorage['clipboardData']): grid-template-columns needs an `items`
// array alongside the plain string, or Taptop's renderer treats the column
// count as 0 and collapses everything into one stacked column.
test('gridTemplateColumnsItems expands repeat(N, track) into N items (.alias-groups)', () => {
  assert.deepStrictEqual(gridTemplateColumnsItems('repeat(3, 1fr)'), [
    { value: '1fr' }, { value: '1fr' }, { value: '1fr' }
  ]);
});

test('gridTemplateColumnsItems splits distinct tracks without breaking inside minmax() (.type-row)', () => {
  assert.deepStrictEqual(gridTemplateColumnsItems('130px minmax(120px, 1fr) auto'), [
    { value: '130px' }, { value: 'minmax(120px, 1fr)' }, { value: 'auto' }
  ]);
});

test('gridTemplateColumnsItems expands repeat() with a minmax() track (.preview-grid/.tag-grid)', () => {
  assert.deepStrictEqual(gridTemplateColumnsItems('repeat(4, minmax(0, 1fr))'), [
    { value: 'minmax(0, 1fr)' }, { value: 'minmax(0, 1fr)' }, { value: 'minmax(0, 1fr)' }, { value: 'minmax(0, 1fr)' }
  ]);
});

test('gridTemplateColumnsItems repeats a multi-track sequence in order', () => {
  assert.deepStrictEqual(gridTemplateColumnsItems('repeat(2, 100px 1fr)'), [
    { value: '100px' }, { value: '1fr' }, { value: '100px' }, { value: '1fr' }
  ]);
});

test('gridTemplateColumnsItems splits a plain two-track value (.alias-token)', () => {
  assert.deepStrictEqual(gridTemplateColumnsItems('32px 1fr'), [{ value: '32px' }, { value: '1fr' }]);
});

test('gridTemplateColumnsItems returns an empty array for "none"', () => {
  assert.deepStrictEqual(gridTemplateColumnsItems('none'), []);
});

// 2026-09-28: rule-shape-differences.json's real native sample for
// grid-template-rows also carries `items` (empty for "none", same shape as
// columns) — this codebase only wired the attachment up for columns, and a
// live accordion collapse/expand (`grid-template-rows: 0fr`) failed its CSS
// readback because of exactly that gap.
test('toTaptopRule attaches items to both grid-template axes, not other properties', () => {
  const columnsRule = toTaptopRule('grid-template-columns', 'repeat(2, 1fr)');
  assert.deepStrictEqual(columnsRule.items, [{ value: '1fr' }, { value: '1fr' }]);
  const rowsRule = toTaptopRule('grid-template-rows', '0fr');
  assert.deepStrictEqual(rowsRule.items, [{ value: '0fr' }]);
  const otherRule = toTaptopRule('gap', '20px');
  assert.strictEqual(otherRule.items, undefined);
});

test('math functions become custom rules because Taptop numeric controls store them as 0px', () => {
  assert.equal(toTaptopRule('width', 'calc((100% - 10px) / 2)').isCustom, true);
  assert.equal(toTaptopRule('padding-top', 'clamp(16px, 4vw, 40px)').isCustom, true);
  assert.equal(toTaptopRule('width', '50%').isCustom, false);
  assert.equal(toTaptopRule('grid-template-columns', 'repeat(2, minmax(0, 1fr))').isCustom, false);
});

// Live 2026-10-11: Taptop builds background-image only from `items`; a plain
// gradient string was stored as an empty layer list and rendered `none`. The
// shapes below were fed back into Taptop's own background class and produced
// exactly the CSS it parses from the same strings.
test('toTaptopRule gives a linear gradient with an angle Taptop gradient items', () => {
  const rule = toTaptopRule('background-image', 'linear-gradient(150deg, #111111 0%, #222222 40%, #333333 100%)');
  assert.strictEqual(rule.isCustom, false);
  assert.strictEqual(rule.items.length, 1);
  const item = rule.items[0];
  assert.strictEqual(item.kind, 'gradient');
  assert.strictEqual(item.type, 'linear');
  assert.strictEqual(item.angle, '150deg');
  assert.strictEqual(item.rotateType, 'angle');
  assert.strictEqual(item.src, '150deg, #111111 0%, #222222 40%, #333333 100%');
  assert.deepStrictEqual(item.colors, [
    { color: '#111111', number: 0, unit: '%' },
    { color: '#222222', number: 40, unit: '%' },
    { color: '#333333', number: 100, unit: '%' }
  ]);
});

test('toTaptopRule gives radial gradients their shape and position', () => {
  const circle = toTaptopRule('background-image', 'radial-gradient(circle, rgba(1, 2, 3, 0.5) 0%, rgba(1, 2, 3, 0) 65%)').items[0];
  assert.strictEqual(circle.type, 'radial');
  assert.strictEqual(circle.shape, 'circle');
  assert.strictEqual(circle.position, 'center center');
  const ellipse = toTaptopRule('background-image', 'radial-gradient(ellipse at 30% 40%, #111111 0%, #222222 60%)').items[0];
  assert.strictEqual(ellipse.shape, 'ellipse');
  assert.strictEqual(ellipse.position, '30% 40%');
  assert.deepStrictEqual(ellipse.colors.map(stop => stop.number), [0, 60]);
});

test('toTaptopRule maps gradient directions, missing stop positions, solid fills and none', () => {
  const corner = toTaptopRule('background-image', 'linear-gradient(to bottom right, #111111, #222222, #333333)').items[0];
  assert.strictEqual(corner.direction, 'right bottom');
  assert.strictEqual(corner.rotateType, 'direction');
  assert.deepStrictEqual(corner.colors.map(stop => stop.number), [0, 50, 100]);
  const solid = toTaptopRule('background-image', 'linear-gradient(rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0) 100%)').items[0];
  assert.strictEqual(solid.kind, 'fill');
  assert.deepStrictEqual(toTaptopRule('background-image', 'none').items, []);
});

test('toTaptopRule keeps a background layer Taptop cannot hold as a custom rule', () => {
  const rule = toTaptopRule('background-image', 'conic-gradient(#111111, #222222)');
  assert.strictEqual(rule.isCustom, true);
  assert.strictEqual(rule.items, undefined);
});

// Live 2026-10-11: `max-width: none` without a unit was stored as 0px.
test('toTaptopRule stores none on max sizes as Taptop’s none unit', () => {
  assert.deepStrictEqual(toTaptopRule('max-width', 'none'), {
    name: 'max-width', value: 'none', isCustom: false, serializeValue: 'none', number: 0, unit: 'none'
  });
  assert.strictEqual(toTaptopRule('display', 'none').unit, undefined);
});

// Live import 2026-10-12: `width: fit-content` in a native rule became 0px and
// collapsed badges to one letter per line.
test('toTaptopRule sends lengths and weights the native controls cannot hold as custom rules', () => {
  for (const [prop, value] of [['width', 'fit-content'], ['max-width', 'max-content'], ['height', '100svh'], ['min-height', 'calc(100vh - 64px)'], ['font-weight', 'inherit'], ['margin-left', 'inherit']]) {
    const rule = toTaptopRule(prop, value);
    assert.equal(rule.isCustom, true, `${prop}: ${value}`);
    assert.equal(rule.value, value);
    assert.equal(rule.number, undefined);
  }
  for (const [prop, value] of [['width', '120px'], ['width', 'auto'], ['max-width', 'none'], ['height', '50vh'], ['font-weight', '700'], ['letter-spacing', 'normal']]) {
    assert.equal(toTaptopRule(prop, value).isCustom, false, `${prop}: ${value}`);
  }
});
