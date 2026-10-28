# Project selection

```sh
npm run toolkit -- projects
```

The output lists valid `projects` (namespace, displayName, relativePath), `issues` (errors) and `warnings`.

| Situation | Do |
| --- | --- |
| User named a folder (`projects/shop`) | Use exactly that path. If it is invalid, report the issue code; do not substitute another project |
| No projects | Ask for a project name and a namespace (lowercase letters, digits, hyphens), then `npm run toolkit -- init projects/<folder> <namespace>` |
| Exactly one valid project, no issues, no name given | Use it and say which one you used |
| Several projects, or any issue, no name given | List them (folder + display name) and ask. Do not guess |
| Two projects share a display name (`DUPLICATE_DISPLAY_NAME`) | Ask by folder path |
| `DUPLICATE_NAMESPACE` (a copied folder) | Both are blocked. Ask which folder is the real project; an independent copy needs `init` + its own `input/` |
| A path remembered from an earlier conversation | Re-check it with `projects`; a vanished path is an error, not a hint to use a neighbor |
| User switches project mid-task | Finish or stop the current command, then pass the new `--project`; nothing is shared between projects |

Never copy `design-system/`, `.taptop/` or receipts between projects. Never put Taptop editor URLs with access parameters, cookies or target IDs into project files.
