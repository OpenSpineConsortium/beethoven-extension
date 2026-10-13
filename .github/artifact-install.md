# Install this build in Chrome

<!-- This file is the SOURCE of the text on each CI run's Summary page and of the INSTALL.md
inside the artifact zip. The direct download link is minted per run at upload time, so it never
appears here: CI writes it as the headline above this text on the run page. -->

This is the Beethoven extension exactly as CI built it from this commit — for people this
repository is shared with. Your GitHub sign-in in the browser is what authorized the download.

1. **Extract the zip** (Windows Explorer and macOS Finder do this themselves). If you are
   reading this inside the extracted folder, this step is done.
2. In Chrome open `chrome://extensions`, turn on **Developer mode** (top right), press
   **Load unpacked**, and pick the extracted folder — the one holding `manifest.json` and this
   file.
3. **Updating later:** download a newer run's artifact, extract it over the same folder (or
   anywhere), and press the reload arrow on the Beethoven card — or press **Load unpacked**
   again for a new folder.

Chrome shows its developer-mode notice for anything loaded this way and never auto-updates it:
that is the browser's permanent price for an install from outside the Chrome Web Store. Students
don't do any of this — they get Beethoven through the Chrome Web Store listing, the one real
one-click install, with updates handled by Chrome.
