// The monitoring panel (Chrome/Edge side panel, Firefox sidebar, popup fallback): the seventeen
// checks as a list, the buttons (set up, probe, sign in to Claude on the cluster, start, stop),
// the run's state with the green "Open in Claude" button and the session name, the rc.log tail,
// the audit log, the licence and agreement status, and the settings. Everything it knows about
// the cluster comes through the portal page script; everything it remembers is in
// storage.session except preferences.
import { browser } from 'wxt/browser';
import type { RunState } from '../entrypoints/background';
import { clearRecordsKeepingClocks, type AuditRecord } from '../core/audit';
import { buildNodes, CHECK_IDS, type DiagCtx } from '../core/checks';
import { commands, consentSourceWords, isEnvironmentUrl, parseJobId, paths } from '../core/contract';
import { runDiagnostics, formatReport, type DiagReport, type FixAction, type NodeReport } from '../core/diagnostics';
import { ACK_KEY, type Acknowledgement } from '../core/disclosure';
import { AUTO_START_KEY, CHECKLIST_KEY, CHECKS_KEY, PORTAL_KEY, PREFS_KEY, type AutoStartNote, type Checklist, type PortalSettings, type Prefs } from '../core/keys';
import { startWorker as startOnCluster, stopWorker as stopOnCluster, workerLive } from '../core/worker';
import { BUNDLED_KEYS } from '../licensing/license';
import { assetUrl, local, portalSettings, prefs as loadPrefs, session, version } from '../ext/storage';
import { add, clear, downloadText, el, fmtTime } from './dom';
import { activeTabOrigin, clearRun, currentRun, openOnboarding, openPanel, openPortalTab, openShellTab, originGranted, portal, portalAlive, refreshRun, setRun } from './rpc';
import { ackSection, connectSection, driveStep, licenceLine, licenceSummary } from './sections';

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
    const checklist = (await local.get<Checklist>(CHECKLIST_KEY)) ?? {};
    root.append(el('h1', { text: 'Ashley Bridge' }), notice);
    root.append(connectSection(settings, render, notify, active));
    if (mode === 'popup') {
      root.append(
        statusCard(settings, state, alive, granted, notify, render),
        el('div', { class: 'row' },
          el('button', { class: 'primary', text: 'Open the panel', onClick: async () => { if (!(await openPanel())) await browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html') }); window.close(); } }),
          el('button', { text: 'Setup page', onClick: () => openOnboarding() }),
        ),
      );
      return;
    }
    root.append(el('h2', { text: 'Your worker' }), statusCard(settings, state, alive, granted, notify, render));
    if (!checklist.drive_connected_at) root.append(await driveStep(render, true));
    root.append(actions(settings, prefs, state, summary, alive, render, run, notify));
    root.append(el('h2', { text: 'Before a start' }), await ackSection(render));
    root.append(el('h2', { text: 'Checks' }), await checksSection(settings, prefs, render, run, notify));
    root.append(el('h2', { text: 'Logs' }), logsSection(state), await auditSection(notify, render));
    root.append(el('h2', { text: 'Licence and agreement' }), licenceLine(summary, () => openOnboarding()));
    root.append(el('h2', { text: 'Settings' }), settingsSection(settings, prefs, await session.get<AutoStartNote>(AUTO_START_KEY), render));
    root.append(el('p', { class: 'muted small', text: `Ashley Bridge ${version()}. It talks only to ${settings?.hostname ?? 'the portal you connect'}, reads the job's files at most once a minute, asks the scheduler at most once a minute, never deletes anything on the cluster, and keeps an audit log of every request on this device.` }));
  };

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (sender.id !== browser.runtime.id) return undefined;
    if ((message as { type?: string })?.type === 'run.changed') void render();
    return undefined;
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[PORTAL_KEY] || changes[PREFS_KEY] || changes[CHECKLIST_KEY])) void render();
    if (area === 'session' && (changes[ACK_KEY] || changes[AUTO_START_KEY])) void render();
  });
  await render();
}

/** the environment link the job reported, only when it is Claude's own Code page for an environment */
function environmentLink(state: RunState): string | undefined {
  const raw = state.connection?.environment_url ?? state.status?.environment_url ?? state.registration?.environment_url ?? state.connection?.session_url ?? state.status?.session_url;
  return isEnvironmentUrl(raw) ? raw : undefined;
}

function statusCard(settings: PortalSettings | undefined, state: RunState | undefined, alive: boolean, granted: boolean, notify: (k: Kind, t: string) => void, render: () => Promise<void>): HTMLElement {
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
  const name = state.connection?.session_name || st?.session_name || state.registration?.session_name;
  const url = environmentLink(state);
  const job = st?.job || state.job;
  const live = workerLive(st);
  const login = st?.claude_login;
  // before registration the job carries only the name it asked for; the student looks for the one Claude Code chose
  const registered = !!url || st?.state === 'online';
  add(card,
    el('div', {}, el('strong', { text: `Worker "${state.run}", job ${job}` }), el('span', { class: 'muted', text: `${job !== state.job ? ` (started as job ${state.job}; the worker re-submits itself)` : ''}${st?.node ? ` on ${st.node}` : ''}${st?.state ? `: ${st.state}` : ': waiting for the job to write status.json'}${state.started_by === 'auto' ? ' (started because your portal opened)' : ''}` })),
    st?.message ? el('div', { class: 'small', text: st.message }) : null,
    url
      ? el('div', { class: 'row' },
          el('button', { class: 'success', text: 'Open in Claude', title: url, onClick: () => void browser.tabs.create({ url }) }),
          el('button', { text: 'Copy link', onClick: () => navigator.clipboard.writeText(url).then(() => notify('ok', 'Link copied.'), () => notify('warn', 'The link could not be copied; use the button instead.')) }),
        )
      : null,
    name && registered
      ? el('p', {}, 'Find ', el('span', { class: 'session-name', text: name }), ' under Code in the Claude app', url ? ', or open it here with the green button.' : '.')
      : el('p', { class: 'muted small', text: 'The session name and the "Open in Claude" button appear here once the job has registered with Remote Control.' }),
    login ? el('div', { class: 'muted small', text: `Claude sign-in on the cluster: ${login.loggedIn ? `yes${login.email ? ` (${login.email}${login.subscriptionType ? `, ${login.subscriptionType}` : ''})` : ''}` : 'no'}${st?.consent !== undefined ? `; Remote Control answer ${st.consent ? consentSourceWords(st.consent_source) || 'on record' : 'not recorded'}` : ''}${st?.restarts ? `; restarts: ${st.restarts}` : ''}` }) : null,
    st?.chain !== undefined ? el('div', { class: 'muted small', text: st.chain ? (st.next_job ? `Stays on: job ${st.next_job} is queued to take over at the wall time.` : `Stays on: the job queues its successor before it ends${st.chain_note ? ` (${st.chain_note})` : ''}.`) : 'Runs one job at a time (the always-on chain is off for this worker).' }) : null,
    st?.state === 'need_login' ? el('div', { class: 'fail', text: 'The Claude sign-in on the cluster has ended. Use "Sign in to Claude on the cluster" and run the login command again; nothing else will help.' }) : null,
    st?.state === 'need_consent' ? el('div', { class: 'fail', text: 'Claude Code still asks its one-time Remote Control question. Use "Sign in to Claude on the cluster" and answer it yourself there; the job is waiting.' }) : null,
    st?.state === 'preempted' ? el('div', { class: 'warn', text: 'The job ended (wall time or preemption). A worker that stays on hands over to the job it submitted after itself; otherwise start it again within four hours and it resumes the same session.' }) : null,
    st?.state === 'stopped' ? el('div', { class: 'muted small', text: 'Stopped: the job left on its own and ended its chain.' }) : null,
    state.error ? el('div', { class: 'warn small', text: `last read failed: ${state.error}` }) : null,
    el('div', { class: 'row' },
      el('span', { class: 'muted small', text: `files read ${fmtTime(state.updated)} (at most once a minute)${st?.updated_at ? `; job heartbeat ${fmtTime(st.updated_at)}` : ''}` }),
      !live && st ? el('button', { class: 'small', text: 'Forget this run', title: 'Stops showing it here; nothing on the cluster changes', onClick: async () => { await clearRun(); await render(); } }) : null,
    ),
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
  // a run with no status yet may still be queued; a live one must not be started twice
  const occupied = !!state && (!state.status || workerLive(state.status));
  const box = el('div', { class: 'card' });
  add(box,
    el('div', { class: 'row' },
      el('button', { disabled: !ready || !licensed, text: 'Set up the cluster', title: 'Uploads the framework files to ~/.hpcworker through the portal and runs its install once', onClick: () => run('Setting up the cluster', () => setupCluster(settings!, show, notify)) }),
      el('button', { disabled: !ready || !licensed, text: 'Run the probe job', title: 'Submits a five-minute job that tests the compute node; the checks read its report', onClick: () => run('Submitting the probe job', async () => { const r = await portal.shell(commands.probe(), { timeoutMs: 60_000 }); show(r.output); const id = parseJobId(r.output); notify(id ? 'ok' : 'warn', id ? `Probe job ${id} submitted. Run the checks again once it has finished (about five minutes).` : `The probe command ended with exit ${r.exitCode} and printed no job id; see its output.`); }) }),
      el('button', { disabled: !settings, text: 'Sign in to Claude on the cluster', onClick: () => run('Opening the portal shell', async () => { await openShellTab(); show(signInText()); }) }),
    ),
    el('div', { class: 'row' },
      el('button', { class: 'primary', disabled: !ready || !licensed || occupied, text: 'Start worker', onClick: () => run('Starting the worker', () => startWorker(settings!, prefs, notify, show, render)) }),
      el('button', { class: 'danger', disabled: !ready || !state, text: 'Stop', title: 'Writes the stop file; the job leaves on its own and ends its chain', onClick: () => run('Stopping the worker', () => stopWorker(state!, notify, show, render)) }),
      el('button', { disabled: !state, text: 'Read status now', onClick: () => run("Reading the job's files", async () => { await refreshRun(); await render(); }) }),
    ),
    !licensed ? el('p', { class: 'warn small', text: summary.versionRevoked ? 'This version has been withdrawn; update to continue.' : 'Accept the terms and enter your key on the setup page to enable the buttons.' }) : null,
    out,
  );
  return box;
}

/** what the student types in the portal's own shell, in one sitting; the extension never types it */
function signInText(): string {
  return [
    'In the shell tab that opened, type this command yourself (Ashley Bridge never types it for you):',
    '',
    `  ${commands.claudeLogin}`,
    "      One sitting: Claude Code's own sign-in on a compute node (open the link it prints, sign in, paste the code back).",
    '      Then, if you have not answered "Enable Remote Control?" before, Claude Code starts once in your workspace: answer y, and',
    '      when the session appears press Ctrl-C. Claude Code records your answer itself; the framework only reads that it did.',
    '',
    `  ${commands.claudeConsent}`,
    '      Only if you signed in earlier and skipped the question: it explains and does the same.',
    '',
    'Then come back here and run the checks.',
  ].join('\n');
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
  const out = await startOnCluster(portal, { name: prefs.worker_name, permissionMode: prefs.permission_mode, site: settings.site, ack });
  show(out.output);
  await setRun(out.stateDir, prefs.worker_name, out.job, out.site);
  notify('ok', out.alreadyRunning ? `Worker "${prefs.worker_name}" already has job ${out.job}; nothing new was submitted.` : `Job ${out.job} submitted. When it registers, the green "Open in Claude" button appears above, with the session name to find under Code in the Claude app.`);
  await render();
}

/** the framework's stop file through the Files app, then the tool's own stop once if the scheduler floor allows; the job ends itself */
async function stopWorker(state: RunState, notify: (k: Kind, t: string) => void, show: (t: string) => void, render: () => Promise<void>): Promise<void> {
  const out = await stopOnCluster(portal, state);
  show([out.note, out.toolStop?.output].filter(Boolean).join('\n'));
  await refreshRun();
  notify('ok', `Worker "${state.run}": ${out.note}`);
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
    if (a === 'open-shell' || a === 'sign-in-claude') return openShellTab().then(() => notify('info', `In the shell tab, run ${commands.claudeLogin} yourself (sign-in, then the Remote Control question, in one sitting).`)).catch((e) => notify('fail', e.message));
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

async function auditSection(notify: (k: Kind, t: string) => void, render: () => Promise<void>): Promise<HTMLElement> {
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
      el('button', {
        text: 'Clear',
        title: 'Forgets the records; the once-a-minute clocks are kept',
        onClick: async () => {
          // the chokepoint's own clear keeps the per-class clocks; so does the fallback when the page script is away
          try {
            await portal.auditClear();
          } catch {
            await clearRecordsKeepingClocks(local);
          }
          notify('info', 'Audit log cleared; the once-a-minute clocks are kept.');
          await render();
        },
      }),
    ),
    recent.length ? table : el('p', { class: 'muted small', text: 'No requests yet.' }),
  );
  return box;
}

function settingsSection(settings: PortalSettings | undefined, prefs: Prefs, autoNote: AutoStartNote | undefined, render: () => Promise<void>): HTMLElement {
  const box = el('div', { class: 'card' });
  const shellHost = el('input', { type: 'text', value: settings?.shell_host ?? 'default', 'aria-label': 'Shell host' });
  const site = el('input', { type: 'text', value: settings?.site ?? '', 'aria-label': 'Site profile' });
  const mode = el('select', { 'aria-label': 'Permission mode' },
    el('option', { value: 'default', text: 'supervised (default): every command waits for your approval', selected: prefs.permission_mode === 'default' }),
    el('option', { value: 'acceptEdits', text: 'accept file edits without asking (commands still ask)', selected: prefs.permission_mode === 'acceptEdits' }),
    el('option', { value: 'plan', text: 'plan only', selected: prefs.permission_mode === 'plan' }),
  );
  const auto = el('input', { type: 'checkbox', id: 'auto-start', checked: prefs.auto_start });
  add(box,
    el('div', { class: 'row' }, el('label', { text: 'Shell host (the segment after /pun/sys/shell/ssh/; "default" lets the portal choose): ' }, shellHost)),
    el('div', { class: 'row' }, el('label', { text: 'Site profile name (hpcworker install --profile; the session name the framework asks for starts with it): ' }, site)),
    el('div', { class: 'row' }, el('label', { text: 'Worker permission mode: ' }, mode)),
    el('p', { class: 'muted small', text: 'Supervised mode is the default because several campuses require that an agent never runs a command without your approval. Choosing a broader mode is your decision. The worker name is set in "Before a start".' }),
    el('div', { class: 'box' }, auto, el('label', { for: 'auto-start' }, el('strong', { text: 'Start my worker when I open my portal' }), ' (off unless you turn it on). When on, Ashley Bridge starts your worker as soon as your portal tab connects and no worker of yours is alive, provided the terms and key are in order and you have made the data statement in this browser session. It asks the login node at most once a minute, never more; a start that would break that rule waits for the next minute. Your worker stays on by itself once started: the job submits its successor before its wall time ends, until you press Stop.')),
    autoNote ? el('div', { class: 'muted small', text: `Last automatic start attempt ${fmtTime(autoNote.attempted_at)}: ${autoNote.outcome}` }) : null,
    el('div', { class: 'row' }, el('button', {
      text: 'Save settings',
      onClick: async () => {
        if (settings) await local.set(PORTAL_KEY, { ...settings, shell_host: shellHost.value.trim() || 'default', site: site.value.trim() || settings.site } satisfies PortalSettings);
        await local.set(PREFS_KEY, { ...prefs, permission_mode: mode.value as Prefs['permission_mode'], auto_start: auto.checked } satisfies Prefs);
        await render();
      },
    })),
  );
  return box;
}
