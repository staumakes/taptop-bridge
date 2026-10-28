const ADAPTER_ID = /^[a-z0-9][a-z0-9._/-]*$/;
const CATEGORIES = new Set(['accordion', 'animation', 'cms', 'form', 'menu', 'slider', 'tabs', 'video']);
const STATUSES = new Set(['research-required', 'source-observed', 'locally-reproduced', 'editor-verified']);
const EVIDENCE_GATES = ['nativeFixture', 'contract', 'serializerAdapter', 'editorRoundtrip'];

function isSafeReference(value) {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateBehaviorAdapterRegistry(registry) {
  const errors = [];
  if (!isPlainObject(registry)) return ['behavior adapter registry must be an object'];
  const allowedRoot = new Set(['schemaVersion', 'adapters']);
  for (const key of Object.keys(registry)) if (!allowedRoot.has(key)) errors.push(`registry has unsupported property ${JSON.stringify(key)}`);
  if (registry.schemaVersion !== 1) errors.push('behavior adapter registry schemaVersion must be 1');
  if (!Array.isArray(registry.adapters)) return [...errors, 'behavior adapter registry adapters must be an array'];

  const ids = new Set();
  registry.adapters.forEach((adapter, index) => {
    const label = `adapter ${index}`;
    if (!isPlainObject(adapter)) { errors.push(`${label} must be an object`); return; }
    const allowedAdapter = new Set(['id', 'category', 'status', 'blockerReason', 'observations', 'evidence']);
    for (const key of Object.keys(adapter)) if (!allowedAdapter.has(key)) errors.push(`${label} has unsupported property ${JSON.stringify(key)}`);
    if (!ADAPTER_ID.test(adapter.id || '')) errors.push(`${label} has invalid id`);
    if (ids.has(adapter.id)) errors.push(`duplicate adapter id ${JSON.stringify(adapter.id)}`);
    ids.add(adapter.id);
    if (!CATEGORIES.has(adapter.category)) errors.push(`${label} has unsupported category ${JSON.stringify(adapter.category)}`);
    if (!STATUSES.has(adapter.status)) errors.push(`${label} has unsupported status ${JSON.stringify(adapter.status)}`);
    if (typeof adapter.blockerReason !== 'string' || !adapter.blockerReason.trim()) errors.push(`${label} needs blockerReason`);
    if (!Array.isArray(adapter.observations) || adapter.observations.some((item) => !isSafeReference(item))) {
      errors.push(`${label} observations must be safe relative references`);
    } else {
      if (new Set(adapter.observations).size !== adapter.observations.length) errors.push(`${label} has duplicate observations`);
      if (adapter.status !== 'research-required' && !adapter.observations.length) errors.push(`${label} status ${adapter.status} needs an observation reference`);
    }
    if (!isPlainObject(adapter.evidence)) {
      errors.push(`${label} evidence must be an object`);
      return;
    }
    const evidenceKeys = Object.keys(adapter.evidence);
    for (const key of evidenceKeys) if (!EVIDENCE_GATES.includes(key)) errors.push(`${label} evidence has unsupported property ${JSON.stringify(key)}`);
    const missing = EVIDENCE_GATES.filter((gate) => typeof adapter.evidence[gate] !== 'string' || !adapter.evidence[gate].trim());
    for (const gate of EVIDENCE_GATES) {
      const value = adapter.evidence[gate];
      if (value !== null && (typeof value !== 'string' || !value.trim())) errors.push(`${label} evidence.${gate} must be null or a non-empty reference`);
    }
    if (adapter.status === 'editor-verified' && missing.length) {
      errors.push(`${label} cannot be editor-verified without all evidence gates: ${missing.join(', ')}`);
    }
  });
  return errors;
}

function assessBehaviorCoverage(behaviors, registry) {
  const registryErrors = validateBehaviorAdapterRegistry(registry);
  if (registryErrors.length) {
    const error = new Error(`INVALID_BEHAVIOR_ADAPTER_REGISTRY: ${registryErrors.join('; ')}`);
    error.code = 'INVALID_BEHAVIOR_ADAPTER_REGISTRY';
    throw error;
  }
  const byId = new Map(registry.adapters.map((adapter) => [adapter.id, adapter]));
  const ready = [];
  const blockers = [];
  for (const behavior of Object.values(behaviors || {})) {
    const entry = byId.get(behavior.adapter);
    if (!entry) {
      blockers.push({
        code: 'UNKNOWN_BEHAVIOR_ADAPTER', behaviorKey: behavior.key, adapter: behavior.adapter,
        reason: 'adapter ID is absent from contracts/behaviors/adapter-registry.json', missingEvidence: []
      });
      continue;
    }
    const missingEvidence = EVIDENCE_GATES.filter((gate) => typeof entry.evidence[gate] !== 'string' || !entry.evidence[gate].trim());
    const compilerReady = entry.status === 'locally-reproduced' || entry.status === 'editor-verified';
    const compilerEvidence = EVIDENCE_GATES.filter((gate) => gate !== 'editorRoundtrip');
    const missingCompilerEvidence = compilerEvidence.filter((gate) => typeof entry.evidence[gate] !== 'string' || !entry.evidence[gate].trim());
    if (!compilerReady || missingCompilerEvidence.length) {
      blockers.push({
        code: 'UNSUPPORTED_BEHAVIOR_ADAPTER', behaviorKey: behavior.key, adapter: behavior.adapter,
        status: entry.status, reason: entry.blockerReason, missingEvidence
      });
      continue;
    }
    ready.push({ behavior, registryEntry: entry });
  }
  return { ready, blockers };
}

module.exports = { EVIDENCE_GATES, assessBehaviorCoverage, validateBehaviorAdapterRegistry };
