// `tag.id` is the tree identity. HTML attributes named id in attr/data are
// different: they can override Taptop's generated DOM identity. Reject them,
// rather than silently removing anchors. Do not inspect HTML strings (SVG
// paint servers, rich text and Embed content have their own ID references).
function validateLayerAttributes(clipboardData) {
  const errors = [];
  const tags = clipboardData?.copiedLayout?.tree?.tags;
  if (!tags || typeof tags !== 'object') return errors;
  for (const [key, tag] of Object.entries(tags)) {
    for (const field of ['attr', 'data']) {
      const attributes = tag?.[field];
      if (!attributes || typeof attributes !== 'object') continue;
      for (const name of Object.keys(attributes)) {
        if (name.trim().toLowerCase() !== 'id') continue;
        errors.push(`RESERVED_TAG_ATTRIBUTE: tag ${key} ${field}.${name} must not override Taptop's HTML id; use the editor's native anchor setting`);
      }
    }
  }
  return errors;
}

module.exports = { validateLayerAttributes };
