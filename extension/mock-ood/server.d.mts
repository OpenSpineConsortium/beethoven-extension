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
  /** the home the seeded tool prints and records in place of the real one (MOCK_DISPLAY_HOME); default: the virtual home */
  displayHome?: string;
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
  /** the dashboard's <meta name="csrf-token"> */
  railsToken: string;
  /** the Cookie header value of a signed-in session */
  cookie: string;
  state: { coldDone: boolean; shells: number; frames: number; fatal: number; coldHits: number; punWarmUntil: number };
  close(): Promise<void>;
}

export function createMockPortal(opts?: MockPortalOptions): Promise<MockPortal>;
