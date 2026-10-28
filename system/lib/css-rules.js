const { collectBySelectorAndMedia } = require('./css-collect');

const CUSTOM_ONLY_PROPERTIES = new Set([
  'gap',
  'overflow',
  'background',
  'border',
  'aspect-ratio',
  'object-fit',
  // 2026-09-28: the rule-shape-differences.json audit said `transform` was
  // native (isCustom:false in a real source sample), but a live paste with
  // a plain string value (`rotate(45deg)`) proved otherwise: setCSS did not
  // throw, yet the readback came back completely empty
  // ({source,isCustom,available}, no value at all) — the native classStyle
  // handler silently failed to store it. `transform-origin` and
  // `perspective-origin` are not used anywhere in our generated JSON yet,
  // but share the same native transform subsystem, so they're moved here
  // too as a precaution rather than waiting to hit the identical failure.
  'transform',
  'transform-origin',
  'perspective-origin',
  // 2026-09-28: `background-position` hit the identical empty-readback
  // failure as `transform` (setCSS didn't throw, getCSS came back exactly
  // {source,isCustom,available}, no value) — its plain string value
  // ("center") is silently dropped by whatever native handler is registered
  // for it. `background-repeat` then failed the exact same way live
  // ("no-repeat" also read back completely empty) — the static audit had
  // predicted a structured items:[{repeatX,repeatY}] shape for it instead,
  // and that prediction was simply wrong, same lesson as `transform`.
  // background-image stays native: it's confirmed live-working via its own
  // items-based gradient-fill shape (see runtime-class-adapter.js's
  // gradientFillValue). background-size/attachment have not failed live
  // themselves, but with two of their four sibling background-* properties
  // now confirmed broken natively, trusting the audit for the remaining two
  // is a weaker bet than treating the whole positioning subsystem the same
  // way — moved preventively rather than waiting to hit the same failure.
  'background-position',
  'background-repeat',
  'background-size',
  'background-attachment'
]);

// Properties in this set are sent through Taptop's native style handlers.
// Keep unsupported shorthands and modern layout properties out of this set:
// the live runtime resolves native properties through its internal
// `classStyle` registry and throws when a property has no registered handler.
// Real native exports confirm that `gap` and `overflow` shorthands belong to
// the custom CSS path (while row/column-gap and overflow-x/y are native).
//
// 2026-09-28: cross-checked all 36 property diffs recorded in
// a live native-widget comparison of rule-shape differences
// (real native widget export vs our generated rule) — 34 of them were native
// (`isCustom:false` in the real source) but missing from this set, so every
// one of them was wrongly generated as `isCustom:true` and failed a live CSS
// readback the same way `background`/`gap` did before. Added below, grouped
// to match the audit entries; longhand transition/border/background-*
// properties are native even though their shorthand forms are not.
const STANDARD_PROPERTIES = new Set([
  'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
  'display', 'flex-direction', 'align-items', 'justify-content',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'color', 'background-color', 'border-radius',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'text-align', 'white-space', 'position', 'top', 'right', 'bottom', 'left',
  'overflow-x', 'overflow-y',
  'outline', 'outline-offset', 'grid-template-columns', 'grid-template-rows',
  'pointer-events',
  'opacity', 'z-index',
  'cursor', 'flex-shrink', 'column-gap', 'row-gap',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-right-radius', 'border-bottom-left-radius',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'background-image',
  'transition-property', 'transition-duration', 'transition-delay', 'transition-timing-function'
]);

function extractRulesForSelectors(cssText, selectors) {
  const collected = collectBySelectorAndMedia(cssText);
  const wanted = new Set(selectors);
  const result = new Map();
  collected.forEach((byMedia, selector) => {
    if (wanted.has(selector)) result.set(selector, byMedia);
  });
  return result;
}

// Confirmed via a real Taptop paste ("ширина авто не выставляется"): Taptop's
// CSS engine silently mishandles at least one modern CSS value
// (`width: max-content`). We haven't independently confirmed shorthand
// PROPERTIES themselves are unsafe (gap/display:flex worked fine in an
// earlier successful paste) — but rather than test every shorthand one at a
// time against a paid Taptop project, `flex` and `inset` are decomposed into
// their longhand equivalents wherever they're extracted from real CSS, since
// the expansion is lossless and removes the risk for zero cost.
// Split a CSS value on top-level whitespace while preserving spaces inside
// functions and quoted strings. A plain `split(/\s+/)` breaks valid values
// such as `calc(100% - 20px)` into several fake shorthand fields.
function splitTopLevelWhitespace(value) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let escaped = false;
  let current = '';

  for (const ch of value.trim()) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (quote && ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      if (quote === ch) quote = null;
      else if (!quote) quote = ch;
      current += ch;
      continue;
    }
    if (!quote) {
      if (ch === '(') depth += 1;
      else if (ch === ')' && depth > 0) depth -= 1;
      if (/\s/.test(ch) && depth === 0) {
        if (current) parts.push(current);
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

function expandFlexShorthand(value) {
  const v = value.trim();
  if (v === 'none') return { 'flex-grow': '0', 'flex-shrink': '0', 'flex-basis': 'auto' };
  if (v === 'auto') return { 'flex-grow': '1', 'flex-shrink': '1', 'flex-basis': 'auto' };
  if (v === 'initial') return { 'flex-grow': '0', 'flex-shrink': '1', 'flex-basis': 'auto' };
  const parts = splitTopLevelWhitespace(v);
  const isNumber = (p) => /^-?[\d.]+$/.test(p);
  if (parts.length === 1) {
    return isNumber(parts[0])
      ? { 'flex-grow': parts[0], 'flex-shrink': '1', 'flex-basis': '0%' }
      : { 'flex-grow': '1', 'flex-shrink': '1', 'flex-basis': parts[0] };
  }
  if (parts.length === 2) {
    return isNumber(parts[1])
      ? { 'flex-grow': parts[0], 'flex-shrink': parts[1], 'flex-basis': '0%' }
      : { 'flex-grow': parts[0], 'flex-shrink': '1', 'flex-basis': parts[1] };
  }
  if (parts.length === 3) {
    return { 'flex-grow': parts[0], 'flex-shrink': parts[1], 'flex-basis': parts[2] };
  }
  return null; // unrecognized shape — leave as shorthand rather than guess
}

// Standard CSS 1/2/3/4-value box-shorthand parsing (inset/margin/padding all
// share it) — `props` is [topProp, rightProp, bottomProp, leftProp].
function expandBoxShorthand(value, [topProp, rightProp, bottomProp, leftProp]) {
  const parts = splitTopLevelWhitespace(value);
  if (parts.length === 1) return { [topProp]: parts[0], [rightProp]: parts[0], [bottomProp]: parts[0], [leftProp]: parts[0] };
  if (parts.length === 2) return { [topProp]: parts[0], [bottomProp]: parts[0], [leftProp]: parts[1], [rightProp]: parts[1] };
  if (parts.length === 3) return { [topProp]: parts[0], [leftProp]: parts[1], [rightProp]: parts[1], [bottomProp]: parts[2] };
  if (parts.length === 4) return { [topProp]: parts[0], [rightProp]: parts[1], [bottomProp]: parts[2], [leftProp]: parts[3] };
  return null;
}

function expandInsetShorthand(value) {
  return expandBoxShorthand(value, ['top', 'right', 'bottom', 'left']);
}

// Confirmed suspect (real paste feedback: .uikit-main's `margin: 0 auto`
// never centered it): toTaptopRule's special auto-handling
// ({number:0,unit:'auto'}, confirmed via a real Taptop export) only fires
// for a value that's EXACTLY the string 'auto' — not for a compound
// shorthand string like "0 auto" as a whole. Decomposing into longhand
// means each individual value (including a bare 'auto') goes through
// toTaptopRule on its own and gets that confirmed shape.
function expandMarginShorthand(value) {
  return expandBoxShorthand(value, ['margin-top', 'margin-right', 'margin-bottom', 'margin-left']);
}

function expandPaddingShorthand(value) {
  return expandBoxShorthand(value, ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']);
}

const SHORTHAND_EXPANDERS = {
  flex: expandFlexShorthand,
  inset: expandInsetShorthand,
  margin: expandMarginShorthand,
  padding: expandPaddingShorthand
};

function expandShorthandProperty(prop, value) {
  const expander = SHORTHAND_EXPANDERS[prop];
  return expander ? expander(value) : null;
}

// Splits a grid-template-columns value into its top-level tracks — space is
// the separator EXCEPT inside a function call like minmax(a, b), so track
// depth is tracked to avoid splitting inside parens.
function splitGridTracks(value) {
  return splitTopLevelWhitespace(value);
}

function expandRepeatTrack(track) {
  const m = /^repeat\((\d+),\s*(.+)\)$/.exec(track);
  if (!m) return [track];
  const sequence = splitGridTracks(m[2]);
  return Array.from({ length: parseInt(m[1], 10) }, () => sequence).flat();
}

// Confirmed via a real native-copy export of a genuine Taptop Grid container
// (set to "Grid" mode through Taptop's own Auto-layout panel, then Ctrl+C —
// read from localStorage['clipboardData'], since Taptop's own copy never
// touches the OS clipboard): grid-template-columns needs an `items` array
// (one { value: '<track>' } per column) ALONGSIDE the plain CSS string.
// Without it, Taptop's renderer treats the column count as 0 and collapses
// the whole grid into a single stacked column — this was the actual root
// cause of the first grid attempt looking broken, not "Taptop doesn't
// support CSS Grid" as first assumed from that symptom alone.
function gridTemplateColumnsItems(value) {
  if (value.trim() === 'none') return [];
  return splitGridTracks(value).flatMap(expandRepeatTrack).map((v) => ({ value: v }));
}

// Confirmed via 4 real Taptop pastes (.tag, .link-row, .logo-link,
// .menu-bottom all declared `width: max-content` in the real source):
// Taptop's renderer doesn't honor this intrinsic-sizing keyword — the
// element stretched to fill instead of shrinking to fit. `auto` was the
// confirmed working replacement in every case. Applied globally (any
// property, not just width) since there's no evidence it behaves
// differently elsewhere and `auto` is a safe shrink/grow-to-fit fallback.
function normalizeRiskyKeyword(value) {
  return value === 'max-content' ? 'auto' : value;
}

// Split on top-level commas (not inside functions), e.g. gradient stops or
// background layers.
function splitTopLevelCommas(value) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    else if (ch === ')' && depth > 0) depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const GRADIENT_FUNCTION = /^(repeating-)?(linear|radial)-gradient\((.*)\)$/s;
const RADIAL_SHAPES = new Set(['circle', 'ellipse']);
const RADIAL_EXTENTS = new Set(['closest-corner', 'closest-side', 'farthest-corner', 'farthest-side', 'cover', 'contain']);

function gradientStops(parts) {
  const stops = [];
  for (const part of parts) {
    const tokens = splitTopLevelWhitespace(part);
    const color = tokens[0];
    const length = /^(-?[\d.]+)(%|px)$/.exec(tokens[1] || '');
    if (tokens.length > 2 || (tokens[1] && !length)) return null;
    stops.push(length ? { color, number: Number(length[1]), unit: length[2] } : { color });
  }
  // Taptop spreads stops without a position evenly (its bringUnits); the
  // first and last default to 0% and 100%.
  if (stops.length < 2) return null;
  if (stops[0].number === undefined) Object.assign(stops[0], { number: 0, unit: '%' });
  const last = stops[stops.length - 1];
  if (last.number === undefined) Object.assign(last, { number: 100, unit: '%' });
  for (let i = 1; i < stops.length - 1; i += 1) {
    if (stops[i].number !== undefined) continue;
    let j = i;
    while (stops[j].number === undefined) j += 1;
    const from = stops[i - 1].number;
    const step = (stops[j].number - from) / (j - i + 1);
    for (let k = i; k < j; k += 1) Object.assign(stops[k], { number: Math.floor(from + step * (k - i + 1)), unit: stops[j].unit });
  }
  return stops;
}

// One background layer in the item shape Taptop's own background-image
// class builds (editor module read live 2026-10-11): a gradient layer is
// { kind: 'gradient', type, repeat, src, colors, angle | direction, shape,
// position, extent }; two identical stops without an angle are its solid
// `fill` kind. Returns null for anything else.
function backgroundLayerItem(layer) {
  const match = GRADIENT_FUNCTION.exec(layer.trim());
  if (!match) return null;
  const [, repeating, type, src] = match;
  const parts = splitTopLevelCommas(src);
  const item = {
    kind: 'gradient', type, repeat: Boolean(repeating), src, disabled: false, scale: true,
    shape: 'ellipse', radius1: '10%', radius2: '10%', position: 'center center', extent: '', opacity: 1
  };
  const first = parts[0] || '';
  if (type === 'linear') {
    const angle = /^(-?[\d.]+)(deg|grad|rad|turn)$/.exec(first);
    if (angle) {
      const n = Number(angle[1]);
      const deg = { deg: n, grad: Math.round(0.9 * n), rad: Math.round((180 / Math.PI) * n), turn: (360 * n) % 360 }[angle[2]];
      Object.assign(item, { angle: `${deg}deg`, rotateType: 'angle' });
      parts.shift();
    } else if (/^to\s/.test(first)) {
      const sides = first.split(/\s+/).slice(1);
      const ordered = ['left', 'right'].filter(side => sides.includes(side)).concat(['top', 'bottom'].filter(side => sides.includes(side)));
      Object.assign(item, { direction: ordered.join(' '), rotateType: 'direction' });
      parts.shift();
    }
  } else {
    const words = splitTopLevelWhitespace(first);
    const at = words.indexOf('at');
    const head = at > -1 ? words.slice(0, at) : words;
    if (at > -1 || head.every(word => RADIAL_SHAPES.has(word) || RADIAL_EXTENTS.has(word))) {
      if (at > -1) item.position = words.slice(at + 1).join(' ');
      for (const word of head) {
        if (RADIAL_SHAPES.has(word)) item.shape = word;
        else if (RADIAL_EXTENTS.has(word)) item.extent = word;
        else return null;
      }
      parts.shift();
    }
  }
  const colors = gradientStops(parts);
  if (!colors) return null;
  item.colors = colors;
  const solid = type === 'linear' && !repeating && !item.angle && !item.direction
    && colors.length === 2 && colors[0].color === colors[1].color;
  if (solid) return { kind: 'fill', colors, src, disabled: false };
  return item;
}

// Taptop builds background-image only from `items`; a plain gradient string
// is stored as an empty layer list and renders `none` (live 2026-10-11).
function backgroundImageItems(value) {
  if (value.trim() === 'none') return [];
  const items = splitTopLevelCommas(value).map(backgroundLayerItem);
  return items.every(Boolean) ? items : null;
}

// Taptop keeps `none` on max sizes as a unit; without it the value is stored
// as 0px (live 2026-10-11: `max-width: none` became `max-width: 0px`).
const NONE_UNIT_PROPERTIES = new Set(['max-width', 'max-height']);

// Native numeric controls hold a number with px, %, em, rem, vw or vh, or a
// keyword they know (auto, none, normal). Anything else — fit-content,
// max-content, 100svh, inherit — is stored as 0px: `width: fit-content` made
// badges 0px wide in a live import (2026-10-12). Such values go as custom rules.
const LENGTH_PROPERTIES = new Set([
  'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'top', 'right', 'bottom', 'left', 'font-size', 'letter-spacing', 'column-gap', 'row-gap', 'outline-offset',
  'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'
]);
const NATIVE_LENGTH = /^(-?[\d.]+(px|%|em|rem|vw|vh)?|auto|none|normal)$/;
const NATIVE_FONT_WEIGHT = /^([1-9]00|normal|bold)$/;

function toTaptopRule(prop, value) {
  // Collapse multi-line/indented CSS values (e.g. a hand-wrapped `transition`
  // shorthand) down to single-spaced text before it lands in the export.
  // A length property sends max-content as a custom rule below, which Taptop keeps.
  const collapsed = value.replace(/\s+/g, ' ').trim();
  const normalized = LENGTH_PROPERTIES.has(prop) ? collapsed : normalizeRiskyKeyword(collapsed);
  // Taptop's numeric controls cannot hold a math function: a pasted
  // `width: calc((100% - 10px) / 2)` is stored as 0px (read live 2026-10-08).
  // As a custom rule Taptop keeps the expression verbatim.
  const mathFunction = /(^|[^a-z-])(calc|min|max|clamp)\(/i.test(normalized);
  const rule = {
    name: prop,
    value: normalized,
    isCustom: !STANDARD_PROPERTIES.has(prop) || mathFunction,
    serializeValue: normalized
  };
  // The native line-height control keeps only px: 1.5, 120% and 1.2em are
  // stored as 0px. As a custom rule Taptop keeps any line-height verbatim and
  // the canvas renders it (calc/clamp and unitless read back live 2026-10-12).
  if (prop === 'line-height' && !/^-?[\d.]+px$/.test(normalized)) {
    rule.isCustom = true;
    return rule;
  }
  if ((LENGTH_PROPERTIES.has(prop) && !NATIVE_LENGTH.test(normalized)) || (prop === 'font-weight' && !NATIVE_FONT_WEIGHT.test(normalized))) {
    rule.isCustom = true;
    return rule;
  }
  const match = /^(-?[\d.]+)(px|%|deg|ms|s|vh|vw|em|rem)$/.exec(normalized);
  if (match) {
    rule.number = Number(match[1]);
    rule.unit = match[2];
  } else if (normalized === 'auto') {
    // Confirmed via a real Taptop export (setting height to "auto" through
    // its own UI, then reading back the resulting rule): Taptop's numeric
    // size/spacing controls treat "auto" as a selectable unit, not a bare
    // keyword — { number: 0, unit: 'auto' }, not { number, unit } omitted.
    // Omitting them (the earlier behavior) left the UI defaulting to "0px"
    // instead of showing auto.
    rule.number = 0;
    rule.unit = 'auto';
  } else if (normalized === 'none' && NONE_UNIT_PROPERTIES.has(prop)) {
    rule.number = 0;
    rule.unit = 'none';
  }
  if (prop === 'background-image' && !rule.isCustom) {
    const items = backgroundImageItems(normalized);
    // A layer Taptop's background class cannot hold (e.g. an unknown
    // function) stays a custom rule instead of silently becoming `none`.
    if (items) rule.items = items;
    else rule.isCustom = true;
  }
  // grid-template-rows uses the identical track syntax and, per a real
  // native export (rule-shape-differences.json), the identical `items`
  // shape as grid-template-columns — only columns had this wired up.
  if (prop === 'grid-template-columns' || prop === 'grid-template-rows') {
    rule.items = gridTemplateColumnsItems(normalized);
  }
  return rule;
}

module.exports = {
  extractRulesForSelectors,
  toTaptopRule,
  expandShorthandProperty,
  gridTemplateColumnsItems,
  STANDARD_PROPERTIES,
  CUSTOM_ONLY_PROPERTIES
};
