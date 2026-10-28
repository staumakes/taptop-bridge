function finalizeClassCollection(collection = {}) {
  const map = collection.map && typeof collection.map === 'object' ? collection.map : {};
  const entries = Object.values(map);
  const countMap = {};
  const sortMap = {};

  entries.forEach((entry, index) => {
    countMap[entry.value] = (countMap[entry.value] || 0) + 1;
    sortMap[entry.id] = entries[index + 1]?.id || '';
  });

  return {
    ...collection,
    map,
    countMap,
    sortMap,
    ...(entries.length ? { head: { ...entries[0] } } : {})
  };
}

function finalizeClipboardData(clipboardData) {
  const layout = clipboardData?.copiedLayout;
  if (!layout?.tree) throw new TypeError('A copiedLayout tree is required');

  return {
    ...clipboardData,
    isElementInCollection: clipboardData.isElementInCollection ?? false,
    hasQuantityInSubtree: clipboardData.hasQuantityInSubtree ?? false,
    isElementInOrderSummary: clipboardData.isElementInOrderSummary ?? false,
    isElementInShop: clipboardData.isElementInShop ?? false,
    copiedLayout: {
      ...layout,
      tree: {
        ...layout.tree,
        dataCollection: layout.tree.dataCollection || { map: {} },
        forms: layout.tree.forms || {}
      },
      mainClassNameCollection: finalizeClassCollection(layout.mainClassNameCollection),
      designClassNameCollection: finalizeClassCollection(layout.designClassNameCollection)
    }
  };
}

module.exports = { finalizeClassCollection, finalizeClipboardData };
