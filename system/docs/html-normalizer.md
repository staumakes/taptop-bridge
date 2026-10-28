# HTML normalizer — rules

Every HTML/CSS page a user sends goes through the normalizer before compiling.
Nobody hand-edits a user's page into the compiler profile. The normalizer is
deterministic, keeps the user's files untouched, and reports every change.

Managed projects (layout version 2) run it as part of every build:

```sh
npm run toolkit -- artifact add --project projects/<folder> --key pages/<name> --html input/<name>/index.html --css design-system/roles.css --css input/<name>/styles.css --depends ui-kit
npm run toolkit -- build --project projects/<folder> --artifact pages/<name>
```

The build normalizes into `.taptop/work/<artifact>/` (a stable, tool-owned folder that is replaced on each build; its path takes part in the source revision, so it never contains a build ID) and publishes a copy with the preview to `output/html/<artifact>--<build>/`. Several stylesheets are one cascade in the listed order. Legacy single-page projects keep the original commands, which write `source/normalized/` once:

```sh
npm run toolkit -- normalize <project> <html> <css> [--root .class]
npm run toolkit -- compile <project> source/normalized/manifest.json <new-output.json>
```

Files produced in either location (legacy location never overwritten):

| File | Purpose |
| --- | --- |
| `page.html` | Prepared HTML: classes, stable `data-taptop-key`, portable attributes only |
| `page.css` | Single-class rules and `:hover/:focus/:focus-visible/:active` states on Bridge breakpoints |
| `page.embed.css` | CSS Taptop classes cannot express; ships as one hidden Embed in `Scripts` |
| `behaviors.json` | Declared behaviors (accordion, menu, supported Tilda slider/carousel and MP4 video structures, Swiper tracks, plus Tilda viewport reveals) for generated Embed scripts |
| `manifest.json` | Compiler manifest incl. `selectorMappings`, `behaviorManifest`, `embedStylesheet` |
| `normalization-report.json` | Every decision: `level`, `code`, `decision`, `reason`, samples |
| `taptop-preview.css` | Taptop page defaults for local preview only; never packaged |

## Principles

1. **Nothing is lost silently.** A rule is either converted to a Taptop class,
   moved verbatim into the embed stylesheet, or reported as an error.
2. **Editable first.** Visible structure becomes ordinary Taptop layers and
   classes; behavior and relational CSS go to Embed and work on the published page.
3. **Fail closed.** Unsupported content is an `error` and blocks compiling until
   the source is fixed or an adapter exists.
4. **Prove fidelity.** Compare original and normalized pages with
   `system/docs/tools/normalize-compare.html` at 1440/992/768/480/320 and
   900/700/375 before import (`npm run toolkit -- serve`, then the `links.compare`
   URL printed by `build`). Zero differences is the target; any difference is
   explained in the report. The tool matches elements by `data-taptop-key` when
   the original has keys, otherwise by document order, and reports how many
   elements it compared: zero compared elements is a failed comparison. It treats
   the documented `FONT_NAME` and text blockification (`TAPTOP_BASE_RESET`)
   results as equal, skips the generated `.page` wrapper (`ROOT_WRAPPED`), and
   reports “font not installed locally” when a page font renders in a fallback —
   text sizes are then not comparable until the font is installed or linked.
   Animations are frozen for the box comparison, but each element's
   `animation-name` is compared first, so an animation on the wrong element is
   a difference.

## Transformations

| Source | Result | Report code |
| --- | --- | --- |
| Grouped selectors `.a, .b` | One rule per selector | `GROUP_SPLIT` |
| `@media [only] screen and (max-width: 991/767/479px)` | Bridge breakpoints | — |
| Other media (`min-width`, other widths, `prefers-reduced-motion`) | Embed, same media | `MEDIA_TO_EMBED` |
| A later rule (base or Taptop breakpoint) for a selector whose earlier rule went to the embed, setting the same property (`@media (max-width: 767px) { .grid … }` after `@media (max-width: 1199px) { .grid … }`) | Kept on the class and repeated in the embed after the earlier rule: the embed loads after native rules, so without the copy the 1199px value would win at 767px | `MEDIA_ORDER_TO_EMBED` |
| `.class` | Class rule | — |
| `.class:hover/:focus/:focus-visible/:active` | Taptop state rule (`cm` channel) | — |
| Relational, compound, attribute and structural selectors (`#hero > div[aria-hidden] > div:nth-child(3)`, `.a.b`, `.a .b + .b`, `ul li:first-child`) | Matched on the source page (ids, attributes and structure as written); the elements it reaches get `<class>--sel-<hash>` (five letters derived from the selector, so the UI kit and every page lower one selector to the same class name and a rule difference is caught as `UI_KIT_CLASS_MISMATCH`/`CLASS_RULE_CONFLICT`) and the rule becomes a class rule with the selector's specificity. Same-element compounds such as `.a.b` must be lowered too: leaving them in the later Embed stylesheet can override the imported class color or background. `:hover`/`:focus`/`:active` of the matched layer → a Taptop state rule; `::before`/`::after`, other states, markup inside Rich Text/SVG Icon and media queries without a Taptop breakpoint → embed on that class | `SELECTOR_LOWERED` |
| Selectors with script-toggled states (`.is-*`, `.active`, `.open`, `[aria-expanded]` …), dynamic parts before the last element (`.card:hover .title`), unsupported syntax, or nothing matched on the page | Embed, verbatim | `SELECTOR_TO_EMBED` |
| `body` | Inherited text settings and background lifted to the root class | `GLOBAL_RULE_LOWERED` |
| Element selectors (`h1`, `p` …) | Applied to the classes of those elements; class values win | `GLOBAL_RULE_LOWERED` |
| `*` `box-sizing: border-box` | Removed — Taptop pages already use it | `GLOBAL_RULE_LOWERED` |
| `html`, other `*` declarations | Embed | `GLOBAL_RULE_LOWERED` |
| `@keyframes`, `@font-face`, other at-rules | Embed | `AT_RULE_TO_EMBED` |
| `var(--x)` with a value on `:root`, on a class rule or in an inline style of an ancestor | Literal value, inherited through the DOM as in the browser; a class used under different values keeps its first element's value | `VARIABLE_CONTEXT` (warning) when contexts differ |
| Custom-property definitions and every declaration using `var()` | Also copied to the Embed stylesheet, while the class retains its resolved fallback. This preserves values set by a parent, an id/relational selector or a breakpoint that a Taptop class cannot represent. | `CUSTOM_PROPERTY_TO_EMBED`, `VARIABLE_TO_EMBED` |
| `body` / element rules repeated in the CSS | Cascade order: the later rule wins; class rules still win over both | — |
| A stylesheet or `<style>` ending with an unclosed block | Closed at its own end, as browsers do | `CSS_BLOCK_AUTO_CLOSED` (warning) |
| Nested CSS (`.a, .b { .c { … } }`, `> .row`, `&.wide`, `@media` inside a rule) | Plain rules as the browser resolves them: each parent selector joined with each nested one (`&` = the parent, otherwise a descendant), placed after the parent; a nested `@media` wraps the parent selector. Before this rule a nested rule's declarations were read as the parent's: Swiper 12's `.swiper:not(.swiper-watch-progress) { .swiper-lazy-preloader { animation: … } }` spun the slider container | `CSS_NESTING_FLATTENED` |
| CSS the browser cannot recover from either | Reported instead of crashing | `CSS_PARSE_ERROR` (error) |
| Unresolved `var()`, `url()` | Embed | `VARIABLE_UNRESOLVED`, `URL_TO_EMBED` |
| `!important` | Removed, value kept | `IMPORTANT_REMOVED` |
| Vendor-prefixed properties | Removed | `VENDOR_DROPPED` |
| `margin`, `padding`, `border[-side]`, `gap`, `place-items` | Longhands | — |
| `body` text settings | Inherited properties (colour, font, line-height, `overflow-wrap`, `word-break`, `white-space`, `hyphens`, `text-wrap`, `text-shadow`, `font-feature-settings` …) and the background go to the root block | `GLOBAL_RULE_LOWERED` |
| `var(--x)` where `--x` is redefined inside a media query (`@media (max-width: 900px) { #box { --dir: column } }`) | The class keeps the value resolved at desktop; the embed repeats the declaration with `var()` on the same class, together with the variable definitions, so the switch still happens on narrow screens (published page and editor canvas) | `VARIABLE_BY_MEDIA` |
| `@font-face` with a relative font file | Kept in the embed and reported: the file does not reach Taptop; upload the font to the project or use a full URL | `FONT_FILE_RELATIVE` (warning) |
| `font` shorthand (`700 21px/1.2 Inter, Arial`) | `font-style`, `font-weight`, `font-size`, `line-height` (kept as written, see below), `font-family` (first name); `font: inherit` and system-font keywords stay as they are | — |
| Unitless, `%`, `em`, `rem` and fluid (`clamp`, `calc`, `vw`) `line-height` | Kept as written; the compiler stores it as a custom rule, so inheritance and every width behave as in the source | `LINE_HEIGHT_CUSTOM` |
| Inline `style=""` | New class `<class>-inlineN` (no hyphen before the number, see the counter fact) | `INLINE_STYLE_TO_CLASS` |
| Element without class | Class `<parent>__<tag>` | `CLASS_GENERATED` |
| Missing `data-taptop-key` | `<class>-N` | — |
| `#id` in a selector | The element gets a class named after the id (`id-<id>` if that class name is taken) and `#id` becomes that class in every selector; before this, id rules were silently lost because the id is removed | `ID_TO_CLASS` |
| `id`, `role`, `aria-*`, `tabindex`, other `data-*` | Removed | `ATTRIBUTE_REMOVED` |
| Link to a removed `id` | Kept; set the anchor in Taptop | `ANCHOR_TARGET_REMOVED` (warning) |
| `<a>` wrapping elements | Editable link block | — |
| `data-taptop-behavior="accordion"` | `behaviors.json`; panel hide state to Embed | `BEHAVIOR_DECLARED`, `BEHAVIOR_STATE_TO_EMBED` |
| `data-taptop-behavior="tabs"` | Triggers (`role="tab"` or a `*tab*`/`*trigger*` class) and panels (`role="tabpanel"` or a `*panel*`/`*pane*` class) paired by order, two or more of each; the class on only some triggers is the active state (default `is-selected`). `behaviors.json` gets `taptop/embed-tabs-v1`; the panel hide state goes to Embed, `.is-*` state rules go to Embed verbatim; panels show as `display: block` | `BEHAVIOR_DECLARED`, `BEHAVIOR_STATE_TO_EMBED`, `BEHAVIOR_STRUCTURE` (error) |
| Several behavior roots with the same adapter and classes (an accordion in every tab panel) | One generated script for all of them: it binds every root of its class; before 2026-10-22 each root got its own copy of the same script | `BEHAVIOR_MERGED` |
| `data-taptop-behavior="menu"` | Toggle (`*burger*`/`*toggle*`), panel (`*sidebar*`/`*drawer*`/`*panel*`), optional backdrop (`*backdrop*`/`*overlay*`/`*shade*`); the script toggles `is-open` on the root, `.root.is-open …` CSS goes to Embed; `data-taptop-anchor-prefix` makes `#name` links scroll to `.<prefix>name` | `BEHAVIOR_DECLARED` |
| Tilda `.t-slds` with more than one `.t-slds__item` | Editable slide layers remain in Root. A generated `taptop/embed-slider-v1` Embed controls arrows, bullets, keyboard navigation and swipe, beginning at the source active slide. Its CSS keeps only the active slide visible. | `TILDA_SLIDER_DECLARED` |
| Tilda `t1196` horizontal card carousel | Editable cards remain in Root. A generated `taptop/embed-slider-v1` Embed scrolls the source card track by one visible card through its controls. | `TILDA_CAROUSEL_DECLARED` |
| Swiper `.swiper > .swiper-wrapper >` two or more `.swiper-slide` | Editable slide layers stay in Swiper's flex row. The root is the nearest ancestor that also holds the arrows: `.swiper-button-prev/next`, `[data-slider-control="prev/next"]`, or exactly two `<button>` outside the slides (first = back); it gets `toolkit-slider_<letters>_<n>`, the arrows `toolkit-slider-prev`/`toolkit-slider-next`. Like Swiper's first render, the `.swiper` gets `swiper-initialized swiper-horizontal swiper-backface-hidden` (Swiper's CSS resets slide transforms through them), the start slide `swiper-slide-active` (neighbours `-prev`/`-next`), the back arrow `swiper-button-disabled`. A generated `taptop/embed-slider-v1` Embed (mode `track`) snaps like Swiper (each slide's left edge, clamped at the end; centered when declared), marks the nearest slide active as Swiper does at a clamped end, toggles those classes, disables the arrows at the ends, and handles swipe, mouse drag and arrow keys. The source Swiper script is not copied | `SWIPER_SLIDER_DECLARED` |
| Swiper options that live only in the source script (`spaceBetween`, `breakpoints`, `slidesPerView`, `slidesPerGroup: 1`, `centeredSlides`, `initialSlide`, `loop`, `speed`) | Read from the artifact intake `html.sliders` (Swiper's option names, one entry per `.swiper` class). Without an entry: no gap, first slide, no loop, slide widths from CSS — reported. With an entry Swiper's defaults apply (one slide per view unless `slidesPerView` says otherwise) | `SWIPER_OPTIONS_UNDECLARED` (warning) |
| Declared `spaceBetween` (per Swiper `breakpoints` 480/768/992) | Editable class `toolkit-slide-gap_<desktop>_<991>_<767>_<479>` with `margin-right` on every slide, as Swiper sets it | `SWIPER_GAP_TO_CLASS` |
| Declared numeric `slidesPerView`, `centeredSlides`, `initialSlide` | Embed: `.toolkit-slider_<letters>_<n> .swiper-slide { width: calc(…) !important }`; until the script adds `toolkit-slider-ready`, equal-width slides are shifted to the start slide with `translate` (centered: first slide `margin-left: 50%`), so the editor canvas shows Swiper's first render | — |
| `:disabled` rule on an arrow (`.btn:disabled`, lowered or not) | The Embed rule also targets `.<class>.swiper-button-disabled`: a button with children is a Taptop container, not a `<button>` | `SWIPER_DISABLED_STATE` |
| Rules with Swiper runtime classes (`swiper-slide-active/prev/next/visible`, `swiper-button-disabled`, `swiper-pagination-bullet-active`) | Script-toggled states: Embed verbatim; they never name an order class | `SELECTOR_TO_EMBED` |
| A Swiper option the track cannot reproduce (`effect`, `autoplay`, a breakpoint inside a Taptop range with a different value, `slidesPerView` switching between `auto` and a number) or an intake entry no `.swiper` matches | Build stops | `SWIPER_OPTION_UNSUPPORTED`, `SWIPER_OPTIONS_UNMATCHED` |
| Tilda `t-video-lazyload` with an HTTPS `.mp4` source | The lazy shell remains editable; a generated `taptop/embed-video-v1` Embed creates a muted, controlled HTML5 video. A local poster is retained when the source supplies one. | `TILDA_INLINE_VIDEO_DECLARED` |
| Tilda `.t-popup` containing `t1013__html5video` with an HTTPS `.mp4` source | The popup shell remains editable; a generated `taptop/embed-video-v1` Embed opens it from the declared hash link, moves focus, closes by control, backdrop or Escape and restores page scrolling. | `TILDA_VIDEO_DIALOG_DECLARED` |
| Tilda `.t-animate` targets | Editable layers stay in place; a generated `taptop/embed-reveal-v1` Embed adds Tilda's started class as each target enters the viewport and restores visibility if a source effect cannot finish. | `TILDA_REVEAL_DECLARED` |
| Tilda `data-original` lazy images and background images | The prepared image or `background-image` uses `data-original` before source scripts are removed. This replaces Tilda's small blurred placeholder with the original asset. | `TILDA_LAZY_IMAGE_PROMOTED`, `TILDA_LAZY_BACKGROUND_PROMOTED` |
| Legacy `<center>` | Editable `toolkit-center` and `toolkit-centered-block` layers with a generated Embed centering rule. | `LEGACY_CENTER_PRESERVED` |
| Tilda `.t-cover` with a `data-content-cover-bg` carrier | The carrier's original image is promoted to the editable cover, which uses `background-attachment: scroll`, matching the carrier-scoped sizing done by Tilda startup code. | `TILDA_COVER_BACKGROUND_PROMOTED`, `TILDA_COVER_BACKGROUND_SCROLL` |
| Tilda geolocation script with a `geo: ''` default card | Blocks hidden by the default card are removed; the default desktop/mobile pair remains and existing responsive CSS chooses the visible one. | `TILDA_GEO_DEFAULT_APPLIED` |
| `animation` and its longhands | Embed stylesheet; the associated `@keyframes` is already an Embed at-rule. | `ANIMATION_TO_EMBED` |
| `margin-left: auto` or `margin-right: auto` | Embed stylesheet; native Taptop class controls turn these side margins into `0px`. | `MARGIN_AUTO_TO_EMBED` |
| Legacy vendor properties (`-webkit-*`, `Moz*`, `KHTMLOpacity` …), IE `filter: alpha(…)`, or a nonzero unitless `letter-spacing` | Removed. Modern source equivalents such as `opacity` remain. | `VENDOR_DROPPED`, `INVALID_VALUE_DROPPED` |
| `font-family` stacks | Bare Taptop font name; Google Fonts links kept for local preview only | `FONT_NAME` |
| Width, display, height, position the source left to the browser | Browser value written on the element class against Taptop's layer base classes — on the first class that only layers of the same type carry, so a UI kit role on a text and on a multi-line container (`<div class="text--sm-400 …"><span>…`) keeps exactly its kit rules (since 2026-10-21, found on a Figma UI Kit table: the role got `width: auto` and the build failed with `UI_KIT_CLASS_MISMATCH`) — with the lowest priority (a real value from another class of the element wins, through an order class if needed). A class shared by elements that need different values takes the most common one; every other group gets `<class>--base[-b …]` (Taptop's own default written out when that group needs it); `TAPTOP_BASE_CONFLICT` remains only when no value can be written | `TAPTOP_BASE_RESET`, `TAPTOP_BASE_VARIANT`, `TAPTOP_BASE_CONFLICT` (warning) |
| SVG image file with fractional `width`/`height` or `viewBox` (Figma exports such as `11.0379 × 12.8667`) | Packaged with whole-pixel dimensions, rounded up; before 2026-10-19 the build refused it with `UNSUPPORTED_ASSET` | — |
| An `<img>` whose screen `width` and `height` end up on different classes after selector lowering | Both effective values are repeated on one image size class, which the compiler's image layer requires | `IMAGE_DIMENSIONS_JOINED` |
| `html { scroll-behavior }` | Removed: it freezes the editor canvas | `SCROLL_BEHAVIOR_DROPPED` (warning) |
| Class named like a Taptop system class (layer classes `div`, `text`, `button`, `image` …, `html`/`body`/`head`/`root`, and the names of Taptop's base stylesheet in `system/lib/taptop-base-classes.json`: `section`, `container`, `link`, `badge`, `menu__*`, `slider__*`, `pop-up__*` …) | Renamed to `u-<name>` in the HTML, every selector and the root selector; a clash with an existing `u-<name>` stops normalization | `RESERVED_CLASS_RENAMED` (warning) |
| Class ending in `-0`, `-1` or a zero-padded number (`col-1`, `mt-0`, `step-01`) | The trailing `-` becomes `_` (`col_1`) in the HTML, every selector and the root selector; `-2` and larger stay (`card-pad-12`) | `CLASS_COUNTER_RENAMED` (warning) |
| `<style>` elements in the page (head or body) | CSS joins the cascade after the linked stylesheets, in document order | `STYLE_BLOCK_LIFTED` |
| `<script>` elements | Removed; source JavaScript is never transferred; the behavior they drove must come from a Bridge behavior or is listed as UNSUPPORTED | `SCRIPT_DROPPED` (warning) |
| Scroll reveal: `.x { opacity: 0 }` shown by `.x.is-visible` or through a parent state (`.card.is-visible .x`) (or `visible`, `shown`, `in-view`, `revealed`, `animated`, `aos-animate` …) that no element of the markup carries | The state's `opacity`, `transform`, `visibility`, `filter`, `clip-path` values replace the hidden ones on `.x`; the state rule is removed. Without the dropped script nothing would ever add the class and the element stayed invisible (found 2026-10-21: a feature section exported to Figma as empty cards) | `REVEAL_STATE_APPLIED` |
| `<meta>` inside `<body>` | Removed before layer generation; it is metadata, not a visible layer. Set its SEO or preview value separately in Taptop | `BODY_METADATA_DROPPED` (warning) |
| Tilda `.t-records` root hidden with `opacity: 0` until its source script runs | The prepared root receives a generated Embed style that makes it visible in the static preview and after import. This is a source-page normalization rule; the imported editor still needs checking. | `TILDA_ROOT_REVEALED` |
| `<details>`/`<summary>` | Accordion behavior: details → item, summary → trigger, the rest → panel (wrapped in `<item>__panel` when needed); `open` → `is-open` | `DETAILS_TO_ACCORDION` |
| A visual button whose direct child is an icon or another element | An editable container, retaining its visual class and descendants; it is not compiled as a text-only Taptop Button. | `NESTED_BUTTON_AS_CONTAINER` |
| A container whose children are only inline content, including links and line breaks | One Rich Text layer so the inline flow and link markup survive. | `INLINE_RUN_AS_RICH_TEXT` |
| Text beside other elements inside a flex/grid container (e.g. a label next to an icon) | Wrapped in its own text layer `<class>__text`; a flex/grid item already renders this way, so the layout is unchanged | `TEXT_RUN_WRAPPED` |
| Inline `<svg>` | One SVG Icon layer (`tt_svg_icon`) holding the SVG markup; its source `width`/`height` are written on the layer class (the Taptop default is 32×32) | `TAPTOP_BASE_RESET` |
| Text with inline formatting (`strong`, `em`, `u`, `s`, `br`, inner `span`, `a` …) outside a flex/grid container | One Rich Text layer (`tt_rich_text`) with the inner HTML verbatim; a link becomes a link block holding it | `RICH_TEXT_LAYER` |
| Classes and element rules that only style markup inside a Rich Text or SVG Icon layer | Embed stylesheet (it also applies in the editor canvas) | `INNER_STYLE_TO_EMBED` |
| Class rules of one breakpoint | Written in Taptop's order (class name, `localeCompare`), so the preview shows Taptop's cascade. An element whose classes compete for a property and would get a different winner than in the source gets one more class `<last class>--order-<hash>` (five letters derived from the repeated values, so two artifacts never give one order class different rules), sorting after all of its classes and repeating the source winners per breakpoint; elements with the same values share it | `CLASS_ORDER_CONFLICT` (info, each property), `CLASS_ORDER_OVERRIDE` (info, each class added) |
| Class rules across breakpoints: a base rule that beats a breakpoint rule in the source (higher specificity, e.g. a lowered `.section .card { max-width: none }` over `@media (max-width: 767px) { .card { max-width: 480px } }`, or the same specificity written later) | The source winner at each breakpoint is found over every level that applies there (base and each breakpoint down to it): specificity, then source order; inline styles and `<picture>` variants first, resets last. Where Taptop, which writes breakpoint blocks after the base, would keep another value, the order class repeats the source value in that breakpoint. Also for an element with one class | `CLASS_ORDER_CONFLICT` (sample names each value's level), `CLASS_ORDER_OVERRIDE` |
| `<picture>` with `<source media="(max-width: 991px|767px|479px)">` | A block with one editable image per source plus the `<img>` (`<img class>--desktop`, `--max991`, `--max767`, `--max479`; first `srcset` candidate); `display` rules on the Taptop breakpoints show the image the browser would choose, and the variants outrank every other source rule like inline styles | `PICTURE_SPLIT` |
| `<picture>` without an `<img>` or with other sources (`type` switching, `min-width`, other widths) | Blocked | `PICTURE_SOURCE_UNSUPPORTED` (error) |
| `<img src>` on another site (`https://…`, `//…`) | Blocked: the package carries image bytes from local files only. Save the image into `input/` and reference it relatively | `REMOTE_IMAGE_SOURCE` (error) |
| `iframe`, forms, media | Blocked | `UNSUPPORTED_TAG` (error) |
| Text mixed with block elements (a `div`, `p`, list … inside running text) | Blocked: neither a text nor a Rich Text layer can hold it faithfully (a link with text and an icon used to lose the icon silently) | `MIXED_CONTENT` (error) |
| Other behaviors | Blocked until an adapter exists | `BEHAVIOR_UNSUPPORTED` (error) |

## Accordion contract

Root marked `data-taptop-behavior="accordion"`; each direct child item holds a
trigger (`role="button"` or a class like `*trigger*`, `*question*`) and a panel
(`role="region"` or `*panel*`, `*answer*`). The class present on only some items
is the open state (default `is-open`); a state-like name (`is-*`, `open`, `active`, `expanded`, `selected`, `current`) wins over a modifier such as `item--done` that is also on only some items (since 2026-10-22: a checklist accordion opened its done steps). Items, triggers and panels must share a
class each. The Embed script restores `role`, `tabindex`, `aria-expanded`,
click and Enter/Space handling on the published page; every answer stays
visible and editable in the editor.

## Tabs contract

Root marked `data-taptop-behavior="tabs"`; inside it ordinary layers: the n-th
trigger opens the n-th panel. Triggers share a class, panels share a class, and
the class present on only some triggers (default `is-selected`, a state-like
name wins over a modifier; never Taptop's reserved `is-active`) marks the start tab on the trigger and on its panel. The
Embed script moves that class on click and with the arrow keys, restores
`role="tab"`, `aria-selected` and `tabindex`, and its style keeps only the
active panel visible on the published page. A panel is shown as `display:
block`: put a grid or flex layout on a child of the panel.

## Taptop facts the rules rely on (verified live 2026-10-07)

| Fact | Consequence |
| --- | --- |
| The native `line-height` control keeps only px: `1.45`, `120%`, `1.2em` and `normal` become `0px` (initial probe 2026-10-07; `normal` confirmed in the importer's live class-sync readback, 2026-10-13). As a custom rule (`isCustom: true`) any value is kept verbatim and the canvas renders it: `calc(1.04 * clamp(34px, 5.2vw, 66px))` and `1.5` read back unchanged and appeared in the canvas stylesheet (runtime `setCSS` in a disposable project, removed afterwards, 2026-10-12; save and reload of such a rule not yet seen) | The compiler writes every non-px line-height, including `normal`, as a custom rule (`toTaptopRule`); the normalizer keeps line-heights as written (`LINE_HEIGHT_CUSTOM`) |
| Taptop class sync read back `animation` as missing, and native numeric controls read a unitless nonzero `letter-spacing` as `0px` (failed import readback, no layers added, 2026-10-13) | Animation stays in the Embed stylesheet with its `@keyframes`; invalid unitless letter spacing and obsolete vendor/IE declarations are dropped before class sync (`ANIMATION_TO_EMBED`, `INVALID_VALUE_DROPPED`, `VENDOR_DROPPED`) |
| Native Taptop side margins represented as `{ number: 0, unit: 'auto' }` rendered as `0px` on the published page, pulling constrained Tilda containers to the left (published-page inspection, 2026-10-13) | The normalizer sends `margin-left/right: auto` through the Embed stylesheet (`MARGIN_AUTO_TO_EMBED`) |
| Embed CSS loads after native class rules at every breakpoint. A base `margin-left: auto` moved to Embed therefore overrode a native phone rule `margin-left: 0px` in the generated UI kit (local original/normalized comparison at 320px and 375px, 2026-10-14) | The UI kit typography row uses flex growth for desktop alignment and no side auto margin, so its phone alignment is not split between native rules and the later Embed stylesheet; generated kits are regression-tested after normalization |
| Tilda's source runtime adds `t-animate_started`; without it source `.t-animate` layers retain `opacity: 0` after import (published-page inspection, 2026-10-13) | The normalizer declares `taptop/embed-reveal-v1`, which starts effects through `IntersectionObserver` and makes a target visible as a fallback (`TILDA_REVEAL_DECLARED`) |
| A nested CSS rule must not be read as its parent: the Swiper 12 stylesheet nests 99 rules; the preloader's infinite `swiper-preloader-spin` reached the `.swiper` container through the parent selector, which the frozen-animation comparison could not see (local drive of the built slider, 2026-10-19) | `CSS_NESTING_FLATTENED` unnests before any rule is read; the comparison compares `animation-name` per element before freezing animations |
| Every generated Embed script finds its roots with `document.querySelectorAll('.<root class>')` on the whole page, and Embed CSS is page-wide too. Components cut from one source page share its `<head>`, so a root named only by source index repeated: card-before-after, slider-card-image-s and card-image-quote all got `toolkit-slider_14`, and on one page the first script bound all three roots with its own config (assembled test page of all taptop components, 2026-10-19) | Generated roots (`toolkit-slider_`, `toolkit-carousel_`, `toolkit-video_`, `toolkit-video-dialog_`) are `<prefix>_<letters>_<source index>`: five letters of the component key make them unique per component and stable across rebuilds; no trailing `-number` (Taptop counter) |
| Swiper 12.1.4 (source runtime, measured in the local original 2026-10-19): `spaceBetween` is an inline `margin-right` on every slide, including the last; the snap grid is each slide's left edge up to `track end − view` (the track end excludes the last gap), plus that end; centered slides snap at `left − (view − width) / 2`; `loop` with two slides stays a plain track; custom arrows are disabled only by the page's own script (`button.disabled`); at a clamped end the active slide is the one whose left edge is nearest; `.swiper-backface-hidden .swiper-slide { transform: translateZ(0) }` (container class added at init) un-scales slides without a state class | The track slider reproduces these numbers (`sliderSnaps` in `system/lib/slider-embed-code.js`); the gap becomes `margin-right` (`SWIPER_GAP_TO_CLASS`); the disabled state is a class because the Taptop arrow is a container (`SWIPER_DISABLED_STATE`) |
| Tilda holds the source photo or background in `data-original` while the markup initially points at a small blurred thumbnail; after source scripts are removed, that thumbnail remained in the import (published-page inspection, 2026-10-13) | Before dropping source scripts, the normalizer promotes `data-original` into the editable image `src` or background declaration (`TILDA_LAZY_IMAGE_PROMOTED`, `TILDA_LAZY_BACKGROUND_PROMOTED`) |
| Tilda keeps a cover's full asset in `data-content-cover-bg` while its editable cover can initially point to a tiny thumbnail; it also uses the carrier to scope a half-screen background (published-page comparison, 2026-10-13) | When Tilda supplies `data-content-cover-bg`, the normalizer promotes that asset to the cover and forces `background-attachment: scroll` (`TILDA_COVER_BACKGROUND_PROMOTED`, `TILDA_COVER_BACKGROUND_SCROLL`) |
| Tilda's geolocation scripts hide alternate `rec<id>` blocks after startup; with scripts removed, every country variant otherwise remains visible (published-page comparison, 2026-10-13) | The normalizer applies the `geo: ''` default card and removes its `hideBlocks` before it drops scripts (`TILDA_GEO_DEFAULT_APPLIED`) |
| Fonts are built into Taptop and referenced by name; `font-family` keeps only one family | Normalizer writes the bare font name (`Inter`) and drops the fallback list (`FONT_NAME`) |
| Pasting never changes an existing project class with the same name | The importer creates and updates classes through the editor runtime before the paste: classes from an earlier import of the same file are updated in place (receipt per editor version, namespace, page). Identical same-name classes are reused. Other same-name classes are imported as copies (`faq` → `faq-2`, Embed code rewritten), or updated if the user chooses. If both the file and Taptop changed a value, the user chooses which one to keep |
| Taptop may store a written class value in its own spelling (e.g. gradients, shorthands) | Class sync fails only when Taptop did not keep a value; the stored spelling goes into the receipt (`stored`), so on re-import a spelling difference is not treated as a user edit |
| Taptop breakpoints are `(max-width: 991px)`, `(max-width: 767px)`, `(max-width: 479px)`; the tablet canvas is 768px wide | Rules are written with exactly these keys; `768px`/`480px` keys fire one pixel early and are rejected by the validator |
| Every layer type has a base class before the user's classes: block `width: 100%; position: relative`, text `display: inline-flex`, image `100×100`, link block `inline-flex` | Normalizer writes back `width: auto`, `display: block`, `height: auto`, `position: static` where the source left them to the browser (`TAPTOP_BASE_RESET`); the preview applies the same base so the comparison shows Taptop's result |
| The embed stylesheet also loads in the editor canvas | `scroll-behavior` on `html` froze editor scrolling and is dropped (`SCROLL_BEHAVIOR_DROPPED`) |
| Class changes made through the editor runtime are not autosaved | The importer's paste triggers the save; standalone class fixes need an explicit save |
| Published pages use `body { margin: 0 }` and `* { box-sizing: border-box }` | Normalizer drops those resets; preview uses `taptop-preview.css` |
| Embed `<script>` runs on the published page, also inside a hidden block, before later content exists | Generated scripts wait for `DOMContentLoaded` |
| Rich Text is one layer `tt_rich_text` (class `tt-rich-text`, `can: SELECT, SET_RICH_TEXT`) with `data.text = { type: 'RICH_TEXT', value: '<html>' }`; pasted HTML with inner `span` classes, inline `style`, `br`, `strong`, `em`, `u`, `s`, headings and lists is kept verbatim through save and reload; it renders inside `.text-block-wrap-div`, links get `.tt-rich-link`; inner `p`/`h1` keep browser margins. Checked 2026-10-11 by native copy, paste of a modified copy, Cmd+S and reload in a disposable project | `RICH_TEXT_LAYER`; inner classes go to the embed |
| The Rich Text layer base is `.tt-rich-text { display: block; position: relative; margin: 0; max-width: 100% }` plus a clearfix `::before/::after { display: table }` (editor canvas stylesheet read 2026-10-12). Layer bases follow the layer type, not the user's classes | The preview gives every element the base of its layer type by `data-taptop-key` (one class may sit on a text and on a rich text); an inline source tag outside a flex/grid parent gets `display: inline-block` back (`TAPTOP_BASE_RESET`) |
| SVG Icon is one layer `tt_svg_icon`: a `<span class="svg-icon">` (`can: SELECT, SET_ATTR_SRC_SVG`) with `data.text = { type: 'HTML', value: '<svg …>' }`; it is `inline-flex`, 32×32, `overflow: hidden`, centred, and the inner `<svg>` fills it. Same check, 2026-10-11. The compiler's earlier tag-tree guess for SVG was wrong and is removed | SVG layer; the source size is written on its class |
| The editor canvas writes class rules sorted by class name (`localeCompare`), not in source or creation order (canvas stylesheet read 2026-10-11: 668 rules, two breaks at group boundaries). Of two classes on one element that set the same property, the later name wins (`type--white` lost to `type-h2`; `margin: 0` of `type-small` beat `.section-note { margin-top }`) | The normalizer outputs class rules in that order and reports `CLASS_ORDER_CONFLICT` |
| Breakpoint blocks come after the base class rules in the canvas stylesheet, so at a breakpoint any class's breakpoint rule beats any base rule, whatever its source specificity (found 2026-10-19: `.section-faq .accordion { max-width: none }` lost to `@media (max-width: 767px) { .accordion { max-width: 480px } }` in the local comparison of a supplied page; VERIFY-ORDER) | Cross-breakpoint class order: the order class repeats the source winner in the breakpoint (`CLASS_ORDER_CONFLICT`) |
| `background-image` is built only from `items`; a rule with just a gradient string is stored as `items: []` and renders `none` (all gradients of a live import lost, 2026-10-11). A gradient layer is `{ kind: 'gradient', type: 'linear'/'radial', repeat, src, colors: [{ color, number, unit }], angle + rotateType 'angle' or direction ('right bottom') + rotateType 'direction', shape, position, extent }`; two equal stops without an angle are `kind: 'fill'`. Checked by feeding generated items to the editor's own background class: identical CSS for linear with angle and with direction, radial circle and ellipse at a position, solid fill, none | `toTaptopRule` writes `items` for `background-image`; a layer it cannot express stays a custom rule |
| `max-width: none` without a unit is stored as `0px`; Taptop keeps it as `{ number: 0, unit: 'none' }` (editor size class read 2026-10-11) | `toTaptopRule` writes the `none` unit for `max-width`/`max-height` |
| Native layers carry system classes: `div`, `text`, `image`, `link-block` (editor canvas read 2026-10-08); a button is `tt_link_button` with class `button` and a `text-button` label, an image has `image__img`, inline SVG `svg-icon`/`svg-icon__path` (native-copy exports recorded in `component-builders.js`). Found again 2026-10-09: a supplied page used `.button`, which the old reserved list missed | The normalizer renames such source classes to `u-<name>` (`RESERVED_CLASS_RENAMED`); a managed build still refuses any left (`RESERVED_CLASS_NAME`). The list lives in `system/lib/taptop-system-classes.js` and a test checks it against every class name the compiler emits |
| An Embed whose code is longer than 50 000 characters makes every save fail: `saveDesign` answers `DE_ERROR_NOTIFICATION_EMBED_LIMIT_EXCEEDED` («Превышен максимальный размер кода — 50 000 символов»), the indicator stays on unsaved changes (live, 97 773-character embed, 2026-10-12) | The compiler splits the embed CSS at top-level rules into Embeds of at most 45 000 characters, in order; the normalizer drops embed rules no element of the page can match (`UNUSED_RULE`; script states and :hover are ignored for that question) |
| Taptop's base stylesheet (top-level rules of the canvas stylesheet, before the project's `@media` blocks) styles 394 class names of its widgets and states: `section`, `container`, `link`, `badge`, `text-subtitle`, `menu__*`, `slider__*`, `pop-up__*`, `tabs__*`, `form__*`, `is-active` … and is written after the project rules: an imported `.section { display: none }` mega-menu panel showed because the base `.section { display: block }` came later (live import 2026-10-12, list read from the canvas) | The names are in `system/lib/taptop-base-classes.json` and reserved like layer classes: the normalizer renames them to `u-<name>`, `build` and `ui-kit --check` refuse them |
| A native numeric control keeps only a number with px, %, em, rem, vw or vh, or a keyword it knows (`auto`, `none`, `normal`): `width: fit-content` was stored as 0px and collapsed badges to one letter per line (live import 2026-10-12) | `toTaptopRule` sends other values of length properties and `font-weight` (fit-content, max-content, 100svh, inherit) as custom rules |
| A trailing `-<number>` in a class name is Taptop's duplicate counter. Creating a class whose base has no counter yet drops `-0`/`-1` (`col-1` → `col`, `mt-0` → `mt`) and leading zeros (`q-007` → `q-7`); `-2` and larger are kept; `q_1`, `q1`, `q-1a` are stored verbatim; same in the design collection (`generateByName` read and tried without adding, disposable project, 2026-10-12). Found when a 1014-class page import failed with "Не удалось обновить классы": every generated `<class>-inline-1` was refused while `-inline-2` was created | Normalizer renames such source classes to `<base>_<number>` (`CLASS_COUNTER_RENAMED`), inline-style classes are `<class>-inlineN`; `ui-kit --check` and `build` refuse any left (`CLASS_NAME_RESPELLED`). Rule: `counterSafeClass` in `system/lib/taptop-system-classes.js` |

A local zero-difference comparison does not prove the Taptop result: always import into a clean page and check the published page.

## Known limits

- Embed scripts run on the published page only; embed CSS also applies in the editor canvas.
- Swiper tracks: the static start shift assumes slides of equal width and ignores the end clamp; `loop` wraps from the last position to the first instead of Swiper's seamless clones; pagination, autoplay, effects and free mode are not reproduced (`SWIPER_OPTION_UNSUPPORTED`).
- Open question (2026-10-09, needs a live import): an `<img width height>` inside a stretching flex column keeps its size in the original, but the normalized class gets `width: auto; height: auto` (`TAPTOP_BASE_RESET`) and the local preview stretches it to the column width. The package sets the `tt_image` `maxWidth`/`maxHeight` to the intrinsic size, which `taptop-preview.css` does not emulate. Until the editor result is observed, treat such an image difference in the comparison as unresolved, not as a pass.
- Embed CSS targets class names; if Taptop renames a colliding class on paste,
  the matching Embed rules stop applying. Prefer unique source class names.
- Taptop keeps an existing project class with the same name on paste; class updates go through the runtime class sync, never through paste.
- Re-import receipts live in the editor browser's localStorage: another browser or a cleared storage treats the next import as a first one (same-name classes → choice).
- State rules in the `cm` channel are compiled from an existing contract; their
  editor rendering needs a live receipt per new state type.
