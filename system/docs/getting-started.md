# Getting started — a synthetic walkthrough

This walkthrough builds a tiny UI kit and one page from neutral sample values, so you can see every folder and command once. Run the blocks in order from the Bridge root in a POSIX shell (macOS Terminal, Linux). The values are examples, not a design to reuse.

## 1. Install and create a project

```sh
npm ci
npm test
npm run toolkit -- init projects/sample-site sample-site
npm run toolkit -- projects
```

## 2. Describe the UI kit

The UI kit is generated from `design-system/kit.json`; the role classes are written verbatim in `design-system/roles.css`. In a real project every value comes from your source; anything the source does not show is reported as `MISSING`.

```sh
cat > projects/sample-site/design-system/kit.json <<'EOF'
{
  "projectName": "Sample Site",
  "fonts": { "primary": "Inter" },
  "css": "roles.css",
  "typography": [{ "className": "type-title", "spec": "36 / 800", "sample": "Example heading" }],
  "components": [{ "id": "buttons", "title": "Buttons", "panels": [{ "label": "Actions", "rows": [[
    { "tag": "button", "classes": ["btn"], "text": "Continue" },
    { "tag": "a", "classes": ["text-link"], "text": "Details" }
  ]] }] }]
}
EOF
cat > projects/sample-site/design-system/roles.css <<'EOF'
.type-title { font-family: Inter; font-size: 36px; font-weight: 800; line-height: 44px; }
.btn { display: inline-flex; padding: 12px 16px; background-color: #3461a2; color: #ffffff; }
.text-link { color: #3461a2; text-decoration: underline; }
@media (max-width: 479px) { .type-title { font-size: 28px; line-height: 34px; } }
EOF
npm run toolkit -- ui-kit projects/sample-site --data design-system/kit.json
npm run toolkit -- build --project projects/sample-site --artifact ui-kit
```

## 3. Add a page that reuses the UI kit

Originals go to `input/`. The page uses the exact UI-kit classes `type-title`, `btn` and `text-link`; `design-system/roles.css` is its first stylesheet. Taptop pages have no body margin, so a source page without `body { margin: 0; }` would differ by the browser's default 8px in the comparison.

```sh
mkdir -p projects/sample-site/input/home
cat > projects/sample-site/input/home/index.html <<'EOF'
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><link rel="stylesheet" href="../../design-system/roles.css"><link rel="stylesheet" href="styles.css"></head>
<body>
<section class="home-page">
  <span class="type-title">Example heading</span>
  <button class="btn" type="button">Continue</button>
  <a class="text-link" href="#details">Details</a>
</section>
</body>
</html>
EOF
cat > projects/sample-site/input/home/styles.css <<'EOF'
body { margin: 0; }
.home-page { display: flex; flex-direction: column; align-items: flex-start; row-gap: 16px; padding: 48px 24px; }
EOF
npm run toolkit -- artifact add --project projects/sample-site --key pages/home --html input/home/index.html --css design-system/roles.css --css input/home/styles.css --depends ui-kit
npm run toolkit -- build --project projects/sample-site --artifact pages/home
npm run toolkit -- build --project projects/sample-site --artifact pages/home
```

The second build reports `up-to-date`: nothing changed, nothing new is written.

## 4. Find and check the results

```sh
npm run toolkit -- artifact list --project projects/sample-site
npm run toolkit -- doctor --project projects/sample-site
ls projects/sample-site/output/html projects/sample-site/output/json
```

`output/html/index.html` is the results page. To view it and run the comparison, start the local server (it serves this folder on `127.0.0.1` only; stop it with Ctrl+C):

```text
npm run toolkit -- serve
```

Open `http://127.0.0.1:4320/projects/sample-site/output/html/index.html`, and the `links.compare` URL printed by the page build. The comparison must report a non-zero number of matched elements and zero differences at every width. The sample uses Inter: if it is not installed on your computer the tool reports “font not installed locally” — install Inter (it is free) for a meaningful comparison of text sizes. Record what you checked:

```sh
npm run toolkit -- check --project projects/sample-site --artifact pages/home --level local --result passed --note "8 widths, 0 differences"
```

## 5. Import

Install the separate Taptop Bridge Extension, open an authorized Taptop editor page, import `output/json/ui-kit--<build>.json`, then `output/json/pages--home--<build>.json`. The UI-kit classes should appear as existing/unchanged for the page. Check Computer, 768, 480 and 320, save, reload, then record `check --level editor`.

To remove the sample, delete the `projects/sample-site` folder.
