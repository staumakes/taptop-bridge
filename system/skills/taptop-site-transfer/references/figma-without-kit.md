# Figma without a UI kit

Requires Figma access; without it, stop and ask for exports.

1. Intake: `sourceType: figma-without-kit`, file URL, screens, `foundationStrategy: extract-from-screens`. The validator keeps the warning `MISSING_UI_KIT` on purpose.
2. Inventory the whole selected scope first with the [figma steps](figma-steps.md), recording evidence in `design-system/sources.md`. Identify exactly repeated patterns using structure, Auto Layout, type, spacing, visual values and states.
3. Derive a project-local foundation/component inventory and fill the canonical UI-kit scaffold with it ([kit data](kit-data.md)). Only exact matches share a class automatically; similar items with different values stay separate until the user consolidates them. Record the extra classes as the trade-off of a design without a prepared system.
4. Build the UI kit, then pages with its exact classes (`design-system/roles.css` first, `--depends ui-kit`).

Use Auto Layout as evidence for direction, gap, padding and alignment. Absolute coordinates are measurements, not automatic fixed CSS sizes. Ambiguous behavior is `NEEDS HUMAN REVIEW`; absent mobile frames are `MISSING RESPONSIVE DESIGN`. Read `system/docs/figma-extraction.md` before extracting.
