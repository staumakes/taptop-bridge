# Import synchronization contracts

`package.schema.json` describes portable class and instance state. `embedded-asset.schema.json`
describes each image stored in the version-2 wrapper's `embeddedAssets` array. `receipt.schema.json`
describes the last state confirmed in one Taptop target. A package never stores
Taptop class/tag/media IDs; a receipt never travels to another target.

Identity is `namespace + stableKey`. Display names and content hashes may
change without creating a new logical class. `revision` identifies package
content; it is not class identity.

Each class owns only the properties present in `ownedRules`, separated into
`main`, `design`, `cm`, and `animation` selector channels. When flattened, the
canonical property path is a JSON-encoded tuple
`[channel, media, selectorText, property]`, for example
`["main","screen",".hero__title","color"]`. This prevents a hover/state rule
or design fill from being written into the ordinary selector collection and
stays unambiguous when a selector contains `/`. A receipt stores those strings
in `ownedPaths` and the exact last-confirmed `baseline`. A missing baseline
value means the property was absent at confirmation; JSON `null` is a real
value.

`targetKey` is a non-secret local identifier such as
`site:9219526:version:9308506`. Never store editor `access` parameters, cookies,
signed URLs or other credentials. Each embedded image contains canonical Base64,
lowercase SHA-256 of the decoded bytes, MIME type, byte length and intrinsic dimensions.
Image nodes refer to the record through `__pendingUpload.assetKey`. Uploaded media IDs
belong only in a target-local receipt and must never be copied between projects.

The schemas define storage shape. `system/lib/import-sync-contract.js` adds invariants
that JSON Schema cannot express conveniently here, including unique stable keys,
decoded byte hashes and baseline ownership. The three-way planner lives in the
helper because it operates immediately before editor synchronization.
