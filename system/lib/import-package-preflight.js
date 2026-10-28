const { validateExport } = require('./validate-export');
const { validateImportPackage } = require('./import-sync-contract');
const { decodeEmbeddedAsset } = require('./embedded-assets');
const { behaviorPackageErrors } = require('./behavior-package');

const SHA_256 = /^[a-f0-9]{64}$/;
const LEGACY_MESSAGE = 'This is an earlier package with a separate asset folder. Compile again with Bridge 0.2.';

function isImage2Value(value) {
  return value && typeof value === 'object'
    && Number(value.image_id) > 0
    && typeof value.src === 'string'
    && value.src.length > 0;
}

function validateSyncSources(syncPackage, layout) {
  const errors = [];
  for (const identity of Array.isArray(syncPackage?.classes) ? syncPackage.classes : []) {
    const collection = layout?.[`${identity.collection}ClassNameCollection`]?.map || {};
    const matches = Object.values(collection).filter(item => item?.value === identity.name);
    if (matches.length !== 1) {
      errors.push(`sync class ${identity.collection}/${identity.name} must match exactly one clipboard class, found ${matches.length}`);
    }
  }
  return errors;
}

function preflightImportPackage(wrapper) {
  const errors = [];
  const warnings = [];
  const empty = { nodes: 0, classes: 0, instances: 0, assets: 0 };
  if (!wrapper || typeof wrapper !== 'object' || Array.isArray(wrapper)) {
    return { ok: false, errors: ['Import wrapper must be an object'], warnings, summary: empty, stats: empty, package: null };
  }
  if (wrapper.version === 1) {
    return { ok: false, errors: [LEGACY_MESSAGE], warnings, summary: empty, stats: empty, package: null };
  }
  if (wrapper.type !== 'taptop-enhancer-layer-export') errors.push('wrapper.type must be taptop-enhancer-layer-export');
  if (wrapper.version !== 2) errors.push('wrapper.version must equal 2');
  if (typeof wrapper.sourceRevision !== 'string' || !SHA_256.test(wrapper.sourceRevision)) {
    errors.push('sourceRevision must be a lowercase SHA-256 hex string');
  }
  if (/([?&]|\b)access=/i.test(String(wrapper.sourceUrl || ''))) {
    errors.push('sourceUrl contains a secret-bearing access parameter');
  }
  if (!wrapper.clipboardData) errors.push('clipboardData is required');
  else errors.push(...validateExport(wrapper.clipboardData));
  if (!wrapper.syncPackage) errors.push('syncPackage is required for managed compiler imports');
  else errors.push(...validateImportPackage(wrapper.syncPackage));
  if (wrapper.syncPackage?.sourceRevision !== undefined && wrapper.syncPackage.sourceRevision !== wrapper.sourceRevision) {
    errors.push('syncPackage.sourceRevision differs from wrapper.sourceRevision');
  }
  if (wrapper.behaviorPackages !== undefined) errors.push(...behaviorPackageErrors(wrapper.behaviorPackages));

  const assetsByKey = new Map();
  if (!Array.isArray(wrapper.embeddedAssets)) errors.push('embeddedAssets must be an array');
  else for (const asset of wrapper.embeddedAssets) {
    if (assetsByKey.has(asset?.stableKey)) errors.push(`Duplicate embedded asset stableKey: ${asset.stableKey}`);
    else assetsByKey.set(asset?.stableKey, asset);
    try { decodeEmbeddedAsset(asset); }
    catch (error) { errors.push(`Embedded asset ${asset?.stableKey || '?'}: ${error.message}`); }
  }

  const layout = wrapper.clipboardData?.copiedLayout;
  if (wrapper.syncPackage && layout) errors.push(...validateSyncSources(wrapper.syncPackage, layout));
  const tags = Object.values(layout?.tree?.tags || {});
  const pending = tags.filter(tag => tag?.__pendingUpload);
  for (const tag of pending) {
    const upload = tag.__pendingUpload;
    if (typeof upload.assetKey !== 'string' || !upload.assetKey) {
      errors.push(`tag ${tag.id || '?'} pending upload needs an assetKey`);
    } else if (!assetsByKey.has(upload.assetKey)) {
      errors.push(`tag ${tag.id || '?'} assetKey is absent from embeddedAssets: ${upload.assetKey}`);
    }
    if (Object.keys(upload).some(key => key !== 'assetKey')) {
      errors.push(`tag ${tag.id || '?'} pending upload must use assetKey only`);
    }
  }
  for (const tag of tags.filter(item => item?.widgetName === 'image__img')) {
    const hasPending = typeof tag.__pendingUpload?.assetKey === 'string' && tag.__pendingUpload.assetKey.length > 0;
    if (tag.data?.src?.type === 'IMAGE2' && isImage2Value(tag.data.src.value)) {
      errors.push(`tag ${tag.id || '?'} portable image must not contain a target media ID`);
    }
    if (!hasPending) errors.push(`tag ${tag.id || '?'} image payload needs __pendingUpload.assetKey`);
  }
  if (pending.length) warnings.push(`${pending.length} image upload(s) need the Taptop import bridge`);

  const summary = {
    nodes: tags.length,
    classes: wrapper.syncPackage?.classes?.length || 0,
    instances: wrapper.syncPackage?.instances?.length || 0,
    assets: Array.isArray(wrapper.embeddedAssets) ? wrapper.embeddedAssets.length : 0
  };
  const stats = {
    tags: summary.nodes,
    managedClasses: summary.classes,
    managedInstances: summary.instances,
    pendingUploads: pending.length
  };
  return { ok: errors.length === 0, errors, warnings, summary, stats, package: errors.length === 0 ? wrapper : null };
}

module.exports = { LEGACY_MESSAGE, preflightImportPackage };
