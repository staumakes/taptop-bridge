# Internal project system, version 1

`normalizeProjectSystem(input)` in `system/lib/project-system.js` turns four source modes into one project-local structure: `foundations`, `classes`, `components`, `pages`, and `evidence`. It is a pure normalization step. It does not extract Figma, rewrite HTML, persist project files, compile CSS, or import into Taptop.

## UI-kit scaffold invariant

The normalized system fills the Bridge's canonical UI-kit scaffold at
`system/examples/ui-kit-default/source/`; it does not define a new UI-kit shell.
The scaffold owns the showcase hierarchy, baseline class vocabulary and class
reuse conventions. Each source mode changes only project-local evidence,
literal foundation values and source-evidenced component variants.

This distinction is mandatory for all source modes:

- **Figma with a UI kit:** transfer documented values and states into the
  scaffold.
- **Figma without a UI kit:** derive only repeated, observed values from the
  screens, then fill the same scaffold.
- **AI-generated:** after the user approves a visual direction, create
  project-local values and variants inside the same scaffold.
- **Prepared HTML/CSS:** normalize the supplied source, then map evidence to
  the same scaffold; do not turn the supplied page into a competing UI kit.

A missing value, component state or variant remains `MISSING`. It may not be
filled with a demo value from the default kit or a value from another project.
Changing the canonical scaffold itself requires explicit user approval, a
migration plan for stable class keys, and a UI Kit Architect handoff. A
standalone component catalogue built from a screenshot fails this contract even
when it visually resembles the source.

The input contains a valid `intake`, an `evidence` array, optional `foundations`, `components`, `pages`, and optional `previousSystem`. Each evidence item has `id`, `kind`, and `ref`. Every foundation value, component, page, and class declaration must cite at least one existing evidence ID. Missing source values are omitted and reported separately as `MISSING`; the normalizer never chooses a value.

```json
{
  "intake": { "schemaVersion": 1, "sourceType": "html", "html": { "entry": "source/page.html", "stylesheets": ["source/page.css"] } },
  "evidence": [{ "id": "source-button", "kind": "source", "ref": "source/page.css:.button" }],
  "foundations": { "colors": { "accent": { "value": "#3290ff", "evidenceIds": ["source-button"] } } },
  "components": [{ "stableKey": "button", "evidenceIds": ["source-button"], "classes": [{ "role": "button/primary", "declarations": { "screen": { "color": "#3290ff" } }, "evidenceIds": ["source-button"] }] }],
  "pages": [{ "stableKey": "home", "componentKeys": ["button"], "evidenceIds": ["source-button"] }]
}
```

Foundation groups are `colors`, `typography`, `spacing`, `radius`, and `shadows`. Class declarations hold literal CSS values by selector or breakpoint. CSS custom properties and `var()` are rejected. Unknown evidence and component references are rejected.

Within one version, identical semantic role and literal declaration map yield one stable class across components and pages. Different declarations yield different classes. For a later revision, pass the last normalized result as `previousSystem`; a unique class with the same role retains its prior `stableKey` and `name` when values change. If several current variants make that match ambiguous, set `priorStableKey` on the intended class input. A conflicting or unknown prior key is rejected. This preserves sync identity without silently merging simultaneous variants.

The output is deterministic for the same input and remains independent of target-local Taptop IDs. A separate integration step must map its classes into compiler identity manifests and sync packages. A live import still requires editor evidence and a receipt.

Before a UI-kit transfer is accepted, its evidence must name the selected
scaffold path, list populated scaffold roles, list `MISSING` roles, and show
that any non-baseline class has direct source evidence. This is the acceptance
record that prevents an accidental second design system.
