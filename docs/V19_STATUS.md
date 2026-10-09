# Beethoven 19.0.0: where the build stands, and what comes next

Written on 2026-10-09, after the merge and the store upload, by the session that built 19.0.0 (the
extension thread of the beethoven project). greg was about to run short of usage, so everything that
session knew and the repository did not is written here. The reader needs nothing from that session.

## 1. Where it stands

- **On `main`.** 19.0.0 is `main` 774f0fa (pull request 8: 4ba8931 and d5c4db1). The website's
  pull request 5 is merged as a375e6b: terms version 12 with the fourth Known Risk, privacy
  version 13, and the support and reviewers pages.
- **In the store.** greg uploaded 19.0.0 to the Chrome Web Store on 2026-10-09 (he said so at
  18:44Z). It waits on the store's review, because it adds `webRequest` and
  `webRequestAuthProvider`; the reviewer's text is in `store/PASTE.md`. Whether the live
  `privacy.html` says version 13 was not checked: the site did not open from the session.
- **What it is:**
  - the 19.0.0 paragraph of `ARCHITECTURE.md`;
  - the design and build contract it was built to, `V19_DESIGN.md` (the code wins where they
    differ);
  - the Chromium, WebAuthn and Wayne State reading behind it, `research/v19/`;
  - every text change and its reason, `TEXTS_V12_V13.md`;
  - what is not yet measured (eleven items), the 19.0.0 paragraph of `OPEN_QUESTIONS.md`.
- **Checks at the merge.** `tsc` clean. vitest: 764 passed, 4 skipped (the live withdrawn-versions
  test, which needs the site folder). The mock portal's selftest: 155 passed, 0 failed. Both builds
  made, with the Chrome permissions exactly `storage`, `alarms`, `scripting`, `sidePanel`,
  `webRequest` and `webRequestAuthProvider`. CI green on d5c4db1.
- **greg's decisions it rests on**, each a card tap or a message in the thread (UTC, 2026-10-09):
  - 03:01:45Z, "Beethoven signs in": the password behind a passkey, sign-in with no tab, three rules
    reversed, new terms, a store review.
  - 03:02:21Z, "Keep side panel".
  - 16:28:55Z, "Add it now": the AccessID lockout is section 8's fourth Known Risk.
  - 16:29:14Z, "Keep, ask C&IT": the Remember tick stays at Wayne State, and greg asks C&IT.
  - 16:47:43Z, "I sent the email, now merge".

  His asks of 01:29Z and 01:38Z are behind the card: the student need not know the portal exists,
  the tab stays as the fallback, and the sign-in is saved under Windows Hello or Touch ID and runs
  in the background. He also named a file explorer as future work.

## 2. Waiting on someone else, and what to do when it comes

### 2.1 The store's review

If the review passes, nothing is needed: students update by themselves. If it fails over
`webRequest`, read the reviewer's reason against `store/PASTE.md`. Never answer it by requesting
`webRequestBlocking`, which a store extension cannot have in any case. Taking the listener out would
reverse greg's card of 03:01:45Z. That is a decision for him, with 18.0.0's tab and Chrome's own box
(still in 19.0.0 as *Use Chrome's sign-in box instead*) as what remains.

### 2.2 C&IT's answer about the Remember tick

greg wrote to hpc@wayne.edu at 16:47Z with two questions:

1. Is the optional saved password acceptable for Grid accounts under the Strong Password Standard
   ("Never save passwords in web browsers or computer programs")? It is locked by Windows Hello or
   Touch ID, and sent only to the portal.
2. Do failed HTTP Basic sign-ins at `ondemand.grid.wayne.edu` count toward the five wrong passwords
   after which an AccessID is disabled?

What each answer changes:

- **Saving is acceptable.** Nothing changes in the code. The sheet's line "Your university may ask
  you to type your password each time; if it does, leave this off." (`rememberNote` in
  `extension/src/core/model.ts`) can stay or soften. A text change goes with its integer version.
- **Saving is not acceptable.** The tick has no per-site switch today: it is offered wherever the
  passkey probe passes (`extension/src/ui/journey.ts`, `G.remember`). There are two ways, and the
  choice is greg's:
  - Take the tick away for every site. This touches the sheet, the save path
    (`extension/src/core/gridsignin.ts`, `vault.ts`, `extension/src/ext/gridSignin.ts`), the texts,
    a new terms and privacy version, and another store review.
  - Hide it per site. The key goes into hpcworker's `module-schema` first, then beethoven-sites'
    Wayne State module, then base's `profile.ts`, and then into the pins here
    (`bash interface/pull.sh framework/profiles extension/src/base`).
- **The answer to question 2** settles open question 4 in `OPEN_QUESTIONS.md`. Record it there with
  its date. If failed Basic sign-ins do not count, the fourth Known Risk is still true for Chrome's
  own re-sends; leave it.

### 2.3 hpcworker framework 19: a worker on every queue, the first to start wins

This is greg's ask of 2026-10-04 23:26Z. The hpcworker lane outside this project holds it (the hub's
`HANDOVERS.md`; snapshot 9208ca2 on hpcworker's old `main`). On 2026-10-08 this thread handed it the
following, through the coordinator:

- **Measure first, inside a Slurm job:** `sbatch --test-only -p reqp,secp -q requeue`, the same with
  `-q secondary`, `scontrol show partition reqp secp` and `sacctmgr show assoc user=$USER`.
  - If one QoS is accepted on both partitions, the race is one job over `-p reqp,secp`, and no client
    changes at all.
  - The Claude sign-in sitting (`srun -p secp -q secondary`) has one queue either way. A student's
    failed sign-ins on 2026-10-03 fit a wait inside it. That sitting is the first place more than
    one queue would help, and the snapshot does not touch it.
- **If the race is built**, framework 19 carries, on hpcworker's current `main`:
  - `worker_queues` as a lab field (`FIELD_LAYERS` in `lib/profile.py`), with the module schema
    regenerated;
  - `connect [--race]` in `cli.json`, and the gate's word `race`;
  - the line `HPCW-STEP candidates <job>,<job>[,...]` in `lines.json`, with the pattern
    `^HPCW-STEP candidates ([0-9]+(?:,[0-9]+)+)$` and the group `jobs`;
  - `candidates` in `status.schema.json` (queued) and in `worker-status.schema.json`;
  - the testbed's two jobs and a claim;
  - the vectors rewritten, and the rule R1' in `V11_CONTRACT.md`;
  - the `contract` export's version raised.

  beethoven-sites' `labs/oschome.json` then gets `"worker_queues": ["reqp/requeue",
  "secp/secondary"]`.

**The extension's side,** only after that export is published (the conformance tests and
`interface/pull.sh` refuse a reader the export does not carry):

1. `bash interface/pull.sh framework/contract framework/contract-text framework/profiles`.
2. A `candidates` reader in `extension/src/core/contract.ts`.
3. Rule R1' in `extension/src/core/facts.ts`: the run follows whichever job gets a computer first,
   and its job id becomes the winner's.
4. A second job in the mock portal.
5. Conformance and facts tests.

**Measured on the 19.0.0 tree (d5c4db1) on 2026-10-09:** a scratch test drives `facts.ts` and
`contract.ts` with a run queued as job L and a `status.json` and `connection.json` from job B, which
got a computer and went online.

- The `candidates` line parses as nothing.
- B's status and connection are never taken.
- After thirty minutes the run is still "got a computer", with no link.

So a race the framework runs today would leave the panel waiting on the losing job. The client
change has to land with framework 19, not after it.

### 2.4 The word "AccessID"

The sheet and the welcome page say "AccessID", which is Wayne State's word
(`extension/src/core/model.ts`, and the comment beside `account`). A site module carries no text for
it yet. The key goes into hpcworker's `module-schema` first, then base's `profile.ts` reads it, and
then the pins here. Until then every carried site says "AccessID". Today that is only Wayne State.

### 2.5 hpcworker's `CLAUDE.md`, lines 67 to 76

These lines are out of date and need a pull request in hpcworker. They are not edited from here. They
still list `webRequest` as never requested, still say "no automated login of the portal", and still
describe 12.0.0's `nativeMessaging` bridge and the direct way, both gone since 16.0.0. The
replacement text is the "No code on claude.ai" bullet of this repository's `CLAUDE.md`. The
coordinator was told on 2026-10-09.

### 2.6 This repository merges by hand

beethoven-extension has `ci.yml` only, with no `automerge.yml` or `rulesets.yml`, so every pull
request needs greg's merge. Adding beethoven-qa's two kit workflows and a ruleset is on greg's list
of hand steps.

## 3. Open in this repository (nobody is waiting on it)

- **Review finding R2-22 (minor, the one not fixed).** No test covers *Try again* (`retry`) or
  *Sign in to Claude* (`sign-in-claude`) in `NEEDS_GRID` (`extension/src/ui/panel.ts`). Mutating the
  set to `new Set(['connect'])` survives the whole suite. The fix: in `ui-fixtures.test.ts`, in the test that
  begins "a press that needs the grid is sent first", mount
  `h-stopped-locked` and make the home's primary button `retry`, then `sign-in-claude`. Each time,
  expect `[`act:${kind}`, 'unlockNow']`.
- **The order race (open question 9).** A sign-in in Chrome's box can land while Beethoven's answer
  waits. If Beethoven's own request ends first, a wrong saved password can still be counted as
  working once. Closing that means keeping tab request ids. `PRIVACY.md` version 13 says Beethoven
  does not keep them, so it is a terms change and greg's decision.
- **A right saved password can be held (open question 11).** The student then types it once. How
  often that happens is not yet measured.
- **The Wayne State quotes** came from a search index, because wayne.edu did not open from the
  session: the five wrong passwords, KB 20082, and the Strong Password Standard's sentence. Confirm
  them on the live pages.
- **Chromium issue 378966968.** It reports the side panel closing when a Windows Hello prompt opens.
  If that happens on a real computer, the passkey step moves to the extension's options page. That
  fallback is not built.
- **The first checks on a real computer**, in this order, from `OPEN_QUESTIONS.md`:
  1. the listener answering the live portal;
  2. Windows Hello and Touch ID raised from the side panel;
  3. the PRF result for an extension's passkey;
  4. what Chrome's site-permission prompt says.

  The e2e harness draws the sheet at the panel's sizes (`extension/e2e/sheet-fit.mjs`).
- **A file explorer**, greg's future work of 01:29Z, is not designed.

## 4. How it was built (for the methods record)

- The four-lens design review folded 40 findings into revision 2 of `V19_DESIGN.md`.
- Two adversarial review rounds over the build found 33, then 29, confirmed problems. All were fixed
  but R2-22.
- A skeptic pass over the second round's fixes found two more, and both were fixed.
- The serious findings were ways a wrong saved password could reach the grid twice. Each now has a
  test that fails on the code before its fix.
- The session's other working files were not committed: the review findings, the maps of the code
  and texts, the build logs and the mutation copies. Their conclusions are in this file,
  `V19_DESIGN.md`, `TEXTS_V12_V13.md` and the tests.
