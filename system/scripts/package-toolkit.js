#!/usr/bin/env node
// Assembles a Bridge release candidate from an explicit allowlist into a new
// directory and refuses it when private or unsafe material would be included.
// It never zips "the current folder"; .gitignore is not a release filter.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const ALLOWLIST = require('../contracts/distribution/allowlist.json');
const TEXT = /\.(md|js|cjs|json|html|css|txt|yml|yaml)$|^\.gitignore$/;
// Synthetic test inputs use this placeholder home directory on purpose.
const PLACEHOLDER_HOME = '/Users/person/';

function walk(root, relative, out) {
  const absolute = path.join(root, relative);
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`SYMLINK_IN_DISTRIBUTION: ${relative}`);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(absolute).sort()) walk(root, relative ? `${relative}/${name}` : name, out);
  } else out.push(relative);
}

function selectFiles(root = ROOT) {
  const files = [];
  for (const entry of ALLOWLIST.include) {
    const relative = entry.replace(/\/$/, '');
    if (!fs.existsSync(path.join(root, relative))) throw new Error(`ALLOWLISTED_FILE_MISSING: ${entry}`);
    walk(root, relative, files);
  }
  const excluded = ALLOWLIST.exclude.map(item => item.path);
  return files.filter(file => {
    if (path.posix.basename(file) === '.DS_Store') return false;
    return !excluded.some(prefix => prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix);
  });
}

function checkContent(root, files) {
  const problems = [];
  const home = os.homedir();
  for (const file of files) {
    // From .claude/ only the generated skill entry points and the shared hook settings ship; launch and local settings are machine-specific.
    if ((file.startsWith('.claude/') && !file.startsWith('.claude/skills/') && file !== '.claude/settings.json') || ALLOWLIST.neverInclude.some(prefix => file.startsWith(prefix) && !(prefix === 'projects/' && file === 'projects/README.md')) || (/(^|\/)\.taptop\//.test(file) && !file.startsWith('system/templates/project/.taptop/')) || /(^|\/)receipts?\//.test(file)) {
      problems.push(`PRIVATE_PATH: ${file}`);
    }
    if (!TEXT.test(path.posix.basename(file))) continue;
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    if (text.includes(home)) problems.push(`AUTHOR_PATH: ${file}`);
    for (const match of text.matchAll(/\/Users\/[^/\s'"`)]+\//g)) if (match[0] !== PLACEHOLDER_HOME) problems.push(`ABSOLUTE_HOME_PATH: ${file}: ${match[0]}`);
    if (/[?&](?:access|token|auth)=[A-Za-z0-9]{12,}/.test(text)) problems.push(`ACCESS_TOKEN_URL: ${file}`);
    if (file.endsWith('.md')) {
      // A path in backticks must exist in the distribution unless it is a
      // deliberate maintainers-only mention.
      for (const mention of text.matchAll(/`(system\/[^`\s<>*…{}|]+)`/g)) {
        const target = mention[1].replace(/[.,:;)]+$/, '').replace(/\/$/, '');
        if (files.includes(target) || files.some(item => item.startsWith(`${target}/`))) continue;
        if ((ALLOWLIST.mentionedButNotShipped || []).some(prefix => `${target}/`.startsWith(prefix) || target === prefix.replace(/\/$/, ''))) continue;
        problems.push(`DANGLING_PATH: ${file} mentions ${mention[1]}`);
      }
      for (const link of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const href = link[1].split('#')[0];
        if (!href || /^[a-z]+:/i.test(href)) continue;
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(href)));
        if (!files.includes(target) && !files.some(item => item.startsWith(`${target}/`))) problems.push(`BROKEN_LINK: ${file} -> ${link[1]}`);
      }
    }
  }
  return problems;
}

function packageToolkit(destination, { root = ROOT } = {}) {
  if (fs.existsSync(destination)) throw new Error(`OUTPUT_EXISTS: ${destination}`);
  const files = selectFiles(root);
  const problems = checkContent(root, files);
  if (problems.length) throw new Error(`DISTRIBUTION_REJECTED:\n${problems.join('\n')}`);
  fs.mkdirSync(destination, { recursive: true });
  const manifest = [];
  for (const file of files) {
    const target = path.join(destination, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target, fs.constants.COPYFILE_EXCL);
    manifest.push({ path: file, sha256: createHash('sha256').update(fs.readFileSync(target)).digest('hex') });
  }
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  fs.writeFileSync(path.join(destination, 'DISTRIBUTION-MANIFEST.json'), `${JSON.stringify({ schemaVersion: 1, product: 'taptop-bridge', version, files: manifest }, null, 2)}\n`, { flag: 'wx' });
  return { destination, version, files: manifest.length };
}

if (require.main === module) {
  if (process.argv.length !== 3) {
    console.error('Usage: node system/scripts/package-toolkit.js <new-directory>');
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(packageToolkit(path.resolve(process.argv[2])), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}

module.exports = { packageToolkit, selectFiles, checkContent };
