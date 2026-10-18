// When Beethoven may restart itself into a newer version from the Chrome Web Store (23.0.0), as a pure
// decision. Chrome checks the store every few hours by itself, but a version it has downloaded waits for
// the extension to be idle, and a panel open for days keeps it from ever being idle, so a student could
// stay a release behind for as long as the browser stays open. Beethoven now listens for the downloaded
// version (runtime.onUpdateAvailable), asks the store once a day besides (runtime.requestUpdateCheck), and
// restarts into it (runtime.reload) only while nothing a restart would lose is under way: a restart ends
// every page of Beethoven's, the memory of the service worker and storage.session, which holds a press
// kept until the grid can carry it, a password typed without Remember and the passkey's unlock. The
// worker on the grid is a Slurm job and keeps running through it; nothing on the grid is touched.

/** what the background knows at the moment it might restart, each true while that thing is under way */
export interface UpdateFacts {
  /** a Beethoven page (the panel, the popup, the welcome or Settings page) is connected */
  pageOpen: boolean;
  /** a student's press is being carried out, or a connect line is being typed */
  pressing: boolean;
  /** a press waits in storage.session for the grid to carry it */
  pressKept: boolean;
  /** a Claude sign-in or the one-time login setup is under way in a shell */
  sitting: boolean;
  /** a Stop is under way */
  stopping: boolean;
  /** a lab lead's gate setup or removal is on the grid */
  gate: boolean;
  /** the grid sign-in is under way: a sign-in tab watched, a check in flight, or a one-shot password kept */
  gridSignin: boolean;
}

/** why the restart must wait now, in the debug log's words, or undefined when Beethoven may restart */
export function updateMustWait(f: UpdateFacts): string | undefined {
  if (f.pageOpen) return 'a Beethoven page is open';
  if (f.pressing) return 'a press is under way';
  if (f.pressKept) return 'a press waits for the grid';
  if (f.sitting) return 'a sign-in is under way in the grid shell';
  if (f.stopping) return 'a stop is under way';
  if (f.gate) return "the lab lead's gate press is under way";
  if (f.gridSignin) return 'the grid sign-in is under way';
  return undefined;
}

/** once a day: Chrome throttles requestUpdateCheck, and its own check runs every few hours anyway */
export const UPDATE_CHECK_PERIOD_MINUTES = 24 * 60;
