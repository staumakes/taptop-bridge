#!/usr/bin/env node
// Builds synthetic UI-kit and page packages through the managed build and
// writes them, with the contract hashes, to a new directory. The importer keeps
// a committed copy as its compatibility fixtures; nothing here reads the
// importer checkout.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { version } = require('../../package.json');
const { managedProject, pageHtml, write } = require('../test-support/managed-project');
const { buildArtifact } = require('../lib/build-artifact');
const { addArtifact } = require('../lib/project-artifacts');

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

async function exportFixtures(destination) {
  if (fs.existsSync(destination)) throw new Error(`OUTPUT_EXISTS: ${destination}`);
  const cleanups = [];
  try {
    const { root } = managedProject({ after: fn => cleanups.push(fn) });
    const kit = await buildArtifact({ projectRoot: root, artifactKey: 'ui-kit' });
    write(root, 'input/home/img/dot.png', PNG);
    write(root, 'input/home/index.html', pageHtml('home-page').replace('</section>', '<img class="home-dot" src="img/dot.png" width="1" height="1" alt=""></section>'));
    write(root, 'input/home/styles.css', '.home-page { display: flex; flex-direction: column; }\n.home-dot { display: block; }');
    addArtifact(root, { key: 'pages/home', html: 'input/home/index.html', stylesheets: ['design-system/roles.css', 'input/home/styles.css'], dependsOn: ['ui-kit'] });
    const page = await buildArtifact({ projectRoot: root, artifactKey: 'pages/home' });
    fs.mkdirSync(destination, { recursive: true });
    fs.copyFileSync(path.join(root, kit.jsonPath), path.join(destination, 'managed-ui-kit.json'));
    fs.copyFileSync(path.join(root, page.jsonPath), path.join(destination, 'managed-page.json'));
    const contracts = path.join(__dirname, '../contracts/import-sync');
    const files = fs.readdirSync(contracts).filter(name => name.endsWith('.schema.json')).sort().map(name => ({
      path: `import-sync/${name}`, sha256: createHash('sha256').update(fs.readFileSync(path.join(contracts, name))).digest('hex')
    }));
    const manifest = { schemaVersion: 1, packageVersion: 2, producerToolkitVersion: version, build: 'managed', classKeys: '<namespace>/class/<name>', files };
    fs.writeFileSync(path.join(destination, 'managed-snapshot.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    return { destination, files: ['managed-ui-kit.json', 'managed-page.json', 'managed-snapshot.json'] };
  } finally {
    for (const cleanup of cleanups) cleanup();
  }
}

if (require.main === module) {
  if (process.argv.length !== 3) {
    console.error('Usage: node system/scripts/export-compatibility-fixtures.js <new-directory>');
    process.exitCode = 1;
  } else {
    exportFixtures(path.resolve(process.argv[2])).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}

module.exports = { exportFixtures };
