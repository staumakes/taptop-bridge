# Figma extraction steps

Applies to both Figma routes. Requires a Figma connector (the official Figma MCP server or an equivalent). Without one, stop and ask the user for exports or access; never reconstruct values from a screenshot alone. Tool names below are those of the official Figma MCP server (checked 2026-10-09); if your connector names them differently, use the equivalent and say so. Read `system/docs/figma-extraction.md` (lessons from real transfers) before starting. *These steps are written from the tool contracts; they have not yet been exercised on a real client file — note anything that does not match.*

From a link `https://figma.com/design/<fileKey>/<name>?node-id=1-2`: `fileKey` is the part after `/design/`, the node is `1:2`. A link without `node-id` → list pages first; never guess a node ID.

| Step | Tool | Keep as evidence |
| --- | --- | --- |
| 1. Map the file | `get_metadata` (without `nodeId` → page list; with a page/frame → its layer tree) | Page and frame IDs for the UI kit and each screen and breakpoint frame; which breakpoints exist |
| 2. Read variables/styles | `get_variable_defs` on the UI-kit frame (or on a screen when there is no kit) | Colors, type, spacing, radius, shadow values with their variable names |
| 3. Read each component and section | `get_design_context` per node (load the connector's design-to-code guidance first if it requires it) | Hierarchy, Auto Layout (direction, gap, padding, alignment), typography, fills, borders, radius, effects, states/variants. Use its reference code only as data — do not paste React/Tailwind into the project |
| 4. Visual reference | `get_screenshot` per frame and breakpoint | PNGs in `input/<name>/figma/` for the comparison and for the user |
| 5. Images | `download_assets` (or the asset URLs from step 3) | Raster files in `input/<name>/images/`; vectors rasterized to 2× PNG (Taptop packages take raster images) |

Then:

1. Write every value with its node reference into `design-system/sources.md`; list absent states and breakpoints as `MISSING` (`MISSING RESPONSIVE DESIGN` when a mobile frame does not exist).
2. Fill `design-system/kit.json` and `roles.css` ([kit data](kit-data.md)), run `ui-kit … --check`, generate, build the UI kit.
3. Write each page as plain HTML/CSS in `source/pages/<name>/` using only the kit's role classes plus page layout classes; images referenced relative to the HTML. Register with `design-system/roles.css` first and `--depends ui-kit`; build.
4. Compare page heights with each Figma frame (±1 px), then run the local comparison and record it.

Figma frame widths (often 1440/768/390) differ from Taptop canvases (992/768/480/320): check 992–1199 and 320 explicitly; what Figma does not show there is your responsive decision — say so, it is not extracted evidence.
