# Figma block library

The project's built components can live in Figma as a library: one component set per block, one variant per Taptop canvas width (`Breakpoint=1440/768/480/370`), a card with usage notes beside it and the same notes in the component description. Bridge stays the source of the blocks; Figma is where people look at them, compose pages from instances and draw new blocks.

Needs the Figma MCP connector. Read `/figma-use` before any `use_figma` call. Ask the user for the library file (or create one with `/figma-create-new-file`); never write into a file they did not name.

## 1. Usage notes

`design-system/block-usage.json` maps each artifact key to its notes. Write them from the project's own evidence (a block registry, the brief); mark a note you composed from the block's content as a draft in `notes`.

```json
{
  "components/hero": {
    "name": "Section / Hero",
    "category": "Hero",
    "use": ["First screen of a page with the main offer and CTA"],
    "avoid": ["Middle of a page"],
    "content": "Required: title, description, primaryCta.",
    "notes": "Draft composed from the block content — review."
  }
}
```

`use` is required; `name`, `category`, `avoid`, `content` and `notes` are optional text. An unknown field stops the export (`BLOCK_USAGE_INVALID`).

## 2. Export

```sh
npm run toolkit -- figma-export --project projects/<folder> --artifact components/<name>
```

Only a `current` build is exported. The result is `output/figma/<artifact>--<build>/`:

- `export.html` — one copy of the block per width (`--widths`, default 1440,768,480,370). The 991/767/479 media queries are resolved for each copy and every selector is scoped to it, so Figma sees four real layouts; images are embedded; scripts are dropped. Each copy is a `.figma-bp` element named `Breakpoint=<width>`. A block heavier than 8 MB (images are embedded once per copy) is written as `export-<width>.html`, one document per width; the command and `manifest.exports` list the files.
- `manifest.json` — usage notes, `textRuns` (by label number, every translucent colour run of a text with several runs — Figma's import drops their opacity), `textRoles` (font size, line height, letter spacing and weight of every kit typography role at every width, read from `roles.css`), kit colours and warnings.

Every element that directly holds text carries `aria-label="tt:<n>"` (`tt:<n>:<role>` when it uses a kit typography class): Figma names a frame only from `aria-label`, and the label lets the same text be found in all four copies.

## 3. Import into Figma

1. `html_to_figma` with the library file, `nodeId` = the page for blocks, `cssSelector` = `.figma-bp`. POST each file of `exports` to its own returned URL; keep the `nodeIds` (four frames in all).
2. Run `system/figma/assemble-block.js` through `use_figma`: prepend `const PARAMS = {…};` and send the file's text. Several blocks may go in one call (`blocks: […]`). Fields are listed at the top of the script:
   - per block: `frameIds`, `parentId` (an auto-layout column) or `setId` (refresh an existing set), `name`, `description`, `note`, and `runs` = `manifest.textRuns` (translucent colour runs of mixed texts, restored after the import; `report.runs.missed` counts runs whose text was not found);
   - shared: `pageId`, `textRoles` (from the manifest), and, once the design-system library is published, `textStyles` (role → text style key), `colors` (`{ name, key, hex, alpha, prefer }`, light-mode values) and `modes` (`variableKey` of the adaptive collection, `byWidth` → mode names).
   The script is about 11 KB. For many blocks, store it once in the library file as a hidden, locked text layer (for example `toolkit-cache/assemble-block` on the Read me page) and run it with `new (async () => {}).constructor('PARAMS', 'figma', text)(params, figma)`; then each call sends only the block parameters. Update the stored copy whenever the script changes.
   Styles and variables can live in the library file itself: when the design system's file does not publish them, recreate its collections (same names, modes and values, aliases kept) and text styles named after the kit roles, bound to the adaptive collection's variables. Pass local ids instead of keys: `textStyles` → `S:…`, `colors[].key` and `modes.variableKey` → `VariableID:…`. List semantic tokens before primitives in `colors`: the first token of the right kind with the same value wins.
3. Read the report: `texts.offSystem` (text that matches no role at every width), `texts.ambiguous`, `colors.unmatched` and errors. Tell the user; they are design debts, not things to hide. Take one screenshot of the block.
4. Record the link:

```sh
npm run toolkit -- figma-link --project projects/<folder> --artifact components/<name> --file <figma-file-key> --node <component-set-id>
```

`design-system/figma-library.json` keeps file, node and build of every linked block.

## 4. Keep Figma current

`doctor` reports `FIGMA_LINK_STALE` when a linked block was rebuilt. Export again, import, run the script with `setId` and the new `frameIds` (variants are refreshed in place, so instances on pages keep their link), then `figma-link` again.

A change a person made in Figma is never overwritten silently: read it first (`get_design_context`), move it into the block's source, rebuild, then export. A new block drawn in Figma goes the usual Figma route ([figma steps](figma-steps.md)) into a new artifact, gets usage notes, and comes back through this export.

## 5. Pages from the library

To compose a landing page: choose blocks by their `use`/`avoid` notes, build the page in Bridge as usual, and in Figma place instances of the same component sets in a 1440 frame (and, if asked, 768/480/370 frames with the matching variant), overriding only texts and images.

Choose a block by the job of the section, not by how many items fit. When the content needs more cards than the block shows, check its usage notes: a block whose `notes` say its cards may repeat (for example Bento Photo, Ghost Cards, Overview Board in a project's `block-usage.json`) gets more cards of the same kind in the page's copy — repeat the card markup in Bridge; in Figma use the block's card components from `card-usage.json`, or detach that one page copy and duplicate the card. Never fill the gap with a block of another visual family or by cutting content to fit; say which blocks were extended.

## 6. Blocks from a Figma UI kit

When the design file already holds sections as component sets with four breakpoint variants (desktop, tablet, mobile-horizontal, mobile-vertical), bring them into Bridge with the converter instead of hand-writing markup. The design file is only read.

1. Check the set: variant names, sizes, and that texts use the kit's text styles (a section without kit tokens is not a Taptop block — skip it and say so).
2. Run `system/figma/convert-set.js` through `use_figma` on the design file with `PARAMS = { sets: [{ setId, prefix, order }], roles: [kit role names], roleAlias, buttonSet }`. Several sets fit one call; a set listed in `rest` did not fit the ~48 kB return limit — run it alone.
3. Save what the call returned to a file and write the sources: `node system/figma/write-block.js --project projects/<folder> --result <file.json> --title "Section / Name"`. It writes `source/components/<prefix>/index.html`, `styles.css` and `media.json`.
4. Export every node of `media.json` with `download_assets` (PNG, scale 2) into `images/` under its file name; for a `fill` entry take the raw image of that fill. Nodes inside an instance (`I…;…`) are refused: export them through `use_figma` (`exportAsync({ format: 'SVG_STRING' })`) and point the `<img>` at the `.svg`. Download one file for identical pictures (compare image hashes first) and repoint the duplicates.
5. Review before registering: `mismatch` lists containers whose children differ between widths — they become per-width wrappers, so the block works but repeats its content; decorative layers (a card that is only a tinted box with a centred icon) read better as CSS boxes with the icon alone.
6. `artifact add … --css design-system/roles.css --css source/components/<prefix>/styles.css --depends ui-kit`, `build`, and compare heights with the variants at 1440/768/480/370. Then write the usage notes and continue with steps 2–4 above.

## Facts this relies on (checked 2026-10-20 in a live file)

- `use_figma` returns at most 48 000 bytes; a section with four variants is 20–60 kB as plain HTML + CSS, hence the converter's compact form (`§` for the class prefix, CSS rules as indexes into a declaration list) and its per-call budget (checked 2026-10-21).
- `download_assets` accepts only plain node ids; a layer inside an instance (`I1:2;3:4`) is refused (checked 2026-10-21).
- The HTML import keeps the opacity of a text's first colour run but often drops it on later runs: `<span style="color:#0B0B0E">Strong.</span> <span style="color:rgba(11,11,14,.5)">muted</span>` arrived with the muted run fully opaque, at 0.3–0.7 alike, with or without a shifted RGB (probed 2026-10-22). Two-tone headings therefore go through `textRuns` and `restoreRuns`.
- The import turns a CSS background into an image fill stretched over the whole box, so a 14 px `no-repeat` icon at `9px 50%` covered the badge text (probed 2026-10-22). `figma-export` draws a non-repeating background of known size (`background-size` in px or an SVG with width/height) as an image layer at its CSS size and position (`Background icon`); other backgrounds stay full-size layers (`Background image`).
- A background or padding on part of a text (a highlighted phrase inside a quote) comes out as a separate box laid over the text (seen 2026-10-22). Highlight with colour only; the `dusk-quote` block was changed this way.
- `mask-image` is not carried over: a photo or table that fades out in HTML ends with a hard edge in Figma (seen 2026-10-22). The block in Bridge is unaffected; say so when you hand the Figma copy over.
- `download_assets` lists raw image fills in pairs — the full image and a small preview — so fill `k` of a node is raw image `2k` (checked 2026-10-21 on a banner with one and two image fills).
- Mobile and tablet variants of a design kit may keep the desktop mode of the adaptive collection: their headings stay at desktop size. The Bridge block uses the kit roles, so its height at 480/370 can be smaller than the variant; that is the design file's debt, not a conversion error (checked 2026-10-21 on several sections).
- A frame with an image fill and content cannot be exported without its content; the raw image of the fill is used as a layer behind the content, positioned at every width (a layer positioned only at desktop was reset to `static` at the next breakpoint and vanished — fixed in the converter 2026-10-21).


- `html_to_figma` captures at a 1280px viewport: media queries alone never give mobile layouts, hence the per-width copies.
- A scoped `body { height: 100% }` clipped every copy to the viewport height; the export's frame rule forces `height: auto`.
- Text layers are named after their content; only `aria-label` names a frame: `<label>` for a plain element, `<element> - <label>` for a semantic one (`Heading 1 - tt:3`, `Button - tt:4`). Auto layout is kept. The frame title gets the document `<title>` appended, so the script reads the width from `Breakpoint=<n>` anywhere in the name.
- A 21 MB document failed with “Failed to serialize HTML” while 5 MB documents passed; hence the split above 8 MB.
- Turning a frame into a component replaces the node: read anything you need from the frame first.
- A capture element with a single child is merged with it: the frame *is* the child (its fill, its radius). Never clear the fills of captured frames.
- The export shows the block exactly as the build renders without scripts. Interactivity that came from source JavaScript dropped by the normalizer (`SCRIPT_DROPPED`) — a reveal that sets `is-visible`, tabs switched by a script — shows the same way in Figma as it would in Taptop: invisible cards, all tab panels at once. Fix the block (a Bridge behavior), not the export.
- A CSS background moved to the Embed (`URL_TO_EMBED`) keeps its source-relative path and the build does not copy the file: the export takes it from the source folder and warns `FIGMA_IMAGE_FROM_SOURCE` (checked 2026-10-20 on a synthetic block).
- Figma's import kept a 1360 px `<img>` but dropped CSS background images of 1300 px and wider (a 650 px background passed). A background image of a plain class rule is therefore exported as an `<img>` layer ("Background image", `object-fit: cover`) behind the element's content; the rule's `background-image` becomes `none` in the export only.
- Figma's import drops an embedded image whose declared type does not match its bytes (a JPEG saved as `.png`); the export declares the type from the file content.
- Roles with identical metrics (a body size and the button size) cannot be told apart by numbers; the script uses the element kind (`Button …`).
- Applying a text style needs its font loaded by the Figma agent. A font the agent cannot load (for example one installed only on a designer's computer) leaves roles named but unstyled (`texts.errors`) until the font is available to Figma's agent (organization fonts or local font access).
- Variables and text styles of another file can be used only after that file publishes them as a library.
- Figma's HTML import sizes an `<svg>` frame by CSS but draws its content in viewBox units, unscaled: a 20-unit icon stays 20 px in the corner of a 32 px frame, whatever the `width`/`height` attributes say (probed 2026-10-21). The export labels each svg `svg:<w>:<h>` (the frame is named `Icon - svg:20:20`) and `assemble-block.js` scales the content to the frame, centred, then renames it `Icon`.
