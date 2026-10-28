// Figma Plugin API script, run through the Figma MCP `use_figma` tool; it is
// not a Node module. Prepend `const PARAMS = {...};` (see
// system/skills/taptop-site-transfer/references/figma-library.md) and send the
// whole text as the tool's code. It turns the width frames imported from
// `figma-export` into one component set with a variant per width, or refreshes
// an existing set in place so its instances stay linked. It then names text
// layers after their typography role, applies library text styles and colour
// variables when their keys are given, sets the adaptive-variable mode of every
// variant and writes the usage notes as the component description.
//
// PARAMS holds the shared fields below and `blocks`, a list of per-block
// fields (frameIds, setId, parentId, name, description, note); a PARAMS without
// `blocks` is one block. The result lists one report per block.
//
// PARAMS:
//   frameIds      ids returned by the HTML import, one frame per width (omit to only re-bind an existing set)
//   runs          manifest.textRuns from figma-export: translucent colour runs of mixed texts, by label number
//   setId         an existing component set to refresh or re-bind (optional)
//   parentId      auto-layout frame that receives a new block (required for a new set)
//   name          component set name, e.g. "Section / Hero"
//   description   text for the component description (usage notes for people and AI agents)
//   note          lines shown in the card above the set (optional)
//   textRoles     manifest.textRoles from figma-export
//   textStyles    { "<role>": "<text style key or local id S:…>" } (optional)
//   colors        [{ name, key (library key or local VariableID:…), hex: "#rrggbb", alpha, prefer: "text"|"fill"|"stroke"|"any" }] (optional)
//   modes         { variableKey: "<any variable of the adaptive collection>", byWidth: { "1440": "<mode name>", … } } (optional)
//   noteFont      { family, style } for the note card (default Inter Regular)
//   pageId        page that holds the frames and the block columns

const P = PARAMS;
let report;
const WEIGHTS = { thin: 100, 'extra light': 200, extralight: 200, light: 300, regular: 400, normal: 400, medium: 500, 'semi bold': 600, semibold: 600, bold: 700, 'extra bold': 800, extrabold: 800, black: 900 };
const LABEL = /^(?:(.*) - )?tt:(\d+)(?::([\w-]+))?$/;
const ROLE_NAMES = new Set((P.textRoles || []).map(role => role.name));
const widthOf = node => Number((/Breakpoint=(\d+)/.exec(node.name) || [])[1]);
const close = (a, b, tolerance) => a !== null && b !== null && Math.abs(a - b) <= tolerance;

function textMetrics(text) {
  if (text.fontSize === figma.mixed || text.fontName === figma.mixed || text.lineHeight === figma.mixed || text.letterSpacing === figma.mixed) return null;
  const size = text.fontSize;
  const lineHeight = text.lineHeight.unit === 'PIXELS' ? text.lineHeight.value : text.lineHeight.unit === 'PERCENT' ? size * text.lineHeight.value / 100 : null;
  const letterSpacing = text.letterSpacing.unit === 'PIXELS' ? text.letterSpacing.value : size * text.letterSpacing.value / 100;
  return { fontSize: size, lineHeight, letterSpacing, fontWeight: WEIGHTS[text.fontName.style.toLowerCase()] || 400 };
}

function matchRole(perWidth) {
  const widths = Object.keys(perWidth);
  const candidates = (P.textRoles || []).filter(role => widths.every(width => {
    const want = role.widths[width];
    const have = perWidth[width];
    return want && have && close(want.fontSize, have.fontSize, 0.5) && close(want.lineHeight, have.lineHeight, 0.6)
      && want.fontWeight === have.fontWeight && close(want.letterSpacing || 0, have.letterSpacing || 0, 0.06);
  }));
  return candidates.map(role => role.name);
}

function labelled(root) {
  const result = [];
  for (const node of root.findAll(item => item.type !== 'TEXT' && (LABEL.test(item.name) || ROLE_NAMES.has(item.name.split(' · ').pop())))) {
    const text = node.findOne?.(item => item.type === 'TEXT');
    if (!text) continue;
    const label = LABEL.exec(node.name);
    if (label) result.push({ number: label[2], role: label[3] || null, prefix: label[1] || '', holder: node, text });
    else result.push({ number: `named:${node.id}`, role: node.name.split(' · ').pop(), prefix: node.name.split(' · ').slice(0, -1).join(' · '), holder: node, text });
  }
  return result;
}

// Figma names a labelled frame "<element> - tt:<n>" ("Heading 1 - tt:3") or
// just "tt:<n>". After the first pass the frame is renamed "<element> · <role>",
// so a later pass (styles published, fonts available) finds the role by name.
// Text without a role keeps its label, so a later pass can match it again.
// Roles are decided once per label across all widths, so a 14/20 text that is
// 16/24 on desktop is not mistaken for a smaller role. Two roles with equal
// metrics (a body size and a button size) are told apart by the element kind.
async function bindTexts(variants) {
  const byNumber = new Map();
  for (const variant of variants) {
    for (const item of labelled(variant)) {
      const entry = byNumber.get(item.number) || { role: item.role, items: [], perWidth: {} };
      entry.items.push(item);
      const metrics = textMetrics(item.text);
      if (metrics) entry.perWidth[widthOf(variant)] = metrics;
      byNumber.set(item.number, entry);
    }
  }
  const styles = {};
  for (const [number, entry] of byNumber) {
    let role = entry.role;
    if (!role) {
      const found = matchRole(entry.perWidth);
      const isButton = /button/i.test(entry.items[0].prefix || '');
      const narrowed = found.length > 1 ? found.filter(name => /button/.test(name) === isButton) : found;
      if (narrowed.length === 1) role = narrowed[0];
      else if (found.length > 1) report.texts.ambiguous.push({ label: number, roles: found, sample: entry.items[0].text.characters.slice(0, 40) });
    }
    for (const item of entry.items) {
      report.texts.total++;
      if (role) item.holder.name = [item.prefix, role].filter(Boolean).join(' · ');
      if (!role) {
        if (!report.texts.ambiguous.some(row => row.label === number)) report.texts.offSystem.push({ sample: item.text.characters.slice(0, 40), width: widthOf(findVariant(item.holder)), metrics: textMetrics(item.text) });
        continue;
      }
      const key = P.textStyles?.[role];
      if (!key) { report.texts.roleOnly++; continue; }
      try {
        styles[key] ||= key.startsWith('S:') ? await figma.getStyleByIdAsync(key) : await figma.importStyleByKeyAsync(key);
        await figma.loadFontAsync(styles[key].fontName);
        await figma.loadFontAsync(item.text.fontName);
        await item.text.setTextStyleIdAsync(styles[key].id);
        report.texts.styled++;
      } catch (error) {
        report.texts.roleOnly++;
        if (report.texts.errors.length < 5) report.texts.errors.push(`${role}: ${String(error.message || error).slice(0, 160)}`);
      }
    }
  }
  report.texts.offSystem = report.texts.offSystem.slice(0, 30);
}

function findVariant(node) {
  let current = node;
  while (current && !widthOf(current)) current = current.parent;
  return current || node;
}

// Keys of a published library are imported; ids ("VariableID:…", "S:…") name
// styles and variables that live in the same file.
const variableOf = key => key.startsWith('VariableID:') ? figma.variables.getVariableByIdAsync(key) : figma.variables.importVariableByKeyAsync(key);

const hex = color => '#' + [color.r, color.g, color.b].map(value => Math.round(value * 255).toString(16).padStart(2, '0')).join('');

const importedColors = {};
function pickColor(paint, kind) {
  const value = hex(paint.color);
  const alpha = Math.round((paint.opacity ?? 1) * 100) / 100;
  const same = (P.colors || []).filter(item => item.hex.toLowerCase() === value && Math.abs((item.alpha ?? 1) - alpha) < 0.015);
  return same.find(item => item.prefer === kind) || same.find(item => item.prefer === 'any') || same[0] || null;
}

// Figma's HTML import often drops the opacity of the later colour runs of a
// text ("Strong. muted" arrives fully opaque). figma-export lists those runs;
// each is found by its text and gets its colour back, bound to a token when
// one matches.
async function restoreRuns(variants, runs) {
  if (!runs || !Object.keys(runs).length) return;
  // The import sometimes drops the labelled frame of a text at one width and
  // leaves the text layer alone; it is then found by its characters.
  const found = variants.map(variant => labelled(variant).filter(item => runs[item.number]));
  const sample = {};
  for (const items of found) for (const item of items) sample[item.number] ||= item.text.characters;
  const words = value => new RegExp(value.split(' ').map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'));
  variants.forEach((variant, index) => {
    for (const number of Object.keys(runs)) {
      if (found[index].some(item => item.number === number)) continue;
      // Without a labelled frame at any width, the text that holds the run is used.
      const text = sample[number] ? variant.findOne(node => node.type === 'TEXT' && node.characters === sample[number])
        : variant.findOne(node => node.type === 'TEXT' && words(runs[number][0].text).test(node.characters));
      if (text) found[index].push({ number, text });
      else report.runs.missed += runs[number].length;
    }
  });
  for (const items of found) {
    for (const item of items) {
      const list = runs[item.number];
      const text = item.text;
      const fonts = text.fontName === figma.mixed ? text.getStyledTextSegments(['fontName']).map(segment => segment.fontName) : [text.fontName];
      for (const font of fonts) await figma.loadFontAsync(font);
      let from = 0;
      for (const run of list) {
        const pattern = new RegExp(words(run.text).source, 'g');
        pattern.lastIndex = from;
        const match = pattern.exec(text.characters);
        if (!match) { report.runs.missed++; continue; }
        const start = match.index, end = start + match[0].length;
        const [r, g, b] = [1, 3, 5].map(index => parseInt(run.color.slice(index, index + 2), 16) / 255);
        let paint = { type: 'SOLID', color: { r, g, b }, opacity: run.alpha };
        const token = pickColor(paint, 'text');
        if (token) {
          importedColors[token.key] ||= await variableOf(token.key);
          paint = figma.variables.setBoundVariableForPaint({ ...paint, opacity: 1 }, 'color', importedColors[token.key]);
        }
        text.setRangeFills(start, end, [paint]);
        from = end;
        report.runs.restored++;
      }
    }
  }
}

async function bindColors(variants) {
  if (!P.colors?.length) return;
  const imported = importedColors;
  const pick = pickColor;
  const rebind = async (node, property, kind) => {
    const paints = node[property];
    if (!Array.isArray(paints) || !paints.length) return;
    let changed = false;
    const next = [];
    for (const paint of paints) {
      if (paint.type !== 'SOLID' || paint.boundVariables?.color) { next.push(paint); continue; }
      const token = pick(paint, kind);
      if (!token) {
        const id = `${hex(paint.color)}/${Math.round((paint.opacity ?? 1) * 100) / 100}`;
        report.colors.unmatched[id] = (report.colors.unmatched[id] || 0) + 1;
        next.push(paint);
        continue;
      }
      imported[token.key] ||= await variableOf(token.key);
      next.push(figma.variables.setBoundVariableForPaint({ ...paint, opacity: 1 }, 'color', imported[token.key]));
      changed = true;
      report.colors.bound++;
    }
    if (changed) node[property] = next;
  };
  for (const variant of variants) {
    for (const node of [variant, ...variant.findAll(() => true)]) {
      if ('fills' in node && node.fills !== figma.mixed) await rebind(node, 'fills', node.type === 'TEXT' ? 'text' : node.type === 'VECTOR' || node.type === 'BOOLEAN_OPERATION' ? 'text' : 'fill');
      if ('strokes' in node) await rebind(node, 'strokes', 'stroke');
    }
  }
}

async function applyModes(variants) {
  if (!P.modes?.variableKey) return;
  try {
    const variable = await variableOf(P.modes.variableKey);
    const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
    for (const variant of variants) {
      const modeName = P.modes.byWidth[String(widthOf(variant))];
      const mode = collection.modes.find(item => item.name === modeName);
      if (mode) variant.setExplicitVariableModeForCollection(collection, mode.modeId);
    }
    report.modes = 'set';
  } catch (error) {
    report.modes = `failed: ${String(error.message || error).slice(0, 160)}`;
  }
}

// Moves the content of a freshly imported frame into an existing variant, so
// instances of the component keep their link.
function refreshVariant(variant, frame) {
  for (const child of [...variant.children]) child.remove();
  for (const property of ['layoutMode', 'primaryAxisSizingMode', 'counterAxisSizingMode', 'primaryAxisAlignItems', 'counterAxisAlignItems', 'itemSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'clipsContent']) {
    if (property in frame) variant[property] = frame[property];
  }
  variant.fills = frame.fills;
  variant.strokes = frame.strokes;
  variant.resizeWithoutConstraints(frame.width, frame.height);
  for (const child of [...frame.children]) variant.appendChild(child);
  frame.remove();
}

// Figma's HTML import keeps an <svg> frame at its CSS size but draws the
// content in viewBox units (a 20-unit icon stays 20 px in a 32 px frame). The
// export labels the svg `svg:<w>:<h>`; scale the content to fit, centred.
function fitSvgFrames(root) {
  const LABEL_SVG = /^(?:(.*) - )?svg:([\d.]+):([\d.]+)$/;
  const frames = root.findAll ? root.findAll(node => LABEL_SVG.test(node.name)) : [];
  for (const node of frames) {
    const [, prefix, w, h] = LABEL_SVG.exec(node.name);
    const k = Math.min(node.width / Number(w), node.height / Number(h));
    const dx = (node.width - Number(w) * k) / 2, dy = (node.height - Number(h) * k) / 2;
    if (Math.abs(k - 1) > 0.001 || dx || dy) for (const child of node.children || []) {
      const x = child.x, y = child.y;
      if (Math.abs(k - 1) > 0.001) child.rescale(k);
      child.x = x * k + dx; child.y = y * k + dy;
    }
    node.name = prefix || 'Icon';
  }
  return frames.length;
}

// The width must be read before conversion: the imported frame stops existing
// once it becomes a component. A retried call may meet an already converted one.
function asComponent(frame) {
  const width = widthOf(frame);
  const component = frame.type === 'COMPONENT' ? frame : figma.createComponentFromNode(frame);
  component.name = `Breakpoint=${width}`;
  return component;
}

async function noteCard(parent, lines) {
  const font = P.noteFont || { family: 'Inter', style: 'Regular' };
  await figma.loadFontAsync(font);
  const card = figma.createAutoLayout('VERTICAL', { name: 'About this block', itemSpacing: 8, paddingTop: 24, paddingBottom: 24, paddingLeft: 24, paddingRight: 24, cornerRadius: 12 });
  card.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.976, b: 0.984 } }];
  card.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.89, b: 0.91 } }];
  parent.appendChild(card);
  lines.forEach((line, index) => {
    const text = figma.createText();
    text.fontName = font;
    text.fontSize = index === 0 ? 28 : 16;
    text.characters = line;
    card.appendChild(text);
    if (index > 0) { text.textAutoResize = 'HEIGHT'; text.resize(880, text.height); }
  });
  return card;
}

async function assemble(B) {
  report = { name: B.name || null, setId: null, variants: [], texts: { total: 0, styled: 0, roleOnly: 0, offSystem: [], ambiguous: [], errors: [] }, colors: { bound: 0, unmatched: {} }, runs: { restored: 0, missed: 0 }, modes: 'skipped' };
  let set = B.setId ? await figma.getNodeByIdAsync(B.setId) : null;
  if (B.setId && set?.type !== 'COMPONENT_SET') throw new Error(`${B.setId} is not a component set`);
  const frames = [];
  for (const id of B.frameIds || []) {
    const frame = await figma.getNodeByIdAsync(id);
    if (!frame || !widthOf(frame)) throw new Error(`${id} is not an imported width frame (expected a name like Breakpoint=1440)`);
    fitSvgFrames(frame);
    frames.push(frame);
  }
  if (set && frames.length) {
    for (const frame of frames) {
      const variant = set.children.find(item => widthOf(item) === widthOf(frame));
      if (variant) refreshVariant(variant, frame);
      else set.appendChild(asComponent(frame));
    }
  } else if (!set) {
    const parent = await figma.getNodeByIdAsync(B.parentId);
    if (!parent || !('layoutMode' in parent) || parent.layoutMode === 'NONE') throw new Error('parentId must be an auto-layout frame');
    const block = figma.createAutoLayout('VERTICAL', { name: `Block / ${B.name.replace(/^Section \/ /, '')}`, itemSpacing: 32 });
    block.fills = [];
    parent.appendChild(block);
    if (B.note?.length) await noteCard(block, B.note);
    const components = frames.map(asComponent);
    set = figma.combineAsVariants(components, block);
    set.layoutMode = 'HORIZONTAL';
    set.itemSpacing = 80;
    set.counterAxisAlignItems = 'MIN';
    set.paddingTop = set.paddingBottom = set.paddingLeft = set.paddingRight = 40;
    set.primaryAxisSizingMode = 'AUTO';
    set.counterAxisSizingMode = 'AUTO';
  }
  if (B.name) set.name = B.name;
  if (B.description) set.description = B.description;
  const variants = set.children.filter(item => item.type === 'COMPONENT').sort((a, b) => widthOf(b) - widthOf(a));
  variants.forEach((variant, index) => set.insertChild(index, variant));
  // Runs are found by label number, before bindTexts renames the labelled layers.
  await restoreRuns(variants, B.runs || P.runs);
  await bindTexts(variants);
  await bindColors(variants);
  await applyModes(variants);
  report.setId = set.id;
  report.blockId = set.parent?.id || null;
  report.variants = variants.map(item => `${item.name} ${Math.round(item.width)}×${Math.round(item.height)}`);
  return report;
}

if (P.pageId) await figma.setCurrentPageAsync(await figma.getNodeByIdAsync(P.pageId));
const reports = [];
for (const block of P.blocks || [P]) {
  try { reports.push(await assemble(block)); }
  catch (error) { reports.push({ name: block.name || null, error: String(error.message || error).slice(0, 300) }); }
}
return reports;
