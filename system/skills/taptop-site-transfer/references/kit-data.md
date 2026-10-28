# UI-kit data: `design-system/kit.json` and `roles.css`

The UI kit is never hand-built. You write two files from **confirmed** source values; the generator draws them inside the fixed Bridge scaffold (sidebar, title, panels, mobile menu — the `kit-*` classes, which you never write or override).

```sh
npm run toolkit -- ui-kit projects/<folder> --data design-system/kit.json --check
npm run toolkit -- ui-kit projects/<folder> --data design-system/kit.json
npm run toolkit -- build --project projects/<folder> --artifact ui-kit
```

After any change to the two files: `--check`, then `ui-kit … --replace` (replaces only unchanged generated files, keeps the old copy in `.taptop/history/ui-kit/`), then build `ui-kit` again; pages that depend on it become `stale`.

## `kit.json`

All sections except `fonts.primary` are optional. **An empty or absent section means MISSING** — leave it out and list it in `design-system/sources.md`; `--check` reports it as `SECTION_EMPTY` (information, not an error).

| Field | Shape | Shown as |
| --- | --- | --- |
| `projectName` | string | Name in the sidebar and title |
| `fonts.primary` | plain family name, e.g. `"Inter"` (no fallback list, no quotes) | Font of the whole showcase. Taptop has fonts built in; never ask to “connect” them |
| `css` | path of the role stylesheet relative to `kit.json`, normally `"roles.css"` | — |
| `colors` | `[{ "title": "Brand", "layout": "ramp" \| "tokens", "items": [{ "name": "accent", "value": "#3461a2", "note": "optional caption" }] }]` | `ramp`: a row of swatches; any other layout: token cards with name and note/value |
| `typography` | `[{ "className": "type-h1", "spec": "34 / 700 / -1%", "sample": "optional text", "kind": "display" \| "heading" \| "text" }]` | One row per role; `className` is the project's real role class |
| `spacing` | `[4, 8, 16, 24]` (numbers, px) | Bars |
| `radius` | `[{ "label": "md", "value": "8px" }]` | Boxes |
| `shadows` | `[{ "label": "sm", "value": "0 1px 2px rgba(0,0,0,.08)" }]` | Cards |
| `components` | `[{ "id": "buttons", "title": "Buttons", "description": "optional", "panels": [{ "label": "optional", "rows": [[ element, … ]] }] }]` | One section per component, panels with rows |

`element`: `{ "tag": "a" | "button" | "div" | "span" | "p", "classes": ["btn", "btn--secondary"], "text": "Label", "href": "#", "children": [element, …] }`. Use `children` for composed blocks (a card with a title and a link). Classes are the project's role classes; every one must have rules in `roles.css`.

## `roles.css`

The project's role classes, verbatim: typography (`type-*`), buttons (`btn`, `btn--secondary`), links, component parts. Rules use single class selectors, states (`:hover`, `:focus`, `:focus-visible`, `:active`) and the Taptop breakpoints `@media (max-width: 991px | 767px | 479px)` (other media queries are moved to Embed CSS, which works only on the published page). Use literal values (no `var()`) and the bare font name. Write `line-height` in px where the source gives px: Taptop's style panel edits px natively, while unitless/%/em/`clamp` values import as custom values (kept exactly, shown as text); px keeps the kit easy to edit (`font-size × factor`, e.g. 32px × 1.15 = 36.8px, also inside each breakpoint where the font size changes). From Figma, use the line height Figma actually lays out — text box height ÷ number of lines — because Figma rounds percentage line heights to whole pixels (24px × 140% → 34px, not 33.6px). Record the derivation in `sources.md`. A state or breakpoint the source does not show is not written — it is MISSING.

Taptop orders class rules by class name, not by source order. A modifier that changes a role's property must sort after the role (`white-text`, not `type--white`, next to `type-h2`), and a page class must not compete with a role on the same element for a property such as `margin` — otherwise the normalizer adds an extra `<class>--order` class to repeat the source value (`CLASS_ORDER_OVERRIDE`), which works but clutters the kit. Every role that renders text — links and buttons included — declares its own `font-family`: section sources have no page-wide font, so a role without one renders in the browser serif in the original and in the comparison (found on a `link-row` role 2026-10-21). Give text roles an explicit `display: block` and `.btn` an explicit `box-sizing: border-box`: in the kit the roles sit in flex rows and the kit original has no border-box reset, so otherwise the kit and the page normalize differently (`UI_KIT_CLASS_MISMATCH`).

Pages also carry their own global CSS (`a { color: inherit; text-decoration: none; }`, `* { box-sizing: border-box; }`). The normalizer lowers such element rules onto the role classes of the page, but the kit page has none of them, so `build` refuses the page with `UI_KIT_CLASS_MISMATCH`. When the source's roles are always `<a>` or always sit under a reset, write those values into `roles.css` explicitly, before the variants (`.btn { box-sizing: border-box; color: inherit; text-decoration: none; }` ahead of `.btn--primary`), and record the reason in `sources.md`. A class shared by several sections but not shown in the kit may get its width reset on different classes per section (`CLASS_RULE_CONFLICT`); state the source's value on the shared class in `roles.css` (`CSS_NOT_SHOWN` is then expected).

Avoid a base `margin-left: auto` or `margin-right: auto` when a breakpoint resets that same side margin. Auto side margins are preserved in the later Embed stylesheet, which can override the breakpoint's native Taptop rule. Prefer flex or grid alignment so the original and normalized kit keep the same cascade.

Pages reuse this file: register it as their **first** stylesheet and `--depends ui-kit`. Every role class shown on a page must be shown in the kit, otherwise it is not imported with the kit.

## What `--check` reports

| Code | Level | Meaning |
| --- | --- | --- |
| `INVALID_KIT_DATA` | error | `kit.json` is not valid JSON |
| `UI_KIT_DATA`, `UI_KIT_FONT` | error | Wrong structure (missing `fonts.primary`, component without `id`/`title`/`panels`, unknown tag) or a font value with quotes/fallbacks |
| `ROLE_CSS_MISSING`, `ROLE_CSS_UNREADABLE`, `ROLE_CSS_INVALID` | warning/error | No, unreadable or unparsable role stylesheet |
| `SHELL_CLASS_IN_PROJECT` | error | A project element uses `kit` or `kit-*` — those belong to the generator |
| `RESERVED_CLASS_NAME` | error | A Taptop system class name: layer classes (`div`, `text`, `button` …), `html`/`body`/`head`/`root`, or a name from Taptop's base stylesheet (`system/lib/taptop-base-classes.json`: `section`, `container`, `link`, `badge`, `menu__*` …). Use `u-<name>`: the normalizer renames such classes in supplied HTML the same way, so kit and pages stay identical |
| `CLASS_NAME_RESPELLED` | error | The class ends in `-0`, `-1` or a zero-padded number (`gap-1`, `step-01`): Taptop reads it as a duplicate counter and stores another name. Use the suggested `gap_1`; the normalizer renames supplied HTML the same way |
| `ROLE_WITHOUT_CSS` | warning | A class is shown in the kit but has no rule in `roles.css` |
| `CSS_NOT_SHOWN` | warning | `roles.css` has a class the kit does not show; add it to `typography` or a component row |
| `SECTION_EMPTY` | info | Nothing in that section: report it as MISSING |

## Minimal example (synthetic values)

```json
{
  "projectName": "Sample Site",
  "fonts": { "primary": "Inter" },
  "css": "roles.css",
  "colors": [{ "title": "Brand", "layout": "tokens", "items": [{ "name": "accent", "value": "#3461a2" }] }],
  "typography": [{ "className": "type-title", "spec": "36 / 800", "sample": "Example heading" }],
  "components": [{ "id": "buttons", "title": "Buttons", "panels": [{ "label": "Actions", "rows": [[
    { "tag": "button", "classes": ["btn"], "text": "Continue" },
    { "tag": "a", "classes": ["text-link"], "text": "Details" }
  ]] }] }]
}
```

```css
.type-title { font-family: Inter; font-size: 36px; font-weight: 800; line-height: 44px; }
.btn { display: inline-flex; padding: 12px 16px; background-color: #3461a2; color: #ffffff; }
.text-link { color: #3461a2; text-decoration: underline; }
@media (max-width: 479px) { .type-title { font-size: 28px; line-height: 34px; } }
```

Before handing over the UI kit, report: the scaffold path, the filled roles and values, every `MISSING` item, and for any class not in the scaffold's usual roles, its source evidence.
