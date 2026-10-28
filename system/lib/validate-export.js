const { validateTree } = require('./validate-tree');
const { gridTemplateColumnsItems, CUSTOM_ONLY_PROPERTIES } = require('./css-rules');
const { finalizeClassCollection } = require('./runtime-shape');

const TAPTOP_MEDIA_VALUES = new Set([
  'screen', '(max-width: 991px)', '(max-width: 767px)', '(max-width: 479px)'
]);

const SELECTOR_COLLECTION_NAMES = [
  'mainSelectorCollection', 'designSelectorCollection', 'cmSelectorCollection', 'animationSelectorCollection'
];

function selectorClassNames(selectorText) {
  const names = [];
  String(selectorText || '').replace(/\.([_a-zA-Z-][_a-zA-Z0-9-]*)/g, (_match, name) => {
    names.push(name);
    return '';
  });
  return names;
}

function validateTaptopRule(property, rule, context) {
  const errors = [];
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return [`${context} property "${property}" must be a typed rule object`];
  if (rule.name !== property) errors.push(`${context} property "${property}" has mismatched rule name ${JSON.stringify(rule.name)}`);
  if (typeof rule.value !== 'string') errors.push(`${context} property "${property}" value must be a string`);
  if (typeof rule.serializeValue !== 'string') errors.push(`${context} property "${property}" serializeValue must be a string`);
  if (typeof rule.isCustom !== 'boolean') errors.push(`${context} property "${property}" isCustom must be boolean`);
  if (CUSTOM_ONLY_PROPERTIES.has(property) && rule.isCustom !== true) {
    errors.push(`${context} property "${property}" must use isCustom:true; Taptop has no safe native classStyle handler for this property`);
  }

  const hasNumber = Object.prototype.hasOwnProperty.call(rule, 'number');
  const hasUnit = Object.prototype.hasOwnProperty.call(rule, 'unit');
  if (hasNumber && !Number.isFinite(rule.number)) errors.push(`${context} property "${property}" number must be a finite number`);
  if (hasNumber && (typeof rule.unit !== 'string' || !rule.unit)) errors.push(`${context} property "${property}" numeric rule needs a unit`);
  if (hasUnit && !hasNumber) errors.push(`${context} property "${property}" has a unit without a number`);
  if (rule.value === 'auto' && (rule.number !== 0 || rule.unit !== 'auto')) {
    errors.push(`${context} property "${property}" auto must use number 0 and unit "auto"`);
  }
  if (property === 'grid-template-columns' && typeof rule.value === 'string') {
    const expected = gridTemplateColumnsItems(rule.value);
    if (JSON.stringify(rule.items) !== JSON.stringify(expected)) {
      errors.push(`${context} property "${property}" items must match the expanded grid track sequence`);
    }
  }
  return errors;
}

function validateImageWidget(tag, layout, knownClassesById) {
  const errors = [];
  const label = `tt_image ${tag.id}`;
  const settings = tag.widgetSettings?.screen;
  const isPositiveDimension = (value) => {
    if (typeof value !== 'string' && typeof value !== 'number') return false;
    const normalized = String(value).trim();
    return /^\d+(?:\.\d+)?$/.test(normalized) && Number(normalized) > 0;
  };

  for (const field of ['maxWidth', 'maxHeight']) {
    if (!isPositiveDimension(settings?.[field])) {
      errors.push(`${label} widgetSettings.screen.${field} must be a real positive pixel dimension; Taptop renders an unsized image as 100x100px`);
    }
  }

  // A tt_image wrapper needs its own reusable design class. The structural
  // `image` class alone is shared by every image and cannot safely carry an
  // instance/component size. Exact `.class` matching is deliberate: a rule
  // hidden only behind a parent/hover selector does not establish the base
  // widget size during paste.
  const designClassNames = (tag.classNameIds || []).slice(1)
    .map((id) => knownClassesById.get(id))
    .filter(Boolean);
  if (!designClassNames.length) {
    errors.push(`${label} needs a design class in addition to its structural class`);
  } else {
    const baseEntries = [];
    for (const className of designClassNames) {
      for (const collectionName of ['mainSelectorCollection', 'designSelectorCollection']) {
        const entry = layout[collectionName]?.map?.[`screen/.${className}`];
        if (entry) baseEntries.push({ className, collectionName, entry });
      }
    }
    const sized = baseEntries.some(({ entry }) => entry.rules?.width && entry.rules?.height);
    if (!sized) {
      const found = baseEntries.length
        ? baseEntries.map(({ className, entry }) => `.${className} (${Object.keys(entry.rules || {}).join(', ') || 'no rules'})`).join('; ')
        : 'no exact screen selector';
      errors.push(`${label} needs explicit CSS width and height together on one base design-class selector at screen (${found}); aspect-ratio and widgetSettings do not replace either property`);
    }
  }

  const children = (tag.children || []).map((id) => layout.tree.tags[id]).filter(Boolean);
  const imageChildren = children.filter((child) => child.widgetName === 'image__img' && child.tagName === 'img');
  if (imageChildren.length !== 1) {
    errors.push(`${label} must contain exactly one image__img <img> child, found ${imageChildren.length}`);
  }
  return errors;
}

function validateTextWidget(tag) {
  const errors = [];
  const label = `text ${tag.id}`;
  if (tag.type !== 'text') errors.push(`${label} must use type "text"`);
  if ((tag.children || []).length !== 0) errors.push(`${label} must be a leaf with no children`);
  const text = tag.data?.text;
  if (text?.type !== 'HTML' || typeof text?.value !== 'string') {
    errors.push(`${label} data.text must be an HTML string payload`);
  }
  if (!Array.isArray(tag.can) || !tag.can.includes('SET_TEXT')) {
    errors.push(`${label} must include SET_TEXT capability`);
  }
  return errors;
}

function validateLinkWidget(tag) {
  const errors = [];
  const label = `tt_link_universal ${tag.id}`;
  const settings = tag.widgetSettings?.screen;
  const allowedTypes = new Set(['tt_link_button', 'tt_link_block']);
  if (!allowedTypes.has(tag.type)) {
    errors.push(`${label} type must be tt_link_button or tt_link_block`);
    return errors;
  }
  if (!(tag.children || []).length) errors.push(`${label} must contain visible child content`);
  if (tag.data?.href?.type !== 'STRING' || typeof tag.data?.href?.value !== 'string') {
    errors.push(`${label} data.href must be a STRING payload`);
  }
  for (const field of ['type', 'eventName', 'eventElement', 'eventAction', 'displayType', 'selectedTag', 'linkType']) {
    if (typeof settings?.[field] !== 'string') errors.push(`${label} widgetSettings.screen.${field} must be a string`);
  }
  if (typeof settings?.blank !== 'boolean') errors.push(`${label} widgetSettings.screen.blank must be boolean`);
  if (tag.dataSource !== 'from_parent') errors.push(`${label} dataSource must be "from_parent"`);

  if (tag.type === 'tt_link_button') {
    if (settings?.type !== 'button') errors.push(`${label} tt_link_button must use widgetSettings.screen.type "button"`);
    if (!Array.isArray(tag.prevent) || !tag.prevent.includes('ATTR_HREF')) {
      errors.push(`${label} tt_link_button must prevent ATTR_HREF`);
    }
    if (tag.attr?.role !== 'button') errors.push(`${label} tt_link_button must use role="button"`);
  } else {
    if (tag.tagName !== 'a') errors.push(`${label} tt_link_block must use tagName "a"`);
    if (tag.className !== 'link-block') errors.push(`${label} tt_link_block must use the native system class "link-block"`);
    if (settings?.type !== 'link') errors.push(`${label} tt_link_block must use widgetSettings.screen.type "link"`);
    if (!Array.isArray(tag.can) || !tag.can.includes('SET_LINK_UNIVERSAL')) {
      errors.push(`${label} tt_link_block must include SET_LINK_UNIVERSAL capability`);
    }
  }
  return errors;
}

function validateExport(payload) {
  const errors = [];
  const layout = payload?.copiedLayout;
  if (!layout) {
    errors.push('Missing copiedLayout');
    return errors;
  }

  for (const flag of [
    'isElementInCollection',
    'hasQuantityInSubtree',
    'isElementInOrderSummary',
    'isElementInShop'
  ]) {
    if (typeof payload[flag] !== 'boolean') {
      errors.push(`${flag} must be a boolean in the native Taptop clipboard shape`);
    }
  }

  const treeErrors = validateTree(layout.tree);
  if (treeErrors.length) return treeErrors;
  if (!layout.tree.dataCollection || typeof layout.tree.dataCollection !== 'object' || !layout.tree.dataCollection.map || typeof layout.tree.dataCollection.map !== 'object') {
    errors.push('copiedLayout.tree.dataCollection.map is required by the Taptop runtime model');
  }
  if (!layout.tree.forms || typeof layout.tree.forms !== 'object' || Array.isArray(layout.tree.forms)) {
    errors.push('copiedLayout.tree.forms must be an object');
  }

  for (const collectionName of ['mainClassNameCollection', 'designClassNameCollection']) {
    const collection = layout[collectionName];
    const expected = finalizeClassCollection({ map: collection?.map || {} });
    if (!collection?.countMap || JSON.stringify(collection.countMap) !== JSON.stringify(expected.countMap)) {
      errors.push(`${collectionName}.countMap must match the class map`);
    }
    if (!collection?.sortMap || JSON.stringify(collection.sortMap) !== JSON.stringify(expected.sortMap)) {
      errors.push(`${collectionName}.sortMap must link classes in map order`);
    }
    if (JSON.stringify(collection?.head) !== JSON.stringify(expected.head)) {
      errors.push(`${collectionName}.head must reference the first class, or be absent for an empty collection`);
    }
  }
  const tags = layout.tree.tags;
  const tagIds = new Set(Object.keys(tags));
  const classIds = new Set(Object.keys(layout.mainClassNameCollection?.map || {}));
  const designClassIds = new Set(Object.keys(layout.designClassNameCollection?.map || {}));

  const roots = Object.values(tags).filter((tag) => !tag.parent);
  if (roots.length !== 1) {
    errors.push(`Expected exactly 1 root tag, found ${roots.length}`);
  } else {
    if (payload.tagID !== roots[0].id) {
      errors.push(`payload.tagID "${payload.tagID}" does not match root tag id "${roots[0].id}"`);
    }
    if (layout.tree?.root !== roots[0].id) {
      errors.push(`copiedLayout.tree.root "${layout.tree?.root}" does not match root tag id "${roots[0].id}" — Taptop's own paste/drop validation reads tree.root to find the insertion anchor and throws "Node must exist" when it's missing`);
    }
  }

  const classNameMap = layout.mainClassNameCollection?.map || {};
  const designClassNameMap = layout.designClassNameCollection?.map || {};
  const knownClassNames = new Set();
  const knownClassesById = new Map();
  for (const [collectionName, collection] of [
    ['mainClassNameCollection', classNameMap],
    ['designClassNameCollection', designClassNameMap]
  ]) {
    for (const [key, item] of Object.entries(collection)) {
      if (item?.id !== key) errors.push(`${collectionName} class collection key "${key}" does not match object id "${item?.id}"`);
      if (item?.value) {
        knownClassNames.add(item.value);
        knownClassesById.set(key, item.value);
      }
    }
  }
  Object.values(tags).forEach((tag) => {
    if (tag.widgetName === undefined && tag.tagName === undefined) {
      errors.push(`Tag ${tag.id} has neither widgetName nor tagName`);
    }
    // Confirmed by a real Taptop paste error ("Uncaught Error: У любого тега
    // должен быть класс"): a tag whose classNameIds point at a class entry
    // with no real name (undefined/empty `value`) breaks the entire paste,
    // not just that tag.
    if (!(tag.classNameIds || []).length) {
      errors.push(`Tag ${tag.id} has no classNameIds at all — every tag needs at least one real class`);
    }
    // classNameIds can point at either collection — confirmed by a real
    // native-copy export of a button widget, whose classNameIds mixed 3
    // mainClassNameCollection ids with 1 designClassNameCollection id.
    (tag.classNameIds || []).forEach((classId) => {
      const inMain = classIds.has(classId);
      const inDesign = designClassIds.has(classId);
      if (!inMain && !inDesign) {
        errors.push(`Tag ${tag.id} references unknown classNameId ${classId}`);
      } else {
        const value = inMain ? classNameMap[classId]?.value : designClassNameMap[classId]?.value;
        if (!value) {
          errors.push(`Tag ${tag.id} references classNameId ${classId} whose class has no real name (value: ${JSON.stringify(value)})`);
        }
      }
    });
    if (tag.parent && !tagIds.has(tag.parent)) {
      errors.push(`Tag ${tag.id} has unknown parent ${tag.parent}`);
    }
    (tag.children || []).forEach((childId) => {
      if (!tagIds.has(childId)) {
        errors.push(`Tag ${tag.id} has unknown child ${childId}`);
        return;
      }
      if (tags[childId].parent !== tag.id) {
        errors.push(`Tag ${childId} does not point back to declared parent ${tag.id}`);
      }
    });
  });

  Object.values(tags).forEach((tag) => {
    if (tag.widgetName === 'tt_image') {
      errors.push(...validateImageWidget(tag, layout, knownClassesById));
    }
    if (tag.widgetName === 'text') errors.push(...validateTextWidget(tag));
    if (tag.widgetName === 'tt_link_universal') errors.push(...validateLinkWidget(tag));
  });

  SELECTOR_COLLECTION_NAMES.forEach((collectionName) => {
    const map = layout[collectionName]?.map || {};
    Object.entries(map).forEach(([key, entry]) => {
      const expectedKey = `${entry.media}/${entry.selectorText}`;
      if (key !== expectedKey) {
        errors.push(`${collectionName} key "${key}" does not match media/selectorText "${expectedKey}"`);
      }
      if (!TAPTOP_MEDIA_VALUES.has(entry.media)) {
        errors.push(`${collectionName} entry "${key}" has non-Taptop media "${entry.media}" (expected one of: ${Array.from(TAPTOP_MEDIA_VALUES).join(', ')})`);
      }
      selectorClassNames(entry.selectorText).forEach((className) => {
        if (!knownClassNames.has(className)) {
          errors.push(`${collectionName} entry "${key}" references unknown class ".${className}"`);
        }
      });
    });
  });

  SELECTOR_COLLECTION_NAMES.forEach((collectionName) => {
    const map = layout[collectionName]?.map || {};
    Object.entries(map).forEach(([key, entry]) => {
      Object.entries(entry.rules || {}).forEach(([prop, rule]) => {
        errors.push(...validateTaptopRule(prop, rule, `${collectionName} entry "${key}"`));
        if (typeof rule?.value === 'string' && rule.value.includes('var(')) {
          errors.push(`${collectionName} entry "${key}" property "${prop}" has unresolved var() in value: "${rule.value}"`);
        }
        if (typeof rule?.serializeValue === 'string' && rule.serializeValue.includes('var(')) {
          errors.push(`${collectionName} entry "${key}" property "${prop}" has unresolved var() in serializeValue: "${rule.serializeValue}"`);
        }
      });
    });
  });

  return errors;
}

// Separate from validateExport() on purpose — NOT run by default. Every
// tag's classNameIds is built as [classId(className), ...bemClasses
// .map(classId)] (createTagBuilder, tag-builder.js) — a fixed order, so
// index 0 is always the tag's Taptop-structural base class ('div', 'text',
// 'section', 'link', 'button'...), shared across hundreds of otherwise-
// unrelated tags with no design-specific rules of its own, and everything
// from index 1 on is a real BEM/design class the generator itself named and
// is expected to style. Confirmed real generator bug shape this catches: a
// class gets added to bemClasses but the matching once()/writeSelectorRules()
// call is missing or targets the wrong CSS selector — writeSelectorRules
// silently writes NOTHING when extraction finds zero properties for that
// selector and no extraScreenRules were given (see rule-sets.js), so the
// class ends up in the tree but carries no styling at all in the pasted
// result, with no error anywhere else. Caught 3 real gaps this way on
// 2026-09-15 (.uikit-group-caption, .spacing-bar, .adapt-group-header).
//
// Only meaningful against a build from the REAL production CSS sources —
// several generators' own unit tests deliberately use minimal/incomplete CSS
// fixtures (see build-ui-kit-swatches.test.js's own comment: "the rest of
// build()'s alias loop just gets empty rule sets for the ones missing here,
// which is valid, not an error"), so running this against those would be
// constant false positives. Call it explicitly from a test/script that loads
// the real files (build-ui-kit-full.test.js's loadReal(), the pilot runners),
// not from validateExport()'s default path.
function validateAllClassesStyled(payload) {
  const errors = [];
  const layout = payload?.copiedLayout;
  if (!layout) return errors;

  const tags = layout.tree?.tags || {};
  const classNameMap = layout.mainClassNameCollection?.map || {};
  const designClassNameMap = layout.designClassNameCollection?.map || {};
  const classIds = new Set(Object.keys(classNameMap));

  const styledSelectors = new Set();
  ['mainSelectorCollection', 'designSelectorCollection'].forEach((collectionName) => {
    Object.values(layout[collectionName]?.map || {}).forEach((entry) => {
      styledSelectors.add(entry.selectorText);
    });
  });
  Object.values(tags).forEach((tag) => {
    (tag.classNameIds || []).slice(1).forEach((classId) => {
      const inMain = classIds.has(classId);
      const name = inMain ? classNameMap[classId]?.value : designClassNameMap[classId]?.value;
      if (!name) return; // unknown/unnamed class — validateExport() already reports this
      if (!styledSelectors.has(`.${name}`)) {
        const label = tag.name || tag.widgetName || tag.tagName || tag.id;
        errors.push(`Tag ${tag.id} (${label}) uses class ".${name}" with no real rules in mainSelectorCollection or designSelectorCollection — the matching once()/writeSelectorRules() call is likely missing or targets the wrong CSS selector`);
      }
    });
  });

  return errors;
}

module.exports = { validateExport, validateAllClassesStyled, validateTaptopRule, validateImageWidget };
