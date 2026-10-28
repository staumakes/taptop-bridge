const crypto = require('node:crypto');
const path = require('node:path');

const LOGICAL_KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TAPTOP_MEDIA = new Set(['screen', '(max-width: 991px)', '(max-width: 767px)', '(max-width: 479px)']);
const SOURCE_ROLES = new Set(['manifest', 'html', 'stylesheet', 'behavior', 'asset']);
const NODE_KINDS = new Set(['container', 'text', 'link', 'link-block', 'button', 'image', 'inline-svg', 'rich-text']);

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\')) return false;
  if (path.posix.isAbsolute(value) || /^[A-Za-z]:\//.test(value)) return false;
  return !value.split('/').includes('..');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function validateHtmlCompilerManifest(manifest) {
  const errors = [];
  if (!isPlainObject(manifest)) return ['manifest must be an object'];
  const allowed = new Set(['schemaVersion', 'componentKey', 'html', 'rootSelector', 'stylesheets', 'selectorMappings', 'typographyCompositions', 'behaviorManifest', 'embedStylesheet', 'breakpointMap']);
  for (const key of Object.keys(manifest)) if (!allowed.has(key)) errors.push(`manifest has unknown field "${key}"`);
  if (manifest.schemaVersion !== 1) errors.push('manifest.schemaVersion must be 1');
  if (!LOGICAL_KEY.test(manifest.componentKey || '')) errors.push('manifest.componentKey must be a logical key');
  if (!isSafeRelativePath(manifest.html)) errors.push('manifest.html must be a safe relative POSIX path');
  if (typeof manifest.rootSelector !== 'string' || !manifest.rootSelector.trim()) errors.push('manifest.rootSelector must be non-empty');
  if (!Array.isArray(manifest.stylesheets)) errors.push('manifest.stylesheets must be an ordered array');
  else {
    const seen = new Set();
    manifest.stylesheets.forEach((item, index) => {
      if (!isSafeRelativePath(item)) errors.push(`manifest.stylesheets[${index}] must be a safe relative POSIX path`);
      if (seen.has(item)) errors.push(`manifest.stylesheets contains duplicate path "${item}"`);
      seen.add(item);
    });
  }
  if (manifest.behaviorManifest !== undefined && !isSafeRelativePath(manifest.behaviorManifest)) {
    errors.push('manifest.behaviorManifest must be a safe relative POSIX path');
  }
  if (manifest.embedStylesheet !== undefined && !isSafeRelativePath(manifest.embedStylesheet)) {
    errors.push('manifest.embedStylesheet must be a safe relative POSIX path');
  }
  if (manifest.selectorMappings !== undefined) {
    if (!Array.isArray(manifest.selectorMappings)) errors.push('manifest.selectorMappings must be an ordered array');
    else manifest.selectorMappings.forEach((mapping, index) => {
      if (!isPlainObject(mapping) || typeof mapping.sourceSelector !== 'string' || !mapping.sourceSelector.trim()) errors.push(`manifest.selectorMappings[${index}] needs sourceSelector`);
      if (!isPlainObject(mapping) || typeof mapping.targetClass !== 'string' || !mapping.targetClass.trim()) errors.push(`manifest.selectorMappings[${index}] needs targetClass`);
      if (!['main', 'design', 'cm', 'animation'].includes(mapping?.channel)) errors.push(`manifest.selectorMappings[${index}] has unsupported channel`);
      if (mapping?.pseudoSuffix !== undefined && typeof mapping.pseudoSuffix !== 'string') errors.push(`manifest.selectorMappings[${index}].pseudoSuffix must be a string`);
    });
  }
  if (manifest.typographyCompositions !== undefined) {
    if (!Array.isArray(manifest.typographyCompositions)) errors.push('manifest.typographyCompositions must be an ordered array');
    else {
      const sources = new Set();
      manifest.typographyCompositions.forEach((composition, index) => {
        if (!isPlainObject(composition) || typeof composition.sourceClass !== 'string' || !composition.sourceClass.trim()) {
          errors.push(`manifest.typographyCompositions[${index}] needs sourceClass`);
        } else if (sources.has(composition.sourceClass)) {
          errors.push(`manifest.typographyCompositions contains duplicate sourceClass "${composition.sourceClass}"`);
        } else sources.add(composition.sourceClass);
        if (!isPlainObject(composition) || typeof composition.tokenClass !== 'string' || !composition.tokenClass.trim()) {
          errors.push(`manifest.typographyCompositions[${index}] needs tokenClass`);
        }
        if (!isPlainObject(composition) || !Array.isArray(composition.omitProperties) || composition.omitProperties.some((property) => typeof property !== 'string' || !property.trim())) {
          errors.push(`manifest.typographyCompositions[${index}].omitProperties must be an array of non-empty property names`);
        } else if (new Set(composition.omitProperties).size !== composition.omitProperties.length) {
          errors.push(`manifest.typographyCompositions[${index}].omitProperties contains duplicates`);
        }
      });
    }
  }
  if (!isPlainObject(manifest.breakpointMap)) errors.push('manifest.breakpointMap must be an object');
  else for (const [source, target] of Object.entries(manifest.breakpointMap)) {
    if (!source.trim()) errors.push('manifest.breakpointMap cannot contain an empty source query');
    if (!TAPTOP_MEDIA.has(target)) errors.push(`manifest.breakpointMap[${JSON.stringify(source)}] has unsupported Taptop media ${JSON.stringify(target)}`);
  }
  return errors;
}

function computeSourceRevision({ manifest, sources }) {
  const manifestErrors = validateHtmlCompilerManifest(manifest);
  if (manifestErrors.length) throw new Error(`Cannot compute source revision:\n${manifestErrors.join('\n')}`);
  if (!Array.isArray(sources)) throw new Error('Cannot compute source revision: sources must be an array');
  const evidence = sources.map((source, index) => {
    const contentIsBytes = typeof source?.content === 'string' || Buffer.isBuffer(source?.content) || source?.content instanceof Uint8Array;
    if (!isPlainObject(source) || !SOURCE_ROLES.has(source.role) || !isSafeRelativePath(source.path) || !contentIsBytes) {
      throw new Error(`Cannot compute source revision: invalid source at index ${index}`);
    }
    return { role: source.role, path: source.path, sha256: crypto.createHash('sha256').update(source.content).digest('hex') };
  });
  const payload = JSON.stringify(canonical({ contract: 'html-ir/v1', manifest, sources: evidence }));
  return { revision: crypto.createHash('sha256').update(payload).digest('hex'), sources: evidence };
}

function validateBehaviorManifest(manifest) {
  const errors = [];
  if (!isPlainObject(manifest)) return ['behavior manifest must be an object'];
  if (manifest.schemaVersion !== 1) errors.push('behavior manifest schemaVersion must be 1');
  if (!Array.isArray(manifest.behaviors)) return [...errors, 'behavior manifest behaviors must be an array'];
  const keys = new Set();
  const nodeOwners = new Map();
  manifest.behaviors.forEach((behavior, index) => {
    if (!isPlainObject(behavior)) { errors.push(`behavior ${index} must be an object`); return; }
    if (!LOGICAL_KEY.test(behavior.key || '')) errors.push(`behavior ${index} has invalid key`);
    if (keys.has(behavior.key)) errors.push(`duplicate behavior key "${behavior.key}"`);
    keys.add(behavior.key);
    if (typeof behavior.adapter !== 'string' || !behavior.adapter) errors.push(`behavior ${index} needs adapter`);
    if (!Array.isArray(behavior.nodeKeys) || !behavior.nodeKeys.length) errors.push(`behavior ${index} needs nodeKeys`);
    else behavior.nodeKeys.forEach((nodeKey) => {
      if (!LOGICAL_KEY.test(nodeKey || '')) errors.push(`behavior ${index} has invalid node key`);
      if (nodeOwners.has(nodeKey)) errors.push(`node "${nodeKey}" belongs to multiple behaviors`);
      nodeOwners.set(nodeKey, behavior.key);
    });
  });
  return errors;
}

function validateHtmlIr(ir) {
  const errors = [];
  if (!isPlainObject(ir)) return ['IR must be an object'];
  if (ir.schemaVersion !== 1) errors.push('IR schemaVersion must be 1');
  if (!LOGICAL_KEY.test(ir.componentKey || '')) errors.push('IR componentKey must be a logical key');
  if (!SHA256.test(ir.sourceRevision || '')) errors.push('IR sourceRevision must be a lowercase SHA-256');
  if (!Array.isArray(ir.sources)) errors.push('IR sources must be an array');
  else {
    const seen = new Set();
    ir.sources.forEach((source, index) => {
      if (!SOURCE_ROLES.has(source?.role)) errors.push(`IR source ${index} has unsupported role`);
      if (!isSafeRelativePath(source?.path)) errors.push(`IR source ${index} has unsafe path`);
      if (!SHA256.test(source?.sha256 || '')) errors.push(`IR source ${index} has invalid SHA-256`);
      const identity = `${source?.role}\0${source?.path}`;
      if (seen.has(identity)) errors.push(`IR has duplicate source ${source?.role}:${source?.path}`);
      seen.add(identity);
    });
  }
  if (!LOGICAL_KEY.test(ir.rootKey || '')) errors.push('IR rootKey must be a logical key');
  if (!isPlainObject(ir.nodes)) return [...errors, 'IR nodes must be an object'];
  const behaviors = ir.behaviors === undefined ? {} : ir.behaviors;
  if (!isPlainObject(behaviors)) errors.push('IR behaviors must be an object');
  else for (const [key, behavior] of Object.entries(behaviors)) {
    if (behavior?.key !== key) errors.push(`IR behavior map key "${key}" does not match behavior.key`);
    if (typeof behavior?.adapter !== 'string' || !behavior.adapter) errors.push(`IR behavior "${key}" needs adapter`);
  }
  if (!ir.nodes[ir.rootKey]) errors.push(`IR rootKey "${ir.rootKey}" does not exist in nodes`);

  for (const [key, node] of Object.entries(ir.nodes)) {
    if (!isPlainObject(node)) { errors.push(`IR node "${key}" must be an object`); continue; }
    if (node.key !== key) errors.push(`IR node map key "${key}" does not match node.key "${node.key}"`);
    if (!LOGICAL_KEY.test(key)) errors.push(`IR node key "${key}" is invalid`);
    if (!NODE_KINDS.has(node.kind)) errors.push(`IR node "${key}" has unsupported kind "${node.kind}"`);
    if (!Array.isArray(node.classes) || !node.classes.length || node.classes.some((item) => typeof item !== 'string' || !item)) {
      errors.push(`IR node "${key}" needs at least one real class`);
    }
    if (!Array.isArray(node.children)) errors.push(`IR node "${key}" children must be an array`);
    else {
      if (new Set(node.children).size !== node.children.length) errors.push(`IR node "${key}" has duplicate child keys`);
      for (const child of node.children) if (!ir.nodes[child]) errors.push(`IR node "${key}" references missing child "${child}"`);
    }
    if (!isPlainObject(node.source) || !isSafeRelativePath(node.source.path) || !Number.isInteger(node.source.line) || node.source.line < 1 || !Number.isInteger(node.source.column) || node.source.column < 1 || !node.source.domPath) {
      errors.push(`IR node "${key}" has invalid source location`);
    }
    if (node.behaviorKey !== undefined && !behaviors[node.behaviorKey]) errors.push(`IR node "${key}" references missing behavior "${node.behaviorKey}"`);
  }

  if (ir.nodes[ir.rootKey]) {
    const reached = new Set();
    const active = new Set();
    const stack = [{ key: ir.rootKey, leave: false }];
    while (stack.length) {
      const frame = stack.pop();
      if (frame.leave) { active.delete(frame.key); continue; }
      if (active.has(frame.key)) { errors.push(`IR tree contains a cycle at "${frame.key}"`); continue; }
      if (reached.has(frame.key)) continue;
      reached.add(frame.key); active.add(frame.key); stack.push({ key: frame.key, leave: true });
      const children = ir.nodes[frame.key]?.children || [];
      for (let index = children.length - 1; index >= 0; index -= 1) stack.push({ key: children[index], leave: false });
    }
    for (const key of Object.keys(ir.nodes)) if (!reached.has(key)) errors.push(`IR node "${key}" is unreachable from root`);
  }
  if (!Array.isArray(ir.diagnostics)) errors.push('IR diagnostics must be an array');
  return errors;
}

module.exports = { validateHtmlCompilerManifest, validateBehaviorManifest, computeSourceRevision, validateHtmlIr, isSafeRelativePath };
