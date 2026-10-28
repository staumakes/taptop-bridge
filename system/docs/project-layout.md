# Project layout, selection and builds

Bridge code and rules live in `system/`. User work lives in separate directories under root `projects/`. The distributed Bridge starts with no initialized project. `npm run toolkit -- init projects/site-name site-name` creates one; the last argument is its stable namespace. It cannot be an existing destination.

| Project path | Owner and meaning |
| --- | --- |
| `taptop.project.json` | Pinned Bridge version, stable namespace and layout version; optional human-readable `displayName` |
| `input/` | Original files and source evidence (`input/<name>/index.html`, its CSS and images, intake files). Never rewritten by the Bridge |
| `design-system/` | This project's values: `foundations.json`, `registry.json`, `sources.md` (sources, evidence, MISSING list, decisions) and, once evidence exists, `kit.json` and `roles.css`. Starts empty, never copied from another project |
| `context/` | Project context shared by every page: `README.md` (map, status and date of each file, rules), `product.md`, `segments.md` (segments and JTBD), `voice.md`, `objections.md`, `facts.md`, `competitors.md`; raw material (custdev, exports, documents) in `context/sources/`, never rewritten. Created empty by `init` from `system/templates/project/context/`; written by the owner, changed by an agent only with the owner's consent. Agents read `context/README.md` before asking the user. Not read by `build` |
| `source/artifacts.json` | Registry of buildable artifacts: `ui-kit`, `components/<name>`, `pages/<name>` |
| `source/ui-kit/` | UI-kit showcase HTML/CSS written by the generator from `design-system/kit.json`; do not edit by hand |
| `source/components/`, `source/pages/` | Working HTML/CSS written for this project (Figma or AI routes) |
| `output/html/index.html` | Results page: every artifact, its status, local/editor/published checks and links |
| `output/html/<artifact>--<build>/page.html` | Browsable preview of one build with `taptop-preview.css`, its CSS and images |
| `output/json/<artifact>--<build>.json` | The import package of the same build (same `<build>` ID as its preview) |
| `output/figma/<artifact>--<build>/` | `figma-export` result: `export.html` (one copy of the build per canvas width for Figma's HTML import) and `manifest.json` (text roles per width, usage notes). Derived from the build; safe to delete and export again |
| `design-system/block-usage.json` | Optional usage notes per artifact (`name`, `category`, `use`, `avoid`, `content`, `notes`) for people and AI agents; written by the agent from project evidence |
| `design-system/card-usage.json` | Optional: cards taken out of blocks as separate Figma components (`name`, source `block`, `use`) so a page can be composed from cards; the card keeps its block's classes |
| `design-system/illustration-style.md` | Optional: the project's product-illustration style (canvas, cards, connectors, states, data rules, what not to do) with live samples in `design-system/illustrations/`; written from the user's references, values missing from the kit marked as proposals |
| `design-system/figma-library.json` | Written by `figma-link`: which Figma file and node holds each block and from which build; `doctor` reports `FIGMA_LINK_STALE` when the block was rebuilt since |
| `.taptop/` | Private state: `outputs.json` catalogue, `work/` normalization, `builds/` journals, `history/`, `lock`. Never publish it |

`<artifact>` is the artifact key with `/` replaced by `--` (`pages/home` → `pages--home`). `<build>` is `YYYYMMDDTHHMMSSZ-xxxxxxxx`. Earlier builds stay in `output/` and are listed as history; the Bridge never deletes them.

The layout contract is `system/contracts/project/layout.schema.json`; the artifact registry contract is `system/contracts/project/artifacts.schema.json`. New projects use `layoutVersion: 2`. Projects without `layoutVersion` remain readable by the legacy `normalize`/`compile` flow; `build` refuses them with `MANAGED_BUILD_REQUIRES_LAYOUT_2`. An unknown layout version is an error; no automatic migration rewrites a project. Moving or renaming a directory keeps its namespace and identity. Copying a project folder creates two projects with one namespace; both are then refused (`DUPLICATE_NAMESPACE`) until one is removed. For an independent site run `init` and copy only `input/` material.

## Selecting a project

Run `npm run toolkit -- projects` to inspect the immediate child directories of `projects/`. It reports invalid entries, symlinks, duplicate namespaces (errors) and equal display names (warnings). An AI agent may infer the selected project only when exactly one valid project exists and there are no diagnostics. With several projects it asks the user which project to use. Selection uses `projects/<folder>` or an absolute external project path, never a display name. A stated project path overrides prior chat context. A stale path is an error, never a reason to choose a neighbor. Modifying commands take `--project` (or the legacy positional project path) and there is no global active-project file, so two chats can work on two projects at once. Two writers on the same project are serialized by `.taptop/lock`: the second gets `PROJECT_LOCKED`. A lock left by a process that no longer runs on this computer is recovered by the next command and recorded in `.taptop/history/recovered-locks.jsonl`.

## Managed build flow

```sh
npm run toolkit -- ui-kit projects/site-name --data design-system/kit.json
npm run toolkit -- build --project projects/site-name --artifact ui-kit
npm run toolkit -- artifact add --project projects/site-name --key pages/home --html input/home/index.html --css design-system/roles.css --css input/home/styles.css --depends ui-kit
npm run toolkit -- build --project projects/site-name --artifact pages/home
npm run toolkit -- doctor --project projects/site-name
```

`ui-kit` registers the `ui-kit` artifact the first time. A build validates the project and the artifact's intake, requires every dependency to have a finished build, normalizes, compiles, checks shared classes, assembles the preview and only then publishes the pair. The catalogue (`.taptop/outputs.json`) is written last, so a build that stops earlier never appears as a result; the previous result stays current. A repeated build with unchanged inputs reports `up-to-date` and writes nothing.

Statuses: `current`; `stale` (an input file or image, the registration — stylesheets, root selector, intake, dependencies —, a dependency build or the Bridge version changed; the files remain usable as history). An edit that does not change the prepared result (a comment, a reset the normalizer drops) is re-validated by the next build without a new output; `output-missing`; `output-modified`; `never-built`; `unregistered`. `doctor` is read-only and gives one next action per issue; see [troubleshooting](troubleshooting.md).

Checks are recorded separately with `npm run toolkit -- check --project … --artifact … --level local|editor|published --result passed|failed --note "…"`. A built JSON is not evidence of a live import.
