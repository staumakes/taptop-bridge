const crypto = require('node:crypto');
const { inspectAssetBytes } = require('./asset-package');

const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
const SHA_256 = /^[a-f0-9]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodeEmbeddedAsset(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Embedded asset must be an object');
  const allowed = new Set(['stableKey', 'sha256', 'mimeType', 'width', 'height', 'byteLength', 'encoding', 'data']);
  const unexpected = Object.keys(record).find(key => !allowed.has(key));
  if (unexpected) throw new Error(`Embedded asset has unexpected field ${unexpected}`);
  if (!MIME_TYPES.has(record.mimeType)) throw new Error('Embedded asset mimeType is unsupported');
  if (typeof record.sha256 !== 'string' || !SHA_256.test(record.sha256)) throw new Error('Embedded asset SHA-256 must be lowercase hex');
  if (record.stableKey !== `asset/${record.sha256}`) throw new Error('Embedded asset stableKey must match SHA-256');
  if (!Number.isSafeInteger(record.width) || record.width < 1 || !Number.isSafeInteger(record.height) || record.height < 1) {
    throw new Error('Embedded asset dimensions are invalid');
  }
  if (!Number.isSafeInteger(record.byteLength) || record.byteLength < 1) throw new Error('Embedded asset byteLength is invalid');
  if (record.encoding !== 'base64' || typeof record.data !== 'string' || !record.data || !BASE64.test(record.data)) {
    throw new Error('Embedded asset data must be canonical Base64');
  }
  const bytes = Buffer.from(record.data, 'base64');
  if (bytes.toString('base64') !== record.data) throw new Error('Embedded asset data must be canonical Base64');
  if (bytes.length !== record.byteLength) throw new Error('Embedded asset byteLength differs from decoded bytes');
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== record.sha256) throw new Error('Embedded asset SHA-256 differs from decoded bytes');
  const dimensions = inspectAssetBytes(bytes, record.mimeType);
  if (dimensions.width !== record.width || dimensions.height !== record.height) {
    throw new Error('Embedded asset dimensions differ from decoded bytes');
  }
  return bytes;
}

module.exports = { decodeEmbeddedAsset };
