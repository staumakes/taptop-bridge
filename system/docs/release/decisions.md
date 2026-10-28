# Release decisions

Updated 2026-10-09. Values below remain open until there is evidence or a user choice. They do not block local migration and tests.

| Decision | Current state | Needed before |
|---|---|---|
| Bridge public license and contributor rights | **Decided 2026-10-09: MIT**, owner's rights. `LICENSE`: Copyright (c) 2026 staumakes | Any public source upload |
| Bridge Extension public license | **Decided 2026-10-09: MIT**; Inter keeps its OFL notice | Any public importer upload |
| GitHub owner and final repository names | **Decided 2026-10-09:** owner's personal account; `taptop-bridge` and `taptop-bridge-extension` | Creating the two remote repositories |
| Store developer account, listing identity and contact | Open | Chrome Web Store submission |
| Privacy/support URLs and actual data-flow wording | Open pending code audit | Chrome Web Store submission |
| Supported operating systems, Node versions and AI clients | Must follow clean-install tests | Public capability claims |
| Published Taptop test page | Separate authorization if required | Published-page behavior check |
| Authorship of the Helper fork's local `import-sync` folder (absent from the GoodMade release, untracked in the fork) | **Decided 2026-10-09 by the owner:** the importer and its class-sync code are the owner's own work; the owner holds the rights | — |
| Whether GoodMade's personal permission covers a separate public importer that uses the same editor-runtime technique | **Decided 2026-10-09 by the owner:** own extension, own rights; no GoodMade text is copied (only the same webpack-chunk access technique) | — |
| Updating `source-map-js` 1.2.1 (high advisory GHSA-68fv-2mgg-jv7q via postcss) in the lockfile | **Done 2026-10-13:** `npm audit fix` → 1.2.2, 0 vulnerabilities, tests pass | — |
| Removing `.work/distribution/archive-restore-check/` (≈255 MB copy of archived author pilots inside the Bridge folder; Git-ignored and excluded by the release allowlist) | Owner decision; the verified archive outside Bridge remains | Before handing the working folder to anyone else |

The user has already requested a separate importer project and authorized archiving author experiments outside Bridge. Do not ask for these choices again. Do not treat a local test pass as evidence for release rights or live import.
