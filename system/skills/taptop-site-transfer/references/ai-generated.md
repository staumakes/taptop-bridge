# AI-generated design

Only after the user approves a brief and a visual direction. Record both in the intake (`sourceType: ai-generated`, `ai.brief`, `ai.visualDirection`, `ai.approved: true`); `npm run toolkit -- intake` fails with `MISSING_APPROVED_DIRECTION` otherwise.

- Record the brief, the approved direction and every value you propose in `design-system/sources.md` (marked AI-proposed, with the date of approval). Write the kit with [kit data](kit-data.md).
- The approved direction is the source of evidence. Values you introduce (colors, type scale, spacing) are proposals until the user approves them; record them as AI-proposed, not as extracted.
- Build the UI kit first in the canonical scaffold, then pages that use its exact classes.
- Start every stylesheet you write for a section with `* { box-sizing: border-box; }` and `body { margin: 0; }`. Taptop pages already behave this way and the normalizer drops both rules (`GLOBAL_RULE_LOWERED`), so the import does not change. Without them the original renders content-box with an 8px body margin: a `width: 100%` section with side padding becomes wider than the screen, and the local comparison reports every element as shifted.
- Product illustrations (UI mock-ups inside sections) follow `design-system/illustration-style.md` when the project has one; reuse its samples in `design-system/illustrations/`. New references from the user extend that file instead of starting a parallel style.
- Text content comes from the user or from approved project material; use it verbatim and keep `ЗАГЛУШКА` marks visible. `ai.brief` may summarise the user-approved main message, block order and emotion-and-visual direction. Placeholder copy is marked as such, follows `context/voice.md` when the project has it, and is listed in the final report.
- Responsive behavior you design is your decision, not a source fact; say so.
- This route never claims fidelity to a Figma file or website.
