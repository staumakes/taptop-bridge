const { createHash } = require('node:crypto');
const { validateIntake } = require('./intake');

const FOUNDATION_GROUPS = ['colors', 'typography', 'spacing', 'radius', 'shadows'];

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!plain(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function literal(value) {
  if (typeof value === 'string') {
    if (/var\s*\(|--[a-z0-9_-]+/i.test(value)) throw new Error('UNSUPPORTED_CSS_VARIABLE');
    if (!value.trim()) throw new Error('MISSING_LITERAL_VALUE');
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!plain(value) || Object.keys(value).length === 0) throw new Error('MISSING_LITERAL_VALUE');
  return Object.fromEntries(Object.keys(value).sort().map(key => {
    if (key.startsWith('--')) throw new Error('UNSUPPORTED_CSS_VARIABLE');
    return [key, literal(value[key])];
  }));
}

function stableName(role, declarations) {
  const fingerprint = createHash('sha256').update(JSON.stringify(canonical({ role, declarations }))).digest('hex').slice(0, 12);
  const slug = role.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  if (!slug) throw new Error('INVALID_CLASS_ROLE');
  return `${slug}-${fingerprint}`;
}

function normalizeProjectSystem(input) {
  const report = validateIntake(input?.intake);
  if (!report.valid) throw new Error(`INVALID_INTAKE: ${report.errors.map(error => error.code).join(', ')}`);

  const rawEvidence = input.evidence || [];
  if (!Array.isArray(rawEvidence)) throw new Error('INVALID_EVIDENCE');
  const evidence = new Map();
  for (const item of rawEvidence) {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || typeof item.kind !== 'string' || !item.kind.trim() || typeof item.ref !== 'string' || !item.ref.trim()) throw new Error('INVALID_EVIDENCE');
    if (evidence.has(item.id)) throw new Error(`DUPLICATE_EVIDENCE: ${item.id}`);
    evidence.set(item.id, { id: item.id, kind: item.kind, ref: item.ref });
  }
  function evidenceIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0 || ids.some(id => !evidence.has(id))) throw new Error('MISSING_EVIDENCE');
    return [...new Set(ids)].sort();
  }

  const foundations = {};
  for (const group of FOUNDATION_GROUPS) {
    const entries = input.foundations?.[group] || {};
    if (!plain(entries)) throw new Error(`INVALID_FOUNDATION_GROUP: ${group}`);
    foundations[group] = Object.fromEntries(Object.keys(entries).sort().map(name => {
      const item = entries[name];
      if (!plain(item)) throw new Error(`INVALID_FOUNDATION: ${group}.${name}`);
      return [name, { value: literal(item.value), evidenceIds: evidenceIds(item.evidenceIds) }];
    }));
  }

  const definitions = new Map();
  const componentDrafts = new Map();
  if (!Array.isArray(input.components || [])) throw new Error('INVALID_COMPONENTS');
  for (const item of input.components || []) {
    if (!item || typeof item.stableKey !== 'string' || !item.stableKey.trim() || !Array.isArray(item.classes)) throw new Error('INVALID_COMPONENT');
    const signatures = [];
    for (const entry of item.classes) {
      if (!entry || typeof entry.role !== 'string' || !entry.role.trim()) throw new Error('INVALID_CLASS_ROLE');
      const declarations = literal(entry.declarations);
      const signature = JSON.stringify(canonical({ role: entry.role, declarations }));
      const refs = evidenceIds(entry.evidenceIds);
      if (definitions.has(signature)) {
        const current = definitions.get(signature);
        if (entry.priorStableKey && current.priorStableKey && entry.priorStableKey !== current.priorStableKey) throw new Error('CLASS_IDENTITY_CONFLICT');
        current.priorStableKey ||= entry.priorStableKey;
        current.evidenceIds = [...new Set([...current.evidenceIds, ...refs])].sort();
      } else {
        definitions.set(signature, { role: entry.role, declarations, evidenceIds: refs, priorStableKey: entry.priorStableKey });
      }
      signatures.push(signature);
    }
    const classSignatures = [...new Set(signatures)].sort();
    const refs = evidenceIds(item.evidenceIds);
    const current = componentDrafts.get(item.stableKey);
    if (current && JSON.stringify(current.classSignatures) !== JSON.stringify(classSignatures)) throw new Error(`COMPONENT_CONFLICT: ${item.stableKey}`);
    componentDrafts.set(item.stableKey, {
      stableKey: item.stableKey,
      classSignatures,
      evidenceIds: current ? [...new Set([...current.evidenceIds, ...refs])].sort() : refs
    });
  }

  const priorClasses = input.previousSystem?.classes || [];
  if (!Array.isArray(priorClasses)) throw new Error('INVALID_PREVIOUS_SYSTEM');
  const priorByKey = new Map();
  for (const item of priorClasses) {
    if (!item || typeof item.stableKey !== 'string' || typeof item.name !== 'string' || typeof item.role !== 'string' || !plain(item.declarations) || priorByKey.has(item.stableKey)) throw new Error('INVALID_PREVIOUS_SYSTEM');
    priorByKey.set(item.stableKey, item);
  }
  const assigned = new Map();
  const usedPrior = new Set();
  function assign(signature, prior) {
    if (usedPrior.has(prior.stableKey)) throw new Error('CLASS_IDENTITY_CONFLICT');
    assigned.set(signature, prior);
    usedPrior.add(prior.stableKey);
  }
  for (const [signature, definition] of definitions) {
    if (!definition.priorStableKey) continue;
    const prior = priorByKey.get(definition.priorStableKey);
    if (!prior || prior.role !== definition.role) throw new Error(`MISSING_PRIOR_CLASS: ${definition.priorStableKey}`);
    assign(signature, prior);
  }
  for (const [signature, definition] of definitions) {
    if (assigned.has(signature)) continue;
    const prior = priorClasses.find(item => !usedPrior.has(item.stableKey) && item.role === definition.role && JSON.stringify(canonical(item.declarations)) === JSON.stringify(canonical(definition.declarations)));
    if (prior) assign(signature, prior);
  }
  const roles = new Set([...definitions.values()].map(item => item.role));
  for (const role of roles) {
    const pending = [...definitions].filter(([signature, definition]) => definition.role === role && !assigned.has(signature));
    const available = priorClasses.filter(item => item.role === role && !usedPrior.has(item.stableKey));
    if (!pending.length || !available.length) continue;
    if (pending.length !== 1 || available.length !== 1) throw new Error(`AMBIGUOUS_CLASS_REVISION: ${role}`);
    assign(pending[0][0], available[0]);
  }
  const classKeysBySignature = new Map();
  const classes = new Map();
  for (const [signature, definition] of definitions) {
    const prior = assigned.get(signature);
    const name = prior?.name || stableName(definition.role, definition.declarations);
    const stableKey = prior?.stableKey || `class/${name}`;
    if (classes.has(stableKey)) throw new Error('CLASS_IDENTITY_CONFLICT');
    classKeysBySignature.set(signature, stableKey);
    classes.set(stableKey, { stableKey, name, role: definition.role, declarations: definition.declarations, evidenceIds: definition.evidenceIds });
  }
  const components = new Map([...componentDrafts].map(([key, item]) => [key, {
    stableKey: key,
    classKeys: item.classSignatures.map(signature => classKeysBySignature.get(signature)).sort(),
    evidenceIds: item.evidenceIds
  }]));

  const pages = new Map();
  if (!Array.isArray(input.pages || [])) throw new Error('INVALID_PAGES');
  for (const item of input.pages || []) {
    if (!item || typeof item.stableKey !== 'string' || !item.stableKey.trim() || !Array.isArray(item.componentKeys)) throw new Error('INVALID_PAGE');
    const componentKeys = [...new Set(item.componentKeys)].sort();
    for (const key of componentKeys) if (!components.has(key)) throw new Error(`MISSING_COMPONENT: ${key}`);
    if (pages.has(item.stableKey)) throw new Error(`DUPLICATE_PAGE: ${item.stableKey}`);
    pages.set(item.stableKey, { stableKey: item.stableKey, componentKeys, evidenceIds: evidenceIds(item.evidenceIds) });
  }

  return {
    schemaVersion: 1,
    sourceType: report.mode,
    foundations,
    classes: [...classes.values()].sort((a, b) => a.stableKey.localeCompare(b.stableKey)),
    components: [...components.values()].sort((a, b) => a.stableKey.localeCompare(b.stableKey)),
    pages: [...pages.values()].sort((a, b) => a.stableKey.localeCompare(b.stableKey)),
    evidence: [...evidence.values()].sort((a, b) => a.id.localeCompare(b.id))
  };
}

module.exports = { normalizeProjectSystem };
