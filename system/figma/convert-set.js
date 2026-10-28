// Figma Plugin API script, run through `use_figma` on the SOURCE design file
// (read-only): prepend `const PARAMS = {...};`. It turns a component set with
// four breakpoint variants into HTML + CSS for a Bridge component: markup from
// the desktop tree, CSS from Auto Layout per variant, written as desktop rules
// plus only what changes at 991 / 767 / 479px. Text styles named like kit roles
// become role classes; other texts keep their own font values.
//
// PARAMS:
//   sets        [{ setId, prefix, order: [desktop, tablet, mobile-horizontal, mobile-vertical variant names] }]
//   roles       kit role class names that text style names map to (["display--lg", "text--md-400", …])
//   roleAlias   { "<style name>": "<role>" } for misspelled style names (optional)
//   buttonSet   regular expression for the button component set name; its instances become
//               <a class="btn btn--primary|btn--secondary [btn--s]"> (optional)
//   budget      bytes of the returned JSON (use_figma returns at most ~48 kB; default 46000)
//
// Returns { rest: ["<prefix>:<bytes>" …], out: [result …] }. A result too large
// for this call is listed in `rest`: run it alone. Each result is compact:
// "§" stands for "<prefix>__" in html and css, and every CSS rule lists indexes
// into `dict`. system/figma/write-block.js expands it into source files.
//
// Structure differences between variants become per-variant wrappers shown
// with display: contents only at their width (reported in `mismatch`). Layers
// without text (pictures, icons, illustrations) become <img> with one file per
// distinct aspect ratio; `media` maps each file to the node to export with
// download_assets. Image fills of frames with content become <img> layers
// behind the content (`media[file].fill` is the fill index).

const P0 = PARAMS;
const BP = [null, 991, 767, 479];
const ROLES = new Set(P0.roles || []);
const ROLE_ALIAS = P0.roleAlias || {};
const BUTTON = P0.buttonSet ? new RegExp(P0.buttonSet, 'i') : null;
const BUDGET = P0.budget || 46000;
const styleCache = {};
const styleName = async id => { if (!id || typeof id !== 'string') return null; if (!(id in styleCache)) { const s = await figma.getStyleByIdAsync(id); styleCache[id] = s ? (ROLE_ALIAS[s.name] || s.name) : null; } return styleCache[id]; };
const r2 = v => Math.round(v * 100) / 100;
const px = v => `${r2(v)}px`;
const rgba = (c, a) => `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${Math.round(a * 1000) / 1000})`;
const color = p => {
  const a = Math.round((p.opacity ?? 1) * 1000) / 1000;
  if (p.type === 'SOLID') return a < 1 ? rgba(p.color, a) : '#' + [p.color.r, p.color.g, p.color.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  const stops = () => p.gradientStops.map(s => `${rgba(s.color, s.color.a * a)} ${Math.round(s.position * 100)}%`).join(', ');
  if (p.type === 'GRADIENT_LINEAR') { const t = p.gradientTransform; const angle = Math.round((Math.atan2(t[1][0], t[0][0]) * 180 / Math.PI + 90 + 360) % 360); return `linear-gradient(${angle}deg, ${stops()})`; }
  if (p.type === 'GRADIENT_RADIAL' || p.type === 'GRADIENT_DIAMOND') return `radial-gradient(closest-side, ${stops()})`;
  return null;
};
const strokeColor = p => p.type === 'SOLID' ? color(p) : p.gradientStops ? rgba(p.gradientStops[0].color, p.gradientStops[0].color.a * (p.opacity ?? 1)) : null;
const visible = arr => Array.isArray(arr) ? arr.filter(p => p.visible !== false) : [];
const hasText = n => n.type === 'TEXT' || ('findOne' in n && !!n.findOne(c => c.type === 'TEXT' && c.visible));
const SHAPES = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'ELLIPSE', 'LINE'];
const imageFill = c => visible(c.fills).some(f => f.type === 'IMAGE' || f.type === 'VIDEO');
const visualNode = c => c.visible && (SHAPES.includes(c.type) || imageFill(c) || c.isMask);
const isMedia = n => !hasText(n) && (visualNode(n) || n.type === 'GROUP' || ('findOne' in n && !!n.findOne(visualNode)));
const isButton = async n => {
  if (!BUTTON || n.type !== 'INSTANCE') return null;
  const m = await n.getMainComponentAsync();
  const setName = m?.parent?.type === 'COMPONENT_SET' ? m.parent.name : m?.name;
  return BUTTON.test(setName || '') ? m.name : null;
};
const WEIGHT = { Thin: 100, 'Extra Light': 200, Light: 300, Regular: 400, Medium: 500, 'Semi Bold': 600, SemiBold: 600, Bold: 700, 'Extra Bold': 800, Black: 900 };
const JUST = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', SPACE_BETWEEN: 'space-between' };
const ALIGN = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', BASELINE: 'baseline' };
const FIT = { FILL: 'cover', FIT: 'contain', CROP: 'cover', TILE: 'cover' };
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// A property present at one width and absent at the next is reset to the browser value.
const RESET = { width: 'auto', height: 'auto', flex: '0 1 auto', 'align-self': 'auto', 'min-width': '0', 'max-width': 'none', position: 'static', left: 'auto', right: 'auto', top: 'auto', 'white-space': 'normal', 'flex-shrink': '1', 'background-color': 'transparent', background: 'none', 'box-shadow': 'none', 'border-radius': '0', overflow: 'visible', padding: '0', 'column-gap': '0', 'row-gap': '0', 'margin-left': '0', 'margin-top': '0', opacity: '1', 'backdrop-filter': 'none', 'flex-wrap': 'nowrap' };

async function convert(P) {
  const set = await figma.getNodeByIdAsync(P.setId);
  const variants = P.order.map(name => set.children.find(v => v.name === name));
  if (variants.some(v => !v)) throw new Error('variant missing: ' + set.children.map(v => v.name).join(', '));
  const rules = {}, media = {}, mismatch = [];
  const put = (cls, i, prop, value) => { (rules[cls] ||= [{}, {}, {}, {}])[i][prop] = value; };
  function sizing(cls, i, n, parent) {
    if (!parent) { put(cls, i, 'width', '100%'); return; }
    const pDir = parent.layoutMode === 'HORIZONTAL' ? 'row' : parent.layoutMode === 'VERTICAL' ? 'column' : parent.layoutMode === 'GRID' ? 'grid' : 'none';
    if (pDir === 'none' || n.layoutPositioning === 'ABSOLUTE') {
      put(cls, i, 'position', 'absolute');
      // A rotated layer is placed by its bounding box, which is what its export covers.
      if (n.rotation && n.absoluteBoundingBox && parent.absoluteBoundingBox) {
        const b = n.absoluteBoundingBox, pb = parent.absoluteBoundingBox;
        put(cls, i, 'top', px(b.y - pb.y)); put(cls, i, 'left', px(b.x - pb.x)); put(cls, i, 'width', px(b.width)); put(cls, i, 'height', px(b.height));
        return;
      }
      put(cls, i, 'top', px(n.y)); put(cls, i, 'height', px(n.height));
      if (Math.abs(n.x) < 0.5 && Math.abs(n.width - parent.width) < 0.5) { put(cls, i, 'left', '0px'); put(cls, i, 'right', '0px'); }
      else { put(cls, i, 'left', px(n.x)); put(cls, i, 'width', px(n.width)); }
      return;
    }
    const H = n.layoutSizingHorizontal, V = n.layoutSizingVertical;
    if (pDir === 'grid') { if (H === 'FIXED') put(cls, i, 'width', px(n.width)); if (V === 'FIXED') put(cls, i, 'height', px(n.height)); return; }
    const mainFill = pDir === 'row' ? H === 'FILL' : V === 'FILL';
    const crossFill = pDir === 'row' ? V === 'FILL' : H === 'FILL';
    if (mainFill || n.layoutGrow) { put(cls, i, 'flex', '1 1 0'); put(cls, i, pDir === 'row' ? 'min-width' : 'min-height', '0'); }
    else put(cls, i, 'flex-shrink', '0');
    if (crossFill) put(cls, i, 'align-self', 'stretch');
    if (H === 'FIXED') { put(cls, i, 'width', px(n.width)); put(cls, i, 'max-width', '100%'); }
    if (V === 'FIXED' && n.type !== 'TEXT') put(cls, i, 'height', px(n.height));
  }
  function decorate(cls, i, n) {
    const fills = visible(n.fills).filter(f => f.type !== 'IMAGE' && f.type !== 'VIDEO').map(color).filter(Boolean);
    if (fills.length === 1 && !/gradient/.test(fills[0])) put(cls, i, 'background-color', fills[0]);
    else if (fills.length) put(cls, i, 'background', [...fills].reverse().map(f => /gradient/.test(f) ? f : `linear-gradient(${f}, ${f})`).join(', '));
    const shadows = [];
    const strokes = visible(n.strokes);
    const sc = strokes.length ? strokeColor(strokes[0]) : null;
    if (sc && n.strokeWeight !== figma.mixed && n.strokeWeight > 0) shadows.push(`inset 0 0 0 ${n.strokeWeight}px ${sc}`);
    else if (sc && n.strokeWeight === figma.mixed) {
      [['top', n.strokeTopWeight], ['right', n.strokeRightWeight], ['bottom', n.strokeBottomWeight], ['left', n.strokeLeftWeight]].forEach(([side, w]) => { if (w) put(cls, i, `border-${side}`, `${w}px solid ${sc}`); });
    }
    for (const e of (n.effects || []).filter(e => e.visible !== false && e.type === 'DROP_SHADOW')) shadows.push(`${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread || 0}px ${rgba(e.color, e.color.a)}`);
    if (shadows.length) put(cls, i, 'box-shadow', shadows.join(', '));
    const blur = (n.effects || []).find(e => e.visible !== false && e.type === 'BACKGROUND_BLUR');
    if (blur) put(cls, i, 'backdrop-filter', `blur(${r2(blur.radius / 2)}px)`);
    if ('cornerRadius' in n) {
      if (n.cornerRadius === figma.mixed) put(cls, i, 'border-radius', [n.topLeftRadius, n.topRightRadius, n.bottomRightRadius, n.bottomLeftRadius].map(px).join(' '));
      else if (n.cornerRadius) put(cls, i, 'border-radius', px(n.cornerRadius));
    }
    if (n.clipsContent) put(cls, i, 'overflow', 'hidden');
    if (n.opacity !== undefined && n.opacity < 1) put(cls, i, 'opacity', String(r2(n.opacity)));
  }
  function layout(cls, i, n) {
    if (!('layoutMode' in n) || n.layoutMode === 'NONE') { put(cls, i, 'position', rules[cls]?.[i]?.position === 'absolute' ? 'absolute' : 'relative'); put(cls, i, 'height', px(n.height)); return; }
    if (n.layoutMode === 'GRID') {
      put(cls, i, 'display', 'grid'); put(cls, i, 'grid-template-columns', `repeat(${n.gridColumnCount}, minmax(0, 1fr))`);
      put(cls, i, 'row-gap', px(n.gridRowGap)); put(cls, i, 'column-gap', px(n.gridColumnGap));
    } else {
      const row = n.layoutMode === 'HORIZONTAL';
      put(cls, i, 'display', 'flex'); put(cls, i, 'flex-direction', row ? 'row' : 'column');
      if (n.layoutWrap === 'WRAP') { put(cls, i, 'flex-wrap', 'wrap'); put(cls, i, row ? 'row-gap' : 'column-gap', px(n.counterAxisSpacing || 0)); }
      if (n.itemSpacing > 0 && n.primaryAxisAlignItems !== 'SPACE_BETWEEN') put(cls, i, row ? 'column-gap' : 'row-gap', px(n.itemSpacing));
      put(cls, i, 'justify-content', JUST[n.primaryAxisAlignItems] || 'flex-start');
      put(cls, i, 'align-items', ALIGN[n.counterAxisAlignItems] || 'flex-start');
    }
    const pad = [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft];
    if (pad.some(Boolean)) put(cls, i, 'padding', pad.map(px).join(' '));
    if (rules[cls]?.[i]?.position !== 'absolute' && n.children.some(c => c.visible && (c.layoutPositioning === 'ABSOLUTE'))) put(cls, i, 'position', 'relative');
  }
  async function textNode(cls, i, n) {
    const role = await styleName(n.textStyleId);
    const fills = visible(n.fills);
    if (fills.length) put(cls, i, 'color', color(fills[0]));
    put(cls, i, 'margin', '0');
    put(cls, i, 'text-align', { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' }[n.textAlignHorizontal]);
    if (!ROLES.has(role)) {
      if (n.fontSize !== figma.mixed) put(cls, i, 'font-size', px(n.fontSize));
      if (n.fontName !== figma.mixed) { put(cls, i, 'font-weight', String(WEIGHT[n.fontName.style] || 400)); put(cls, i, 'font-family', `'${n.fontName.family}', sans-serif`); }
      if (n.lineHeight !== figma.mixed && n.lineHeight.unit === 'PIXELS') put(cls, i, 'line-height', px(n.lineHeight.value));
    }
    if (n.textAutoResize === 'WIDTH_AND_HEIGHT') put(cls, i, 'white-space', 'nowrap');
    if (n.textDecoration === 'UNDERLINE') put(cls, i, 'text-decoration', 'underline');
    return role && ROLES.has(role) ? role : null;
  }
  // Image fills of a frame with content: one <img> layer per distinct image,
  // absolutely positioned behind the content at every width it shows.
  function fillLayers(nodes, cls) {
    const per = nodes.map(n => visible(n.fills).map((f, k) => ({ f, k })).filter(x => x.f.type === 'IMAGE'));
    if (per.every(p => !p.length)) return '';
    const out = [], files = [];
    for (let i = 0; i < 4; i++) for (const { f, k } of per[i]) {
      const same = files.find(x => x.hash === f.imageHash);
      if (same) { same.bps.push(i); continue; }
      const file = `${cls.replace(P.prefix + '__', 'bg-').replace(P.prefix, 'bg')}-${files.length + 1}.png`;
      files.push({ hash: f.imageHash, file, bps: [i], id: nodes[i].id, k, fit: FIT[f.scaleMode] || 'cover' });
    }
    files.forEach((x, j) => {
      const c2 = `${cls}__bg${j + 1}`;
      media[x.file] = { id: x.id, fill: x.k };
      for (let i = 0; i < 4; i++) {
        put(c2, i, 'display', x.bps.includes(i) ? 'block' : 'none');
        for (const [prop, value] of [['position', 'absolute'], ['left', '0px'], ['top', '0px'], ['width', '100%'], ['height', '100%'], ['object-fit', x.fit], ['z-index', '-1']]) put(c2, i, prop, value);
      }
      out.push(`<img class="${c2}" src="images/${x.file}" alt="">`);
    });
    for (let i = 0; i < 4; i++) { put(cls, i, 'isolation', 'isolate'); if (rules[cls][i].position !== 'absolute') put(cls, i, 'position', 'relative'); }
    return out.join('');
  }
  async function build(nodes, parents, path) {
    const n = nodes[0];
    const cls = path.length ? `${P.prefix}__${path.join('-')}` : P.prefix;
    for (let i = 0; i < 4; i++) sizing(cls, i, nodes[i], parents[i]);
    if (n.type === 'TEXT') {
      let role = null;
      for (let i = 0; i < 4; i++) role = await textNode(cls, i, nodes[i]) || role;
      const lines = n.characters.replace(/\r/g, '').split('\n');
      const classes = [role, cls].filter(Boolean).join(' ');
      if (lines.length > 1) {
        for (let i = 0; i < 4; i++) { put(cls, i, 'display', 'flex'); put(cls, i, 'flex-direction', 'column'); put(cls, i, 'align-items', { LEFT: 'flex-start', CENTER: 'center', RIGHT: 'flex-end' }[nodes[i].textAlignHorizontal] || 'flex-start'); }
        return `<div class="${classes}">${lines.map(l => `<span>${esc(l)}</span>`).join('')}</div>`;
      }
      return `<p class="${classes}">${esc(n.characters)}</p>`;
    }
    const button = await isButton(n);
    if (button) {
      const label = n.findOne(c => c.type === 'TEXT')?.characters || '';
      const kind = /secondary/.test(button) ? 'btn--secondary' : /transparent/.test(button) ? '' : 'btn--primary';
      const small = /bt-sz=s\b|size=s\b/i.test(button) ? 'btn--s' : '';
      return `<a class="${['btn', kind, small, cls].filter(Boolean).join(' ')}" href="#">${esc(label)}</a>`;
    }
    if (isMedia(n)) {
      for (let i = 0; i < 4; i++) {
        put(cls, i, 'display', 'block'); put(cls, i, 'object-fit', 'cover');
        if (!rules[cls][i].height && nodes[i].layoutSizingVertical !== 'FILL') put(cls, i, 'height', px(nodes[i].height));
        if (!rules[cls][i].width && !rules[cls][i].right && rules[cls][i]['align-self'] !== 'stretch' && rules[cls][i].flex !== '1 1 0') put(cls, i, 'width', px(nodes[i].width));
      }
      const files = [];
      for (let i = 0; i < 4; i++) {
        const ratio = nodes[i].width / nodes[i].height;
        const same = files.find(f => Math.abs(f.ratio - ratio) / ratio < 0.12);
        if (same) { same.bps.push(i); continue; }
        const file = `${cls.replace(P.prefix + '__', 'm-')}${files.length ? '-' + [1440, 768, 480, 370][i] : ''}.png`;
        files.push({ file, ratio, bps: [i], id: nodes[i].id, w: nodes[i].width, h: nodes[i].height });
      }
      for (const f of files) media[f.file] = { id: f.id };
      if (files.length === 1) return `<img class="${cls}" src="images/${files[0].file}" alt="" width="${Math.round(n.width)}" height="${Math.round(n.height)}">`;
      return files.map((f, k) => {
        const c2 = `${cls}--v${k}`;
        for (let i = 0; i < 4; i++) put(c2, i, 'display', f.bps.includes(i) ? 'block' : 'none');
        return `<img class="${cls} ${c2}" src="images/${f.file}" alt="" width="${Math.round(f.w)}" height="${Math.round(f.h)}">`;
      }).join('');
    }
    for (let i = 0; i < 4; i++) { layout(cls, i, nodes[i]); decorate(cls, i, nodes[i]); }
    const parts = [fillLayers(nodes, cls)];
    const kids = nodes.map(x => (x.children || []).filter(c => c.visible));
    const same = kids.every(k => k.length === kids[0].length && k.every((c, j) => c.name === kids[0][j].name && c.type === kids[0][j].type));
    if (!same) mismatch.push(`${cls}: ${kids.map(k => k.length).join('/')}`);
    if (same) {
      for (let j = 0; j < kids[0].length; j++) {
        // A negative Auto Layout gap is an overlap: negative margins.
        for (let i = 0; i < 4; i++) {
          const p = nodes[i];
          if (j > 0 && 'itemSpacing' in p && p.itemSpacing < 0 && p.layoutMode !== 'NONE') put(`${P.prefix}__${[...path, j + 1].join('-')}`, i, p.layoutMode === 'HORIZONTAL' ? 'margin-left' : 'margin-top', px(p.itemSpacing));
        }
        parts.push(await build(kids.map(k => k[j]), nodes, [...path, j + 1]));
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const wrap = `${cls}--only${i}`;
        for (let k = 0; k < 4; k++) put(wrap, k, 'display', k === i ? 'contents' : 'none');
        const inner = [];
        for (let j = 0; j < kids[i].length; j++) {
          const solo = [0, 1, 2, 3].map(() => kids[i][j]);
          const soloParents = [0, 1, 2, 3].map(() => nodes[i]);
          inner.push(await build(solo, soloParents, [...path, `v${i}`, j + 1]));
        }
        parts.push(`<div class="${wrap}">${inner.join('')}</div>`);
      }
    }
    const tag = path.length ? 'div' : 'section';
    return `<${tag} class="${cls}">${parts.join('')}</${tag}>`;
  }
  const html = await build(variants, [null, null, null, null], []);
  const blocks = [[], [], [], []];
  const dict = [], dictIndex = {};
  const di = d => dictIndex[d] ?? (dictIndex[d] = dict.push(d) - 1);
  const pre = P.prefix + '__';
  for (const [cls, perBp] of Object.entries(rules)) {
    let prev = {};
    perBp.forEach((props, i) => {
      const merged = { ...prev, ...props };
      const out = i === 0 ? props : Object.fromEntries(Object.entries(merged).filter(([k, v]) => prev[k] !== v));
      if (i > 0) for (const k of Object.keys(prev)) if (!(k in props) && RESET[k] !== undefined) out[k] = RESET[k];
      if (Object.keys(out).length) blocks[i].push(`.${cls.split(pre).join('§')}{${Object.entries(out).map(([k, v]) => di(`${k}: ${v}`)).join(',')}}`);
      prev = i === 0 ? props : { ...props };
    });
  }
  const css = [blocks[0].join('\n'), ...[1, 2, 3].map(i => blocks[i].length ? `@media (max-width: ${BP[i]}px) {\n${blocks[i].join('\n')}\n}` : '')].filter(Boolean).join('\n\n');
  return { prefix: P.prefix, set: `${set.name} ${set.id}`, html: html.split(pre).join('§'), css, dict, media, mismatch, heights: variants.map(v => Math.round(v.height)) };
}

const first = await figma.getNodeByIdAsync(P0.sets[0].setId);
let page = first; while (page.type !== 'PAGE') page = page.parent;
await figma.setCurrentPageAsync(page);
const out = [], rest = [];
let size = 200;
for (const item of P0.sets) {
  let result; try { result = await convert(item); } catch (error) { result = { prefix: item.prefix, error: String(error) }; }
  const bytes = JSON.stringify(result).length;
  if (size + bytes > BUDGET) { rest.push(`${item.prefix}:${bytes}`); continue; }
  size += bytes; out.push(result);
}
return { rest, out };
