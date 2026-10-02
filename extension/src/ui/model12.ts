// 12.0.0 pieces the pages draw that core/model.ts does not carry (yet): the welcome page's four
// prerequisites with their QR codes, the route choice beneath them (built from the core's own words,
// WORDS.direct.chooseRoute and WORDS.direct.codeSetup, so the welcome page, the panel's "What you need"
// and the code-setup moment read the same), the panel's "What you need" menu item, and one note for
// 11.0.0's terminal step. Each is reported to the core as a gap; moving this file's contents into
// model.ts changes nothing in the pages but an import.
//
// Every QR code encodes one public page only: Wayne State's own guides and the app stores' pages for
// Google Authenticator and GlobalProtect. Nothing here touches the browser.
import { WORDS, type Action, type QrLink, type WelcomeView } from '../core/model';

/** the public pages (in a real view the university's come from the site profile: vpn_help_url, grid_account_help_url, and grid_code_help_url, which the profile does not have yet) */
export const PUBLIC_PAGES = {
  /** Wayne State KB 20242: Google Authenticator for the grid */
  gridCode: 'https://services.wayne.edu/TDClient/277/Portal/KB/Article/20242/How-do-I-set-up-and-use-Google-Authenticator-for-the-Grid',
  /** Wayne State KB 20314: GlobalProtect, for computers and phones */
  globalProtect: 'https://services.wayne.edu/TDClient/277/Portal/KB/Article/20314/Wayne-State-VPN-and-the-Global-Protect-client',
  /** Wayne State KB 20199: a grid account */
  gridAccount: 'https://services.wayne.edu/TDClient/277/Portal/KB/ArticleDet?ID=20199',
  /** the grid's own website (where 2FA Setup is); reachable only on GlobalProtect */
  gridSite: 'https://ondemand.grid.wayne.edu',
  authenticatorIos: 'https://apps.apple.com/app/google-authenticator/id388497605',
  authenticatorAndroid: 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2',
  /** GlobalProtect by Palo Alto Networks in Apple's App Store (iTunes lookup 2026-10-02: "GlobalProtect™", Palo Alto Networks) */
  globalProtectIos: 'https://apps.apple.com/app/globalprotect/id1400555706',
  globalProtectAndroid: 'https://play.google.com/store/apps/details?id=com.paloaltonetworks.globalprotect',
  claudePlans: 'https://claude.ai/upgrade',
} as const;

/** the words the core's WORDS lacks for these pieces */
export const WORDS12 = {
  needs: {
    title: "You'll need",
    /** the panel's ⋯ menu item, page-local */
    menu: 'What you need',
    account: { title: 'A Wayne State grid account', detail: 'Your AccessID and password.', link: 'How to get one' },
    code: { title: "The grid's sign-in code", detail: 'Google Authenticator on your phone, set up for the grid.', link: 'How to set it up' },
    vpn: { title: 'GlobalProtect, once', detail: 'Once, to set up the code. You can do it on your phone instead of this computer.', link: 'How to get it' },
    claude: { title: 'Claude Pro or Max', detail: 'The account you use at claude.ai.', link: 'See plans' },
    /** each QR code's name */
    qr: { gridCode: "Wayne State's guide", iphone: 'iPhone', android: 'Android', globalProtect: "Wayne State's GlobalProtect guide" },
    scan: "Scan with your phone's camera.",
    done: 'Done',
  },
  routes: {
    question: 'No grid code yet? Set it up first.',
    choose: 'Where will you set it up?',
    /** the phone route: when the page shows no setup key (the core's step 4 says to type it) */
    phoneNoKey: "No setup key on the page? Don't launch 2FA Setup again: ask your lab lead.",
    never: 'Beethoven never sees your code or its setup key.',
  },
  /** the sign-in sheet, under its title while it asks for the AccessID: why it asks (where the password goes is the core's privacy line) */
  sheetWhy: 'Once, so the grid can remember this computer.',
  /** 11.0.0's one-time terminal step on the GlobalProtect way, when the grid's terminal may ask for a code too */
  loginSetupCode: "If it asks for a code, type the one in Google Authenticator. Don't run 2FA Setup if you have one: it replaces it.",
} as const;

/** a QR code the pages draw: the core's QrLink, or one of the welcome page's (no id needed) */
export interface QrLink12 {
  label: string;
  url: string;
}

/** a group of QR codes for one thing, shown one at a time under its name ("Google Authenticator": iPhone, Android) */
export interface QrGroup {
  title: string;
  links: QrLink12[];
}

/** one prerequisite: its words, its help link, and the QR codes that open the same pages on a phone */
export interface NeedView {
  id: 'account' | 'code' | 'vpn' | 'claude';
  title: string;
  detail: string;
  link?: { label: string; url: string };
  qrs?: QrGroup[];
}

/** one step of a route: the core's sentence, and what helps with it here */
export interface RouteStep {
  text: string;
  qrs?: QrGroup[];
  /** pages to open on this computer (the laptop route's grid pages) */
  links?: Array<{ label: string; url: string }>;
  warn?: string;
  note?: string;
}

/** one route (the core's chooseRoute option and codeSetup steps) */
export interface RouteView {
  id: 'laptop' | 'phone';
  title: string;
  detail: string;
  button: string;
  steps: RouteStep[];
}

export interface RoutesView {
  question: string;
  choose: string;
  warning: string;
  routes: [RouteView, RouteView];
  never: string;
}

/** the university's pages as the site profile names them */
export interface SitePages {
  gridCode: string;
  globalProtect: string;
  gridAccount: string;
  gridSite: string;
}

const WAYNE: SitePages = { gridCode: PUBLIC_PAGES.gridCode, globalProtect: PUBLIC_PAGES.globalProtect, gridAccount: PUBLIC_PAGES.gridAccount, gridSite: PUBLIC_PAGES.gridSite };

/**
 * The QR groups of the code setup, from the core's QrLink list (CodeSetupMoment.qr): GlobalProtect for
 * the phone (iPhone, Android), Google Authenticator (iPhone, Android), the grid's own instructions, the
 * grid's website; in that order, each group under the core's names.
 */
export function qrGroups(qr: QrLink[]): QrGroup[] {
  const Q = WORDS.direct.codeSetup.qr;
  const named = (id: QrLink['id']) => qr.filter((l) => l.id === id);
  const groups: QrGroup[] = [];
  const pair = (title: string, ios: QrLink['id'], android: QrLink['id']) => {
    const links = [...named(ios), ...named(android)].map((l) => ({ label: l.id.endsWith('-ios') ? Q.iphone : l.id.endsWith('-android') ? Q.android : l.label, url: l.url }));
    if (links.length) groups.push({ title, links });
  };
  pair(Q.globalprotect, 'globalprotect-ios', 'globalprotect-android');
  pair(Q.authenticator, 'authenticator-ios', 'authenticator-android');
  for (const l of named('grid-code')) groups.push({ title: Q.gridCode, links: [{ label: Q.gridCode, url: l.url }] });
  for (const l of named('grid-site')) groups.push({ title: WORDS.direct.codeSetup.openSite, links: [{ label: WORDS.direct.codeSetup.openSite, url: l.url }] });
  return groups;
}

/** the core's QR links for each route, as a fixture or the welcome page makes them before the core does */
export function routeQr(route: 'laptop' | 'phone', pages: SitePages = WAYNE): QrLink[] {
  const Q = WORDS.direct.codeSetup.qr;
  const authenticator: QrLink[] = [
    { id: 'authenticator-ios', label: `${Q.authenticator} · ${Q.iphone}`, url: PUBLIC_PAGES.authenticatorIos },
    { id: 'authenticator-android', label: `${Q.authenticator} · ${Q.android}`, url: PUBLIC_PAGES.authenticatorAndroid },
  ];
  const grid: QrLink = { id: 'grid-code', label: Q.gridCode, url: pages.gridCode };
  if (route === 'laptop') return [...authenticator, grid];
  return [
    { id: 'globalprotect-ios', label: `${Q.globalprotect} · ${Q.iphone}`, url: PUBLIC_PAGES.globalProtectIos },
    { id: 'globalprotect-android', label: `${Q.globalprotect} · ${Q.android}`, url: PUBLIC_PAGES.globalProtectAndroid },
    ...authenticator,
    grid,
  ];
}

/**
 * Where each QR group goes among the steps. The phone route's steps name the square codes in order
 * ("Scan the first square code …", the second, the third), so its i-th group sits under its i-th
 * step. The laptop route's app codes go under its first step (the one that needs a phone), and the
 * grid's pages, which open on this computer, become links under the step that opens 2FA Setup. The
 * 2FA Setup notice sits under that step on both.
 */
export function placeGroups(route: 'laptop' | 'phone', steps: readonly string[], groups: QrGroup[]): RouteStep[] {
  const C = WORDS.direct.codeSetup;
  const setupAt = steps.findIndex((s) => /2FA Setup/.test(s));
  const out: RouteStep[] = steps.map((text) => ({ text }));
  if (!out.length) return out;
  if (route === 'phone') {
    groups.forEach((g, i) => {
      const s = out[Math.min(i, out.length - 1)]!;
      (s.qrs ??= []).push(g);
    });
    const keyStep = steps.findIndex((s) => /setup key/i.test(s));
    if (keyStep >= 0) out[keyStep]!.note = WORDS12.routes.phoneNoKey;
  } else {
    const later = groups.filter((g) => g.title === C.qr.gridCode || g.title === C.openSite);
    const phone = groups.filter((g) => !later.includes(g));
    if (phone.length) out[0]!.qrs = phone;
    // the step that turns GlobalProtect on here: Wayne State's guide to getting it, as a link
    const vpnAt = steps.findIndex((s, i) => i !== setupAt && /GlobalProtect/.test(s) && /this computer/.test(s));
    if (vpnAt >= 0) out[vpnAt]!.links = [{ label: WORDS12.needs.qr.globalProtect, url: PUBLIC_PAGES.globalProtect }];
    const at = setupAt >= 0 ? setupAt : out.length - 1;
    if (later.length) out[at]!.links = later.map((g) => ({ label: g.title, url: g.links[0]!.url }));
  }
  if (setupAt >= 0) out[setupAt]!.warn = C.warning;
  return out;
}

/** the route choice, from the core's words: the welcome page and the panel's "What you need" */
export function routesView(pages: SitePages = WAYNE): RoutesView {
  const R = WORDS.direct.chooseRoute;
  const C = WORDS.direct.codeSetup;
  return {
    question: WORDS12.routes.question,
    choose: WORDS12.routes.choose,
    warning: C.warning,
    never: WORDS12.routes.never,
    routes: [
      { id: 'laptop', title: R.laptop.title, detail: R.laptop.detail, button: R.laptop.button, steps: placeGroups('laptop', C.laptopSteps, qrGroups(routeQr('laptop', pages))) },
      { id: 'phone', title: R.phone.title, detail: R.phone.detail, button: R.phone.button, steps: placeGroups('phone', C.phoneSteps, qrGroups(routeQr('phone', pages))) },
    ],
  };
}

/** the four prerequisites in Greg's order, each with its help link (the square codes are in the routes) */
export function needsList(pages: SitePages = WAYNE): NeedView[] {
  const N = WORDS12.needs;
  return [
    { id: 'account', title: N.account.title, detail: N.account.detail, link: { label: N.account.link, url: pages.gridAccount } },
    // links only: the square codes (the grid's guide, Google Authenticator, the GlobalProtect app) are
    // drawn once, inside the route the student chooses below, so the page never shows one twice
    { id: 'code', title: N.code.title, detail: N.code.detail, link: { label: N.code.link, url: pages.gridCode } },
    { id: 'vpn', title: N.vpn.title, detail: N.vpn.detail, link: { label: N.vpn.link, url: pages.globalProtect } },
    { id: 'claude', title: N.claude.title, detail: N.claude.detail, link: { label: N.claude.link, url: PUBLIC_PAGES.claudePlans } },
  ];
}

/** the welcome page with the four prerequisites and the route choice (the core's WelcomeView has three needs and no routes) */
export interface WelcomeView12 extends Omit<WelcomeView, 'needs'> {
  needs: Array<NeedView | WelcomeView['needs'][number]>;
  routes?: RoutesView;
}

/** the panel's "What you need": a page-local screen from the ⋯ menu */
export interface NeedsView {
  title: string;
  needs: NeedView[];
  routes: RoutesView;
}

export function needsView(pages: SitePages = WAYNE): NeedsView {
  return { title: WORDS12.needs.title, needs: needsList(pages), routes: routesView(pages) };
}

/** a press: the core's actions, and the menu's page-local "What you need" */
export type Action12 = Action | { kind: 'open-needs' };
