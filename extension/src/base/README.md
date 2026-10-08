# beethoven-base, the `browser` export

A pinned copy of what `OpenSpineConsortium/beethoven-base` offers the browser edition: `profile.ts`,
the reader of a deployment's site profile (the keys clients read with module-schema 1's types; the
deployment a portal belongs to, by what its own profile declares; the path rules). The extension
compiles it into itself; it holds no sentence a student reads, no platform call and no import
beyond its own files.

`ORIGIN` records the repository, the commit, the export and its version, and each file's sha256;
`extension/test/boundary.test.ts` fails when a file here differs from it. Nothing in this folder is
edited by hand: a change is made in beethoven-base, merged there, and taken again with
`bash interface/pull.sh extension/src/base` (`interface/README.md`). This README is the extension's own
and is not part of the export.
