function randomSuffix() {
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}

function makeTagId(used = new Set()) {
  let id;
  do {
    id = `i${randomSuffix()}`;
  } while (used.has(id));
  used.add(id);
  return id;
}

function makeClassId(used = new Set()) {
  let id;
  do {
    id = `class_i${randomSuffix()}`;
  } while (used.has(id));
  used.add(id);
  return id;
}

module.exports = { makeTagId, makeClassId };
