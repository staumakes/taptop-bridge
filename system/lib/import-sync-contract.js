const HEX_256 = /^[a-f0-9]{64}$/i;
const LOGICAL_KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const TARGET_KEY = /^[A-Za-z0-9._:-]+$/;
const RESERVED_SYNC_CLASS_NAMES = new Set(['body', 'html', 'root']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function duplicateValues(items, field) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    const value = item?.[field];
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function validateIdentity(value, label, errors) {
  if (typeof value !== 'string' || !LOGICAL_KEY.test(value)) errors.push(`${label} must be a stable logical key`);
}

function isRulePath(value) {
  if (typeof value !== 'string') return false;
  try {
    const parts = JSON.parse(value);
    return Array.isArray(parts) && parts.length === 4
      && ['main', 'design', 'cm', 'animation'].includes(parts[0])
      && parts.every(part => typeof part === 'string' && part.length > 0);
  } catch {
    return false;
  }
}

function validateImportPackage(value) {
  const errors = [];
  if (!isRecord(value)) return ['Package must be an object'];
  if (value.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  validateIdentity(value.namespace, 'namespace', errors);
  validateIdentity(value.componentKey, 'componentKey', errors);
  if (typeof value.revision !== 'string' || !HEX_256.test(value.revision)) errors.push('revision must be a SHA-256 hex string');
  if (value.sourceRevision !== undefined && (typeof value.sourceRevision !== 'string' || !HEX_256.test(value.sourceRevision))) errors.push('sourceRevision must be a SHA-256 hex string');
  if (!Array.isArray(value.classes)) errors.push('classes must be an array');
  else {
    for (const item of value.classes) {
      if (!isRecord(item)) { errors.push('Every class must be an object'); continue; }
      validateIdentity(item.stableKey, 'class stableKey', errors);
      if (typeof item.name !== 'string' || !item.name) errors.push(`Class ${item.stableKey || '?'} needs a name`);
      else if (RESERVED_SYNC_CLASS_NAMES.has(item.name.toLowerCase())) errors.push(`RESERVED_SYNC_CLASS_NAME: .${item.name} is reserved and cannot be managed by an import package`);
      if (!['main', 'design'].includes(item.collection)) errors.push(`Class ${item.stableKey || '?'} has invalid collection`);
      if (!isRecord(item.ownedRules)) errors.push(`Class ${item.stableKey || '?'} ownedRules must be an object`);
      else for (const [channel, scopes] of Object.entries(item.ownedRules)) {
        if (!['main', 'design', 'cm', 'animation'].includes(channel) || !isRecord(scopes)) {
          errors.push(`Class ${item.stableKey || '?'} has invalid selector channel`);
          continue;
        }
        for (const [scope, rules] of Object.entries(scopes)) {
          if (!scope.includes('/') || !isRecord(rules)) errors.push(`Class ${item.stableKey || '?'} has invalid owned rule scope`);
        }
      }
    }
    if (duplicateValues(value.classes, 'stableKey').length) errors.push('Duplicate class stableKey');
  }
  if (!Array.isArray(value.instances)) errors.push('instances must be an array');
  else {
    for (const item of value.instances) {
      validateIdentity(item?.stableKey, 'instance stableKey', errors);
      validateIdentity(item?.rootLogicalNodeKey, 'rootLogicalNodeKey', errors);
    }
    if (duplicateValues(value.instances, 'stableKey').length) errors.push('Duplicate instance stableKey');
  }
  if (value.assets !== undefined) errors.push('syncPackage.assets is retired; use wrapper.embeddedAssets');
  return errors;
}

function validateImportReceipt(value) {
  const errors = [];
  if (!isRecord(value)) return ['Receipt must be an object'];
  if (value.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  if (typeof value.targetKey !== 'string' || !TARGET_KEY.test(value.targetKey)) errors.push('targetKey must be a non-secret local identifier');
  validateIdentity(value.namespace, 'namespace', errors);
  validateIdentity(value.componentKey, 'componentKey', errors);
  if (typeof value.packageRevision !== 'string' || !HEX_256.test(value.packageRevision)) errors.push('packageRevision must be a SHA-256 hex string');
  if (!Array.isArray(value.classBindings)) errors.push('classBindings must be an array');
  else {
    for (const binding of value.classBindings) {
      validateIdentity(binding?.stableKey, 'class binding stableKey', errors);
      if (typeof binding?.targetClassId !== 'string' || !binding.targetClassId) errors.push(`Class binding ${binding?.stableKey || '?'} needs targetClassId`);
      if (!['main', 'design'].includes(binding?.collection)) errors.push(`Class binding ${binding?.stableKey || '?'} has invalid collection`);
      if (!Array.isArray(binding?.ownedPaths) || binding.ownedPaths.some(path => typeof path !== 'string' || !path)) {
        errors.push(`Class binding ${binding?.stableKey || '?'} ownedPaths are invalid`);
      } else if (new Set(binding.ownedPaths).size !== binding.ownedPaths.length) {
        errors.push(`Class binding ${binding?.stableKey || '?'} has duplicate ownedPaths`);
      }
      if (Array.isArray(binding?.ownedPaths) && binding.ownedPaths.some(path => !isRulePath(path))) {
        errors.push(`Class binding ${binding?.stableKey || '?'} has invalid structured rule path`);
      }
      if (!isRecord(binding?.baseline)) errors.push(`Class binding ${binding?.stableKey || '?'} baseline must be an object`);
      else {
        const owned = new Set(binding.ownedPaths || []);
        if (Object.keys(binding.baseline).some(path => !owned.has(path))) {
          errors.push(`Class binding ${binding?.stableKey || '?'} baseline contains a path outside ownedPaths`);
        }
      }
    }
    if (duplicateValues(value.classBindings, 'stableKey').length) errors.push('Duplicate class binding stableKey');
  }
  if (!Array.isArray(value.instanceBindings)) errors.push('instanceBindings must be an array');
  else {
    for (const binding of value.instanceBindings) {
      validateIdentity(binding?.stableKey, 'instance binding stableKey', errors);
      if (typeof binding?.targetTagId !== 'string' || !binding.targetTagId) errors.push(`Instance binding ${binding?.stableKey || '?'} needs targetTagId`);
    }
    if (duplicateValues(value.instanceBindings, 'stableKey').length) errors.push('Duplicate instance binding stableKey');
  }
  return errors;
}

module.exports = { RESERVED_SYNC_CLASS_NAMES, isRulePath, validateImportPackage, validateImportReceipt };
