const { collectBySelectorAndMedia } = require('./css-collect');

const BREAKPOINT_ORDER = ['(max-width: 991px)', '(max-width: 767px)', '(max-width: 479px)'];

function buildTokenTable(tokensCssText) {
  const collected = collectBySelectorAndMedia(tokensCssText);
  const rootEntries = collected.get(':root') || new Map();
  const table = { screen: new Map() };
  BREAKPOINT_ORDER.forEach((bp) => { table[bp] = new Map(); });

  rootEntries.forEach((props, media) => {
    const bucket = media === 'screen' ? table.screen : table[media];
    if (!bucket) {
      // Unmodeled media query (min-width, print, ...) — the tokens declared
      // inside it are silently unreachable by resolveTokensForBreakpoint.
      const propNames = Array.from(props.keys()).join(', ');
      console.warn(`[taptop-bridge] Unmodeled media query "${media}" on selector ":root" — ignored (properties: ${propNames})`);
      return;
    }
    props.forEach((value, name) => bucket.set(name, value));
  });

  return table;
}

function resolveTokensForBreakpoint(breakpoint, table) {
  const merged = new Map(table.screen);
  if (breakpoint === 'screen') return merged;
  const idx = BREAKPOINT_ORDER.indexOf(breakpoint);
  if (idx === -1) throw new Error(`Unknown breakpoint: ${breakpoint}`);
  for (let i = 0; i <= idx; i += 1) {
    table[BREAKPOINT_ORDER[i]].forEach((value, name) => merged.set(name, value));
  }
  return merged;
}

function resolveValue(value, tokens, seen = new Set()) {
  return value.replace(/var\((--[a-zA-Z0-9-]+)(?:\s*,\s*((?:[^()]|\([^()]*\))+))?\)/g, (match, name, fallback) => {
    if (seen.has(name)) throw new Error(`Circular token reference: ${name}`);
    if (tokens.has(name)) {
      return resolveValue(tokens.get(name), tokens, new Set(seen).add(name));
    }
    if (fallback !== undefined) {
      // The fallback text can itself contain a var(...) reference (e.g.
      // var(--missing, var(--known))) — resolve it recursively too, rather
      // than returning the literal, still-unresolved fallback text.
      return resolveValue(fallback.trim(), tokens, new Set(seen).add(name));
    }
    throw new Error(`Unknown token: ${name}`);
  });
}

module.exports = { buildTokenTable, resolveTokensForBreakpoint, resolveValue, BREAKPOINT_ORDER };
