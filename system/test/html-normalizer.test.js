const assert = require('node:assert/strict');
const test = require('node:test');
const postcss = require('postcss');

const { normalizeHtmlSource } = require('../lib/html-normalizer');

const page = body => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;
const rulesOf = css => {
  const out = {};
  postcss.parse(css).walkRules(rule => {
    const media = rule.parent.type === 'atrule' ? rule.parent.params : 'screen';
    out[`${media} ${rule.selector}`] = Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(decl => [decl.prop, decl.value]));
  });
  return out;
};
const codes = report => report.items.map(item => item.code);

test('splits grouped selectors into single-class rules', async () => {
  const result = await normalizeHtmlSource({ htmlText: page('<div class="root"><p class="a">A</p><p class="b">B</p></div>'), cssText: '.a, .b { color: #111111; }' });
  const rules = rulesOf(result.css);
  assert.deepEqual(rules['screen .a'], { color: '#111111', display: 'block' });
  assert.deepEqual(rules['screen .b'], { color: '#111111', display: 'block' });
});

test('reports and removes body metadata that has no editable layer', async () => {
  const html = page('<div class="page"><div class="cover"><meta itemprop="image" content="preview.jpg"><p class="caption">Cover</p></div></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.caption { color: #111111; }' });
  assert.doesNotMatch(result.html.split('<body>')[1], /<meta/);
  assert.ok(codes(result.report).includes('BODY_METADATA_DROPPED'));
});

test('keeps a nested icon button as an editable container layer', async () => {
  const html = page('<div class="root"><button class="arrow" type="button"><span class="icon">→</span></button></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.arrow { display: flex; width: 40px; height: 40px; }' });
  assert.match(result.html, /<button[^>]*data-taptop-kind="container"[^>]*><span class="icon"/);
  assert.ok(codes(result.report).includes('NESTED_BUTTON_AS_CONTAINER'));
});

test('keeps inline links and line breaks together as editable rich text', async () => {
  const html = page('<div class="root"><div class="footer-links"><a class="footer-link" href="/about">About</a><br><br><a class="footer-link" href="/contact">Contact</a></div></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.footer-links { color: #222; }' });
  assert.match(result.html, /<div class="footer-links"[^>]*data-taptop-kind="rich-text"/);
  assert.match(result.html, /<br[^>]*><br[^>]*><a/);
  assert.ok(codes(result.report).includes('INLINE_RUN_AS_RICH_TEXT'));
});

test('declares Tilda slide controls and keeps the first slide visible without source scripts', async () => {
  const html = page('<div class="root"><div class="t-slds" style="visibility: hidden"><button class="t-slds__arrow-left">Prev</button><div class="t-slds__items-wrapper"><div class="t-slds__item">One</div><div class="t-slds__item">Two</div></div><button class="t-slds__arrow-right">Next</button><div class="t-slds__bullet"></div><div class="t-slds__bullet"></div></div></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '' });
  assert.equal(result.behaviors.behaviors.length, 1);
  assert.equal(result.behaviors.behaviors[0].adapter, 'taptop/embed-slider-v1');
  assert.equal(result.behaviors.behaviors[0].config.mode, 'slides');
  assert.match(result.html, /t-slds__item toolkit-slide-active/);
  assert.match(result.embedCss, /\.t-slds__item\.toolkit-slide-active \{ display: block !important; \}/);
  assert.ok(codes(result.report).includes('TILDA_SLIDER_DECLARED'));
});

test('declares Tilda inline and popup MP4 behavior without carrying source JavaScript', async () => {
  const html = page('<div class="root"><div class="t-video-lazyload" data-videolazy-type="mp4" data-videolazy-id="https://video.example.test/intro.mp4" data-videolazy-image="images/poster.jpg"></div><a class="launch" href="#watch">Watch</a><div class="t-popup" data-tooltip-hook="#watch"><button class="t-popup__close-wrapper">Close</button><div class="t1013__html5video" data-content-popup-video-url-html5video="https://video.example.test/detail.mp4"><div class="t1013__video-carier"></div></div></div><script>window.sourceRuntime = true</script></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '' });
  assert.deepEqual(result.behaviors.behaviors.map(b => b.adapter), ['taptop/embed-video-v1', 'taptop/embed-video-v1']);
  assert.deepEqual(result.behaviors.behaviors.map(b => b.config.mode), ['inline', 'dialog']);
  assert.match(result.html, /toolkit-video-poster/);
  assert.doesNotMatch(result.html, /sourceRuntime|data-videolazy-id|data-tooltip-hook/);
});

test('declares a reveal Embed for Tilda animation targets and keeps a centered legacy video wrapper centered', async () => {
  const result = await normalizeHtmlSource({
    htmlText: page('<div class="root"><center><div class="t-width t-width_10"><div class="t-animate">Visible after reveal</div></div></center></div>'),
    cssText: '.t-width { width: 100%; } .t-width_10 { max-width: 960px; margin-left: auto; margin-right: auto; } .t-animate { opacity: 0; }'
  });
  const reveal = result.behaviors.behaviors.find(item => item.adapter === 'taptop/embed-reveal-v1');
  assert.ok(reveal, 'Tilda animation targets receive a generated reveal Embed');
  assert.equal(reveal.config.targetClass, 't-animate');
  assert.match(result.html, /toolkit-centered-block/);
  assert.match(result.embedCss, /\.toolkit-center > \.toolkit-centered-block/);
  assert.match(result.embedCss, /\.t-width_10 \{ margin-left: auto; margin-right: auto; \}/);
});

test('reveals a Tilda records root that its source startup script would show', async () => {
  const result = await normalizeHtmlSource({ htmlText: page('<div class="t-records page"><p class="copy">Visible</p></div>'), cssText: '@media screen and (min-width:980px) { .t-records { opacity: 0; } }', rootSelector: '.page' });
  assert.match(result.embedCss, /\.page \{ opacity: 1 !important; \}/);
  assert.ok(codes(result.report).includes('TILDA_ROOT_REVEALED'));
});

test('keeps animation in the embed and drops invalid legacy declarations', async () => {
  const result = await normalizeHtmlSource({
    htmlText: page('<div class="root"><p class="motion">Text</p><p class="copy">Copy</p></div>'),
    cssText: '@keyframes pulse { to { opacity: .5; } } .motion { animation: pulse 1s ease infinite; -webkit-animation: pulse 1s ease infinite; KHTMLOpacity: .5; MozOpacity: .5; filter: alpha(opacity=50); opacity: .5; } .copy { letter-spacing: .45; }'
  });
  const rules = rulesOf(result.css);
  assert.equal(rules['screen .motion'].animation, undefined);
  assert.equal(rules['screen .motion'].KHTMLOpacity, undefined);
  assert.equal(rules['screen .motion'].MozOpacity, undefined);
  assert.equal(rules['screen .motion'].filter, undefined);
  assert.equal(rules['screen .motion'].opacity, '.5');
  assert.equal(rules['screen .copy']?.['letter-spacing'], undefined);
  assert.match(result.embedCss, /\.motion \{ animation: pulse 1s ease infinite; \}/);
  assert.ok(codes(result.report).includes('VENDOR_DROPPED'));
  assert.ok(codes(result.report).includes('INVALID_VALUE_DROPPED'));
});

test('puts both image dimensions on one screen class when selectors split them', async () => {
  const html = page('<div class="frame"><img class="photo" src="photo.png" alt=""></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.photo { width: 80px; } .frame .photo { height: 50px; }' });
  const names = result.html.match(/<img class="([^"]+)"/)?.[1].split(' ') || [];
  const rules = rulesOf(result.css);
  assert.ok(names.some(name => rules[`screen .${name}`]?.width && rules[`screen .${name}`]?.height));
  assert.ok(codes(result.report).includes('IMAGE_DIMENSIONS_JOINED'));
});

test('lowers a same-element compound class selector before embed CSS can override it', async () => {
  const html = page('<div class="frame"><a class="btn flex" href="#">Open</a></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.btn.flex { background-color: transparent; } .frame .btn { background-color: #ef815f; }' });
  assert.doesNotMatch(result.embedCss, /\.btn\.flex\s*\{/);
  assert.ok(codes(result.report).includes('SELECTOR_LOWERED'));
});

test('keeps a generic link rule from overriding a more specific editable link when rich text also matches', async () => {
  const html = page('<div class="frame"><a class="nav" href="/">Home</a><p class="copy">Read <a href="/more">more</a></p></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: ':where(.frame) a { color: orange; } .nav { color: black; }' });
  const rules = rulesOf(result.css);
  const navClasses = result.html.match(/<a class="([^"]+)" href="\/"/)?.[1].split(' ') || [];
  assert.ok(navClasses.some(name => rules[`screen .${name}`]?.color === 'orange'));
  assert.match(result.embedCss, /color: orange/);
  assert.doesNotMatch(result.embedCss, /\.nav--sel-[a-z]+\s*\{[^}]*color: orange/);
});

test('maps desktop-first screen media to Bridge breakpoints and keeps other media for the embed', async () => {
  const css = '.a { width: 10px; } @media screen and (max-width: 991px) { .a { width: 9px; } } @media only screen and (max-width: 767px) { .a { width: 7px; } } @media (max-width: 479px) { .a { width: 4px; } } @media (min-width: 1200px) { .a { width: 12px; } }';
  const result = await normalizeHtmlSource({ htmlText: page('<div class="root"><p class="a">A</p></div>'), cssText: css });
  const rules = rulesOf(result.css);
  assert.equal(rules['(max-width: 991px) .a'].width, '9px');
  assert.equal(rules['(max-width: 767px) .a'].width, '7px');
  assert.equal(rules['(max-width: 479px) .a'].width, '4px');
  assert.match(result.embedCss, /@media \(min-width: 1200px\)\s*\{\s*\.a \{ width: 12px; \}/);
  assert.ok(codes(result.report).includes('MEDIA_TO_EMBED'));
});

test('lowers body and element rules onto the classes they reach without overriding class values', async () => {
  const html = page('<div class="wrap"><h1 class="title">T</h1><p class="copy">P</p></div>');
  const css = 'body { margin: 0; color: #222222; font-family: "Inter", sans-serif; font-size: 16px; } h1, p { margin: 0; } .copy { margin-top: 8px; }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  const rules = rulesOf(result.css);
  assert.equal(rules['screen .wrap'].color, '#222222');
  assert.equal(rules['screen .wrap']['font-family'], 'Inter');
  assert.equal(rules['screen .title']['margin-top'], '0');
  assert.equal(rules['screen .copy']['margin-top'], '8px');
  assert.equal(rules['screen .copy']['margin-bottom'], '0');
  assert.ok(codes(result.report).includes('GLOBAL_RULE_LOWERED'));
});

test('sends relational selectors to the embed stylesheet unchanged', async () => {
  const result = await normalizeHtmlSource({ htmlText: page('<div class="root"><div class="item is-open"><p class="panel">P</p></div></div>'), cssText: '.item.is-open .panel { display: block; } .item:hover .panel { color: #0033ff; }' });
  assert.match(result.embedCss, /\.item\.is-open \.panel \{ display: block; \}/);
  assert.match(result.embedCss, /\.item:hover \.panel \{ color: #0033ff; \}/);
  assert.ok(codes(result.report).includes('SELECTOR_TO_EMBED'));
});

test('maps single-class interaction states to Taptop state rules', async () => {
  const result = await normalizeHtmlSource({ htmlText: page('<div class="root"><a class="btn" href="#">Go</a></div>'), cssText: '.btn { color: #000000; } .btn:hover { color: #0033ff; }' });
  assert.deepEqual(result.manifest.selectorMappings, [{ sourceSelector: '.btn:hover', targetClass: 'btn', channel: 'cm', pseudoSuffix: ':hover' }]);
  assert.equal(rulesOf(result.css)['screen .btn:hover'].color, '#0033ff');
});

test('removes non-portable attributes and reports a broken anchor target', async () => {
  const html = page('<div class="root"><a class="link" href="#contact">Go</a><div class="contact" id="contact" role="region" aria-label="x" tabindex="0" style="color: red">C</div></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '' });
  assert.doesNotMatch(result.html, / id=| role=| aria-| tabindex=| style=/);
  assert.ok(codes(result.report).includes('ANCHOR_TARGET_REMOVED'));
  assert.ok(codes(result.report).includes('INLINE_STYLE_TO_CLASS'));
  assert.match(result.css, /\.contact-inline1 \{\s*color: red;/);
});

test('expands shorthands Taptop stores unreliably', async () => {
  const result = await normalizeHtmlSource({ htmlText: page('<div class="root"><div class="box">x</div></div>'), cssText: '.box { border-top: 1px solid #0a0a0a; gap: 8px 16px; place-items: center; }' });
  assert.deepEqual(rulesOf(result.css)['screen .box'], {
    'border-top-width': '1px', 'border-top-style': 'solid', 'border-top-color': '#0a0a0a',
    'row-gap': '8px', 'column-gap': '16px', 'align-items': 'center', 'justify-items': 'center', display: 'block'
  });
});

test('resolves root custom properties and gives classless elements a stable class', async () => {
  const result = await normalizeHtmlSource({ htmlText: page('<div class="wrap"><p>Plain</p></div>'), cssText: ':root { --ink: #101010; } .wrap { color: var(--ink); }' });
  assert.equal(rulesOf(result.css)['screen .wrap'].color, '#101010');
  assert.match(result.html, /<p class="wrap__p"/);
  assert.ok(codes(result.report).includes('CLASS_GENERATED'));
});

test('declares a marked accordion and moves the hidden panel state into the embed', async () => {
  const html = page(`<div class="root"><div class="faq" data-taptop-behavior="accordion">
    <div class="faq-item is-open"><div class="faq-trigger" role="button" aria-expanded="true">Q1</div><div class="faq-panel" role="region"><p class="faq-answer">A1</p></div></div>
    <div class="faq-item"><div class="faq-trigger" role="button" aria-expanded="false">Q2</div><div class="faq-panel" role="region"><p class="faq-answer">A2</p></div></div>
  </div></div>`);
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.faq-panel { display: none; padding-bottom: 20px; } .faq-item.is-open .faq-panel { display: block; }' });
  assert.equal(result.behaviors.behaviors.length, 1);
  const behavior = result.behaviors.behaviors[0];
  assert.equal(behavior.adapter, 'taptop/embed-accordion-v1');
  assert.deepEqual(behavior.config, { rootClass: 'faq', itemClass: 'faq-item', triggerClass: 'faq-trigger', panelClass: 'faq-panel', openClass: 'is-open' });
  assert.equal(new Set(behavior.nodeKeys).size, behavior.nodeKeys.length);
  assert.equal(rulesOf(result.css)['screen .faq-panel'].display, undefined);
  assert.match(result.embedCss, /\.faq-panel \{ display: none; \}/);
  assert.doesNotMatch(result.html, /data-taptop-behavior/);
});

test('every reported item has a code, a decision and a reason', async () => {
  const result = await normalizeHtmlSource({ htmlText: page('<div class="root"><p class="a" id="x">A</p></div>'), cssText: '* { box-sizing: border-box; } .a { color: #111111 !important; }' });
  assert.ok(result.report.items.length >= 2);
  for (const item of result.report.items) {
    assert.ok(item.code && item.decision && item.reason, JSON.stringify(item));
  }
});

test('a normalized page with a link block, states, an accordion and embed CSS compiles into one package', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { compileProject } = require('../lib/compile-project');
  const html = page(`<div class="landing"><a class="cta" href="#faq"><span class="cta-text">Ask</span><span class="cta-arrow">→</span></a>
    <div class="faq" data-taptop-behavior="accordion">
      <div class="faq-item is-open"><div class="faq-trigger" role="button">Q1</div><div class="faq-panel" role="region"><p class="faq-answer">A1</p></div></div>
      <div class="faq-item"><div class="faq-trigger" role="button">Q2</div><div class="faq-panel" role="region"><p class="faq-answer">A2</p></div></div>
    </div></div>`);
  const css = '.cta { display: inline-flex; gap: 24px; } .cta:hover { background-color: #0a0a0a; } .cta:hover .cta-arrow { transform: translateX(4px); } .faq-panel { display: none; } .faq-item.is-open .faq-panel { display: block; } @media screen and (max-width: 767px) { .cta { gap: 12px; } }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css, componentKey: 'pilot/landing' });
  assert.equal(result.report.ok, true);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-normalize-'));
  fs.writeFileSync(path.join(root, 'taptop.project.json'), JSON.stringify({ schemaVersion: 1, toolkitVersion: require('../../package.json').version, namespace: 'pilot' }));
  fs.mkdirSync(path.join(root, 'source/normalized'), { recursive: true });
  fs.writeFileSync(path.join(root, result.manifest.html), result.html);
  fs.writeFileSync(path.join(root, result.manifest.stylesheets[0]), result.css);
  fs.writeFileSync(path.join(root, result.manifest.embedStylesheet), result.embedCss);
  fs.writeFileSync(path.join(root, result.manifest.behaviorManifest), JSON.stringify(result.behaviors));
  fs.writeFileSync(path.join(root, 'source/normalized/manifest.json'), JSON.stringify(result.manifest));
  await compileProject(root, 'source/normalized/manifest.json', path.join(root, 'out.json'));
  const wrapper = JSON.parse(fs.readFileSync(path.join(root, 'out.json'), 'utf8'));
  const adapters = wrapper.behaviorPackages.map(item => item.adapter).sort();
  assert.deepEqual(adapters, ['taptop/embed-accordion-v1', 'taptop/embed-styles-v1']);
  const styles = wrapper.behaviorPackages.find(item => item.adapter === 'taptop/embed-styles-v1');
  const code = Object.values(styles.clipboardData.copiedLayout.tree.tags).find(tag => tag.widgetName === 'tt_embed').embedCode;
  assert.match(code, /^<style>\n\.toolkit-behavior \{ display: none; \}/);
  assert.match(code, /\.cta:hover \.cta-arrow \{ transform: translateX\(4px\); \}/);
  assert.ok(Object.values(wrapper.clipboardData.copiedLayout.tree.tags).some(tag => tag.type === 'tt_link_block'));
  assert.ok(wrapper.clipboardData.copiedLayout.cmSelectorCollection.map['screen/.cta:hover']);
});

test('the prepared page previews with the Taptop page defaults without packaging them', async () => {
  const result = await normalizeHtmlSource({ htmlText: page('<div class="root"><p class="a">A</p></div>'), cssText: '.a { color: #111111; }' });
  assert.match(result.html, /<link rel="stylesheet" href="taptop-preview.css">\n<link rel="stylesheet" href="page.css">/);
  assert.match(result.previewCss, /box-sizing: border-box/);
  assert.doesNotMatch(result.css, /box-sizing/);
  assert.deepEqual(result.manifest.stylesheets, ['source/normalized/page.css']);
});

test('keeps relative line-heights as written (they import as custom values), per breakpoint', async () => {
  const html = page('<div class="wrap"><h1 class="title">T</h1><p class="lead">L</p><p class="note">N</p></div>');
  const css = '.wrap { font-size: 16px; line-height: 1.5; } .title { font-size: 144px; line-height: 0.94; } .lead { font-size: 22px; } .note { font-size: 15px; line-height: 20px; } @media (max-width: 767px) { .title { font-size: 72px; line-height: 96%; } .lead { font-size: 18px; } }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  const rules = rulesOf(result.css);
  assert.equal(rules['screen .wrap']['line-height'], '1.5');
  assert.equal(rules['screen .title']['line-height'], '0.94');
  assert.equal(rules['screen .lead']['line-height'], undefined, 'inherits the factor like in the browser');
  assert.equal(rules['screen .note']['line-height'], '20px');
  assert.equal(rules['(max-width: 767px) .title']['line-height'], '96%');
  assert.ok(codes(result.report).includes('LINE_HEIGHT_CUSTOM'));
});

test('writes font-family as the bare Taptop font name', async () => {
  const result = await normalizeHtmlSource({ htmlText: page('<div class="root"><h1 class="title">T</h1></div>'), cssText: '.title { font-family: "Inter Tight", "Inter", Helvetica, sans-serif; }' });
  assert.equal(rulesOf(result.css)['screen .title']['font-family'], 'Inter Tight');
  assert.ok(codes(result.report).includes('FONT_NAME'));
  assert.ok(!codes(result.report).includes('FONTS_REQUIRED'));
});

test('writes back the browser values that Taptop layer base classes would override', async () => {
  const html = page('<div class="root"><header class="bar"><a class="logo" href="#"><img class="logo-image" src="a.png" alt=""></a><nav class="links"><a class="link" href="#">A</a></nav></header><div class="hero"><div class="hero__inner"><img class="hero__bg" src="b.png" alt=""></div></div><h2 class="title">T</h2><span class="note">n</span></div>');
  const css = '.bar { display: flex; justify-content: space-between; } .links { display: flex; gap: 20px; } .logo-image { width: 116px; } .hero { position: relative; } .hero__bg { position: absolute; inset: 0; } .title { display: flex; }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  const rules = rulesOf(result.css);
  assert.equal(rules['screen .links'].width, 'auto', 'a flex child block must not stretch to 100%');
  assert.equal(rules['screen .logo-image'].height, 'auto', 'an image with only a width keeps its ratio');
  assert.equal(rules['screen .logo-image'].width, '116px');
  assert.equal(rules['screen .hero__inner'].position, 'static', 'the absolute image keeps .hero as its containing block');
  assert.equal(rules['screen .hero'].position, 'relative');
  assert.equal(rules['screen .title'].display, 'flex', 'a source display is never replaced');
  assert.equal(rules['screen .link']?.display, undefined, 'items of a flex parent need no display');
  assert.equal(rules['screen .note']?.display, undefined, 'inline text stays inline-flex');
  assert.ok(codes(result.report).includes('TAPTOP_BASE_RESET'));
  assert.match(result.previewCss, /:where\([^)]*\[data-taptop-key="links-1"\][^)]*\) \{\n  width: 100%;/, 'the preview gives each element the base of its layer type');
});

test('a layer reset skips a class that layers of another type share (a kit role on text and on a line container)', async () => {
  const html = page('<div class="root"><p class="role block-a">A</p><div class="role block-b"><span>one</span><span>two</span></div></div>');
  const css = '.role { font-size: 14px; } .block-a { color: #111111; } .block-b { display: flex; flex-direction: column; }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  const rules = rulesOf(result.css);
  assert.equal(rules['screen .role'].width, undefined, 'the shared role keeps exactly its source rules');
  assert.equal(rules['screen .block-b'].width, 'auto', 'the container reset goes to its own class');
});

test('a scroll reveal whose state class only a dropped script adds shows its final state', async () => {
  const html = page('<div class="root"><div class="card">A<div class="card__image">I</div></div><div class="tab">B</div><div class="tab is-active">C</div></div><script>observe(".card")</script>');
  const css = '.card { opacity: 0; transform: translateY(16px); transition: opacity 500ms ease; color: #111111; } .card.is-visible { opacity: 1; transform: translateY(0); } .card__image { opacity: 0; } .card.is-visible .card__image { opacity: 1; } .tab { opacity: 0; } .tab.is-active { opacity: 1; }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  const rules = rulesOf(result.css);
  assert.equal(rules['screen .card'].opacity, '1', 'nothing can add is-visible any more: the card would stay invisible');
  assert.equal(rules['screen .card'].transform, 'translateY(0)');
  assert.equal(rules['screen .card__image'].opacity, '1', 'a child shown through the state of its card');
  assert.equal(rules['screen .tab'].opacity, '0', 'a state class present in the markup is a real state, kept as written');
  assert.ok(codes(result.report).includes('REVEAL_STATE_APPLIED'));
});

test('drops document smooth scrolling because it freezes the Taptop editor canvas', async () => {
  const result = await normalizeHtmlSource({ htmlText: page('<div class="root"><p class="a">A</p></div>'), cssText: 'html { scroll-behavior: smooth; color-scheme: light; }' });
  assert.doesNotMatch(result.embedCss, /scroll-behavior/);
  assert.match(result.embedCss, /color-scheme: light/);
  assert.ok(codes(result.report).includes('SCROLL_BEHAVIOR_DROPPED'));
});

test('a text class shared by block and inline elements: the class takes one value, the other group its own class', async () => {
  const result = await normalizeHtmlSource({ htmlText: page('<div class="root"><div class="caption">A</div><div class="x"><span class="caption">B</span></div></div>'), cssText: '.caption { color: #111111; }' });
  const rules = rulesOf(result.css);
  assert.equal(rules['screen .caption'].display, 'block');
  assert.match(result.html, /<span class="caption caption--base"/);
  assert.equal(rules['screen .caption--base'].display, 'inline-flex', 'Taptop\'s own text default, written out');
  assert.ok(codes(result.report).includes('TAPTOP_BASE_VARIANT'));
  assert.ok(!codes(result.report).includes('TAPTOP_BASE_CONFLICT'));
});

test('lifts <style> blocks from the page into the stylesheet cascade, in document order', async () => {
  const html = '<!doctype html><html><head><style>.wrap { display: block; } .note { color: #111111; }</style></head><body><div class="wrap"><p class="note">Hi</p><style>.note { color: #222222; }</style></div></body></html>';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.note { color: #000000; }' });
  assert.equal(rulesOf(result.css)['screen .note'].color, '#222222', 'later <style> blocks win, as in the browser');
  assert.doesNotMatch(result.html, /<style/);
  assert.ok(codes(result.report).includes('STYLE_BLOCK_LIFTED'));
  assert.equal(result.report.ok, true);
});

test('drops source <script> elements with a warning instead of blocking the page', async () => {
  const html = page('<div class="wrap"><p class="note">Hi</p><script>track()</script><script src="https://example.test/a.js"></script></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.wrap { display: block; } .note { color: #111111; }' });
  assert.doesNotMatch(result.html, /<script/);
  const dropped = result.report.items.filter(item => item.code === 'SCRIPT_DROPPED');
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].level, 'warning');
  assert.equal(result.report.ok, true);
});

test('turns native <details>/<summary> FAQ items into the accordion behavior with editable layers', async () => {
  const item = (open, q) => `<details class="faq-item"${open ? ' open' : ''}><summary class="faq-question">${q}</summary><div class="faq-answer"><p class="faq-text">Answer</p></div></details>`;
  const html = page(`<section class="faq"><h2 class="faq-title">FAQ</h2>${item(true, 'One')}${item(false, 'Two')}</section>`);
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.faq { display: block; } .faq-item { display: block; } .faq-question { display: block; } .faq-answer { display: block; } .faq-text { margin: 0; } .faq-title { margin: 0; }' });
  assert.equal(result.report.ok, true, JSON.stringify(result.report.items.filter(i => i.level === 'error')));
  assert.doesNotMatch(result.html, /<details|<summary/);
  assert.equal(result.behaviors.behaviors.length, 1);
  assert.equal(result.behaviors.behaviors[0].adapter, 'taptop/embed-accordion-v1');
  assert.deepEqual(Object.keys(result.behaviors.behaviors[0].config).sort(), ['itemClass', 'openClass', 'panelClass', 'rootClass', 'triggerClass']);
  assert.equal(result.behaviors.behaviors[0].config.triggerClass, 'faq-question');
  assert.ok(codes(result.report).includes('DETAILS_TO_ACCORDION'));
});

test('wraps bare text runs inside flex containers into text layers, which keeps the layout identical', async () => {
  const html = page('<div class="wrap"><a class="cta" href="#">Start now<img class="cta-icon" src="data:image/png;base64,AA==" width="8" height="8" alt=""></a><span class="label">Plain <img class="label-icon" src="data:image/png;base64,AA==" width="8" height="8" alt=""></span></div>');
  const css = '.wrap { display: block; } .cta { display: inline-flex; gap: 4px; } .cta-icon { display: block; } .label { display: inline; } .label-icon { display: inline; }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  assert.match(result.html, /<a class="cta"[^>]*><span class="cta__text"[^>]*>Start now<\/span><img/);
  assert.ok(codes(result.report).includes('TEXT_RUN_WRAPPED'));
  assert.ok(result.report.items.some(item => item.code === 'MIXED_CONTENT' && /label/.test(item.source)), 'text in an inline (non-flex) parent still needs rich text and stays an error');
});

test('an unclosed CSS block is closed at the end of its own stylesheet, as browsers do', async () => {
  const html = '<!doctype html><html><head><style>.note { color: #111111; } @supports (display: grid) { .wrap { display: block; }</style><style>.note { margin: 0; }</style></head><body><div class="wrap"><p class="note">Hi</p></div></body></html>';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '' });
  assert.equal(result.report.ok, true, JSON.stringify(result.report.items.filter(i => i.level === 'error')));
  assert.equal(rulesOf(result.css)['screen .note']['margin-top'], '0', 'the second <style> is not swallowed by the unclosed block of the first');
  assert.ok(result.report.items.some(item => item.code === 'CSS_BLOCK_AUTO_CLOSED' && item.level === 'warning'));
});

test('a CSS syntax error the browser would not recover from is reported, not thrown', async () => {
  const result = await normalizeHtmlSource({ htmlText: page('<div class="wrap"><p class="note">Hi</p></div>'), cssText: '.note { color: #111111; } } .wrap { display: block; }' });
  assert.equal(result.report.ok, false);
  assert.ok(result.report.items.some(item => item.code === 'CSS_PARSE_ERROR'));
});

test('a keyed copy of the original carries the same data-taptop-key as the result, despite structural changes', async () => {
  const html = page('<section class="faq"><script>x()</script><details class="faq-item"><summary class="faq-question">Q</summary><div class="faq-answer"><p class="faq-text">A</p></div></details><div class="cta">Go<img class="cta-icon" src="data:image/png;base64,AA==" width="8" height="8" alt=""></div></section>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.faq { display: block; } .faq-item { display: block; } .faq-question { display: block; } .faq-answer { display: block; } .faq-text { margin: 0; } .cta { display: flex; } .cta-icon { display: block; }' });
  const keyOf = (text, pattern) => new RegExp(`<${pattern}[^>]*data-taptop-key="([^"]+)"`).exec(text)?.[1];
  assert.ok(result.keyedOriginal, 'keyed original is returned');
  assert.match(result.keyedOriginal, /<details class="faq-item"[^>]*data-taptop-key=/, 'the original markup is kept, only keys are added');
  assert.match(result.keyedOriginal, /<script>x\(\)<\/script>/);
  assert.equal(keyOf(result.keyedOriginal, 'summary class="faq-question"'), keyOf(result.html, 'div class="faq-question'));
  assert.equal(keyOf(result.keyedOriginal, 'p class="faq-text"'), keyOf(result.html, 'p class="faq-text"'));
  assert.equal(keyOf(result.keyedOriginal, 'img class="cta-icon"'), keyOf(result.html, 'img class="cta-icon"'));
});

test('repeated body and element rules follow the cascade: the later rule wins, class rules still win over both', async () => {
  const html = page('<div class="wrap"><h2 class="title">T</h2><h2 class="own">O</h2></div>');
  const css = 'body { font-family: Arial, sans-serif; color: #111111; } body { font-family: "Inter", Arial; color: #222222; } h2 { margin: 4px; } h2 { margin: 8px; } .own { margin-top: 2px; }';
  const rules = rulesOf((await normalizeHtmlSource({ htmlText: html, cssText: css })).css);
  assert.equal(rules['screen .wrap']['font-family'], 'Inter');
  assert.equal(rules['screen .wrap'].color, '#222222');
  assert.equal(rules['screen .title']['margin-top'], '8px');
  assert.equal(rules['screen .own']['margin-top'], '2px', 'a class value keeps priority over element rules');
  assert.equal(rules['screen .own']['margin-bottom'], '8px');
});

test('CSS variables defined on ancestors (class rules or inline styles) resolve to literal values, as the browser inherits them', async () => {
  const html = page('<div class="wrap" style="--brand: #1d7afc"><div class="card"><p class="t">x</p><a class="more" href="#">y</a></div></div>');
  const css = '.card { --ink: #091e42; display: block; } .t { color: var(--ink); border-color: var(--brand); } .more { color: var(--brand, #000000); } .card > .t { outline-color: var(--ink); }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  const rules = rulesOf(result.css);
  assert.equal(rules['screen .t'].color, '#091e42');
  assert.equal(rules['screen .t']['border-top-color'] || rules['screen .t']['border-color'], '#1d7afc');
  assert.equal(rules['screen .more'].color, '#1d7afc');
  assert.equal(result.report.items.filter(item => item.code === 'VARIABLE_UNRESOLVED').length, 0);
  assert.match(result.embedCss, /\.card\s*\{\s*--ink: #091e42;/, 'definitions travel with selectors that stay in the embed');
  assert.match(result.embedCss, /\.t--sel-[a-z]{5} \{ outline-color: var\(--ink\); \}/);
});

test('ID selectors become class rules on their element instead of being lost with the removed id', async () => {
  const html = page('<div class="wrap"><section id="hero"><h2>T</h2><p class="lead">L</p></section><section id="final"><a href="#hero">Up</a></section><div id="taken" class="hero"></div></div>');
  const css = '#hero, #final { color: #091e42; font-family: "Inter", Arial; } #hero .lead { margin-top: 4px; } #final a:hover { color: #1668e0; } .hero { padding: 1px; } #taken { margin: 2px; }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  const rules = rulesOf(result.css);
  assert.match(result.html, /<section class="[^"]*\bhero\b|<section class="[^"]*\bid-hero\b/);
  const heroClass = /<section class="[^"]*?\b(id-hero|hero)\b/.exec(result.html)[1];
  assert.equal(heroClass, 'id-hero', 'a class that already exists elsewhere is not reused for the id');
  assert.equal(rules[`screen .${heroClass}`].color, '#091e42');
  assert.equal(rules['screen .final'].color, '#091e42');
  assert.equal(rules['screen .final']['font-family'], 'Inter');
  assert.match(result.html, /<p class="lead lead--sel-[a-z]{5}"/, 'the relational rule is matched on the page and gets a class');
  assert.equal(rules[`screen .${result.html.match(/lead--sel-[a-z]{5}/)[0]}`]['margin-top'], '4px');
  assert.equal(rules[`screen .${result.html.match(/final__a--sel-[a-z]{5}/)[0]}:hover`].color, '#1668e0', 'a hover of one layer becomes a Taptop state rule');
  assert.ok(result.report.items.some(item => item.code === 'ID_TO_CLASS'));
});

test('inline SVG stays as one SVG Icon layer with the size it rendered at in the source', async () => {
  const html = page('<div class="row"><svg width="24" height="20" viewBox="0 0 24 20" fill="none"><path d="M0 0h24v20H0z" fill="#1d7afc"/></svg><p class="t">Label</p></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.row { display: block; } .t { margin: 0; }' });
  assert.equal(result.report.ok, true, JSON.stringify(result.report.items.filter(i => i.level === 'error')));
  assert.match(result.html, /<svg (?=[^>]*class="row__svg")(?=[^>]*viewBox="0 0 24 20")[^>]*><path d="M0 0h24v20H0z" fill="#1d7afc"><\/path><\/svg>/);
  assert.doesNotMatch(result.html, /<path[^>]*data-taptop-key/);
  const rules = rulesOf(result.css);
  assert.equal(rules['screen .row__svg'].width, '24px');
  assert.equal(rules['screen .row__svg'].height, '20px');
  assert.match(result.previewCss, /Taptop svg base[\s\S]*display: inline-flex/);
});

test('text with inline formatting becomes one Rich Text layer; classes used only inside it go to the embed', async () => {
  const html = page('<div class="wrap"><p class="lead">Start <strong>now</strong><br>and <span class="chip">FBS</span></p><a class="more" href="#x">Read <em>more</em></a></div>');
  const css = '.wrap { display: block; } .lead { font-size: 20px; line-height: 28px; } .chip { background-color: #ebf4ff; padding: 2px 6px; } .more { color: #1668e0; }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  assert.equal(result.report.ok, true, JSON.stringify(result.report.items.filter(i => i.level === 'error')));
  assert.match(result.html, /<p class="lead"[^>]*data-taptop-kind="rich-text"[^>]*>Start <strong>now<\/strong><br>and <span class="chip">FBS<\/span><\/p>/);
  assert.match(result.html, /<a class="more"[^>]*><span class="more__text"[^>]*data-taptop-kind="rich-text"[^>]*>Read <em>more<\/em><\/span><\/a>/);
  assert.equal(rulesOf(result.css)['screen .badge'], undefined, 'a class inside rich text is not a Taptop layer class');
  assert.match(result.embedCss, /\.chip \{ background-color: #ebf4ff;/);
  assert.ok(result.report.items.some(item => item.code === 'RICH_TEXT_LAYER'));
});

test('mixed content with block elements inside is still blocked, not flattened into rich text', async () => {
  const result = await normalizeHtmlSource({ htmlText: page('<div class="box">Text <div class="inner">block</div></div>'), cssText: '.box { display: block; } .inner { display: block; }' });
  assert.ok(result.report.items.some(item => item.code === 'MIXED_CONTENT'));
});

test('a text tag that only wraps elements becomes rich text (inline formatting) or a container (anything else)', async () => {
  const html = page('<div class="wrap"><h2 class="title"><span class="accent">Hi</span> </h2><span class="logo-box"><img class="logo" src="data:image/png;base64,AA==" width="8" height="8" alt=""></span></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.wrap { display: block; } .title { margin: 0; } .accent { color: #1668e0; } .logo-box { display: inline-block; } .logo { display: block; }' });
  assert.equal(result.report.ok, true, JSON.stringify(result.report.items.filter(i => i.level === 'error')));
  assert.match(result.html, /<h2 class="title"[^>]*data-taptop-kind="rich-text"/);
  assert.match(result.html, /<span class="logo-box"[^>]*data-taptop-kind="container"/);
});

// Live 2026-10-11: the editor canvas writes class rules sorted by class name,
// so of two classes on one element setting the same property, the later name
// wins in Taptop regardless of the source order.
test('writes class rules in Taptop name order and repeats a changed winner in a class sorting last', async () => {
  const html = page('<div class="wrap"><p class="lead accent--light">Text</p><p class="lead zz-note">Note</p></div>');
  const css = '.wrap { display: block; } .lead { margin: 0; color: #111111; } .accent--light { color: #ffffff; } .zz-note { margin-top: 20px; }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  const selectors = [];
  postcss.parse(result.css).walkRules(rule => { if (rule.parent.type === 'root') selectors.push(rule.selector); });
  assert.deepEqual(selectors.filter(s => ['.lead', '.accent--light', '.zz-note'].includes(s)), ['.accent--light', '.lead', '.zz-note']);
  const conflict = result.report.items.find(item => item.code === 'CLASS_ORDER_CONFLICT');
  assert.ok(conflict, 'the color modifier sorts before .lead, so Taptop would keep #111111');
  assert.equal(conflict.count, 1, '.zz-note sorts after .lead and keeps its margin, as in the source');
  assert.match(conflict.samples[0], /\.accent--light #ffffff → \.lead #111111/);
  assert.match(result.html, /class="lead accent--light lead--order-[a-z]{5}"/);
  const orderClass = result.html.match(/lead--order-[a-z]{5}/)[0];
  assert.match(result.html, /class="lead zz-note"/);
  const order = [];
  postcss.parse(result.css).walkRules(rule => { if (rule.parent.type === 'root') order.push(rule.selector); });
  assert.ok(order.indexOf(`.${orderClass}`) > order.indexOf('.lead'));
  assert.match(result.css, new RegExp(`\\.${orderClass} \\{\\s*color: #ffffff;\\s*\\}`));
  assert.equal(result.report.items.find(item => item.code === 'CLASS_ORDER_OVERRIDE').count, 1);
});

test('order classes are shared by equal elements, never collide and follow breakpoints', async () => {
  const html = page('<div class="wrap"><p class="lead accent--light">A</p><p class="lead accent--light">B</p><p class="lead--order">C</p></div>');
  const css = '.wrap { display: block; } .lead { color: #111111; } .accent--light { color: #ffffff; } .lead--order { margin: 0; } @media (max-width: 767px) { .lead { color: #222222; } .accent--light { color: #eeeeee; } }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  const names = result.html.match(/lead--order-[a-z]+/g) || [];
  assert.equal(names.length, 2, 'one shared class');
  assert.equal(new Set(names).size, 1);
  assert.match(result.css, new RegExp(`\\.${names[0]} \\{\\s*color: #ffffff;`));
  assert.match(result.css, new RegExp(`@media \\(max-width: 767px\\) \\{[\\s\\S]*\\.${names[0]} \\{\\s*color: #eeeeee;`));
});

// Taptop writes breakpoint blocks after the base rules, so a breakpoint rule of
// any class beats a base rule there. In the source a more specific base rule,
// or a later one, keeps its value at every width.
test('a more specific base rule keeps its value at the breakpoints, as in the source', async () => {
  const html = page('<div class="section-x"><div class="panel"><p class="t">A</p></div></div><div class="other"><div class="panel"><p class="t">B</p></div></div>');
  const css = '.section-x, .other { display: block; } .panel { max-width: 800px; } @media (max-width: 767px) { .panel { max-width: 480px; } } @media (max-width: 479px) { .panel { max-width: 300px; } } .section-x .panel { max-width: none; }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  const rules = rulesOf(result.css);
  const name = result.html.match(/panel--sel-[a-z]+--order-[a-z]{5}/)?.[0];
  assert.ok(name, result.html);
  assert.equal(rules[`(max-width: 767px) .${name}`]['max-width'], 'none');
  assert.equal(rules[`(max-width: 479px) .${name}`]['max-width'], 'none');
  assert.equal(rules[`screen .${name}`], undefined, 'at screen level the lowered class already wins by name');
  assert.match(result.html, /<div class="panel"[^>]*>\s*<p class="t"[^>]*>B/, 'the other panel follows the breakpoints');
  const conflict = result.report.items.find(item => item.code === 'CLASS_ORDER_CONFLICT');
  assert.ok(conflict.samples.some(sample => /max-width @\(max-width: 767px\): \.panel--sel-[a-z]+ none \(screen\) → \.panel 480px \(\(max-width: 767px\)\)/.test(sample)), conflict.samples.join('\n'));
});

test('a later base rule of one class beats its earlier breakpoint rule at every width', async () => {
  const html = page('<div class="wrap"><p class="lead">A</p></div>');
  const css = '.wrap { display: block; } .lead { color: #111111; } @media (max-width: 991px) { .lead { color: #222222; } } .lead { color: #333333; }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  const rules = rulesOf(result.css);
  const name = result.html.match(/lead--order-[a-z]{5}/)?.[0];
  assert.ok(name, 'one class elements need the order class too');
  assert.equal(rules['screen .lead'].color, '#333333');
  assert.equal(rules[`(max-width: 991px) .${name}`].color, '#333333');
});

test('a breakpoint rule written after the base rule wins at its widths without an order class', async () => {
  const html = page('<div class="wrap"><p class="lead x-tone">A</p></div>');
  const css = '.wrap { display: block; } .x-tone { color: #111111; } @media (max-width: 767px) { .lead { color: #222222; } }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  assert.doesNotMatch(result.html, /--order-/);
});

test('a class under different inherited line-heights needs no extra classes', async () => {
  const html = page('<div class="wrap"><div class="big"><span class="label">A</span></div><div class="small"><span class="label">B</span></div></div>');
  const css = '.wrap { display: block; } .big { font-size: 20px; line-height: 1.5; } .small { font-size: 10px; line-height: 2; }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  assert.doesNotMatch(result.html, /--lh/);
  assert.equal(rulesOf(result.css)['screen .label']?.['line-height'], undefined);
});

test('a fluid line-height (clamp/calc with vw) is kept, so every width matches the source', async () => {
  const html = page('<div class="wrap"><div class="title"><span class="inner">Title</span></div></div>');
  const css = '.wrap { display: block; } .title { font-size: clamp(1.375rem, calc(0.926vw + 1.167rem), 2rem); line-height: clamp(26px, calc(0.926vw + 22.667px), 36px); }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  assert.equal(rulesOf(result.css)['screen .title']['line-height'], 'clamp(26px, calc(0.926vw + 22.667px), 36px)');
});


test('rich text gets the Taptop Rich Text base (block) in the preview, apart from plain text with the same class', async () => {
  const html = page('<div class="wrap"><span class="copy">Plain</span><span class="copy">Rich <b>bold</b> text</span><div class="row"><span class="copy">In <b>row</b></span></div></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.wrap { display: block; } .row { display: flex; }' });
  assert.match(result.previewCss, /Taptop rich-text base \*\/\n:where\([^)]*copy-2[^)]*\) \{\n  display: block;/);
  assert.match(result.previewCss, /Taptop text base \*\/\n:where\(\[data-taptop-key="copy-1"\]\)/);
  assert.match(result.html, /class="copy copy--base"[^>]*>Rich/, 'the inline rich text gets its own display class');
  assert.equal(rulesOf(result.css)['screen .copy--base'].display, 'inline-block');
});

test('a base reset is written even when another class sizes one element, and loses to it', async () => {
  const html = page('<div class="row"><div class="card"><p class="t">A</p></div><div class="card a-half"><p class="t">B</p></div></div>');
  const css = '.row { display: flex; } .a-half { width: 50%; } .card { padding: 8px; }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  const rules = rulesOf(result.css);
  assert.equal(rules['screen .card'].width, 'auto', 'flex items keep their content width');
  assert.match(result.html, /class="card a-half card--order-[a-z]{5}"/, '.a-half sorts before .card, so Taptop needs an order class');
  assert.equal(rules[`screen .${result.html.match(/card--order-[a-z]{5}/)[0]}`].width, '50%');
  assert.equal(result.report.items.some(item => item.code === 'TAPTOP_BASE_CONFLICT'), false);
});

test('relational, attribute and structural selectors become classes on the elements they reach', async () => {
  const html = page('<div class="hero"><div aria-hidden="true"><i class="d"></i><i class="d"></i><i class="d"></i></div><div class="copy"><p class="t">A</p><p class="t">B</p></div><ul class="list"><li class="item is-open"><p class="panel">P</p></li></ul></div>');
  const css = [
    '.hero { position: relative; } .d { display: block; } .t { margin: 0; color: #111111; } .panel { display: none; }',
    '.hero > div[aria-hidden="true"] > .d:nth-child(3) { transform: rotate(-24deg); }',
    '.copy .t + .t { margin-top: 12px; }',
    '.copy .t:first-child::after { content: "*"; }',
    '.item.is-open .panel { display: block; }',
    '.nothing .here { color: red; }',
    '@media (min-width: 900px) { .hero > div > .d:nth-child(3) { opacity: .5; } }',
    '@media (max-width: 767px) { .copy .t + .t { margin-top: 8px; } }'
  ].join('\n');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  const rules = rulesOf(result.css);
  const icon = Object.keys(rules).find(key => /^screen \.d--sel-[a-z]{5}$/.test(key) && rules[key].transform === 'rotate(-24deg)').slice(8);
  assert.equal(result.html.split(icon).length - 1, 1, 'only the third icon');
  const sibling = Object.keys(rules).find(key => /^screen \.t--sel-[a-z]{5}$/.test(key) && rules[key]['margin-top'] === '12px').slice(8);
  assert.equal(rules[`(max-width: 767px) .${sibling}`]['margin-top'], '8px', 'the same selector in a breakpoint uses the same class');
  const after = result.html.match(/<p class="t (t--sel-[a-z]{5})"[^>]*>A/)?.[1];
  assert.ok(after && after !== sibling, 'the first paragraph gets the ::after class');
  assert.match(result.embedCss, new RegExp(`\\.${after}::after \\{ content: "\\*"; \\}`), 'a pseudo-element goes to the embed on the class');
  assert.match(result.embedCss, /\.item\.is-open \.panel \{ display: block; \}/, 'a script-toggled state stays as it is');
  assert.doesNotMatch(result.embedCss, /\.nothing \.here/, 'a selector no element can match is dropped (Taptop caps an Embed at 50 000 characters)');
  assert.ok(result.report.items.some(item => item.code === 'UNUSED_RULE' && (item.samples || []).includes('.nothing .here')));
  assert.match(result.embedCss, /@media \(min-width: 900px\)[\s\S]*\.d--sel-[a-z]{5} \{ opacity: \.5; \}/, 'outside Taptop breakpoints the embed targets the class');
  assert.ok(result.report.items.some(item => item.code === 'SELECTOR_LOWERED'));
});

test('the preview loads the source Google Fonts link also when it is written with http or //', async () => {
  const html = '<!doctype html><html><head><link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Inter:400,700&subset=cyrillic"></head><body><div class="wrap"><p class="t">A</p></div></body></html>';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.wrap { display: block; }' });
  assert.match(result.html, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css\?family=Inter:400,700&amp;subset=cyrillic">/);
});

test('the preview loads the page font families from Google Fonts, never system fonts', async () => {
  const result = await normalizeHtmlSource({ htmlText: page('<div class="wrap"><p class="t">A</p><p class="u">B</p></div>'), cssText: '.wrap { display: block; } .t { font-family: "Inter", Arial, sans-serif; } .u { font-family: Arial, sans-serif; }' });
  assert.match(result.html, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css\?family=Inter:[^"]*">/);
  assert.doesNotMatch(result.html, /family=Arial/);
});

test('the font shorthand becomes separate font properties (Taptop has no font shorthand)', async () => {
  const html = page('<div class="wrap"><h2 class="h">Title</h2><p class="p">Text</p><p class="q">Q</p></div>');
  const css = '.wrap { display: block; } .h { font: 700 clamp(30px, 3.4vw, 44px)/1.12 Inter,Arial,sans-serif; } .p { font: italic 400 16px/24px "Open Sans", Arial; } .q { font: inherit; }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  const rules = rulesOf(result.css);
  assert.equal(rules['screen .h']['font-weight'], '700');
  assert.equal(rules['screen .h']['font-size'], 'clamp(30px, 3.4vw, 44px)');
  assert.equal(rules['screen .h']['font-family'], 'Inter');
  assert.equal(rules['screen .h']['line-height'], '1.12');
  assert.equal(rules['screen .h'].font, undefined);
  assert.deepEqual([rules['screen .p']['font-style'], rules['screen .p']['font-family'], rules['screen .p']['line-height']], ['italic', 'Open Sans', '24px']);
});

test('a variable switched in a media query keeps working: resolved in the class, var() form in the embed', async () => {
  const html = '<!doctype html><html><head><style>@media (max-width: 900px) { #box { --dir: column; } }</style></head><body><div id="box" class="box" style="--dir: row"><div class="cards" style="display: flex; flex-direction: var(--dir)"><p class="c">A</p><p class="c">B</p></div></div></body></html>';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '' });
  const rules = rulesOf(result.css);
  const inline = Object.keys(rules).find(key => /^screen \.cards-inline/.test(key));
  assert.equal(rules[inline]['flex-direction'], 'row');
  assert.match(result.embedCss, /\.cards-inline1 \{ flex-direction: var\(--dir\); \}/);
  assert.match(result.embedCss, /@media \(max-width: 900px\)[\s\S]*--dir: column/);
  assert.ok(result.report.items.some(item => item.code === 'VARIABLE_BY_MEDIA'));
});

test('keeps contextual custom properties and their var() consumers in the embed', async () => {
  const html = page('<div id="rec1" class="record"><a class="btn" href="#">Open</a></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '#rec1 .btn { --border-width: 1px; } .btn { border-style: solid; border-width: var(--border-width, 0px); }' });
  assert.match(result.embedCss, /\.rec1 \.btn \{ --border-width: 1px; \}/);
  assert.match(result.embedCss, /\.btn \{ border-width: var\(--border-width, 0px\); \}/);
  assert.ok(codes(result.report).includes('CUSTOM_PROPERTY_TO_EMBED'));
  assert.ok(codes(result.report).includes('VARIABLE_TO_EMBED'));
});

test('uses scroll attachment for a Tilda cover background without copying startup JavaScript', async () => {
  const html = page('<div class="root"><div class="t-cover" style="height: 100vh; background-image: url(cover.svg)"><div class="t-cover__carrier" data-content-cover-bg="cover.svg" style="height: 100vh; background-attachment: scroll"></div></div><script>t935__init(1)</script></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.t-cover { background-attachment: fixed; background-size: cover; } .t-cover__carrier { background-size: cover; }' });
  assert.match(result.embedCss, /\.t-cover-inline1 \{ background-image: url\(cover\.svg\); \}/);
  assert.equal(rulesOf(result.css)['screen .t-cover-inline1']['background-attachment'], 'scroll');
  assert.ok(codes(result.report).includes('TILDA_COVER_BACKGROUND_SCROLL'));
});

test('promotes a Tilda cover source held on its carrier before the source runtime is removed', async () => {
  const html = page('<div class="root"><div class="t-cover" style="background-image: url(\'https://thb.tildacdn.net/cover/-/resize/20x/cover.jpg\')"><div class="t-cover__carrier" data-content-cover-bg="https://static.tildacdn.net/cover.jpg"></div></div></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '' });
  assert.match(result.embedCss, /background-image: url\(['"]https:\/\/static\.tildacdn\.net\/cover\.jpg['"]\);/);
  assert.ok(codes(result.report).includes('TILDA_COVER_BACKGROUND_PROMOTED'));
});

test('promotes Tilda lazy media originals before the source runtime is removed', async () => {
  const html = page('<div class="root"><img class="t-img" src="images/thumbnail.jpg" data-original="images/full.jpg" alt=""><div class="t1196__bgimg" data-original="https://static.tildacdn.net/card.jpg" style="background-image: url(\'https://thb.tildacdn.net/card/-/resizeb/20x/card.jpg\')"></div></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '' });
  assert.match(result.html, /<img class="t-img" src="images\/full\.jpg" alt="" data-taptop-key=/);
  assert.doesNotMatch(result.html, /data-original/);
  assert.match(result.embedCss, /background-image: url\(['"]https:\/\/static\.tildacdn\.net\/card\.jpg['"]\);/);
  assert.ok(codes(result.report).includes('TILDA_LAZY_IMAGE_PROMOTED'));
  assert.ok(codes(result.report).includes('TILDA_LAZY_BACKGROUND_PROMOTED'));
});

test('keeps the default Tilda geo variant and removes hidden alternatives', async () => {
  const html = page('<div class="root"><div id="recshown" class="card">Default</div><div id="rechidden-a" class="card">Ukraine</div><div id="rechidden-b" class="card">Kazakhstan</div><script>var showBlocks=\'shown\';var hideBlocks=\'hidden-a,hidden-b\';var card={geo:\'\',hide:hideBlocks.split(\',\'),show:showBlocks.split(\',\')};</script></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.card { display: block; }' });
  assert.match(result.html, /Default/);
  assert.doesNotMatch(result.html, /Ukraine|Kazakhstan/);
  assert.ok(codes(result.report).includes('TILDA_GEO_DEFAULT_APPLIED'));
});

test('a @font-face with a relative font file is reported: the file does not reach Taptop', async () => {
  const css = "@font-face { font-family: 'Brand Display'; src: url('assets/brand.ttf') format('truetype'); } @font-face { font-family: 'Hosted'; src: url('https://cdn.example/hosted.woff2'); } .wrap { display: block; }";
  const result = await normalizeHtmlSource({ htmlText: page('<div class="wrap"><p class="t">A</p></div>'), cssText: css });
  const item = result.report.items.find(entry => entry.code === 'FONT_FILE_RELATIVE');
  assert.equal(item.level, 'warning');
  assert.deepEqual(item.samples, ['Brand Display']);
});

test('splits <picture> art direction into one editable image per Taptop breakpoint', async () => {
  const html = page('<div class="hero"><picture class="art"><source media="(max-width: 767px)" srcset="img/phone.png 1x, img/phone@2x.png 2x"><source media="(max-width: 991px)" srcset="img/tablet.png"><img class="art__img" src="img/desktop.png" alt="" width="300" height="100"></picture></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.art img { display: block; width: 100%; }' });
  assert.ok(codes(result.report).includes('PICTURE_SPLIT'));
  assert.equal(result.report.errors, 0);
  assert.doesNotMatch(result.html, /<picture|<source/);
  const images = [...result.html.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
  assert.equal(images.length, 3);
  assert.ok(images.some(tag => /src="img\/desktop\.png"/.test(tag) && /art__img--desktop/.test(tag)));
  assert.ok(images.some(tag => /src="img\/tablet\.png"/.test(tag) && /art__img--max991/.test(tag) && !/width=/.test(tag)));
  assert.ok(images.some(tag => /src="img\/phone\.png"/.test(tag) && /art__img--max767/.test(tag)));
  const rules = rulesOf(result.css);
  assert.equal(rules['screen .art__img--max991'].display, 'none');
  assert.equal(rules['screen .art__img--max767'].display, 'none');
  assert.equal(rules['(max-width: 991px) .art__img--desktop'].display, 'none');
  assert.equal(rules['(max-width: 991px) .art__img--max991'].display, 'block');
  assert.equal(rules['(max-width: 767px) .art__img--max991'].display, 'none');
  assert.equal(rules['(max-width: 767px) .art__img--max767'].display, 'block');
  // The descendant rule of the source (.art img) reaches every variant through one lowered class.
  const lowered = Object.entries(rules).find(([key, value]) => key.startsWith('screen ') && value.width === '100%')[0].split('.')[1];
  assert.ok(images.every(tag => tag.includes(lowered)));
  assert.ok(images.every(tag => !/art__img--desktop/.test(tag) || /desktop\.png/.test(tag)));
});

test('blocks <picture> sources it cannot map to a Taptop breakpoint', async () => {
  const html = page('<div class="hero"><picture class="art"><source type="image/webp" srcset="img/a.webp"><source media="(min-width: 600px)" srcset="img/b.png"><img class="art__img" src="img/a.png" alt=""></picture></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '' });
  assert.ok(codes(result.report).includes('PICTURE_SOURCE_UNSUPPORTED'));
  assert.ok(result.report.errors > 0);
});

test('blocks remote images instead of failing later on a missing file', async () => {
  const html = page('<div class="card"><img class="card__photo" src="https://example.com/photo.jpg" alt=""></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.card__photo { width: 40px; }' });
  assert.ok(codes(result.report).includes('REMOTE_IMAGE_SOURCE'));
  assert.ok(result.report.errors > 0);
});

test('order classes are named by their values, so two artifacts never give one order class different rules', async () => {
  const html = page('<div class="wrap"><p class="lead accent--light">A</p></div>');
  const run = color => normalizeHtmlSource({ htmlText: html, cssText: `.wrap { display: block; } .lead { color: #111111; } .accent--light { color: ${color}; }` });
  const name = async color => (await run(color)).html.match(/lead--order-[a-z]+/)[0];
  assert.equal(await name('#ffffff'), await name('#ffffff'), 'equal values share one class across artifacts');
  assert.notEqual(await name('#ffffff'), await name('#eeeeee'), 'other values get another class');
});

test('a lowered selector gets the same class name on every page, so the UI kit and pages share it', async () => {
  const css = '.tag { display: inline-flex; } .tag--strong.tag--blue { color: #ffffff; } .tag--soft.tag--blue { color: #3290ff; }';
  const kit = await normalizeHtmlSource({ htmlText: page('<div class="kit"><span class="tag tag--strong tag--blue">A</span></div>'), cssText: css });
  const other = await normalizeHtmlSource({ htmlText: page('<div class="page"><span class="tag tag--soft tag--blue">B</span><span class="tag tag--strong tag--blue">C</span></div>'), cssText: css });
  const strong = kit.html.match(/tag--sel-[a-z]{5}/)[0];
  const names = other.html.match(/tag--sel-[a-z]{5}/g);
  assert.ok(names.includes(strong), 'the same selector keeps its class name on another page');
  assert.equal(new Set(names).size, 2, 'another selector gets another class');
});

test('a <picture> variant stays hidden even when a stronger source rule displays every image inside it', async () => {
  const html = page('<div class="hero"><picture class="art"><source media="(max-width: 767px)" srcset="img/phone.png"><img src="img/desktop.png" alt=""></picture></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '.art, .art img { display: block; width: 100%; }' });
  const rules = rulesOf(result.css);
  const classesOf = src => [...result.html.matchAll(/<img\b[^>]*>/g)].map(match => match[0]).find(tag => tag.includes(`src="${src}"`)).match(/class="([^"]+)"/)[1].split(' ');
  const phone = classesOf('img/phone.png');
  const desktop = classesOf('img/desktop.png');
  // Taptop writes base rules, then each breakpoint block; inside a block class rules
  // follow class-name order. The last level that sets display decides, then the last name.
  const shown = (classes, levels) => {
    for (const media of [...levels].reverse()) {
      const name = classes.filter(item => rules[`${media} .${item}`]?.display).sort((x, y) => x.localeCompare(y, 'en')).pop();
      if (name) return rules[`${media} .${name}`].display;
    }
    return undefined;
  };
  const phoneLevels = ['screen', '(max-width: 991px)', '(max-width: 767px)'];
  assert.equal(shown(phone, ['screen']), 'none', 'the phone image is hidden on desktop');
  assert.equal(shown(phone, phoneLevels), 'block', 'and shown on phones');
  assert.equal(shown(desktop, ['screen']), 'block');
  assert.equal(shown(desktop, phoneLevels), 'none', 'the desktop image is hidden on phones');
});

test('a later Taptop breakpoint rule still overrides an earlier rule that moved to the embed', async () => {
  const html = page('<div class="wrap"><div class="grid"><p class="cell">A</p></div></div>');
  const css = '.grid { display: grid; grid-template-columns: repeat(4, 1fr); } @media (max-width: 1199px) { .grid { grid-template-columns: repeat(3, 1fr); } } @media (max-width: 767px) { .grid { grid-template-columns: 1fr; gap: 8px; } }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  const embed = result.embedCss;
  const wide = embed.indexOf('repeat(3, 1fr)');
  const narrow = embed.indexOf('grid-template-columns: 1fr');
  assert.ok(wide >= 0, 'the 1199px rule is in the embed');
  assert.ok(narrow > wide, 'the later 767px value is repeated in the embed after it, as in the source order');
  assert.match(embed.slice(narrow - 80, narrow), /@media \(max-width: 767px\)/);
  assert.equal(rulesOf(result.css)['(max-width: 767px) .grid']['grid-template-columns'], '1fr', 'the native class keeps the value for the editor controls');
  assert.ok(codes(result.report).includes('MEDIA_ORDER_TO_EMBED'));
});

test('nested CSS rules apply to their nested selector, not to the parent', async () => {
  // Shape of Swiper 12's stylesheet: a nested rule under a selector list, a relative `>` child and `&`.
  const css = `.track:not(.watching), .watching .seen { .spinner { animation: spin 1s linear infinite; } }
.track { position: relative; > .row { display: flex; } &.wide { width: 100%; } }
@keyframes spin { to { transform: rotate(1turn); } }`;
  const result = await normalizeHtmlSource({ htmlText: page('<div class="track wide"><div class="row"><p class="spinner">Wait</p></div></div>'), stylesheets: [{ label: 'nested.css', text: css }] });
  assert.doesNotMatch(result.embedCss, /^\.track[^{]*\{ animation/m, 'the parent never gets the nested animation');
  assert.match(result.embedCss + result.css, /spinner[^{]*\{[^}]*animation: spin/);
  const rules = rulesOf(result.css);
  assert.equal(rules['screen .track'].position, 'relative');
  assert.notEqual(rules['screen .track'].display, 'flex', '> .row is the child row, not the track');
  assert.ok(Object.entries(rules).some(([selector, decls]) => selector.startsWith('screen .row') && decls.display === 'flex'), '> .row reaches the row');
  assert.ok(codes(result.report).includes('CSS_NESTING_FLATTENED'));
});
