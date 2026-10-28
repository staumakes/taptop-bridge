# Figma → HTML: lessons from real transfers

Read before extracting a Figma page. Each item was hit in a real transfer.

| Situation | What to do |
| --- | --- |
| A frame's background is several image fills plus a gradient (photo collages) | Composite the layers with the Figma geometry, without text, per breakpoint; ship one JPEG per breakpoint and toggle by `display` |
| Image tiles with background, crop and radius | Export the frame node itself at 2× (`download_assets` on the frame) instead of re-cropping raw images |
| SVG logos, icons, wordmarks | Rasterise to 2× PNG; Taptop packages take raster images. Keep the SVG originals in the project's `input/` |
| A title breaks the same way at every size although its box would fit more words | The designer used a hard line break; reproduce it as one block with two text lines (flex column), not by tuning the width. The wrapper is a `div`: an `h1`/`p` holding the line spans is refused (`NESTED_INLINE_CONTENT`) |
| Percentage line height (`text--xl` 24px × 140%) | Figma lays out every line at a whole pixel: 24 × 1.4 → 34px, 14 × 1.4 → 20px (3 lines = 102, 7 lines = 238; found 2026-10-11). Take the px from the text box height ÷ lines, not size × factor, or the page drifts (8px on a 4666px page) |
| Chrome/Taptop Inter is ~1% narrower than Figma | Expect different wraps; set widths per breakpoint only where the break matters |
| Typography styles | Role classes carry font only; colour comes from the parent or a colour class, so a role never repaints text on a coloured surface |
| Figma frames are 1440/768/480/390 but Taptop canvases are 992/768/480/320 | Check 992–1199 (add a range rule in the embed stylesheet if the 1440 composition collides) and 320 (no horizontal scroll) |
| Inconsistent component sizes between frames (e.g. one button keeps the larger size) | Follow the frame with a page-level modifier class; do not change the kit role |
| Absolute compositions (hero collages) | Position in % of a container with `aspect-ratio`, so the composition scales between frames |

After extraction: compare page heights with every Figma frame (they should match to ±1 px), then build the artifact and run the comparison tool (it simulates the Taptop base classes) at all eight widths.
