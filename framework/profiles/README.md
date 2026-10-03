# Vendored site profiles

These JSON files are **data**, vendored from the server repository
(`OpenSpineConsortium/hpcworker`, `framework/profiles/`), which is their canonical home. The
extension ships them into `public/profiles/` at build time (`scripts/sync-profiles.mjs`, which
reads `../framework/profiles` relative to `extension/` — this folder).

When a profile changes in the server repository, refresh the copy here:

```
bash framework/profiles/pull.sh        # from the repository root; uses your gh sign-in
```

then commit the change. No code lives here and none may: since 8.0.0 the extension package
carries no cluster-side code, only the profiles as data (CLAUDE.md).
