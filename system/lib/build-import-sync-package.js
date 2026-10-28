const crypto = require('node:crypto');
const { validateImportPackage } = require('./import-sync-contract');

const LOGICAL_KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const CHANNELS = new Set(['main', 'design', 'cm', 'animation']);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key]);
    return result;
  }
  return value;
}

function revisionFor(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function decodePath(path) {
  let parts;
  try { parts = JSON.parse(path); } catch { throw new TypeError(`Invalid owned rule path: ${path}`); }
  if (!Array.isArray(parts) || parts.length !== 4 || parts.some(part => typeof part !== 'string' || !part)) {
    throw new TypeError(`Invalid owned rule path: ${path}`);
  }
  const [channel, media, selectorText, property] = parts;
  if (!CHANNELS.has(channel)) throw new TypeError(`Invalid selector channel in path: ${path}`);
  return { channel, media, selectorText, property };
}

function assertManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1) throw new TypeError('Identity manifest schemaVersion must equal 1');
  for (const key of ['namespace', 'componentKey']) {
    if (!LOGICAL_KEY.test(manifest[key] || '')) throw new TypeError(`Invalid manifest ${key}`);
  }
  if (!Array.isArray(manifest.classes) || !Array.isArray(manifest.instances)) throw new TypeError('Manifest classes and instances are required');
  const stableKeys = new Set();
  for (const item of manifest.classes) {
    if (!LOGICAL_KEY.test(item?.stableKey || '') || stableKeys.has(item.stableKey)) throw new TypeError('Class stableKey values must be valid and unique');
    stableKeys.add(item.stableKey);
    if (typeof item.name !== 'string' || !item.name || !['main', 'design'].includes(item.collection)) throw new TypeError(`Invalid class identity ${item.stableKey}`);
    if (!Array.isArray(item.ownedPaths)) throw new TypeError(`Class ${item.stableKey} needs ownedPaths`);
    for (const owned of item.ownedPaths) {
      if (!owned || typeof owned.required !== 'boolean') throw new TypeError(`Invalid path ownership for ${item.stableKey}`);
      decodePath(owned.path);
    }
  }
}

function findSourceClass(layout, identity) {
  const collection = layout?.[`${identity.collection}ClassNameCollection`]?.map || {};
  const matches = Object.values(collection).filter(item => item?.value === identity.name);
  if (matches.length !== 1) throw new Error(`Expected exactly one source class ${identity.collection}/${identity.name}`);
  return matches[0];
}

function readRule(layout, decoded) {
  const selector = layout?.[`${decoded.channel}SelectorCollection`]?.map?.[`${decoded.media}/${decoded.selectorText}`];
  if (!selector || selector.media !== decoded.media || selector.selectorText !== decoded.selectorText) return undefined;
  return selector.rules?.[decoded.property];
}

function setOwnedRule(ownedRules, decoded, value) {
  const scope = `${decoded.media}/${decoded.selectorText}`;
  ownedRules[decoded.channel] ||= {};
  ownedRules[decoded.channel][scope] ||= {};
  ownedRules[decoded.channel][scope][decoded.property] = clone(value);
}

function buildImportSyncPackage(clipboardData, manifest, options = {}) {
  assertManifest(manifest);
  const layout = clipboardData?.copiedLayout;
  if (!layout) throw new TypeError('clipboardData.copiedLayout is required');
  const allOwnedPaths = new Set();
  if (options.logicalNodeKeys !== undefined) {
    const logicalNodeKeys = new Set(options.logicalNodeKeys);
    for (const instance of manifest.instances) {
      if (!logicalNodeKeys.has(instance.rootLogicalNodeKey)) {
        throw new Error(`Instance rootLogicalNodeKey "${instance.rootLogicalNodeKey}" does not exist in compiler IR node keys`);
      }
    }
  }

  const classes = [...manifest.classes]
    .sort((a, b) => a.stableKey.localeCompare(b.stableKey))
    .map(identity => {
      findSourceClass(layout, identity);
      const ownedRules = {};
      const localPaths = new Set();
      for (const owned of identity.ownedPaths) {
        if (localPaths.has(owned.path) || allOwnedPaths.has(owned.path)) {
          throw new Error(`Rule path is owned by more than one class: ${owned.path}`);
        }
        localPaths.add(owned.path);
        allOwnedPaths.add(owned.path);
        const decoded = decodePath(owned.path);
        const value = readRule(layout, decoded);
        if (value === undefined) {
          if (owned.required) throw new Error(`Required owned rule is missing: ${owned.path}`);
          continue;
        }
        setOwnedRule(ownedRules, decoded, value);
      }
      return { stableKey: identity.stableKey, name: identity.name, collection: identity.collection, ownedRules };
    });

  const content = {
    schemaVersion: 1,
    namespace: manifest.namespace,
    componentKey: manifest.componentKey,
    classes,
    instances: clone(manifest.instances)
  };
  if (options.sourceRevision !== undefined) content.sourceRevision = options.sourceRevision;
  const result = { ...content, revision: revisionFor(content) };
  const errors = validateImportPackage(result);
  if (errors.length) throw new Error(`Built import package is invalid: ${errors.join('; ')}`);
  return result;
}

module.exports = { buildImportSyncPackage, decodePath, revisionFor };
