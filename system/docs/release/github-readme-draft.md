# GitHub README draft — Taptop Bridge

**Editorial status, updated 2026-10-09:** superseded by the root `README.md`, which now describes only implemented and locally verified behavior. Keep this draft for the repository descriptions and the publication checklist at the end; do not publish it.

## Suggested GitHub repository descriptions

**Bridge:** AI-assisted preparation of project UI kits, reusable components and HTML/CSS pages for editable import into Taptop.

**Bridge Extension:** A standalone Chrome extension for validating and importing Taptop Bridge JSON packages into the selected Taptop editor page.

---

# Taptop Bridge

Taptop Bridge helps you prepare a website for Taptop together with an AI assistant. Each project keeps its own UI kit, reusable components, pages and source materials. Finished HTML previews and JSON files for import are saved separately, so you can find the result without searching through system files.

There are two independent tools:

| Tool | What it does | Where you use it |
|---|---|---|
| Taptop Bridge | Prepares project materials, normalizes supported HTML/CSS, checks shared classes and builds import packages | In a local folder with your AI assistant and Node.js |
| Taptop Bridge Extension | Checks a selected package and imports its supported layers, classes and images | As a separately installed Chrome extension in the Taptop editor |

The extension has its own installation and updates. It is not a folder inside the Bridge distribution. You can prepare packages without installing the extension, but importing them requires a compatible importer.

## What you can start with

- **Figma with a UI kit:** use the supplied design values and components.
- **Figma without a UI kit:** extract repeated values and components from the available screens. Missing states or mobile designs remain explicitly missing.
- **An AI-generated design:** first agree on a brief and visual direction, then create the project's values and components.
- **Existing HTML/CSS:** preserve your originals and process them through the Bridge normalizer before compiling.

These sources fill the same Bridge UI-kit scaffold. Each project has its own values and variants; its pages reuse that project's exact role classes. Adding a new source does not create a second competing design system.

Figma access depends on the AI environment and permissions you provide. Supplying a Figma link is not proof that all screens and assets have been extracted. The assistant should state what it actually read and what is missing.

## The everyday workflow

1. Open your Bridge workspace with your AI assistant.
2. Create a project or select the existing project you want to work on. When several projects exist and the request is ambiguous, the assistant asks which one you mean.
3. Provide the source and describe the page or component you need.
4. Establish the project's UI kit and reuse its existing components and classes.
5. Review the generated HTML and any missing-data or unsupported-feature report.
6. Choose the matching JSON file in the separate importer extension, check the target page and import.
7. Verify the result in Taptop at the required responsive sizes, save and reload it.

The assistant should give you links to the result and state which checks were completed. A JSON file passing validation does not by itself mean the result has been checked inside Taptop.

## Your workspace

```text
taptop-bridge/
  README.md
  AGENTS.md
  package.json
  package-lock.json
  system/
  projects/
```

`system/` contains the tools, contracts, templates, tests and AI instructions. Ordinary project work should not require editing it.

`projects/` starts without any initialized projects. It contains only instructions until you create your own project. The author's experiments and designs are not part of the download.

Package files remain at the root to keep installation and testing conventional. The separate importer has its own repository and download.

## Inside a project

```text
projects/studio-site/
  README.md
  AGENTS.md
  taptop.project.json
  input/
  design-system/
  source/
    ui-kit/
    components/
    pages/
  output/
    html/
    json/
  .taptop/
```

| Folder | Meaning |
|---|---|
| `input` | Your original materials and source references; processing preserves the originals |
| `design-system` | The project's documented values, exact role classes and reusable component registry |
| `source` | Working materials for the UI-kit showcase, components, blocks and pages |
| `output/html` | Browsable previews with their required resources |
| `output/json` | Packages ready for the importer's checks |
| `.taptop` | Build state, previous results, intermediate files and local import evidence |

For most tasks, start with the results in `output`. HTML and JSON names identify the same artifact/build. The generated HTML catalogue shows available results and whether a rebuild is needed.

System templates are empty project scaffolds and shared display structure. They are not client designs or a library of values copied into every new project.

## Several projects

Projects keep separate namespaces, UI kits, components, assets and target bindings. A page in one project does not automatically borrow classes from another.

You can say:

> Work on studio-site. Create a contact page using the existing UI kit and header.

Or:

> Create a new project for a separate landing page. I will provide HTML and CSS instead of Figma.

If you ask for “the next page” with several possible projects, the assistant should ask which project you mean. Two separate conversations must not share a global active-project switch.

Renaming a project folder is different from duplicating it as an independent project. Use the documented project procedure so an independent copy does not inherit the original import identity by accident.

## Installation

Release editors must insert verified download/store links and the actually tested AI setup path here after T21/T33/T35. Until then this file remains a draft, not installation instructions for the current checkout.

The final installation section must cover:

1. Downloading and extracting the Bridge release.
2. Installing the supported Node.js version and running `npm ci` from the Bridge root.
3. Opening the folder in a supported AI environment and loading the shipped Bridge skill or the documented manual entry prompt.
4. Installing the independent importer from its verified store page or documented development package.
5. Creating the first empty project and obtaining one synthetic preview/package from the published walkthrough.

Keep manual CLI instructions beside the AI path for diagnosis and reproducibility. Do not present a planned command as available until it exists in that release.

## What “ready” means

| State | What has been checked |
|---|---|
| Built | The system produced the files successfully |
| Locally validated | Package structure, asset integrity and declared invariants passed |
| Visually compared | The local preview was compared with the source at recorded widths |
| Verified in Taptop | The imported result was inspected, saved and reloaded in a real editor |

Website behavior requiring publication needs a separate authorized published-page check. Neither the Bridge nor the importer should publish a website just because a package was imported.

Changing a UI-kit value can affect multiple pages. The output catalogue should identify dependent results that need rebuilding. A failed build must not replace the last successfully generated result.

## Limits and compatibility

The final README must include a version-specific supported/experimental/unsupported table linked to release evidence. Do not promise arbitrary JavaScript, forms, CMS, sliders or other widgets unless the released adapter has appropriate verification.

The Bridge and importer have independent version numbers. Their compatibility depends on the package format and supported features. Use the documented compatibility table when updating either product.

Reusing or synchronizing a class is different from replacing an already inserted page tree. The release documentation must explain exactly what happens during a repeat import and how manually edited target values are handled.

## Updating and recovery

Keep project backups before a migration. Update system files using the documented versioned procedure; do not overwrite `projects/` with a fresh download. A pinned project version must not be changed just to bypass an incompatibility error.

If a build fails, keep the error and follow the project diagnostic instructions. Do not manually edit a generated JSON to hide an error or delete working folders without a recovery path.

The importer updates separately through its release channel. Its update instructions must state how existing import records are preserved and which older package versions remain supported.

## Privacy and reporting problems

Your local project contains your sources, generated results and working state. During an import the extension sends the required content and images to the selected Taptop environment. AI/Figma integrations have their own access and data handling; consult the tools you use.

The final release links the importer's audited privacy and permissions explanation here. Do not claim “no network access” or “no data processing” without checking the actual release.

For a bug report, include product versions, the step that failed and a minimal synthetic example. Do not post client projects, cookies, access URLs or raw private import receipts in a public issue.

## Development and license

Contributors should read the canonical architecture and contribution guide, add a synthetic regression for a reproduced defect, run the relevant tests and provide live evidence when editor behavior changes.

The release must include a selected license and third-party notices supported by a provenance review. This draft does not choose a license or claim official affiliation with Taptop.

---

## README publication checklist for T23/T33/T35

- [ ] Replace editorial sections with tested installation steps and real links.
- [ ] Include an actual synthetic screenshot or short walkthrough, not the author's projects.
- [ ] Add the version-specific capability/compatibility table and documented repeat-import behavior.
- [ ] Link source-mode, AI setup, troubleshooting, upgrade, privacy and contributor guides.
- [ ] Check claims against release evidence; remove or label unverified features.
- [ ] Confirm all internal links work within the final repository layout.
- [ ] Check both a new user and a fresh agent can complete the first-result flow from this README alone.
