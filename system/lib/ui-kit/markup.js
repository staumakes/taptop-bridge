// Minimal builder for the prepared-HTML profile accepted by the compiler:
// every element has a real class, repeated classes get a deterministic
// data-taptop-key, text nodes never mix with child elements, and CSS uses
// single-class selectors with the supported desktop-first breakpoints only.

const BREAKPOINTS = ['(max-width: 991px)', '(max-width: 767px)', '(max-width: 479px)'];
const BREAKPOINT_BY_WIDTH = { 991: BREAKPOINTS[0], 767: BREAKPOINTS[1], 479: BREAKPOINTS[2] };
const ALLOWED_ATTRIBUTES = { a: ['href'], button: ['type'] };

function h(tag, classes, content, attrs = {}) {
  const classList = (Array.isArray(classes) ? classes : String(classes).split(/\s+/)).filter(Boolean);
  if (!classList.length) throw new Error(`UI_KIT_CLASS_REQUIRED: <${tag}> needs a class`);
  for (const name of Object.keys(attrs)) {
    if (!['data-taptop-behavior', 'data-taptop-anchor-prefix'].includes(name) && !(ALLOWED_ATTRIBUTES[tag] || []).includes(name)) throw new Error(`UI_KIT_ATTRIBUTE: ${name} is not portable on <${tag}>`);
  }
  const node = { tag, classes: classList, attrs };
  if (typeof content === 'string') node.text = content;
  else node.children = (content || []).filter(Boolean).flat(Infinity).filter(Boolean);
  return node;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function serializeHtml(root) {
  const seen = new Map();
  const lines = [];
  (function write(node, depth) {
    const first = node.classes[0];
    const index = (seen.get(first) || 0) + 1;
    seen.set(first, index);
    const key = ` data-taptop-key="${escapeHtml(`${first}-${index}`)}"`;
    const attrs = Object.entries(node.attrs).map(([name, value]) => ` ${name}="${escapeHtml(value)}"`).join('');
    const open = `${'  '.repeat(depth)}<${node.tag} class="${escapeHtml(node.classes.join(' '))}"${key}${attrs}>`;
    if (node.text !== undefined) lines.push(`${open}${escapeHtml(node.text)}</${node.tag}>`);
    else if (!node.children.length) lines.push(`${open}</${node.tag}>`);
    else {
      lines.push(open);
      node.children.forEach(child => write(child, depth + 1));
      lines.push(`${'  '.repeat(depth)}</${node.tag}>`);
    }
  })(root, 0);
  return lines.join('\n');
}

function createStylesheet() {
  const base = new Map();
  const media = new Map(BREAKPOINTS.map(query => [query, new Map()]));
  function put(target, selector, declarations) {
    if (!/^\.[_a-zA-Z-][_a-zA-Z0-9-]*$/.test(selector)) throw new Error(`UI_KIT_SELECTOR: ${selector} must be a single class`);
    for (const [property, value] of Object.entries(declarations)) {
      if (/\b(?:var|url|clamp)\(/i.test(String(value)) || /!important/.test(String(value))) throw new Error(`UI_KIT_VALUE: ${selector} ${property}`);
    }
    target.set(selector, { ...(target.get(selector) || {}), ...declarations });
  }
  // Taptop saves a unitless line-height as 0px, so the kit writes the pixel
  // value for every breakpoint where the font size changes.
  function pixelLineHeights() {
    const px = value => `${Number(value.toFixed(2))}px`;
    for (const [selector, declarations] of base) {
      const factorOf = value => (/^[\d.]+$/.test(String(value)) ? Number(value) : null);
      let factor = factorOf(declarations['line-height']);
      if (factor === null) continue;
      let fontSize = Number.parseFloat(declarations['font-size']);
      if (!/px$/.test(String(declarations['font-size'] || ''))) throw new Error(`UI_KIT_LINE_HEIGHT: ${selector} needs a px font-size next to a unitless line-height`);
      declarations['line-height'] = px(factor * fontSize);
      for (const rules of media.values()) {
        const override = rules.get(selector);
        if (!override || (override['font-size'] === undefined && override['line-height'] === undefined)) continue;
        if (override['font-size'] !== undefined) fontSize = Number.parseFloat(override['font-size']);
        if (override['line-height'] !== undefined) {
          const next = factorOf(override['line-height']);
          if (next === null) continue;
          factor = next;
        }
        override['line-height'] = px(factor * fontSize);
      }
    }
  }

  // Verbatim CSS for what single-class rules cannot say (states, an open menu).
  // The normalizer turns it into Taptop state rules or the embed stylesheet.
  const raw = [];
  return {
    raw(text) { raw.push(text.trim()); },
    rule(selector, declarations, responsive = {}) {
      put(base, selector, declarations);
      for (const [width, overrides] of Object.entries(responsive)) {
        const query = BREAKPOINT_BY_WIDTH[width];
        if (!query) throw new Error(`UI_KIT_BREAKPOINT: ${width}`);
        put(media.get(query), selector, overrides);
      }
    },
    has(selector) { return base.has(selector); },
    toString() {
      pixelLineHeights();
      const block = (rules, indent) => [...rules].map(([selector, declarations]) =>
        `${indent}${selector} {\n${Object.entries(declarations).map(([property, value]) => `${indent}  ${property}: ${value};`).join('\n')}\n${indent}}`).join('\n');
      const parts = [block(base, '')];
      for (const [query, rules] of media) if (rules.size) parts.push(`@media ${query} {\n${block(rules, '  ')}\n}`);
      return `${[...parts, ...raw].join('\n\n')}\n`;
    }
  };
}

module.exports = { h, serializeHtml, createStylesheet, BREAKPOINTS };
