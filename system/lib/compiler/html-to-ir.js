const path = require('node:path');
const { computeSourceRevision, isSafeRelativePath, validateHtmlCompilerManifest, validateBehaviorManifest } = require('../html-ir-contract');

const CONTAINER_TAGS = new Set(['div', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'ul', 'ol', 'li']);
const TEXT_TAGS = new Set(['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'small', 'blockquote']);
const SERVICE_ATTRIBUTES = new Set(['class', 'data-taptop-key', 'data-taptop-kind']);

class HtmlIrCompileError extends Error {
  constructor(code, message, source) {
    super(`${code}: ${message}${source?.domPath ? ` at ${source.domPath}` : ''}`);
    this.name = 'HtmlIrCompileError';
    this.code = code;
    this.source = source;
  }
}

function attributesOf(element) {
  return Object.fromEntries((element.attrs || []).map(({ name, value }) => [name, value]));
}

function classNames(element) {
  return (attributesOf(element).class || '').split(/\s+/).filter(Boolean);
}

function elementChildren(element) {
  return (element.childNodes || []).filter((child) => child.tagName);
}

function directText(element) {
  return (element.childNodes || [])
    .filter((child) => child.nodeName === '#text')
    .map((child) => child.value)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function domSegment(element) {
  const classes = classNames(element);
  let result = element.tagName + classes.map((name) => `.${name}`).join('');
  const siblings = element.parentNode ? elementChildren(element.parentNode).filter((item) => item.tagName === element.tagName) : [];
  if (siblings.length > 1) result += `:nth-of-type(${siblings.indexOf(element) + 1})`;
  return result;
}

function domPath(element, root) {
  const segments = [];
  let cursor = element;
  while (cursor?.tagName) {
    segments.push(domSegment(cursor));
    if (cursor === root) break;
    cursor = cursor.parentNode;
  }
  return segments.reverse().join(' > ');
}

function sourceLocation(element, root, htmlPath) {
  const location = element.sourceCodeLocation?.startTag || element.sourceCodeLocation;
  return {
    path: htmlPath,
    line: location?.startLine || 1,
    column: location?.startCol || 1,
    domPath: domPath(element, root)
  };
}

function allElements(node) {
  const result = [];
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (current?.tagName) result.push(current);
    const children = current?.childNodes || [];
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
  }
  return result;
}

function matchesSimpleSelector(element, selector) {
  if (/^\.[_a-zA-Z-][_a-zA-Z0-9-]*$/.test(selector)) return classNames(element).includes(selector.slice(1));
  if (/^#[A-Za-z][-_:.A-Za-z0-9]*$/.test(selector)) return attributesOf(element).id === selector.slice(1);
  if (/^[a-z][a-z0-9-]*$/.test(selector)) return element.tagName === selector;
  throw new HtmlIrCompileError('UNSUPPORTED_ROOT_SELECTOR', `rootSelector ${JSON.stringify(selector)} is outside the v1 simple selector subset`);
}

function inferKind(element, source) {
  const attributes = attributesOf(element);
  const override = attributes['data-taptop-kind'];
  if (override) {
    if (!new Set(['container', 'text', 'link', 'link-block', 'button', 'image', 'inline-svg', 'rich-text']).has(override)) {
      throw new HtmlIrCompileError('UNSUPPORTED_NODE_KIND', `unsupported data-taptop-kind ${JSON.stringify(override)}`, source);
    }
    return override;
  }
  if (element.tagName === 'img') return 'image';
  // A link that wraps other elements (text + icon) becomes an editable Taptop link block.
  if (element.tagName === 'a') return elementChildren(element).length && !directText(element) ? 'link-block' : 'link';
  if (element.tagName === 'button') return 'button';
  if (element.tagName === 'svg') return 'inline-svg';
  if (TEXT_TAGS.has(element.tagName)) return 'text';
  if (CONTAINER_TAGS.has(element.tagName)) {
    if (!elementChildren(element).length && directText(element)) return 'text';
    return 'container';
  }
  throw new HtmlIrCompileError('UNSUPPORTED_HTML_TAG', `HTML tag <${element.tagName}> has no v1 adapter`, source);
}

function chooseNodeKey(element, classCounts, source) {
  const attributes = attributesOf(element);
  if (attributes['data-taptop-key']) return attributes['data-taptop-key'];
  if (attributes.id) return attributes.id;
  const uniqueClass = classNames(element).find((name) => classCounts.get(name) === 1);
  if (uniqueClass) return uniqueClass;
  throw new HtmlIrCompileError('AMBIGUOUS_NODE_KEY', 'node has no data-taptop-key, unique id, or unique class; positional identity is forbidden', source);
}

function portableAttributes(element) {
  const attributes = attributesOf(element);
  return Object.fromEntries(Object.entries(attributes).filter(([name]) => !SERVICE_ATTRIBUTES.has(name)));
}

async function parseHtmlToIr({
  manifest, htmlText, manifestText, manifestPath = 'taptop-bridge/compiler/manifest.json',
  stylesheetTexts = {}, assetContents = {}, assetDimensions = {}, behaviorManifest, behaviorText, embedText
}) {
  const manifestErrors = validateHtmlCompilerManifest(manifest);
  if (manifestErrors.length) throw new HtmlIrCompileError('INVALID_HTML_IR_MANIFEST', manifestErrors.join('; '));
  if (typeof htmlText !== 'string') throw new HtmlIrCompileError('INVALID_HTML_SOURCE', 'htmlText must be a string');
  const { parse, serialize, serializeOuter } = await import('parse5');
  const document = parse(htmlText, { sourceCodeLocationInfo: true });
  const matches = allElements(document).filter((element) => matchesSimpleSelector(element, manifest.rootSelector));
  if (matches.length !== 1) {
    throw new HtmlIrCompileError('ROOT_SELECTOR_CARDINALITY', `rootSelector ${JSON.stringify(manifest.rootSelector)} matched ${matches.length} elements; expected exactly 1`);
  }
  const root = matches[0];
  // The markup inside an SVG icon or a rich-text block is content, not layers.
  const isLeafLayer = element => element.tagName === 'svg' || attributesOf(element)['data-taptop-kind'] === 'rich-text';
  const elements = [];
  const collect = element => { elements.push(element); if (!isLeafLayer(element)) for (const child of elementChildren(element)) collect(child); };
  collect(root);
  const classCounts = new Map();
  for (const element of elements) for (const className of classNames(element)) classCounts.set(className, (classCounts.get(className) || 0) + 1);

  const keyed = new Map();
  const elementKeys = new Map();
  for (const element of elements) {
    const source = sourceLocation(element, root, manifest.html);
    const classes = classNames(element);
    if (!classes.length) throw new HtmlIrCompileError('NODE_CLASS_REQUIRED', 'every exported element needs at least one real design class', source);
    const key = chooseNodeKey(element, classCounts, source);
    if (keyed.has(key)) throw new HtmlIrCompileError('DUPLICATE_NODE_KEY', `logical node key ${JSON.stringify(key)} is used more than once`, source);
    keyed.set(key, element);
    elementKeys.set(element, key);
  }

  let behaviors = {};
  const behaviorByNode = new Map();
  if (manifest.behaviorManifest) {
    const behaviorErrors = validateBehaviorManifest(behaviorManifest);
    if (behaviorErrors.length) throw new HtmlIrCompileError('INVALID_BEHAVIOR_MANIFEST', behaviorErrors.join('; '));
    behaviors = Object.fromEntries(behaviorManifest.behaviors.map((behavior) => [behavior.key, { ...behavior, config: behavior.config || {} }]));
    for (const behavior of behaviorManifest.behaviors) for (const nodeKey of behavior.nodeKeys) {
      if (!keyed.has(nodeKey)) throw new HtmlIrCompileError('UNKNOWN_BEHAVIOR_NODE', `behavior ${JSON.stringify(behavior.key)} references missing node ${JSON.stringify(nodeKey)}`);
      behaviorByNode.set(nodeKey, behavior.key);
    }
  }

  const nodes = {};
  for (const [key, element] of keyed) {
    const source = sourceLocation(element, root, manifest.html);
    const kind = inferKind(element, source);
    const leaf = kind === 'rich-text' || kind === 'inline-svg';
    const childElements = leaf ? [] : elementChildren(element);
    const text = leaf ? '' : directText(element);
    if (text && childElements.length) {
      throw new HtmlIrCompileError('MIXED_HTML_CONTENT', 'visible direct text mixed with child elements needs an explicit adapter', source);
    }
    if (['text', 'link', 'button'].includes(kind) && childElements.length) {
      throw new HtmlIrCompileError('NESTED_INLINE_CONTENT', `${kind} with nested elements needs an explicit adapter`, source);
    }
    const node = {
      key, kind, tagName: element.tagName, classes: classNames(element), attributes: portableAttributes(element),
      children: childElements.map((child) => elementKeys.get(child)), source
    };
    const behavioralAttributes = Object.keys(attributesOf(element)).filter((name) => name.startsWith('data-') && !SERVICE_ATTRIBUTES.has(name));
    const behaviorKey = behaviorByNode.get(key);
    if (behavioralAttributes.length && !behaviorKey) {
      throw new HtmlIrCompileError('UNDECLARED_BEHAVIOR', `behavioral attributes ${behavioralAttributes.join(', ')} are not covered by a behavior manifest`, source);
    }
    if (behaviorKey) node.behaviorKey = behaviorKey;
    if (['text', 'link', 'button'].includes(kind)) node.text = text;
    if (kind === 'rich-text') node.html = serialize(element);
    if (kind === 'inline-svg') {
      const markup = { ...element, attrs: (element.attrs || []).filter(({ name }) => !SERVICE_ATTRIBUTES.has(name)) };
      node.html = serializeOuter(markup);
    }
    if (kind === 'image') {
      const attrs = attributesOf(element);
      if (!attrs.src || !isSafeRelativePath(attrs.src)) throw new HtmlIrCompileError('IMAGE_ASSET_PATH_REQUIRED', 'image src must be a portable relative path', source);
      // Without width/height attributes the file's own size is the intrinsic size.
      const intrinsic = assetDimensions[path.posix.normalize(path.posix.join(path.posix.dirname(manifest.html), attrs.src))] || {};
      const width = Number(attrs.width) || intrinsic.width;
      const height = Number(attrs.height) || intrinsic.height;
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        throw new HtmlIrCompileError('IMAGE_INTRINSIC_SIZE_REQUIRED', 'image needs positive width and height attributes', source);
      }
      const assetSourcePath = path.posix.normalize(path.posix.join(path.posix.dirname(manifest.html), attrs.src));
      node.asset = { path: attrs.src, sourcePath: assetSourcePath, alt: attrs.alt || '', intrinsicWidth: width, intrinsicHeight: height };
    }
    nodes[key] = node;
  }

  const evidenceSources = [
    { role: 'manifest', path: manifestPath, content: typeof manifestText === 'string' ? manifestText : JSON.stringify(manifest) },
    { role: 'html', path: manifest.html, content: htmlText }
  ];
  for (const stylesheetPath of manifest.stylesheets) {
    if (typeof stylesheetTexts[stylesheetPath] !== 'string') {
      throw new HtmlIrCompileError('MISSING_SOURCE_EVIDENCE', `stylesheet bytes were not supplied for ${JSON.stringify(stylesheetPath)}`);
    }
    evidenceSources.push({ role: 'stylesheet', path: stylesheetPath, content: stylesheetTexts[stylesheetPath] });
  }
  // The embed stylesheet ships in the package too: a change there is a new revision.
  if (manifest.embedStylesheet && typeof embedText === 'string') evidenceSources.push({ role: 'stylesheet', path: manifest.embedStylesheet, content: embedText });
  if (manifest.behaviorManifest) {
    if (typeof behaviorText !== 'string') throw new HtmlIrCompileError('MISSING_SOURCE_EVIDENCE', `behavior bytes were not supplied for ${JSON.stringify(manifest.behaviorManifest)}`);
    evidenceSources.push({ role: 'behavior', path: manifest.behaviorManifest, content: behaviorText });
  }
  const assetPaths = [...new Set(Object.values(nodes).map((node) => node.asset?.sourcePath).filter(Boolean))].sort();
  for (const assetPath of assetPaths) {
    const content = assetContents[assetPath];
    if (!(typeof content === 'string' || Buffer.isBuffer(content) || content instanceof Uint8Array)) {
      throw new HtmlIrCompileError('MISSING_SOURCE_EVIDENCE', `asset bytes were not supplied for ${JSON.stringify(assetPath)}`);
    }
    evidenceSources.push({ role: 'asset', path: assetPath, content });
  }
  const evidence = computeSourceRevision({ manifest, sources: evidenceSources });
  return {
    schemaVersion: 1, componentKey: manifest.componentKey, sourceRevision: evidence.revision,
    sources: evidence.sources, rootKey: elementKeys.get(root), nodes, behaviors, diagnostics: []
  };
}

module.exports = { parseHtmlToIr, HtmlIrCompileError };
