const assert = require('node:assert/strict');
const test = require('node:test');
const { buildTabsEmbedCode } = require('../lib/tabs-embed-code');
const { normalizeHtmlSource } = require('../lib/html-normalizer');

const page = body => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

test('the tabs embed pairs the n-th trigger with the n-th panel and keeps the source start tab', () => {
  const code = buildTabsEmbedCode({ rootClass: 'plans', triggerClass: 'plans__tab', panelClass: 'plans__panel', activeClass: 'is-selected' });
  assert.match(code, /"triggerSelector":".plans__tab"/);
  assert.match(code, /\.plans \.plans__panel:not\(\.is-selected\) \{ display: none; \}/);
  assert.match(code, /findIndex\(\(trigger\) => trigger\.classList\.contains\(config\.activeClass\)\)/);
  assert.match(code, /ArrowRight/);
  assert.throws(() => buildTabsEmbedCode({ rootClass: 'plans', triggerClass: 'a b', panelClass: 'p', activeClass: 'is-selected' }), /TABS_CONFIG_INVALID/);
});

test('the normalizer declares tabs from plain divs and moves the hidden panel state to the embed', async () => {
  const html = page('<div class="plans" data-taptop-behavior="tabs"><div class="plans__list"><div class="plans__tab is-selected">Month</div><div class="plans__tab">Year</div></div><div class="plans__panel is-selected"><p class="plans__text">Monthly</p></div><div class="plans__panel"><p class="plans__text">Yearly</p></div></div>');
  const css = '.plans__tab { padding: 8px; } .plans__tab.is-selected { color: #3290FF; } .plans__panel { display: none; padding: 16px; } .plans__panel.is-selected { display: block; } .plans__text { margin: 0; }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  assert.equal(result.report.ok, true);
  const tabs = result.behaviors.behaviors.find(item => item.adapter === 'taptop/embed-tabs-v1');
  assert.deepEqual(tabs.config, { rootClass: 'plans', triggerClass: 'plans__tab', panelClass: 'plans__panel', activeClass: 'is-selected' });
  assert.equal(tabs.nodeKeys.length, 5);
  assert.ok(result.report.items.some(item => item.code === 'BEHAVIOR_STATE_TO_EMBED' && item.source === '.plans__panel'));
  assert.match(result.embedCss, /\.plans__panel \{ display: none; \}/);
  assert.match(result.embedCss, /\.plans__tab\.is-selected \{ color: #3290FF; \}/);
});

test('tabs with unequal triggers and panels are refused', async () => {
  const html = page('<div class="plans" data-taptop-behavior="tabs"><div class="plans__tab is-selected">A</div><div class="plans__tab">B</div><div class="plans__panel">Only one</div></div>');
  const result = await normalizeHtmlSource({ htmlText: html, cssText: '' });
  assert.equal(result.report.ok, false);
  assert.ok(result.report.items.some(item => item.code === 'BEHAVIOR_STRUCTURE'));
});

test('accordions with the same classes inside tab panels share one generated script', async () => {
  const item = (q, open) => `<div class="faq__item${open ? ' is-open' : ''}"><div class="faq__question">${q}</div><div class="faq__answer"><p class="faq__text">A</p></div></div>`;
  const list = `<div class="faq__list" data-taptop-behavior="accordion">${item('Q1', true)}${item('Q2')}</div>`;
  const html = page(`<div class="faq" data-taptop-behavior="tabs"><div class="faq__tab is-selected">One</div><div class="faq__tab">Two</div><div class="faq__panel is-selected">${list}</div><div class="faq__panel">${list}</div></div>`);
  const css = '.faq__answer { display: none; } .faq__item.is-open .faq__answer { display: block; } .faq__panel { display: none; } .faq__panel.is-selected { display: block; }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  assert.equal(result.report.ok, true);
  assert.deepEqual(result.behaviors.behaviors.map(item => item.adapter).sort(), ['taptop/embed-accordion-v1', 'taptop/embed-tabs-v1']);
  assert.equal(result.behaviors.behaviors.find(item => item.adapter === 'taptop/embed-accordion-v1').nodeKeys.length, 14);
  assert.ok(result.report.items.some(item => item.code === 'BEHAVIOR_MERGED'));
});

test('a modifier on some items is not taken for the open or active state', async () => {
  const item = (q, cls) => `<div class="steps__item${cls}"><div class="steps__head">${q}</div><div class="steps__panel"><p class="steps__text">A</p></div></div>`;
  const html = page(`<div class="steps" data-taptop-behavior="accordion">${item('One', ' steps__item--done')}${item('Two', ' steps__item--done')}${item('Three', ' is-open')}${item('Four', '')}</div>`);
  const css = '.steps__panel { display: none; } .steps__item.is-open .steps__panel { display: block; }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  assert.equal(result.behaviors.behaviors[0].config.openClass, 'is-open');
  const tabs = page('<div class="t" data-taptop-behavior="tabs"><div class="t__tab t__tab--new">A</div><div class="t__tab is-selected">B</div><div class="t__panel">1</div><div class="t__panel is-selected">2</div></div>');
  const second = await normalizeHtmlSource({ htmlText: tabs, cssText: '.t__panel { display: none; } .t__panel.is-selected { display: block; }' });
  assert.equal(second.behaviors.behaviors[0].config.activeClass, 'is-selected');
});
