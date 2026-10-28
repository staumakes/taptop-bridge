const postcss = require('postcss');

function collectBySelectorAndMedia(cssText) {
  const root = postcss.parse(cssText);
  const result = new Map();

  function addDecl(selector, media, prop, value) {
    if (!result.has(selector)) result.set(selector, new Map());
    const bySelector = result.get(selector);
    if (!bySelector.has(media)) bySelector.set(media, new Map());
    const declarations = bySelector.get(media);
    declarations.delete(prop);
    declarations.set(prop, value);
  }

  root.walkRules((rule) => {
    let media = 'screen';
    if (rule.parent && rule.parent.type === 'atrule' && rule.parent.name === 'media') {
      media = rule.parent.params;
    }
    rule.selectors.forEach((selector) => {
      rule.walkDecls((decl) => {
        addDecl(selector, media, decl.prop, decl.value);
      });
    });
  });

  return result;
}

// Sources must be supplied in stylesheet order. This preserves declarations
// for matching selectors; it does not resolve specificity between selectors.
function mergeCollectedRules(...sources) {
  const result = new Map();
  for (const source of sources) {
    for (const [selector, mediaRules] of source) {
      if (!result.has(selector)) result.set(selector, new Map());
      const targetMedia = result.get(selector);
      for (const [media, declarations] of mediaRules) {
        if (!targetMedia.has(media)) targetMedia.set(media, new Map());
        const target = targetMedia.get(media);
        for (const [property, value] of declarations) {
          target.delete(property);
          target.set(property, value);
        }
      }
    }
  }
  return result;
}

module.exports = { collectBySelectorAndMedia, mergeCollectedRules };
