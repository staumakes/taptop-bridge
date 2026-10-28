const assert = require('node:assert/strict');
const test = require('node:test');
const { buildMenuEmbedCode } = require('../lib/menu-embed-code');
const { normalizeHtmlSource } = require('../lib/html-normalizer');

const page = body => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

test('the menu embed toggles a root class and scrolls anchors to prefixed sections', () => {
  const code = buildMenuEmbedCode({ rootClass: 'site', toggleClass: 'site__burger', panelClass: 'site__drawer', backdropClass: 'site__shade', anchorPrefix: 'section--' });
  assert.match(code, /"rootSelector":".site"/);
  assert.match(code, /"anchorPrefix":"section--"/);
  assert.match(code, /DOMContentLoaded/);
  assert.match(code, /key === 'Escape'/);
  assert.throws(() => buildMenuEmbedCode({ rootClass: 'site', toggleClass: 'a b', panelClass: 'p' }), /MENU_CONFIG_INVALID/);
});

test('the normalizer declares a menu from a marked root with a burger and a drawer', async () => {
  const html = page('<div class="site" data-taptop-behavior="menu"><div class="site__shade"></div><div class="site__burger"><span class="site__line"></span></div><nav class="site__drawer"><a class="site__link" href="#about">About</a></nav></div>');
  const css = '.site__shade { display: none; } @media (max-width: 767px) { .site.is-open .site__drawer { display: block; } }';
  const result = await normalizeHtmlSource({ htmlText: html, cssText: css });
  assert.equal(result.report.ok, true);
  assert.deepEqual(result.behaviors.behaviors[0].config, { rootClass: 'site', toggleClass: 'site__burger', panelClass: 'site__drawer', openClass: 'is-open', backdropClass: 'site__shade' });
  assert.match(result.embedCss, /\.site\.is-open \.site__drawer \{ display: block; \}/);
});
