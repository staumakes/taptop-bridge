const { makeTagId, makeClassId } = require('./ids');

// Shared tag/class construction, factored out of build-hero-vertical.js once
// a second generator (typography classes) needed the identical logic.
//
// A tag is either a Taptop *widget* (widgetName+type, e.g. 'section', 'div',
// 'text', 'tt_image', 'tt_link_universal') or a plain HTML tag that's part
// of a widget's own fixed internal template (tagName only, e.g. the <span>
// inside a button, the <img> inside tt_image) — confirmed by inspecting real
// native-copy exports of a button and an image. image__img is a confirmed
// hybrid carrying both.
function createTagBuilder() {
  const usedTagIds = new Set();
  const usedClassIds = new Set();
  const classIdCache = new Map();
  const mainClassNameCollection = { map: {} };
  const tags = {};

  function classId(name) {
    if (classIdCache.has(name)) return classIdCache.get(name);
    const id = makeClassId(usedClassIds);
    classIdCache.set(name, id);
    mainClassNameCollection.map[id] = { id, value: name };
    return id;
  }

  function makeTag({ widgetName, type, tagName, alias, className, bemClasses = [], name, parent, text, extraData, extra }) {
    // Confirmed by a real Taptop paste error ("Uncaught Error: У любого тега
    // должен быть класс") that every tag needs a real, named class — a bare
    // tagName-only tag built without an explicit `className` silently got a
    // classNameIds entry pointing at an undefined class value, and broke the
    // ENTIRE paste, not just that one tag. Fail at build time instead.
    if (!className) {
      throw new Error(`makeTag: missing className for tag (widgetName=${widgetName}, tagName=${tagName}, name=${name}) — every tag needs a real class, confirmed by a real Taptop paste error`);
    }
    if (bemClasses.some((c) => !c)) {
      throw new Error(`makeTag: bemClasses contains a falsy entry for tag (widgetName=${widgetName}, tagName=${tagName}, name=${name})`);
    }
    const id = makeTagId(usedTagIds);
    tags[id] = {
      id,
      ...(widgetName !== undefined ? { widgetName, type } : {}),
      ...(tagName !== undefined ? { tagName } : {}),
      ...(alias !== undefined ? { alias } : (type !== undefined ? { alias: type } : {})),
      className,
      classNameIds: [classId(className), ...bemClasses.map(classId)],
      children: [],
      can: ['SELECT', 'INSERT'],
      dataAccess: 7,
      ...(name !== undefined ? { name } : {})
    };
    if (parent) {
      tags[id].parent = parent;
      tags[parent].children.push(id);
    }
    if (text !== undefined) {
      // Confirmed via real native-copy exports (a plain text widget, and the
      // <span> inside a button widget): visible content lives at
      // data.text = { type: 'HTML', value: '<string>' }, and such a leaf's
      // capability list is ['SELECT', 'SET_TEXT'] (no INSERT, it can't have
      // children).
      tags[id].can = ['SELECT', 'SET_TEXT'];
      tags[id].data = { ...(tags[id].data || {}), text: { type: 'HTML', value: text } };
    }
    if (extraData) tags[id].data = { ...(tags[id].data || {}), ...extraData };
    if (extra) Object.assign(tags[id], extra);
    return id;
  }

  return { classId, makeTag, tags, mainClassNameCollection };
}

module.exports = { createTagBuilder };
