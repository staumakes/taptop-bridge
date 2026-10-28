#!/usr/bin/env node
// Writes the result of convert-set.js as Bridge component sources:
// source/components/<prefix>/index.html, styles.css and media.json (the nodes
// to export into images/ with download_assets). Then register the component
// with `artifact add … --depends ui-kit` and build it.
//
//   node system/figma/write-block.js --project projects/<folder> --result <convert-set result.json> [--title "Section name"]
//
// The result file holds what use_figma returned: { out: [...] }, an array or one result.
const fs = require('node:fs');
const path = require('node:path');

// Expands the compact form: "§" stands for "<prefix>__"; a rule lists indexes into dict.
function expandResult(result) {
  if (!result.dict) return { html: result.html, css: result.css };
  const pre = `${result.prefix}__`;
  const html = result.html.split('§').join(pre);
  const css = result.css.split('\n').map(line => line.replace(/^\.([^{]*)\{([\d,]*)\}$/, (match, selector, ids) =>
    `.${selector.split('§').join(pre)} { ${ids.split(',').map(id => result.dict[Number(id)]).join('; ')}; }`)).join('\n');
  return { html, css };
}

function writeBlock({ projectRoot, result, title }) {
  if (!result || !result.prefix || result.error) throw new Error(`convert-set result has no block: ${result && (result.error || JSON.stringify(result).slice(0, 120))}`);
  const { html, css } = expandResult(result);
  const dir = path.join(projectRoot, 'source/components', result.prefix);
  fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
  const name = title || result.prefix;
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${name}</title>\n<link rel="stylesheet" href="../../../design-system/roles.css">\n<link rel="stylesheet" href="styles.css">\n</head>\n<body>\n${html}\n</body>\n</html>\n`);
  fs.writeFileSync(path.join(dir, 'styles.css'), `/* ${name} — generated from Figma component set ${result.set || ''} by system/figma/convert-set.js. */\n\n${css}\n`);
  fs.writeFileSync(path.join(dir, 'media.json'), `${JSON.stringify(result.media || {}, null, 1)}\n`);
  return { dir, mismatch: result.mismatch || [], heights: result.heights || [], media: Object.keys(result.media || {}).length };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const option = name => { const index = args.indexOf(`--${name}`); return index === -1 ? undefined : args[index + 1]; };
  const project = option('project'), file = option('result');
  if (!project || !file) { console.error('usage: write-block.js --project projects/<folder> --result <file.json> [--title "Section name"]'); process.exit(2); }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const results = Array.isArray(data) ? data : data.out || [data];
  for (const result of results) console.log(JSON.stringify(writeBlock({ projectRoot: path.resolve(project), result, title: option('title') })));
}

module.exports = { expandResult, writeBlock };
