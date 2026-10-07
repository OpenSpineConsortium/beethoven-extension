# Site profiles (a pinned copy)

These JSON files are **data**, copied byte for byte from hpcworker's export `profiles`
(`OpenSpineConsortium/hpcworker`, `framework/profiles/*.json` there), which is their canonical home:
hpcworker composes each one from beethoven-sites' modules. The extension ships them into
`public/profiles/` at build time (`extension/scripts/sync-profiles.mjs`, which reads this folder),
without their free-text `notes`.

`ORIGIN` names the hpcworker commit the files equal and each file's sha256;
`extension/test/boundary.test.ts` fails when a file differs from it or the folder holds anything else
but `ORIGIN`, this README and `pull.sh`. The files are never edited here. When a profile changes in
hpcworker and is merged on its `main`, take the new copy:

```
bash framework/profiles/pull.sh [--ref REF]   # from the repository root, with your own gh sign-in
```

It takes only a commit hpcworker's default branch contains (REF: `main`), and only the files
hpcworker's `interface/INTERFACE.json` lists under the export `profiles` version 1 at that commit, each
at its path below `framework/profiles/` (`framework/profiles/wayne.json` lands at `wayne.json`), from
GitHub and never from a checkout; then it writes `ORIGIN` with the line `export profiles 1`. A profile
the export no longer has is named for you to remove in a reviewed commit; nothing is deleted. Then run
`npm run sync-profiles` and the tests in `extension/`, and commit the copy and `ORIGIN` together.

Until hpcworker's interface is merged on its `main`, `pull.sh` refuses (hpcworker has no
`interface/INTERFACE.json` there to say what the export holds), and the copy stays as `ORIGIN`
records it. That record has no `export` line because the copy was taken before hpcworker published
its interface; the next pull writes one.

No code lives here and none may: since 8.0.0 the extension package carries no cluster-side code, only
the profiles as data (CLAUDE.md).
