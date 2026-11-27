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
| No Bridge Extension button in an editor on the site's own domain (`https://<domain>/-/cms/v1/mosaic/…`) | Extension 0.2.0 ran only on `*.taptop.site`. Install 0.2.1 or later and reload the editor tab: the button appears on a connected domain by itself |
| Bridge Extension: «Редактор Taptop не ответил» on every file, after reloading the editor | Taptop rebuilt its editor and the importer no longer finds an editor module (0.2.0 lost the layer clipboard on 2026-11-26). Update the extension to 0.2.1 or later; if it persists, the extension needs a new module lookup — not a JSON change |
| Taptop's «Конфликт при сохранении дизайна» after an import, or Bridge Extension «Последнее сохранение в Taptop не прошло» (`EDITOR_SAVE_FAILED`) | The site was saved in another editor tab. Do not choose «Сохранить мой дизайн»: it overwrites the newer styles. Choose to keep the other version, close other editor tabs of the site, reload and import again |
| Bridge Extension: «файл собран старой версией Bridge… Пересоберите» (`PACKAGE_REBUILD_REQUIRED`) | Rebuild that artifact with current Bridge and import the new JSON; old JSON files from archives are not imported |
| Bridge Extension: «в пользовательских атрибутах слоя есть запрещённый id» (`RESERVED_TAG_ATTRIBUTE`) | Rebuild with the current Bridge; an anchor is set with Taptop's own setting, never as a custom attribute |
| Live editor differs from the local preview | Follow the root `AGENTS.md` error-to-rule procedure; record `check --level editor --result failed` with the observation |

Do not delete `output/`, `.taptop/` or `input/` files on the user's behalf unless they ask for that specific deletion.
