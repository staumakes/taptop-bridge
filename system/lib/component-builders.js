// Reusable tag builders, factored out of build-hero-vertical.js once a
// second and third generator (typography classes, UI kit groups) needed the
// identical widget-construction logic. Each builder only constructs tags —
// writing CSS rules into a selector collection stays the caller's job via
// createSelectorWriter (rule-sets.js), since which exact selectors/pseudo
// states matter differs per call site.

const { makeClassId } = require('./ids');
const { toTaptopRule } = require('./css-rules');

// Confirmed via a real native-copy export of an actual button: Taptop's
// button widget is widgetName 'tt_link_universal' / type 'tt_link_button',
// not a leaf — the visible label lives on a required child <span> (tagName
// 'span', no widgetName) carrying its own system class 'text-button'.
// widgetSettings.screen, `prevent`, `attr` and `data.href` below are the
// real example's default/no-op values (eventName: 'none' = no click
// behavior). See build-hero-vertical.js's original comment for the full
// provenance note.
function buildButton(makeTag, { parent, bemClasses, text, className = 'button', href = '' }) {
  const tButton = makeTag({
    widgetName: 'tt_link_universal', type: 'tt_link_button', alias: 'Button',
    className, bemClasses,
    name: bemClasses[bemClasses.length - 1],
    parent,
    extraData: { href: { type: 'STRING', value: href } },
    extra: {
      widgetSettings: {
        screen: {
          type: 'button', eventName: 'none', eventElement: 'select', eventAction: 'show',
          displayType: '', selectedTag: '', linkType: 'page', blank: false
        }
      },
      prevent: ['ATTR_HREF'],
      attr: { role: 'button' },
      dataSource: 'from_parent'
    }
  });
  makeTag({
    tagName: 'span', alias: 'Text', className: 'text-button', bemClasses: [],
    parent: tButton, text,
    extra: { dataSource: 'from_parent' }
  });
  return tButton;
}

// Author-confirmed container-link primitive from GoodMade/tthelper_data's FAQ
// fixture. A real link is not a button with two fields removed: it is
// tt_link_universal/tt_link_block, has tagName "a", the system class
// "link-block", screen.type "link" and SET_LINK_UNIVERSAL capability.
function buildLinkWrapper(makeTag, { parent, bemClasses, href = '', className = 'link-block', alias = 'Link Block' }) {
  return makeTag({
    widgetName: 'tt_link_universal', type: 'tt_link_block', tagName: 'a', alias,
    className, bemClasses,
    name: bemClasses[bemClasses.length - 1],
    parent,
    extraData: { href: { type: 'STRING', value: href } },
    extra: {
      widgetSettings: {
        screen: {
          type: 'link', eventName: 'click', eventElement: 'self', eventAction: '',
          displayType: '', selectedTag: '', linkType: 'link', blank: false
        }
      },
      can: ['SELECT', 'INSERT', 'SET_LINK_UNIVERSAL'],
      dataSource: 'from_parent'
    }
  });
}

function buildLink(makeTag, { parent, bemClasses, text, href = '', className = 'link-block' }) {
  const tLink = buildLinkWrapper(makeTag, { parent, bemClasses, href, className });
  makeTag({
    widgetName: 'text', type: 'text', alias: 'text', className: 'text', bemClasses: [],
    parent: tLink, text,
    extra: { dataSource: 'from_parent' }
  });
  return tLink;
}

// A link whose visible content is an image, not text (Logo, Social Links) —
// same tt_link_universal wrapper as buildLink, but the required child is
// built via buildImage instead of a text span. Not confirmed by a real
// native-copy export either (no such example captured yet).
function buildImageLink(makeTag, { parent, bemClasses, href = '', className = 'link-block', image }) {
  const tLink = buildLinkWrapper(makeTag, { parent, bemClasses, href, className });
  buildImage(makeTag, { parent: tLink, ...image });
  return tLink;
}

// Confirmed via a real native-copy export of an actual image: tt_image is a
// WRAPPER widget, not the <img> itself — the real <img> is a required child
// tag (widgetName 'image__img', tagName 'img'). data.src for a real image is
// { type: 'IMAGE2', value: {...} }, issued when a file is uploaded into that
// Taptop project's own media library. The offline compiler instead carries a
// __pendingUpload.assetKey; the importer reads the matching embedded asset,
// uploads its bytes and patches the target-local data.src.
// Explicit width/height remain mandatory because Taptop defaults an unsized
// tt_image to a fixed 100x100px.
function buildImage(makeTag, { parent, bemClasses = [], assetKey, alt = '', objectFit = 'cover', lockRatio = true, maxWidth, maxHeight, className = 'image' }) {
  // maxWidth/maxHeight used to silently default to '2040'/'1020' — turned
  // out to be the exact real pixel size of ONE specific image
  // (hero-vertical's), not a safe generic fallback. Every other image that
  // relied on the default (the UI kit's cards) rendered at the wrong size
  // in real Taptop until each was given its own real dimensions. Same
  // discipline as tag-builder.js's missing-className guard: fail loudly at
  // build time instead of silently shipping a wrong-but-plausible-looking
  // default.
  if (!maxWidth || !maxHeight) {
    throw new Error(`buildImage: missing maxWidth/maxHeight for "${assetKey}" — Taptop defaults an unsized tt_image to 100x100px, and there is no safe generic default (2040/1020 was actually just one specific image's real size). Pass the real pixel dimensions this image should render at.`);
  }
  const tImageWrapper = makeTag({
    widgetName: 'tt_image', type: 'tt_image', alias: 'Image',
    className, bemClasses,
    name: bemClasses[bemClasses.length - 1] || className,
    parent,
    extra: {
      widgetSettings: { screen: { objectFit, lockRatio, maxWidth, maxHeight } },
      can: ['SELECT', 'SET_ATTR_SRC', 'SET_ATTR_ALT', 'SET_ATTR_TITLE', 'SET_EVENT']
    }
  });
  makeTag({
    widgetName: 'image__img', tagName: 'img', className: 'image__img', bemClasses,
    parent: tImageWrapper,
    extraData: { alt: { type: 'STRING', value: alt }, title: { type: 'STRING', value: '' } },
    extra: {
      dataSource: 'from_parent',
      can: undefined,
      __pendingUpload: { assetKey }
    }
  });
  return tImageWrapper;
}

// Wraps a showcase item in the `.preview-item` scaffolding used throughout
// ui-kit.html (Buttons, Tags, Links... groups): a `.cname` label text plus
// whatever `buildInner(parentId)` constructs. Returns the wrapper's tag id.
// showCname: false skips the .cname label — for items whose own visible
// content already identifies the variant (e.g. Buttons: the button's own
// style IS the label, same as the reference never captioning its Primary/
// Secondary/Ghost buttons). Defaults to true since most preview grids
// (Links, Tags) show a technical class-combo name that isn't otherwise
// visible on the rendered element.
function previewItem(makeTag, { parent, cnameText, wrapperClass = 'preview-item', showCname = true, buildInner }) {
  const tItem = makeTag({ widgetName: 'div', type: 'div', className: 'div', bemClasses: [wrapperClass], name: wrapperClass, parent });
  if (showCname) {
    makeTag({ widgetName: 'text', type: 'text', className: 'text', bemClasses: ['cname'], name: 'cname', parent: tItem, text: cnameText });
  }
  buildInner(tItem);
  return tItem;
}

// Inline SVG is built by ir-to-taptop as the native SVG Icon widget
// (tt_svg_icon <span> with the markup in data.text), observed live on 2026-10-11.

function hexToRgba(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 1)`;
}

// Confirmed via a real native-copy export (Ctrl+C on a manually-styled
// button in Taptop, retrieved from localStorage['clipboardData'] since
// Taptop's own copy never touches the OS clipboard): every tt_link_universal
// instance Taptop's own editor creates carries a 4th, per-instance class
// living in designSelectorCollection (not mainSelectorCollection), whose
// `background-image` is a two-stop same-color linear-gradient — Taptop's
// internal representation of a solid fill for the widget's own "Фон" field.
// That field paints OVER background-color (CSS stacks background-image
// above background-color), so a button colored only via a class's
// background-color renders hidden underneath whatever Taptop's own default
// "Фон" happens to be (confirmed: a hardcoded teal, #2BBBDC, absent from
// this whole codebase).
function solidFillGradientRule(colorValue) {
  const rgba = /^#/.test(colorValue) ? hexToRgba(colorValue) : colorValue;
  const src = `${rgba} 0%, ${rgba} 100%`;
  return {
    name: 'background-image',
    value: `linear-gradient(${src})`,
    isCustom: false,
    serializeValue: `linear-gradient(${src})`,
    items: [{
      kind: 'fill',
      colors: [{ color: rgba, number: 0, unit: '%' }, { color: rgba, number: 100, unit: '%' }],
      src,
      disabled: false
    }]
  };
}

// Call once, after every tag and every mainSelectorCollection rule is
// finished building — mirrors a fill into designSelectorCollection for every
// tt_link_universal widget (buildButton/buildLink/buildLinkWrapper) so
// Taptop's own "Фон" field stops painting over the real color. Mandatory for
// ANY generator that uses buildButton/buildLink — not just the UI kit —
// since this bug affects the shared primitive itself, not a specific page.
//
// 2026-09-28: switched from mirroring the *matching* opaque color to always
// mirroring fully transparent (rgba(0,0,0,0)), after a real re-import showed
// even a correctly-matched, correctly-attached mirrored gradient class still
// did not reliably win visually — "Фон" apparently isn't guaranteed to lose
// to a same-color background-image the way a real cascade would. A fully
// transparent "Фон" can't visually disagree with whatever color the class's
// own background-color ends up as (or becomes, on a later edit), and needs
// no color to be threaded through here at all — simpler and no longer tied
// to background-color existing/being read correctly.
//
// 2026-09-28, second attempt: a real re-import with a correctly-attached,
// correctly-written fully-transparent mirrored `background-image` (confirmed
// via live readback — exact rgba(0,0,0,0) on both gradient stops) still did
// not change the rendered "Фон" swatch or the button's visible color at all.
// The background-image mirror theory is disproven for this widget. Live
// inspection of the panel instead distinguishes two separate fields: "Фон"
// and "Цвет фона" — matching, respectively, the CSS shorthand `background`
// and the longhand `background-color`. This codebase has never once written
// the literal `background` property (it's been custom-only since before
// today, alongside gap/overflow/border/aspect-ratio/object-fit, but nothing
// ever targeted it) — "Фон" was showing Taptop's own untouched default
// because nothing had ever set it. Writing `background` directly onto the
// same class that carries `background-color`, with the identical color (or
// transparent when there is none), is the actual fix; the transparent
// `background-image` mirror below is unconfirmed to do anything for this
// widget and is kept only because removing it has not been live-verified
// either — do not treat its presence as evidence it matters.
function mirrorButtonFillsToDesignCollection(tags, mainClassNameCollection, mainSelectorCollection) {
  const designClassNameCollection = { map: {} };
  const designSelectorCollection = { map: {} };
  const usedDesignClassIds = new Set();
  const fillClassIds = new Map();
  function designClassId(name) {
    const id = makeClassId(usedDesignClassIds);
    designClassNameCollection.map[id] = { id, value: name };
    return id;
  }
  Object.values(tags).forEach((tag) => {
    if (tag.widgetName !== 'tt_link_universal') return;
    const classNames = (tag.classNameIds || []).map((id) => mainClassNameCollection.map[id]?.value).filter(Boolean);
    const bgClassName = classNames.find((name) => mainSelectorCollection.map[`screen/.${name}`]?.rules['background-color']);
    const fillSource = bgClassName || classNames[classNames.length - 1];
    if (!fillSource) return;

    if (bgClassName) {
      const bgSelector = mainSelectorCollection.map[`screen/.${bgClassName}`];
      if (!bgSelector.rules['background']) {
        bgSelector.rules['background'] = toTaptopRule('background', bgSelector.rules['background-color'].value);
      }
    }

    const fillClassName = `${fillSource}__fill`;
    if (!fillClassIds.has(fillClassName)) {
      fillClassIds.set(fillClassName, designClassId(fillClassName));
      designSelectorCollection.map[`screen/.${fillClassName}`] = {
        media: 'screen', selectorText: `.${fillClassName}`,
        rules: { 'background-image': solidFillGradientRule('rgba(0, 0, 0, 0)') }
      };
    }
    tag.classNameIds.push(fillClassIds.get(fillClassName));
  });
  return { designClassNameCollection, designSelectorCollection };
}

module.exports = {
  buildButton, buildLink, buildLinkWrapper, buildImageLink, buildImage, previewItem,
  mirrorButtonFillsToDesignCollection
};
