// The one description of the CLI. The usage text, system/docs/cli-reference.md
// and the documentation checks are all derived from this list, so a new or
// changed command cannot silently miss its documentation.
const COMMANDS = [
  { name: 'projects', synopsis: 'projects [workspace-root]', purpose: 'List valid projects under projects/ with issues (errors) and warnings. Read-only.' },
  { name: 'init', synopsis: 'init <new-folder> <namespace>', purpose: 'Create an empty project with its own permanent namespace. Never overwrites.' },
  { name: 'next', synopsis: 'next --project <projects/folder>', purpose: 'Recommend the one next step for the project (fix, prepare UI-kit data, generate, build, check, import, done). Read-only.' },
  { name: 'doctor', synopsis: 'doctor --project <projects/folder>', purpose: 'Diagnose the project; every issue has a code, path and next action. Read-only.' },
  { name: 'ui-kit', synopsis: 'ui-kit <project-folder> [--data <kit.json>] [--font <primary font>] [--replace] [--check]', purpose: 'Generate source/ui-kit/ from design-system/kit.json in the canonical scaffold. --check validates the data without writing; --replace regenerates unchanged generated files.' },
  { name: 'artifact add', synopsis: 'artifact add --project <projects/folder> --key <ui-kit|components/name|pages/name> --html <file.html> --css <file.css> [--css <more.css>] [--root <.class>] [--intake <intake.json>] [--depends <key>] [--title <text>] [--replace]', purpose: 'Register a component or page (stylesheets are one cascade in order); --replace changes an existing registration.' },
  { name: 'artifact list', synopsis: 'artifact list --project <projects/folder>', purpose: 'List registered artifacts with status and current HTML/JSON paths. Read-only.' },
  { name: 'build', synopsis: 'build --project <projects/folder> --artifact <key>', purpose: 'Normalize, compile, check shared classes and publish one HTML preview + JSON package pair; prints links for preview and comparison.' },
  { name: 'catalog', synopsis: 'catalog --project <projects/folder>', purpose: 'Regenerate output/html/index.html from the results catalogue.' },
  { name: 'check', synopsis: 'check --project <projects/folder> --artifact <key> --level <local|editor|published> --result <passed|failed> --note <what was checked>', purpose: 'Record one verification level for the current build.' },
  { name: 'figma-export', synopsis: 'figma-export --project <projects/folder> --artifact <key> [--widths 1440,768,480,370]', purpose: 'Write output/figma/<artifact>--<build>/export.html (one copy of the current build per width, media queries resolved, images embedded, text marked for styles) and manifest.json (text roles per width, usage notes) for import into Figma.' },
  { name: 'figma-link', synopsis: 'figma-link --project <projects/folder> --artifact <key> --file <figma-file-key> --node <node-id>', purpose: 'Record which Figma component holds the current build in design-system/figma-library.json; doctor then reports when the block changes and Figma falls behind.' },
  { name: 'serve', synopsis: 'serve [--port <number>]', purpose: 'Serve the Bridge folder read-only on 127.0.0.1 (default port 4320) for previews and the comparison tool.' },
  { name: 'intake', synopsis: 'intake <project-folder> <intake-relative-path>', purpose: 'Validate a source intake declaration. Read-only.', legacy: true },
  { name: 'normalize', synopsis: 'normalize <project-folder> <html-relative-path> <css-relative-path> [--root <.class>]', purpose: 'Legacy single-page normalization into source/normalized/.', legacy: true },
  { name: 'compile', synopsis: 'compile <project-folder> <manifest-relative-path> <new-output-file>', purpose: 'Legacy compile of a normalized manifest into a new JSON file.', legacy: true },
  { name: 'migrate-v1', synopsis: 'migrate-v1 <legacy-json> <asset-root> <new-output-file>', purpose: 'Convert a version-1 package with an asset folder into one version-2 JSON.', legacy: true }
];

const USAGE = [
  'Usage: npm run toolkit -- <command>   (run from the Bridge folder)',
  ...COMMANDS.filter(item => !item.legacy).map(item => `  ${item.synopsis}`),
  'Single-page and support commands:',
  ...COMMANDS.filter(item => item.legacy).map(item => `  ${item.synopsis}`)
].join('\n');

module.exports = { COMMANDS, USAGE };
