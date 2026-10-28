const fs = require('node:fs');
const path = require('node:path');
const { inside, loadProject, readProjectFile, ensureProjectDirectory } = require('./project');
const { normalizeHtmlSource } = require('./html-normalizer');

const DIRECTORY = 'source/normalized';
const isLink = file => { try { return fs.lstatSync(file).isSymbolicLink(); } catch { return false; } };


function copyNormalizedAssets(root, htmlPath, normalizedHtml, destinationDirectory) {
  // The prepared HTML lives one directory deeper than the source. Keep every
  // referenced local image at the same relative URL so the compiler and the
  // static preview consume the exact same bytes without a manual copy step.
  const images = [...new Set([...normalizedHtml.matchAll(/<img\b[^>]*\bsrc=[\"']([^\"']+)[\"']/gi)].map(match => match[1]))];
  const realRoot = fs.realpathSync(root);
  const copied = [];
  for (const src of images) {
    if (/^(?:https?:|data:|\/)/i.test(src)) continue;
    const targetRelative = path.posix.normalize(src);
    const sourceRelative = path.posix.normalize(path.posix.join(path.posix.dirname(htmlPath), src));
    if (targetRelative === '..' || targetRelative.startsWith('../') || sourceRelative === '..' || sourceRelative.startsWith('../')) {
      throw new Error(`UNSAFE_ASSET_PATH: ${src}`);
    }
    const source = fs.realpathSync(path.resolve(root, sourceRelative));
    if (!inside(realRoot, source)) throw new Error(`OUTSIDE_PROJECT: ${src}`);
    const destination = path.resolve(destinationDirectory, targetRelative);
    if (!inside(destinationDirectory, destination)) throw new Error(`UNSAFE_ASSET_PATH: ${src}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    copied.push(sourceRelative);
  }
  return copied;
}

// Normalizes one page into a project-relative directory. The original files
// stay untouched; the prepared copy, embed CSS, behaviors, manifest and the
// full report are written next to each other and never overwritten. Managed
// builds pass their own stable directory and component key; the directory is
// part of the source revision, so it must not contain a build ID.
async function normalizeInto(root, { htmlPath, cssPaths, rootSelector, componentKey, directory, reportSource, sliders }) {
  loadProject(root);
  ensureProjectDirectory(root, path.posix.dirname(directory));
  const target = path.join(root, directory);
  if (fs.existsSync(target) || isLink(target)) throw new Error(`NORMALIZED_EXISTS: ${directory} already exists; remove it deliberately to normalize again`);
  const result = await normalizeHtmlSource({
    htmlText: readProjectFile(root, htmlPath),
    // Several stylesheets are one cascade, in the listed order; each is repaired on its own.
    stylesheets: cssPaths.map(file => ({ label: file, text: readProjectFile(root, file) })),
    rootSelector,
    componentKey,
    sliders,
    paths: {
      html: `${directory}/page.html`, css: `${directory}/page.css`,
      embedCss: `${directory}/page.embed.css`, behaviors: `${directory}/behaviors.json`, preview: `${directory}/taptop-preview.css`
    }
  });
  const report = { source: reportSource || { html: htmlPath, css: cssPaths }, ...result.report };
  ensureProjectDirectory(root, directory);
  const assets = copyNormalizedAssets(root, htmlPath, result.html, target);
  const files = [
    [result.manifest.html, result.html],
    [result.manifest.stylesheets[0], result.css],
    [`${directory}/manifest.json`, `${JSON.stringify(result.manifest, null, 2)}\n`],
    [`${directory}/normalization-report.json`, `${JSON.stringify(report, null, 2)}\n`],
    [result.previewPath, result.previewCss]
  ];
  if (result.manifest.embedStylesheet) files.push([result.manifest.embedStylesheet, result.embedCss]);
  if (result.manifest.behaviorManifest) files.push([result.manifest.behaviorManifest, `${JSON.stringify(result.behaviors, null, 2)}\n`]);
  // The original with the result's keys, for the comparison tool. <base> makes
  // its own relative stylesheets and images load from the original folder.
  const base = `${path.posix.relative(directory, path.posix.dirname(htmlPath)) || '.'}/`;
  files.push([`${directory}/original.html`, result.keyedOriginal.replace(/<head(\s[^>]*)?>/i, match => `${match}<base href="${base}">`)]);
  for (const [file, content] of files) fs.writeFileSync(path.join(root, file), content, { flag: 'wx' });
  return { ok: report.ok, manifest: `${directory}/manifest.json`, report: `${directory}/normalization-report.json`, files: files.map(([file]) => file), items: report.items, assets };
}

// Legacy single-page entry point: one fixed source/normalized/ per project and
// a component key taken from the HTML file name.
async function normalizeProject(root, htmlPath, cssPath, { rootSelector } = {}) {
  const config = loadProject(root);
  const name = path.basename(htmlPath, path.extname(htmlPath)).replace(/[^A-Za-z0-9_-]+/g, '-') || 'page';
  return normalizeInto(root, {
    htmlPath, cssPaths: cssPath ? [cssPath] : [], rootSelector,
    componentKey: `${config.namespace}/${name}`, directory: DIRECTORY,
    reportSource: { html: htmlPath, css: cssPath || null }
  });
}

module.exports = { normalizeProject, normalizeInto };
