# Beethoven texts for 15.0.0: agreement version 10, privacy statement version 11

**16.0.0 (2026-10-08).** This record describes agreement 10 and privacy statement 11 for 15.0.0, the
Bridge's signed installers; 16.0.0 removed the Bridge whole. Agreement 11 and privacy statement 12
(`TEXTS_V11_V12.md`) take it out of the texts.

Drafted 2026-10-04 for Greg and for counsel, by the texts stream of the 15.0.0 build. **This is
drafting, not legal advice.** No lawyer has read these texts or this note; the questions at the end
are for one.

What changed, in one paragraph: `LICENSE.txt` goes from version 9 (2026-10-02) to version 10
(2026-10-04) and `PRIVACY.md` from version 10 to version 11 (2026-10-04), because from Beethoven
15.0.0 the helper on Windows and macOS (the "Bridge" in the texts) is a compiled program of
Licensor's in a signed installer: `beethoven-bridge-windows.msi`, Authenticode-signed through Azure
Artifact Signing, and `beethoven-bridge-mac.pkg`, signed with a Developer ID and notarized by Apple.
Both still ship inside the extension's package, are offered from the extension's own page, install
into the student's own account with no administrator rights, and are removed with Windows' own
Settings, Apps or with the uninstaller beside the Bridge on a Mac. Linux keeps the script, run by
Perl or Python 3. What the Bridge does is unchanged: it reaches only the cluster's ssh port, carries
the encrypted connection and keeps nothing, and nothing new reaches Licensor.
`THIRD_PARTY_NOTICES.md` gains the Rust standard library's notice, which the compiled program
includes, and the notice of the MinGW-w64 and GCC runtime code the program for Windows includes when
it is built on the Mac (T3). A helper installed from a zip with 14.0.0 or earlier keeps working, and
both texts say so (amended 2026-10-05, after review). Every dispute, liability and risk term is
unchanged word for word, and so are the section numbers; section 17 (the Bridge does not update
itself; the Extension says so and offers the newer one) stays true as it stands.

Sources, in order of authority: Greg's decision of 2026-10-04 to sign the installers (relayed by the
workflow); the task's shared contract for 15.0.0 (the two packages, the manifest entries, the
picker's rule, the panel's sentences, the version numbers); the code in the working tree on
2026-10-04 (`helper/src/rust`, `helper/src/mac`, `helper/src/linux`, `framework/contract-text/V12_CONTRACT.md`); commit
7ecea53 for the student's sitting of 2026-10-03. Where a sentence rests on something another stream
was still building, its reason says **CONFIRM**. The quotations below are generated from the
repository's last commit and the edited files, so they are exactly what changed (paragraphs are
quoted unwrapped; in the files each touched paragraph was re-wrapped at 100 columns).

Kept as they were: both texts stay plain ASCII with LF line endings; the agreement's version line is
`Version 10, 2026-10-04.` at the start of a line, as `extension/scripts/sync-profiles.mjs` and
`extension/test/terms.test.ts` read it; `TERMS_VERSION` is 10 and `TERMS_DATE` '2026-10-04' in
`extension/src/core/terms.ts`, and a version 9 acceptance stays in the history, out of force, so the
changed agreement is shown and accepted again; the definitions of section 1 (the Bridge is still
what "Beethoven's screens call the helper"); section 17; no version-history section is added to the
agreement, which has never had one (this note is its record); nothing uses the banned word.

The words used: the texts say "the Bridge", "signed", "installer" and "compiled program"; they name
Windows, macOS, Apple and Microsoft only where a sentence needs them (the agreement names the
systems, with "Windows" and "macOS" added to the marks sentence; only the privacy statement says
that the system may check a signature with Apple or Microsoft). The screens and the guides say "the
helper", and the student-facing sentences carry no "native messaging", "registry key" or
"manifest".

## LICENSE.txt, version 9 -> version 10

### L1. Head, version line

Old:

> Version 9, 2026-10-02. Applies to the Trial Edition of Beethoven 12.0.0 and later versions that ship this text

New:

> Version 10, 2026-10-04. Applies to the Trial Edition of Beethoven 15.0.0 and later versions that ship this text

Why: The task's contract: LICENSE "Version 10, 2026-10-04." for 15.0.0.
`extension/scripts/sync-profiles.mjs` and `extension/test/terms.test.ts` read this line as
`/^Version (\d+), (\d{4}-\d{2}-\d{2})\./` and stop unless `TERMS_VERSION` and `TERMS_DATE` in
`extension/src/core/terms.ts` are 10 and '2026-10-04', which they now are.

### L2. Section 5(b), the record of the ssh path

Old:

> (b) Your sign-in to your cluster. The Extension reaches your cluster in one of two ways and tries the first before the second: the ssh path, which needs no VPN, and the portal path, which may need your institution's VPN (at Wayne State, GlobalProtect). It never signs in to Claude for you on either path (see (a)). The ssh path is new in this version and has been tried only against ssh servers that Licensor ran itself, set up like your institution's, not yet with a real account on a real cluster.

New:

> (b) Your sign-in to your cluster. The Extension reaches your cluster in one of two ways and tries the first before the second: the ssh path, which needs no VPN, and the portal path, which may need your institution's VPN (at Wayne State, GlobalProtect). It never signs in to Claude for you on either path (see (a)). The ssh path came with version 12.0.0 of the Extension; it has been tried mostly against ssh servers that Licensor ran itself, set up like your institution's, and has had little use yet with real accounts on a real cluster.

Why: Version 9 said the ssh path was "new in this version" and had not been tried "with a real
account on a real cluster". Neither stays true: version 10 applies to 15.0.0, and a student's
sitting on the real grid on 2026-10-03 (commit 7ecea53, "Three fixes from a student's sitting") used
the ssh path. "Little use yet" is the honest size of that record. **CONFIRM** with Greg that one
sitting is what he wants the agreement to describe this way.

### L3. Section 5(b)(i), the Bridge per system, its signed installers and how it is removed

Old:

> (i) The Bridge. A browser extension cannot open an ssh connection by itself, so the ssh path needs a bridge that carries the Extension's encrypted connection to your cluster's ssh port and back. In this version that is the Bridge: a small helper program that ships inside the Extension, which you install once on your computer, in your own user account and without administrator rights, by saving the installer the Extension offers you from its own package and running it (the Extension cannot run a program for you). Your browser starts the Bridge only when the Extension asks for it, and the Bridge ends when the Extension lets it go. The Bridge opens a network connection only to your cluster's ssh port (at Wayne State, grid.wayne.edu, port 22, and another address only if its installer wrote one into its settings), carries bytes both ways without reading, keeping or logging them, holds no password, key or other credential, offers no shell and runs no other program. The uninstaller placed beside it removes it. The Extension can also carry the ssh path through a relay server, but only one that your institution's site profile names; none is named in this version, and if one ever is, the privacy statement will name who runs it and what it sees before any version uses it. If no Bridge is installed and you do not install one, or your cluster's ssh port cannot be reached from your network, the Extension uses the portal path.

New:

> (i) The Bridge. A browser extension cannot open an ssh connection by itself, so the ssh path needs a bridge that carries the Extension's encrypted connection to your cluster's ssh port and back. In this version that is the Bridge: a small helper program that ships inside the Extension, which you install once on your computer, in your own user account and without administrator rights, by saving the installer the Extension offers you from its own package and opening it (the Extension cannot run a program for you). On Windows and macOS the Bridge is a compiled program of Licensor's, and its installer is a package that Licensor has signed, whose signature your system can check before it installs anything; on Linux the Bridge is a script, run by Perl or by Python 3, which come with your system, and its installer is a script too. A Bridge you installed from a zip file with Beethoven 14.0.0 or earlier keeps working until you remove it: it is a script, run by Windows PowerShell on Windows and by Perl on macOS, it is not signed, and the uninstaller placed beside it removes it. Your browser starts the Bridge only when the Extension asks for it, and the Bridge ends when the Extension lets it go. The Bridge opens a network connection only to your cluster's ssh port (at Wayne State, grid.wayne.edu, port 22, and another address only if a settings file placed beside it names one; the installers in the Extension's package bring none), carries bytes both ways without reading, keeping or logging them, holds no password, key or other credential, offers no shell and runs no other program. On Windows you remove it from Windows' own list of installed apps, where it is called "Beethoven bridge"; on macOS and Linux the uninstaller placed beside it removes it. The Extension can also carry the ssh path through a relay server, but only one that your institution's site profile names; none is named in this version, and if one ever is, the privacy statement will name who runs it and what it sees before any version uses it. If no Bridge is installed and you do not install one, or your cluster's ssh port cannot be reached from your network, the Extension uses the portal path.

Why: What the Bridge is now depends on the system: a compiled program of Licensor's in a signed
installer on Windows and macOS, the script on Linux. "Running" the installer becomes "opening" it,
because a student opens a signed package and does not run a script. The settings file beside the
Bridge is no longer "written by its installer" (the signed installers bring none; the binary reads
an `allow.txt` beside it if one is placed there), and removal is per system: Windows' own list of
installed apps, where the MSI registers "Beethoven bridge", or the uninstaller beside it on macOS
and Linux. The agreement does not name Apple's or Microsoft's signing services: "whose signature
your system can check" says what the student needs to know, and the privacy statement names who the
system may ask (P3). Amended 2026-10-05, after review: a Bridge installed from a zip with 14.0.0 or
earlier is not replaced by the update and keeps working, a PowerShell or Perl script that is not
signed and has no entry under Apps, so the paragraph says what it is and that the uninstaller beside
it removes it.

### L4. Section 15, the Rust standard library, what the Bridge runs on, and the marks named

Old:

> Beethoven is protected by copyright and other laws; Licensor and its licensors keep all right, title and interest in it. Beethoven bundles open-source packages listed in THIRD_PARTY_NOTICES.md; each is licensed to you under its own license, which this agreement does not limit. Claude Code, Node.js, the container image, the container runtime, the Open OnDemand portal, your cluster's ssh service, the programs your computer already has that the Bridge runs on (Windows PowerShell, Perl or Python), your authenticator app and the passkey service of your system or browser are not part of Beethoven: they are provided by their own publishers or by your institution under their own terms. If you send Licensor suggestions about Beethoven, Licensor may use them without obligation. Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher. Your institution's names and marks belong to it: Beethoven uses its name only in plain words, to say where your worker runs (for example, "Wayne State grid"), and carries none of its logos or other marks. "GlobalProtect" is the mark of Palo Alto Networks, named only to say which VPN program to turn on; "Google Authenticator" is Google's mark, "Windows Hello" Microsoft's and "Touch ID" Apple's, each named only to say which of your own tools to use.

New:

> Beethoven is protected by copyright and other laws; Licensor and its licensors keep all right, title and interest in it. Beethoven bundles open-source packages listed in THIRD_PARTY_NOTICES.md; each is licensed to you under its own license, which this agreement does not limit. On Windows and macOS the Bridge is a compiled program of Licensor's that includes the Rust standard library and the start-up and runtime support code its compiler links in (on Windows, that of MinGW-w64 and GCC, or Microsoft's C runtime when it is built on Windows), each licensed to you under its own notice in THIRD_PARTY_NOTICES.md. Claude Code, Node.js, the container image, the container runtime, the Open OnDemand portal, your cluster's ssh service, the programs your computer already has that the Bridge's scripts run on (Perl or Python under Linux, and Windows PowerShell or Perl for a Bridge installed from a zip file with Beethoven 14.0.0 or earlier), your authenticator app and the passkey service of your system or browser are not part of Beethoven: they are provided by their own publishers or by your institution under their own terms. If you send Licensor suggestions about Beethoven, Licensor may use them without obligation. Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher. Your institution's names and marks belong to it: Beethoven uses its name only in plain words, to say where your worker runs (for example, "Wayne State grid"), and carries none of its logos or other marks. "GlobalProtect" is the mark of Palo Alto Networks, named only to say which VPN program to turn on; "Google Authenticator" is Google's mark, "Windows" and "Windows Hello" Microsoft's, and "macOS" and "Touch ID" Apple's, each named only to say which of your own tools or systems to use.

Why: The compiled Bridge includes the Rust standard library, licensed under its own notice (T1), and
the start-up and runtime support code its compiler links in (T3: MinGW-w64 and GCC when it is built
on the Mac, Microsoft's C runtime when it is built on Windows), so section 15 says so, beside the
sentence about the open-source packages. "The programs your computer already has that the Bridge's
scripts run on" are Perl or Python under Linux, and Windows PowerShell or Perl for a Bridge
installed from a zip with 14.0.0 or earlier, which keeps working (L3; amended 2026-10-05, after
review, where the draft had dropped Windows PowerShell). "Windows" and "macOS" join the marks
sentence because 5(b)(i) now names the systems, each "named only to say which of your own tools or
systems to use".

## PRIVACY.md, version 10 -> version 11

### P1. Head, version line

Old:

> Version 10, 2026-10-02. Part of the Beethoven Trial Edition License Agreement (LICENSE.txt) and of any Full Edition agreement that names it. You can save and print this text; it is also at `https://openspineconsortium.com/beethoven/privacy.html`.

New:

> Version 11, 2026-10-04. Part of the Beethoven Trial Edition License Agreement (LICENSE.txt) and of any Full Edition agreement that names it. You can save and print this text; it is also at `https://openspineconsortium.com/beethoven/privacy.html`.

Why: The task's contract: PRIVACY "Version 11, 2026-10-04."

### P2. Opening, the record of the ssh path and of the signed installers

Old:

> Beethoven is a browser extension that starts, watches and stops a job in your own cluster account, over a secure shell (ssh) connection to your cluster's login node (the ssh path, which it tries first) or through your university's Open OnDemand portal (the portal path); a small helper program, the Bridge, that ships inside the extension and that you may install on your computer to carry the ssh connection; and a set of scripts (the framework) that runs in your cluster account. The job runs Claude Code, which you signed in to yourself. This statement says what stays in your browser, what the Bridge does on your computer, what happens when you sign in to your cluster over ssh, what goes to your cluster account, what your university sees on the ssh path, what your portal sees, what happens when you sign in to Claude and when the portal's shell asks for your password, what Anthropic receives, what Licensor receives, and what is never collected. The ssh path and the Bridge are new in this version and have been tried only against ssh servers Licensor ran itself, set up like your university's, not yet with a real account on a real cluster.

New:

> Beethoven is a browser extension that starts, watches and stops a job in your own cluster account, over a secure shell (ssh) connection to your cluster's login node (the ssh path, which it tries first) or through your university's Open OnDemand portal (the portal path); a small helper program, the Bridge, that ships inside the extension and that you may install on your computer to carry the ssh connection; and a set of scripts (the framework) that runs in your cluster account. The job runs Claude Code, which you signed in to yourself. This statement says what stays in your browser, what the Bridge does on your computer, what happens when you sign in to your cluster over ssh, what goes to your cluster account, what your university sees on the ssh path, what your portal sees, what happens when you sign in to Claude and when the portal's shell asks for your password, what Anthropic receives, what Licensor receives, and what is never collected. The ssh path and the Bridge came with Beethoven 12.0.0; they have been tried mostly against ssh servers Licensor ran itself, set up like your university's, and have had little use yet with real accounts on a real cluster. The signed installers of the Bridge for Windows and macOS, new in Beethoven 15.0.0, have not yet been opened on a real Windows computer or Mac.

Why: As L2 for the ssh path, and one sentence for what is new and untried: the signed installers
have not been opened on a real Windows computer or Mac.

### P3. The Bridge on your computer: what it is per system, the signature check, the registration and removal

Old:

> The ssh path needs a program on your computer, because a browser extension cannot open an ssh connection itself. The Bridge, which the extension's screens call the helper, is that program. It ships inside the extension's package, and the extension offers its installer from there: nothing is downloaded from Licensor or anyone else. You save the installer and run it once, in your own user account; it needs no administrator rights. It puts the Bridge's few files in a folder of your user account and registers it with Chrome, and with the other browsers built on Chromium that it finds, so that the browser knows where it is (on Windows a key in your own part of the registry, on a Mac or on Linux a small file in the browser's folder in your home folder); the registration names Beethoven as the only extension that may start it. On Windows the Bridge is a script run by Windows PowerShell; on a Mac and on Linux it is a script run by Perl, or by Python 3 where Perl is absent; these come with your system. Chrome starts the Bridge when the extension asks for it, and the Bridge ends when the extension lets it go. The Bridge opens a network connection only to your cluster's ssh port (at Wayne State, grid.wayne.edu, port 22, which is written into the Bridge; another address only if its installer wrote one into the settings file beside it) and carries bytes between the extension and that port. What it carries is the ssh connection, which is encrypted between the extension and your cluster: the Bridge does not read it, keep it or log it, holds no password, key or other credential, offers no shell, runs no other program and sends nothing to Licensor. The uninstaller placed beside it removes its files and the registration. If you do not install the Bridge, the extension uses the portal path.

New:

> The ssh path needs a program on your computer, because a browser extension cannot open an ssh connection itself. The Bridge, which the extension's screens call the helper, is that program. It ships inside the extension's package, and the extension offers its installer from there: nothing is downloaded from Licensor or anyone else. You save the installer and open it once, in your own user account; it needs no administrator rights. What the Bridge is depends on your system:
>
> - On Windows and on a Mac, the Bridge is a compiled program of Licensor's (written in Rust, with no code of anyone else's but the Rust standard library and the start-up and runtime support code its compiler links in, which THIRD_PARTY_NOTICES.md lists), and its installer is a signed package. On Windows it is a Windows Installer file (`beethoven-bridge-windows.msi`) signed by Licensor; it installs into your own account, and Windows' Settings list it afterwards, under Apps, as "Beethoven bridge". On a Mac it is an installer package (`beethoven-bridge-mac.pkg`) signed by Licensor and notarized by Apple (checked by Apple's automated service before it was offered); it installs into your own home folder only.
>
> - On Linux, the Bridge is a script run by Perl, or by Python 3 where Perl is absent; these come with your system. Its installer is a script in a zip file.
>
> - A Bridge you installed from a zip file with Beethoven 14.0.0 or earlier keeps working until you remove it: a script, run by Windows PowerShell on Windows or by Perl on a Mac, not signed and not listed under Apps; the uninstaller placed beside it removes it. On Windows it uses the same folder as the signed installer, so Beethoven's settings ask you to remove it before you install that one.
>
> When you open a signed installer, your Mac or your Windows computer may check the installer's signature with Apple or Microsoft, as it does for any signed program it is asked to open. That check is your system's own behaviour, between your computer and them, and it tells Licensor nothing.
>
> Each installer puts the Bridge's few files in a folder of your user account and registers it with Chrome, and with the other browsers built on Chromium that it finds, so that the browser knows where it is (on Windows a key in your own part of the registry, for Chrome and for Microsoft Edge; on a Mac or on Linux a small file in the browser's folder in your home folder); the registration names Beethoven as the only extension that may start it (the signed installers name the Beethoven of the Chrome Web Store, written into them when they are built). Chrome starts the Bridge when the extension asks for it, and the Bridge ends when the extension lets it go. The Bridge opens a network connection only to your cluster's ssh port (at Wayne State, grid.wayne.edu, port 22, which is written into the Bridge; another address only if a settings file placed beside it names one, and the installers in the package bring none) and carries bytes between the extension and that port. What it carries is the ssh connection, which is encrypted between the extension and your cluster: the Bridge does not read it, keep it or log it, holds no password, key or other credential, offers no shell, runs no other program and sends nothing to Licensor. On Windows, Settings, Apps, "Beethoven bridge", Uninstall removes its files and the registration; on a Mac and on Linux, and for a Bridge installed from a zip file with Beethoven 14.0.0 or earlier, the uninstaller placed beside it does. If you do not install the Bridge, the extension uses the portal path.

Why: The section said the Bridge was a script on every system (PowerShell on Windows). It now says
what it is per system and how each installer is signed. One sentence is new in kind: when a student
opens a signed installer, macOS or Windows may check the signature with Apple or Microsoft, as it
does for any signed program. That is the student's own system talking to its maker, not Beethoven
and not Licensor, and the statement says so in those words; it does not describe what Apple or
Microsoft receive, which their own statements cover and which no machine here has measured. The
registration now names the Windows registry keys for Chrome and Microsoft Edge (the MSI writes
both), says that the signed installers name only the Chrome Web Store's Beethoven, and the removal
is per system.

### P4. Your choices and rights: removing the Bridge

Old:

> Remove the site permission or uninstall the extension at any time; turn the passkey protection of the browser's key on or off in Settings; use *Forget this computer* to delete the browser's key and remove its line from your cluster (or remove the line with `hpcworker browser-key remove` on the cluster); remove the Bridge with its uninstaller; remove the key of the portal path's one-time step from your cluster account with `hpcworker login-setup --remove`; ask Licensor to move your approval to another installation, or for a copy or deletion of your access records (deletion of your access record ends your approval and with it the license). Michigan residents and residents of other states may have further rights under their state's laws; Licensor honours requests it is obliged to honour and answers others where it reasonably can. Beethoven is offered in the United States.

New:

> Remove the site permission or uninstall the extension at any time; turn the passkey protection of the browser's key on or off in Settings; use *Forget this computer* to delete the browser's key and remove its line from your cluster (or remove the line with `hpcworker browser-key remove` on the cluster); remove the Bridge (on Windows from Settings, Apps; on a Mac or on Linux, and for a Bridge installed from a zip file with Beethoven 14.0.0 or earlier, with its uninstaller); remove the key of the portal path's one-time step from your cluster account with `hpcworker login-setup --remove`; ask Licensor to move your approval to another installation, or for a copy or deletion of your access records (deletion of your access record ends your approval and with it the license). Michigan residents and residents of other states may have further rights under their state's laws; Licensor honours requests it is obliged to honour and answers others where it reasonably can. Beethoven is offered in the United States.

Why: Removal on Windows is now Windows' own Settings, Apps.

### P5. Changes: the version 11 entry

New:

> Version 11 (2026-10-04, Beethoven 15.0.0): on Windows and on a Mac the Bridge is now a compiled program of Licensor's, offered from inside the extension as a signed installer that installs into your own account without administrator rights: on Windows a Windows Installer file signed by Licensor, removed from Settings, Apps; on a Mac an installer package signed by Licensor and notarized by Apple, removed with the uninstaller beside the Bridge. On Linux the Bridge is the script it was. A Bridge installed from a zip file with an earlier version keeps working until you remove it with the uninstaller beside it. When you open a signed installer, your system may check its signature with Apple or Microsoft; that is your system's own behaviour and tells Licensor nothing. The Bridge does what it did: it reaches only your cluster's ssh port, carries the encrypted connection and keeps nothing. Nothing new reaches Licensor.

Why: New paragraph, before the version 10 entry, in the shape of the entries before it: what changed
for the student and that nothing new reaches Licensor.

## THIRD_PARTY_NOTICES.md

### T1. New item 5, the Rust standard library

New:

> 5. The Rust standard library (https://www.rust-lang.org; source at https://github.com/rust-lang/rust), statically linked into the Bridge's compiled program for Windows and macOS (beethoven-bridge.exe in bridge/beethoven-bridge-windows.msi, and beethoven-bridge in bridge/beethoven-bridge-mac.pkg). The Bridge's own source uses no other third-party code. Copyright: The Rust Project Developers (https://thanks.rust-lang.org). Licensed under the Apache License, Version 2.0 (https://www.apache.org/licenses/LICENSE-2.0) or the MIT license, at your option; Beethoven uses it under the MIT license, whose text follows. Some parts of the standard library carry notices of their own, which the Rust project lists for each release in the file COPYRIGHT-library that comes with it (in a rustup installation, share/doc/rust/COPYRIGHT-library.html): crates it is built from, under the same two licences, such as hashbrown, gimli, addr2line and rustc-demangle (which of them a build carries depends on the system it is built for), and its tables of Unicode character data, under the Unicode License v3, whose text follows the MIT text. The maintainer's record of each signed installer names the Rust version it was built with.

Why: The compiled Bridge statically links the Rust standard library. It is dual-licensed, Apache-2.0
or MIT; the notice names both and uses MIT, and carries the MIT text as items 1 to 4 carry theirs,
then the Unicode License V3 text for the standard library's Unicode tables (copyright line "(c)
1991-2024 Unicode, Inc.", in ASCII), and points to `COPYRIGHT-library`, the Rust project's own list
of the parts with notices of their own. The crate names (hashbrown, gimli, addr2line,
rustc-demangle) and the Unicode years were read from a Linux build of Rust 1.97.0 in this session;
which of those a Windows or macOS build carries, and the years in the Rust version the maintainer
builds with, are not yet measured (the sidecar records the Rust version).

### T2. The Bridge's paragraph, per system

Old:

> The ssh client of the ssh path, the code that protects its key with a passkey, and the Bridge (its installers, uninstallers and helper scripts for Windows, macOS and Linux) are Licensor's own work, written for Beethoven without third-party code, and are part of Beethoven under the Beethoven agreement. The ssh client uses only your browser's own cryptography (WebCrypto). The Bridge runs on programs your computer already has, which are not part of this package and are provided under their publishers' own terms: Windows PowerShell on Windows, and Perl on macOS and Linux (or Python 3 where Perl is absent).

New:

> The ssh client of the ssh path, the code that protects its key with a passkey, and the Bridge (its compiled program for Windows and macOS, its installers, uninstallers and helper scripts) are Licensor's own work, written for Beethoven without third-party code except the Rust standard library of item 5, which the compiled program includes, and the runtime support code of item 6, which the program for Windows includes, and are part of Beethoven under the Beethoven agreement. The ssh client uses only your browser's own cryptography (WebCrypto). What the Bridge runs on depends on the system: on Windows and macOS it is that compiled program; on Linux it is a script that runs on programs your computer already has, which are not part of this package and are provided under their publishers' own terms: Perl, or Python 3 where Perl is absent. (The package also keeps the script editions for Windows and macOS, which a copy of Beethoven other than the Chrome Web Store's offers instead, and which a helper installed from a zip file with Beethoven 14.0.0 or earlier still is; they run on Windows PowerShell and on Perl.)

Why: The Bridge is Licensor's own work except the Rust standard library it now includes, and, in the
program for Windows, the runtime support code of T3; what it runs on is per system. The script
editions stay in the package for a copy of Beethoven that is not the store item (a development
build), so their runtimes stay named, in parentheses. ### T3. New item 6, the MinGW-w64 and GCC
runtime code in the program for Windows (2026-10-05)

New: item 6 in `THIRD_PARTY_NOTICES.md`, with the licence text of the MinGW-w64 runtime.

Why: Added after review. The program for Windows is built on the Mac with Rust's
`x86_64-pc-windows-gnu` target, which links the MinGW-w64 runtime's start-up and support code and
GCC's runtime libraries into the exe statically (a cross-build read in review showed the
pseudo-relocation code's strings and, in its link map, objects of libmingw32, libmingwex, libmsvcrt,
libgcc and libgcc_eh), so "no third-party code but the Rust standard library" was not true of it.
The licence text is the one the Debian packaging of mingw-w64 11.0.1 records for the project's
files (ZPL 2.1); which of the linked objects are public domain and which are under it was not
checked file by file. GCC's runtime libraries are under GPL 3 with the GCC Runtime Library
Exception, which asks for no notice. The store texts say the same in one phrase.

## The panel's sentences (fixed by the contract, quoted in `docs/guides/INSTALL.md`)

Mac, the three steps under the download:

> Open the file you downloaded. The macOS Installer opens.
>
> Click Continue, then Install. It installs into your own account, so no administrator password is asked.
>
> When it says the installation was successful, close it and press Check again here.

Windows:

> Open the file you downloaded. Windows installs the Beethoven bridge into your own account; no administrator rights are needed.
>
> If Windows asks you to confirm, choose Run (or More info, then Run anyway).
>
> When the window closes, come back here and press Check again.

Under both: "This installer is signed, so your computer can check that it came from Beethoven's
maker before it runs." Settings, for a helper older than the one the package brings: "Installed ·
version <v>. This Beethoven brings version <n>: download and open it once more." `INSTALL.md`
quotes the step sentences word for word and says, around them, that what the student's computer
shows is not yet measured and should be reported to the lab lead in its own words.

## Not yet measured

- Nothing of the signed installers has been built, signed, notarized or opened on a real Mac or
  Windows computer. Every window either system shows on the way (SmartScreen, an Open File warning,
  the macOS Installer's screens, a destination choice, a password or User Account Control prompt)
  is not yet measured; the texts and guides say what the installers are built to do and no more.
- Whether SmartScreen warns about the MSI of a new publisher, and for how long, is not yet measured.
- Whether the macOS Installer asks where to install a package that offers only the user's home is
  not yet measured.
- Whether the Windows uninstall leaves the empty `%LOCALAPPDATA%\Beethoven\bridge` folder is not
  yet measured.
- What the Chrome Web Store review makes of two signed installers carrying a compiled program
  inside the package, and whether it asks for that program's source, is not yet measured.
- What Apple or Microsoft receive when a system checks a signature is theirs to say; nothing here
  measured it, and the privacy statement claims nothing about it.
- Which parts of the Rust standard library a Windows or macOS build carries (the crate list in
  `THIRD_PARTY_NOTICES.md` item 5 was read from a Linux build of Rust 1.97.0), and the Unicode
  copyright years in the Rust version the maintainer builds with.

## Where these texts depart from the task's list, and why

- The task asked for "the version-history entry for version 10" in `LICENSE.txt`. The agreement has
  no version-history section and never had one; adding one would change its structure, which every
  other document cites by section number. The record of version 10 is this note.
- 5(b)'s record of the ssh path was rewritten although the task did not list it (L2): version 9's
  "new in this version" and "not yet with a real account" would be untrue in a text that applies to
  15.0.0 after a student's sitting on the real grid. The privacy statement's opening says the same
  (P2).
- `THIRD_PARTY_NOTICES.md` item 5 carries, beside the MIT text the task asked for, the Unicode
  License V3 text and a pointer to the Rust project's `COPYRIGHT-library`, because the standard
  library's Unicode tables are under that licence and its notice must travel with copies.
- The marks sentence of section 15 gains "Windows" and "macOS", since 5(b)(i) now names them.

## Sentences I am unsure about (for Greg and for counsel)

- L2 and P2: "has had little use yet with real accounts on a real cluster". One student's sitting
  (2026-10-03) took the password and the code on the real grid and then stopped on a defect fixed
  the same day. **CONFIRM** that this is the description Greg wants, or say "one" sitting.
- T1: "The maintainer's record of each signed installer names the Rust version it was built with."
  This rests on the sidecar's `tools` field being filled with the Rust version by the release
  scripts, which another stream writes. **CONFIRM** against `helper/release/` once it lands.
- P3: "notarized by Apple (checked by Apple's automated service before it was offered)". That is
  what notarization is; whether the explanation in parentheses is wanted in a privacy statement is a
  drafting choice.
- Counsel: does a statement that the student's own system "may check the installer's signature with
  Apple or Microsoft" need more (a link to their statements), or is it right to stop at "tells
  Licensor nothing"?

## Outside these files: what must change to match

- `extension/test/hygiene.test.ts`, line 261: the built package may hold under `bridge/` only
  `[A-Za-z0-9._-]+\.zip` and `manifest.json`, so a package with `beethoven-bridge-mac.pkg` and
  `beethoven-bridge-windows.msi` fails this test (and its comment at line 263, "each a zip under
  bridge/", stops being true). Whoever owns the test widens it to the two names.
- `docs/STORE_LISTING.md`, line 19, still says "no signed file" (an older compliance document;
  `docs/store/` is current).
- `docs/ARCHITECTURE.md`, line 387, says "From the release after 14.0.0": now 15.0.0, if it means
  this release.
- `extension/wxt.config.ts`, the comment above `permissions` says the installers register the host
  for "Chrome and Edge (and Chromium and Brave)"; no installer has ever registered Brave, before
  15.0.0 or since. Left as it was (the task allowed only a sentence that became untrue).
- The site's `terms.html` and `privacy.html` must be regenerated from LICENSE version 10 and PRIVACY
  version 11 before the submission (`docs/PUBLISHING_SITE.md`; the site repository's
  `tools/build_site.py`).
- `extension/public/` holds byte-identical copies of the three texts, refreshed by
  `node scripts/sync-profiles.mjs` (done in this stream; `cmp` shows them identical).
