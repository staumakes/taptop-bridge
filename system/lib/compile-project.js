const fs = require('node:fs');
const path = require('node:path');
const { parseHtmlToIr } = require('./compiler/html-to-ir');
const { compileIrToTaptop } = require('./compiler/ir-to-taptop');
const { validateHtmlCompilerManifest } = require('./html-ir-contract');
const { buildCompilerIdentityManifest, selectorUsesClass } = require('./build-compiler-identity-manifest');
const { buildImportSyncPackage } = require('./build-import-sync-package');
const { preflightImportPackage } = require('./import-package-preflight');
const { inside, readProjectFile, loadProject } = require('./project');
const { embeddedAssetRecords, readLocalAsset } = require('./asset-package');
const { buildEmbedBehaviorPackage } = require('./behavior-package');
const embedFixture = require('../contracts/behaviors/fixtures/tt-embed-v1.json');
const postcss = require('postcss');

// Taptop refuses to save an Embed whose code is longer than 50 000 characters
// ("DE_ERROR_NOTIFICATION_EMBED_LIMIT_EXCEEDED", live 2026-10-12): the page
// stays unsaved. Embed CSS is split at top-level rules into parts below that.
const EMBED_CODE_LIMIT = 50000;
const EMBED_PART_BUDGET = 45000;
function splitEmbedCss(cssText) {
  const parts = [];
  let current = '';
  for (const node of postcss.parse(cssText).nodes) {
    const text = node.toString().trim();
    if (!text) continue;
    if (text.length > EMBED_PART_BUDGET) throw new Error(`EMBED_RULE_TOO_LARGE: one embed rule is ${text.length} characters; Taptop keeps at most ${EMBED_CODE_LIMIT} per Embed`);
    if (current && current.length + text.length + 1 > EMBED_PART_BUDGET) { parts.push(current); current = ''; }
    current += `${current ? '\n' : ''}${text}`;
  }
  if (current) parts.push(current);
  return parts;
}

// CSS that Taptop classes cannot express (relational selectors, pseudo-elements,
// non-Bridge media) ships as one hidden Embed with a <style> block. It applies
// on the published page only.
function buildStylesPackages(manifest, cssText) {
  if (/<\/?\s*(style|script)/i.test(cssText)) throw new Error('EMBED_STYLESHEET_UNSAFE: the embed stylesheet must contain CSS only');
  return splitEmbedCss(cssText).map((part, index) => buildEmbedBehaviorPackage({
    fixture: embedFixture,
    key: `${manifest.componentKey}/styles${index ? `-part${String.fromCharCode(97 + index)}` : ''}`,
    adapter: 'taptop/embed-styles-v1',
    name: `styles-${manifest.componentKey.replace(/[^A-Za-z0-9_-]+/g, '-')}${index ? `-part${String.fromCharCode(97 + index)}` : ''}`,
    embedCode: `<style>\n${index ? '' : '.toolkit-behavior { display: none; }\n'}${part}\n</style>`
  }));
}

// `projectClassKeys` (managed builds) gives each class one project-owned stable
// key, shared by the UI kit, components and pages. Legacy calls keep keys under
// the component key so earlier packages and receipts keep their meaning.
async function compileProject(root, manifestPath, destination, { projectClassKeys = false } = {}) {
  const config = loadProject(root);
  const parent = fs.realpathSync(path.dirname(destination));
  const realRoot = fs.realpathSync(root);
  if (!inside(realRoot, parent)) throw new Error('OUTSIDE_PROJECT: output must stay in project');
  if (fs.existsSync(destination)) throw new Error('OUTPUT_EXISTS: choose a new filename');
  const manifestText = readProjectFile(root, manifestPath);
  const manifest = JSON.parse(manifestText);
  const errors = validateHtmlCompilerManifest(manifest);
  if (errors.length) throw new Error(errors.join('\n'));
  const htmlText = readProjectFile(root, manifest.html);
  // Full-document check prevents a script outside the selected root being lost silently.
  const { parse } = await import('parse5');
  const document = parse(htmlText);
  const assetInputs = new Map();
  const stack = [document];
  while (stack.length) {
    const node = stack.pop();
    if (['script', 'iframe', 'form', 'input', 'select', 'textarea', 'video', 'audio', 'canvas'].includes(node.tagName)) throw new Error(`UNSUPPORTED_HTML: ${node.tagName}`);
    if (node.tagName === 'style') throw new Error('INLINE_CSS: move styles into manifest stylesheets');
    const attributesByTag = { svg: (node.attrs || []).map(item => item.name), html: ['lang'], meta: ['charset', 'name', 'content'], link: ['rel', 'href'], a: ['href'], button: ['type'], img: ['src', 'width', 'height', 'alt'] };
    const allowedAttributes = new Set(['class', 'data-taptop-key', 'data-taptop-kind', 'data-taptop-behavior', ...(attributesByTag[node.tagName] || [])]);
    for (const attr of node.attrs || []) {
      if (!allowedAttributes.has(attr.name)) throw new Error(`UNSUPPORTED_ATTRIBUTE: ${attr.name}`);
    }
    // An SVG icon and a rich-text block carry their inner markup as content.
    if (node.tagName === 'svg' || (node.attrs || []).some(item => item.name === 'data-taptop-kind' && item.value === 'rich-text')) continue;
    if (node.tagName === 'img') {
      const attributes = Object.fromEntries((node.attrs || []).map(item => [item.name, item.value]));
      if (!attributes.src) throw new Error('IMAGE_ASSET_PATH_REQUIRED');
      const sourcePath = path.posix.normalize(path.posix.join(path.posix.dirname(manifest.html), attributes.src));
      if (!assetInputs.has(sourcePath)) assetInputs.set(sourcePath, readLocalAsset(root, sourcePath));
    }
    stack.push(...node.childNodes || []);
  }
  const stylesheetTexts = Object.fromEntries(manifest.stylesheets.map(file => [file, readProjectFile(root, file)]));
  const postcss = require('postcss');
  const explicitSelectors = new Set((manifest.selectorMappings || []).map(item => item.sourceSelector));
  for (const [file, css] of Object.entries(stylesheetTexts)) {
    const ast = postcss.parse(css, { from: file });
    ast.walkAtRules(rule => {
      if (rule.name !== 'media' || !Object.hasOwn(manifest.breakpointMap, rule.params) || rule.parent.type !== 'root') throw new Error(`UNSUPPORTED_CSS_AT_RULE: @${rule.name} ${rule.params}`);
    });
    ast.walkRules(rule => {
      if (rule.selector.includes(',') || (!/^\.[_a-zA-Z-][_a-zA-Z0-9-]*$/.test(rule.selector) && !explicitSelectors.has(rule.selector))) throw new Error(`UNSUPPORTED_CSS_SELECTOR: ${rule.selector}`);
      if (rule.parent.type === 'rule') throw new Error('UNSUPPORTED_CSS_NESTING');
    });
    ast.walkDecls(decl => {
      if (decl.important || decl.prop.startsWith('--') || /\b(?:url|var)\(/i.test(decl.value)) throw new Error(`UNSUPPORTED_CSS_VALUE: ${decl.prop}`);
    });
  }
  const behaviorText = manifest.behaviorManifest ? readProjectFile(root, manifest.behaviorManifest) : undefined;
  const assetInputList = [...assetInputs.values()];
  const embeddedAssets = embeddedAssetRecords(assetInputList);
  const assetKeys = Object.fromEntries([...assetInputs.entries()].map(([sourcePath, asset]) => [sourcePath, asset.stableKey]));
  const assetContents = Object.fromEntries([...assetInputs.entries()].map(([sourcePath, asset]) => [sourcePath, asset.bytes]));
  const assetDimensions = Object.fromEntries([...assetInputs.entries()].map(([sourcePath, asset]) => [sourcePath, { width: asset.width, height: asset.height }]));
  const embedText = manifest.embedStylesheet ? readProjectFile(root, manifest.embedStylesheet) : undefined;
  const ir = await parseHtmlToIr({ manifest, manifestText, manifestPath, htmlText, stylesheetTexts, assetContents, assetDimensions, behaviorText, embedText, behaviorManifest: behaviorText ? JSON.parse(behaviorText) : undefined });
  const { clipboardData, behaviorPackages } = compileIrToTaptop({ ir, manifest, stylesheetTexts, assetKeys });
  if (manifest.embedStylesheet) {
    const embedCss = readProjectFile(root, manifest.embedStylesheet);
    if (embedCss.trim()) behaviorPackages.unshift(...buildStylesPackages(manifest, embedCss));
  }
  const names = new Set(Object.values(ir.nodes).flatMap(node => node.classes));
  for (const item of manifest.typographyCompositions || []) names.add(item.tokenClass);
  for (const item of Object.values(clipboardData.copiedLayout.designClassNameCollection.map)) names.add(item.value);
  // A structural class may have no rules after typography composition. It stays
  // on the node but owns no styles, so it must not become a managed style entry.
  const selectorEntries = ['main', 'design', 'cm', 'animation'].flatMap(channel => Object.values(clipboardData.copiedLayout[`${channel}SelectorCollection`].map));
  for (const name of names) {
    if (!selectorEntries.some(entry => selectorUsesClass(entry.selectorText, name) && Object.keys(entry.rules).length)) names.delete(name);
  }
  const classKeyPrefix = projectClassKeys ? `${config.namespace}/class/` : `${manifest.componentKey}/class/`;
  const stableKeysByClass = Object.fromEntries([...names].sort().map(name => [name, `${classKeyPrefix}${name}`]));
  const identity = buildCompilerIdentityManifest({ clipboardData, namespace: config.namespace, componentKey: manifest.componentKey, stableKeysByClass, instance: { stableKey: `${manifest.componentKey}/instance`, rootLogicalNodeKey: ir.rootKey } });
  const wrapper = { type: 'taptop-enhancer-layer-export', version: 2, exportedAt: new Date().toISOString(), sourceUrl: '', layerName: manifest.componentKey, sourceRevision: ir.sourceRevision, clipboardData, syncPackage: buildImportSyncPackage(clipboardData, identity, { logicalNodeKeys: Object.keys(ir.nodes), sourceRevision: ir.sourceRevision }), embeddedAssets };
  if (behaviorPackages.length) wrapper.behaviorPackages = behaviorPackages;
  const preflight = preflightImportPackage(wrapper);
  if (!preflight.ok) {
    throw new Error(`PREFLIGHT_FAILED: ${preflight.errors.join('; ')}`);
  }
  fs.writeFileSync(destination, JSON.stringify(wrapper, null, 2) + '\n', { flag: 'wx' });
  return { nodes: Object.keys(ir.nodes).length, classes: identity.classes.length, sourceRevision: ir.sourceRevision };
}
module.exports = { compileProject, splitEmbedCss, EMBED_CODE_LIMIT };
