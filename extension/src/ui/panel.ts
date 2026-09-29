// The monitoring panel (Chrome/Edge side panel, Firefox sidebar, popup fallback): the seventeen
// checks as a list, the four buttons (set up, sign in to Claude on the cluster, start, stop),
// the run's state with the session name, the rc.log tail, the audit log, and the licence and
// agreement status. Everything it knows about the cluster comes through the portal page script;
// everything it remembers is in storage.session except preferences.
import { browser } from 'wxt/browser';
import type { RunState } from '../entrypoints/background';
import { buildNodes, CHECK_IDS, type DiagCtx } from '../core/checks';
import { commands, parseJobId, paths, sessionName, siteFrom, stateDirFrom } from '../core/contract';
import { runDiagnostics, formatReport, type DiagReport, type FixAction, type NodeReport } from '../core/diagnostics';
import { ACK_KEY, ackCovers, ackSubject, type Acknowledgement } from '../core/disclosure';
import { CHECKS_KEY, PORTAL_KEY, PREFS_KEY, type PortalSettings, type Prefs } from '../core/keys';
import type { AuditRecord } from '../core/audit';
import { BUNDLED_KEYS } from '../licensing/license';
import { assetUrl, local, portalSettings, prefs as loadPrefs, session, version } from '../ext/storage';
import { add, clear, downloadText, el, fmtTime } from './dom';
import { activeTabOrigin, clearRun, currentRun, openOnboarding, openPanel, openPortalTab, openShellTab, originGranted, portal, portalAlive, refreshRun, setRun } from './rpc';
import { ackSection, connectSection, licenceLine, licenceSummary } from './sections';

interface FrameworkManifest {
  v: number;
  generated: string;
  files: Array<{ path: string; bytes: number; sha256: string; mode: string }>;
}

type Kind = 'ok' | 'warn' | 'fail' | 'info';

export async function mountPanel(root: HTMLElement, mode: 'panel' | 'popup'): Promise<void> {
  const notice = el('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const notify = (kind: Kind, text: string) => {
    notice.className = `status ${kind === 'info' ? 'muted' : kind}`;
    notice.textContent = text;
  };
  let busy = false;
  const run = async (label: string, fn: () => Promise<void>) => {
    if (busy) return notify('warn', 'Something is already running; wait for it to finish.');
    busy = true;
    notify('info', `${label}...`);
    try {
      await fn();
    } catch (e) {
      notify('fail', (e as Error).message);
    } finally {
      busy = false;
    }
  };
  const active = mode === 'popup' ? await activeTabOrigin() : undefined;

  const render = async () => {
    clear(root);
    const settings = await portalSettings();
    const prefs = await loadPrefs();
    const summary = await licenceSummary();
    const state = await currentRun().catch(() => undefined);
    const alive = settings ? await portalAlive() : false;
    const granted = settings ? await originGranted(settings.origin) : false;
    root.append(el('h1', { text: 'Ashley Bridge' }), notice);
    root.append(connectSection(settings, render, notify, active));
    if (mode === 'popup') {
      root.append(
        statusCard(settings, state, alive, granted),
        el('div', { class: 'row' },
          el('button', { class: 'primary', text: 'Open the panel', onClick: async () => { if (!(await openPanel())) await browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html') }); window.close(); } }),
          el('button', { text: 'Setup page', onClick: () => openOnboarding() }),
        ),
      );
      return;
    }
    root.append(el('h2', { text: 'Your worker' }), statusCard(settings, state, alive, granted));
    root.append(actions(settings, prefs, state, summary, alive, render, run, notify));
    root.append(el('h2', { text: 'Before a start' }), await ackSection(render));
    root.append(el('h2', { text: 'Checks' }), await checksSection(settings, prefs, render, run, notify));
    root.append(el('h2', { text: 'Logs' }), logsSection(state), await auditSection(notify));
    root.append(el('h2', { text: 'Licence and agreement' }), licenceLine(summary, () => openOnboarding()));
    root.append(el('h2', { text: 'Settings' }), settingsSection(settings, prefs, render));
    root.append(el('p', { class: 'muted small', text: `Ashley Bridge ${version()}. It talks only to ${settings?.hostname ?? 'the portal you connect'}, reads the job's files at most once a minute, and keeps an audit log of every request on this device.` }));
  };

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (sender.id !== browser.runtime.id) return undefined;
    if ((message as { type?: string })?.type === 'run.changed') void render();
    return undefined;
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[PORTAL_KEY] || changes[PREFS_KEY])) void render();
    if (area === 'session' && changes[ACK_KEY]) void render();
  });
  await render();
}

function statusCard(settings: PortalSettings | undefined, state: RunState | undefined, alive: boolean, granted: boolean): HTMLElement {
  const card = el('div', { class: 'card' });
  if (!settings) {
    add(card, el('p', { class: 'muted', text: 'No portal connected yet.' }));
    return card;
  }
  add(card, el('div', {}, el('span', { class: granted && alive ? 'ok' : 'warn', text: granted ? (alive ? 'Portal tab open and answering' : 'Portal tab not open (open your portal in a tab and keep it open)') : 'Portal access was revoked in the browser; connect it again' })));
  if (!state) {
    add(card, el('p', { class: 'muted', text: 'No worker started from this browser session.' }));
    return card;
  }
  const st = state.status;
  const name = state.connection?.session_name || st?.session_name || sessionName(state.site ?? settings.site, state.job);
  const url = state.connection?.session_url || st?.session_url;
  const login = st?.claude_login;
  add(card,
    el('div', {}, el('strong', { text: `Worker "${state.run}", job ${state.job}` }), el('span', { class: 'muted', text: `${st?.node ? ` on ${st.node}` : ''}${st?.state ? `: ${st.state}` : ': waiting for the job to write status.json'}` })),
    st?.message ? el('div', { class: 'small', text: st.message }) : null,
    el('p', {}, 'Open ', el('a', { href: 'https://claude.ai/code', target: '_blank', rel: 'noreferrer', text: 'claude.ai/code' }), ', or tap Code in the Claude app, and find ', el('span', { class: 'session-name', text: name }), '.'),
    url ? el('p', {}, el('a', { href: url, target: '_blank', rel: 'noreferrer', text: url })) : el('p', { class: 'muted small', text: 'The session link appears here once the job has registered with Remote Control.' }),
    login ? el('div', { class: 'muted small', text: `Claude sign-in on the cluster: ${login.loggedIn ? `yes${login.email ? ` (${login.email}${login.subscriptionType ? `, ${login.subscriptionType}` : ''})` : ''}` : 'no'}${st?.consent !== undefined ? `; consent recorded: ${st.consent ? 'yes' : 'no'}` : ''}${st?.restarts ? `; restarts: ${st.restarts}` : ''}` }) : null,
    st?.state === 'need_login' ? el('div', { class: 'fail', text: 'The Claude sign-in on the cluster has ended. Use "Sign in to Claude on the cluster" and run the login command again; nothing else will help.' }) : null,
    st?.state === 'need_consent' ? el('div', { class: 'fail', text: 'Claude Code still asks its one-time Remote Control question. Use "Sign in to Claude on the cluster" and run the consent command yourself; the job is waiting.' }) : null,
    st?.state === 'preempted' ? el('div', { class: 'warn', text: 'The job was preempted or reached its wall time. Start the worker again within four hours and it resumes the same session.' }) : null,
    state.error ? el('div', { class: 'warn small', text: `last read failed: ${state.error}` }) : null,
    el('div', { class: 'muted small', text: `files read ${fmtTime(state.updated)} (at most once a minute)${st?.updated_at ? `; job heartbeat ${fmtTime(st.updated_at)}` : ''}` }),
  );
  return card;
}

function actions(settings: PortalSettings | undefined, prefs: Prefs, state: RunState | undefined, summary: Awaited<ReturnType<typeof licenceSummary>>, alive: boolean, render: () => Promise<void>, run: (l: string, f: () => Promise<void>) => Promise<void>, notify: (k: Kind, t: string) => void): HTMLElement {
  const out = el('pre', { hidden: true });
  const show = (text: string) => {
    out.hidden = false;
    out.textContent = text;
  };
  const ready = !!settings && alive;
  const licensed = summary.termsOk && summary.licenceOk && !summary.versionRevoked;
  const box = el('div', { class: 'card' });
  add(box,
    el('div', { class: 'row' },
      el('button', { disabled: !ready || !licensed, text: 'Set up the cluster', title: 'Uploads the framework files to ~/.hpcworker through the portal and runs its install once', onClick: () => run('Setting up the cluster', () => setupCluster(settings!, show, notify)) }),
      el('button', { disabled: !ready || !licensed, text: 'Run the probe job', title: 'Submits a five-minute job that tests the compute node; the checks read its report', onClick: () => run('Submitting the probe job', async () => { const r = await portal.shell(commands.probe(), { timeoutMs: 60_000 }); show(r.output); const id = parseJobId(r.output); notify(id ? 'ok' : 'warn', id ? `Probe job ${id} submitted. Run the checks again once it has finished (about five minutes).` : `The probe command ended with exit ${r.exitCode} and printed no job id; see its output.`); }) }),
      el('button', { disabled: !settings, text: 'Sign in to Claude on the cluster', onClick: () => run('Opening the portal shell', async () => { await openShellTab(); show(`In the shell tab that opened, type these two commands yourself (Ashley Bridge never types them for you):\n\n  ${commands.claudeLogin}\n      Claude Code's own sign-in, inside an allocation on a compute node: open the link it prints, sign in, paste the code back.\n\n  ${commands.claudeConsent}\n      Claude Code asks once "Enable Remote Control?" and once "Trust this folder?"; answer both. Only your answer is recorded.\n\nThen come back here and run the checks.`); }) }),
    ),
    el('div', { class: 'row' },
      el('button', { class: 'primary', disabled: !ready || !licensed || !!state, text: 'Start worker', onClick: () => run('Starting the worker', () => startWorker(settings!, prefs, notify, show, render)) }),
      el('button', { class: 'danger', disabled: !ready || !state, text: 'Stop', onClick: () => run('Stopping the worker', () => stopWorker(state!, notify, show, render)) }),
      el('button', { disabled: !state, text: 'Read status now', onClick: () => run("Reading the job's files", async () => { await refreshRun(); await render(); }) }),
    ),
    !licensed ? el('p', { class: 'warn small', text: summary.versionRevoked ? 'This version has been withdrawn; update to continue.' : 'Accept the terms and enter your key on the setup page to enable the buttons.' }) : null,
    out,
  );
  return box;
}

/** home, username, the profile's state directory and site: what a start or a probe needs to know */
async function clusterContext(): Promise<{ home: string; user: string; stateDir: string; site?: string; profile?: string }> {
  const home = await portal.home();
  const user = (await portal.whoAmI()) ?? home.split('/').filter(Boolean).pop() ?? '';
  const profile = await portal.readFileIfExists(paths.profile(home));
  return { home, user, stateDir: stateDirFrom(profile, { home, user }), site: siteFrom(profile), profile };
}

/** upload the bundled framework files through PUT, then one install command through the shell */
async function setupCluster(settings: PortalSettings, show: (t: string) => void, notify: (k: Kind, t: string) => void): Promise<void> {
  const res = await fetch(assetUrl('/framework/manifest.json'));
  if (!res.ok) throw new Error('this build carries no framework files (framework/manifest.json missing)');
  const manifest = (await res.json()) as FrameworkManifest;
  if (!manifest.files.length) throw new Error('this build carries no framework files: the framework/ folder was empty when the extension was built, so there is nothing to install yet');
  const home = await portal.home();
  const root = paths.root(home);
  const log: string[] = [`home ${home}`, `uploading ${manifest.files.length} file(s) to ${root}`];
  show(log.join('\n'));
  const dirs = new Set<string>([root]);
  for (const f of manifest.files) {
    const parts = f.path.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(`${root}/${parts.slice(0, i).join('/')}`);
  }
  for (const d of [...dirs].sort()) await portal.mkdir(d);
  for (const f of manifest.files) {
    const body = await fetch(assetUrl(`/framework/files/${f.path}`)).then((r) => r.text());
    await portal.writeFile(`${root}/${f.path}`, body);
    log.push(`  ${f.path} (${f.bytes} bytes)`);
    show(log.join('\n'));
  }
  log.push(`running: ${commands.install(settings.site)}`);
  show(log.join('\n'));
  const r = await portal.shell(commands.install(settings.site), { timeoutMs: 180_000 });
  log.push(r.output, `exit ${r.exitCode}`);
  show(log.join('\n'));
  notify(r.exitCode === 0 ? 'ok' : 'fail', r.exitCode === 0 ? 'The framework is installed. Next: "Run the probe job", then "Sign in to Claude on the cluster".' : `The install command ended with exit ${r.exitCode}; see its output.`);
}

async function startWorker(settings: PortalSettings, prefs: Prefs, notify: (k: Kind, t: string) => void, show: (t: string) => void, render: () => Promise<void>): Promise<void> {
  const ack = await session.get<Acknowledgement>(ACK_KEY);
  if (!ackCovers(ack, ackSubject(prefs.worker_name))) throw new Error(`Before a start: read the section below and make the data statement for worker "${prefs.worker_name}", this session.`);
  const ctx = await clusterContext();
  if (!ctx.profile) throw new Error('hpcworker is not installed yet (no ~/.hpcworker/profile.json): choose "Set up the cluster" first.');
  const r = await portal.shell(commands.workerStart(prefs.worker_name, prefs.permission_mode), { timeoutMs: 90_000 });
  show(r.output);
  const job = parseJobId(r.output);
  if (!job) throw new Error(`the start command printed no job id (exit ${r.exitCode}); see its output`);
  const site = ctx.site ?? settings.site;
  await setRun(ctx.stateDir, prefs.worker_name, job, site);
  notify('ok', `Job ${job} submitted. When it starts, open claude.ai/code or tap Code in the Claude app and find ${sessionName(site, job)}.`);
  await render();
}

/** the tool's stop first (it lets the job deregister Remote Control cleanly); the portal's own cancel as the fallback */
async function stopWorker(state: RunState, notify: (k: Kind, t: string) => void, show: (t: string) => void, render: () => Promise<void>): Promise<void> {
  let done = false;
  try {
    const r = await portal.shell(commands.workerStop(state.run), { timeoutMs: 60_000, job: state.job });
    show(r.output);
    done = r.exitCode === 0;
  } catch (e) {
    show(`the tool's stop failed (${(e as Error).message}); cancelling through the portal`);
  }
  if (!done) {
    const jobs = await portal.activeJobs();
    const mine = jobs.jobs.find((j) => String(j.pbsid) === String(state.job));
    if (mine) {
      await portal.cancelJob(mine.cluster, mine.pbsid);
      show(`cancelled job ${state.job} on ${mine.cluster}`);
    } else show(`job ${state.job} is no longer listed by the portal`);
  }
  await clearRun();
  notify('ok', `Worker "${state.run}" (job ${state.job}) stopped.`);
  await render();
}

async function checksSection(settings: PortalSettings | undefined, prefs: Prefs, render: () => Promise<void>, run: (l: string, f: () => Promise<void>) => Promise<void>, notify: (k: Kind, t: string) => void): Promise<HTMLElement> {
  const last = await session.get<DiagReport>(CHECKS_KEY);
  const box = el('div', { class: 'card' });
  const list = el('ul', { class: 'checks' });
  const nodes = buildNodes();
  const byId = new Map((last?.reports ?? []).map((r) => [r.id, r]));
  const fixButton = (r: NodeReport): HTMLElement | null => {
    const a = r.fixAction;
    if (!a) return null;
    const label: Record<FixAction, string> = { 'open-onboarding': 'Open setup', 'connect-portal': 'Connect', 'open-portal': 'Open portal', 'open-shell': 'Open shell', 'setup-cluster': 'Set up', 'run-probe': 'Run probe', acknowledge: 'Acknowledge', 'sign-in-claude': 'Sign in on the cluster' };
    return el('button', { class: 'small', text: label[a], onClick: () => fix(a) });
  };
  const fix = async (a: FixAction) => {
    if (a === 'open-onboarding') return openOnboarding();
    if (a === 'open-portal') return openPortalTab().catch((e) => notify('fail', e.message));
    if (a === 'open-shell' || a === 'sign-in-claude') return openShellTab().then(() => notify('info', `In the shell tab, run ${commands.claudeLogin} and then ${commands.claudeConsent} yourself.`)).catch((e) => notify('fail', e.message));
    if (a === 'run-probe') return run('Submitting the probe job', async () => { const r = await portal.shell(commands.probe(), { timeoutMs: 60_000 }); const id = parseJobId(r.output); notify(id ? 'ok' : 'warn', id ? `Probe job ${id} submitted; check again in about five minutes.` : `probe: ${r.output.slice(0, 160)}`); });
    notify('info', a === 'acknowledge' ? 'Use the "Before a start" section above.' : 'Use the buttons above.');
  };
  for (const n of nodes) {
    const r = byId.get(n.id);
    const status = r?.status ?? 'skipped';
    const tagClass = status === 'ok' || status === 'repaired' ? 'ok' : status === 'warn' ? 'warn' : status === 'fail' ? 'fail' : 'muted';
    list.append(
      el('li', {},
        el('span', { class: `tag ${tagClass}`, text: r ? status.toUpperCase() : '—' }),
        el('div', {},
          el('div', {}, el('strong', { text: `${CHECK_IDS.indexOf(n.id) + 1}. ${n.title}` }), r ? el('span', { class: 'muted small', text: ` ${r.detail}` }) : el('span', { class: 'muted small', text: ` ${n.assumption}` })),
          r && (status === 'fail' || status === 'blocked') ? el('div', { class: 'fix' }, status === 'blocked' ? `Blocked by ${r.rootCause}.` : `Fix: ${n.manualFix} `, status === 'fail' ? fixButton(r) : null) : null,
        ),
      ),
    );
  }
  add(box,
    el('div', { class: 'row' },
      el('button', { class: 'primary', text: 'Run the checks', onClick: () => run('Running the checks', () => runChecks(settings, prefs, false, render)) }),
      el('button', { text: 'Quick checks (no shell, no probe)', onClick: () => run('Running the quick checks', () => runChecks(settings, prefs, true, render)) }),
      last ? el('button', { text: 'Copy report', onClick: () => navigator.clipboard.writeText(formatReport(last)).then(() => notify('ok', 'Report copied.')) }) : null,
      last ? el('span', { class: 'muted small', text: `last run ${fmtTime(last.finished)}: ${last.ok ? 'everything works' : `${last.rootCauses.length} thing(s) to fix`}` }) : null,
    ),
    list,
  );
  return box;
}

async function runChecks(settings: PortalSettings | undefined, prefs: Prefs, quick: boolean, render: () => Promise<void>): Promise<void> {
  const ctx: DiagCtx = {
    env: {
      version: version(),
      now: () => new Date(),
      local,
      session,
      keys: BUNDLED_KEYS,
      hasOriginPermission: (origin) => originGranted(origin),
      portalAlive,
      portal: () => portal,
    },
    settings,
    prefs,
    cache: {},
  };
  const report = await runDiagnostics(buildNodes(), ctx, { quick, timeoutMs: 120_000 });
  await session.set(CHECKS_KEY, report);
  await render();
}

function logsSection(state: RunState | undefined): HTMLElement {
  const box = el('div', { class: 'card' });
  add(box, el('h3', { text: 'rc.log (the Remote Control process)' }));
  add(box, state?.rc_tail ? el('pre', { text: state.rc_tail }) : el('p', { class: 'muted small', text: state ? 'Nothing written yet.' : 'No run.' }));
  return box;
}

async function auditSection(notify: (k: Kind, t: string) => void): Promise<HTMLElement> {
  const box = el('div', { class: 'card' });
  let records: AuditRecord[] = [];
  try {
    records = (await portal.auditRecords()) as AuditRecord[];
  } catch {
    // the page script is not reachable; read the log straight from storage
    records = ((await local.get<{ records?: AuditRecord[] }>('bridge.audit'))?.records ?? []) as AuditRecord[];
  }
  const recent = records.slice(-40).reverse();
  const table = el('table', { class: 'audit' }, el('thead', {}, el('tr', {}, el('th', { text: 'time (UTC)' }), el('th', { text: 'method' }), el('th', { text: 'endpoint' }), el('th', { text: 'job' }), el('th', { text: 'bytes' }), el('th', { text: 'outcome' }))));
  const body = el('tbody');
  for (const r of recent) body.append(el('tr', {}, el('td', { text: r.ts.replace('T', ' ').slice(0, 19) }), el('td', { text: r.method }), el('td', { text: r.endpoint }), el('td', { text: r.job ?? '' }), el('td', { text: String(r.bytes) }), el('td', { text: r.outcome })));
  table.append(body);
  add(box,
    el('h3', { text: `Audit log (${records.length} request(s) on this device; never sent anywhere)` }),
    el('div', { class: 'row' },
      el('button', { text: 'Export (JSON lines)', onClick: () => downloadText(`ashley-bridge-audit-${new Date().toISOString().slice(0, 10)}.jsonl`, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'application/x-ndjson') }),
      el('button', { text: 'Clear', onClick: async () => { await local.set('bridge.audit', { v: 1, records: [], last: {} }); notify('info', 'Audit log cleared.'); } }),
    ),
    recent.length ? table : el('p', { class: 'muted small', text: 'No requests yet.' }),
  );
  return box;
}

function settingsSection(settings: PortalSettings | undefined, prefs: Prefs, render: () => Promise<void>): HTMLElement {
  const box = el('div', { class: 'card' });
  const shellHost = el('input', { type: 'text', value: settings?.shell_host ?? 'default', 'aria-label': 'Shell host' });
  const site = el('input', { type: 'text', value: settings?.site ?? '', 'aria-label': 'Site profile' });
  const mode = el('select', { 'aria-label': 'Permission mode' },
    el('option', { value: 'default', text: 'supervised (default): every command waits for your approval', selected: prefs.permission_mode === 'default' }),
    el('option', { value: 'acceptEdits', text: 'accept file edits without asking (commands still ask)', selected: prefs.permission_mode === 'acceptEdits' }),
    el('option', { value: 'plan', text: 'plan only', selected: prefs.permission_mode === 'plan' }),
  );
  add(box,
    el('div', { class: 'row' }, el('label', { text: 'Shell host (the segment after /pun/sys/shell/ssh/; "default" lets the portal choose): ' }, shellHost)),
    el('div', { class: 'row' }, el('label', { text: 'Site profile name (hpcworker install --profile; the session name starts with the profile\'s site): ' }, site)),
    el('div', { class: 'row' }, el('label', { text: 'Worker permission mode: ' }, mode)),
    el('p', { class: 'muted small', text: 'Supervised mode is the default because several campuses require that an agent never runs a command without your approval. Choosing a broader mode is your decision. The worker name is set in "Before a start".' }),
    el('div', { class: 'row' }, el('button', {
      text: 'Save settings',
      onClick: async () => {
        if (settings) await local.set(PORTAL_KEY, { ...settings, shell_host: shellHost.value.trim() || 'default', site: site.value.trim() || settings.site } satisfies PortalSettings);
        await local.set(PREFS_KEY, { ...prefs, permission_mode: mode.value as Prefs['permission_mode'] } satisfies Prefs);
        await render();
      },
    })),
  );
  return box;
}
