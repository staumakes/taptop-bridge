const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..', '..');

test('the public Bridge source tree excludes team projects and private methodology', () => {
  const privateRoots = [
    'projects/taptop',
    'design-system',
    'html-export',
    'system/skills/taptop-site-structure',
    '.claude/skills/taptop-site-structure',
    '.agents/skills/taptop-site-structure',
    '.codex-finalizer',
    '.presentation-build',
    '.obsidian',
    '.work',
    'system/agents',
    'system/docs/handoffs',
    'system/docs/references',
    'system/docs/superpowers',
    'system/docs/agent-operating-model.md',
    'system/docs/implementation-plan.md',
    'system/docs/mvp-release-checklist.md',
    'system/docs/release/migration-map.md',
    'system/docs/mvp-release-plan.md',
    'system/docs/behavior-embed-roadmap.md',
    'system/docs/PROVENANCE.md',
    'system/docs/extraction-provenance.json',
    'system/docs/release/provenance-review.md'
  ];

  for (const relative of privateRoots) {
    assert.equal(fs.existsSync(path.join(ROOT, relative)), false, `${relative} must stay in taptop-bridge-team`);
  }
});
