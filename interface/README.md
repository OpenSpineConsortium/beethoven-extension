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

hpcworker's `profiles` version 1, the composed site profiles, pinned in `framework/profiles/` with
`framework/profiles/ORIGIN` and taken only by `framework/profiles/pull.sh` (your own `gh` sign-in, a
commit hpcworker's `main` contains, the paths hpcworker's `interface/INTERFACE.json` lists for the
export at that commit). The build copies them into the package as data (`extension/scripts/sync-profiles.mjs`).

Not yet pinned, and listed here so nobody mistakes them for pinned copies:

- `docs/V11_CONTRACT.md` and `docs/V12_CONTRACT.md` are hand copies of what hpcworker now offers as
  `contract-text` (V11 equals hpcworker's `main`; V12's `.msi` entry here names the Mac route, `wixl`,
  which hpcworker's copy lacks, and is otherwise the same). The parsers in
  `extension/src/core/contract.ts` are typed from them by hand; they are to be tested against a pinned
  copy of hpcworker's `contract` export once that is merged.
- The website's home-page diagram (`extension/store-assets/src/diagram.*`, shipped as
  `extension/public/tour/diagram.*`) is copied from a checkout of the site by
  `build_assets.mjs --sync-site`, with no `ORIGIN`; `extension/test/boundary.test.ts` lists it until the
  website offers it as an export.

## What is not offered, and why

- The bridge's wire protocol (`helper/README.md`, `extension/src/core/bridge.ts`, checked by
  `helper/test/suite.mjs` against every host): both of its ends live here, and no other repository's
  code or tests read it. hpcworker's `docs/V12_CONTRACT.md` describes it in prose.
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
`ORIGIN`, holding nothing else but `ORIGIN`, `README.md` and `pull.sh`.
