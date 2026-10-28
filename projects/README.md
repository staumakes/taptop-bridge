# Projects

This directory starts empty. Each user creates their own Taptop project here; its sources, UI-kit data, HTML previews, JSON packages and private build state stay inside that project's folder. Project folders are ignored by the Bridge's Git settings, so private work is not published with the Bridge by accident. Back them up yourself.

```sh
npm run toolkit -- init projects/my-site my-site
npm run toolkit -- projects
npm run toolkit -- doctor --project projects/my-site
```

Every command that changes a project takes its folder explicitly (`--project projects/<folder>`). There is no global active project. To start an independent site, run `init` again; do not copy another project's folder, `taptop.project.json`, `.taptop/` or receipts — a copied folder shares the namespace and both copies are refused until one is removed.

See [project layout and builds](../system/docs/project-layout.md) and [getting started](../system/docs/getting-started.md).
