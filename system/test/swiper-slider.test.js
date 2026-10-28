const assert = require('node:assert/strict');
const test = require('node:test');
const postcss = require('postcss');

const { normalizeHtmlSource } = require('../lib/html-normalizer');
const { buildSliderEmbedCode, sliderSnaps, sliderActive } = require('../lib/slider-embed-code');
const { validateIntake } = require('../lib/intake');

const page = body => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;
const codes = report => report.items.map(item => item.code);
const rulesOf = css => {
  const out = {};
  postcss.parse(css).walkRules(rule => {
    const media = rule.parent.type === 'atrule' ? rule.parent.params : 'screen';
    out[`${media} ${rule.selector}`] = Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(decl => [decl.prop, decl.value]));
  });
  return out;
};

// Synthetic Swiper markup: the arrows sit outside .swiper, in a header group.
const slide = (n, extra = '') => `<div class="demo-slider__slide swiper-slide${extra}"><p class="demo-card">Card ${n}</p></div>`;
const swiperPage = (slides = 4) => page(`<section class="demo-slider">
  <div class="demo-slider__top"><h2 class="demo-slider__title">Title</h2>
    <div class="demo-controls"><button class="demo-controls__btn" type="button" aria-label="Back"><span class="demo-controls__icon">‹</span></button><button class="demo-controls__btn" type="button" aria-label="Forward"><span class="demo-controls__icon">›</span></button></div>
  </div>
  <div class="demo-slider__swiper swiper"><div class="swiper-wrapper">${Array.from({ length: slides }, (_, n) => slide(n + 1)).join('')}</div></div>
</section><script src="lib/swiper/swiper-bundle.min.js"></script>`);
const swiperCss = `.swiper { overflow: hidden; position: relative; }
.swiper-wrapper { display: flex; position: relative; transition-property: transform; }
.swiper-slide { flex-shrink: 0; width: 100%; }
.demo-slider__slide { width: 300px !important; }
.demo-slider__slide.swiper-slide-active { opacity: 1; }
.demo-controls__btn { width: 40px; height: 40px; color: #111111; background-color: #eeeeee; }
.demo-controls__btn:disabled { color: #999999; background-color: #f5f5f5; }`;

test('a Swiper track with outside arrows becomes editable layers plus a generated track slider', async () => {
  const result = await normalizeHtmlSource({ htmlText: swiperPage(), cssText: swiperCss });
  assert.equal(result.report.ok, true, JSON.stringify(result.report.items.filter(item => item.level === 'error')));
  const [behavior] = result.behaviors.behaviors;
  assert.equal(behavior.adapter, 'taptop/embed-slider-v1');
  assert.equal(behavior.config.mode, 'track');
  assert.match(behavior.config.rootClass, /^toolkit-slider_[a-z]{5}_\d+$/);
  assert.equal(behavior.config.itemClass, 'swiper-slide');
  assert.equal(behavior.config.previousClass, 'toolkit-slider-prev');
  assert.equal(behavior.config.nextClass, 'toolkit-slider-next');
  assert.deepEqual(behavior.config.labels, { previous: 'Back', next: 'Forward' });
  // The root is the nearest ancestor that also holds the arrows.
  assert.match(result.html, new RegExp(`<section class="demo-slider ${behavior.config.rootClass}"`));
  // Four slides plus the root are editable layers named in the behavior.
  assert.equal(behavior.nodeKeys.length, 5);
  // The initial Swiper state is written into the layers: container classes, first slide active, back arrow disabled.
  assert.match(result.html, /demo-slider__swiper swiper swiper-initialized swiper-horizontal swiper-backface-hidden/);
  assert.match(result.html, /demo-slider__slide swiper-slide swiper-slide-active/);
  assert.match(result.html, /demo-slider__slide swiper-slide swiper-slide-next/);
  assert.match(result.html, /demo-controls__btn toolkit-slider-prev swiper-button-disabled/);
  assert.match(result.html, /demo-controls__btn toolkit-slider-next(?! swiper-button-disabled)/);
  // Script-toggled Swiper state classes stay verbatim rules in the embed.
  assert.match(result.embedCss, /\.demo-slider__slide\.swiper-slide-active \{ opacity: 1; \}/);
  // A Taptop container is not a <button>: :disabled styles also apply to the generated disabled class.
  assert.match(result.embedCss, /\.swiper-button-disabled[^{]*\{ color: #999999; background-color: #f5f5f5; \}/);
  assert.doesNotMatch(result.html, /swiper-bundle|<script/);
  const found = codes(result.report);
  assert.ok(found.includes('SWIPER_SLIDER_DECLARED'));
  assert.ok(found.includes('SWIPER_OPTIONS_UNDECLARED'), 'options only the source script knows are reported as assumed');
});

test('Swiper controls are found by data-slider-control or Swiper navigation classes', async () => {
  const html = page(`<div class="show"><div class="show__swiper swiper"><div class="swiper-wrapper">${slide(1)}${slide(2)}</div></div>
    <div class="show__meta"><button class="show__control" type="button" data-slider-control="next">N</button><button class="show__control" type="button" data-slider-control="prev">P</button></div></div>`);
  const result = await normalizeHtmlSource({ htmlText: html, cssText: swiperCss });
  assert.match(result.html, /show__control toolkit-slider-next/);
  assert.match(result.html, /show__control toolkit-slider-prev/);
  const nav = page(`<div class="nav"><div class="nav__swiper swiper"><div class="swiper-wrapper">${slide(1)}${slide(2)}</div><div class="swiper-button-prev"></div><div class="swiper-button-next"></div></div></div>`);
  const navResult = await normalizeHtmlSource({ htmlText: nav, cssText: swiperCss });
  assert.match(navResult.html, /swiper-button-prev toolkit-slider-prev/);
  assert.match(navResult.html, /swiper-button-next toolkit-slider-next/);
});

test('declared Swiper options set the slide gap as an editable class per Taptop breakpoint', async () => {
  const sliders = [{ selector: '.demo-slider__swiper', spaceBetween: 16, breakpoints: { 480: { spaceBetween: 20 } } }];
  const result = await normalizeHtmlSource({ htmlText: swiperPage(), cssText: swiperCss, sliders });
  assert.equal(result.report.ok, true);
  assert.match(result.html, /swiper-slide swiper-slide-active toolkit-slide-gap_20_20_20_16/);
  const rules = rulesOf(result.css);
  assert.equal(rules['screen .toolkit-slide-gap_20_20_20_16']['margin-right'], '20px');
  assert.equal(rules['(max-width: 479px) .toolkit-slide-gap_20_20_20_16']['margin-right'], '16px');
  assert.equal(rules['(max-width: 767px) .toolkit-slide-gap_20_20_20_16'], undefined);
  const [behavior] = result.behaviors.behaviors;
  assert.equal(behavior.config.start, 0);
  assert.equal(behavior.config.loop, false);
  assert.ok(!codes(result.report).includes('SWIPER_OPTIONS_UNDECLARED'));
});

test('a centered Swiper starting on a later slide is laid out by Embed CSS until the script runs', async () => {
  const sliders = [{ selector: '.demo-slider__swiper', centeredSlides: true, initialSlide: 1, spaceBetween: 20, speed: 480 }];
  const result = await normalizeHtmlSource({ htmlText: swiperPage(3), cssText: swiperCss, sliders });
  const [behavior] = result.behaviors.behaviors;
  const root = `.${behavior.config.rootClass}`;
  assert.deepEqual([behavior.config.start, behavior.config.centered, behavior.config.speed], [1, true, 480]);
  assert.match(result.html, /swiper-slide swiper-slide-prev/);
  assert.match(result.html, /swiper-slide swiper-slide-active/);
  assert.match(result.html, /swiper-slide swiper-slide-next/);
  // Neither end is reached at slide 1, so no arrow starts disabled.
  assert.doesNotMatch(result.html, /swiper-button-disabled/);
  assert.ok(result.embedCss.includes(`${root}:not(.toolkit-slider-ready) .swiper-slide:first-child { margin-left: 50% !important; }`));
  assert.ok(result.embedCss.includes(`${root}:not(.toolkit-slider-ready) .swiper-slide { translate: calc(-50% - 1 * (100% + 20px)); }`));
});

test('slidesPerView and loop: equal slide widths in the embed and arrows that never disable', async () => {
  const sliders = [{ selector: '.demo-slider__swiper', slidesPerView: 1, loop: true }];
  const result = await normalizeHtmlSource({ htmlText: swiperPage(2), cssText: swiperCss, sliders });
  const [behavior] = result.behaviors.behaviors;
  assert.ok(result.embedCss.includes(`.${behavior.config.rootClass} .swiper-slide { width: 100% !important; }`));
  assert.equal(behavior.config.loop, true);
  assert.doesNotMatch(result.html, /swiper-button-disabled/);
  const three = await normalizeHtmlSource({ htmlText: swiperPage(), cssText: swiperCss, sliders: [{ selector: '.demo-slider__swiper', slidesPerView: 3, spaceBetween: 30 }] });
  assert.ok(three.embedCss.includes('.swiper-slide { width: calc((100% - 2 * 30px) / 3) !important; }'));
});

test('Swiper options the Bridge cannot reproduce stop the build', async () => {
  const between = await normalizeHtmlSource({ htmlText: swiperPage(), cssText: swiperCss, sliders: [{ selector: '.demo-slider__swiper', spaceBetween: 10, breakpoints: { 1200: { spaceBetween: 40 } } }] });
  assert.ok(codes(between.report).includes('SWIPER_OPTION_UNSUPPORTED'));
  assert.equal(between.report.ok, false);
  const unknown = await normalizeHtmlSource({ htmlText: swiperPage(), cssText: swiperCss, sliders: [{ selector: '.demo-slider__swiper', effect: 'fade' }] });
  assert.ok(codes(unknown.report).includes('SWIPER_OPTION_UNSUPPORTED'));
  const group = await normalizeHtmlSource({ htmlText: swiperPage(), cssText: swiperCss, sliders: [{ selector: '.demo-slider__swiper', slidesPerGroup: 2 }] });
  assert.ok(codes(group.report).includes('SWIPER_OPTION_UNSUPPORTED'));
  const unmatched = await normalizeHtmlSource({ htmlText: swiperPage(), cssText: swiperCss, sliders: [{ selector: '.missing__swiper', spaceBetween: 10 }] });
  assert.ok(codes(unmatched.report).includes('SWIPER_OPTIONS_UNMATCHED'));
  assert.equal(unmatched.report.ok, false);
  // Breakpoints on a Taptop boundary with the same value everywhere are fine.
  const equal = await normalizeHtmlSource({ htmlText: swiperPage(), cssText: swiperCss, sliders: [{ selector: '.demo-slider__swiper', breakpoints: { 0: { spaceBetween: 20 }, 1024: { spaceBetween: 20 } } }] });
  assert.equal(equal.report.ok, true);
});

test('the track slider snaps like Swiper: clamped at the end, centered when declared', () => {
  // Five 325px slides with a 20px gap in a 728px view: the last position shows the end of the track.
  const lefts = [0, 345, 690, 1035, 1380];
  const widths = [325, 325, 325, 325, 325];
  assert.deepEqual(sliderSnaps({ lefts, widths, view: 728 }), [0, 345, 690, 977]);
  assert.deepEqual(sliderSnaps({ lefts, widths, view: 1360 }), [0, 345]);
  // Everything fits: one position, both arrows disabled.
  assert.deepEqual(sliderSnaps({ lefts: [0, 120], widths: [100, 100], view: 400 }), [0]);
  assert.deepEqual(sliderSnaps({ lefts: [0, 1380, 2760], widths: [1360, 1360, 1360], view: 1440, centered: true }), [-40, 1340, 2720]);
  assert.deepEqual(sliderSnaps({ lefts: [0, 898], widths: [898, 898], view: 898, loop: true }), [0, 898]);
  // At a position clamped to the end Swiper marks the nearest slide active.
  assert.equal(sliderActive({ lefts: [0, 378, 756, 1134], snap: 132 }), 0);
  assert.equal(sliderActive({ lefts: [0, 378, 756, 1134], snap: 764 }), 2);
  assert.equal(sliderActive({ lefts, snap: 977 }), 3);
  assert.equal(sliderActive({ lefts, snap: 345 }), 1);
});

test('the track slider Embed carries config, not source JavaScript', () => {
  const config = { rootClass: 'toolkit-slider_4', mode: 'track', itemClass: 'swiper-slide', wrapperClass: 'swiper-wrapper', previousClass: 'toolkit-slider-prev', nextClass: 'toolkit-slider-next', start: 0, centered: false, loop: false, speed: 300, labels: { previous: 'Back', next: 'Forward' } };
  const code = buildSliderEmbedCode(config);
  assert.match(code, /"mode":"track"/);
  assert.match(code, /toolkit-slider-ready/);
  assert.match(code, /swiper-button-disabled/);
  assert.match(code, /pointerdown/);
  assert.match(code, /DOMContentLoaded/);
  assert.doesNotMatch(code, /new Swiper|<style>/);
  assert.throws(() => buildSliderEmbedCode({ ...config, wrapperClass: 'a b' }), /SLIDER_CONFIG_INVALID/);
  assert.throws(() => buildSliderEmbedCode({ ...config, labels: { previous: '</script>' } }), /SLIDER_CONFIG_INVALID/);
});

test('an HTML intake may declare Swiper options from the source script', () => {
  const base = { schemaVersion: 1, sourceType: 'html', html: { entry: 'input/a/index.html', stylesheets: ['input/a/a.css'] } };
  assert.equal(validateIntake({ ...base, html: { ...base.html, sliders: [{ selector: '.a__swiper', spaceBetween: 16, breakpoints: { 480: { spaceBetween: 20 } }, source: 'input/a/app.js' }] } }).valid, true);
  const bad = validateIntake({ ...base, html: { ...base.html, sliders: [{ selector: 'div > .a', spaceBetween: -1 }] } });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.some(item => item.code === 'INVALID_SLIDER_OPTIONS'));
});

test('a managed build reads the Swiper options of the intake and packages the track slider', async t => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { managedProject, write } = require('../test-support/managed-project');
  const { addArtifact } = require('../lib/project-artifacts');
  const { buildArtifact } = require('../lib/build-artifact');
  const { root } = managedProject(t);
  await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
  write(root, 'input/slider/index.html', swiperPage());
  write(root, 'input/slider/styles.css', swiperCss);
  const registration = { key: 'components/slider', html: 'input/slider/index.html', stylesheets: ['design-system/roles.css', 'input/slider/styles.css'], dependsOn: ['ui-kit'] };
  addArtifact(root, registration);
  const plain = await buildArtifact({ projectRoot: root, artifactKey: 'components/slider' });
  assert.doesNotMatch(fs.readFileSync(path.join(root, plain.htmlPath), 'utf8'), /toolkit-slide-gap/);
  write(root, 'input/slider/intake.json', JSON.stringify({ schemaVersion: 1, sourceType: 'html', html: { entry: 'input/slider/index.html', stylesheets: ['input/slider/styles.css'], sliders: [{ selector: '.demo-slider__swiper', spaceBetween: 16, breakpoints: { 480: { spaceBetween: 20 } } }] } }));
  addArtifact(root, { ...registration, intake: 'input/slider/intake.json' }, { replace: true });
  const declared = await buildArtifact({ projectRoot: root, artifactKey: 'components/slider' });
  assert.equal(declared.status, 'built');
  assert.notEqual(declared.buildId, plain.buildId);
  assert.match(fs.readFileSync(path.join(root, declared.htmlPath), 'utf8'), /toolkit-slide-gap_20_20_20_16/);
  const pkg = fs.readFileSync(path.join(root, declared.jsonPath), 'utf8');
  assert.match(pkg, /toolkit-slider-ready/);
  assert.doesNotMatch(pkg, /swiper-bundle/);
});

test('generated behavior roots are unique per component and stable across rebuilds', async () => {
  // Catalogue slices share one <head>, so the same source index repeats in every component.
  const tilda = page('<div class="root"><div class="t-slds"><div class="t-slds__items-wrapper"><div class="t-slds__item">One</div><div class="t-slds__item">Two</div></div></div><div class="t1196"><div class="t1196__slider"><div class="t1196__item">A</div><div class="t1196__item">B</div></div><button class="t1196__control t1196__control_left">P</button><button class="t1196__control t1196__control_right">N</button></div><div class="t-video-lazyload" data-videolazy-type="mp4" data-videolazy-id="https://video.example.test/a.mp4"></div></div>');
  const sliders = [{ selector: '.demo-slider__swiper', slidesPerView: 1 }];
  const run = componentKey => Promise.all([
    normalizeHtmlSource({ htmlText: swiperPage(), cssText: swiperCss, componentKey, sliders }),
    normalizeHtmlSource({ htmlText: tilda, cssText: '', componentKey })
  ]).then(results => results.flatMap(result => result.behaviors.behaviors.map(item => item.config.rootClass)));
  const first = await run('demo/components/first');
  const second = await run('demo/components/second');
  assert.equal(first.length, 4);
  for (const [index, name] of first.entries()) {
    assert.match(name, /^toolkit-(slider|carousel|video)_[a-z]{5}_\d+$/, 'letters of the component key, then the source index; no trailing -number');
    assert.notEqual(name, second[index], 'another component never shares the root class');
  }
  assert.deepEqual(await run('demo/components/first'), first, 'a rebuild keeps the names');
  const swiper = await normalizeHtmlSource({ htmlText: swiperPage(), cssText: swiperCss, componentKey: 'demo/components/first', sliders });
  const root = swiper.behaviors.behaviors[0].config.rootClass;
  assert.ok(swiper.embedCss.includes(`.${root} .swiper-slide { width: 100% !important; }`), 'the Embed CSS is keyed on the scoped class');
});
