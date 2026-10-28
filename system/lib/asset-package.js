const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { inside } = require('./project');

function jpegDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) throw new Error('invalid JPEG marker');
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) throw new Error('invalid JPEG segment');
    if (marker >= 0xc0 && marker <= 0xc3) return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
    offset += length;
  }
  throw new Error('JPEG dimensions absent');
}

function webpDimensions(buffer) {
  const kind = buffer.subarray(12, 16).toString('ascii');
  if (kind === 'VP8X') return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  if (kind === 'VP8 ') return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') {
    const value = buffer.readUInt32LE(21);
    return { width: (value & 0x3fff) + 1, height: ((value >> 14) & 0x3fff) + 1 };
  }
  throw new Error('unsupported WebP chunk');
}

function svgDimensions(buffer) {
  const text = buffer.toString('utf8');
  const tag = text.match(/<svg\b[^>]*>/i)?.[0];
  if (!tag) throw new Error('SVG root absent');
  const attribute = name => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1]?.trim();
  // Figma exports fractional sizes (11.0379); the package records whole pixels, rounded up.
  const whole = number => {
    const rounded = Math.ceil(number);
    return Number.isSafeInteger(rounded) && number > 0 ? rounded : null;
  };
  const dimension = value => {
    if (!value || !/^\d+(?:\.\d+)?(?:px)?$/i.test(value)) return null;
    return whole(Number.parseFloat(value));
  };
  const width = dimension(attribute('width'));
  const height = dimension(attribute('height'));
  if (width && height) return { width, height };
  const viewBox = attribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && whole(viewBox[2]) && whole(viewBox[3])) {
    return { width: whole(viewBox[2]), height: whole(viewBox[3]) };
  }
  throw new Error('SVG dimensions absent');
}

const TYPES = {
  '.png': { mimeType: 'image/png', signature: buffer => buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), dimensions: buffer => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }) },
  '.gif': { mimeType: 'image/gif', signature: buffer => buffer.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/), dimensions: buffer => ({ width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) }) },
  '.jpg': { mimeType: 'image/jpeg', signature: buffer => buffer.subarray(0, 2).equals(Buffer.from('ffd8', 'hex')), dimensions: jpegDimensions },
  '.jpeg': { mimeType: 'image/jpeg', signature: buffer => buffer.subarray(0, 2).equals(Buffer.from('ffd8', 'hex')), dimensions: jpegDimensions },
  '.webp': { mimeType: 'image/webp', signature: buffer => buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP', dimensions: webpDimensions },
  '.svg': { mimeType: 'image/svg+xml', signature: buffer => /<svg\b/i.test(buffer.toString('utf8')), dimensions: svgDimensions }
};

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function inspectAssetBytes(bytes, mimeType) {
  const type = Object.values(TYPES).find(item => item.mimeType === mimeType);
  if (!type || !type.signature(bytes)) throw new Error('mimeType disagrees with bytes');
  let dimensions;
  try { dimensions = type.dimensions(bytes); } catch { throw new Error('mimeType disagrees with bytes'); }
  const { width, height } = dimensions;
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
    throw new Error('invalid image dimensions');
  }
  return dimensions;
}

function detectedAssetType(bytes) {
  return Object.values(TYPES).find(type => {
    if (!type.signature(bytes)) return false;
    try { type.dimensions(bytes); return true; } catch { return false; }
  });
}

function extensionForType(type) {
  return Object.entries(TYPES).find(([, candidate]) => candidate === type)?.[0];
}

function readLocalAsset(projectRoot, sourcePath) {
  if (typeof sourcePath !== 'string' || !sourcePath || path.posix.isAbsolute(sourcePath) || sourcePath.split('/').includes('..') || sourcePath.includes('\\')) {
    throw new Error('UNSAFE_ASSET_PATH');
  }
  const root = fs.realpathSync(projectRoot);
  const file = fs.realpathSync(path.resolve(projectRoot, sourcePath));
  if (!inside(root, file)) throw new Error('UNSAFE_ASSET_PATH');
  if (!fs.statSync(file).isFile()) throw new Error('UNSAFE_ASSET_PATH');
  const extension = path.extname(sourcePath).toLowerCase();
  if (!TYPES[extension]) throw new Error(`UNSUPPORTED_ASSET: ${extension || 'no extension'}`);
  const bytes = fs.readFileSync(file);
  const type = detectedAssetType(bytes);
  if (!type) throw new Error(`UNSUPPORTED_ASSET: ${sourcePath}`);
  let dimensions;
  try { dimensions = inspectAssetBytes(bytes, type.mimeType); } catch { throw new Error(`UNSUPPORTED_ASSET: ${sourcePath}`); }
  const { width, height } = dimensions;
  return { stableKey: `asset/${sha256(bytes)}`, sourcePath, extension: extensionForType(type), mimeType: type.mimeType, width, height, sha256: sha256(bytes), bytes };
}

function embeddedAssetRecords(assets) {
  const unique = new Map();
  for (const asset of assets) unique.set(asset.sha256, asset);
  return [...unique.values()].sort((a, b) => a.sha256.localeCompare(b.sha256)).map(asset => ({
    stableKey: asset.stableKey, sha256: asset.sha256, mimeType: asset.mimeType,
    width: asset.width, height: asset.height, byteLength: asset.bytes.length,
    encoding: 'base64', data: asset.bytes.toString('base64')
  }));
}

module.exports = { embeddedAssetRecords, inspectAssetBytes, readLocalAsset };
