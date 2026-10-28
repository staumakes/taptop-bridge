# Updating the Bridge

There is no automatic updater in this version. Projects pin the Bridge version that created them (`toolkitVersion` in `taptop.project.json`), and every command refuses a project pinned to another version (`INCOMPATIBLE_TOOLKIT`). This prevents a newer compiler from silently changing classes, identities or output of an existing site.

## Safe procedure

1. Back up your `projects/` folders (they are ignored by the Bridge's Git settings and belong to you).
2. Install the new Bridge into a **new** folder; do not unpack it over the old one. Run `npm ci` and `npm test` there.
3. Keep using the old Bridge folder for existing projects until a migration for their version is documented.
4. Create new projects with the new Bridge.

Do not edit `toolkitVersion` by hand: a project's packages, class keys and receipts were produced by its pinned version, and changing the number does not migrate them. `doctor` reports a mismatch as `PROJECT_CONFIG_INVALID` with this advice.

## Skill and agent instructions

The AI skills (`system/skills/taptop-site-transfer/`, `system/skills/taptop-saas-illustrations/`), their Claude Code and Codex entry points (`.claude/skills/`, `.agents/skills/`), `CLAUDE.md` and `AGENTS.md` ship inside the Bridge. A new Bridge version therefore brings the matching skills; nothing is installed globally. Open the AI client in the new Bridge folder. Each skill states the Bridge version it was reviewed for (`metadata.toolkit-version`).

## What an update never does

- It never rewrites `input/`, `design-system/`, `source/` or earlier `output/` files of a project.
- It never merges two projects or changes a namespace.
- It never deletes earlier builds. A rebuild with a newer Bridge (after a documented migration) marks old results as built by the previous version.

## Bridge Extension compatibility

The Chrome importer is a separate product with its own version. Compatibility is decided by the package format (`version: 2`) and declared capabilities, not by equal version numbers. See the importer's own `docs/compatibility.md`. Import receipts are stored in the Taptop editor page's `localStorage` of the browser profile (checked in the importer source on 2026-10-09: `createReceiptStore(window.localStorage)`), not inside the extension, so updating or reinstalling the importer does not erase them; another browser, profile or cleared site data starts with none.
