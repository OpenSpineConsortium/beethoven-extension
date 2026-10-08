# What beethoven-extension offers and takes

This repository is one sealed unit of the Beethoven ecosystem. Another repository reaches it only
through what `INTERFACE.json` lists, at a version, through a copy pinned to a commit on `main`, and
never through a checkout of this tree (the interface standard:
https://github.com/OpenSpineConsortium/beethoven/blob/main/INTERFACES.md). Everything not listed is
private and may change in any pull request.

| Export | Kind | Version | What it is | Taken by |
| --- | --- | --- | --- | --- |
| `agreement-texts` | text | 1 | `LICENSE.txt` and `PRIVACY.md` at the root, the texts the extension ships byte for byte (`extension/public/`) and records acceptance of; each carries its own `Version N, yyyy-mm-dd.` line | the website, `OpenSpineConsortium/openspineconsortium.github.io`, which renders `/beethoven/terms.html` and `/beethoven/privacy.html` from them |
| `version` | data | 1 | `extension/package.json`, for its `version` field only | the website, which prints it beside the texts |

The export's own `version` goes up only when a consumer must change what it does (a file moves, a
heading the website reads changes form). A new text, with its own `Version N` raised, keeps it: the
website takes the new copy and renders it.

## What it takes

Three exports of `OpenSpineConsortium/hpcworker` and, since 17.0.0, one of
`OpenSpineConsortium/beethoven-base`, each at version 1 into its own folder with an `ORIGIN` (the
repository, the commit, `export <id> <version>`, and each file's sha256, sorted by path):

| Folder | Export | Kind | What reads it |
| --- | --- | --- | --- |
| `framework/profiles` | `profiles` | data | the build, which copies the JSON files into the package without their `notes` (`extension/scripts/sync-profiles.mjs`); nothing else of hpcworker enters the package |
| `framework/contract` | `contract` | data | the tests only: `extension/test/conformance.test.ts` holds every pattern, code, value and command `extension/src/core/contract.ts` types by hand equal to `cli.json`, `lines.json`, `rules.json` and the three schemas, and runs every vector through the reader the extension really uses |
| `framework/contract-text` | `contract-text` | text | people: `V11_CONTRACT.md` and `V12_CONTRACT.md`, the prose the code cites; no code reads it |
| `extension/src/base` | `browser` (beethoven-base) | code | the extension itself: `profile.ts`, the site profile's reader (module-schema 1's keys and types), the path rules, the portal's origin and the deployment a portal belongs to, compiled in through `extension/src/core/deployments.ts` and `contract.ts`; the folder's own `README.md` says so, and `extension/test/boundary.test.ts` holds it to `ORIGIN` |

No code under `extension/src/` names any of hpcworker's folders (`extension/test/hygiene.test.ts`), and the
built package is checked to carry nothing of them but the profiles (with `deployments.json`, their list). Until 15.0.0 two more, hpcworker's
program exports `framework` and `testbed`, were pinned for the harness's direct-way lane; none is now:
16.0.0 removed that way and the lane, and takes no program from any repository.

One script takes them all, with your own `gh` sign-in and from GitHub only, never from a checkout:

```
bash interface/pull.sh [--ref REF] framework/profiles framework/contract framework/contract-text extension/src/base
```

It takes only a commit hpcworker's default branch contains (REF: `main`), and only the files hpcworker's
`interface/INTERFACE.json` lists under the export at the version the import names, at that commit, with
the executable bit hpcworker's tree records; `--at-origin` takes again exactly the commit each `ORIGIN`
names. It refuses a link, a truncated listing and a `.json` file that is not a JSON object. A file a
folder holds and the export no longer does is listed for you to remove in a reviewed commit; nothing is
deleted. Then run the tests in `extension/` and commit each copy with its `ORIGIN`.

The website's home-page diagram (`extension/store-assets/src/diagram.*`, shipped as
`extension/public/tour/diagram.*`) is not pinned: it is copied from a checkout of the site by
`build_assets.mjs --sync-site`, with no `ORIGIN`, and `extension/test/boundary.test.ts` lists it, with the
live kill-list test's `BEETHOVEN_SITE_DIR`, until the website offers an export.

## What is not offered, and why

- The redaction rules (`extension/src/core/redact.ts`), the Claude Code link shapes
  (`ENVIRONMENT_URL`, `SESSION_URL`, `CLAUDE_CODE_LINK` in `extension/src/core/contract.ts`) and
  `PRODUCT_NAME` (`extension/src/core/terms.ts`): beethoven-desktop copies them by hand today, but they
  are code inside larger modules, not data a consumer could pin; they become an export once they are
  stated as data.

## What checks it

`extension/test/boundary.test.ts`, in `npx vitest run` and so in CI: the manifest's shape and that every
export path names a tracked file; no tracked file reaches another repository's checkout (sibling paths,
variables naming another checkout, clones of the organisation's repositories, submodules, another
repository checked out in a workflow, a dependency by path or git URL), with a short list of known
exceptions, each with its reason, that fails when an entry goes stale; and each import folder equals its
`ORIGIN` for the export and version the manifest names, holding nothing else but `ORIGIN` and its own
`README.md` (a folder git ignores may hold none of its files, or all of them). The same file checks that
`interface/pull.sh` reads the manifest, takes through `gh api` only and deletes nothing;
`extension/test/interfacePull.test.ts` runs it against a stand-in `gh`.
