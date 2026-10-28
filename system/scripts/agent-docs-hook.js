#!/usr/bin/env node
// Claude Code PostToolUse hook: after an edit of the canonical skill or of the
// CLI description, regenerate the agent entry points and the CLI reference.
// Reads the hook payload from stdin; silent when the edited file is unrelated.
const path = require('node:path');
const { syncAgentDocs } = require('./sync-agent-docs');

const ROOT = path.resolve(__dirname, '../..');
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  let file = '';
  try {
    const payload = JSON.parse(input || '{}');
    file = payload.tool_input?.file_path || payload.tool_response?.filePath || '';
  } catch { return; }
  const relative = path.relative(ROOT, path.resolve(ROOT, file)).split(path.sep).join('/');
  if (!relative.startsWith('system/skills/') && relative !== 'system/lib/cli-usage.js' && relative !== 'AGENTS.md') return;
  try {
    const { written } = syncAgentDocs();
    if (written.length) console.log(JSON.stringify({ systemMessage: `Agent docs regenerated: ${written.join(', ')}` }));
  } catch (error) {
    console.log(JSON.stringify({ systemMessage: `Agent docs sync failed: ${error.message}. Run npm run docs:sync.` }));
  }
});
