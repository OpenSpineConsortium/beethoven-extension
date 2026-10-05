# Accounts and subscriptions for Beethoven 15.0.0

For Greg. Written 2026-10-02 by the texts stream of the 12.0.0 build and completed by fixer B from
the three explorations of that day (A: store extensions and Secure Shell; B: relays, web ssh and
accounts; C: the script helper); updated 2026-10-04 by the texts stream of 15.0.0, after Greg
decided that day to sign the helper's installers for Windows and macOS. Each price says where it
came from. **Secondary source** means the vendor's own page built its prices with a script and
showed none when fetched, so the figure comes from a third-party summary; check it on the vendor's
page before paying. Nothing here was bought, registered or signed up for by the streams that wrote
it.

The short answer: **15.0.0 needs two paid memberships that 12.0.0 did not: the Apple Developer
Program, US$99 a year, and Azure Artifact Signing's Basic plan, US$9.99 a month** (Greg's decision,
2026-10-04; both figures with their sources in 2.1). On Windows and macOS the helper is now a
compiled program in a signed installer, and these two sign it; on Linux it stays the script, which
needs neither. One more thing is new, with no fee named for it: a Google Cloud project with a
Desktop OAuth client, Greg's own, through which the release command uploads the package to the store
(section 1). Nothing else is new: everything else in section 2 is optional, and each item says what
students live with if it is skipped.

Up to 14.0.0 the helper was a script that every operating system already runs, shipped inside the
extension, with nothing to compile, sign or notarize, so 12.0.0 to 14.0.0 needed no new account and
no new subscription.

## 1. What the lab needs and already has

| Item | Who holds it | Cost | Status for 12.0.0 | Without it |
|---|---|---|---|---|
| Chrome Web Store developer account (the private listing) | Greg, personal Google account | a one-time registration fee; Google's page states no amount, secondary sources say US$5 | Needed, as for 11.0.0. 12.0.0 adds the `nativeMessaging` permission, which the store reviews; no new account. | No listing updates. |
| Google Group `Beethoven-users` (the listing's testers) | Greg | free | Unchanged. | Nobody can install the private listing. |
| Access service `beethoven-access` (the approval check) | Cloudflare Workers, `beethoven-access.openspineconsortium.workers.dev` | Workers Free allows 100,000 requests a day; Workers Paid starts at US$5 a month (developers.cloudflare.com, pricing page dated 2026-10-02). Which plan the account is on was not established (it needs the dashboard). | Unchanged; the check carries no new field (R4). It answers approval questions; it is not a proxy, so the Workers terms' proxy clause does not touch it. | No approval checks: the extension stops. |
| Resend (the confirmation and approval e-mails) | Greg | Free plan US$0: 3,000 e-mails a month, 100 a day; Pro US$20 a month (resend.com/pricing, fetched 2026-10-02) | Unchanged. | No e-mails; requests are still stored and answered as pending. |
| Cloudflare Zero Trust, Free plan (the optional second wall on the access service's `/admin`) | Greg | free up to 50 users; US$7 per user per month beyond (secondary source) | Unchanged, optional. | `/admin` is protected by its own sign-in alone. |
| The domain `openspineconsortium.com` (DNS at Spaceship) and the website on GitHub Pages | Greg | the renewal price was not established | Unchanged. The site hosts **no** helper: it ships inside the extension (D1). | No support or privacy pages. |
| The lab's shared copy on the grid (framework 11) | the lab's CephFS volume, `/rs/rs_grp_oschome/shared/beethoven/hpcworker` | as today | Needs framework 11 published, and every folder from `/` to the copy writable by its owner alone or sticky (`LAB_LEAD.md`, section 2). | No direct way: `browser-key add` refuses, and a framework 10 copy has no gate. |
| Signing key for the withdrawn-versions list | Greg, offline | free | Unchanged. | No signed kill-list. |
| Apple Developer Program membership (the Developer ID identities and notarization, for the Mac installer) | Greg | US$99 per membership year (2.1) | Not needed for 12.0.0. Needed since 15.0.0 (decided 2026-10-04): it signs and notarizes `beethoven-bridge-mac.pkg`. | No signed Mac installer: the package offers the Mac script zip, as up to 14.0.0, with the warnings in 2.1. |
| Azure Artifact Signing, Basic plan (the Windows signature) | Greg, behind his own Microsoft Entra sign-in | US$9.99 a month for 5,000 signatures (2.1) | Not needed for 12.0.0. Needed since 15.0.0 (decided 2026-10-04): it signs the program inside `beethoven-bridge-windows.msi` and the MSI. | No signed Windows installer: the package offers the Windows script zip, as up to 14.0.0, with the warnings in 2.1. |
| A Google Cloud project with the Chrome Web Store API and a Desktop OAuth client (the release command's upload) | Greg, the Google account that owns the store item; the saved sign-in stays in his vendor folder on the Mac, never in the repository or in CI | no fee is named on the store's API page; not yet set up, so what the console asks for is not yet measured | Not needed for 12.0.0. Used since 15.0.0 (Greg, 2026-10-04): `helper/release/publish-store.mjs` uploads the release's zip and submits it for review (`helper/release/README.md`, "Uploading to the Chrome Web Store"). While the consent screen stays in "Testing", Google drops the saved sign-in after seven days. | The upload is done by hand in the developer dashboard, as up to 14.0.0. |

What each **student** needs, and already has or gets free:

| Item | Cost | Notes |
|---|---|---|
| Wayne State AccessID and grid account | free (WSU KB 20199) | As before. |
| Google Authenticator, set up for the grid | free app | The grid asks for its code at every password sign-in. Set up once in Open OnDemand's **2FA Setup** app (WSU KB 20242), which needs GlobalProtect once. Beethoven's two routes (`USE.md`, part 2) walk through it. |
| Microsoft Authenticator | free app | Wayne State's own multi-factor app for every other WSU service, GlobalProtect's sign-in included (KB 20242 and KB 20314). Students will have both apps: the grid's code is in **Google** Authenticator. |
| GlobalProtect | free (WSU, KB 20314; portal `protect.wayne.edu`) | Needed once, on the computer or on the phone, to set up the grid code; and every time for a student on the GlobalProtect path. |
| Google Chrome on Windows, macOS or Linux, signed in to the Google account the invitation went to | free | A Chromebook, a Snap or Flatpak Chrome, or a managed Chrome that blocks user-level helpers cannot run the helper: GlobalProtect path. |
| Claude Pro or Max | Pro: US$17 a month with the annual plan (US$200 billed up front) or US$20 billed monthly; Max: from US$100 a month (claude.com/pricing, fetched 2026-10-02). Claude Code is not part of the Free plan. | As before. Paid by the student. |
| Windows Hello or Touch ID | free, built in | Optional (D2): off unless the student turns it on. |

## 2. What is optional, what it costs, and what students see without it

### 2.1 Signing the helper (in force since 15.0.0)

Since 15.0.0 (Greg's decision, 2026-10-04) the helper for Windows and macOS is a compiled program,
the Rust edition in `helper/src/rust` (nothing in it but Rust's standard library), and both of its
installers are signed: the Mac's `beethoven-bridge-mac.pkg` with Developer ID identities from the
Apple Developer Program, then notarized by Apple and stapled; the Windows
`beethoven-bridge-windows.msi`, and the program inside it, through Azure Artifact Signing. Both are
built and signed on Greg's own Mac by one command (`bash helper/release/release.sh`,
`helper/release/README.md`), the `.msi` cross-built there; whether Artifact Signing accepts a
request from a Mac is not yet measured, so a Windows machine of his (`build-msi.ps1`) stays the
fallback for the `.msi` until one release has gone through from the Mac. No identity, certificate,
profile or account name is in the repository or in CI (`SECURITY.md`, release pipeline). Linux keeps
the script. Neither installer has been built, signed or opened on a real machine yet: what a
student's Mac or Windows shows is not yet measured.

Up to 14.0.0 the helper was a script: a `.cmd` launcher and a PowerShell script on Windows, an
installer script and a Perl script on macOS and Linux. Apple notarizes apps, disk images and
installer packages, not a loose script, and a `.cmd` file cannot carry an Authenticode signature at
all (exploration C), so signing bought nothing for the script as it was packaged. It mattered only
if a compiled variant was ever shipped (D1: Go binaries, "for later"). Exploration C built that
variant for six systems in scratch (about 21 MB in all, unsigned) and did not ship it; 15.0.0 ships
the Rust edition instead, for Windows and macOS only. The two memberships follow, with the figures
as the 12.0.0 explorations found them.

**Apple Developer Program** (to sign with a Developer ID and notarize a compiled macOS helper, or a
signed installer package): **US$99 per membership year** (developer.apple.com/programs/enroll,
fetched 2026-10-02). A fee waiver is open to legal entities that are nonprofit organizations,
accredited educational institutions or government entities, not to individuals
(developer.apple.com/support/membership-fee-waiver). Enrolling as an organization needs someone with
legal binding authority, a D-U-N-S number and an e-mail address on the organization's domain.
Whether Wayne State's own Apple developer team would sign a lab's helper was not asked.

*Without it (up to 14.0.0, and still for any copy of Beethoven that is not the store item, which is
offered the script zip):* macOS warns the first time the student opens the installer. On macOS 15
(Sequoia) and later the student clicks **Done**, then **System Settings**, **Privacy & Security**,
**Open Anyway** (available for about an hour after the attempt), and types the Mac login password
(support.apple.com, "Open a Mac app from an unknown developer"; Apple removed the Control-click
override in macOS 15). On macOS 14 and earlier: Control-click, **Open**, **Open**. Running `bash`
and the file in Terminal reads the script as data and is expected to skip the warning, but that was
not tried on a Mac. One time per computer. Nothing about the helper was run on a Mac.

*With it (15.0.0):* a package signed with a Developer ID, notarized and stapled is expected to open
in the macOS Installer without that warning, which is what the panel's steps assume ("Open the file
you downloaded. The macOS Installer opens."). Not yet measured on a real Mac.

**Windows code signing** (an Authenticode signature on a compiled `.exe`; a PowerShell script can be
signed too, but the `.cmd` launcher cannot):

| Option | Cost | Notes |
|---|---|---|
| Microsoft Azure Artifact Signing (formerly Trusted Signing) | Basic plan US$9.99 a month for 5,000 signatures, then US$0.005 a signature (secondary sources: Microsoft's pricing page rendered "$-" without scripts) | Open to individuals in the United States and Canada and to organizations in the United States, Canada, the EU and the UK (secondary sources). Chosen for 15.0.0 (2026-10-04). |
| An OV or EV code-signing certificate from a commercial certificate authority | not priced by the explorations | A subscription from the authority; not compared. |

*Without it (up to 14.0.0, and still for any copy that is not the store item):* the student sees a
warning the first time they open the installer. On Greg's Windows 11 (Smart App Control off) it was
**Open File - Security Warning**, "Publisher: Unknown Publisher", with **Run** and **Cancel**
(exploration C, observed); other machines are reported to show SmartScreen's **Windows protected
your PC**, then **More info**, **Run anyway** (Microsoft Q&A, not observed here). Where Smart App
Control is on, Windows blocks a downloaded script with no override until the student right-clicks
the zip, chooses **Properties**, ticks **Unblock** and extracts it again (textslashplain.com,
2026-04-28; not run here). A Group Policy execution policy, App Control or AppLocker, or a security
product that stops PowerShell scripts, stops the helper outright: the student uses GlobalProtect. A
signature from a known publisher would change some of that, and only once Windows has seen enough
downloads of the file.

*With it (15.0.0):* the MSI and the program inside it are signed, so Windows is expected to name a
publisher instead of "Unknown Publisher". A new publisher whose file few people have downloaded may
still meet SmartScreen's **Windows protected your PC**, which is why the panel's second step says
"If Windows asks you to confirm, choose Run (or More info, then Run anyway)." Whether it does,
and for how long, is not yet measured. A managed computer's App Control, AppLocker or security
product may still stop it; then the student uses GlobalProtect.

### 2.2 A relay host (only if one is chosen)

A relay is a server that carries the browser's encrypted ssh bytes to `grid.wayne.edu:22`, so no
helper is needed on the student's computer. 12.0.0 can use one only if the site profile names it
(D3); **none is named**, and the privacy statement (since version 10) says one would be disclosed
there first. Exploration B's verdict, with its sources:

- **A Cloudflare Worker relay: not without Cloudflare's written permission, and advised against even
  then.** Section 2.2.1(j) of Cloudflare's self-serve agreement forbids using the services "to
  provide a virtual private network or other similar proxy services" unless Cloudflare permits it in
  writing, and section 8 allows immediate suspension (cloudflare.com/terms, fetched 2026-10-02). The
  same account runs the access service, so a suspension would stop every student's approval check.
  Its outbound connections leave from an unpublished address range (developers.cloudflare.com, TCP
  sockets), so the grid could not allowlist it and keys could not be tied to it. It would need
  Workers Paid (US$5 a month): the free plan's 1,000 storage writes a day allow about 333 relayed
  connections a day.
- **A lab-run relay: feasible, about US$50 to 75 a year.** A small virtual server running the relay
  prototype (`scratchpad/v11/ssh/relay/relay-node.mjs`, or websockify with recording off), locked to
  `grid.wayne.edu:22`, behind a certificate on a lab subdomain. Prices (fetched 2026-10-02):
  DigitalOcean US$4 a month (512 MiB) or US$6 (1 GiB), backups 20% (weekly) or 30% (daily) more;
  Amazon Lightsail US$5 a month with a public IPv4 address, US$3.50 IPv6-only; Google Cloud's free
  tier includes one e2-micro machine a month in us-west1, us-central1 or us-east1; Let's Encrypt
  certificates are free (50 per registered domain per 7 days); the DNS record is one A record at
  Spaceship. Costs that are not money: a named maintainer who applies security updates, renews the
  certificate and watches it; C&IT told first (every student's connection would come from one
  address, which the grid's failed-login defences would see as one client); a new privacy statement
  version naming it. Keys used only through it could be tied to its address (`from=` in the line).
- **Cloudflare Tunnel with browser-rendered SSH: no.** It renders a terminal on Cloudflare's own
  page, so the password and code would be typed there, not into Beethoven's sheet (R2); it needs
  `cloudflared` on a lab machine that can reach the grid, and the domain moved to Cloudflare DNS.
  Cloudflare's certificate-based SSH would also need the grid's sshd to trust Cloudflare's
  authority, which the lab cannot set.
- **Third-party web ssh services (Shellngn, Sshwifty, WebSSH, ssheasy, Google Cloud Shell, GitHub
  Codespaces): no.** Each runs the ssh client, or the TCP relay, on someone else's server, so the
  password, the code or the key would pass through it (R2, R3, R4), and Wayne State says never to
  share a password or a multi-factor number.

*Skipped (12.0.0 as built):* students install the helper once; where they cannot, they use
GlobalProtect.

### 2.3 A browser-only bridge from the Chrome Web Store

**None exists** (exploration A, read in Chromium's source and run in Chromium 153). Chromium lets
exactly two extensions open network sockets, Google's Secure Shell (stable and dev), from a list in
its own source with no public way to apply, and Secure Shell offers other extensions no byte stream:
its programmatic ssh channel is refused to every other extension. So 12.0.0's browser-only bridge is
the stub that answers "not available", and that costs nothing.

One later candidate, free and with no account: Secure Shell (Google, free in the Chrome Web Store)
as the student's terminal, with Beethoven as its ssh agent, so the key stays in Beethoven. It was
proven against a grid-like server, but Beethoven cannot read what the terminal shows, the first
password would be typed into Secure Shell's terminal rather than Beethoven's sheet, the gate would
need a change for an empty command, and it rests on a socket exception Google calls temporary. Not
in 12.0.0.

### 2.4 The Isolated Web App pilot (installed only for a student who asks)

| Item | Cost | Notes |
|---|---|---|
| The app's signing key (Ed25519, for the signed web bundle) | free | It must live offline with the release keys. Losing it orphans every pilot install; leaking it lets anyone sign a fake update. |
| A store or other channel | none exists | Developer-mode installation only: two flags in `chrome://flags`, a warning bar at every Chrome start, every update a manual file pick (`scratchpad/v12/iwa/REPORT.md`). Google has announced managed installation on Windows for Chrome 161, around January 2027; nothing for macOS. |
| Windows Hello or Touch ID in the pilot | none, if the pilot ships without it | WebAuthn is refused on the app's own origin (exploration B, from REPORT.md), so the pilot's key can only be the default kind. |

*Skipped:* no pilot; nothing changes for anyone else.

### 2.5 Small optional ones

- A free Microsoft account, to send Microsoft a helper file Defender wrongly flags
  (microsoft.com/wdsi/filesubmission). Defender raised nothing in about 25 runs on Greg's computer.

### 2.6 Things that are not needed

- No API key, and no Google Cloud project or OAuth client for the product itself. The one Google
  Cloud project, with its Desktop OAuth client, is Greg's own release tool's, for the store upload
  only (section 1); students never meet it.
- No Cloudflare Workers paid plan for 12.0.0; 15.0.0 adds nothing that would need one.
- No code-signing certificate from a commercial certificate authority: since 15.0.0 the Windows
  signature comes from Azure Artifact Signing and the Mac's from the Apple Developer Program (2.1);
  up to 14.0.0 nothing was signed.
- No new e-mail service, analytics or crash-reporting account: Beethoven has none.
- No account with Palo Alto Networks, Google or Microsoft for GlobalProtect, Google Authenticator or
  Microsoft Authenticator: all are free to the student, through Wayne State.

## 3. What each choice changes for the texts

| If you add | Change before it ships |
|---|---|
| A compiled, signed helper (done in 15.0.0, for Windows and macOS) | `THIRD_PARTY_NOTICES.md` (the Rust standard library's notice), `LICENSE.txt` 5(b)(i) and section 15 and `PRIVACY.md` "The Bridge on your computer" (what runs it, the signed installers), `INSTALL.md` (the installers' steps), the store's package file list. All done in LICENSE version 10 and PRIVACY version 11 (`docs/TEXTS_V10_V11.md`). |
| A relay | `PRIVACY.md` "Relays and the pilot app" must name its operator and what it sees, in a new version shown for acceptance; the store's privacy answers; the site profile's `ssh_relay`; a note to C&IT. |
| Secure Shell as the student's terminal | `PRIVACY.md` and `LICENSE.txt` 5(b) (the first password typed into Secure Shell's terminal), `INSTALL.md` and `USE.md`, the store's privacy answers, a gate change in the framework. |
| The pilot app for a named student | Nothing in the texts (the privacy statement has described it since version 10); a note to C&IT and the student's own instructions (`scratchpad/v12/iwa/STUDENT_STEPS.md`). |
