// The views the pages render and the actions they send (Beethoven 11.0.0; docs/V11_CONTRACT.md,
// "Views and actions"; 12.0.0 adds the direct way's moments, words, Settings and Details sections and
// actions, marked "12.0.0" where they are). The pages are pure functions of a view: they hold no state of their own
// beyond what is on screen (a tick being ticked, a fold being open, the text in the code box) and
// never decide what the student sees next. The core computes every view from facts (core/facts.ts,
// core/steps.ts) and the background pushes it to the open pages (messages.ts VIEW_PORT).
//
// Every sentence a student can read is in WORDS below, verbatim from the specification
// (scratchpad/v11/SPEC.md) and the orchestrator's amendment AM2. The hygiene test reads WORDS and
// the rendered pages: no student-facing string may contain job, node, partition, heartbeat, shell,
// portal tab, probe, scheduler, hpcworker, OnDemand or "Failed to fetch" (Details is exempt).
// Three families of sentences are NOT here because another module owns them and they are also part
// of a legal record: the agreement's four summary lines and its tick (core/terms.ts SUMMARY,
// AFFIRMATION), and the data statement's four lines and its tick (core/disclosure.ts
// SHORT_STATEMENT, STATEMENT_TICK). Views carry those as strings the core copies from there.
//
// Nothing here touches the browser.
import type { ReasonClass, StepFailCode } from './contract';
import type { Appearance, KnownState } from './keys';

// ---- surfaces --------------------------------------------------------------------------------------

/** the four pages: the side panel, the welcome page (options page before acceptance), Details (a sheet in the panel) and Settings (options page after acceptance) */
export type Surface = 'panel' | 'welcome' | 'details' | 'settings';

export type SurfaceView = { surface: 'panel'; view: PanelView } | { surface: 'welcome'; view: WelcomeView } | { surface: 'details'; view: DetailsView } | { surface: 'settings'; view: SettingsView };

// ---- the words -------------------------------------------------------------------------------------

/** Every student-facing sentence, verbatim. Functions take the parts the core fills in. */
export const WORDS = {
  product: 'Beethoven',

  /** the welcome page (moment 2) */
  welcome: {
    headline: 'Claude, on your grid.',
    subline: 'Ask in claude.ai or the Claude app. A worker on the Wayne State grid does the work.',
    needsTitle: "You'll need",
    needs: [
      { title: 'A Wayne State grid account', detail: 'Your AccessID and password.', link: 'How to get one' },
      { title: 'GlobalProtect', detail: 'Connected to protect.wayne.edu.', link: 'How to set it up' },
      { title: 'Claude Pro or Max', detail: 'The account you use at claude.ai.', link: 'See plans' },
    ],
    summaryTitle: 'The agreement, in short',
    showTerms: 'Show terms',
    hideTerms: 'Hide terms',
    openInTab: 'Open in a tab',
    saveCopy: 'Save a copy',
    print: 'Print',
    agree: 'Agree and continue',
    opening: 'Opening the grid…',
    allowNote: (host: string) => `Chrome will ask to let Beethoven reach ${host}. Choose Allow.`,
    footerNothingLeaves: 'Nothing leaves this computer until you agree.',
    footerOtherPortal: 'Not at Wayne State? Use another portal',
    denied: (host: string) => `Beethoven needs ${host} to work.`,
    tryAgain: 'Try again',
    panelNotOpened: 'Open Beethoven from the toolbar: the puzzle icon, then Beethoven.',
    usePortal: 'Use this portal',
    anthropicRefused: "That's a Claude address, not your grid.",
    saveFailed: "Couldn't save your agreement in this browser. Try again.",
    handoff: "You're set. Beethoven carries on in the panel →",
  },

  /** the panel before the agreement is accepted (decision D19: TERMS_REFUSAL and one button) */
  termsNeeded: {
    body: "The Beethoven terms haven't been accepted in this browser yet. Open Beethoven's welcome page to accept them.",
    button: 'Open the welcome page',
  },

  /**
   * The panel while the welcome page carries the first moment (11.0.0 review: the panel opens beside the
   * welcome page in the same click, before the agreement is saved and before Chrome's box is answered,
   * so it must never say the terms were not accepted then), and when Chrome's grant was taken away later.
   */
  welcomeMoment: {
    almostTitle: 'Almost there.',
    almostBody: "Choose Allow in Chrome's box. Beethoven carries on here.",
    waiting: 'Waiting for Chrome…',
    deniedBody: 'Choose Try again on the welcome page.',
    finishTitle: 'Finish on the welcome page',
    revokedTitle: 'Allow Beethoven again',
    revokedBody: (host: string) => `Chrome no longer lets Beethoven reach ${host}. Your worker on the grid is not affected.`,
    revokedButton: 'Allow again',
  },

  /** moment 4; the app and the address come from the site profile (vpn_app, vpn_portal) */
  globalprotect: {
    title: (app: string) => `Turn on ${app}.`,
    body: (app: string, portal: string) => `Open ${app} and connect to ${portal}. Then approve the sign-in on your phone.`,
    copy: 'Copy',
    copied: 'Copied.',
    looking: 'Looking for the grid…',
    still: (app: string) => `Still looking. Check that ${app} says Connected.`,
    connected: 'Connected.',
    /** a portal with no site profile (decision D20) */
    titleNoProfile: 'Turn on your VPN.',
    bodyNoProfile: "Connect to your university's VPN.",
  },

  /** moment 5 */
  grid: {
    title: 'Sign in to the grid',
    body: 'Use your AccessID and password in the box Chrome shows. Beethoven never sees them.',
    signedIn: (account: string) => `Signed in as ${account}.`,
    /**
     * The spec's sentence for Cancel. Not shown by 11.0.0: measured in Chromium 153 (core build,
     * scratchpad/v11/core/authexp), a Cancel in Chrome's box and a wrong password look the same to an
     * extension (a second load of the tab, still 401), so Beethoven cannot know the box was cancelled.
     */
    cancelled: 'Sign-in was cancelled.',
    /** after a second load of the sign-in tab with no sign-in (Cancel, or a wrong password): true in both cases */
    notYet: 'Not signed in yet.',
    tabClosed: 'The sign-in tab was closed.',
    signInAgain: 'Sign in again',
    startPage: 'Press LOGIN TO ONDEMAND on the grid page.',
    unreachable: (app: string) => `Can't reach the grid. Is ${app} on?`,
    notOod: "This doesn't look like an OnDemand portal.",
    useAnother: 'Use another portal',
    tryAgain: 'Try again',
  },

  /** moment 6 */
  statement: {
    title: 'Where your work goes',
    more: 'More about your data ›',
    workerName: (name: string) => `Worker name: ${name}`,
    change: 'Change',
    markRestricted: 'Mark this workspace restricted',
    connect: 'Connect',
    connectingWhenReady: 'Connecting when ready…',
    rowSignedIn: (account: string) => `Signed in as ${account}`,
    rowApproved: 'Approved',
    rowReady: 'Your grid account is ready',
    notApproved: { title: 'Ask for access', body: (account: string) => `${account} isn't approved for Beethoven yet. Beethoven checks again when you open it.`, button: 'Ask for access' },
    otherInstallation: { title: 'Ask your lab lead', body: (account: string) => `${account} is set up on another computer. Your lab lead can move it here.` },
    otherAccount: { title: 'Ask your lab lead', body: 'This browser is set up for another AccessID. Ask your lab lead.' },
    withdrawn: { title: 'Update Beethoven', body: 'This version is out of date.', button: 'Update' },
    accessUnreachable: { body: "Can't check your approval right now.", button: 'Try again' },
    noSharedCopy: { body: "Your grid account can't use the lab's copy yet. Ask your lab lead.", button: 'Copy details' },
    restricted: { body: 'This workspace is marked restricted. Choose another under More about your data.' },
  },

  /** the four-node track */
  track: ['Asked', 'In line', 'Starting', 'Online'] as const,

  /** moment 7 */
  connect: {
    hero: 'Asking the grid for a computer…',
    gettingSignin: 'Getting your Claude sign-in ready…',
    refused: "The grid didn't take the request.",
    /** under the refusal (the scheduler's own words are for Details): what to do */
    refusedNext: 'Try again in a minute. If it happens again, Details for your lab lead has the reason.',
    /** the sign-in computer's refusal, split into its title and its second sentence */
    noSigninTitle: "The grid didn't find a computer for the sign-in.",
    keepsPlace: 'Your worker keeps its place in line.',
    busy: 'The grid is busy. Still finding a computer for the sign-in…',
    noSigninComputer: "The grid didn't find a computer for the sign-in. Your worker keeps its place in line.",
    tryAgain: 'Try again',
  },

  /** moment 8 */
  claude: {
    title: 'Sign in to Claude',
    body: 'Approve in the Claude tab, then paste the code here.',
    placeholder: 'Paste code',
    reopen: 'Open the Claude tab again',
    continue: 'Continue',
    inLine: (timer: string) => `Your worker is already in line · ${timer}`,
    signedIn: (email: string, plan: string) => `Signed in as ${email} · ${plan}`,
    badCode: "That code didn't work. Copy it again from the Claude tab.",
    timedOut: 'The sign-in timed out.',
    signInAgain: 'Sign in again',
    tabClosed: 'The Claude tab was closed.',
    openAgain: 'Open it again',
    noPlan: 'This Claude account has no Pro or Max plan. Remote Control needs one.',
    useAnother: 'Use another account',
    /** the sign-in sitting was lost (the browser stopped Beethoven's background mid-sign-in): a plain sentence and a fresh start */
    interrupted: 'The sign-in stopped before it finished.',
  },

  /** AM2: the one-time key step. UNPROVEN ON THE GRID until a student without a key has tried it. */
  loginSetup: {
    title: 'One more thing, once.',
    body: "Type your grid password in the grid's own terminal. Beethoven never sees it.",
    open: 'Open the grid terminal',
    typePassword: 'Type your password in the terminal, then press Enter.',
    imIn: "I'm in",
    /** while Beethoven has typed the line and re-tests every 2 s (decision D23: AM2 gives no words for this) */
    checking: 'Checking…',
    done: "Done. You won't need this again.",
    paste: 'Paste, then press Enter.',
    whatLine: 'What does the line do?',
    lineExplain: "It makes a key in your grid account that only the grid's own website can use, so it stops asking.",
    notYet: 'Not done yet.',
  },

  /** moments 9 and 11, and the home's waiting states (the "Waiting and status" table) */
  queue: {
    hero: 'In line for a computer',
    sub: 'It starts as soon as one is free. You can close this panel.',
    /** the home's subline under the large timer: "It starts as soon as one is free." */
    homeSub: 'It starts as soon as one is free.',
    /** the reason is under Show log: the queue moment's error says only this */
    couldntStartTitle: "Your worker couldn't start.",
    expected: (clock: string) => `Expected around ${clock}.`,
    lastTime: (minutes: number) => `Last time: ${minutes} min.`,
    shareHero: 'Waiting for your share of the grid',
    shareSub: 'It starts when your other grid jobs finish.',
    maintenanceHero: 'The grid is under maintenance',
    maintenanceSub: "Your worker starts when it's back.",
    busyToday: 'The grid is busy today. Your worker is still in line.',
    couldntStart: "Your worker couldn't start.",
    unreachable: (app: string) => `Can't reach the grid. Is ${app} on? Your worker keeps its place in line.`,
    tryAgain: 'Try again',
  },

  /** moment 10 and ⋯ > "See what it can do" */
  tour: {
    bar: 'What it can do',
    skip: 'Skip',
    done: 'Done',
    next: 'Next',
    captions: ['Ask from claude.ai or the Claude app.', 'Your worker on the grid picks it up.', 'Big jobs run on the grid, not your laptop.', 'The answer comes back to your chat.'] as const,
    /** scene 1's typed question */
    question: 'Is the female pelvis relatively wider?',
  },

  /** moment 11 and the home's starting states */
  starting: {
    hero: 'Starting',
    gotComputer: 'Got a computer. Connecting to Claude…',
    gotComputerTimed: (timer: string) => `Got a computer. Connecting to Claude… · ${timer}`,
    connecting: 'Connecting to Claude…',
    slowHero: 'Still connecting',
    slowSub: 'This is taking longer than usual.',
    slowMoment: 'Still connecting. This is taking longer than usual.',
    showLog: 'Show log',
    needsSignin: 'Sign in to Claude to finish.',
    signInClaude: 'Sign in to Claude',
    reconnectingMoment: 'Reconnecting…',
  },

  /** moment 12 */
  online: {
    hero: "You're online.",
    ready: (minutes: number, title: string) => (minutes < 1 ? `Ready in Claude in under a minute. Look for ${title}.` : `Ready in Claude, ${minutes} min after you asked. Look for ${title}.`),
    open: 'Open my session',
    badLink: (title: string) => `Online, but the link looks wrong. Open claude.ai/code and look for ${title}.`,
    pinTip: 'Keep Beethoven one click away: the puzzle icon, then the pin.',
    pinned: 'Pinned.',
  },

  /** the home panel */
  home: {
    more: 'More',
    menu: { tour: 'See what it can do', files: 'Your files', settings: 'Settings', details: 'Details for your lab lead', help: 'Help' },
    onlineHero: 'Online',
    /** "Wayne State grid · up 2 h 14 min"; in its first minute "Wayne State grid · online just now" (onlineFor) */
    onlineSub: (title: string, upMs: number) => `${title} · ${onlineFor(upMs)}`,
    reconnectingHero: 'Reconnecting',
    reconnectingSub: 'Claude dropped the connection. Trying again.',
    needsHero: 'Needs you',
    needsSub: 'Sign in to Claude to finish.',
    /** need_consent (decision D21: the spec has no words for it) */
    needsConsentSub: 'Press Connect to turn on Remote Control.',
    renewingHero: 'Renewing',
    renewingSub: (hours: number) => `Your worker restarts itself every ${hours} hours. Back in a few minutes.`,
    stoppedHero: 'Stopped',
    stoppedSub: 'Connect to start Claude on the grid.',
    errorHero: "Couldn't start",
    asOf: (clock: string) => `As of ${clock}. Sign in to the grid to see it live.`,
    unreachableHero: "Can't reach the grid",
    unreachableSub: (app: string) => `Is ${app} on? Your worker keeps running.`,
    openSession: 'Open my session',
    connect: 'Connect',
    connectReminder: "Your worker's files and output go to Anthropic. Keep restricted data out.",
    signInClaude: 'Sign in to Claude',
    tryAgain: 'Try again',
    newSession: 'New session',
    newSessionTip: 'Start a new session there. It runs on your worker.',
    copyLink: 'Copy link',
    linkCopied: 'Link copied.',
    phone: 'Phone',
    phoneTitle: 'Open on your phone',
    phoneBody: (title: string) => `Scan with your phone's camera. In the Claude app, open Code, then ${title}.`,
    phoneDone: 'Done',
    rows: { grid: 'Grid', claude: 'Claude', worker: 'Worker' },
    gridSignedIn: (account: string) => `Signed in as ${account}`,
    gridSignedOut: 'Signed out',
    gridSignIn: 'Sign in',
    /** the hero already asks about the VPN: the row says only this */
    gridUnreachable: "Can't reach",
    /** before the first check of this browser session (decision D22) */
    checking: 'Checking…',
    claudeSignedIn: (plan: string) => `Signed in · ${plan}`,
    claudeNeeds: 'Needs sign-in',
    claudeSignIn: 'Sign in',
    /** no claude_login under 5 minutes old (decision D22; was "—", which read as a fault) */
    unknown: 'Not checked yet',
    workerOnline: (ago: string) => `Online · checked ${ago} ago`,
    workerInLine: (minutes: number) => `In line · ${minutes} min`,
    workerAsking: 'Asking…',
    workerStarting: 'Starting',
    workerRenewing: 'Renewing',
    workerStopped: 'Stopped',
    workerNeeds: 'Needs you',
    workerError: "Couldn't start",
    workerAsOf: (clock: string, word: string) => `As of ${clock} · ${word}`,
    renews: (clock: string) => `Renews itself at ${clock}`,
    asked: (clock: string) => `Asked at ${clock}`,
    stop: 'Stop',
    cancel: 'Cancel',
    confirm: 'Stop your worker? Open sessions end.',
    confirmStop: 'Stop',
    /** "Cancel" while in line: no session exists yet to end */
    confirmCancel: 'Give up your place in line?',
    confirmCancelButton: 'Cancel it',
    keep: 'Keep it',
    stopping: 'Stopping…',
    tryAsking: 'Try asking',
    prompts: ['Is the female pelvis relatively wider?', "What's in my workspace? Suggest a first analysis.", "Write a Slurm job for my script, submit it, and tell me when it's done."] as const,
    promptCopied: 'Copied. Paste it in Claude.',
    tourCard: 'See what it can do · 16 s',
    showLog: 'Show log ›',
    hideLog: 'Hide log',
    copyLog: 'Copy log',
  },

  /** the toolbar button's tooltip (action.setTitle); decision D24 adds the states the spec leaves out */
  toolbar: {
    plain: 'Beethoven',
    online: 'Beethoven · Online',
    onlineFor: (upMs: number) => (upMs < 60_000 ? 'Beethoven · Online' : `Beethoven · Online for ${formatUp(upMs)}`),
    inLine: (minutes: number) => `Beethoven · In line for ${minutes} min`,
    starting: 'Beethoven · Starting',
    needsYou: 'Beethoven · Needs you',
    error: "Beethoven · Couldn't start",
  },

  /**
   * 12.0.0: the direct way to the grid (ssh, no VPN), docs/V12_CONTRACT.md. Beethoven tries it first,
   * through the first bridge this browser has (a browser-only one when one exists, else the small helper
   * that comes inside Beethoven), and only then the GlobalProtect way of 11.0.0. The first direct
   * sign-in asks for the AccessID, the password and the Google Authenticator code in Beethoven's own
   * sheet, exactly as the grid asks for them; then this computer has a key of its own and later
   * connections ask for nothing. Windows Hello / Touch ID protection of that key is OPT-IN, off by default.
   */
  direct: {
    /** the home's Grid row, beside the account */
    rowDirect: 'Direct',
    rowVpn: (app: string) => `Through ${app}`,
    /** the Grid row while the protected key waits for Windows Hello / Touch ID this browser session */
    rowLocked: 'Locked',
    rowUnlock: 'Unlock',
    /** a Connect through the gate stopped at one of its caps, or the lab's copy is too old for it */
    gate: {
      names: "The grid lets this computer's key use only a few worker names. Connect with a name you used before (Settings), or use GlobalProtect for this one.",
      hourly: "This computer's key has started the worker as often as the grid allows in an hour. Try again later, or use GlobalProtect.",
      busy: "The grid is busy with this computer's other requests. Try again in a minute.",
      oldCopy: "The lab's copy of the tool on the grid is older than this Beethoven. Ask your lab lead to update it, or use GlobalProtect.",
    },
    /** the home's hero subline when the direct way cannot reach the grid */
    unreachableSub: "Beethoven can't reach the grid directly right now. Your worker keeps running.",

    /** moment "install-helper": no bridge is available yet */
    installHelper: {
      title: 'One small download, once',
      body: "To reach the grid without GlobalProtect, Chrome needs a small helper on this computer. It comes inside Beethoven, needs no administrator, and only carries Beethoven's encrypted connection to the grid.",
      download: (os: string) => `Download for ${os}`,
      /** under the button: the file's name and size */
      fileLine: (file: string, size: string) => `${file} · ${size}`,
      /** the steps for this computer (the download is a zip holding the installer) */
      steps: {
        windows: [
          'Open the zip you downloaded and choose Extract all.',
          'In the folder it makes, double-click the install file. If Windows warns you, choose Run (or More info, then Run anyway).',
          'Press Enter in the window. When it says the bridge is installed, come back here and press Check again.',
        ],
        mac: [
          'Double-click the zip you downloaded. Your Mac unpacks it into a folder.',
          'Double-click the install file in that folder. If your Mac says it was not opened, click Done, then open System Settings, Privacy & Security, and click Open Anyway (on macOS 14 or earlier: Control-click the file, choose Open, then Open).',
          'Press Return in the window. When it says the bridge is installed, close it and press Check again here.',
        ],
        linux: ['Unpack the zip you downloaded.', 'In a terminal in that folder, type bash followed by the install file name, and press Enter.', 'Press Enter when it asks. When it says the bridge is installed, press Check again here.'],
      },
      /** the same steps naming the installer inside the zip (the manifest's "open": install.cmd, install.command, install.sh) */
      stepsNamed: {
        windows: (open: string) => [
          'Open the zip you downloaded and choose Extract all.',
          `In the folder it makes, double-click ${open}. If Windows warns you, choose Run (or More info, then Run anyway).`,
          'Press Enter in the window. When it says the bridge is installed, come back here and press Check again.',
        ],
        mac: (open: string) => [
          'Double-click the zip you downloaded. Your Mac unpacks it into a folder.',
          `Double-click ${open} in that folder. If your Mac says it was not opened, click Done, then open System Settings, Privacy & Security, and click Open Anyway (on macOS 14 or earlier: Control-click the file, choose Open, then Open).`,
          'Press Return in the window. When it says the bridge is installed, close it and press Check again here.',
        ],
        linux: (open: string) => ['Unpack the zip you downloaded.', `In a terminal in that folder, type bash ${open} and press Enter.`, 'Press Enter when it asks. When it says the bridge is installed, press Check again here.'],
      },
      /** under the steps, on Windows only: Smart App Control blocks a downloaded script with no Run button until the zip is unblocked */
      osNote: {
        windows: 'Blocked with no way to run it? Right-click the zip, choose Properties, tick Unblock, choose OK, then Extract all again.',
      } as Partial<Record<'windows' | 'mac' | 'linux', string>>,
      /** why the operating system warns: the helper is not signed (docs/store: the accounts guide says what signing costs) */
      unsignedNote: "Your computer may warn you because the helper isn't signed by a company. It is a short script you can read.",
      checkAgain: 'Check again',
      checking: 'Looking for the helper…',
      found: 'Helper found.',
      notFound: 'Not found yet. Open the downloaded file, then Check again.',
      /** right after the download, while Beethoven looks by itself every few seconds (not yet a failure) */
      waiting: 'Waiting for the helper. Beethoven checks by itself every few seconds.',
      /** the helper answered but is broken or blocked (a Chrome error the student can't act on) */
      broken: 'The helper is there but did not answer. Download it again, open it, then Check again.',
      useVpn: (app: string) => `Use ${app} instead`,
      noDownload: "There's no helper for this computer yet.",
    },

    /** moment "sign-in-sheet": Beethoven's own sign-in sheet; the prompts are the grid's own, shown as they arrive */
    signin: {
      title: 'Sign in to the grid',
      accountLabel: 'AccessID',
      accountPlaceholder: 'ab1234',
      continue: 'Continue',
      /** under the fields, always */
      privacy: 'Beethoven sends your password and code only to the grid, inside the encrypted connection, and never keeps them.',
      /** beside the grid's own code prompt (the prompt itself is the grid's words, verbatim) */
      codeHint: 'The 6-digit code for the grid in Google Authenticator (not Microsoft Authenticator).',
      connecting: 'Connecting to the grid…',
      working: 'Signing in…',
      settingUp: 'Setting up this computer…',
      checking: 'Checking the new key…',
      signingInClaude: 'Getting your Claude sign-in ready…',
      /** after a refusal the grid asks again: this sits above its prompt */
      notAccepted: 'Not accepted. Try again.',
      /** after three refusals Beethoven stops */
      stoppedTitle: "That didn't work three times.",
      stoppedBody: (app: string) => `Beethoven stopped so your account isn't locked. Use ${app} now, or try again later.`,
      /** the stop's Try again while the cooldown runs (it cannot be pressed until then) */
      tryAgainAt: (clock: string) => `Try again at ${clock}`,
      tryAgain: 'Try again',
      cancel: 'Cancel',
      useVpn: (app: string) => `Use ${app} instead`,
      /** the grid's identity did not match the one Beethoven carries: nothing was sent */
      wrongGridTitle: "Stopped: the grid's identity didn't match",
      wrongGrid: "The grid didn't prove who it is, so Beethoven sent nothing: no password, no code, no key. Tell your lab lead. GlobalProtect still works meanwhile.",
      /** the bridge could not open a connection to the grid's port */
      unreachable: "Can't reach the grid directly right now.",
      unreachableTitle: "Can't reach the grid directly",
      unreachableBody: 'Some networks block it. GlobalProtect works on any network.',
      /** the connection ended for another reason */
      droppedTitle: 'The connection ended',
      dropped: 'The connection to the grid ended. Try again.',
      accountBad: 'An AccessID is letters and digits, like ab1234.',
      /** the key was added but the check with it failed */
      keyNotTakenTitle: "The grid didn't take this computer's key",
      keyNotTaken: "Your sign-in worked, but the check with this computer's key didn't. Try again. If it happens again, Details for your lab lead has the reason.",
      /** the enrolment line refused, in the tool's own sentence */
      keyRefused: (sentence: string) => `The grid's own tool said no: ${sentence}`,
      /** this browser could not make or open the key: found before anything was sent */
      keyStoreTitle: "This browser couldn't keep the key",
      keyStore: "Beethoven couldn't save this computer's key in this browser, so it asked the grid for nothing. Try again, or use GlobalProtect.",
      /** the lab's copy on the grid is older than this Beethoven */
      oldCopy: "The lab's copy of the tool on the grid is older than this Beethoven. Ask your lab lead to update it, or use GlobalProtect.",
      /** the grid's "wrong code, or no 2FA set up" refusal: it names both causes, so the student says which */
      codeRefusedTitle: "The grid didn't accept the code",
      codeRefused: 'Either the code was mistyped or had already changed, or your account has no grid code yet.',
      codeAgain: 'Type the code again',
      noCode: "I don't have a grid code yet",
      /** above the grid's own banner or instruction on the sheet */
      gridSays: 'The grid says',
      /** the protected key waits for Windows Hello / Touch ID this browser session */
      unlockTitle: 'Unlock Beethoven',
      unlockBody: 'Use Windows Hello or Touch ID to unlock the key on this computer.',
      unlock: 'Unlock',
      unlockFailed: "That didn't unlock. Try again.",
      /** under Unlock: the way out when the passkey is gone (Windows Hello reset, passkey deleted) */
      cantUnlock: "Can't unlock? Forget this computer and sign in again",
    },

    /** moment "choose-route": the grid has no Google Authenticator code for this account yet */
    chooseRoute: {
      title: 'Set up your grid code first',
      body: "The grid asks for a Google Authenticator code. You set it up once, on the grid's website, which needs GlobalProtect.",
      laptop: { title: 'On this computer', detail: "Turn on GlobalProtect here, then set up the code on the grid's website.", button: 'Use this computer' },
      phone: { title: 'With my phone', detail: "For when GlobalProtect won't install on this computer.", button: 'Use my phone' },
    },

    /** moment "code-setup": the chosen route's steps; the QR codes are drawn on the device from the links */
    codeSetup: {
      laptopTitle: 'Set up your grid code on this computer',
      laptopSteps: [
        'Install Google Authenticator on your phone.',
        'Turn on GlobalProtect on this computer, and approve its sign-in in Microsoft Authenticator.',
        "Open the grid's website, choose Interactive Apps, then 2FA Setup, and press Launch. Once it is running, click Launch 2FA Setup: a new tab shows a square code.",
        'In Google Authenticator tap +, then Scan a QR code, and scan the square code the page shows.',
        "Turn GlobalProtect off again if you like, and come back here.",
      ],
      phoneTitle: 'Set up your grid code with your phone',
      phoneSteps: [
        'Scan the first square code with your phone and install GlobalProtect. Open it, enter the portal protect.wayne.edu, sign in with your AccessID and password, and approve in Microsoft Authenticator.',
        'Scan the second square code and install Google Authenticator.',
        "Scan the third square code: it opens the grid's own instructions. On the grid's website choose Interactive Apps, then 2FA Setup, and press Launch. Once it is running, tap Launch 2FA Setup.",
        "If the page shows a setup key under its square code, tap + in Google Authenticator, then Enter a setup key, and type it (your phone can't scan its own screen).",
        'Turn GlobalProtect off on your phone, and come back here.',
      ],
      qr: {
        globalprotect: 'GlobalProtect app',
        authenticator: 'Google Authenticator',
        gridCode: "The grid's code instructions",
        iphone: 'iPhone',
        android: 'Android',
      },
      /** the 2FA Setup notice, wherever a step could lead a student to run it twice */
      warning: "Already have a grid code? Don't run 2FA Setup: it replaces your code, and the old one stops working.",
      done: "I've set up my code",
      back: 'Back',
      openSite: "Open the grid's website",
    },

    /** moment "enrolled": the key works */
    enrolled: {
      title: 'This computer is set up.',
      body: 'From now on Beethoven reaches the grid directly, with no VPN. It asks for your password and code again only when Claude needs signing in again, or if you sign in from another computer.',
      continue: 'Continue',
    },

    /** moment "protect-key-optional": offered once after the key works, and always in Settings; off by default */
    protectKey: {
      title: 'Protect the key on this computer?',
      body: 'Optional. Turned on, Beethoven asks for your fingerprint, face or PIN once each time you open the browser. Left off, it connects without asking.',
      on: 'Turn on',
      notNow: 'Not now',
      turningOn: 'Waiting for Windows Hello or Touch ID…',
      turnedOn: 'Protected.',
      /** the card's title once it is on */
      titleOn: 'The key is protected.',
      cancelled: 'Not turned on. You can turn it on in Settings any time.',
      /** Settings: turning it off needs the same passkey once; it did not answer */
      notOff: 'Still protected: Windows Hello or Touch ID did not open the key. Try again.',
      unsupported: "This browser can't protect the key with Windows Hello or Touch ID. It works without it.",
    },

    /** moment "fallback-to-vpn": the student chose GlobalProtect, or no direct way works on this computer */
    fallback: {
      title: (app: string) => `Using ${app}`,
      body: (app: string) => `Turn ${app} on, then press Continue: the grid's own sign-in box opens. You can come back to the direct way here or in Settings.`,
      tryDirect: 'Try the direct way again',
      continue: 'Continue',
    },

    /** Settings, "Connection" */
    settings: {
      title: 'Connection',
      modeLabel: 'Connection',
      modes: { direct: 'Direct when possible', vpn: 'GlobalProtect only' },
      protectKey: 'Protect my key with Windows Hello / Touch ID',
      protectKeyNote: 'Off by default. Turned on, Beethoven asks for your fingerprint, face or PIN once each browser session.',
      /** Settings only, under the switch: turning it on later leaves an older copy in the browser's files for a while */
      protectLaterNote: "Turned on after setup, an older unprotected copy of the key can stay in this browser's files for a while. For the strongest protection, tick it when you first sign in.",
      forget: 'Forget this computer',
      forgetNote: "Removes this computer's key from Beethoven and from your grid account. The next direct sign-in asks for your password and code again.",
      forgetConfirm: 'Forget this computer?',
      forgetButton: 'Forget',
      forgotten: 'This computer is forgotten.',
      /** Forget when the grid could not be told (the key locked, or the grid not reached): the line goes at the next sign-in */
      forgottenHere: "Forgotten on this computer. The grid wasn't told, so its line for this key stays until your next sign-in from here replaces it.",
      /** Forget while the protected key is locked: the page unlocks it in the click so the grid's line goes too */
      forgetLocked: 'Unlock first, so the grid forgets the key too.',
      helper: 'Helper',
      helperInstalled: (version: string) => `Installed · version ${version}`,
      helperMissing: 'Not installed',
      keyNone: 'No key on this computer yet',
      keyPlain: 'Key on this computer',
      keyProtected: 'Key on this computer, protected',
    },
  },

  /** Details for your lab lead (exempt from the hygiene test) */
  details: {
    title: 'Details for your lab lead',
    done: 'Done',
    runChecks: 'Run the checks',
    copyReport: 'Copy report',
    running: 'Running the checks…',
    probe: 'Check a compute node',
    /** 11.0.0 review: the background's own scheduler question has a clock of its own, apart from the presses */
    footer: "Reads the worker's files every 5 seconds while it starts and once a minute after; asks the scheduler for its place in line at most once a minute, and starts or stops it, at most once a minute, only when you press.",
    onlineLag: 'Online is read from Claude Code\'s registration line and a heartbeat under 90 s old; it can lag a network loss on Anthropic\'s side by up to about 10 minutes.',
    loginSetupUnproven: "The one-time grid key step (AM2) has not yet been tried on the grid by a student without a key: it is unproven there.",
    /** 12.0.0 */
    directUnproven: 'The direct way (ssh to the login node through a bridge, a browser key restricted to the gate) has not yet been tried on the grid with a key: it is unproven there.',
  },

  /** Settings */
  settings: {
    title: 'Settings',
    worker: 'Your worker',
    modes: { default: 'Ask before each command', acceptEdits: 'Accept edits', plan: 'Plan only' },
    keepRunning: 'Keep my worker running',
    openClaude: 'Open Claude when my worker is ready',
    appearance: 'Appearance',
    appearances: { cream: 'Cream', system: 'Match system' },
    grid: 'Your grid',
    change: 'Change',
    disconnect: 'Disconnect',
    agreement: 'The agreement',
    acceptedOn: (date: string) => `Accepted on ${date}`,
    /** LICENSE 19(a): a notice of a dispute names this id, so it is shown with the acceptance record */
    installId: 'Installation ID',
    saveRecord: 'Save your acceptance record',
    showTerms: 'Show terms',
    saveCopy: 'Save a copy',
    print: 'Print',
    activity: 'Activity',
    show: 'Show',
    export: 'Export',
    clear: 'Clear',
    drive: 'Google Drive in Claude (optional)',
    labLead: 'For your lab lead',
  },
} as const;

/**
 * Show log's words for Beethoven's own events (keys.ts ActivityEntry.text is one of these) and for
 * the worker's progress.log lines (contract.ts ProgressKind), merged oldest first. When the same
 * sentence comes from both within 90 s, the worker's line is kept and Beethoven's dropped.
 */
export const LOG_WORDS = {
  gridSignedIn: (account: string) => `Signed in to the grid as ${account}`,
  approved: 'Approved',
  ready: 'Your grid account is ready',
  asked: 'Asked the grid for a computer',
  claudeSignedIn: (plan: string) => `Signed in to Claude · ${plan}`,
  /** by reason class (decision D25) */
  inLine: { line: 'In line: the grid is busy', share: 'In line: waiting for your share of the grid', maintenance: 'In line: the grid is under maintenance' } satisfies Record<ReasonClass, string>,
  gotComputer: 'Got a computer',
  connecting: 'Connecting to Claude',
  online: (title: string) => `Online · ${title}`,
  waitingSignin: 'Waiting for your Claude sign-in',
  reconnecting: 'Reconnecting',
  renewing: 'Renewing',
  ended: 'Ended',
  stopped: 'Stopped',
  signinAbandoned: 'Stopped: waiting for your Claude sign-in timed out',
  error: "Couldn't start",
  keyStepDone: "Done. You won't need this again.",
  /** 12.0.0 */
  directSignedIn: (account: string) => `Signed in to the grid directly as ${account}`,
  computerSetUp: 'This computer is set up for the grid',
  keyProtected: 'Key protected with Windows Hello / Touch ID',
  keyUnprotected: 'Key protection turned off',
  computerForgotten: 'This computer was forgotten',
  usingVpn: (app: string) => `Using ${app}`,
} as const;

// ---- shared pieces ---------------------------------------------------------------------------------

/** a running clock the page ticks every second from `since` (ISO); the digits change without animation */
export interface Timer {
  /** ISO-8601: status.json submitted_at for the queue, got_computer_at for "Got a computer" */
  since: string;
}

/** the 22 px orb: online (teal, breathing), waiting (ochre arc), starting (teal arc), needs (still ochre), error (still brick), stopped (hollow) */
export type Orb = 'online' | 'waiting' | 'starting' | 'needs' | 'error' | 'stopped';

/** one node of the four-node track "Asked · In line · Starting · Online" */
export interface TrackNode {
  label: (typeof WORDS.track)[number];
  /** "failed": where the wait ended in a problem (brick, still) */
  state: 'done' | 'current' | 'future' | 'failed';
}

/** always four nodes, in order */
export type TrackView = [TrackNode, TrackNode, TrackNode, TrackNode];

/** a button the page draws; `action` is what it sends (undefined for a page-local control) */
export interface ButtonView {
  label: string;
  /** "teal": opens Claude; "ink": an action; "outline": a 40 px secondary; "text": a soft text button; "link": inline */
  tone: 'teal' | 'ink' | 'outline' | 'text' | 'link';
  action?: Action;
  disabled?: boolean;
  /** a spinner in place of the label while the press is carried out */
  busy?: boolean;
}

/** a problem that changes a moment's title and body (spec: "the title and body change") */
export interface ProblemView {
  /** absent: the moment's own title stays; present in a waiting moment: the wait has ended, and this replaces its headline and timer */
  title?: string;
  /** may be empty when the title says it all */
  body: string;
  button?: ButtonView;
}

/** a checklist row: 16 px circle, empty ring (next), turning ring (now), teal disc with a drawn check (done) */
export interface ChecklistRow {
  text: string;
  state: 'next' | 'now' | 'done';
}

// ---- the panel -------------------------------------------------------------------------------------

/** the panel is either the first-run journey, the home, or the note that the agreement is not accepted yet */
export type PanelView = { kind: 'terms-needed'; body: string; button: ButtonView } | { kind: 'journey'; journey: JourneyView; overlays: Overlays } | { kind: 'home'; home: HomeView; overlays: Overlays };

/** what may sit over either: the tour, a one-time toast, the Details sheet's open state */
export interface Overlays {
  /** the tour plays below the moment (moment 10) or full panel from ⋯; undefined: not shown */
  tour?: TourView;
  /** the toolbar's badge, title and icon as the background has set them (pages may mirror) */
  toolbar: ToolbarView;
  /** the panel says "Working on the grid…" in tab mode while a background tab carries an action */
  workingInTab?: boolean;
  /** a toast the core asks for once, on any panel view ("Signed in as alex@wayne.edu · Max" when no Claude moment was shown) */
  toast?: string;
}

/** the journey's moments, in order. "login-setup" (AM2) appears only when the shell asked for a password while a press waits. */
export type Moment = 'welcome' | 'globalprotect' | 'grid' | 'statement' | 'connect' | 'claude' | 'login-setup' | 'queue' | 'starting' | 'online' | DirectMoment;

/**
 * 12.0.0: the direct way's moments (docs/V12_CONTRACT.md). They come where the 11.0.0 GlobalProtect and
 * grid sign-in moments came, while the direct way is being set up or needs the student; once the key
 * works, the 11.0.0 moments from the statement on run unchanged.
 */
export type DirectMoment = 'choose-route' | 'install-helper' | 'sign-in-sheet' | 'code-setup' | 'enrolled' | 'fallback-to-vpn' | 'protect-key-optional';

/** one moment of the first run (or of a later run that needs the student: grid sign-in, Claude sign-in, the key step) */
export type JourneyView =
  | WelcomeMoment
  | GlobalProtectMoment
  | GridMoment
  | StatementMoment
  | ConnectMoment
  | ClaudeMoment
  | LoginSetupMoment
  | QueueMoment
  | StartingMoment
  | OnlineMoment
  | ChooseRouteMoment
  | InstallHelperMoment
  | SignInSheetMoment
  | CodeSetupMoment
  | EnrolledMoment
  | FallbackMoment
  | ProtectKeyMoment;

/**
 * The panel while the welcome page carries the first moment: "Almost there." while Chrome's box is up
 * after the press (waiting), after a Deny (denied), with nothing pressed yet (finish), or after the first
 * run when Chrome's grant of the portal was taken away (revoked: the page asks Chrome for `origin` inside
 * the click on "Allow again", then sends use-portal). Never the refusal sentence during the welcome.
 */
export interface WelcomeMoment {
  moment: 'welcome';
  state: 'waiting' | 'denied' | 'finish' | 'revoked';
  title: string;
  body: string;
  /** "Waiting for Chrome…" with a turning arc (waiting) */
  status?: string;
  button?: ButtonView;
  /** revoked: the portal's origin, asked for again inside the click */
  origin?: string;
}

/** moment 4: only when the grid does not answer; advances by itself (a check every 3 s while a page is open) */
export interface GlobalProtectMoment {
  moment: 'globalprotect';
  /** "Turn on GlobalProtect." */
  title: string;
  /** "Open GlobalProtect and connect to protect.wayne.edu. Then approve the sign-in on your phone." */
  body: string;
  /** the mono chip, "protect.wayne.edu", with "Copy" (toast "Copied."; page-local) */
  chip?: string;
  /** "Looking for the grid…" with a turning arc; after 45 s "Still looking. Check that GlobalProtect says Connected."; "Connected." with a drawn check, held 700 ms */
  status: { state: 'looking' | 'still' | 'connected'; text: string };
}

/** moment 5: Chrome's own sign-in box in the tab; advances by itself */
export interface GridMoment {
  moment: 'grid';
  /** "Sign in to the grid" */
  title: string;
  /** "Use your AccessID and password in the box Chrome shows. Beethoven never sees them." */
  body: string;
  /** "Signed in as st1234." with a drawn check, when it happened */
  signedIn?: string;
  /** cancelled / tab closed [Sign in again]; the start page; unreachable [Try again]; not OnDemand [Use another portal] */
  problem?: ProblemView;
}

/** moment 6: shown the moment the student is signed in, while approval and setup finish underneath */
export interface StatementMoment {
  moment: 'statement';
  /** "Where your work goes" (or a problem's title) */
  title: string;
  /** disclosure.ts SHORT_STATEMENT: the four lines */
  lines: string[];
  /** "More about your data ›": the seven sentences (disclosure.ts PLAN_CLASS_DISCLOSURE), "Worker name: worker" [Change], "Mark this workspace restricted" */
  more: { sentences: string[]; workerName: string; change: ButtonView; markRestricted: ButtonView };
  /** disclosure.ts STATEMENT_TICK: "I'll keep FERPA, IRB, health and export-controlled data out of my worker, and turn on Remote Control for it." Unticked until the student ticks it (page-local until Connect). */
  tick: string;
  /** "Connect" (ink), disabled until ticked; "Connecting when ready…" once pressed early (busy) */
  connect: ButtonView;
  /** "Signed in as st1234" / "Approved" / "Your grid account is ready", ticking themselves */
  checklist: [ChecklistRow, ChecklistRow, ChecklistRow];
  /** not approved, other computer, other AccessID, withdrawn, approval unreachable, no shared copy, restricted */
  problem?: ProblemView;
}

/** moment 7: the connect line is in flight */
export interface ConnectMoment {
  moment: 'connect';
  /** "Asking the grid for a computer…" */
  hero: string;
  track: TrackView;
  /** "Getting your Claude sign-in ready…", after 2 min "The grid is busy. Still finding a computer for the sign-in…" */
  sub: string;
  /** refused ("The grid didn't take the request." + one plain reason) [Try again]; no sign-in computer in 10 min [Try again] */
  problem?: ProblemView;
}

/** moment 8: Anthropic's page in its own tab, the panel beside it */
export interface ClaudeMoment {
  moment: 'claude';
  /** "Sign in to Claude" */
  title: string;
  /** "Approve in the Claude tab, then paste the code here." */
  body: string;
  /** the code box: 48 px, Plex Mono 15, focused on arrival; submits on paste and on Enter; "Continue" only when typed by hand (page-local) */
  box: { placeholder: string; focus: boolean; checking: boolean; continueLabel: string };
  /** "Open the Claude tab again" */
  reopen: ButtonView;
  /** "Your worker is already in line · 1:12" (teal dot), once the worker is queued */
  inLine?: Timer;
  /** "Signed in as alex@wayne.edu · Max", with a drawn check, for 3 s */
  signedIn?: string;
  /** bad code; timed out [Sign in again]; tab closed [Open it again]; no Pro or Max [Use another account] */
  problem?: ProblemView;
}

/**
 * AM2: the one-time key step. Shown only when the grid's terminal asked for a password while a press
 * waits. The student's only act is typing their grid password into the university's own terminal page.
 * Beethoven listens to no keystrokes there, reads only the page title, and stores nothing about the key.
 * UNPROVEN ON THE GRID until a student without a key has tried it.
 */
export interface LoginSetupMoment {
  moment: 'login-setup';
  /**
   * offer: "One more thing, once." / "Type your grid password in the grid's own terminal. Beethoven never sees it." [Open the grid terminal]
   * password: "Type your password in the terminal, then press Enter." [I'm in]
   * checking: Beethoven typed the line and re-tests every 2 s ("Checking…")
   * done: "Done. You won't need this again." with the drawn check, then the waiting press carries on
   * paste: after 10 s of failed tests, "Paste, then press Enter." (the line is on the clipboard) and the fold
   * closed: the terminal tab was closed first: "Not done yet." [Open the grid terminal]
   */
  phase: 'offer' | 'password' | 'checking' | 'done' | 'paste' | 'closed';
  title: string;
  body: string;
  button?: ButtonView;
  /**
   * The one line (contract.ts commands.loginSetup): the page writes it to the clipboard inside the
   * click on "Open the grid terminal" (the click's user activation; the background never touches the
   * clipboard), and shows it in the fold.
   */
  line: string;
  /** "What does the line do?": the line and "It makes a key in your grid account that only the grid's own website can use, so it stops asking." (paste phase only) */
  fold?: { label: string; line: string; explain: string };
}

/** moment 9: in line; the tour (moment 10) plays below once */
export interface QueueMoment {
  moment: 'queue';
  /** "In line for a computer", or by reason class "Waiting for your share of the grid" / "The grid is under maintenance" */
  hero: string;
  /** the large timer, from status.json submitted_at; absent when the wait has ended in a problem */
  timer?: Timer;
  /** "It starts as soon as one is free. You can close this panel." (or the class's sentence), then "Expected around 9:12." or "Last time: 6 min.", and past 15 min "The grid is busy today. Your worker is still in line." */
  sub: string[];
  reason: ReasonClass;
  track: TrackView;
  /** "Your worker couldn't start." [Try again]; "Can't reach the grid. Is GlobalProtect on? Your worker keeps its place in line." */
  problem?: ProblemView;
}

/** moment 11 */
export interface StartingMoment {
  moment: 'starting';
  /** "Starting" */
  hero: string;
  /** "Got a computer. Connecting to Claude…" with the timer from got_computer_at, or "Connecting to Claude…" */
  sub: string;
  timer?: Timer;
  track: TrackView;
  /** after 3 min with no registration: "Still connecting. This is taking longer than usual." [Show log]; needs sign-in: "Sign in to Claude to finish." [Sign in to Claude]; "Reconnecting…" */
  problem?: ProblemView;
}

/** moment 12: then the view settles into the home after 4 s */
export interface OnlineMoment {
  moment: 'online';
  /** "You're online." */
  hero: string;
  /** "Ready in Claude, 7 min after you asked. Look for Wayne State grid." or the bad-link sentence */
  sub: string;
  /** "Open my session" (teal) */
  primary: ButtonView;
  track: TrackView;
  /** play the 600 ms ring burst once */
  burst: boolean;
  /** "Keep Beethoven one click away: the puzzle icon, then the pin." → "Pinned." */
  pinTip?: { text: string; done: boolean };
}

// ---- 12.0.0: the direct way's moments --------------------------------------------------------------

/** the operating systems the bundled helper is offered for */
export type HelperOs = 'windows' | 'mac' | 'linux';

/**
 * The public pages the square codes open (each drawn on the device with its address printed under it;
 * nothing is fetched). The university's pages are Wayne State's own knowledge-base articles (a site
 * profile may name others: vpn_help_url, grid_code_help_url); the app stores' are Google
 * Authenticator's own listings.
 */
export const DIRECT_LINKS = {
  /** Wayne State KB 20314: the VPN and the GlobalProtect client, with the phone apps */
  globalProtect: 'https://services.wayne.edu/TDClient/277/Portal/KB/Article/20314/Wayne-State-VPN-and-the-Global-Protect-client',
  /** Wayne State KB 20242: Google Authenticator for the grid (Greg's link) */
  gridCode: 'https://services.wayne.edu/TDClient/277/Portal/KB/Article/20242/How-do-I-set-up-and-use-Google-Authenticator-for-the-Grid',
  /** Google Authenticator in Apple's App Store */
  authenticatorIos: 'https://apps.apple.com/app/google-authenticator/id388497605',
  /** Google Authenticator in Google Play */
  authenticatorAndroid: 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2',
  /** GlobalProtect (Palo Alto Networks) in Apple's App Store: the phone route's first code (KB 20314 covers computers only) */
  globalProtectIos: 'https://apps.apple.com/app/globalprotect/id1400555706',
  /** GlobalProtect in Google Play */
  globalProtectAndroid: 'https://play.google.com/store/apps/details?id=com.paloaltonetworks.globalprotect',
} as const;

/**
 * The bundled helper's file for this computer, from public/bridge/manifest.json (core/bridge.ts
 * helperDownloadFor). The page offers it as an <a download> of the packaged file: nothing comes from
 * the website. `url` is the extension's own address of the file (chrome-extension://<id>/bridge/<file>).
 */
export interface HelperDownload {
  os: HelperOs;
  /** "Windows", "macOS", "Linux" */
  osLabel: string;
  url: string;
  /** the file name the browser saves */
  file: string;
  /** the installer inside it, when the file is a zip ("install.cmd", "install.command", "install.sh") */
  open?: string;
  /** "3 KB" (absent when the manifest gives no size) */
  size?: string;
  bytes?: number;
  /** hex, for the student who checks (Details shows it too) */
  sha256?: string;
  /** "script" (a script every operating system already runs) or "binary" (a compiled variant, later) */
  kind?: 'script' | 'binary';
  /** the helper version this file installs */
  version?: string;
}

/** moment "install-helper": no bridge is available; the bundled helper is offered, with GlobalProtect beside it */
export interface InstallHelperMoment {
  moment: 'install-helper';
  /** "One small download, once" */
  title: string;
  body: string;
  /** absent when the manifest has no file for this computer (then only "Use GlobalProtect instead") */
  download?: HelperDownload & { label: string; fileLine: string };
  /** the three steps for this operating system */
  steps: string[];
  /** under the steps for this system (Windows: Smart App Control's Unblock) */
  osNote?: string;
  unsignedNote: string;
  /** the probe: waiting (Beethoven looks by itself after the download), looking (the student's Check again), found (drawn check, held a moment, then the sign-in sheet), not-found, broken */
  status: { state: 'idle' | 'waiting' | 'looking' | 'found' | 'not-found' | 'broken'; text?: string };
  /** "Check again": re-probes the bridges */
  checkAgain: ButtonView;
  /** "Use GlobalProtect instead" */
  useVpn: ButtonView;
}

/** one prompt of the grid's, exactly as it arrived (keyboard-interactive): the sheet never invents one */
export interface SheetPrompt {
  /** the grid's own words, verbatim ("Password: ", "Your google authenticator one-time verification code: ") */
  text: string;
  /** the grid says whether the answer may be shown as it is typed (false: a password field) */
  echo: boolean;
  /** Beethoven's reading of it, for the field's type and the hint only: a password, the 6-digit code, or something else */
  kind: 'password' | 'code' | 'other';
  /** "The 6-digit code from Google Authenticator." beside a code prompt */
  hint?: string;
}

/**
 * moment "sign-in-sheet": Beethoven's own sign-in sheet (an extension page, never a web page). The
 * AccessID first; then each set of the grid's prompts as it arrives, answered in one press. The
 * answers go to the background in one action, then into the encrypted session after the grid's
 * identity matched the pin, and are never stored, logged or offered to be remembered.
 */
export interface SignInSheetMoment {
  moment: 'sign-in-sheet';
  /**
   * account: the AccessID field (prefilled when this browser knows the account)
   * connecting: the bridge is opening the connection and checking the grid's identity
   * prompt: the grid's prompts are up (`prompts`)
   * working: answers sent, the grid is deciding ("Signing in…"), or the key is being added, set up, checked
   * stopped: three refusals ("That didn't work three times.") [Try again] [Use GlobalProtect instead]
   * failed: the grid's identity did not match, the grid could not be reached, or the connection ended
   * unlock: the key is protected and locked this browser session: [Unlock] (page-local: keyring.unlockKey, then the action unlock-key)
   * code-refused: the grid's "wrong code, or no 2FA set up" refusal: [Type the code again] [I don't have a grid code yet]
   */
  phase: 'account' | 'connecting' | 'prompt' | 'working' | 'stopped' | 'failed' | 'unlock' | 'code-refused';
  title: string;
  /** the AccessID field */
  account: { label: string; placeholder: string; value?: string; error?: string };
  /** the grid's banner or instruction above its prompts, verbatim, when it sent one */
  instruction?: string;
  prompts?: SheetPrompt[];
  /** "Not accepted. Try again." after a refusal the grid follows with new prompts */
  notice?: string;
  /** "Signing in…", "Setting up this computer…", "Checking the new key…", "Getting your Claude sign-in ready…" */
  status?: string;
  /** the always-present line about where the answers go */
  privacy: string;
  /** "Continue": sends grid-signin-account (account phase) or grid-signin-answer (prompt phase) */
  submit: ButtonView;
  cancel: ButtonView;
  useVpn?: ButtonView;
  problem?: ProblemView;
  /** a second way on under the problem: "I don't have a grid code yet" (code-refused), "Can't unlock? Forget this computer…" (unlock) */
  secondary?: ButtonView;
  /** the opt-in, before the first sign-in: "Protect my key with Windows Hello / Touch ID", unticked by default (page-local until the press; keyring.createProtectedKey runs in the click) */
  protect?: { label: string; note: string; available: boolean };
  /** what this sign-in is for: setting this computer up (enrol), or a Claude sign-in through the grid (claude) */
  purpose: 'enrol' | 'claude';
}

/** one square code the page draws (src/ui/qr.ts), with its link printed under it */
export interface QrLink {
  id: 'globalprotect-ios' | 'globalprotect-android' | 'authenticator-ios' | 'authenticator-android' | 'grid-code' | 'grid-site';
  label: string;
  url: string;
}

/** moment "choose-route": the grid refused because the account has no Google Authenticator code yet */
export interface ChooseRouteMoment {
  moment: 'choose-route';
  title: string;
  body: string;
  options: Array<{ id: 'laptop' | 'phone'; title: string; detail: string; button: ButtonView }>;
  useVpn: ButtonView;
  /** the 2FA Setup notice */
  warning: string;
}

/** moment "code-setup": the steps of the chosen route; the phone route carries the square codes */
export interface CodeSetupMoment {
  moment: 'code-setup';
  route: 'laptop' | 'phone';
  title: string;
  steps: string[];
  /** phone route: GlobalProtect (iPhone, Android), Google Authenticator (iPhone, Android), the grid's own instructions (KB 20242); laptop route: the grid's own instructions and the grid's website */
  qr: QrLink[];
  /** the 2FA Setup notice, shown with the step that could lead to it */
  warning: string;
  /** "I've set up my code": back to the sign-in sheet */
  done: ButtonView;
  back: ButtonView;
  useVpn: ButtonView;
}

/** moment "enrolled": the key works ("This computer is set up."), held a moment, or until Continue */
export interface EnrolledMoment {
  moment: 'enrolled';
  title: string;
  body: string;
  /** the account the grid confirmed */
  account?: string;
  continue: ButtonView;
}

/** moment "protect-key-optional": once, after enrolment; Settings carries the same switch for always */
export interface ProtectKeyMoment {
  moment: 'protect-key-optional';
  title: string;
  body: string;
  /** "Turn on": page-local (keyring.protectKey inside the click: WebAuthn needs the page), then the page sends protect-key */
  on: { label: string; busyLabel: string; available: boolean };
  /** "Not now": protect-key-later */
  notNow: ButtonView;
  /** after the press: "Protected." or "Not turned on. …" or the unsupported sentence */
  outcome?: string;
}

/** moment "fallback-to-vpn": the direct way is not used; the 11.0.0 moments follow unchanged */
export interface FallbackMoment {
  moment: 'fallback-to-vpn';
  title: string;
  body: string;
  /** "Continue": carries on into the GlobalProtect moments */
  continue: ButtonView;
  /** "Try the direct way again" */
  tryDirect: ButtonView;
}

// ---- the home --------------------------------------------------------------------------------------

/**
 * The hero states of the "Waiting and status" table. The core picks one; the page draws the orb, the
 * word and the subline. "signed-out" and "unreachable" are overlays on the last known state (HeroView.asOf).
 */
export type HeroState =
  | 'asked'
  | 'queued'
  | 'queued-share'
  | 'queued-maintenance'
  | 'got-computer'
  | 'connecting'
  | 'slow'
  | 'reconnecting'
  | 'needs-claude'
  | 'needs-consent'
  | 'online-new'
  | 'online'
  | 'renewing'
  | 'stopping'
  | 'stopped'
  | 'error'
  | 'unreachable'
  | 'unknown';

export interface HeroView {
  state: HeroState;
  orb: Orb;
  /** Newsreader 32: "Online", "In line for a computer", "Starting", "You're online." … */
  word: string;
  /** one subline; for the queue the timer is drawn in it ("3:12 · It starts as soon as one is free.") */
  sub?: string;
  /** a running clock: drawn large in moments, inline in the home's subline */
  timer?: Timer;
  /**
   * Where the inline clock goes in the home's subline, joined with " · ": "before" for the queue
   * ("3:12 · It starts as soon as one is free."), "after" for a computer just got ("Got a computer.
   * Connecting to Claude… · 0:20"). Set whenever `timer` is.
   */
  timerPlace?: 'before' | 'after';
  /** "As of 9:02 AM. Sign in to the grid to see it live." when the live check is not possible */
  asOf?: string;
  /** play the 600 ms ring burst once (going online) */
  burst?: boolean;
  /** aria-live announces `word` only when this changes, never a tick */
  announce: string;
}

/** the one primary, always in the same place, 48 px, full width; none while asked, in line, starting or renewing */
export type HomePrimary =
  /** "Open my session" (teal), when online or last seen online; never needs the grid */
  | { kind: 'open-session'; button: ButtonView }
  /** "Connect" (ink), when stopped or never started, with "Your worker's files and output go to Anthropic. Keep restricted data out." beside it */
  | { kind: 'connect'; button: ButtonView; reminder: string }
  /** "Sign in to Claude" (ink), when the worker needs it (moment 8 follows) */
  | { kind: 'sign-in-claude'; button: ButtonView }
  /** "Try again" (ink), after an error */
  | { kind: 'retry'; button: ButtonView };

/** the three status rows; a coloured dot always has a word beside it */
export interface StatusRows {
  /** "Signed in as st1234" / "Signed out · Sign in" (link) / "Can't reach · Is GlobalProtect on?" / "Checking…" */
  grid: {
    state: 'signed-in' | 'signed-out' | 'unreachable' | 'checking';
    text: string;
    link?: ButtonView;
    /**
     * 12.0.0: how the grid is reached: "Direct" (ssh through a bridge) or "Through GlobalProtect" (the
     * portal, 11.0.0). `locked`: the protected key waits for Windows Hello / Touch ID ("Locked · Unlock";
     * the Unlock link is page-local: keyring.unlockKey in the click, then the action unlock-key).
     */
    via?: { mode: 'direct' | 'vpn'; text: string; locked?: { text: string; unlock: string } };
  };
  /** "Signed in · Max" / "Needs sign-in · Sign in" (link) / "—"; from status.json claude_login no older than 5 minutes */
  claude: { state: 'signed-in' | 'needs' | 'unknown'; text: string; link?: ButtonView };
  /** "Online · checked 20 s ago" / "In line · 3 min" / "Asking…" / "Starting" / "Renewing" / "Stopped" / "Needs you" / "Couldn't start" / "As of 9:02 · online" */
  worker: { state: KnownState | 'as-of'; text: string };
}

/** the small row under the card */
export interface FootRow {
  /** "Renews itself at 4:50 PM" (status.json ends_at, chain on) or "Asked at 8:44 AM" while in line */
  left?: string;
  /** "Stop" when online or starting, "Cancel" when in line: a soft text button that turns brick on hover; both run worker stop after the confirm row */
  right?: ButtonView;
  /** the confirm row: "Stop your worker? Open sessions end." [Stop] [Keep it] (page-local until Stop is pressed) */
  confirm: { text: string; stop: ButtonView; keep: string };
  /** "Stopping…" until the job is gone */
  stopping: boolean;
}

export interface HomeView {
  /** "Beethoven" and the "⋯" menu (aria-label "More") */
  header: { wordmark: string; moreLabel: string; menu: Array<{ label: string; action: Action }> };
  hero: HeroView;
  /** shown in the waiting states, as in the table */
  track?: TrackView;
  primary?: HomePrimary;
  /** online only: "New session", "Copy link", "Phone" */
  secondary?: { newSession: ButtonView; copyLink: string; phone: string };
  /** the environment link (Copy link and Phone are page-local, from this): https://claude.ai/code?environment=env_… */
  link?: string;
  /** the session title, "Wayne State grid" */
  title: string;
  rows: StatusRows;
  foot: FootRow;
  /** online only, for the first 3 days or until dismissed with its × */
  tryAsking?: { eyebrow: string; prompts: readonly string[]; copied: string; dismiss: Action };
  /** the pin tip; "See what it can do · 16 s" on the first online home if the tour never played */
  cards: Array<{ id: 'pin-tip' | 'tour-card'; text: string; done?: boolean; open?: Action; dismiss: Action }>;
  /** Show log: closed every time the panel opens (page-local); the lines arrive when it is opened */
  log: { show: string; hide: string; copy: string; lines?: LogLine[] };
  /** a toast the core asks for once ("Start a new session there. It runs on your worker.") */
  toast?: string;
}

/** one Show log line: "8:44 Signed in to the grid as st1234" */
export interface LogLine {
  /** ISO-8601 */
  at: string;
  /** "8:44": the browser's local clock, no seconds */
  clock: string;
  text: string;
  source: 'beethoven' | 'worker';
}

/** the toolbar button (no permission needed): badge, tooltip, and the lit icon when online */
export interface ToolbarView {
  /** "…" ochre (asked, starting, renewing, reconnecting), "3m" ochre (in line), "!" ochre (needs you), "!" brick (error); none when online or stopped */
  badge?: { text: string; color: 'ochre' | 'brick' };
  /** "Beethoven · Online for 2 h 14 min", "Beethoven · In line for 3 min" … */
  title: string;
  /** action.setIcon with public/icon/on-*.png */
  lit: boolean;
}

/** colours of the badge (the page's tokens; the background passes the hex to action.setBadgeBackgroundColor) */
export const BADGE_COLORS = { ochre: '#8F4E17', brick: '#A23B26' } as const;

/** the tour: 16 s, four scenes over the site's tall diagram; then "Try asking" */
export interface TourView {
  /** "auto": the once-only play during the first wait; "menu": from ⋯ > "See what it can do" */
  source: 'auto' | 'menu';
  captions: readonly string[];
  /** ms per scene */
  sceneMs: 4000;
  /** the diagram's bundled files (public/tour/diagram.js and diagram.css); if they fail to load, the tour is skipped silently */
  assets: { script: string; style: string };
  /** after scene 4: "Try asking" with the three prompts and Copy, and "Done" */
  prompts: readonly string[];
}

// ---- the welcome page ------------------------------------------------------------------------------

export interface WelcomeView {
  headline: string;
  subline: string;
  needsTitle: string;
  /** the three requirements in Greg's order, each with its help link (the site profile's grid_account_help_url, vpn_help_url; claude.ai/upgrade) */
  needs: Array<{ title: string; detail: string; link: { label: string; url: string } }>;
  summaryTitle: string;
  /** terms.ts SUMMARY: the four lines, verbatim */
  summary: string[];
  /**
   * The tick(s). Shipping (TWO_TICKS false in terms.ts): one, bold first line and soft second line in
   * one label: "**I've read and agree to the Beethoven terms and privacy statement, and I'm 18 or
   * older.** That includes giving up a jury trial and class actions, and accepting the risks above."
   * The two-tick variant adds a second, separate box.
   */
  ticks: Array<{ id: 'agree' | 'specific'; bold: string; soft?: string }>;
  /** "Show terms" / "Hide terms": expands LICENSE.txt then PRIVACY.md in a 360 px region; never required */
  terms: { show: string; hide: string; licenseUrl: string; privacyUrl: string; links: { openInTab: string; save: string; print: string } };
  /** "Agree and continue": disabled until every tick is ticked; inside the one click the page calls sidePanel.open and permissions.request before any await */
  agree: { label: string; busyLabel: string };
  /** "Chrome will ask to let Beethoven reach ondemand.grid.wayne.edu. Choose Allow." */
  allowNote: string;
  footer: { nothingLeaves: string; otherPortal: string };
  /** the portal the press asks Chrome for: the profile's ood_base_url, or the one typed under "Use another portal" */
  portal: { origin: string; hostname: string; fieldLabel: string; usePortal: string };
  /** the page's state after a press */
  state: 'idle' | 'opening' | 'denied' | 'no-panel' | 'save-failed' | 'handoff';
  /** "Beethoven needs ondemand.grid.wayne.edu to work." [Try again]; "Open Beethoven from the toolbar: …"; "Couldn't save your agreement in this browser. Try again."; "That's a Claude address, not your grid." */
  problem?: string;
  /** "You're set. Beethoven carries on in the panel →", with a live mirror of the panel's hero */
  handoff?: { text: string; hero?: HeroView };
}

// ---- Details and Settings --------------------------------------------------------------------------

/** Details for your lab lead: a sheet from the right with "Done". Internal words are allowed here. */
export interface DetailsView {
  title: string;
  checks: { running: boolean; runningText: string; run: ButtonView; copy: ButtonView; items: Array<{ id: string; title: string; ok: boolean; warn?: boolean; skip?: boolean; detail: string }> };
  run?: {
    job?: string;
    nextJob?: string;
    partition?: string;
    qos?: string;
    node?: string;
    schedulerState?: string;
    reason?: string;
    expectedStart?: string;
    checkedAt?: string;
    submittedAt?: string;
    gotComputerAt?: string;
    onlineAt?: string;
    heartbeatAgeS?: number;
    restarts?: Array<{ at?: string; lastRcLine?: string }>;
    chainNote?: string;
    consentSource?: string;
    plan?: string;
  };
  /** the last 20 lines of progress.log, raw */
  progressTail: string[];
  rcTail?: string;
  audit: string[];
  shellHost: string;
  siteProfile: string;
  channel: 'direct' | 'tab' | 'unknown';
  /** AM2: "unproven on the grid" while contract.ts LOGIN_SETUP_PROVEN is false */
  loginSetup: { proven: boolean; text: string };
  probe: ButtonView;
  /** "Reads the worker's files every 5 seconds while it starts and once a minute after; asks the scheduler at most once a minute." */
  footer: string;
  onlineLag: string;
  /** 12.0.0: the direct way, for the lab lead (internal words allowed); filled by the background */
  direct?: DirectDetails;
}

/** 12.0.0: Details' direct-way section */
export interface DirectDetails {
  /** "direct" or "vpn", and why */
  mode: string;
  /** each bridge in D3's order: "store: not available", "relay: not configured", "helper: available (1, script, windows)" */
  bridges: string[];
  /** the grid's host key pin (SHA256:…) and its host:port */
  pin: string;
  host: string;
  /** "ecdsa-sha2-nistp256 SHA256:…, protected: no, enrolled 2026-10-02" or "none" */
  key: string;
  /** "grid.wayne.edu:22 answered at …" / "no route" / "not checked" */
  reach: string;
  /** the account recorded after the grid accepted a sign-in */
  account?: string;
  /** the helper's file for this computer (name, size, sha256) */
  helperFile?: string;
  /** "unproven on the grid" */
  unproven: string;
}

/** 12.0.0: Settings' "Connection" section (filled by the background beside settingsView) */
export interface ConnectionSettingsView {
  title: string;
  /** "Connection": "Direct when possible" (direct, the default) or "GlobalProtect only" (vpn): set-pref {connection} */
  mode: { label: string; value: 'direct' | 'vpn'; options: Array<{ value: 'direct' | 'vpn'; label: string }> };
  /**
   * "Protect my key with Windows Hello / Touch ID": OFF BY DEFAULT. The switch is page-local (WebAuthn
   * runs in the page: keyring.protectKey / keyring.unprotectKey inside the click), then the page sends
   * protect-key with the outcome. `available` false: the browser cannot (the switch is disabled with
   * the unsupported sentence); `present` false: no key yet (the switch is remembered for the first sign-in).
   */
  protectKey: { label: string; note: string; value: boolean; available: boolean; present: boolean; laterNote?: string };
  /** "Key on this computer" / "…, protected" / "No key on this computer yet" */
  keyLine: string;
  /** "Forget this computer" with its confirm row; disabled when there is no key */
  forget: { label: string; note: string; confirm: string; button: ButtonView; disabled: boolean; locked?: boolean };
  /** "Helper": "Installed · version 1" or "Not installed", with the download for this computer */
  helper: { label: string; text: string; installed: boolean; download?: HelperDownload; checkAgain: ButtonView };
}

export interface SettingsView {
  title: string;
  worker: {
    name: string;
    permissionMode: 'default' | 'acceptEdits' | 'plan';
    modes: Array<{ value: 'default' | 'acceptEdits' | 'plan'; label: string }>;
    keepRunning: boolean;
    openClaude: boolean;
  };
  appearance: { value: Appearance; options: Array<{ value: Appearance; label: string }> };
  grid: { address?: string; change: string; disconnect: string };
  /** the acceptance: its date, the installation id a notice names (LICENSE 19(a)), the record as text to save, and the texts */
  agreement: { acceptedOn?: string; installId?: string; installIdLabel: string; record?: string; saveRecord: string; showTerms: string; save: string; print: string };
  activity: { show: string; export: string; clear: string; count: number };
  drive: { title: string; connected: boolean };
  /** folded: shell host, site profile, hashes */
  labLead: { title: string; shellHost: string; siteProfile: string; hashes: string[] };
  /** 12.0.0: "Connection" (direct or GlobalProtect only, the optional key protection, Forget this computer, the helper) */
  connection?: ConnectionSettingsView;
}

// ---- actions ---------------------------------------------------------------------------------------

/**
 * Everything a page asks the background for (messages.ts { type: 'action' }). The background carries
 * it, updates facts and pushes new views; the result says only what the page needs at once.
 * Page-local acts (PageAct) are never sent.
 */
export type Action =
  // the welcome page. The page itself calls sidePanel.open({windowId}) and permissions.request
  // inside the click, before any await (a gesture does not survive a message), and writes the
  // acceptance record (TermsRecord v2) itself; then it sends this.
  | { kind: 'agree'; origin: string; granted: boolean; panelOpened: boolean; tabId?: number; windowId?: number }
  /** "Use this portal": the page asked Chrome for the origin inside the click; Anthropic addresses are refused before any prompt */
  | { kind: 'use-portal'; origin: string; granted: boolean }
  // the grid
  /** "Sign in again", "Sign in" (Grid row): opens or reloads the sign-in tab, in front, in the panel's window */
  | { kind: 'sign-in-grid'; windowId?: number }
  /** "Try again" on can't reach: one reachability check and one dashboard GET now */
  | { kind: 'retry-grid' }
  // approval and setup (moment 6)
  /** "Ask for access": opens the request page with the AccessID filled in */
  | { kind: 'ask-access' }
  /** "Try again" on "Can't check your approval right now." */
  | { kind: 'retry-access' }
  /** "Update": opens the store listing */
  | { kind: 'update' }
  /** "Copy details": returns the text the page copies (the reason for the lab lead) */
  | { kind: 'copy-details' }
  /** "Mark this workspace restricted": worker restrict, through the shell */
  | { kind: 'restrict'; workerName: string }
  // the worker
  /**
   * "Connect": signs in to the grid first if needed (the tab opens and closes itself), runs the one
   * connect line, and carries through to "You're online." `statement` is present when the press
   * made the data statement (moment 6, or a new worker name): the background records Acknowledgement v3
   * with these words before the line is sent.
   */
  | { kind: 'connect'; statement?: { tick: string; lines: string[]; buttonLabel: string } }
  /** withdraws a press kept for later ("Connecting when ready…"), or ends a sign-in sitting in flight; the worker keeps its place */
  | { kind: 'cancel' }
  /** "Stop" and "Cancel" (in line), after the confirm row: worker stop alone, through the shell */
  | { kind: 'stop' }
  /** "Sign in to Claude", "Sign in again"; fresh: "Use another account" (connect --login fresh) */
  | { kind: 'sign-in-claude'; fresh?: boolean }
  /** the pasted code: typed once into the sitting and forgotten; never stored or logged */
  | { kind: 'paste-code'; code: string }
  /** "Open the Claude tab again", "Open it again": the same authorize link, in a new tab, in the panel's window */
  | { kind: 'reopen-claude-tab' }
  /** "Try again" after an error: runs again what failed (connect, the grid check, the access check) */
  | { kind: 'retry' }
  // the home
  /** "Open my session": brings forward the claude.ai tab Beethoven opened if it has had no new load, else opens the link in one new tab; never needs the grid */
  | { kind: 'open-session' }
  /** "New session": opens the environment link in a new tab (the first time, the toast) */
  | { kind: 'new-session' }
  /** "Your files": the worker's folder in the portal's Files app, in a tab (needs the grid sign-in) */
  | { kind: 'open-files' }
  | { kind: 'open-settings' }
  | { kind: 'open-details' }
  | { kind: 'open-help' }
  /** the tour started, was skipped, or ended (records TOUR_SEEN_KEY) */
  | { kind: 'tour'; event: 'start' | 'auto' | 'skip' | 'done' }
  /** a one-time card's × or its done state */
  | { kind: 'dismiss'; card: 'try-asking' | 'pin-tip' | 'tour-card' }
  /** Show log opened or closed: while open, the background downloads progress.log when it changes */
  | { kind: 'log'; open: boolean }
  // AM2: the one-time key step (UNPROVEN ON THE GRID)
  /** "Open the grid terminal": the page has already put the line on the clipboard; the background opens the terminal page in a tab in front, in the panel's window */
  | { kind: 'open-terminal-for-login-setup'; windowId?: number }
  /** "I'm in": the background asks its page script in that tab to type the line, then re-tests every 2 s */
  | { kind: 'login-setup-in' }
  // Details
  | { kind: 'run-checks' }
  | { kind: 'copy-report' }
  /** "Check a compute node": the probe, Details only */
  | { kind: 'check-compute-node' }
  // Settings
  | { kind: 'set-pref'; prefs: Partial<{ worker_name: string; permission_mode: 'default' | 'acceptEdits' | 'plan'; auto_start: boolean; open_claude_on_connect: boolean; appearance: Appearance; connection: 'direct' | 'vpn' }> }
  /** "Change" (Your grid): the welcome page's portal field, in Settings */
  | { kind: 'change-portal'; origin: string; granted: boolean }
  /** "Disconnect": forgets the portal and removes the origin grant */
  | { kind: 'disconnect' }
  | { kind: 'audit'; op: 'export' | 'clear' }
  /** "Google Drive in Claude (optional)": the student's own tick */
  | { kind: 'drive-connected'; done: boolean }
  // ---- 12.0.0: the direct way (docs/V12_CONTRACT.md). The names follow the pages stream's draft
  // (src/ui/model12.ts Action12) wherever the meaning is the same. ----
  /** the sheet's AccessID: opens the connection through the bridge and asks the grid what it wants */
  | { kind: 'grid-signin-account'; account: string }
  /**
   * The answer to the grid's prompt now shown (the first prompt of the grid's request not answered yet):
   * held in memory only until every prompt of that request has its answer, then sent once into the
   * encrypted session and dropped. Never stored, logged or offered to be remembered.
   */
  | { kind: 'grid-signin-answer'; text: string }
  /** "Try again" after the stop or a failure, "I've set up my code" after the 2FA refusal: a new sign-in from the AccessID */
  | { kind: 'grid-signin-retry' }
  /** "Change" beside the AccessID, and the sheet's Cancel: back to the field; the connection in flight is closed */
  | { kind: 'grid-signin-change' }
  /** "Continue" on "This computer is set up.": the press that was waiting for the grid carries on */
  | { kind: 'grid-signin-continue' }
  /** "Use GlobalProtect instead": the 11.0.0 way for this computer until the student tries the direct way again (or Settings says otherwise) */
  | { kind: 'use-vpn' }
  /** "Try the direct way again" on the fallback moment */
  | { kind: 'try-direct' }
  /** "Continue" on the fallback moment: on into the GlobalProtect moments */
  | { kind: 'fallback-continue' }
  /** "Use this computer" / "Use my phone" on the route choice */
  | { kind: 'choose-route'; route: 'laptop' | 'phone' }
  /** "Back" on the code setup: the route choice again */
  | { kind: 'route-back' }
  /** "I don't have a grid code yet" after the grid's "wrong code, or no 2FA" refusal: the route choice */
  | { kind: 'no-grid-code' }
  /** the bundled installer was saved from the page (an <a download> of the packaged file); the background looks for the helper every few seconds */
  | { kind: 'bridge-downloaded'; os: HelperOs }
  /** "Check again" (install-helper, Settings' helper row): the bridges are probed again now */
  | { kind: 'check-bridge' }
  /** Settings, "Connection" (also accepted as set-pref {connection}) */
  | { kind: 'set-connection'; connection: 'direct' | 'vpn' }
  /**
   * After the page ran the passkey step itself (WebAuthn needs the page; core/keyring.ts protectKey,
   * unprotectKey or createProtectedKey inside the click): what came of it. The background re-reads the
   * key and drops any copy of it in memory. Nothing secret travels in this message.
   */
  | { kind: 'protect-key'; on: boolean; outcome: ProtectOutcome }
  /** "Not now" on the optional protection card (once; Settings keeps the switch) */
  | { kind: 'protect-key-later' }
  /** after the page ran the once-per-session unlock (core/keyring.ts unlockKey inside the click on "Unlock") */
  | { kind: 'unlock-key'; outcome: 'unlocked' | 'cancelled' | 'failed' }
  /** "Forget this computer": forget through the gate (the grid's line goes), then the key here */
  | { kind: 'forget-computer' };

export type ActionKind = Action['kind'];

/** what each action answers at once (the rest arrives as a new view) */
export interface ActionResults {
  agree: { navigated: boolean; signedInAlready: boolean };
  'use-portal': { origin: string };
  'sign-in-grid': { opened: boolean };
  'retry-grid': { reach: 'answers' | 'no-route'; session: 'signed-in' | 'signed-out' | 'unreachable' };
  'ask-access': { opened: boolean };
  'retry-access': { approved?: boolean };
  update: { opened: boolean };
  'copy-details': { text: string };
  restrict: { marked: boolean };
  connect: { started: boolean; kept?: boolean; waiting?: 'grid' | 'approval' | 'setup' | 'login-setup' };
  cancel: { cancelled: boolean };
  stop: { stopped: boolean };
  'sign-in-claude': { started: boolean; waiting?: 'grid' | 'login-setup' };
  'paste-code': { typed: boolean };
  'reopen-claude-tab': { opened: boolean };
  retry: { started: boolean };
  'open-session': { focused: boolean; opened: boolean };
  'new-session': { opened: boolean; firstTime: boolean };
  'open-files': { opened: boolean };
  'open-settings': { opened: boolean };
  'open-details': { opened: boolean };
  'open-help': { opened: boolean };
  tour: { recorded: boolean };
  dismiss: { recorded: boolean };
  log: { lines: LogLine[] };
  'open-terminal-for-login-setup': { opened: boolean };
  'login-setup-in': { typed: boolean; how?: TerminalInput };
  'run-checks': { done: boolean };
  'copy-report': { text: string };
  'check-compute-node': { submitted: boolean };
  'set-pref': { saved: boolean };
  'change-portal': { origin: string };
  disconnect: { disconnected: boolean };
  audit: { text?: string; cleared?: boolean };
  'drive-connected': { recorded: boolean };
  'grid-signin-account': { started: boolean; error?: 'account' | 'busy' | 'no-bridge' };
  'grid-signin-answer': { sent: boolean; waiting?: number };
  'grid-signin-retry': { started: boolean };
  'grid-signin-change': { closed: boolean };
  'grid-signin-continue': { recorded: boolean };
  'use-vpn': { recorded: boolean };
  'try-direct': { bridge: 'store' | 'relay' | 'helper' | 'none' };
  'fallback-continue': { recorded: boolean };
  'choose-route': { recorded: boolean };
  'route-back': { recorded: boolean };
  'no-grid-code': { recorded: boolean };
  'bridge-downloaded': { looking: boolean };
  'check-bridge': { bridge: 'store' | 'relay' | 'helper' | 'none'; helperVersion?: string };
  'set-connection': { saved: boolean };
  'protect-key': { protected: boolean };
  'protect-key-later': { recorded: boolean };
  'unlock-key': { unlocked: boolean };
  'forget-computer': { forgotten: boolean; onGrid: 'forgotten' | 'none' | 'not-reached' };
}

export type ResultOf<K extends ActionKind> = ActionResults[K];

/**
 * Acts a page carries out alone, never sent: each needs the click's own user activation (the
 * clipboard) or is purely visual. Listed so every control has a name. copy-link and show-phone use
 * HomeView.link; copy-prompt uses WORDS.home.prompts; copy-vpn uses GlobalProtectMoment.chip;
 * copy-log uses the lines Show log already holds; the login-setup line is copied from
 * LoginSetupMoment.line in the same click that sends "open-terminal-for-login-setup".
 */
export type PageAct = 'copy-link' | 'show-phone' | 'hide-phone' | 'copy-prompt' | 'copy-vpn' | 'copy-log' | 'copy-login-setup-line' | 'show-terms' | 'hide-terms' | 'save-terms' | 'print-terms' | 'open-terms-in-tab' | 'tick' | 'show-more' | 'confirm-stop' | 'keep-it' | 'open-menu'
  // 12.0.0: the helper's download is an <a download> of the packaged file (HelperDownload.url); the
  // passkey steps run in the page inside the click (core/keyring.ts), then the page sends
  // protect-key or unlock-key; the square codes are drawn by the page from QrLink.url
  | 'download-helper' | 'protect-key' | 'unprotect-key' | 'unlock-key' | 'show-qr' | 'confirm-forget';

/** how the page script typed into the terminal (AM2): xterm.js's helper textarea, or not at all ("unsupported": an older terminal; the student pastes) */
export type TerminalInput = 'xterm' | 'unsupported';

/** the failure code of the connect line, for a view that says why (contract.ts StepFailCode) */
export type ConnectFailure = StepFailCode | 'closed' | 'password' | 'limit-names' | 'limit-hourly' | 'limit-busy' | 'old-copy';

/** 12.0.0: what the page's passkey step came to (on: turned on; off: turned off) */
export type ProtectOutcome = 'on' | 'off' | 'cancelled' | 'unsupported' | 'failed';

/** 12.0.0: the bridges in D3's order, and what a probe found (core/bridge.ts) */
export type BridgeId = 'store' | 'relay' | 'helper';
export type BridgeState = 'available' | 'not-available' | 'not-configured' | 'not-installed' | 'broken' | 'unknown';

// ---- formatting shared by the core and the pages ---------------------------------------------------

/** "2:41" (m:ss) under an hour, "1:02:41" past it: the queue timer and "Got a computer … · 0:20" */
export function formatTimer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "up 2 h 14 min", or "online just now" in the first minute (the home's subline; never "up 0 min") */
export function onlineFor(ms: number): string {
  return ms < 60_000 ? 'online just now' : `up ${formatUp(ms)}`;
}

/** "2 h 14 min", "14 min" (callers say "just now" for the first minute themselves: onlineFor) */
export function formatUp(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** "20 s", "3 min": the Worker row's "checked … ago" */
export function formatAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min`;
}

/**
 * The browser's local clock. `ampm` true: "4:50 PM", "8:44 AM" (Renews itself at, Asked at, As of …
 * in the hero); false: "9:12" (Expected around, the log, the Worker row's "As of 9:02").
 */
export function formatClock(iso: string | number | Date, ampm: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return ampm ? `${h}:${mm} ${h24 < 12 ? 'AM' : 'PM'}` : `${h}:${mm}`;
}
