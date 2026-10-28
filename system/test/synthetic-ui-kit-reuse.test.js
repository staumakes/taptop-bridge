const assert = require('node:assert/strict');
const test = require('node:test');
const { buildSyntheticKitAndPage } = require('../test-support/synthetic-kit-and-page');

test('a generated project UI kit and two pages compile with identical role rules', async t => {
  const { kit, page, secondPage } = await buildSyntheticKitAndPage(t);
  const roles = ['type-title', 'btn', 'btn--secondary', 'text-link'];
  const kitByName = new Map(kit.syncPackage.classes.map(item => [item.name, item]));
  for (const name of roles) {
    const kitRole = kitByName.get(name);
    const pageRole = page.syncPackage.classes.find(item => item.name === name);
    const secondPageRole = secondPage.syncPackage.classes.find(item => item.name === name);
    assert.ok(kitRole, `kit is missing ${name}`);
    assert.ok(pageRole, `page is missing ${name}`);
    assert.ok(secondPageRole, `second page is missing ${name}`);
    assert.deepEqual(pageRole.ownedRules, kitRole.ownedRules, `${name} differs from the kit`);
    assert.deepEqual(secondPageRole.ownedRules, kitRole.ownedRules, `${name} differs on the second page`);
  }
  assert.deepEqual(page.syncPackage.classes.filter(item => ['body', 'html', 'root'].includes(item.name)), []);

});

test('a changed page role differs from the generated UI-kit rule', async t => {
  const { kit, page } = await buildSyntheticKitAndPage(t, { pageRoleOverride: '.btn--secondary { background-color: #9a6725; }' });
  const kitRule = kit.syncPackage.classes.find(item => item.name === 'btn--secondary')?.ownedRules;
  const pageRule = page.syncPackage.classes.find(item => item.name === 'btn--secondary')?.ownedRules;
  assert.ok(kitRule && pageRule);
  assert.notDeepEqual(pageRule, kitRule);
});
