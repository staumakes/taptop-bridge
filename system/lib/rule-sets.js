const { resolveTokensForBreakpoint, resolveValue, BREAKPOINT_ORDER } = require('./tokens');
const { toTaptopRule, expandShorthandProperty } = require('./css-rules');

const ALL_MEDIA = ['screen', ...BREAKPOINT_ORDER];

// design-taptop is authored at 991/767/479 (matches BREAKPOINT_ORDER, which
// must keep matching the real @media values in sections.css/components.css).
// Taptop stores its breakpoints as (max-width: 991px / 767px / 479px): the
// editor's own constants and media rules (read live 2026-10-08). An earlier
// 767->768 / 479->480 relabel made phone rules fire at exactly 768 and 480 px
// (the tablet canvas showed the phone layout) and kept them outside the
// editor's breakpoint panels.
const TAPTOP_MEDIA_MAP = {
  screen: 'screen',
  '(max-width: 991px)': '(max-width: 991px)',
  '(max-width: 767px)': '(max-width: 767px)',
  '(max-width: 479px)': '(max-width: 479px)'
};

function mergeCumulative(bySelectorMedia, breakpoint) {
  const merged = new Map(bySelectorMedia.get('screen') || []);
  if (breakpoint === 'screen') return merged;
  const idx = BREAKPOINT_ORDER.indexOf(breakpoint);
  for (let i = 0; i <= idx; i += 1) {
    const bucket = bySelectorMedia.get(BREAKPOINT_ORDER[i]);
    if (bucket) bucket.forEach((value, prop) => {
      merged.delete(prop);
      merged.set(prop, value);
    });
  }
  return merged;
}

// Builds one rule-object set per breakpoint. mergeCumulative's cumulative
// resolution is still used internally to correctly resolve the FULL set of
// declared+token-driven values at each breakpoint (a property can change
// value at a breakpoint purely because a token it references changes, even
// with no local declaration at that breakpoint). But only the delta against
// the immediately-preceding (next-wider) breakpoint is emitted into each
// non-screen bucket's `rules` object — mirroring how the real CSS source
// only writes an @media override for properties that actually change. This
// matters because Taptop's editor treats an explicit per-breakpoint rule as
// an override: duplicating the full property set into every breakpoint
// would make an edit at a wider breakpoint fail to propagate to narrower
// ones (there'd already be an identical-looking but now-stale override
// sitting there).
function buildRuleSetsForSelector(selector, tokenTable, extractedRules) {
  const bySelector = extractedRules.get(selector);
  if (!bySelector || bySelector.size === 0) return {};

  bySelector.forEach((_, media) => {
    if (!ALL_MEDIA.includes(media)) {
      console.warn(`[taptop-bridge] Unmodeled media query "${media}" on selector "${selector}" — rule bucket ignored`);
    }
  });

  const sets = {};
  let previousRules = null; // full resolved rules of the immediately-preceding breakpoint bucket

  ALL_MEDIA.forEach((media) => {
    const declared = mergeCumulative(bySelector, media);
    if (declared.size === 0) return;
    const tokens = resolveTokensForBreakpoint(media, tokenTable);
    const fullRules = {};
    declared.forEach((rawValue, prop) => {
      const resolved = resolveValue(rawValue, tokens);
      const expanded = expandShorthandProperty(prop, resolved);
      if (expanded) {
        Object.entries(expanded).forEach(([longhandProp, longhandValue]) => {
          fullRules[longhandProp] = toTaptopRule(longhandProp, longhandValue);
        });
      } else {
        fullRules[prop] = toTaptopRule(prop, resolved);
      }
    });

    if (media === 'screen') {
      sets.screen = fullRules;
      previousRules = fullRules;
      return;
    }

    const rules = {};
    Object.entries(fullRules).forEach(([prop, rule]) => {
      const prevRule = previousRules ? previousRules[prop] : undefined;
      if (!prevRule || prevRule.value !== rule.value) {
        rules[prop] = rule;
      }
    });
    previousRules = fullRules;
    if (Object.keys(rules).length === 0) return;
    sets[media] = rules;
  });
  return sets;
}

// extraScreenRules: literal Taptop rule-objects (already shaped via
// toTaptopRule) merged into the 'screen' bucket on top of whatever the real
// CSS source declares — for cases where the converter must author a rule
// itself because Taptop's own widget model needs it and no matching
// declaration exists in the source CSS to extract (e.g. sizing the tt_image
// wrapper).
function createSelectorWriter(tokenTable, extracted) {
  function writeSelectorRules(cssSelector, className, bucket, pseudoSuffix = '', extraScreenRules = null) {
    const ruleSets = buildRuleSetsForSelector(cssSelector, tokenTable, extracted);
    if (extraScreenRules) {
      ruleSets.screen = { ...(ruleSets.screen || {}), ...extraScreenRules };
    }
    const selectorText = `.${className}${pseudoSuffix}`;
    Object.entries(ruleSets).forEach(([internalMedia, rules]) => {
      const media = TAPTOP_MEDIA_MAP[internalMedia];
      const key = `${media}/${selectorText}`;
      bucket.map[key] = bucket.map[key]
        ? { ...bucket.map[key], rules: { ...bucket.map[key].rules, ...rules } }
        : { media, selectorText, rules };
    });
  }
  return { writeSelectorRules };
}

module.exports = { ALL_MEDIA, TAPTOP_MEDIA_MAP, mergeCumulative, buildRuleSetsForSelector, createSelectorWriter };
