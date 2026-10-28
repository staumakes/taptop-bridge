# Future scope

These items are deliberately outside the first importer proof. They must not
delay the basic single-JSON import.

## Website and HTML migration

1. Capture an explicitly supplied URL or HTML/CSS snapshot.
2. Store source evidence and ask whether to preserve the visual design or
   produce a redesigned version.
3. Normalize the result into the same project system used by Figma and AI
   sources, then compile the ordinary package.

No website is fetched or copied automatically in the MVP.

## Embed synchronization

1. Associate one Embed block with a source revision and a controlled publish
   target.
2. When a new approved HTML revision is generated, update the Embed code,
   wait for a successful save, then publish only when the user has configured
   that behavior.
3. Record the deployed revision and expose a clear rollback path.

This is different from editable Taptop layer import: Embed content remains
code-driven, whereas imported blocks must remain ordinary editable layers.

## Live class updates

1. Persist a target-local receipt containing source revision, class hashes,
   root tag ID and media bindings.
2. Compare a later package only when namespace, component key and receipt
   match.
3. Apply unchanged/new Bridge-owned values automatically; retain removed
   classes for MVP.
4. For a manually changed target value, offer the explicit choice to keep the
   Taptop edit or take the JSON value. Never overwrite silently.
