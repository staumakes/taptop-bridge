const assert = require('node:assert');
const { test } = require('node:test');
const { makeTagId, makeClassId } = require('../lib/ids');

test('makeTagId returns a 9-char id: "i" + 8 lowercase base36 chars', () => {
  const id = makeTagId();
  assert.match(id, /^i[a-z0-9]{8}$/);
});

test('makeClassId returns "class_i" + 8 lowercase base36 chars', () => {
  const id = makeClassId();
  assert.match(id, /^class_i[a-z0-9]{8}$/);
});

test('ids are unique across many calls against a shared used-set', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) {
    makeTagId(seen);
  }
  assert.strictEqual(seen.size, 500);
});
