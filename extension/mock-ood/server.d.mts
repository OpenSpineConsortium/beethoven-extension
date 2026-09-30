// Types for the mock portal, for the integration test and the type-check.
export interface MockPortalOptions {
  host?: string;
  port?: number;
  user?: string;
  home?: string;
  requireCookie?: boolean;
  noClusters?: boolean;
  rnode?: 'enabled' | 'disabled';
  uploads?: boolean;
  cold?: boolean;
  /** ms of no /pun/ traffic after which the next /pun/ request answers 500 once; 0 = never */
  coldPun?: number;
  jobComposer?: boolean;
  shellHosts?: string[];
  seedTool?: boolean;
  /** with seedTool: also profile.json and VERSION, the stand-in as the account's own copy, as a build before 8.0.0 left an account; default false (the CLI sets it with --own-copy) */
  seedInstalled?: boolean;
  /** with sharedInstall and a readable copy: the account already set up on the lab's shared copy by the stand-in's own install --shared (seedTool is then ignored); default false (the CLI sets it unless --shared-install, --fresh-home, --own-copy or --shared-unreadable) */
  seedShared?: boolean;
  /** the virtual path of the lab's shared copy of the tool (framework 5 shared_install), served read-only; undefined: the site keeps none */
  sharedInstall?: string;
  /** false plays an account outside the lab's group: the Files routes answer 403 there and bash cannot open the launcher (exit 127); default true */
  sharedReadable?: boolean;
  /** the shared copy's VERSION; default '5' */
  sharedVersion?: string;
  /** the home the seeded tool prints and records in place of the real one (MOCK_DISPLAY_HOME); default: the virtual home */
  displayHome?: string;
  /** the account names the access-service stand-in (/beethoven/access_check, tests only) approves; default ['st1234'] */
  approved?: string[];
  /** access checks past this many answer 429; 0 = no limit */
  accessLimit?: number;
  /** installations already bound, {access_id: install_id} (the CLI's --seat); the stand-in binds each other approved account to the first installation that asks, unless another account's seat names that installation (reason "other_account") */
  seats?: Record<string, string>;
  /** false plays the service with REQUIRE_INSTALL_ID "0" (the CLI's --install-optional): an approved account asking without an installation identifier is approved; default true, which answers reason "update_required" */
  requireInstallId?: boolean;
  tls?: { cert: string; key: string };
  log?: (line: string) => void;
}

export interface MockPortal {
  origin: string;
  port: number;
  /** the directory on disk behind the virtual home */
  home: string;
  /** what the Files routes call the home directory (/home/<user>) */
  virtualHome: string;
  /** the home the seeded tool prints and writes into its status files (the virtual home unless set otherwise) */
  displayHome: string;
  user: string;
  /** the account names the access-service stand-in approves */
  approved: string[];
  /** the dashboard's <meta name="csrf-token"> */
  railsToken: string;
  /** the Cookie header value of a signed-in session */
  cookie: string;
  /** the lab's shared copy as the portal shows it (the virtual path), when the mock keeps one */
  sharedInstall?: string;
  /** the directory on disk behind it */
  sharedDir?: string;
  state: {
    coldDone: boolean;
    shells: number;
    frames: number;
    fatal: number;
    coldHits: number;
    punWarmUntil: number;
    /** POSTs the access-service stand-in has taken */
    accessChecks: number;
    /** their parsed bodies, in order */
    accessBodies: Array<{ v: number; access_id: string; portal: string; product: string; version: string; install_id?: string }>;
    /** the installation each approved account is bound to, {access_id: install_id}; a test moves one by writing here */
    seats: Record<string, string>;
    /** how many times each account was asked about from an installation other than its own */
    conflicts: Record<string, number>;
    /** the content-type, origin and cookie headers each POST carried */
    accessHeaders: Array<{ 'content-type': string; origin: string; cookie: string }>;
  };
  close(): Promise<void>;
}

export function createMockPortal(opts?: MockPortalOptions): Promise<MockPortal>;

/** where the CLI keeps the lab's shared copy when neither --shared-install PATH nor MOCK_SHARED_INSTALL names one */
export const DEFAULT_SHARED_INSTALL: string;

/** the options the CLI starts the mock with, from its arguments (without node and the script) and environment */
export function cliOptions(args: string[], env?: Record<string, string | undefined>): MockPortalOptions;
