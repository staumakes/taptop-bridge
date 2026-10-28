// Structural checks only: no assumptions about native widget/CSS schemas.
function validateTree(tree) {
  const errors = [];
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!isRecord(tree) || !isRecord(tree.tags)) return ['Missing or invalid copiedLayout.tree.tags'];
  const tags = Object.create(null);
  const hasTag = id => Object.hasOwn(tags, id);
  const children = new Map();
  for (const [id, tag] of Object.entries(tree.tags)) {
    if (!isRecord(tag)) { errors.push(`Tag ${id} must be an object`); continue; }
    tags[id] = tag;
    if (tag.id !== id) errors.push(`Tag map key "${id}" does not match id "${tag.id}"`);
    for (const field of ['children', 'classNameIds']) {
      if (tag[field] !== undefined && (!Array.isArray(tag[field]) || tag[field].some(v => typeof v !== 'string'))) {
        errors.push(`Tag ${id} ${field} must be an array of string IDs`);
      }
    }
    const ids = Array.isArray(tag.children) ? tag.children.filter(v => typeof v === 'string') : [];
    const unique = new Set(ids);
    if (unique.size !== ids.length) errors.push(`Tag ${id} has duplicate child IDs`);
    children.set(id, unique);
  }
  // Continue over usable nodes so one malformed entry does not hide an
  // independent graph defect. The caller stops before semantic validation.
  const roots = Object.values(tags).filter(tag => !tag.parent);
  if (roots.length !== 1) errors.push(`Expected exactly 1 root tag, found ${roots.length}`);
  else if (tree.root !== roots[0].id) {
    errors.push(`copiedLayout.tree.root "${tree.root}" does not match root tag id "${roots[0].id}"`);
  }
  for (const [id, tag] of Object.entries(tags)) {
    if (tag.parent && hasTag(tag.parent) && !children.get(tag.parent).has(id)) {
      errors.push(`Tag ${id} is not listed in parent ${tag.parent} children`);
    }
    for (const child of children.get(id)) {
      if (!hasTag(child)) errors.push(`Tag ${id} has unknown child ${child}`);
      else if (tags[child].parent !== id) errors.push(`Tag ${child} does not point back to declared parent ${id}`);
    }
  }
  const root = tree.root;
  if (!hasTag(root)) errors.push(`copiedLayout.tree.root "${root}" does not identify a tag`);
  else {
    const reached = new Set();
    const pending = [root];
    while (pending.length) {
      const id = pending.pop();
      if (reached.has(id) || !hasTag(id)) continue;
      reached.add(id);
      for (const child of children.get(id)) pending.push(child);
    }
    for (const id of Object.keys(tags)) if (!reached.has(id)) errors.push(`Tag ${id} is unreachable from tree.root ${root}`);
  }
  // Check every component, including cycles disconnected from the root.
  const colors = new Map();
  for (const start of Object.keys(tags)) {
    if (colors.has(start)) continue;
    const pending = [[start, false]];
    while (pending.length) {
      const [id, exiting] = pending.pop();
      if (!hasTag(id)) continue;
      if (exiting) { colors.set(id, 2); continue; }
      if (colors.get(id) === 1) { errors.push(`Tree cycle detected at tag ${id}`); continue; }
      if (colors.get(id) === 2) continue;
      colors.set(id, 1);
      pending.push([id, true]);
      for (const child of children.get(id)) pending.push([child, false]);
    }
  }
  return errors;
}

module.exports = { validateTree };
