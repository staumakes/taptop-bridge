# Figma with a UI kit

Treat the supplied UI kit as the project's source of truth. Requires Figma access (for example a Figma connector); without it, stop and ask for exports — do not reconstruct values from screenshots.

1. Intake: `sourceType: figma-with-kit`, file URL, selected screens, `figma.uiKit.location` (`same-file` or `separate-file` + its URL). Check with `npm run toolkit -- intake`.
2. Inventory foundations, components, variants, states and responsive frames with the [figma steps](figma-steps.md). Record node links/IDs and values in `design-system/sources.md`; screenshots and images go to `input/`.
3. Fill the canonical UI-kit scaffold: `design-system/kit.json` and `roles.css` with documented values and states only ([kit data](kit-data.md)). A state or breakpoint the kit does not show is `MISSING …`.
4. `ui-kit … --check`, generate, `build --artifact ui-kit`. Report the scaffold path, the filled roles and the `MISSING` list.
5. Write each page in `source/pages/<name>/` using the kit's exact classes; register it with `design-system/roles.css` first and `--depends ui-kit`; build.

Inspect hierarchy, Auto Layout, typography, colors, radius, shadows, states and every supplied breakpoint. When a mobile frame is absent, write `MISSING RESPONSIVE DESIGN`; a responsive decision you make is not a Figma extraction result. Read `system/docs/figma-extraction.md` before extracting.
