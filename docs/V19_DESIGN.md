# Beethoven 19.0.0: Beethoven signs in (design and build contract, revision 2)

**How to read this file (added 2026-10-09, after the merge).** This is the design and build contract the
session that built 19.0.0 worked to, as it stood after the second review round (revision 2, kept in step
by the fixers). It was the session's working file and is committed so that whoever continues needs
nothing from that session. The code and tests on `main` (774f0fa) win wherever they differ from it. Two
things came after it: the fourth Known Risk in `LICENSE.txt` section 8 and the welcome page's summary
line 3 (d5c4db1, `TEXTS_V12_V13.md` section L13), and the last fixes of the skeptic pass. Paths under
`/home/user/` and `scratchpad/` name the session's checkout and working files; only the three research
notes are in the repository, under `docs/research/v19/`. The record of where the work stands and what
comes next is `V19_STATUS.md`.

Repository: /home/user/beethoven-extension (branch claude/extension-vpn-first-xjhm0g, base main a57f44f, extension 18.0.0).
Website repository: /home/user/openspineconsortium.github.io (same branch name, tracking origin).
This file is the contract every build stage follows. Where it names a file, a type or a key, use exactly that.
Revision 2 folds in the 40 findings of the four-lens design review (scratchpad/review_design.json). Where this file
and map_texts.json differ, this file governs.

## 0. The decision

greg tapped option B, "Beethoven signs in", on the decision card at 2026-10-09 03:01:45Z. The card asked "Save and fill
the grid sign-in through Chrome, or have Beethoven sign in by itself?". Option B read: "Beethoven keeps the password
behind a passkey and signs in with no tab at all; reverses three rules, new terms, store re-review." The card's context
named the three rules: no automated portal login, no webRequest, and grid passwords never typed into Beethoven.
At 03:02:21Z he tapped "Keep side panel": nothing changes for a full-tab start.

His asks of 01:29Z and 01:38Z, which this builds:
- "i dont want them to even know ondemand is" (hide all backend);
- "i dont want you to break the code to make it one tab instead of opening ondemand in a separate tab": so the old
  tab path stays, as the fallback;
- the OnDemand login savable under Touch ID or Windows Hello, "integrated all in teh background";
- the login chain automated when biometrics are on.

Out of scope: a file explorer (future), the AM2 login-setup step (the ssh password prompt inside the portal's shell
is a different prompt; it does not occur at Wayne State, OPEN_QUESTIONS #7, and Beethoven still never types a password
into a shell), anything on claude.ai, the direct way (gone since 16.0.0 and never reopened). Never touch
/home/user/hpcworker or any repository but beethoven-extension and the website.

## 1. Chrome facts relied on (confirmed in Chromium source, 2026-10-09; see research notes)

- MV3 `chrome.webRequest.onAuthRequired` with `['asyncBlocking']` needs the permissions `webRequest` and
  `webRequestAuthProvider` (not `webRequestBlocking`, which stays forbidden). Only the listener's callback settles
  the event; a returned value or Promise is ignored. Call the callback exactly once on every path. The WXT 0.21.4
  typing is `(details, asyncCallback?) => BlockingResponse | undefined`: the listener is a plain synchronous function.
- Neither permission carries an install warning, so an update adding them is not disabled and the install dialog
  gains no line. Each needs a store justification; webRequest lengthens review.
- Listeners must be registered synchronously at the service worker's top level. A webRequest registration made while
  no host permission is granted is refused silently (it stays in the renderer, never dispatched), so every webRequest
  listener is registered again (removeListener, then addListener) on `permissions.onAdded`.
- Every `addListener` call is its own sub-event; Chrome waits for every blocking listener and merges answers (any
  cancel wins). A double registration would make the second copy cancel the first copy's answer: always remove first.
- It fires for the extension's own service-worker `fetch()`: `tabId` -1, `initiator` `chrome-extension://<id>`.
  Only listeners in the same renderer process see an extension's requests, so another extension never sees or answers
  Beethoven's. `webRequest.onCompleted` and `onErrorOccurred` (non-blocking, the same `webRequest` permission) report
  the same `requestId`'s end.
- Credentials given are put in the profile's HTTP auth cache before the retry, shared with tabs, in memory only,
  until the browser quits or browsing data with cookies is cleared; removed again only when a response rejects them.
  Later requests below the challenged path's parent directory send them preemptively, chosen at the start of each
  request; other paths of the origin get one 401 and a silent re-send by realm.
- A sign-in made in Chrome's own box goes into the same cache, replacing the realm's entry, and Chrome takes it for
  any request of the realm: after the grid turns Beethoven's answered password down, Chrome drops only that pair and
  finishes Beethoven's own request with the box's, raising no event (http_auth_controller.cc: ResetAuth,
  InvalidateRejectedAuthFromCache, SelectNextAuthIdentityToTry). So once a box may be signed in, neither the answered
  request's end nor a later reading says which password the grid took (round 2, R2-01, R2-02, R2-14). A box sign-in
  resumes the boxed request itself (RestartWithAuth): its end is an onCompleted under the tab's own request id.
- The service worker's WebSocket is not seen by webRequest; it rides the auth cache.
- Wrong credentials: the event fires again with the same `requestId`; Chrome has no cap. `{cancel:true}` and `{}`
  on a service-worker request both deliver the server's 401 `Response` to `fetch()` (no throw). `{}` on a tab
  shows Chrome's own box; `{cancel:true}` on a tab shows the portal's 401 page (CANCEL_AUTH), never the box, which
  is why a tab's challenge only ever gets `{}` (the fake does the same since the fixer, finding 32). A 403 carries
  no challenge, so a refusal answered 403 ends at onCompleted (finding 29).
- WebAuthn: only in a window (side panel, extension tab), never the service worker. On a chrome-extension:// page the
  RP ID passed is the extension id; Chrome stores the passkey under `chrome-extension://<id>`. PRF since Chrome 116;
  `create()` reports `prf.enabled` (false: this credential has no PRF) and maybe `prf.results`; enabled true with no
  results means one `get()` gives them. Check the UV flag (authenticator data byte 32 & 0x04).
  `PublicKeyCredential.signalUnknownCredential` applies no RP-ID override, so it is expected to change nothing for
  an extension's passkey (not yet measured); TypeScript 5.9's DOM lib lacks it.
- Wayne State disables an AccessID after the fifth wrong password (reactivation up to three business days). Its
  Strong Password Standard says "Never save passwords in web browsers or computer programs".

Not yet measured (goes in the PR body and docs/OPEN_QUESTIONS.md): onAuthRequired against the live portal from the
service worker; a WebAuthn prompt from the side panel on real Windows and macOS (Chromium issue 378966968 reports the
panel closing; the fallback would be the extension's options tab); real Windows Hello and Touch ID PRF for an extension
RP ID; whether failed HTTP Basic answers at the portal count toward the AccessID's five; what passkey lists show for
the passkey; how many stale tries Chrome sends after a password change.

## 2. Invariants (each has a test)

I1 One wrong try. Beethoven itself sends a password the grid turns down at most once. The first refusal stops every
   automatic sign-in, from either source, until the student types the password again (persisted on the note for a
   saved password, so neither a worker restart nor a browser restart retries it). Text everywhere, word for word in
   substance: "Chrome re-sends its cached copy once for each request already started with it before the first
   refusal comes back; Beethoven then sends at most one; when the answered request is abandoned before the grid
   replies, Chrome may re-send that copy once. How many of these the grid counts is not yet measured."
I2 Narrow answer. Only a background GET of the portal's dashboard URL inside `checkGrid`'s armed window ever gets the
   password: `tabId` -1, the extension as initiator (absent counts as not), the portal's origin, scheme basic, not a
   proxy, the challenger the portal's host and port, the realm the one recorded (when recorded), one answer per armed
   window. Beethoven's listener never answers a tab (the tab gets Chrome's box), another origin, a proxy, another
   extension, or the credential-free reach probe. Once it answers, Chrome's own cache sends the password to the portal
   from tabs as well, until Chrome closes; the texts say so.
I3 At rest, only ciphertext. A saved password exists on disk only as AES-GCM-256 ciphertext under a key derived
   (HKDF-SHA-256) from the passkey's PRF output, which is never written to disk. The PRF output lives only in
   `storage.session` (memory, trusted contexts; its access level is never changed), cleared when the browser closes or
   the extension reloads, on Forget, Disconnect and a change of portal.
I4 The password crosses no message. It is never in an `Action`, an `ActionResults`, a view, a log line, the debug
   ring, the audit log, the activity log, `storage.local`, Details, "Copy details", the error text a page gets back,
   or argv. A page writes it only to `storage.session` (unsaved) or seals it into IndexedDB (saved), then sends an
   action that carries no secret. The background's `storage.onChanged` handler never copies a value of the session
   sign-in keys.
I5 Opt-in. The "remember" tick is never pre-ticked. Unticked, or where the passkey cannot give PRF, the typed
   password is kept in `storage.session` only for the one attempt and removed after it, success or not, on every path
   (early returns included); a leftover is removed after 2 minutes at the latest.
I6 The old way stays. "Use Chrome's sign-in box instead" opens the 18.0.0 tab path, which is unchanged; it is also
   the only path where `browser.webRequest` is absent (the Firefox build).
I7 Unchanged rules: no code on claude.ai and no claude.ai/anthropic.com/claude.com origin; no `cookies`, `tabs`,
   `webRequestBlocking`, `declarativeNetRequest`, `debugger`, `identity`, `nativeMessaging`; the extension never
   reads a cookie; no eval or remote code; the approval check still uses the account name the dashboard shows,
   never the typed AccessID (the typed AccessID is only the Basic-auth user name).
I8 Forget removes the IndexedDB record, the note, the no-PRF mark, the session unlock, the one-shot and the attempt
   state. The page may call `signalUnknownCredential` best-effort (guarded, never awaited) and no test or text claims
   it removes the passkey. The 16.0.0 cleanup (`cleanupDirectWay`) never touches the new names.

## 3. Storage

storage.local (non-secret; readable by the portal page's content script, so nothing secret ever goes here):
- `SIGNIN_NOTE_KEY = 'bridge.signin'`: `SigninNote { origin: string; username: string; saved_at: string;
  cred: string /* base64url credential id, not secret */; attempt_at?: string; typed_attempt_at?: string;
  proven_at?: string; refused_at?: string; stopped_at?: string; refusals?: number; realm?: string }`. Written whole by a
  page on a seal (no attempt or outcome fields: a new seal clears them); the background only adds or changes attempt_at,
  typed_attempt_at, proven_at, refused_at, stopped_at, refusals and realm, by read-modify-write, and only while the stored note's seal (saved_at, with cred) is the one the
  answer was given from, so a re-seal under the same passkey never takes another password's outcome (fixer, finding
  3). `typed_attempt_at` (round 2, R2-03) is the time a typed password was given while this seal (made before it was
  typed, on this portal) was saved, written before the answer goes (no mark on record, nothing is answered) and
  removed with that answer's outcome, whatever it is; a time only, never what was typed. `stopped_at` holds the saved
  password without it being turned down itself: a typed password was turned down while it was saved (it stays off
  after a browser restart unless the typed one made after that refusal works, findings 1 and 16), or an answer's
  outcome could no longer be told: a sign-in asked for or made in Chrome's box meanwhile (5.4, round 2), or the
  browser closed before the grid replied (loadGridAuth's restart rule, finding 26 and round 2's R2-03 and R2-08: a hold,
  never refused_at, and no refusal counted). Present only while a saved sign-in exists.
- `SIGNIN_NOPRF_KEY = 'bridge.signinNoPrf'`: `{ at: string; os: string }`. Written by a page when a passkey gave no
  PRF; while present the sheet offers no tick. Removed by Forget.

IndexedDB (extension origin; the portal page script cannot reach it):
- database `SIGNIN_DB = 'beethoven-signin'`, store `'records'`, key `'grid'`:
  `SigninRecord { v: 1; origin: string; username: string; cred: string; prfSalt: string; hkdfSalt: string;
  iv: string; ct: string; saved_at: string }` (base64 strings; base64url for cred).
  AAD = utf8(`beethoven-signin|v1|${origin}|${username}|${cred}`); HKDF info = utf8('Beethoven grid sign-in v1');
  a fresh 96-bit IV per seal.

storage.session (memory only, trusted contexts):
- `SIGNIN_UNLOCK_KEY = 'bridge.signinUnlock'`: `SigninUnlock { prf: string /* base64 of 32 bytes */; cred: string }`.
  Written by a page after a passkey `get()`/`create()`; read by the background to open the record per answer.
- `SIGNIN_ONCE_KEY = 'bridge.signinOnce'`: `SigninOnce { origin: string; username: string; password: string; at: string }`.
- `SIGNIN_STATE_KEY = 'bridge.signinState'`: `SigninState { sent: string[] /* requestIds given credentials, last 20 */;
  pending?: { requestId: string; at: string; source: 'once' | 'saved'; seal?: string /* the note's saved_at */;
  onceAt?: string /* the one-shot's time of typing */; tainted?: boolean };
  refused?: { at: string; source: 'once' | 'saved'; given?: string; seal?: string };
  held?: { at: string; source: 'once' | 'saved'; given: string; seal?: string /* a saved answer's seal */ };
  refusals: number; realm?: string }`.
  Survives a worker restart within the browser session. `held` (last review, K1/K1b) is the hold of 5.4 in memory: it
  covers the seal the held answer gave, or for a typed answer every seal made at or before it was given, and stops
  the saved sign-in as the note's stopped_at does, from the same turn, whatever becomes of the note's write. A typed one-shot ends a refusal only when it was typed after
  the refused password was given; a seal ends the refusal of another seal; an unlock ends nothing. The realm a check
  holds a challenge to is the session's, else the note's for this portal (finding 5): a student who never saves has
  no realm check on the first answer after a browser restart (OPEN_QUESTIONS).

None of these names may be in `OLD_DIRECT_LOCAL_KEYS`, `OLD_DIRECT_SESSION_KEYS` or `OLD_KEY_DB`.

PRIVACY.md gets one table row per store (what, where, why, control):
(1) IndexedDB 'beethoven-signin': the AccessID, the portal's address, the passkey's credential id, two salts, the IV and
    the password as AES-GCM ciphertext, with saved_at; removed by Forget, Disconnect, a change of portal or uninstalling.
(2) storage.local bridge.signin: the AccessID, the credential id, times of the last try (and of the last try of a
    typed password while one was saved, until its outcome comes), success, refusal and hold, the refusal count and the
    grid's realm name; bridge.signinNoPrf: when a passkey could not lock a password, and the
    operating system's name.
(3) storage.session bridge.signinUnlock: the passkey's output that opens the password, kept until the browser closes or
    Beethoven updates or reloads.
(4) storage.session bridge.signinOnce: a password typed without Remember, for one attempt and at most two minutes.
(5) storage.session bridge.signinState: request numbers and the outcome of the last tries, nothing typed.
Plus: Chrome keeps the password Beethoven gives it in memory until it quits or cookies are cleared, and uses it for the
student's own portal tabs too. The passkey is kept by Windows Hello, the Mac's Passwords app (iCloud Keychain) or
Chrome's password manager, which may keep it in the Google account or iCloud and offer it on other devices; the saved
password itself stays only in this browser profile. An answered challenge gets no audit line of its own (the dashboard
request is the line). The extension sees the grid's sign-in requests from the student's own portal tabs and when their
requests end, leaves them to Chrome's box and keeps of them only the mark of 5.4 (`pending.tainted`, while an answer
waits for its outcome). The texts also say: a try whose outcome cannot be told is a hold, never a refusal (5.4, and the
restart rule); the realm is learned only from a password Beethoven gave that worked and goes with Forget, Disconnect
and a change of portal; the sheet comes on every signed-out reading, so on a portal that redirects to an identity
provider it appears but no password is sent and only the box signs in; a typed password that works while the saved one
is turned down or on hold replaces it, unless it is the same password.

## 4. Modules and who owns them

Stage A (parallel, disjoint files):

A1 `src/core/vault.ts` + `test/vault.test.ts` + `test/fakeauthenticator.ts` (port of 15.0.0's
   `git show 25e7822^:extension/src/core/keyring.ts`, for a password instead of a pkcs8 key). Pure, injectable:
   - `type PasskeyApi = { create(o: CredentialCreationOptions): Promise<Credential | null>; get(o: CredentialRequestOptions): Promise<Credential | null> }`
   - `browserPasskeys(): PasskeyApi | undefined` (wraps `navigator.credentials`; undefined where absent)
   - `type PasskeyStatics = { uvpaa(): Promise<boolean>; caps?(): Promise<Record<string, boolean>> }` and
     `browserStatics(): PasskeyStatics | undefined` (isUserVerifyingPlatformAuthenticatorAvailable, getClientCapabilities)
   - `passkeySupport(api?, statics?): Promise<'yes' | 'no' | 'unknown'>` (no api or uvpaa false → 'no';
     caps()['extension:prf'] === false → 'no'; true → 'yes'; else 'unknown', which the sheet treats as yes)
   - `makePasskey(api, o: { origin: string; username: string; timeout?: number; signal?: AbortSignal }): Promise<{ cred: string; prfSalt: string; prf: Uint8Array }>`:
     rp `{ name: 'Beethoven' }` and no rp.id; user.id = first 16 bytes of SHA-256(utf8(`beethoven-grid|${origin}|${username}`))
     (a re-create for the same account replaces the earlier passkey); user.name `${username} (grid)` (the name the
     texts use); user.displayName 'Beethoven grid sign-in'; pubKeyCredParams -7, -8, -257;
     authenticatorSelection { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' };
     attestation 'none'; `timeout` default 60_000; `signal` passed through; extensions { prf: { eval: { first: prfSalt } } }.
     After create: UV from `response.getAuthenticatorData()` byte 32 & 0x04, else `VaultError('no-uv')`;
     `getClientExtensionResults().prf?.enabled === false` → `VaultError('no-prf')` at once (no get); results present
     → use them; missing → one `get()` with allowCredentials [that id] and the same salt (UV from
     `response.authenticatorData`); a 32-byte result or `VaultError('no-prf')`. Every VaultError raised after create
     carries `cred`.
   - `unlockPasskey(api, o: { cred: string; prfSalt: string; timeout?: number; signal?: AbortSignal }): Promise<Uint8Array>` (get, UV check, 32 bytes)
   - `sealPassword(prf: Uint8Array, o: { origin; username; cred; prfSalt; password; savedAt }): Promise<SigninRecord>`
     (opens the record once before returning it; the derived key is non-extractable)
   - `openPassword(prf: Uint8Array, rec: SigninRecord, expect: { origin: string; username?: string }): Promise<{ username: string; password: string }>`
     (throws `VaultError('mismatch')` on another origin or user, `'corrupt'` on a failed open)
   - `type RecordStore = { get(): Promise<SigninRecord | undefined>; put(r: SigninRecord): Promise<void>; delete(): Promise<void> }`
   - `indexedDbRecords(idb?: IDBFactory): RecordStore` and `memoryRecords(): RecordStore`
   - `class VaultError extends Error { code: 'no-webauthn' | 'no-prf' | 'not-allowed' | 'no-uv' | 'mismatch' | 'corrupt'; cred?: string }`
     (NotAllowedError, AbortError and a timeout map to 'not-allowed')
   - base64 / base64url helpers.
   No browser global at module load; `navigator.credentials` and `PublicKeyCredential` appear only inside
   `browserPasskeys`/`browserStatics`. The fake authenticator: create returns a credential whose
   `response.getAuthenticatorData()` has flags at byte 32 (UV 0x04 per a knob), get returns `response.authenticatorData`,
   `getClientExtensionResults().prf` is `{ enabled?, results?: { first: ArrayBuffer(32) } }` per knobs (prf at create,
   prf at get only, enabled false, none), a deterministic PRF per (credential, salt), cancel and timeout knobs, and
   counters of ceremonies. vault.test needs a fake IndexedDB: if `fake-indexeddb` is not already a dev dependency, test
   `indexedDbRecords` against a small hand-written IDBFactory stand-in in the test file; add no dependency.

A2 `src/core/gridsignin.ts` + `test/gridsignin.test.ts`: the pure decision, no I/O.
   - `interface AuthDetails { requestId: string; url: string; tabId: number; initiator?: string; isProxy: boolean; scheme?: string; realm?: string; challenger?: { host: string; port: number } }`
   - `interface AuthContext { extOrigin: string; portalOrigin?: string; armed?: { url: string; answered?: string; source: 'once' | 'saved' }; sent: ReadonlySet<string>; pending?: string /* requestId of an unsettled answer */; refusedOnce: boolean; refusedSaved: boolean; realm?: string }`
     (`refusedOnce` = SigninState.refused is set; `refusedSaved` = SigninState.refused is set or the note has refused_at)
   - `type AuthVerdict = { act: 'answer'; source: 'once' | 'saved' } | { act: 'cancel'; why: 'repeat' } | { act: 'pass'; why: AuthPassWhy }`
     with `AuthPassWhy = 'tab' | 'initiator' | 'proxy' | 'scheme' | 'origin' | 'challenger' | 'not-armed' | 'armed-once' | 'unsettled' | 'refused' | 'realm'`
   - `authVerdict(d, c): AuthVerdict`, in this order: tabId !== -1 → pass tab; initiator !== extOrigin (absent included)
     → pass initiator; isProxy → pass proxy; scheme (lower case) !== 'basic' → pass scheme; no portalOrigin or the
     url's origin !== portalOrigin → pass origin; challenger present and not the portal's host and port (the URL's
     port, else 443 for https: and 80 for http:) → pass challenger; `sent.has(requestId)` → cancel repeat; no armed or
     the url (without query or hash) !== armed.url → pass not-armed; armed.answered set → pass armed-once; pending set
     and !== requestId → pass unsettled; (armed.source 'once' ? refusedOnce : refusedSaved) → pass refused; realm
     recorded and d.realm differs → pass realm; else answer with armed.source.
   - `portOf(origin: string): number`, `unlockWord(os: string): string` ('win' → 'Windows Hello', 'mac' → 'Touch ID',
     otherwise 'your screen lock'), `onceExpired(at: string, now: number): boolean` (older than 2 minutes, or unparsable),
     `ONCE_MS = 120_000`, and `ACCESS_ID = /^[A-Za-z0-9._@-]{1,64}$/` (the dashboard's own set).

A3 Test harness: `test/fakebrowser.ts`, `mock-ood/server.mjs`, `mock-ood/server.d.mts`, `e2e/mock-selftest.mjs`
   (keep every existing test green; existing tests that need the 18.0.0 tab path will pass `install({ webRequest: false })`,
   which stage B does):
   - `install(opts?: { webRequest?: boolean })`, default true (the Chrome build). False omits `browser.webRequest`.
   - fake `webRequest.onAuthRequired`, `onCompleted`, `onErrorOccurred` (ev-style, clearable): each addListener call is
     its own entry recording filter and extraInfoSpec; an onAuthRequired/onCompleted/onErrorOccurred addListener made
     while `granted` is empty is kept but marked refused (hasListener true, removeListener removes it, never dispatched)
     and logs `webRequest.<event>.addListener refused (no host permission)`.
   - `permissions.onAdded` / `permissions.onRemoved` as ev(); `world.grant(origin)` adds `${origin}/*` and fires onAdded
     `{ origins: [`${origin}/*`], permissions: [] }`; `world.revoke(origin)` removes it and fires onRemoved.
   - an `authorize(request)` step used wherever the fake decides a 401 today (dashboard, files, file listing/download,
     shell page, `/pun/sys/dashboard/files`, which must 401 when signed out like the mock): credentials 'omit' → plain
     401, no event; a cache entry that matches the grid → pass, no event; a stale cache entry (the grid's password
     changed) stays usable by every fetch that starts before the first stale 401 is delivered, each counted as Chrome's
     (`world.chromeBadTries`), and is dropped when that 401 is delivered, then the event; the event only when
     `${ORIGIN}/*` is granted and the url matches the filter. Details as Chrome gives them: requestId stable across
     repeats, url, method, type 'xmlhttprequest' | 'websocket' | 'main_frame', tabId -1 with initiator
     `chrome-extension://ext` for the worker, scheme 'basic', realm (default 'private'), challenger
     {host:'ondemand.grid.wayne.edu', port:443}, isProxy false, statusCode 401.
   - dispatch to every non-refused entry and merge Chrome's way: any `{cancel:true}` → cancel; else the first
     `authCredentials`; else none. asyncBlocking waits for every entry's callback (a timeout logs `never answered`);
     a returned value or Promise counts as no answer; a second call of one callback logs `answered twice` and is ignored.
   - credentials that match → cached, the request retried → 200 and onCompleted(statusCode 200); credentials that do
     not → 401 again and the event again with the same requestId, up to `authRepeatLimit` (default 5; past it log
     `LOOP` and give the 401); cancel or no answer → the 401 for a worker request (onCompleted statusCode 401),
     Chrome's box for a tab (log `Chrome's sign-in box over tab #<id>`; `world.answerBox(tabId, user, pw)`).
   - `world.dropAuthRetry()`: the next retry after credentials fails as a network error (fetch throws TypeError) and
     fires onErrorOccurred for that requestId, with the credentials already in the cache (Chrome adds them before the
     retry).
   - One log line per answer: `webRequest.onAuthRequired #<requestId> <type> <path> tab=<id> -> credentials|cancel|none`,
     never the user or password.
   - `opts.gridUser` ('st1234'), `opts.gridPassword` (what the grid accepts now), `world.authCache`, and `opts.signedIn`
     kept as a getter/setter over the cache (true seeds the right pair; false clears it), so every existing use keeps
     its meaning. `world.authAnswers` (booleans only), `world.badAnswers` (wrong credentials given by a listener),
     `world.chromeBadTries`, `world.realm`.
   - helpers to raise a proxy challenge, another realm's challenge, another origin's challenge, and a tab's challenge
     with a path (`world.tabChallenge(tabId, path)`).
   - every fake 401 carries `WWW-Authenticate: Basic realm="<realm>"`.
   - the WebSocket handshake goes through the same cache rule (type 'websocket', never an event): with no matching
     cache entry it errors and closes 1006 before 'open'.
   - `storage.session.setAccessLevel` (logged), `indexedDB` absent unless a test provides one, `world.fireAlarm(name)`,
     `getManifest()` with the manifest's permissions, `permissions.contains` honouring `permissions`,
     `world.stopWorker()` (empties every listener array including webRequest's and permissions', closes sockets 1006,
     keeps storage), `world.restartBrowser()` (stopWorker plus clears storage.session and the auth cache).
   - `runtime.getPlatformInfo()` answers `{ os: world.os ?? 'win' }`.
   - mock: `state.password` mutable (`setPassword()` on the returned object and `POST /_mock/password`, body read and
     never echoed or logged), `state.basicGood` / `state.basicBad` counters in `/_mock/state` (never the password),
     an optional `lockoutAfter` (`--lockout N` / `MOCK_LOCKOUT`): after N bad answers even the right password gets
     401 until `/_mock/reset`; an optional `realm`. Typings in server.d.mts; checks in mock-selftest's basic section,
     including `--cold-pun` after an accepted Basic answer.

A4 Texts in beethoven-extension (no code but `src/core/terms.ts` and `test/terms.test.ts`):
   - LICENSE.txt version 12 and PRIVACY.md version 13, dated 2026-10-09. LICENSE head: "Version 12, 2026-10-09.
     Applies to the Trial Edition of Beethoven 19.0.0 and later versions that ship this text". `TERMS_VERSION` 12,
     `TERMS_DATE` '2026-10-09'; terms.ts gets the comment line "19.0.0 (LICENSE version 12, PRIVACY version 13:
     Beethoven signs in to the grid): a version 11 acceptance is kept in the history the same way and is out of force";
     terms.test.ts adds `expect(recordInForce({ ...r, terms_version: 11 })).toBe(false)` and a check that PRIVACY.md's
     head line says version 13 and TERMS_DATE. Run `node scripts/sync-profiles.mjs` (from extension/) so
     extension/public copies are byte-identical.
   - SUMMARY and the tick stay word for word. Line 2 stays true (nothing new reaches Licensor). The password is
     consented to in the sheet, by typing it and pressing Sign in; saving takes an unticked box. Section 8's three
     Known Risks stay. LICENSE 5(b)(i) states as behaviour: the at-most-one-try rule (I1's sentence), Chrome's own
     re-send of its cached copy, that the institution may lock the account after wrong passwords, that saving is
     optional and off unless ticked, that section 4(a) applies and where the institution says to type the password each
     time the student leaves it off, where the passkey lives (the PRIVACY wording of section 3), and that Chrome stays
     signed in until it closes.
   - `docs/TEXTS_V12_V13.md` in TEXTS_V11_V12's format, with "Kept as they were" (SUMMARY, the tick, the Known Risks)
     and "For Greg (and counsel)": whether the lockout should become a fourth Known Risk (it would change SUMMARY line
     3, summary_sha256 and terms.test together), and Wayne State's Strong Password Standard quoted, asking whether to
     offer the tick at Wayne State at all.
   - CLAUDE.md, exactly: in the "No code on claude.ai" bullet remove `webRequest` from the forbidden list (keep
     `webRequestBlocking`) and replace "No automated login of the portal; the university's sign-in pages are never
     filled in." with: "Beethoven signs in to the grid (greg's card tap of 2026-10-09 03:01Z, 19.0.0). `webRequest` and
     `webRequestAuthProvider` serve one `onAuthRequired` listener. It answers only the HTTP Basic challenge of
     Beethoven's own background dashboard request on the one granted portal origin, once per armed check, with the
     AccessID and password the student typed into Beethoven's sheet. It never answers a tab's, a proxy's, another
     origin's or another realm's challenge, and one refusal stops every automatic sign-in until the student types the
     password again. The password is saved only if the student ticks Remember (never pre-ticked), and then only as
     AES-GCM ciphertext under a key derived from the passkey's PRF output. It never appears in a message, a log, the
     audit log, storage.local or argv, and never reaches Licensor. No HTML sign-in page or identity provider is filled
     in, no multi-factor step is touched, and no password is typed into a shell. The approval check uses the account
     name the dashboard shows, never the typed AccessID." Line 7 ("using only the student's existing Open OnDemand
     browser session") becomes "using only the student's Open OnDemand sign-in, which Beethoven may make with the
     password the student gave it"; the secrets bullet adds "or the grid password"; the direct-way bullet adds
     "19.0.0's sign-in sheet is not the direct way: no ssh, no bridge, no one-time code, and the VPN is still needed";
     the Terms bullet moves to LICENSE 12, PRIVACY 13 and 2026-10-09 (describing the sign-in sheet, the passkey, the
     one-shot, Forget) on top of 11/12; the Read-first bullet names the RESEARCH_REPORT passages the dated note
     supersedes.
   - SECURITY.md, README.md, extension/README.md, docs/ARCHITECTURE.md (a 19.0.0 header paragraph and the permission
     table), docs/RESEARCH_REPORT.md (a dated note, never a rewrite), docs/OPEN_QUESTIONS.md (section 1's
     not-yet-measured list), docs/STORE_LISTING.md (a header line), docs/store/{LISTING,PASTE,SUBMISSION,TEST_BEFORE_UPLOAD}.md
     (the two permission justifications; the storage justification adds "your grid sign-in, encrypted, if you chose to
     save it"; Authentication information ticked, replacing PASTE.md's "Leave unticked" lines; the reviewer recipe
     with the mock in `--auth basic`; the version the privacy page must show moves to 13 and the agreement to 12; the
     store upload waits until https://openspineconsortium.com/beethoven/privacy.html shows version 13; LISTING's
     negative-statement block identical to the reviewers page's new block), docs/guides/{USE,INSTALL,LAB_LEAD}.md
     (USE.md states Wayne State's standard plainly), docs/DIAGNOSTICS.md check 4 hand-edited (nothing generates it here:
     the student's line, and a note that Beethoven answers the portal's HTTP sign-in from its background under the
     narrow rule and never fills an HTML or identity-provider page).
   - The old and new passkeys told apart wherever the texts mention a passkey (USE.md:184, INSTALL.md:88,
     LAB_LEAD.md:137, LICENSE, PRIVACY, the support page): "the old passkey (12.0.0 to 15.0.0) is named with your AccessID
     alone, or 'beethoven' (15.0.0 named a newly made one so), and can go; the one 19.0.0 uses for your grid sign-in is named '<AccessID> (grid)'; delete that
     one only after Forget".
   - Never edit /home/user/hpcworker. Write `scratchpad/OTHER_REPOS_NOTE.md` for the PR body: hpcworker CLAUDE.md:69-76
     quoted, the extension's new rule text beside it, and a note that its nativeMessaging sentence has been stale since
     16.0.0; beethoven-desktop's "typed only into ssh's own prompt" rule is that edition's and unchanged.
   The map of passages is scratchpad/map_texts.json (88 change points; point 82 is replaced by the note above; where
   it differs from sections 3 and 5 here, this file governs).

A5 Texts in the website repository (/home/user/openspineconsortium.github.io, its own commit, after A4's
   LICENSE/PRIVACY are final): rewrite tools/pages/beethoven/support/body.html (no more "never asks for your grid
   password"; replace #password with Beethoven's own saved sign-in: Remember, unlock, Forget, where the passkey lives,
   Wayne State's standard; old passkey versus new) and tools/pages/beethoven/reviewers/body.html (webRequest and
   webRequestAuthProvider and why; the negative block identical to LISTING.md's new block; the reviewer recipe), then
   `BEETHOVEN_REPO=/home/user/beethoven-extension python -X utf8 tools/build_site.py` and `--check-only` with 0 problems.

Stage B (after A; disjoint files):

B0 (first, small) `src/core/model.ts`: the words of 6.1, the view types of 6.2, the new Action kinds and the
   `placeOf` helper. Then B1 and B2 run in parallel.

B1 Background and core facts: `src/entrypoints/background.ts`, `src/core/keys.ts` (the keys and types of section 3),
   `src/core/steps.ts`, `src/core/checks.ts`, `src/ext/connectApi.ts`, `wxt.config.ts`, `package.json` version,
   `test/hygiene.test.ts` (permissions and the /ondemand/i rule), `test/publishStore.test.ts` (fixture manifest), new
   `test/background19.test.ts`, and updates to any existing test the change legitimately breaks (tab-path tests pass
   `install({ webRequest: false })`; never weaken an assertion). Section 5.

B2 Pages: `src/core/sheets.ts` (settings row), `src/ui/journey.ts`, `src/ui/panel.ts`, `src/ui/settings.ts`,
   `src/ui/home.ts` (grid row link), `src/ui/welcome.ts` (place names), `src/ui/rpc.ts` if needed,
   `src/ui/fixtures.ts`, `src/ui/gallery.ts`, `src/ui/style.css`, `src/ui/labels.ts`, new `src/ext/gridSignin.ts`
   (page side, the only caller of the passkey and seal functions), `test/ui-fixtures.test.ts`, new
   `test/gridSigninPage.test.ts`. Section 6.

## 5. Background (B1)

5.1 Manifest. `wxt.config.ts`: Chromium `permissions: ['storage', 'alarms', 'scripting', 'sidePanel', 'webRequest',
'webRequestAuthProvider']`; the Firefox MV2 build gets neither (no webRequestBlocking ever). The comment's
must-stay-absent list loses webRequest and says why the two are there. hygiene.test.ts asserts exactly the six on
Chromium, still refuses cookies, tabs, debugger, identity, declarativeNetRequest, nativeMessaging,
webRequestBlocking, activeTab, and still no Anthropic host. Version 19.0.0 wherever the version lives.

5.2 Memory. `mem.gridAuth` (not `mem.signin`, which stays the 18.0.0 tab facts):
`{ loaded: Promise<void>; state: SigninState; note?: SigninNote; once?: { origin: string; username: string; at: string };
unlockCred?: string; working: boolean; asked?: number; outcome?: { requestId: string; settle(o: 'proven' | 'refused' | 'unsettled'): void; done: Promise<'proven' | 'refused' | 'unsettled'> } }`.
`loaded` is started in main() (reads SIGNIN_STATE_KEY, SIGNIN_NOTE_KEY, SIGNIN_UNLOCK_KEY's cred only, and removes an
expired one-shot). At load: a leftover `state.pending` stays (unsettled); with no session state at all (a browser
restart) and a note whose attempt_at is later than proven_at, refused_at and stopped_at, or that carries
typed_attempt_at (a typed try given while it was saved, round 2, R2-03), the note is put on hold: stopped_at, never
refused_at, no refusal counted, typed_attempt_at removed (the outcome was lost; round 2, R2-08). `afterLoad(fn)` runs
fn at once when the load has finished, else after it: a tab's challenge or a request's end can be the event that
wakes the worker, before the state it is about is read (round 2, R2-01), and none decides on an empty state. `storage.onChanged` keeps `note` and `unlockCred` current from their keys (local SIGNIN_NOTE_KEY,
session SIGNIN_UNLOCK_KEY's cred only) and, when SIGNIN_ONCE_KEY gets a value, creates the alarm `bridge.signinOnce`
at +2 min; it never copies the one-shot's or the unlock's secret values.

5.3 Listener. In main(), synchronously, and again (removeListener first) in `browser.permissions.onAdded`:
`browser.webRequest?.onAuthRequired?.addListener(onGridAuth, { urls: ['https://*/*', ...dev hosts] }, ['asyncBlocking'])`,
plus `onCompleted.addListener(onGridDone, filter)` and `onErrorOccurred.addListener(onGridError, filter)` the same way.
`onGridAuth(details: Browser.webRequest.OnAuthRequiredDetails, callback?: (r: Browser.webRequest.BlockingResponse) => void): undefined`
is synchronous and never async. With no callback it returns. `answer` is once-guarded and wrapped in try. In its first
synchronous turn, from memory only, it builds `AuthContext` (extOrigin = `chrome-extension://${browser.runtime.id}`,
never via URL().origin; portalOrigin from the settings in memory or `mem.grid.armed`'s url) and asks `authVerdict`:
- pass → `answer({})`.
- cancel (a repeat for a requestId Beethoven gave credentials to: the grid turned them down) → in the same turn mark
  refused for `state.pending.source` (memory: `state.refused = { at, source }`, `state.refusals += 1`, clear pending,
  settle the outcome 'refused'), `answer({ cancel: true })`, then persist (state; for 'saved' also refused_at and
  refusals on the note).
- answer → in the same turn set `mem.grid.armed.answered = requestId`. Then (async) read the secret for the source:
  'once' from SIGNIN_ONCE_KEY (fresh by onceExpired and for this origin; an expired one is removed); 'saved' from the
  record opened with SIGNIN_UNLOCK_KEY (`openPassword(prf, rec, { origin })`, the unlock's cred equal to the record's).
  No secret or a failed read → `answer({})` and nothing else. Else persist `state.pending = { requestId, at, source }`
  and `state.sent` (+requestId, last 20) and, for 'saved', `attempt_at` on the note; for 'once', `typed_attempt_at` on
  the note of a seal of this portal made before the one-shot was typed (when there is one and the mark cannot be put on
  record, nothing is answered: `answer({})` and the pending is withdrawn; round 2, R2-03); create
  `mem.gridAuth.outcome`; then `answer({ authCredentials: { username, password } })`. Drop references to the password
  right after.
- pass because the challenge is a tab's → also `boxMaySignIn(url)` (5.4).
- any exception → `answer({})`.
Debug line per event: the verdict, the reason, the request type and whether tabId is -1; a URL only for answer or
cancel (the armed dashboard URL), never for a pass; never the user name or password.

5.4 Outcomes, keyed by the answered requestId (never read from checkGrid's state):
- `onGridDone(d)` for `state.pending.requestId`: statusCode 401 or 403 → refused (as the cancel path); any other status
  (200, 3xx, the cold 5xx) → proven: clear pending, `state.refused` cleared, `state.refusals = 0`, `state.realm =`
  the realm seen at answer time (keep it from the details in memory); for 'saved' `proven_at`, realm and refusals 0
  on the note; for 'once', if the note has refused_at the saved record is stale (a different password worked):
  forget it (5.7's forget, without touching the session unlock of nothing) with the activity line
  `LOG_WORDS.signinReplaced`. Settle the outcome.
- `onGridError(d)` for the pending requestId → unsettled: pending stays; settle 'unsettled'.
- While pending is set and unsettled, the listener passes 'unsettled'. The next checkGrid that reads signed-in, cold
  or not-ood settles it proven (Chrome's cache carried the answered copy); one that reads signed-out settles it
  refused. unreachable leaves it.
- The box rule (round 2: R2-01, R2-02, R2-05, R2-14, R2-15, R2-23). `boxMaySignIn(url)`: while an answer is pending
  (in flight or unsettled), a challenge of a tab on the portal's origin (pass/tab) or the end of a tab's request on
  the portal's origin with a status other than 401 and 403, not from the cache, marks it: `pending.tainted = true`,
  persisted (a worker restart keeps it). Only the URL's origin is looked at, after the load (afterLoad); no tab id,
  request id or line of the tab is kept. The window's own answer is not excepted. A marked answer is never proven
  and never counted as turned down: its request's 200, and a later reading signed in, cold, not-ood or signed out,
  all go to `unconfirmedNow`: pending cleared, settle 'unsettled', no refusal counted, `state.held` set in that same
  synchronous turn (as `state.refused` is for a refusal; persisted with the state), and the saved sign-in put on
  hold on the note too (stopped_at: for 'saved' the answered seal's note; for 'once' a seal of this portal made before
  it, with typed_attempt_at removed). Every reader of a hold reads both: authContext's refusedSaved, savedSigninReady,
  grid-signin's standing refusal and the facts' refused and held (last review, K1/K1b: a slow or failed write of the
  note let the next window, even the same Unlock's, give the held password again). Its 401 or 403 is still a refusal (the grid turned Beethoven's own down). A box submitted
  before Beethoven answers is no sign (the answer replaces it in the cache); a box left open, never submitted, marks
  nothing unless a tab of the portal is let in while the answer waits. Residuals, not yet measured: a tab's request
  that ends after Beethoven's own 200 (the box's password may have been what the grid took, but the outcome came
  first: proven); and ordinary portal traffic let in while an answer waits marks it (a hold for a password that may be
  right: the student types it once more). Kept as it is after the last review (K2): a tab's request let in without a
  challenge cannot be told from the end of a box sign-in made before the answer without keeping tab request ids, which
  the texts say are never kept, and I1 prefers the hold; the sheet words it as a hold (5.8), never as a refusal.
- A typed answer that works while the saved one is turned down or on hold (the note's marks, or `state.held` covering
  that seal): the same password lifts both holds and marks the seal proven_at (so the restart rule does not read the
  held try's attempt_at as lost); another, or one that cannot be compared, forgets the record and the note.
- A typed answer's outcome, whatever it is, removes its typed_attempt_at; a refused one also counts on the note's
  refusals (R2-21).

5.5 checkGrid. Claims `mem.busy.grid` before its first await (the startConnect pattern, background.ts:1959-1964) and
keeps its promise in `mem.gridCheck` (cleared in finally). Then awaits `mem.gridAuth.loaded`, termsInForce and the
client. Before `c.session()` it arms only when `ownSigninAvailable()` and a source exists: 'once' if `mem.gridAuth.once`
is fresh for this origin, else 'saved' if the note is for this origin and `unlockCred === note.cred`;
`mem.grid.armed = { url: portalOrigin + DASHBOARD, source }`, cleared in finally. After `c.session()`: if the window
sent credentials and the outcome is not settled yet, await `outcome.done` (at most 6 s); if it settled proven and the
read was not signed-in, call `c.session()` once more (the auth cache carries it) and use that reading. Then the
unsettled rule of 5.4 for a pending answer from an earlier window. The rest is as today (a cold reading is signed in;
onSignedIn; rememberIdentity).

5.6 When the sheet is used. `ownSigninAvailable()` is true when `browser.webRequest?.onAuthRequired` exists. Then:
- `onAgree` signed-out → no tab; the welcome hands over to the panel (`mem.welcome = handoff`); the grid moment shows
  the sheet.
- `afterReach` → `checkGrid` (which signs in when it may); no tab.
- `readyForPressInner` signed-out → `{ go: false, waiting: 'grid' }` and no tab.
- action `'sign-in-grid'` → `mem.gridAuth.asked = Date.now()` (the journey shows the grid moment with the sheet;
  cleared on sign-in, on 'grid-signin-later', or after 10 minutes); no tab.
- new action `'sign-in-grid-box'` → the 18.0.0 path, `openSigninTab('press')`, as before.
- `startDirectSitting`'s 401 → writeGrid signed-out, keep the press, run `checkGrid('shell-401')` once per press (a
  flag on the press record) so a lost auth cache is recovered with no tab; never a tab.
- `pollRun`'s 401 → signed-out as today; the next tick's `checkGrid` signs in when it may.
- `backgroundPoll` with no page open → when the grid note says signed-out and a saved sign-in is unlocked and not
  refused, one `checkGrid('alarm')` per alarm.
- alarm `bridge.signinOnce` → remove SIGNIN_ONCE_KEY when expired (onceExpired) and clear `mem.gridAuth.once`.
Without `ownSigninAvailable()` every path is the 18.0.0 one, unchanged.

5.7 Actions (after the terms gate; none carries a secret; results carry none):
- `{ kind: 'grid-signin'; how: 'typed' | 'saved' | 'unlocked' }` → `{ signedIn: boolean; refused: boolean }` for this
  call's own attempt. Steps: `mem.gridAuth.working = true` (push); `typed`: read SIGNIN_ONCE_KEY's meta (origin,
  username, at; never keep the password) into `mem.gridAuth.once` if fresh; `saved`: reload the note and the unlock
  cred from storage; then `while (mem.gridCheck) await mem.gridCheck;` and in that same synchronous turn: `typed` with a
  fresh one-shot whose at is later than the refused password's time of giving clears `state.refused` (memory, then
  persisted); a one-shot typed before a refused saved password was given clears it only when it is another password
  than that seal's (compared with the record in memory, constant-time, never logged; unreadable keeps the refusal;
  round 2, R2-04); `saved` clears `state.refused` when it names another seal (by seal, not by clock: R2-18); `unlocked`
  clears nothing; then call `checkGrid('signin-sheet')`. When the window passed because an earlier answer was still
  pending and its own reading settled that one refused or unconfirmed, this attempt's password was never tried and the
  round runs once more. In a finally: remove SIGNIN_ONCE_KEY, clear `mem.gridAuth.once`, working false,
  push. The background never clears a note's refused_at on a page's word: only a new seal (a new note) does.
- `{ kind: 'grid-signin-later' }` → clears `mem.gridAuth.asked`.
- `{ kind: 'sign-in-grid-box'; windowId?: number }` → `{ opened: boolean }`.
- `{ kind: 'forget-grid-signin' }` → deletes the record (`indexedDbRecords().delete()`), the note, the no-PRF mark,
  the unlock, the one-shot and the state, clears memory; activity `LOG_WORDS.signinForgotten`; result `{ forgotten: true }`.
- `disconnect` forgets; `change-portal` and `use-portal` forget only when the origin changed (the test that resets
  mem.client today).
- A stray `'unlock-grid'` (page-intercepted normally) is treated as `'sign-in-grid'`.
`act()` keeps logging the kind only.

5.8 Facts and views. `SigninFacts` gains `asked?: number` and `own?: OwnSigninFacts`:
`OwnSigninFacts { saved: 'none' | 'locked' | 'ready'; refused: boolean; held: boolean; refusals: number; working: boolean; username?: string; unlockWith: string; origin: string; later: 'asked' | 'press' | undefined }`
(`own` absent when `ownSigninAvailable()` is false). saved: none without a note for this origin; ready when
`unlockCred === note.cred`; else locked. refused: `state.refused` set, or saved !== 'none' and the note has refused_at.
held (round 2, R2-08): refused is true only because the saved sign-in is on hold, with no refusal this browser
session and a hold (the note's stopped_at, or `state.held` over that seal) its latest mark (an outcome that could not
be told, or a typed refusal before a browser restart); the sheet says it could not tell, never that the password did
not work (`WORDS.grid.held`, and the password field is not marked invalid). refused also counts `state.held` over the
note's seal.
refusals: `state.refusals` (or the note's for a saved one after a restart). username: the note's, else the identity
the dashboard last showed. unlockWith: `unlockWord((await runtime.getPlatformInfo()).os)`, cached. later: 'asked' when
the moment comes from `asked`, 'press' when a press waits on the grid.
studentMoment returns 'grid' also for `asked`. The 'grid' journey builder (steps.ts) builds `sheet` (6.2) when `own` is
present and no 18.0.0 sign-in tab is being watched; the unreachable and not-ood problems stay; the 18.0.0
signed-out/cancelled/tab-closed problems are not shown with the sheet. The core sets `sheet.note` to the refused words
(refusedTwice from the second refusal in a row, a hold included), or to `held` when held. Overlays gain `unlock?: { unlockWith: string }` exactly when
`own.saved === 'locked' && !own.refused` and the grid is not signed in. The home Grid row keeps "Signed out"
(WORDS.home.gridSignedOut); its link is "Unlock" (`{ kind: 'unlock-grid' }`, page-intercepted) under the same
condition as Overlays.unlock, else "Sign in" as today; with the Unlock link the hero's as-of line uses
`WORDS.home.asOfLocked`. Settings gets `signin` (6.2) from the note, the unlock and refused.

5.9 Words in checks.ts: the 'session-lifetime' assumption and its manualFix name both ways ("after that Beethoven
signs in again with the saved or typed password, or the student signs in in Chrome's box"); the 'signed-in' manualFix
says Beethoven signs in with the password you gave it, or press Sign in on the Grid row and type it; its futureRisk
names both ways.

5.10 Place names (hide the host). `placeOf(name: string | undefined, host: string)` in model.ts: `the ${name}` when a
profile names the grid (`display_name`), else the host. steps.ts (revokedBody, allowNote, denied) and background.ts
(denied at 1292) pass `placeOf(<the portal's deployment display_name>, hostname)`.

5.11 Header comments of background.ts and channel.ts describe the answer; the Claude half of "never reads, stores or
relays a Claude credential" stays word for word.

## 6. Pages (B0 words and types, B2 the rest)

6.1 Words. Hygiene: no 'PRF', 'WebCrypto', 'key' outside 'passkey', 'OnDemand' or 'ondemand' (case-insensitive, new
rule), 'portal tab', machinery.
WORDS.welcome / welcomeMoment: `allowNote`, `denied`, `revokedBody` take a place (`placeOf`), not a host. Still
visible: Chrome's own permission prompt names the host, so allowNote says Chrome names the place "by its web address"
without spelling it (finding 14); that prompt's exact wording on the student's Chrome is not yet measured.
WORDS.grid:
- `title: 'Sign in to the grid'` (kept)
- `sheetBody: 'Type your AccessID and password. Beethoven signs in to the grid for you, in the background.'`
- `accessId: 'AccessID'`, `password: 'Password'`
- `remember: (w) => \`Remember it on this computer, unlocked with ${w}\``
- `replaceSaved: (w) => \`Save this one instead, unlocked with ${w}\``
- `rememberNote: 'Off unless you tick it. Your university may ask you to type your password each time; if it does, leave this off.'`
- `noRemember: (w) => \`This computer can't lock a saved password with ${w}, so Beethoven uses it this once and forgets it.\``
- `privacy: 'Beethoven sends it only to the grid.'`
- `signIn: 'Sign in'`, `signingIn: 'Signing in…'`, `notNow: 'Not now'`
- `useBox: "Use Chrome's sign-in box instead"`
- `badAccessId: 'Type the AccessID you use for the grid, like ab1234.'`, `noPassword: 'Type your password.'`
- `lockedTitle: 'Unlock your grid sign-in'`, `lockedBody: (w) => \`Beethoven saved it on this computer. Unlock it with ${w} to sign in.\``
- `unlock: (w) => \`Unlock with ${w}\``, `typeInstead: 'Type it instead'`
- `refused: "That password didn't work, and Beethoven stopped. Check it before you try again: after a few wrong tries your university may lock your AccessID. A password changed in the last half hour may not work yet."`
- `refusedTwice: "Two tries haven't worked. Wait a while, or ask your university's help desk, before you try again."`
- `held: "Beethoven couldn't tell whether your saved password worked, so it won't use it again by itself. Type your password to sign in."`
  (last review, K2: a hold is no wrong try, so no word of one or of a lockout)
- `notUnlocked: 'Not unlocked. Try again, or type it instead.'`
- `notSaved: 'Not saved, but signing you in this once.'`
- the 18.0.0 words stay for the box path (body, notYet, tabClosed, startPage, …); their comment says so.
WORDS.home: `asOfLocked: (clock, w) => \`As of ${clock}. Unlock with ${w} to see it live.\``, `unlock: 'Unlock'`.
WORDS.settings: replace `savedSignin`/`savedSigninOpen` with `signinTitle: 'Grid sign-in'`,
`signinSaved: (user, w) => \`Saved on this computer for ${user}. It opens with ${w}.\``,
`signinRefused: "Saved, but it didn't work last time. Forget it, or type the new one when Beethoven asks."`,
`signinNone: 'Not saved. Beethoven asks for it when the grid needs it.'`, `forget: 'Forget'`,
`forgetConfirm: 'Forget the saved sign-in?'`,
`forgotten: (user) => \`Forgotten. Chrome stays signed in to the grid until you close it. Your passkey list may still show "${user} (grid)"; you can delete it there.\``;
the Disconnect confirmation gains "Chrome stays signed in to the grid until you close it."; `startOverNote` keeps
saying the grid sign-in stays.
LOG_WORDS: `signinSaved: 'Saved your grid sign-in on this computer.'`,
`signinRefused: "The grid turned the password down. Beethoven stopped and won't try it again."`,
`signinForgotten: 'Forgot your saved grid sign-in.'`, `signinReplaced: 'Forgot the saved grid password that stopped working.'`.
LABELS: `showPassword: 'Show password'`, the eye's one name (aria-pressed says whether the password is shown; no
`hidePassword`, R2-26); `passwordSettingsUrl` goes if unused.

6.2 View types (model.ts):
```ts
export interface GridMoment {
  moment: 'grid'; title: string; body: string; signedIn?: string; problem?: ProblemView;
  /** 19.0.0: Beethoven's own sign-in; absent on the box path (18.0.0) and where the browser cannot answer the grid's sign-in */
  sheet?: GridSheet;
}
export interface GridSheet {
  /** working if own.working; else type if refused or nothing saved; else locked if locked; else type (the page's
   * "Type it instead" turns locked into type locally) */
  phase: 'type' | 'locked' | 'working';
  origin: string;
  username?: string;
  unlockWith: string;
  saved: 'none' | 'locked' | 'ready';
  /** refused, refusedTwice or held, set by the core; page-local notes (not unlocked, not saved, field errors) are the panel's */
  note?: string;
  box: ButtonView;     // sign-in-grid-box, soft
  later?: ButtonView;  // 'Not now': grid-signin-later (from asked) or cancel (a waiting press)
}
// Overlays: unlock?: { unlockWith: string }
// SettingsView: signin?: { title: string; text: string; username?: string; forget?: ButtonView; confirm: string; forgotten: string; cred?: string }
// Action: grid-signin {how}, grid-signin-later, sign-in-grid-box {windowId?}, forget-grid-signin, unlock-grid (page-intercepted)
```

6.3 The sheet (journey.ts `grid()` with `sheet`), in the side panel:
- PanelLocal gains `gridUser?: string` (written on input), `remember: boolean`, `typeInstead: boolean`, `gridNote?:
  string`, all reset when the moment changes. The AccessID input's value is `local.gridUser ?? sheet.username`. Both
  inputs carry data-key 'grid-user' and 'grid-pass' so morph pairs them however many lines come and go above them.
- type phase: AccessID field (autocomplete 'username', autocapitalize/autocorrect off, spellcheck false), password
  field (type password, autocomplete 'off', no form and no name, never a value attribute, data-keep so morph never
  copies, clears or moves it, fixed `aria-describedby='grid-pass-note'`), an always-present `<p id='grid-pass-note'
  role='alert'>` whose text morphs (noPassword, the core's note, notUnlocked, notSaved, empty otherwise); the page sets
  aria-invalid and type on the live password element itself. The eye (one name, "Show password", aria-pressed
  true while the password is shown, aria-controls; flips only the type). The tick (tickBox, never pre-ticked;
  replaceSaved when a record exists) shown only when the page's support probe says yes and no no-PRF mark exists,
  else the noRemember line; the rememberNote under it; the privacy line with the lock icon; one ink "Sign in"; the
  soft "Use Chrome's sign-in box instead"; "Not now" when `later`.
  Enter moves to the next field or presses Sign in. data-autofocus: the AccessID input when empty, else the password.
  After a refusal, focus goes to the password field. 15.0.0's sheet is prior art: `git show 25e7822^:extension/src/ui/direct.ts`
  and `25e7822^:extension/src/ui/panel.ts` (submit discipline).
- the foot (privacy line, the press, the box link, Not now) sticks to the panel's bottom. A field the caret reaches,
  with the sentence under it, is brought out from under the foot on focus; and, since no focus event comes for a
  field that keeps the caret, after any render that moved that field or the foot and left it under the foot or above
  the window (Enter in the password, then the refusal growing under it; a problem arriving above it) (R2-24;
  e2e/sheet-fit.mjs runs both at 560, 600, 640 and 658 px high).
- the panel announces the heading the phase draws: lockedTitle while the locked phase is drawn, else the problem's
  title or `title` (R2-29).
- locked phase: lockedTitle/lockedBody, one ink "Unlock with Windows Hello" (data-autofocus), "Type it instead"
  (page-local switch), the box link, "Not now" when `later`.
- working phase: both fields stay; the Sign in button busy (aria-busy, spinner, as the welcome page's Agree button)
  and a role=status "Signing in…" line.
- the drawn check and "Signed in as st1234." as today once signed in.

6.4 Settings (settings.ts "Your grid" card): the 18.0.0 password-manager row goes. The signin row: signinSaved /
signinRefused / signinNone; with a saved sign-in, Forget behind the confirm-row pattern (settings.ts Start over); on
confirm the page calls `signalUnknownCredential` guarded by typeof through a local type, never awaited, then sends
`forget-grid-signin`, then shows `forgotten` (role=status) once the view says nothing is saved; never under a saved
sign-in, and not again once a sign-in has been saved after it (R2-27).

6.5 Page-side `src/ext/gridSignin.ts` (the only module that calls `makePasskey`, `unlockPasskey`, `sealPassword`; a
source-scan test keeps them out of background.ts and every other module):
`gridSignin(deps: { passkeys: PasskeyApi | undefined; statics?: PasskeyStatics; records: RecordStore; session: KV; local: KV; send(a: Action): Promise<unknown>; os(): Promise<string> })`
returns `{ supportNow, submitSheet, unlockNow, forgetNow }`. Only the panel builds the default instance (browserPasskeys,
browserStatics, indexedDbRecords, ext/storage, rpc, getPlatformInfo). KV is the narrow get/set/remove the ext/storage
areas already offer.
- `supportNow(): Promise<boolean>`: false while SIGNIN_NOPRF_KEY exists or passkeySupport says 'no'; cached per page.
- `submitSheet(o: { origin; username; password; remember: boolean; signal?: AbortSignal }): Promise<{ saved: boolean; note?: 'not-saved' }>`:
  called synchronously from the click. remember and supported: reuse the session unlock when present and the record's
  cred matches (re-seal, no prompt); else, with a record, `unlockPasskey` (one prompt) and re-seal; else
  `makePasskey` (one or two prompts) and seal; then put the record, write the note whole (origin, username,
  saved_at, cred; nothing else), write the unlock, zero the PRF buffer, remove the no-PRF mark, and send
  `grid-signin { how: 'saved' }`. On VaultError('no-prf'): write SIGNIN_NOPRF_KEY { at, os }, call
  signalUnknownCredential for `err.cred` best-effort. A cancelled or failed passkey step: fall back to the one-shot
  with note 'not-saved'. Not remember, or the fallback: write SigninOnce and send `grid-signin { how: 'typed' }`. The
  sheet never deletes an existing record (only Forget, Disconnect or a change of portal; the background forgets a
  refused record when a typed password proves, 5.4).
- `unlockNow(signal?): Promise<'unlocked' | 'cancelled' | 'failed' | 'refused'>`: 'refused' and nothing sent while the
  note has refused_at; else read the record (cred, prfSalt), `unlockPasskey`, write the unlock, zero, send
  `grid-signin { how: 'unlocked' }`, and answer 'refused' when its result says `refused` for this attempt, else
  'unlocked' (R2-25).
- `forgetNow(cred?: string)`: signalUnknownCredential (guarded, not awaited), then `forget-grid-signin`.
The panel reads the field values and empties the password field before the first await (the code box precedent,
codebox.ts), and never keeps the password in page state. An AbortController per page aborts on pagehide.

6.6 Chained unlock. When `overlays.unlock` is present, the panel's press handlers (connect, retry, the statement's
connect, sign-in-claude) send the press at once, as in 18.0.0, and start `unlockNow()` in the same click without
awaiting it. Never Open my session: it only brings forward or opens the claude.ai tab and never needs the grid
(findings 7, 11, 33). From every way in (the sheet, the press, the Grid row) the sheet stays the locked one, Unlock
busy and then "Signing in…", until the unlock's sign-in ends, never a type form with an empty field (finding 12). The background keeps the press waiting on the grid (5.6) and
`grid-signin { how: 'unlocked' }` carries it. The home Grid row's "Unlock" runs unlockNow with no press; when the
grid turns that sign-in down (unlockNow 'refused') the row opens the sheet (`sign-in-grid`), whose type phase says
the refusal, as for a refusal already on record (R2-25).

6.7 Fixtures for every phase (type, type with refused note, refusedTwice, type with the held note, type unsupported, type with replaceSaved,
locked, working, signed-in, with and without later), the Settings row saved / refused / none and its confirm and
forgotten, the home row with Unlock and asOfLocked; welcome fixtures use the place name (the profile's), not the host;
the gallery stubs the gestures; ui-fixtures.test covers them; hygiene's word rules (with /ondemand/i, except
Settings' address strings) pass over them.

## 7. Tests that must exist

background19.test.ts (fake browser, real background):
1. Unlocked saved sign-in, signed out: a press signs in with no tab (`tabs.create` never logged), one
   `-> credentials` line, the press goes on.
2. Wrong saved password: exactly one credentials answer, then `-> cancel`; `world.badAnswers` 1; the note's
   `refused_at` set; later ticks, alarms (`fireAlarm`), a worker restart (`stopWorker` + main) and a browser restart
   (`restartBrowser` + main), then the page's unlock (fake authenticator) and a `grid-signin unlocked`, never answer
   again: no second credentials, badAnswers still 1, the type phase with the refused note, Overlays.unlock absent, the
   home row not offering Unlock; typing the right password (grid-signin typed) signs in.
3. Locked (no session unlock): no credentials answer, no tab; the grid moment is the locked phase; Overlays.unlock set.
4. Foreign challenges never get the password: a tab's challenge (Chrome's box logged, its path absent from the
   copy-debug-log text), a proxy challenge, another realm, another origin, a request outside the armed window, a second
   request inside one armed window, and two challenges for the armed URL raised in the same task before either
   callback with a wrong saved password: exactly one `-> credentials`, badAnswers 1.
5. Planted password: after save, sign-in, refusal and forget, the password and its base64 appear nowhere in
   `JSON.stringify(world.storage.local)`, `world.log`, the copy-debug-log text, copy-details, the audit export, the
   activity log, any view the port received, or any action result.
6. The box link opens the 18.0.0 tab path; with `install({ webRequest: false })` the tab-path tests still pass.
7. Password changed on the grid after a proven sign-in, with a tick running checkGrid and pollRun together on a new
   client: Beethoven's own `-> credentials` at most 1; Chrome's stale tries recorded (`world.chromeBadTries`), not
   asserted as a total.
8. Forget, Disconnect and change-portal to another origin remove the record, the note, the no-PRF mark, the unlock,
   the one-shot and the state; change-portal to the same origin keeps them; the forgotten words claim nothing about the
   passkey staying.
9. cleanupDirectWay never removes `beethoven-signin` or the new keys.
10. Boot with nothing granted (registration refused), then `world.grant(ORIGIN)`: a saved, unlocked sign-in gives
   exactly one `-> credentials` and no `-> cancel`; every event gets exactly one callback (no `answered twice`).
11. One-shot (not remembered): used for one attempt and removed, right or wrong; older than 2 minutes, not used and
   removed by the alarm; submitted while the cache already signs in, while the grid is unreachable, and while another
   checkGrid is in flight: gone from storage.session when the action returns, and the action's result describes its
   own attempt.
12. Refused saved P_old; browser restart; type P_new with the tick on; the fake authenticator cancels; the one-shot
   signs in; the refused record is forgotten (signinReplaced); browser restart; no unlock offered and no second
   credentials for P_old; badAnswers 1.
13. Right answer followed by the mock's cold 500 (`--cold-pun` style in the fake): proven, never refused.
14. `world.dropAuthRetry()` after a right answer: unsettled (the listener passes 'unsettled' meanwhile), then the next
   check reads signed-in from the cache: proven. After a wrong answer and `stopWorker` before the reply: no second
   `-> credentials`; the same with `restartBrowser` before the reply (loadGridAuth's restart rule puts it on hold at
   once, no refusal counted, background19 tests 20 and 30).
15. Two refusals in a row: the sheet note is refusedTwice; `state.refusals` resets on a proven sign-in.
16. 'sign-in-grid' shows the sheet with Not now; 'grid-signin-later' returns to the home.
Round 2 (35 to 47): a portal tab's challenge waking the stopped worker before its state is read (storage late by a
macrotask and by 40 ms) marks the unsettled answer (R2-01); a box open before the answer and signed in while the grid
checks, or after the retry was lost (R2-02); a portal tab opening while the window's answer goes on record, and one
asked to sign in inside the window (R2-14); the mark across a worker restart (R2-15); a marked answer read signed
out is a hold, no refusal (R2-05); another granted site's challenge and request end mark nothing (R2-23); a box left
open or signed in after a right answer changes nothing; a typed password cut off by a browser close puts the saved
one on hold (R2-03), and one that works leaves no mark; the saved password typed before it was given is sent once
(R2-04); a typed refusal counts on the note (R2-21); a re-seal ends its refusal by seal (R2-18). Test 8 also checks
memory: another portal starts the count afresh, the same portal keeps the unlocked sign-in working (R2-19, R2-20).
Last review (48 to 51; test 30 now pins the hold's words): a hold whose note write is slow sends nothing in the same
Unlock's window (K1); a hold the note cannot keep stops an unlock, the same seal, a check and the alarm, the sheet
says `held`, and a typed password that works and differs forgets the record and the note (K1b); a right saved
password marked by a portal tab let in is worded as a hold in the next session, never as a refusal, and typing it
keeps it, used again after a restart (K2); the same password typed lifts the session's hold too (51). steps.test.ts:
a hold's sheet in the type phase with `held`, no Unlock, refusedTwice from two refusals; ui-fixtures.test: the held
fixture, and a hold never marks the password field invalid.
vault.test.ts: create/get with PRF at create, at get only, enabled false (no-prf after exactly one ceremony), none
(no-prf after two), cancel → not-allowed, UV missing → no-uv, user.id deterministic per (origin, username),
seal/open round trip, wrong origin or user → mismatch, tampered ct/iv/aad → corrupt, a fresh IV per seal, nothing
extractable, memory and IndexedDB stores.
gridsignin.test.ts: every branch of authVerdict in order (including tabId -1 with no initiator → initiator, http
default port 80, unsettled, the refused split by source); unlockWord; onceExpired; ACCESS_ID.
gridSigninPage.test.ts: submitSheet/unlockNow/forgetNow against the fake authenticator and in-memory stores; the
password never reaches a sent action; supportNow false after a no-prf (zero ceremonies the next time, one signal);
"Type it instead" unticked keeps the record and the note; unlockNow sends nothing while refused, and says refused
when the grid turns down the sign-in it carried.
ui-fixtures.test: the AccessID survives a click on the tick (data-key pairing); data-autofocus per phase; the
password's aria-describedby points at the always-present note; the eye keeps one name; the locked sheet announces
its own heading; a refusal under a field that keeps the caret brings it out from under the foot; the Grid row's
refused unlock opens the sheet; Settings' Forgotten line only while nothing is saved.
e2e/sheet-fit.mjs (development build, Playwright): every sheet fixture and the two caret-stays runs at 560, 600, 640
and 658 px high.
Mock selftest: password change, counters, lockout, cold after accepted Basic.

## 8. Commands

```
cd /home/user/beethoven-extension/extension
npm run typecheck && npx vitest run      # node 22; the mock starts itself
node e2e/mock-selftest.mjs               # needs Playwright Chromium for its terminal section (/opt/pw-browsers)
npm run build                            # chrome and firefox
```
