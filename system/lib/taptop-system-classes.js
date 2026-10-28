// Class names Taptop uses itself. A source class with one of these names would
// merge with the editor's own class on import (the compiler puts these on the
// native layers it creates; see component-builders.js for the native-copy
// evidence). Generic document names are reserved too.
// Rich Text renders as .tt-rich-text > .text-block-wrap-div; its links get .tt-rich-link.
const LAYER_SYSTEM_CLASSES = ['div', 'text', 'button', 'text-button', 'link-block', 'image', 'image__img', 'svg-icon', 'svg-icon__path', 'tt-rich-text', 'text-block-wrap-div', 'tt-rich-link'];
const DOCUMENT_NAMES = ['html', 'body', 'head', 'root'];
// Taptop's base stylesheet styles its widgets and states by these names
// (section, container, link, badge, menu__*, slider__*, pop-up__*, tabs__*,
// is-active …), after the project's own rules. A source class with one of
// them gets Taptop's base too: an imported .section { display: none } was
// shown because the base .section { display: block } came later (2026-10-12).
const TAPTOP_BASE_CLASSES = require('./taptop-base-classes.json').classes;
const RESERVED_CLASS_NAMES = new Set([...LAYER_SYSTEM_CLASSES, ...DOCUMENT_NAMES, ...TAPTOP_BASE_CLASSES]);
const RENAME_PREFIX = 'u-';

function renamedClass(name) { return `${RENAME_PREFIX}${name}`; }

// Taptop reads a trailing -<number> as its duplicate counter. A new class whose
// base has no counter yet loses -0/-1 ("col-1" is stored as "col") and leading
// zeros ("q-007" becomes "q-7"); larger counters are kept. Such names get
// "_<number>" instead, which Taptop stores verbatim (live check, 2026-10-12).
function counterSafeClass(name) {
  const match = /-(\d+)$/.exec(name);
  if (!match) return name;
  const digits = match[1];
  const kept = String(Number(digits)) === digits && Number(digits) > 1;
  return kept ? name : `${name.slice(0, match.index)}_${digits}`;
}

module.exports = { LAYER_SYSTEM_CLASSES, DOCUMENT_NAMES, TAPTOP_BASE_CLASSES, RESERVED_CLASS_NAMES, renamedClass, counterSafeClass };
