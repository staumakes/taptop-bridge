// Figma Plugin API script, run through `use_figma` like assemble-block.js:
// prepend `const PARAMS = {...};`. It lays out one category page of the block
// library: a page header and one card per block (title, status, usage notes,
// breakpoint captions and the component set itself). Sets are moved into the
// cards; an earlier card or "Block / …" wrapper of the same set is replaced.
//
// PARAMS:
//   pageName     page to create or reuse, e.g. "2 · Hero"
//   insertAfter  name of the page the new page follows (optional)
//   title        category title shown on the page
//   subtitle     one line under the title
//   blocks       [{ setId, key, name, status: "Stable"|"Draft"|"Candidate"|"Legacy", use: [..], avoid: [..], content, source }]

const P = PARAMS;
const FONT = { r: { family: 'Inter', style: 'Regular' }, m: { family: 'Inter', style: 'Medium' }, s: { family: 'Inter', style: 'Semi Bold' }, mono: { family: 'JetBrains Mono', style: 'Regular' } };
await Promise.all(Object.values(FONT).map(font => figma.loadFontAsync(font)));
const rgb = hex => ({ r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255 });
const solid = (hex, opacity = 1) => [{ type: 'SOLID', color: rgb(hex), opacity }];
const INK = '#0B0B0E', GENTLE = '#6B6E76', MUTED = '#9A9DA6', LINE = '#E4E6EA', CANVAS = '#EEF0F3';
const STATUS = { Stable: ['#E3F6E8', '#1E7B34'], Draft: ['#FFF3DD', '#A05A00'], Candidate: ['#EAF2FF', '#1E5699'], Legacy: ['#EFEFF1', '#5B5E66'] };
const BREAKPOINTS = [[1440, 'Desktop'], [768, 'Tablet'], [480, 'Mobile landscape'], [370, 'Mobile portrait']];

function text(parent, characters, font, size, color, options = {}) {
  const node = figma.createText();
  node.fontName = font;
  node.fontSize = size;
  node.characters = characters;
  node.fills = solid(color);
  if (options.lineHeight) node.lineHeight = { unit: 'PIXELS', value: options.lineHeight };
  if (options.letterSpacing) node.letterSpacing = { unit: 'PERCENT', value: options.letterSpacing };
  if (options.upper) node.textCase = 'UPPER';
  parent.appendChild(node);
  if (options.width) { node.textAutoResize = 'HEIGHT'; node.resize(options.width, node.height); }
  if (options.name) node.name = options.name;
  return node;
}

function stack(direction, props) {
  const frame = figma.createAutoLayout(direction, props);
  frame.fills = [];
  return frame;
}

function pill(parent, label, [bg, fg]) {
  const frame = stack('HORIZONTAL', { name: `Pill / ${label}`, paddingTop: 8, paddingBottom: 8, paddingLeft: 16, paddingRight: 16, cornerRadius: 999 });
  frame.fills = solid(bg);
  parent.appendChild(frame);
  text(frame, label, FONT.m, 18, fg);
  return frame;
}

function noteColumn(parent, label, lines, width) {
  const column = stack('VERTICAL', { name: label, itemSpacing: 12 });
  parent.appendChild(column);
  text(column, label, FONT.mono, 16, MUTED, { upper: true, letterSpacing: 4 });
  for (const line of lines) text(column, line, FONT.r, 22, INK, { width, lineHeight: 32 });
  return column;
}

let page = figma.root.children.find(item => item.name === P.pageName);
if (!page) {
  page = figma.createPage();
  page.name = P.pageName;
  const after = figma.root.children.find(item => item.name === P.insertAfter);
  if (after) figma.root.insertChild(figma.root.children.indexOf(after) + 1, page);
}
await figma.setCurrentPageAsync(page);
page.backgrounds = solid(CANVAS);

const layout = page.children.find(item => item.name === 'Library page') || stack('VERTICAL', { name: 'Library page', itemSpacing: 160, paddingTop: 160, paddingBottom: 240, paddingLeft: 160, paddingRight: 160 });
if (!layout.parent || layout.parent.type === 'DOCUMENT') page.appendChild(layout);
layout.x = 0; layout.y = 0;

let header = layout.children.find(item => item.name === 'Page header');
if (header) header.remove();
header = stack('VERTICAL', { name: 'Page header', itemSpacing: 24 });
layout.insertChild(0, header);
text(header, 'Taptop Blocks Library · Sections', FONT.mono, 22, GENTLE, { upper: true, letterSpacing: 6 });
text(header, P.title, FONT.s, 160, INK, { lineHeight: 168, letterSpacing: -2 });
text(header, P.subtitle, FONT.r, 32, GENTLE, { width: 1600, lineHeight: 44 });

const report = [];
for (const block of P.blocks) {
  const set = await figma.getNodeByIdAsync(block.setId);
  if (!set || set.type !== 'COMPONENT_SET') { report.push({ setId: block.setId, error: 'not a component set' }); continue; }
  const oldWrapper = set.parent && set.parent.type === 'FRAME' && /^(Block|Card) \//.test(set.parent.name) ? set.parent : null;

  const card = stack('VERTICAL', { name: `Card / ${block.name.replace(/^Section \/ /, '')}`, itemSpacing: 56, paddingTop: 80, paddingBottom: 80, paddingLeft: 80, paddingRight: 80, cornerRadius: 40 });
  card.fills = solid('#FFFFFF');
  card.strokes = solid(LINE);
  card.effects = [{ type: 'DROP_SHADOW', color: { r: 0.06, g: 0.07, b: 0.1, a: 0.06 }, offset: { x: 0, y: 8 }, radius: 32, spread: 0, visible: true, blendMode: 'NORMAL' }];
  layout.appendChild(card);

  const head = stack('HORIZONTAL', { name: 'Header', itemSpacing: 96 });
  card.appendChild(head);
  const titleColumn = stack('VERTICAL', { name: 'Title', itemSpacing: 20 });
  head.appendChild(titleColumn);
  text(titleColumn, `${block.key}${block.source ? ' · ' + block.source : ''}`, FONT.mono, 18, MUTED, { letterSpacing: 2, width: 880 });
  text(titleColumn, block.name.replace(/^Section \/ /, ''), FONT.s, 72, INK, { lineHeight: 80, letterSpacing: -1.5, width: 880 });
  const pills = stack('HORIZONTAL', { name: 'Pills', itemSpacing: 12 });
  titleColumn.appendChild(pills);
  pill(pills, block.status || 'Stable', STATUS[block.status] || STATUS.Stable);
  pill(pills, '4 breakpoints', ['#F2F3F5', '#3A3D45']);
  pill(pills, 'Bridge ↔ Figma', ['#F2F3F5', '#3A3D45']);

  const notes = stack('HORIZONTAL', { name: 'Notes', itemSpacing: 64 });
  head.appendChild(notes);
  noteColumn(notes, 'Когда применять', block.use || [], 620);
  if (block.avoid?.length) noteColumn(notes, 'Не применять', block.avoid, 520);
  if (block.content) noteColumn(notes, 'Контент', [block.content], 560);

  const captions = stack('HORIZONTAL', { name: 'Breakpoints', itemSpacing: 80, paddingLeft: 40 });
  card.appendChild(captions);
  for (const [width, label] of BREAKPOINTS) {
    const caption = stack('HORIZONTAL', { name: `${width}`, itemSpacing: 12, counterAxisAlignItems: 'CENTER' });
    captions.appendChild(caption);
    caption.resize(width, 32); caption.primaryAxisSizingMode = 'FIXED';
    text(caption, String(width), FONT.s, 24, INK);
    text(caption, label, FONT.r, 24, MUTED);
  }

  card.appendChild(set);
  set.fills = solid('#ECEEF3');
  set.cornerRadius = 24;
  set.strokes = [];
  if (oldWrapper && oldWrapper.children.length === 0 || oldWrapper && !oldWrapper.findOne(node => node.type === 'COMPONENT_SET')) oldWrapper.remove();
  report.push({ setId: set.id, card: card.id });
}
// Remove emptied category columns left on other pages.
return { page: page.id, layout: layout.id, report };
