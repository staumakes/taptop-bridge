const { embeddedAssetRecords, readLocalAsset } = require('./asset-package');

function localAssetPath(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('LOCALHOST_ASSET_URL_REQUIRED'); }
  if (url.protocol !== 'http:' || url.hostname !== 'localhost' || url.port !== '4747' || url.search || url.hash) {
    throw new Error('LOCALHOST_ASSET_URL_REQUIRED');
  }
  let decoded;
  try { decoded = decodeURIComponent(url.pathname); } catch { throw new Error('UNSAFE_ASSET_PATH'); }
  if (!decoded.startsWith('/assets/')) throw new Error('UNSAFE_ASSET_PATH');
  const relative = decoded.slice(1);
  if (relative.split('/').some(part => !part || part === '.' || part === '..') || relative.includes('\\')) {
    throw new Error('UNSAFE_ASSET_PATH');
  }
  return relative;
}

function migrateLegacyV1({ wrapper, assetRoot }) {
  if (!wrapper || typeof wrapper !== 'object' || Array.isArray(wrapper)) throw new Error('LEGACY_PACKAGE_REQUIRED');
  if (wrapper.type !== 'taptop-enhancer-layer-export' || wrapper.version !== 1) throw new Error('LEGACY_V1_PACKAGE_REQUIRED');
  if (typeof assetRoot !== 'string' || !assetRoot) throw new Error('ASSET_ROOT_REQUIRED');

  const migrated = JSON.parse(JSON.stringify(wrapper));
  const tags = Object.values(migrated.clipboardData?.copiedLayout?.tree?.tags || {});
  if (!tags.length) throw new Error('LEGACY_CLIPBOARD_REQUIRED');
  const localAssets = [];
  for (const tag of tags) {
    const upload = tag?.__pendingUpload;
    if (!upload) continue;
    if (!upload || typeof upload.url !== 'string' || Object.keys(upload).some(key => key !== 'url')) {
      throw new Error(`LEGACY_PENDING_UPLOAD_INVALID:${tag?.id || '?'}`);
    }
    const asset = readLocalAsset(assetRoot, localAssetPath(upload.url));
    localAssets.push(asset);
    tag.__pendingUpload = { assetKey: asset.stableKey };
  }
  migrated.version = 2;
  migrated.embeddedAssets = embeddedAssetRecords(localAssets);
  if (migrated.syncPackage?.sourceRevision !== undefined) migrated.syncPackage.sourceRevision = migrated.sourceRevision;
  return migrated;
}

module.exports = { migrateLegacyV1 };
