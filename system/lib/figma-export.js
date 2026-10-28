const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');
const { inside, loadProject, readProjectFile, ensureProjectDirectory } = require('./project');
const { getArtifact } = require('./project-artifacts');
const { readCatalog, artifactStatuses, writeAtomically } = require('./output-catalog');
const { acquireProjectLock } = require('./project-lock');

// Figma export of one built artifact. The current preview of a build is turned
// into one static document holding a copy of the block per canvas width: the
// 991/767/479 media queries are resolved for each width and every selector is
// scoped to that copy, so Figma's HTML import sees four real layouts instead of
// one viewport. The export never changes the build; it is a derived view.
const DEFAULT_WIDTHS = [1440, 768, 480, 370];
const FRAME_CLASS = 'figma-bp';
const USAGE_FILE = 'design-system/block-usage.json';
const LIBRARY_FILE = 'design-system/figma-library.json';
const MAX_EXPORT_BYTES = 45 * 1024 * 1024;
// Figma's HTML import refused a 21 MB document ("Failed to serialize HTML")
// that it accepted as four single-width documents; above this size every width
// gets its own file.
const SPLIT_EXPORT_BYTES = 8 * 1024 * 1024;
const MIME_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif' };
const USAGE_FIELDS = new Set(['name', 'category', 'use', 'avoid', 'content', 'notes']);

function parseWidths(value) {
  if (value === undefined) return DEFAULT_WIDTHS;
  const widths = String(value).split(',').map(item => Number(item.trim()));
  if (!widths.length || widths.some(width => !Number.isInteger(width) || width < 200 || width > 3840) || new Set(widths).size !== widths.length) {
    throw new Error('FIGMA_WIDTHS_INVALID: pass distinct whole pixel widths between 200 and 3840, e.g. --widths 1440,768,480,370');
  }
  return widths;
}

// true/false for a media query that depends only on the viewport width; null
// for any other query (kept as written). A comma list matches if any part does.
function mediaVerdict(params, width) {
  const parts = params.split(',').map(part => part.trim().toLowerCase());
  const verdicts = parts.map(part => {
    if (/^print\b/.test(part)) return false;
    const features = [...part.matchAll(/\((max|min)-width\s*:\s*(\d+(?:\.\d+)?)px\)/g)];
    const rest = part.replace(/\((max|min)-width\s*:\s*\d+(?:\.\d+)?px\)/g, '').replace(/\b(?:and|only|screen|all)\b/g, '').trim();
    if (!features.length || rest) return null;
    return features.every(([, kind, limit]) => kind === 'max' ? width <= Number(limit) : width >= Number(limit));
  });
  if (verdicts.includes(true)) return true;
  if (verdicts.every(item => item === false)) return false;
  return null;
}

function resolveMedia(root, width) {
  let changed = true;
  while (changed) {
    changed = false;
    root.walkAtRules('media', rule => {
      const verdict = mediaVerdict(rule.params, width);
      if (verdict === null) return;
      if (verdict) rule.replaceWith(rule.nodes);
      else rule.remove();
      changed = true;
      return false;
    });
  }
  return root;
}

// `html`, `:root` and `body` become the width copy itself; everything else is
// looked up inside it.
function scopeSelector(selector, scope) {
  const trimmed = selector.trim();
  const lead = trimmed.match(/^(?:(?:html|:root)\b\s*>?\s*)?(?:body\b)?/)[0];
  if (lead.trim()) return `${scope}${trimmed.slice(lead.length)}`;
  return `${scope} ${trimmed}`;
}

function scopedCss(css, width) {
  const root = resolveMedia(postcss.parse(css), width);
  const scope = `.${FRAME_CLASS}-${width}`;
  root.walkRules(rule => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    rule.selectors = rule.selectors.map(selector => scopeSelector(selector, scope));
  });
  root.walkDecls(decl => {
    decl.value = decl.value.replace(/(-?\d*\.?\d+)vw\b/g, (match, amount) => `${+(Number(amount) * width / 100).toFixed(3)}px`);
  });
  return root.toString();
}

// The type comes from the bytes: a JPEG saved as .png renders in a browser but
// Figma's import drops an image whose declared type does not match its data.
function sniffMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('latin1'))) return 'image/gif';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

// A local image as a data URI. The preview folder comes first; an image the
// build left out of the preview (a CSS background moved to the Embed keeps its
// source-relative path) is looked up next to the artifact's source HTML and
// stylesheets and reported, because Taptop will miss it too.
function dataUri(images, fromDir, reference) {
  const clean = reference.trim().replace(/^['"]|['"]$/g, '');
  if (!clean || /^(?:[a-z]+:|\/\/|#)/i.test(clean)) return null;
  const relative = path.posix.normalize(path.posix.join(fromDir, clean.split(/[?#]/)[0]));
  const candidates = [[images.previewDir, relative, false], ...images.sourceDirs.map(dir => [dir, clean.split(/[?#]/)[0], true])];
  for (const [base, target, fromSource] of candidates) {
    const file = path.resolve(base, target);
    const boundary = fromSource ? images.projectRoot : images.previewDir;
    if (!inside(boundary, file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    if (!inside(fs.realpathSync(boundary), fs.realpathSync(file))) continue;
    const bytes = fs.readFileSync(file);
    const mime = sniffMime(bytes) || MIME_TYPES[path.extname(file).toLowerCase()];
    if (!mime) return null;
    const label = path.relative(images.projectRoot, file).split(path.sep).join('/');
    images.used.add(label);
    if (fromSource) images.fromSource.add(label);
    return `data:${mime};base64,${bytes.toString('base64')}`;
  }
  images.missing.add(clean);
  return null;
}

const replaceUrls = (value, images, fromDir) => value.replace(/url\(\s*([^)]+?)\s*\)/g, (match, reference) => {
  const uri = dataUri(images, fromDir, reference);
  return uri ? `url("${uri}")` : match;
});

// Only images of rules that can match the block are embedded: a shared
// stylesheet often names backgrounds of other blocks, and embedding them would
// only make the document heavier. A background image of a plain class rule is
// also recorded in `images.layers`: Figma's HTML import dropped large CSS
// backgrounds (1300 px and wider) that it keeps as <img>, so the export draws
// them as an image layer behind the element's content instead.
function inlineCssUrls(css, images, fromDir, classes) {
  if (!/url\(|position|background-/i.test(css)) return css;
  const root = postcss.parse(css);
  root.walkRules(rule => {
    if (rule.parent?.type !== 'root') return;
    rule.walkDecls('position', decl => {
      if (decl.value.trim() === 'static') return;
      for (const selector of rule.selectors) if (/^(?:\.[\w-]+)+$/.test(selector.trim())) images.positioned.add(selector.trim());
    });
    rule.walkDecls(/^background-(?:repeat|position|size)$/, decl => {
      for (const selector of rule.selectors) if (/^(?:\.[\w-]+)+$/.test(selector.trim())) (images.backgrounds[selector.trim()] ||= {})[decl.prop] = decl.value.trim().toLowerCase();
    });
  });
  root.walkDecls(decl => {
    if (!/url\(/i.test(decl.value)) return;
    const rule = decl.parent;
    if (rule?.type === 'rule' && classes) {
      const applies = rule.selectors.some(selector => (selector.match(/\.[\w-]+/g) || []).every(token => classes.has(token.slice(1))));
      if (!applies) return;
    }
    const value = replaceUrls(decl.value, images, fromDir);
    const single = /^url\("(data:image\/[^"]+)"\)$/.exec(value.trim());
    const plain = rule?.type === 'rule' && rule.parent?.type === 'root' && rule.selectors.every(selector => /^(?:\.[\w-]+)+$/.test(selector.trim()));
    if (decl.prop === 'background-image' && single && plain) {
      for (const selector of rule.selectors) images.layers.push({ selector: selector.trim(), tokens: selector.trim().slice(1).split('.'), uri: single[1] });
      decl.value = 'none';
      return;
    }
    decl.value = value;
  });
  return root.toString();
}

// A non-repeating background with a known size (an icon beside a label) keeps
// its size and position: Figma would otherwise stretch it over the whole box.
// CSS places a background at p% as p% of the box minus p% of the image, which
// is left/top p% with a -p% translate. The size comes from background-size in
// px or from the width/height of an SVG data URI.
function svgSize(uri) {
  const match = /^data:image\/svg\+xml(;base64)?,(.*)$/s.exec(uri);
  if (!match) return null;
  let text;
  try { text = match[1] ? Buffer.from(match[2], 'base64').toString('utf8') : decodeURIComponent(match[2]); } catch { return null; }
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0] || '';
  const width = Number(/\bwidth=['"]([\d.]+)(?:px)?['"]/.exec(tag)?.[1]);
  const height = Number(/\bheight=['"]([\d.]+)(?:px)?['"]/.exec(tag)?.[1]);
  return width > 0 && height > 0 ? [width, height] : null;
}

function backgroundPlacement(props, uri) {
  const value = prop => props[prop] || null;
  if (value('background-repeat') !== 'no-repeat') return null;
  const size = (value('background-size') || '').split(/\s+/);
  const px = /^(\d+(?:\.\d+)?)px$/;
  const box = px.test(size[0]) ? [Number(px.exec(size[0])[1]), Number(px.exec(size[1] || size[0])?.[1])] : size[0] && size[0] !== 'auto' ? null : svgSize(uri);
  if (!box || !(box[1] > 0)) return null;
  const words = { left: '0%', top: '0%', center: '50%', right: '100%', bottom: '100%' };
  let [x = '0%', y = '0%'] = (value('background-position') || '0% 0%').split(/\s+/).map(item => words[item] || item);
  if (/^(?:top|bottom)$/.test((value('background-position') || '').split(/\s+/)[0])) [x, y] = [y === '0%' ? '50%' : y, x];
  const axis = (offset, name) => /%$/.test(offset) ? [`${name}:${offset}`, `-${offset}`] : [`${name}:${offset}`, '0'];
  const [left, tx] = axis(x, 'left');
  const [top, ty] = axis(y, 'top');
  return `position:absolute;${left};${top};width:${box[0]}px;height:${box[1]}px;transform:translate(${tx},${ty});z-index:-1;pointer-events:none;max-width:none`;
}

// Figma's HTML import keeps the opacity of the first colour run of a text and
// often drops it on the later runs (checked 2026-10-21: "Strong. <span
// style=color:rgba(11,11,14,.5)>muted</span>" arrives fully opaque). Every
// translucent run of a text with several runs is listed by label number, so
// assemble-block.js can restore it. Colours come from class rules of the
// normalized build (class-only selectors, later rule wins) at the first width.
function parseColor(value) {
  const text = String(value || '').trim().toLowerCase();
  let match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(text);
  if (match) {
    const alpha = match[4] === undefined ? 1 : match[4].endsWith('%') ? Number(match[4].slice(0, -1)) / 100 : Number(match[4]);
    return { hex: '#' + match.slice(1, 4).map(item => Math.round(Number(item)).toString(16).padStart(2, '0')).join(''), alpha };
  }
  match = /^#([\da-f]{3}|[\da-f]{6})$/.exec(text);
  if (match) return { hex: '#' + (match[1].length === 3 ? match[1].replace(/./g, char => char + char) : match[1]), alpha: 1 };
  return null;
}

function textRuns(body, css, width) {
  const rules = [];
  resolveMedia(postcss.parse(css), width).walkRules(rule => {
    if (rule.parent?.type !== 'root') return;
    let color = null;
    rule.walkDecls('color', decl => { color = parseColor(decl.value) || color; });
    if (!color) return;
    for (const selector of rule.selectors) if (/^(?:\.[\w-]+)+$/.test(selector.trim())) rules.push({ tokens: selector.trim().slice(1).split('.'), color });
  });
  const colorOf = node => {
    const own = new Set((attribute(node, 'class') || '').split(/\s+/).filter(Boolean));
    return [...rules].reverse().find(rule => rule.tokens.every(token => own.has(token)))?.color || null;
  };
  const textOf = node => node.nodeName === '#text' ? node.value : (node.childNodes || []).map(textOf).join('');
  const collapse = value => value.replace(/\s+/g, ' ').trim();
  const result = {};
  const visit = (node, inherited) => {
    for (const child of node.childNodes || []) {
      if (!child.tagName || child.tagName === 'svg') continue;
      const color = colorOf(child) || inherited;
      const label = /^tt:(\d+)/.exec(attribute(child, 'aria-label') || '');
      if (label) {
        const runs = (child.childNodes || []).map(item => ({ text: collapse(textOf(item)), color: item.tagName ? colorOf(item) || color : color })).filter(run => run.text && run.color);
        if (runs.length > 1 && runs.some(run => run.color.alpha < 1)) result[label[1]] = runs.filter(run => run.color.alpha < 1).map(run => ({ text: run.text, color: run.color.hex, alpha: run.color.alpha }));
      }
      visit(child, color);
    }
  };
  visit(body, null);
  return result;
}

function addImageLayers(body, images) {
  if (!images.layers.length) return 0;
  let added = 0;
  walkElements(body, node => {
    const own = new Set((attribute(node, 'class') || '').split(/\s+/).filter(Boolean));
    const layer = [...images.layers].reverse().find(item => item.tokens.every(token => own.has(token)));
    if (!layer) return true;
    const positioned = [...images.positioned].some(selector => selector.slice(1).split('.').every(token => own.has(token)));
    const place = backgroundPlacement(images.backgrounds[layer.selector] || {}, layer.uri);
    const style = attribute(node, 'style') || '';
    setAttribute(node, 'style', `${style}${style && !style.trim().endsWith(';') ? ';' : ''}${positioned ? '' : 'position:relative;'}isolation:isolate`);
    node.childNodes.unshift({ nodeName: 'img', tagName: 'img', namespaceURI: 'http://www.w3.org/1999/xhtml', parentNode: node, childNodes: [],
      attrs: [{ name: 'src', value: layer.uri }, { name: 'alt', value: '' }, { name: 'aria-label', value: place ? 'Background icon' : 'Background image' },
        { name: 'style', value: place || 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;z-index:-1;pointer-events:none;max-width:none' }] });
    added++;
    return true;
  });
  return added;
}

const attribute = (node, name) => node.attrs?.find(item => item.name === name)?.value;
function setAttribute(node, name, value) {
  const existing = node.attrs.find(item => item.name === name);
  if (existing) existing.value = value;
  else node.attrs.push({ name, value });
}

function readJsonFile(root, relative, code) {
  if (!fs.existsSync(path.join(root, relative))) return null;
  try { return JSON.parse(readProjectFile(root, relative)); }
  catch (error) { throw new Error(`${code}: ${relative} is not valid JSON (${error.message})`); }
}

// Optional notes that tell people and AI agents where a block belongs.
function readUsage(root, artifactKey) {
  const usage = readJsonFile(root, USAGE_FILE, 'BLOCK_USAGE_INVALID');
  if (usage === null) return null;
  if (typeof usage !== 'object' || Array.isArray(usage)) throw new Error(`BLOCK_USAGE_INVALID: ${USAGE_FILE} must map artifact keys to usage notes`);
  const entry = usage[artifactKey];
  if (entry === undefined) return null;
  const fail = reason => { throw new Error(`BLOCK_USAGE_INVALID: ${USAGE_FILE} ${artifactKey}: ${reason}`); };
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('must be an object');
  for (const field of Object.keys(entry)) if (!USAGE_FIELDS.has(field)) fail(`unknown field ${field}`);
  if (!Array.isArray(entry.use) || !entry.use.length || entry.use.some(item => typeof item !== 'string' || !item.trim())) fail('use must list at least one situation');
  for (const field of ['avoid']) if (entry[field] !== undefined && (!Array.isArray(entry[field]) || entry[field].some(item => typeof item !== 'string' || !item.trim()))) fail(`${field} must be a list of strings`);
  for (const field of ['name', 'category', 'content', 'notes']) if (entry[field] !== undefined && (typeof entry[field] !== 'string' || !entry[field].trim())) fail(`${field} must be text`);
  return entry;
}

const px = value => {
  const match = /^(-?\d*\.?\d+)px$/.exec(String(value).trim());
  return match ? Number(match[1]) : null;
};

// The project's typography roles at every width, read from the same role CSS
// the pages use. Figma assigns a text style by comparing these values.
function textRoles(root, widths) {
  const kit = readJsonFile(root, 'design-system/kit.json', 'KIT_DATA_INVALID');
  if (!kit || !Array.isArray(kit.typography) || !kit.typography.length) return [];
  const cssFile = `design-system/${kit.css || 'roles.css'}`;
  if (!fs.existsSync(path.join(root, cssFile))) return [];
  const css = readProjectFile(root, cssFile);
  const names = kit.typography.map(item => item.className).filter(Boolean);
  const roles = names.map(name => ({ name, widths: {} }));
  for (const width of widths) {
    const values = Object.fromEntries(names.map(name => [name, {}]));
    resolveMedia(postcss.parse(css), width).walkRules(rule => {
      if (rule.parent?.type !== 'root') return;
      for (const selector of rule.selectors) {
        const name = selector.trim().slice(1);
        if (!selector.trim().startsWith('.') || !values[name]) continue;
        rule.walkDecls(decl => { values[name][decl.prop] = decl.value; });
      }
    });
    for (const role of roles) {
      const declared = values[role.name];
      const fontSize = px(declared['font-size']);
      if (fontSize === null) continue;
      let lineHeight = px(declared['line-height']);
      if (lineHeight === null && /^\d*\.?\d+$/.test(declared['line-height'] || '')) lineHeight = +(Number(declared['line-height']) * fontSize).toFixed(2);
      let letterSpacing = px(declared['letter-spacing'] ?? '0px');
      const em = /^(-?\d*\.?\d+)em$/.exec(declared['letter-spacing'] || '');
      if (em) letterSpacing = +(Number(em[1]) * fontSize).toFixed(3);
      const weight = Number(declared['font-weight']);
      role.widths[width] = { fontSize, lineHeight, letterSpacing: letterSpacing ?? 0, fontWeight: Number.isFinite(weight) ? weight : 400 };
    }
  }
  return roles.filter(role => Object.keys(role.widths).length);
}

function colorTokens(root) {
  const kit = readJsonFile(root, 'design-system/kit.json', 'KIT_DATA_INVALID');
  return (kit?.colors || []).flatMap(group => (group.items || []).map(item => ({ name: item.name, value: item.value })));
}

// Marks every element that directly holds text with aria-label `tt:<n>` or
// `tt:<n>:<role>`. Figma names the element's frame after it, so the same text
// can be found in every width copy and given its style. An <svg> gets
// `svg:<viewBox width>:<viewBox height>`.
function markText(body, roleNames) {
  let count = 0;
  const marked = [];
  const visit = node => {
    for (const child of node.childNodes || []) {
      if (!child.tagName) continue;
      // Figma's import draws SVG content in viewBox units without scaling it to
      // the element's size: the label carries the viewBox, assemble-block.js scales.
      if (child.tagName === 'svg') {
        const box = (attribute(child, 'viewBox') || '').trim().split(/[\s,]+/).map(Number);
        if (box.length === 4 && box[2] > 0 && box[3] > 0) setAttribute(child, 'aria-label', `svg:${box[2]}:${box[3]}`);
        continue;
      }
      const ownText = (child.childNodes || []).some(item => item.nodeName === '#text' && item.value.trim());
      if (ownText) {
        const classes = (attribute(child, 'class') || '').split(/\s+/);
        const role = classes.find(name => roleNames.has(name));
        const label = `tt:${++count}${role ? `:${role}` : ''}`;
        setAttribute(child, 'aria-label', label);
        marked.push({ label, role: role || null });
      }
      visit(child);
    }
  };
  visit(body);
  return marked;
}

function findNode(node, tagName) {
  if (node.tagName === tagName) return node;
  for (const child of node.childNodes || []) {
    const found = findNode(child, tagName);
    if (found) return found;
  }
  return null;
}

function walkElements(node, callback) {
  for (const child of [...(node.childNodes || [])]) {
    if (!child.tagName) continue;
    if (callback(child) === false) continue;
    walkElements(child.content || child, callback);
  }
}

const escapeText = value => String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

// The UI kit goes to Figma as two documents built from design-system data, not
// as a copy of the showcase page: Foundations (colours, typography per width,
// spacing, radii, shadows) and Components (every kit element as its own frame,
// named "<group> | <classes>", ready to become component variants).
function kitDocuments(root, widths) {
  const kit = readJsonFile(root, 'design-system/kit.json', 'KIT_DATA_INVALID');
  if (!kit) throw new Error('FIGMA_KIT_DATA_MISSING: design-system/kit.json is required to export the UI kit');
  const cssFile = `design-system/${kit.css || 'roles.css'}`;
  const roleCss = fs.existsSync(path.join(fs.realpathSync(root), cssFile)) ? readProjectFile(root, cssFile) : '';
  const font = kit.fonts?.primary || 'Inter';
  const base = [
    `body{margin:0;padding:0;background:#ffffff;color:#0b0b0e;font-family:"${font}",Inter,sans-serif}`,
    '.figma-sheet{box-sizing:border-box;width:1200px;padding:56px;margin:0 0 80px;display:flex;flex-direction:column;gap:32px;background:#ffffff}',
    '.fx-title{margin:0;font-size:40px;line-height:44px;font-weight:600}',
    '.fx-group{display:flex;flex-direction:column;gap:16px}',
    '.fx-group-title{margin:0;font-size:18px;line-height:24px;font-weight:600}',
    '.fx-grid{display:flex;flex-wrap:wrap;gap:16px}',
    '.fx-swatch{box-sizing:border-box;width:200px;display:flex;flex-direction:column;gap:8px}',
    '.fx-chip{height:72px;border-radius:10px;border:1px solid #e4e5e7}',
    '.fx-name{font-size:14px;line-height:20px;font-weight:600}',
    '.fx-meta{font-family:"JetBrains Mono",monospace;font-size:12px;line-height:16px;color:#6e6e73}',
    '.fx-row{display:flex;align-items:baseline;gap:32px;padding:16px 0;border-top:1px solid #e4e5e7}',
    '.fx-row-label{width:200px;flex:none;display:flex;flex-direction:column;gap:4px}',
    '.fx-sample{flex:1;margin:0}',
    '.fx-bar{height:16px;background:#3290ff;border-radius:2px}',
    '.fx-box{width:96px;height:96px;background:#f8f9fb;border:1px solid #e4e5e7}',
    '.figma-item{display:inline-flex;margin:24px}'
  ].join('\n');
  const roles = textRoles(root, widths);
  const sheet = (label, title, body) => `<section class="figma-sheet" aria-label="${escapeText(label)}"><h1 class="fx-title">${escapeText(title)}</h1>${body}</section>`;
  const colors = (kit.colors || []).map(group => `<div class="fx-group"><h2 class="fx-group-title">${escapeText(group.title || '')}</h2><div class="fx-grid">${(group.items || []).map(item => `<div class="fx-swatch" aria-label="color/${escapeText(item.name)}"><div class="fx-chip" style="background:${escapeText(item.value)}"></div><div class="fx-name">${escapeText(item.name)}</div><div class="fx-meta">${escapeText(item.value)}</div></div>`).join('')}</div></div>`).join('');
  const sampleOf = name => (kit.typography || []).find(item => item.className === name)?.sample || 'Sample text';
  const typography = roles.map(role => {
    const spec = widths.map(width => { const value = role.widths[width]; return value ? `${width}: ${value.fontSize}/${value.lineHeight ?? 'auto'}${value.letterSpacing ? ` ${value.letterSpacing}` : ''}` : `${width}: —`; }).join(' · ');
    const weight = role.widths[widths[0]]?.fontWeight;
    return `<div class="fx-row" aria-label="type/${escapeText(role.name)}"><div class="fx-row-label"><div class="fx-name">${escapeText(role.name)}</div><div class="fx-meta">${escapeText(`${spec} · ${weight}`)}</div></div><p class="fx-sample ${escapeText(role.name)}">${escapeText(sampleOf(role.name))}</p></div>`;
  }).join('');
  const spacing = (kit.spacing || []).map(value => `<div class="fx-row" aria-label="space/${value}"><div class="fx-row-label"><div class="fx-name">${value}px</div></div><div class="fx-bar" style="width:${Number(value) * 4}px"></div></div>`).join('');
  const radius = (kit.radius || []).map(item => `<div class="fx-swatch" aria-label="radius/${escapeText(item.label)}"><div class="fx-box" style="border-radius:${escapeText(item.value)}"></div><div class="fx-name">${escapeText(item.label)}</div><div class="fx-meta">${escapeText(item.value)}</div></div>`).join('');
  const shadows = (kit.shadows || []).map(item => `<div class="fx-swatch" aria-label="shadow/${escapeText(item.label)}"><div class="fx-box" style="border-radius:10px;box-shadow:${escapeText(item.value)}"></div><div class="fx-name">${escapeText(item.label)}</div><div class="fx-meta">${escapeText(item.value)}</div></div>`).join('');
  const foundations = [
    colors && sheet('Foundations / Colors', 'Colors', colors),
    typography && sheet('Foundations / Typography', 'Typography', typography),
    spacing && sheet('Foundations / Spacing', 'Spacing', spacing),
    (radius || shadows) && sheet('Foundations / Radius and shadows', 'Radius and shadows', `<div class="fx-grid">${radius}${shadows}</div>`)
  ].filter(Boolean).join('\n');
  // One frame per distinct element: a kit may show the same element in two
  // panels, and two equal variant names break a Figma component set.
  const seen = new Set();
  const items = (kit.components || []).flatMap(group => (group.panels || []).flatMap(panel => (panel.rows || []).flat().filter(item => {
    const id = `${group.title || group.id} | ${(item.classes || []).join(' ')}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map(item => {
    const classes = (item.classes || []).join(' ');
    const tag = /^[a-z][a-z0-9]*$/.test(item.tag || '') ? item.tag : 'span';
    const href = tag === 'a' ? ' href="#"' : '';
    return `<div class="figma-item" aria-label="${escapeText(`${group.title || group.id} | ${classes}`)}"><${tag} class="${escapeText(classes)}"${href}>${escapeText(item.text || '')}</${tag}></div>`;
  })));
  const page = (title, body) => ['<!doctype html>', '<html lang="ru">', '<head>', '<meta charset="utf-8">', `<title>${escapeText(title)}</title>`, `<style>\n${base}\n</style>`, `<style>\n${roleCss}\n</style>`, '</head>', `<body>${body}</body>`, '</html>', ''].join('\n');
  return {
    roles,
    documents: [
      { name: 'foundations', cssSelector: '.figma-sheet', html: page(`${kit.projectName || 'UI kit'} — Foundations`, foundations) },
      { name: 'components', cssSelector: '.figma-item', html: page(`${kit.projectName || 'UI kit'} — Components`, items.join('\n')), count: items.length }
    ]
  };
}

async function figmaExport({ projectRoot, artifactKey, widths: widthOption }) {
  const root = path.resolve(projectRoot);
  loadProject(root);
  const widths = parseWidths(widthOption);
  const artifact = getArtifact(root, artifactKey);
  const catalog = readCatalog(root);
  const row = artifactStatuses(root, catalog).find(item => item.key === artifactKey);
  if (!row || row.status !== 'current') {
    throw new Error(`FIGMA_EXPORT_NEEDS_CURRENT_BUILD: ${artifactKey} is ${row?.status || 'never-built'}; run npm run toolkit -- build --project <project> --artifact ${artifactKey} first`);
  }
  const build = row.build;
  if (artifactKey === 'ui-kit') return writeKitExport(root, artifact, build, widths);
  const previewRelative = path.posix.dirname(build.html);
  const previewDir = path.join(root, previewRelative);
  const usage = readUsage(root, artifactKey);
  const roles = textRoles(root, widths);
  const warnings = [];
  if (!usage) warnings.push({ code: 'BLOCK_USAGE_MISSING', message: `${USAGE_FILE} has no notes for ${artifactKey}; Figma and AI agents will not know where the block belongs.` });

  const { parse, serialize } = await import('parse5');
  const document = parse(fs.readFileSync(path.join(root, build.html), 'utf8'));
  const classes = new Set();
  walkElements(document, node => { for (const name of (attribute(node, 'class') || '').split(/\s+/)) if (name) classes.add(name); return true; });
  const images = {
    projectRoot: root, previewDir, used: new Set(), fromSource: new Set(), missing: new Set(), layers: [], positioned: new Set(), backgrounds: {},
    sourceDirs: [...new Set([artifact.html, ...artifact.stylesheets].map(file => path.dirname(path.join(root, file))))]
  };
  const cssParts = [];
  walkElements(document, node => {
    if (node.tagName === 'link' && /\bstylesheet\b/i.test(attribute(node, 'rel') || '')) {
      const href = attribute(node, 'href') || '';
      if (/^(?:[a-z]+:|\/\/)/i.test(href)) return false;
      const relative = path.posix.normalize(href);
      const file = path.resolve(previewDir, relative);
      if (!inside(previewDir, file) || !fs.existsSync(file)) throw new Error(`FIGMA_EXPORT_SOURCE_MISSING: ${previewRelative}/${href}`);
      cssParts.push(inlineCssUrls(fs.readFileSync(file, 'utf8'), images, path.posix.dirname(relative), classes));
      return false;
    }
    if (node.tagName === 'style') {
      cssParts.push(inlineCssUrls((node.childNodes || []).map(item => item.value || '').join(''), images, '.', classes));
      return false;
    }
    return true;
  });
  const body = findNode(document, 'body');
  const remove = new Set(['script', 'link', 'style', 'noscript', 'template']);
  walkElements(body, node => {
    if (remove.has(node.tagName)) {
      node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1);
      return false;
    }
    if (node.tagName === 'img' || node.tagName === 'source') {
      const src = attribute(node, 'src');
      if (src) {
        const uri = dataUri(images, '.', src);
        if (uri) setAttribute(node, 'src', uri);
      }
      node.attrs = node.attrs.filter(item => item.name !== 'srcset' && item.name !== 'loading');
    }
    const style = attribute(node, 'style');
    if (style && /url\(/i.test(style)) setAttribute(node, 'style', replaceUrls(style, images, '.'));
    return true;
  });
  addImageLayers(body, images);
  const marked = markText(body, new Set(roles.map(role => role.name)));
  if (images.fromSource.size) warnings.push({ code: 'FIGMA_IMAGE_FROM_SOURCE', message: `${images.fromSource.size} image(s) are missing from the build preview and were taken from the source files: ${[...images.fromSource].slice(0, 3).join(', ')}. The Taptop package lacks them too; check these images in the editor.` });
  if (images.missing.size) warnings.push({ code: 'FIGMA_IMAGE_NOT_EMBEDDED', message: `${images.missing.size} image(s) were found neither in the preview nor next to the sources (${[...images.missing].slice(0, 3).join(', ')}); Figma will show empty frames.` });
  const content = serialize(body);
  const css = cssParts.join('\n');
  const runs = textRuns(body, css, widths[0]);
  const frame = `.${FRAME_CLASS}{position:relative;overflow:hidden;transform:translateZ(0);margin:0 0 80px;height:auto!important;min-height:0!important;max-height:none!important}`;
  const documentFor = list => [
    '<!doctype html>',
    '<html lang="ru">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${title.replace(/[<&]/g, char => (char === '<' ? '&lt;' : '&amp;'))} — Figma export</title>`,
    `<style>html,body{margin:0;padding:0;background:#ffffff}${frame}</style>`,
    ...list.map(width => `<style>\n${scopedCss(css, width)}\n</style>`),
    '</head>',
    '<body>',
    ...list.map(width => `<div class="${FRAME_CLASS} ${FRAME_CLASS}-${width}" aria-label="Breakpoint=${width}" style="width:${width}px">${content}</div>`),
    '</body>',
    '</html>',
    ''
  ].join('\n');
  const title = usage?.name || artifact.title || artifact.key;
  const directory = `output/figma/${artifact.slug}--${build.buildId}`;
  const combined = documentFor(widths);
  const documents = Buffer.byteLength(combined) > SPLIT_EXPORT_BYTES
    ? widths.map(width => ({ file: `${directory}/export-${width}.html`, widths: [width], html: documentFor([width]) }))
    : [{ file: `${directory}/export.html`, widths, html: combined }];
  for (const item of documents) {
    if (Buffer.byteLength(item.html) > MAX_EXPORT_BYTES) throw new Error(`FIGMA_EXPORT_TOO_LARGE: ${item.file} is ${Math.round(Buffer.byteLength(item.html) / 1048576)} MB; Figma accepts up to 50 MB. Reduce image sizes in the source.`);
  }

  const manifest = {
    schemaVersion: 1,
    artifactKey,
    buildId: build.buildId,
    title,
    category: usage?.category || null,
    usage,
    exports: documents.map(item => ({ file: item.file, widths: item.widths })),
    cssSelector: `.${FRAME_CLASS}`,
    frames: widths.map(width => ({ width, name: `Breakpoint=${width}` })),
    textLabels: { pattern: 'tt:<number>[:<role>]', count: marked.length, withRole: marked.filter(item => item.role).length },
    textRuns: runs,
    textRoles: roles,
    colorTokens: colorTokens(root),
    images: [...images.used].sort(),
    warnings
  };
  const release = acquireProjectLock(root, `figma-export ${artifactKey}`);
  try {
    ensureProjectDirectory(root, directory);
    const files = Object.fromEntries([...documents.map(item => [item.file, item.html]), [`${directory}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`]]);
    let status = 'up-to-date';
    for (const name of fs.readdirSync(path.join(root, directory))) {
      if (/^export(?:-\d+)?\.html$/.test(name) && !files[`${directory}/${name}`]) { fs.rmSync(path.join(root, directory, name)); status = 'written'; }
    }
    for (const [file, text] of Object.entries(files)) {
      const target = path.join(root, file);
      if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === text) continue;
      writeAtomically(root, file, text);
      status = 'written';
    }
    return { status, artifactKey, buildId: build.buildId, exports: manifest.exports, manifest: `${directory}/manifest.json`, cssSelector: manifest.cssSelector, widths, textLabels: manifest.textLabels, textRuns: Object.keys(runs).length, warnings };
  } finally {
    release();
  }
}

function writeKitExport(root, artifact, build, widths) {
  const { roles, documents } = kitDocuments(root, widths);
  const directory = `output/figma/${artifact.slug}--${build.buildId}`;
  const exports = documents.map(item => ({ file: `${directory}/${item.name}.html`, cssSelector: item.cssSelector, kind: item.name }));
  const warnings = documents.find(item => item.name === 'components').count ? [] : [{ code: 'FIGMA_KIT_NO_COMPONENTS', message: 'kit.json lists no components; the Components document is empty.' }];
  const manifest = { schemaVersion: 1, artifactKey: 'ui-kit', buildId: build.buildId, title: 'UI kit', exports, textRoles: roles, colorTokens: colorTokens(root), warnings };
  const release = acquireProjectLock(root, 'figma-export ui-kit');
  try {
    ensureProjectDirectory(root, directory);
    let status = 'up-to-date';
    const files = { ...Object.fromEntries(documents.map((item, index) => [exports[index].file, item.html])), [`${directory}/manifest.json`]: `${JSON.stringify(manifest, null, 2)}\n` };
    for (const [file, text] of Object.entries(files)) {
      const target = path.join(root, file);
      if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === text) continue;
      writeAtomically(root, file, text);
      status = 'written';
    }
    return { status, artifactKey: 'ui-kit', buildId: build.buildId, exports, manifest: `${directory}/manifest.json`, cssSelector: exports.map(item => item.cssSelector).join(' / '), widths, warnings };
  } finally {
    release();
  }
}

// Records which Figma node holds the component made from a build, so doctor can
// tell when the Bridge block has changed and the Figma copy is behind.
function readLibrary(root) {
  const library = readJsonFile(root, LIBRARY_FILE, 'FIGMA_LIBRARY_INVALID');
  if (library === null) return { schemaVersion: 1, links: {} };
  if (library?.schemaVersion !== 1 || !library.links || typeof library.links !== 'object' || Array.isArray(library.links)) {
    throw new Error(`FIGMA_LIBRARY_INVALID: ${LIBRARY_FILE} has an unknown structure`);
  }
  return library;
}

function figmaLink({ projectRoot, artifactKey, fileKey, nodeId }) {
  const root = path.resolve(projectRoot);
  loadProject(root);
  if (!/^[0-9a-zA-Z]{22,128}$/.test(fileKey || '')) throw new Error('FIGMA_LINK_INVALID: --file must be the key from the Figma URL (figma.com/design/<key>/…)');
  if (!/^\d+[:-]\d+$/.test(nodeId || '')) throw new Error('FIGMA_LINK_INVALID: --node must be a Figma node id such as 12:345');
  const node = nodeId.replace('-', ':');
  getArtifact(root, artifactKey);
  const release = acquireProjectLock(root, `figma-link ${artifactKey}`);
  try {
    const entry = readCatalog(root).artifacts[artifactKey];
    if (!entry?.current) throw new Error(`NOT_BUILT: ${artifactKey} has no current build to link`);
    const library = readLibrary(root);
    library.links[artifactKey] = { fileKey, nodeId: node, buildId: entry.current, linkedAt: new Date().toISOString() };
    library.links = Object.fromEntries(Object.entries(library.links).sort(([a], [b]) => a.localeCompare(b)));
    ensureProjectDirectory(root, 'design-system');
    writeAtomically(root, LIBRARY_FILE, `${JSON.stringify(library, null, 2)}\n`);
    return { artifactKey, ...library.links[artifactKey], url: `https://www.figma.com/design/${fileKey}?node-id=${node.replace(':', '-')}` };
  } finally {
    release();
  }
}

module.exports = { DEFAULT_WIDTHS, FRAME_CLASS, USAGE_FILE, LIBRARY_FILE, parseWidths, mediaVerdict, scopedCss, textRoles, figmaExport, figmaLink, readLibrary };
