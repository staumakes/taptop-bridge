const assert = require('node:assert');
const { test } = require('node:test');
const { createTagBuilder } = require('../lib/tag-builder');
const { buildButton, buildLink, buildImage, previewItem, mirrorButtonFillsToDesignCollection } = require('../lib/component-builders');

test('buildButton creates a tt_link_universal/tt_link_button wrapping a text-button span child', () => {
  const { makeTag, tags } = createTagBuilder();
  const root = makeTag({ widgetName: 'div', type: 'div', className: 'div', bemClasses: [] });
  const btnId = buildButton(makeTag, { parent: root, bemClasses: ['btn', 'btn--primary'], text: 'Купить' });

  const btn = tags[btnId];
  assert.strictEqual(btn.widgetName, 'tt_link_universal');
  assert.strictEqual(btn.type, 'tt_link_button');
  assert.strictEqual(btn.parent, root);
  assert.strictEqual(btn.data.href.value, '');
  assert.deepStrictEqual(btn.attr, { role: 'button' });
  assert.strictEqual(btn.children.length, 1);

  const span = tags[btn.children[0]];
  assert.strictEqual(span.tagName, 'span');
  assert.strictEqual(span.widgetName, undefined);
  assert.strictEqual(span.data.text.value, 'Купить');
  assert.strictEqual(span.can.includes('SET_TEXT'), true);
});

test('buildButton honors a custom href', () => {
  const { makeTag, tags } = createTagBuilder();
  const btnId = buildButton(makeTag, { parent: undefined, bemClasses: ['btn'], text: 'Go', href: '/pricing' });
  assert.strictEqual(tags[btnId].data.href.value, '/pricing');
});

test('buildLink uses the author-confirmed tt_link_block primitive instead of disguising a link as a button', () => {
  const { makeTag, tags } = createTagBuilder();
  const linkId = buildLink(makeTag, { parent: undefined, bemClasses: ['link-row', 'link-row--accent'], text: 'Подробнее', href: '#' });
  const link = tags[linkId];
  assert.strictEqual(link.widgetName, 'tt_link_universal');
  assert.strictEqual(link.type, 'tt_link_block');
  assert.strictEqual(link.tagName, 'a');
  assert.strictEqual(link.className, 'link-block');
  assert.strictEqual(link.widgetSettings.screen.type, 'link');
  assert.strictEqual(link.widgetSettings.screen.eventName, 'click');
  assert.strictEqual(link.widgetSettings.screen.eventElement, 'self');
  assert.strictEqual(link.can.includes('SET_LINK_UNIVERSAL'), true);
  assert.strictEqual(link.attr, undefined);
  assert.strictEqual(link.prevent, undefined);
  assert.strictEqual(link.data.href.value, '#');

  const text = tags[link.children[0]];
  assert.strictEqual(text.widgetName, 'text');
  assert.strictEqual(text.type, 'text');
  assert.strictEqual(text.className, 'text');
  assert.strictEqual(text.data.text.value, 'Подробнее');
});

test('buildImage creates a tt_image wrapper with a required image__img child carrying an embedded asset key', () => {
  const { makeTag, tags } = createTagBuilder();
  const imgId = buildImage(makeTag, { parent: undefined, bemClasses: ['logo-link__image'], assetKey: 'asset/logo', alt: 'Taptop', maxWidth: '108', maxHeight: '27' });

  const wrapper = tags[imgId];
  assert.strictEqual(wrapper.widgetName, 'tt_image');
  assert.strictEqual(wrapper.type, 'tt_image');
  assert.strictEqual(wrapper.widgetSettings.screen.objectFit, 'cover');
  assert.strictEqual(wrapper.children.length, 1);

  const img = tags[wrapper.children[0]];
  assert.strictEqual(img.widgetName, 'image__img');
  assert.strictEqual(img.tagName, 'img');
  assert.strictEqual(img.data.alt.value, 'Taptop');
  assert.equal(img.__pendingUpload.assetKey, 'asset/logo');
});

test('buildImage accepts objectFit/lockRatio overrides', () => {
  const { makeTag, tags } = createTagBuilder();
  const imgId = buildImage(makeTag, { parent: undefined, bemClasses: ['x'], assetKey: 'asset/a', objectFit: 'contain', lockRatio: false, maxWidth: '200', maxHeight: '100' });
  assert.strictEqual(tags[imgId].widgetSettings.screen.objectFit, 'contain');
  assert.strictEqual(tags[imgId].widgetSettings.screen.lockRatio, false);
});

// maxWidth/maxHeight used to silently default to '2040'/'1020' — turned out
// to be one specific image's real size, not a safe generic fallback (see
// component-builders.js's buildImage comment). Now mandatory, same
// discipline as tag-builder.js's missing-className guard.
test('buildImage throws when maxWidth/maxHeight are omitted — there is no safe generic default', () => {
  const { makeTag } = createTagBuilder();
  assert.throws(() => buildImage(makeTag, { parent: undefined, bemClasses: ['x'], assetKey: 'asset/a' }), /maxWidth\/maxHeight/);
});

test('previewItem wraps buildInner()\'s output in a .preview-item + .cname label', () => {
  const { makeTag, tags } = createTagBuilder();
  let innerId;
  const itemId = previewItem(makeTag, {
    parent: undefined,
    cnameText: 'Button Primary',
    buildInner: (parent) => { innerId = buildButton(makeTag, { parent, bemClasses: ['btn', 'btn--primary'], text: 'Подробнее' }); },
  });

  const item = tags[itemId];
  assert.strictEqual(item.classNameIds.length, 2, 'div + preview-item class');
  assert.strictEqual(item.children.length, 2, 'cname text + built inner tag');

  const cname = tags[item.children[0]];
  assert.strictEqual(cname.widgetName, 'text');
  assert.strictEqual(cname.data.text.value, 'Button Primary');

  assert.strictEqual(item.children[1], innerId);
  assert.strictEqual(tags[innerId].parent, itemId);
});

// Confirmed via a real native-copy export (localStorage['clipboardData']):
// tt_link_universal needs a mirrored designSelectorCollection fill or
// Taptop's own default (#2BBBDC, confirmed absent from this codebase)
// visually wins over background-color. Shared here — not local to any one
// generator — so any future page/section using buildButton/buildLink gets
// this automatically.
// 2026-09-28: a real re-import showed that even a correctly-matched,
// correctly-attached mirrored gradient still did not reliably beat Taptop's
// own "Фон" visually — same-color no longer assumed safe. The mirror is now
// always fully transparent regardless of the class's own background-color,
// so it can never visually disagree with whatever color that class ends up
// with (now or after a later edit) — and needs no color threaded in here.
test('mirrorButtonFillsToDesignCollection always mirrors a fully transparent fill, regardless of the class\'s own background-color', () => {
  const { makeTag, tags, mainClassNameCollection } = createTagBuilder();
  buildButton(makeTag, { parent: undefined, bemClasses: ['btn', 'btn--primary'], text: 'Подробнее' });
  const mainSelectorCollection = {
    map: {
      'screen/.btn--primary': {
        media: 'screen', selectorText: '.btn--primary',
        rules: { 'background-color': { name: 'background-color', value: '#3290FF', isCustom: false, serializeValue: '#3290FF' } }
      }
    }
  };

  const { designClassNameCollection, designSelectorCollection } = mirrorButtonFillsToDesignCollection(tags, mainClassNameCollection, mainSelectorCollection);

  const fillEntry = designSelectorCollection.map['screen/.btn--primary__fill'];
  assert.ok(fillEntry, 'expected a mirrored .btn--primary__fill entry');
  const [stop0, stop1] = fillEntry.rules['background-image'].items[0].colors;
  assert.strictEqual(stop0.color, 'rgba(0, 0, 0, 0)');
  assert.strictEqual(stop0.color, stop1.color, 'both gradient stops must match (a solid, fully transparent fill)');

  const button = Object.values(tags).find((t) => t.widgetName === 'tt_link_universal');
  const fillClassId = button.classNameIds.find((id) => designClassNameCollection.map[id]?.value === 'btn--primary__fill');
  assert.ok(fillClassId, 'the button tag must carry the new design-class id');
});

// 2026-09-28, third attempt: live panel inspection distinguished two
// separate fields — "Фон" and "Цвет фона" — matching the CSS shorthand
// `background` and the longhand `background-color` respectively. This
// codebase had `background` on the custom-only list since before today but
// had never once written to it, so "Фон" always showed Taptop's own
// untouched default. This is the actual fix: write `background` directly
// onto the same class that carries `background-color`, with the identical
// value.
test('mirrorButtonFillsToDesignCollection writes a matching `background` shorthand onto the class that already carries background-color', () => {
  const { makeTag, tags, mainClassNameCollection } = createTagBuilder();
  buildButton(makeTag, { parent: undefined, bemClasses: ['btn', 'btn--primary'], text: 'Подробнее' });
  const mainSelectorCollection = {
    map: {
      'screen/.btn--primary': {
        media: 'screen', selectorText: '.btn--primary',
        rules: { 'background-color': { name: 'background-color', value: '#3290FF', isCustom: false, serializeValue: '#3290FF' } }
      }
    }
  };

  mirrorButtonFillsToDesignCollection(tags, mainClassNameCollection, mainSelectorCollection);

  const background = mainSelectorCollection.map['screen/.btn--primary'].rules['background'];
  assert.ok(background, 'expected a `background` rule written onto .btn--primary');
  assert.strictEqual(background.value, '#3290FF');
  assert.strictEqual(background.isCustom, true, 'background is a custom-only property');
});

// Real paste feedback showed Taptop's own opaque default "Фон" winning when
// a universal link had no explicit fill either — same transparent mirror,
// no background-color needed to produce it.
test('mirrorButtonFillsToDesignCollection mirrors a transparent fill for tt_link_universal widgets with no background-color (e.g. Button Transparent)', () => {
  const { makeTag, tags, mainClassNameCollection } = createTagBuilder();
  buildLink(makeTag, { parent: undefined, bemClasses: ['btn-transparent'], text: 'Перейти', href: '#' });
  const mainSelectorCollection = { map: {} };
  const { designClassNameCollection, designSelectorCollection } = mirrorButtonFillsToDesignCollection(tags, mainClassNameCollection, mainSelectorCollection);

  const fillEntry = designSelectorCollection.map['screen/.btn-transparent__fill'];
  assert.ok(fillEntry, 'expected a mirrored .btn-transparent__fill entry even with no background-color');
  const [stop0, stop1] = fillEntry.rules['background-image'].items[0].colors;
  assert.strictEqual(stop0.color, 'rgba(0, 0, 0, 0)');
  assert.strictEqual(stop0.color, stop1.color);

  const link = Object.values(tags).find((t) => t.widgetName === 'tt_link_universal');
  const fillClassId = link.classNameIds.find((id) => designClassNameCollection.map[id]?.value === 'btn-transparent__fill');
  assert.ok(fillClassId, 'the link tag must carry the new design-class id');
});
