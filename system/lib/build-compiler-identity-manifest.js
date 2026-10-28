const CHANNELS = [
  ['main', 'mainSelectorCollection'],
  ['design', 'designSelectorCollection'],
  ['cm', 'cmSelectorCollection'],
  ['animation', 'animationSelectorCollection']
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectorUsesClass(selectorText, className) {
  return new RegExp(`\\.${escapeRegex(className)}(?![-_a-zA-Z0-9])`).test(selectorText);
}

function buildCompilerIdentityManifest({ clipboardData, namespace, componentKey, stableKeysByClass, instance }) {
  const layout = clipboardData?.copiedLayout;
  if (!layout) throw new TypeError('clipboardData.copiedLayout is required');
  if (!namespace || !componentKey) throw new TypeError('namespace and componentKey are required');
  if (!stableKeysByClass || typeof stableKeysByClass !== 'object' || Array.isArray(stableKeysByClass)) {
    throw new TypeError('stableKeysByClass must be an object');
  }
  if (!instance?.stableKey || !instance?.rootLogicalNodeKey) throw new TypeError('instance identity is required');

  const mainClasses = layout.mainClassNameCollection?.map || {};
  const designClasses = layout.designClassNameCollection?.map || {};
  const classes = Object.entries(stableKeysByClass).map(([name, stableKey]) => {
    const inMain = Object.values(mainClasses).some((entry) => entry?.value === name);
    const inDesign = Object.values(designClasses).some((entry) => entry?.value === name);
    if (!inMain && !inDesign) throw new Error(`identity class ${JSON.stringify(name)} is missing from compiled class collections`);
    if (inMain && inDesign) throw new Error(`identity class ${JSON.stringify(name)} is ambiguous across main and design collections`);

    const ownedPaths = [];
    for (const [channel, collectionName] of CHANNELS) {
      const entries = Object.values(layout[collectionName]?.map || {}).sort((left, right) => {
        const leftKey = `${left?.media || ''}\u0000${left?.selectorText || ''}`;
        const rightKey = `${right?.media || ''}\u0000${right?.selectorText || ''}`;
        return leftKey.localeCompare(rightKey);
      });
      for (const entry of entries) {
        if (!entry?.selectorText || !selectorUsesClass(entry.selectorText, name)) continue;
        for (const property of Object.keys(entry.rules || {}).sort()) {
          ownedPaths.push({ path: JSON.stringify([channel, entry.media, entry.selectorText, property]), required: true });
        }
      }
    }
    if (!ownedPaths.length) throw new Error(`identity class ${JSON.stringify(name)} has no owned selector rules`);
    return { stableKey, name, collection: inMain ? 'main' : 'design', ownedPaths };
  });

  return {
    schemaVersion: 1,
    namespace,
    componentKey,
    classes,
    instances: [{ stableKey: instance.stableKey, rootLogicalNodeKey: instance.rootLogicalNodeKey }]
  };
}

module.exports = { buildCompilerIdentityManifest, selectorUsesClass };
