const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { LAYER_SYSTEM_CLASSES, RESERVED_CLASS_NAMES, renamedClass } = require('../lib/taptop-system-classes');
const { normalizeHtmlSource } = require('../lib/html-normalizer');

test('the reserved list contains every system class the compiler puts on Taptop layers', () => {
  const literals = ['lib/component-builders.js', 'lib/compiler/ir-to-taptop.js'].flatMap(file =>
    [...fs.readFileSync(path.join(__dirname, '..', file), 'utf8').matchAll(/className(?::| =) '([a-z][a-z0-9_-]*)'/g)].map(match => match[1]));
  assert.ok(literals.includes('button') && literals.includes('div'));
  for (const name of literals) assert.ok(LAYER_SYSTEM_CLASSES.includes(name), `${name} is a Taptop system class missing from the reserved list`);
  for (const name of ['html', 'body', 'head', 'root']) assert.ok(RESERVED_CLASS_NAMES.has(name));
  assert.equal(renamedClass('button'), 'u-button');
});

test('the normalizer renames source classes that collide with Taptop system classes, in HTML and CSS', async () => {
  const result = await normalizeHtmlSource({
    htmlText: '<section class="hero"><a class="button button-primary" href="#">Go</a><p class="text">Copy</p></section>',
    cssText: '.hero { display: block; } .button { display: inline-flex; padding: 12px 16px; } .button:hover { color: #222222; } .button-primary { color: #ffffff; } .text { color: #333333; } @media (max-width: 767px) { .button { padding: 8px 12px; } }'
  });
  assert.match(result.html, /class="u-button button-primary"/);
  assert.match(result.html, /class="u-text"/);
  assert.doesNotMatch(result.html, /class="button[ "]/);
  assert.match(result.css, /\.u-button \{/);
  assert.match(result.css, /\.u-text \{/);
  assert.doesNotMatch(result.css, /(^|[^-\w])\.button(?![\w-])/m);
  assert.match(result.css, /\.button-primary/, 'longer names that only start with a reserved name stay unchanged');
  const renamed = result.report.items.filter(item => item.code === 'RESERVED_CLASS_RENAMED');
  assert.equal(renamed.length, 2);
  assert.ok(renamed.every(item => item.level === 'warning'));
  assert.equal(result.report.ok, true);
});

test('a rename that would collide with an existing source class stops normalization', async () => {
  await assert.rejects(normalizeHtmlSource({ htmlText: '<section class="hero"><a class="button" href="#">A</a><span class="u-button">B</span></section>', cssText: '.hero { display: block; }' }), /NORMALIZE_RESERVED_RENAME_CONFLICT: button/);
});

// Taptop reads a trailing -<number> as its duplicate counter: a new class
// "col-1" whose base "col" has no counter yet is stored as "col", and "q-007"
// as "q-7" (live check of generateByName, 2026-10-12).
test('class names Taptop would respell as a duplicate counter are detected', () => {
  const { counterSafeClass } = require('../lib/taptop-system-classes');
  for (const name of ['col-1', 'mt-0', 'q-01', 'q-007', 'hero__div-inline-1', 'a--1']) assert.equal(counterSafeClass(name), name.replace(/-(\d+)$/, '_$1'), name);
  for (const name of ['card-pad-12', 'page-link-label-2', 'q-10', 'q1', 'q_1', 'q-1a', 'q-1__fill', 'btn']) assert.equal(counterSafeClass(name), name, name);
});

test('the normalizer renames counter-like source classes and never generates them', async () => {
  const result = await normalizeHtmlSource({
    htmlText: '<section class="hero"><div class="col-1" style="color: #111111">A</div><div class="col-2" style="color: #222222">B</div><p class="mt-0">C</p></section>',
    cssText: '.hero { display: block; } .col-1 { padding: 4px; } .col-2 { padding: 8px; } .mt-0 { margin-top: 0px; } @media (max-width: 767px) { .col-1 { padding: 2px; } }'
  });
  assert.match(result.html, /class="col_1 /);
  assert.match(result.html, /class="mt_0"/);
  assert.match(result.html, /class="col-2 /, 'counters Taptop keeps are not renamed');
  assert.match(result.css, /\.col_1 \{/);
  assert.doesNotMatch(result.css, /\.col-1(?![\w-])/);
  const names = [...result.html.matchAll(/class="([^"]+)"/g)].flatMap(match => match[1].split(/\s+/));
  for (const name of names) assert.equal(name, require('../lib/taptop-system-classes').counterSafeClass(name), `${name} would be respelled by Taptop`);
  assert.equal(result.report.items.filter(item => item.code === 'CLASS_COUNTER_RENAMED').length, 2);
});
