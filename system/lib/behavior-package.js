const crypto = require('node:crypto');

const LOGICAL_KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function fail(message) {
  throw new Error(`EMBED_FIXTURE_INVALID: ${message}`);
}

function behaviorPackageErrors(value) {
  const errors = [];
  if (!Array.isArray(value)) return ['behaviorPackages must be an array'];
  const keys = new Set();
  value.forEach((item, index) => {
    const label = `behaviorPackages[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) { errors.push(`${label} must be an object`); return; }
    if (!LOGICAL_KEY.test(item.key || '')) errors.push(`${label}.key must be a logical key`);
    else if (keys.has(item.key)) errors.push(`Duplicate behavior package key: ${item.key}`);
    else keys.add(item.key);
    if (typeof item.adapter !== 'string' || !item.adapter) errors.push(`${label}.adapter is required`);
    const rootId = item.clipboardData?.copiedLayout?.tree?.root;
    const root = item.clipboardData?.copiedLayout?.tree?.tags?.[rootId];
    if (!root || root.widgetName !== 'tt_embed') errors.push(`${label}.clipboardData must have a tt_embed root`);
    else if (!Array.isArray(root.can) || !root.can.includes('SET_EMBED_CODE')) errors.push(`${label}.clipboardData tt_embed must allow SET_EMBED_CODE`);
    if (typeof item.codeSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.codeSha256)) errors.push(`${label}.codeSha256 must be a lowercase SHA-256 hex string`);
    else if (typeof root?.embedCode !== 'string' || crypto.createHash('sha256').update(root.embedCode).digest('hex') !== item.codeSha256) errors.push(`${label}.codeSha256 does not match tt_embed code`);
  });
  return errors;
}

// The fixture hides the Embed with `helper--d-none`, a class other tools also
// create. Taptop keeps an existing project class on paste, so that rule can
// arrive empty and leave a visible 100px Embed. Use a Bridge-owned class.
const HIDDEN_CLASS = 'toolkit-behavior';
const SHARED_HIDDEN_CLASS = 'helper--d-none';

function hideWithOwnClass(layout) {
  const classes = layout?.mainClassNameCollection;
  const entry = Object.values(classes?.map || {}).find(item => item?.value === SHARED_HIDDEN_CLASS);
  if (!entry) fail(`fixture must hide the Embed with ${SHARED_HIDDEN_CLASS}`);
  entry.value = HIDDEN_CLASS;
  if (classes.countMap) {
    classes.countMap[HIDDEN_CLASS] = classes.countMap[SHARED_HIDDEN_CLASS] || 1;
    delete classes.countMap[SHARED_HIDDEN_CLASS];
  }
  if (classes.head?.id === entry.id) classes.head.value = HIDDEN_CLASS;
  const selectors = layout.mainSelectorCollection.map;
  delete selectors[`screen/.${SHARED_HIDDEN_CLASS}`];
  selectors[`screen/.${HIDDEN_CLASS}`] = {
    media: 'screen', selectorText: `.${HIDDEN_CLASS}`,
    rules: { display: { name: 'display', value: 'none', isCustom: false, serializeValue: 'none' } }
  };
}

function buildEmbedBehaviorPackage({ fixture, key, adapter, name, embedCode }) {
  if (!LOGICAL_KEY.test(key || '')) throw new TypeError('BEHAVIOR_KEY_INVALID');
  if (typeof adapter !== 'string' || !adapter) throw new TypeError('BEHAVIOR_ADAPTER_INVALID');
  if (typeof name !== 'string' || !name.trim()) throw new TypeError('BEHAVIOR_NAME_INVALID');
  if (typeof embedCode !== 'string' || !embedCode.trim()) throw new TypeError('BEHAVIOR_EMBED_CODE_INVALID');

  const clipboardData = copy(fixture?.clipboardData);
  const tags = clipboardData?.copiedLayout?.tree?.tags;
  const rootId = clipboardData?.copiedLayout?.tree?.root;
  const root = tags?.[rootId];
  const embedRoots = Object.values(tags || {}).filter(tag => tag?.widgetName === 'tt_embed');
  if (!root || root.widgetName !== 'tt_embed' || embedRoots.length !== 1) {
    fail('fixture must contain exactly one tt_embed root');
  }
  if (!Array.isArray(root.can) || !root.can.includes('SET_EMBED_CODE')) {
    fail('tt_embed root must grant SET_EMBED_CODE');
  }

  hideWithOwnClass(clipboardData.copiedLayout);
  root.name = name.trim();
  root.embedCode = embedCode;
  return {
    key,
    adapter,
    name: root.name,
    clipboardData,
    codeSha256: crypto.createHash('sha256').update(embedCode).digest('hex')
  };
}

module.exports = { behaviorPackageErrors, buildEmbedBehaviorPackage };
