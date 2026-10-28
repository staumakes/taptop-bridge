# Recovery

Run `npm run toolkit -- next --project projects/<folder>` (one recommended step) or `npm run toolkit -- doctor --project projects/<folder>` (all issues); both are read-only. Follow each issue's `nextAction`. Full code list: `system/docs/troubleshooting.md`.

| Symptom | Do |
| --- | --- |
| A build stopped (crash, error, Ctrl+C) | Nothing to clean. The previous result is still current; rebuild |
| `PROJECT_LOCKED` | Another task writes the project. Wait. If `doctor` says `LOCK_ABANDONED`, the next command recovers it |
| `STALE_RESULT` | Rebuild that artifact; older files remain as history |
| `ORPHAN_OUTPUT` | Never import that file. The user may delete it |
| `CATALOG_PAGE_MISSING` / `CATALOG_PAGE_OUT_OF_DATE` | `npm run toolkit -- catalog --project projects/<folder>` regenerates `output/html/index.html` |
| `NORMALIZATION_FAILED` | Read `.taptop/work/<artifact>/normalization-report.json`; fix the source or mark the item `UNSUPPORTED`. Never hand-edit normalized files |
| Different Bridge version (`INCOMPATIBLE_TOOLKIT`) | Use the pinned version; never edit `toolkitVersion` |
| `DUPLICATE_NAMESPACE` | Ask the user which folder is the project |
| Bridge Extension rejects the JSON | Rebuild; check importer version supports package version 2; never patch the JSON |
| Live editor differs from the local preview | Follow the root `AGENTS.md` error-to-rule procedure; record `check --level editor --result failed` with the observation |

Do not delete `output/`, `.taptop/` or `input/` files on the user's behalf unless they ask for that specific deletion.
