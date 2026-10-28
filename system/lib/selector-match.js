// Static CSS selector matching against the parsed source page. The normalizer
// uses it to lower relational, attribute and structural selectors onto the
// elements they reach: Taptop keeps no ids, attributes or source structure, so
// such rules only work through a class. Dynamic parts (:hover, ::before) on the
// selected element stay as a suffix for the embed; anything else unsupported
// returns null and the rule keeps its old treatment.

const DYNAMIC = new Set(['hover', 'focus', 'focus-visible', 'focus-within', 'active', 'visited', 'checked', 'disabled', 'enabled', 'target', 'placeholder-shown', 'invalid', 'valid', 'required', 'optional', 'read-only', 'read-write', 'indeterminate', 'default']);
const PSEUDO_ELEMENTS = new Set(['before', 'after', 'placeholder', 'selection', 'marker', 'first-letter', 'first-line', 'backdrop', 'file-selector-button']);
const STRUCTURAL = new Set(['first-child', 'last-child', 'only-child', 'first-of-type', 'last-of-type', 'only-of-type', 'nth-child', 'nth-last-child', 'nth-of-type', 'nth-last-of-type', 'not', 'is', 'where', 'matches', 'empty', 'root', 'link', 'any-link', 'scope']);

function splitList(text) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (const char of text) {
    if (quote) { if (char === quote) quote = null; current += char; continue; }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    if (char === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const IDENT = /^-?(?:[_a-zA-Z]|\\.)(?:[_a-zA-Z0-9-]|\\.)*/;
const unescape = value => value.replace(/\\(.)/g, '$1');

// Returns [{ combinator, compound }] from left to right, or null.
function parseSelector(text) {
  const steps = [];
  let index = 0;
  const source = text.trim();
  let combinator = null;
  while (index < source.length) {
    const space = /^\s+/.exec(source.slice(index));
    if (space) { index += space[0].length; if (steps.length && !combinator) combinator = ' '; continue; }
    const symbol = /^[>+~]/.exec(source.slice(index));
    if (symbol) { combinator = symbol[0]; index += 1; continue; }
    const compound = { tag: null, ids: [], classes: [], attrs: [], pseudos: [], pseudoElement: null };
    let started = false;
    while (index < source.length && !/[\s>+~]/.test(source[index])) {
      const rest = source.slice(index);
      let match;
      if (rest[0] === '*') { compound.tag = '*'; index += 1; started = true; continue; }
      if ((match = IDENT.exec(rest)) && !started) { compound.tag = unescape(match[0]).toLowerCase(); index += match[0].length; started = true; continue; }
      if (rest[0] === '.' && (match = IDENT.exec(rest.slice(1)))) { compound.classes.push(unescape(match[0])); index += 1 + match[0].length; started = true; continue; }
      if (rest[0] === '#' && (match = IDENT.exec(rest.slice(1)))) { compound.ids.push(unescape(match[0])); index += 1 + match[0].length; started = true; continue; }
      if (rest[0] === '[') {
        const end = rest.indexOf(']');
        if (end < 0) return null;
        const body = rest.slice(1, end).trim();
        const parts = /^([_a-zA-Z][\w:-]*)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+))\s*(i|s)?)?$/.exec(body);
        if (!parts) return null;
        compound.attrs.push({ name: parts[1].toLowerCase(), op: parts[2] || null, value: parts[3] ?? parts[4] ?? parts[5] ?? null, insensitive: parts[6] === 'i' });
        index += end + 1; started = true; continue;
      }
      if (rest.startsWith('::') || /^:(before|after|first-letter|first-line)(?![\w-])/.test(rest)) {
        const name = /^::?([\w-]+)/.exec(rest);
        if (!name || compound.pseudoElement) return null;
        compound.pseudoElement = name[1].toLowerCase();
        index += name[0].length; started = true; continue;
      }
      if (rest[0] === ':') {
        const name = /^:([\w-]+)/.exec(rest);
        if (!name) return null;
        index += name[0].length;
        let arg = null;
        if (source[index] === '(') {
          let depth = 0;
          let end = index;
          for (; end < source.length; end += 1) {
            if (source[end] === '(') depth += 1;
            else if (source[end] === ')') { depth -= 1; if (!depth) break; }
          }
          if (depth) return null;
          arg = source.slice(index + 1, end).trim();
          index = end + 1;
        }
        compound.pseudos.push({ name: name[1].toLowerCase(), arg });
        started = true; continue;
      }
      return null;
    }
    if (!started) return null;
    steps.push({ combinator: steps.length ? (combinator || ' ') : null, compound });
    combinator = null;
  }
  return steps.length ? steps : null;
}

// Separates dynamic pseudo-classes and the pseudo-element of the selected
// element (kept as a suffix for the embed). Dynamic parts elsewhere → null.
function staticPart(steps) {
  const last = steps[steps.length - 1].compound;
  for (const step of steps.slice(0, -1)) {
    if (step.compound.pseudoElement || step.compound.pseudos.some(pseudo => !STRUCTURAL.has(pseudo.name))) return null;
  }
  const kept = [];
  let suffix = '';
  for (const pseudo of last.pseudos) {
    if (STRUCTURAL.has(pseudo.name)) { kept.push(pseudo); continue; }
    if (!DYNAMIC.has(pseudo.name)) return null;
    suffix += `:${pseudo.name}${pseudo.arg !== null ? `(${pseudo.arg})` : ''}`;
  }
  if (last.pseudoElement) {
    if (!PSEUDO_ELEMENTS.has(last.pseudoElement) && !last.pseudoElement.startsWith('-webkit-') && !last.pseudoElement.startsWith('-moz-')) return null;
    suffix += `::${last.pseudoElement}`;
  }
  const stripped = steps.slice(0, -1).concat({ combinator: steps[steps.length - 1].combinator, compound: { ...last, pseudos: kept, pseudoElement: null } });
  return { steps: stripped, suffix };
}

function nth(arg, position) {
  const text = String(arg || '').replace(/\s+/g, '').toLowerCase();
  if (text === 'odd') return position % 2 === 1;
  if (text === 'even') return position % 2 === 0;
  const match = /^([+-]?\d*)n([+-]\d+)?$/.exec(text);
  if (!match) return /^[+-]?\d+$/.test(text) && position === Number(text);
  const a = match[1] === '' || match[1] === '+' ? 1 : match[1] === '-' ? -1 : Number(match[1]);
  const b = Number(match[2] || 0);
  if (a === 0) return position === b;
  return (position - b) / a >= 0 && Number.isInteger((position - b) / a);
}

function matchesCompound(node, compound, dom) {
  if (compound.tag && compound.tag !== '*' && dom.tag(node) !== compound.tag) return false;
  for (const id of compound.ids) if (dom.attr(node, 'id') !== id) return false;
  const classes = dom.classes(node);
  for (const name of compound.classes) if (!classes.includes(name)) return false;
  for (const { name, op, value, insensitive } of compound.attrs) {
    let actual = name === 'class' ? classes.join(' ') : dom.attr(node, name);
    if (actual === undefined || actual === null) return false;
    if (!op) continue;
    let wanted = value;
    if (insensitive) { actual = actual.toLowerCase(); wanted = wanted.toLowerCase(); }
    if (op === '=' && actual !== wanted) return false;
    if (op === '~=' && !actual.split(/\s+/).includes(wanted)) return false;
    if (op === '|=' && actual !== wanted && !actual.startsWith(`${wanted}-`)) return false;
    if (op === '^=' && !(wanted && actual.startsWith(wanted))) return false;
    if (op === '$=' && !(wanted && actual.endsWith(wanted))) return false;
    if (op === '*=' && !(wanted && actual.includes(wanted))) return false;
  }
  for (const { name, arg } of compound.pseudos) {
    const parent = dom.parent(node);
    const siblings = parent ? dom.children(parent) : [node];
    const sameType = siblings.filter(item => dom.tag(item) === dom.tag(node));
    const position = siblings.indexOf(node) + 1;
    const typePosition = sameType.indexOf(node) + 1;
    if (name === 'first-child' && position !== 1) return false;
    if (name === 'last-child' && position !== siblings.length) return false;
    if (name === 'only-child' && siblings.length !== 1) return false;
    if (name === 'first-of-type' && typePosition !== 1) return false;
    if (name === 'last-of-type' && typePosition !== sameType.length) return false;
    if (name === 'only-of-type' && sameType.length !== 1) return false;
    if (name === 'nth-child' && !nth(arg, position)) return false;
    if (name === 'nth-last-child' && !nth(arg, siblings.length - position + 1)) return false;
    if (name === 'nth-of-type' && !nth(arg, typePosition)) return false;
    if (name === 'nth-last-of-type' && !nth(arg, sameType.length - typePosition + 1)) return false;
    if (name === 'empty' && !dom.isEmpty(node)) return false;
    if (name === 'root' && dom.parent(node)) return false;
    if ((name === 'link' || name === 'any-link') && !(['a', 'area'].includes(dom.tag(node)) && dom.attr(node, 'href') !== undefined)) return false;
    if (['not', 'is', 'where', 'matches'].includes(name)) {
      const list = splitList(arg || '').map(parseSelector);
      if (list.some(item => !item)) throw new Error('unsupported');
      const any = list.some(item => matchSteps(node, item, item.length - 1, dom));
      if (name === 'not' ? any : !any) return false;
    }
  }
  return true;
}

function matchSteps(node, steps, index, dom) {
  if (!matchesCompound(node, steps[index].compound, dom)) return false;
  if (index === 0) return true;
  const combinator = steps[index].combinator;
  if (combinator === '>') { const parent = dom.parent(node); return Boolean(parent) && matchSteps(parent, steps, index - 1, dom); }
  if (combinator === ' ') {
    for (let parent = dom.parent(node); parent; parent = dom.parent(parent)) if (matchSteps(parent, steps, index - 1, dom)) return true;
    return false;
  }
  const parent = dom.parent(node);
  const siblings = parent ? dom.children(parent) : [];
  const before = siblings.slice(0, siblings.indexOf(node));
  if (combinator === '+') return before.length > 0 && matchSteps(before[before.length - 1], steps, index - 1, dom);
  if (combinator === '~') return before.some(sibling => matchSteps(sibling, steps, index - 1, dom));
  return false;
}

// Elements of `candidates` the selector reaches, or null when it cannot be decided statically.
function selectMatching(steps, candidates, dom) {
  try { return candidates.filter(node => matchSteps(node, steps, steps.length - 1, dom)); }
  catch { return null; }
}

function specificity(steps, { idClasses = new Set() } = {}) {
  const total = [0, 0, 0];
  const add = value => { for (let index = 0; index < 3; index += 1) total[index] += value[index]; };
  for (const { compound } of steps) {
    total[0] += compound.ids.length + compound.classes.filter(name => idClasses.has(name)).length;
    total[1] += compound.classes.filter(name => !idClasses.has(name)).length + compound.attrs.length;
    if (compound.tag && compound.tag !== '*') total[2] += 1;
    if (compound.pseudoElement) total[2] += 1;
    for (const { name, arg } of compound.pseudos) {
      if (name === 'where') continue;
      if (['not', 'is', 'matches'].includes(name)) {
        const best = splitList(arg || '').map(parseSelector).filter(Boolean).map(item => specificity(item, { idClasses }))
          .sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0];
        if (best) add(best);
        continue;
      }
      total[1] += 1;
    }
  }
  return total;
}

module.exports = { parseSelector, staticPart, selectMatching, specificity, splitList, STRUCTURAL };
