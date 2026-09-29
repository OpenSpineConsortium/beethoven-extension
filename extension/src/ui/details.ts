// What sits under "Details" in the strip: the worker card with its buttons (set up, probe, start,
// stop, read status), the seventeen checks, rc.log, the audit log, the access card, the settings
// and the Google Drive step. Everything the panel knows about the cluster comes through the
// portal page script; everything it remembers is in storage.session except preferences.
import { browser } from 'wxt/browser';
import type { RunState } from '../entrypoints/background';
import { clearRecordsKeepingClocks, type AuditRecord } from '../core/audit';
import { buildNodes, CHECK_IDS, type DiagCtx } from '../core/checks';
import { commands, consentSourceWords, parseJobId } from '../core/contract';
import { runDiagnostics, formatReport, type DiagReport, type FixAction, type NodeReport } from '../core/diagnostics';
import { PLAN_CLASS_DISCLOSURE, STATEMENT_TEXT, statementFor, STATEMENTS_KEY, type Statements } from '../core/disclosure';
import { environmentLinkOf } from '../core/facts';
import { installFramework } from '../core/install';
import { AUTO_START_KEY, CHECKS_KEY, PORTAL_KEY, PREFS_KEY, PROBE_KEY, type AutoStartNote, type PortalSettings, type Prefs, type ProbeNote } from '../core/keys';
import { stopWorker as stopOnCluster, workerLive } from '../core/worker';
import { assetUrl, local, session, version } from '../ext/storage';
import { add, downloadText, el, fmtTime } from './dom';
import { clearRun, markStopped, openEnvironment, openOptions, openPortalTab, originGranted, portal, portalAlive, refreshRun, startWorkerNow } from './rpc';
import { accessCard, accessSummary, driveStep } from './sections';

export type Kind = 'ok' | 'warn' | 'fail' | 'info';
export type Notify = (kind: Kind, text: string) => void;
export type Runner = (label: string, fn: () => Promise<void>) => Promise<void>;

/** the step the strip should jump to when a check's fix button is pressed and the strip owns the fix */
export type StripFix = 'acknowledge' | 'sign-in-claude';

export interface DetailsEnv {
  settings: PortalSettings | undefined;
  prefs: Prefs;
  state: RunState | undefined;
  alive: boolean;
  notify: Notify;
  run: Runner;
  render: () => Promise<void>;
  /** hand a fix back to the strip (statement, sign-in) */
  stripFix: (f: StripFix) => void;
}

export async function detailsSections(env: DetailsEnv): Promise<HTMLElement[]> {
  const summary = await accessSummary();
  return [
    el('h3', { text: 'Your worker' }),
    workerCard(env),
    actionsCard(env, summary.termsOk && summary.access.ok && !summary.versionRevoked),
    el('h3', { text: 'Checks' }),
    await checksSection(env),
    el('h3', { text: 'Where your work goes' }),
    await statementReview(env),
    el('h3', { text: 'Logs' }),
    logsSection(env.state),
    await auditSection(env),
    el('h3', { text: 'Access and agreement' }),
    accessCard(summary, env.notify, () => void env.render(), () => void openOptions()),
    el('h3', { text: 'Settings' }),
    settingsSection(env, await session.get<AutoStartNote>(AUTO_START_KEY)),
    el('h3', { text: 'Google Drive (optional)' }),
    await driveStep(env.render, true),
    el('p', { class: 'muted small', text: `Ashley Bridge ${version()}. It talks only to ${env.settings?.hostname ?? 'the portal you connect'}, reads the job's files at most once a minute, asks the scheduler at most once a minute, never deletes anything on the cluster, and keeps an audit log of every request on this device.` }),
  ];
}

function workerCard(env: DetailsEnv): HTMLElement {
  const { settings, state, notify, render } = env;
  const card = el('div', { class: 'card' });
  if (!settings) {
    add(card, el('p', { class: 'muted', text: 'No portal connected yet.' }));
    return card;
  }
  if (!state) {
    add(card, el('p', { class: 'muted', text: 'No worker started from this browser session.' }));
    return card;
  }
  const st = state.status;
  const name = state.connection?.session_name || st?.session_name || state.registration?.session_name;
  const url = environmentLinkOf(state);
  const job = st?.job || state.job;
  const live = workerLive(st);
  const login = st?.claude_login;
  const registered = !!url || st?.state === 'online';
  add(card,
    el('div', {}, el('strong', { text: `Worker "${state.run}", job ${job}` }), el('span', { class: 'muted', text: `${job !== state.job ? ` (started as job ${state.job}; the worker re-submits itself)` : ''}${st?.node ? ` on ${st.node}` : ''}${st?.state ? `: ${st.state}` : ': waiting for the job to write status.json'}${state.started_by === 'auto' ? ' (started because your portal opened)' : ''}` })),
    st?.message ? el('div', { class: 'small', text: st.message }) : null,
    url
      ? el('div', { class: 'row' },
          el('button', { class: 'success', text: 'Open in Claude', title: url, onClick: () => void openEnvironment() }),
          el('button', { text: 'Copy link', onClick: () => navigator.clipboard.writeText(url).then(() => notify('ok', 'Link copied.'), () => notify('warn', 'The link could not be copied; use the button instead.')) }),
        )
      : null,
    name && registered
      ? el('p', {}, 'Find ', el('span', { class: 'session-name', text: name }), ' under Code in the Claude app', url ? ', or open it here with the green button.' : '.')
      : el('p', { class: 'muted small', text: 'The session name and the "Open in Claude" button appear here once the job has registered with Remote Control.' }),
    login ? el('div', { class: 'muted small', text: `Claude sign-in on the cluster: ${login.loggedIn ? `yes${login.email ? ` (${login.email}${login.subscriptionType ? `, ${login.subscriptionType}` : ''})` : ''}` : 'no'}${st?.consent !== undefined ? `; Remote Control answer ${st.consent ? consentSourceWords(st.consent_source) || 'on record' : 'not recorded'}` : ''}${st?.restarts ? `; restarts: ${st.restarts}` : ''}` }) : null,
    st?.chain !== undefined ? el('div', { class: 'muted small', text: st.chain ? (st.next_job ? `Stays on: job ${st.next_job} is queued to take over at the wall time.` : `Stays on: the job queues its successor before it ends${st.chain_note ? ` (${st.chain_note})` : ''}.`) : 'Runs one job at a time (the always-on chain is off for this worker).' }) : null,
    st?.state === 'preempted' ? el('div', { class: 'warn', text: 'The job ended (wall time or preemption). A worker that stays on hands over to the job it submitted after itself; otherwise it is started again and resumes the same session within seven days.' }) : null,
    st?.state === 'stopped' ? el('div', { class: 'muted small', text: 'Stopped: the job left on its own and ended its chain.' }) : null,
    state.error ? el('div', { class: 'warn small', text: `last read failed: ${state.error}` }) : null,
    el('div', { class: 'row' },
      el('span', { class: 'muted small', text: `files read ${fmtTime(state.updated)} (at most once a minute)${st?.updated_at ? `; job heartbeat ${fmtTime(st.updated_at)}` : ''}` }),
      !live && st ? el('button', { class: 'small', text: 'Forget this run', title: 'Stops showing it here; nothing on the cluster changes', onClick: async () => { await clearRun(); await render(); } }) : null,
    ),
  );
  return card;
}

/**
 * The data statement stays readable after it was made: the strip shows it only while it is the
 * step, so "Review the statement" here unfolds the disclosure and the exact sentence that was
 * ticked, with the date. Making it again (a new workspace, a change of mind) is on the setup page.
 */
async function statementReview(env: DetailsEnv): Promise<HTMLElement> {
  const name = env.prefs.worker_name;
  const ack = statementFor(await local.get<Statements>(STATEMENTS_KEY), name);
  const box = el('div', { class: 'card' });
  const text = el('div', { class: 'statement' },
    el('ul', { class: 'small' }, ...PLAN_CLASS_DISCLOSURE.map((s) => el('li', { text: s }))),
    el('p', { class: 'small' }, el('strong', { text: 'The statement: ' }), STATEMENT_TEXT),
  );
  const review = el('details', {});
  review.append(el('summary', { text: 'Review the statement' }), text);
  add(box,
    ack
      ? el('div', { class: 'ok small', text: `Made for worker "${name}" on ${ack.acknowledged_at.slice(0, 10)}${ack.consent_written_at ? '; the answer file for your worker is written on the cluster.' : '; the answer file for your worker is written at the next start.'}` })
      : el('div', { class: 'muted small', text: `Not made yet for worker "${name}": the strip asks for it before the first start.` }),
    review,
    el('div', { class: 'row' },
      ack
        ? el('button', { class: 'small', text: 'Make it again on the setup page', onClick: () => void openOptions() })
        : el('button', { class: 'small', text: 'Make the statement', onClick: () => env.stripFix('acknowledge') }),
    ),
  );
  return box;
}

function actionsCard(env: DetailsEnv, approved: boolean): HTMLElement {
  const { settings, state, alive, notify, run, render } = env;
  const out = el('pre', { hidden: true });
  const show = (text: string) => {
    out.hidden = false;
    out.textContent = text;
  };
  const ready = !!settings && alive;
  const occupied = !!state && (!state.status || workerLive(state.status));
  const box = el('div', { class: 'card' });
  add(box,
    el('div', { class: 'row' },
      el('button', { disabled: !ready || !approved, text: 'Set up the cluster again', title: 'Uploads the framework files to ~/.hpcworker through the portal and runs its install once', onClick: () => run('Setting up the cluster', async () => { const r = await installFramework(portal, { site: settings!.site, fetchAsset: (p) => fetch(assetUrl(p)), onProgress: show }); notify(r.ok ? 'ok' : 'fail', r.ok ? 'The framework is installed.' : `The install command ended with exit ${r.exitCode}; see its output.`); }) }),
      el('button', { disabled: !ready || !approved, text: 'Run the probe job again', title: 'Submits a short job (ten minutes at most) that tests the compute node; the checks read its report', onClick: () => run('Submitting the probe job', async () => { const r = await portal.shell(commands.probe(), { timeoutMs: 60_000 }); show(r.output); const id = parseJobId(r.output); if (id) await local.set(PROBE_KEY, { submitted_at: new Date().toISOString(), job: id } satisfies ProbeNote); notify(id ? 'ok' : 'warn', id ? `Probe job ${id} submitted. The checks read its report once it has finished (about ten minutes).` : `The probe command ended with exit ${r.exitCode} and printed no job id; see its output.`); }) }),
      el('button', { disabled: !settings, text: 'Sign in on the cluster', title: 'Opens the sign-in terminal in the strip', onClick: () => env.stripFix('sign-in-claude') }),
    ),
    el('div', { class: 'row' },
      el('button', { class: 'primary', disabled: !ready || !approved || occupied, text: 'Start worker', onClick: () => run('Starting the worker', async () => { const r = await startWorkerNow(); notify(r.started ? 'ok' : 'warn', r.started ? (r.alreadyRunning ? `Worker already has job ${r.job}; nothing new was submitted.` : `Job ${r.job} submitted.`) : `Not started: ${r.reason ?? 'a step is missing'}`); await render(); }) }),
      el('button', { class: 'danger', disabled: !ready || !state, text: 'Stop', title: 'Writes the stop file; the job leaves on its own and ends its chain', onClick: () => run('Stopping the worker', async () => { const o = await stopOnCluster(portal, state!); show([o.note, o.toolStop?.output].filter(Boolean).join('\n')); await markStopped(); notify('ok', `Worker "${state!.run}": ${o.note}`); await render(); }) }),
      el('button', { disabled: !state, text: 'Read status now', onClick: () => run("Reading the job's files", async () => { await refreshRun(); await render(); }) }),
    ),
    !approved ? el('p', { class: 'warn small', text: 'Accept the terms and have your access approved (the strip above says where you stand) to enable the buttons.' }) : null,
    out,
  );
  return box;
}

async function checksSection(env: DetailsEnv): Promise<HTMLElement> {
  const { settings, prefs, notify, run, render } = env;
  const last = await session.get<DiagReport>(CHECKS_KEY);
  const box = el('div', { class: 'card' });
  const list = el('ul', { class: 'checks' });
  const nodes = buildNodes();
  const byId = new Map((last?.reports ?? []).map((r) => [r.id, r]));
  const fixButton = (r: NodeReport): HTMLElement | null => {
    const a = r.fixAction;
    if (!a) return null;
    const label: Record<FixAction, string> = { 'open-onboarding': 'Open setup', 'connect-portal': 'Connect', 'open-portal': 'Open portal', 'open-shell': 'Sign in on the cluster', 'setup-cluster': 'Set up', 'run-probe': 'Run probe', acknowledge: 'Make the statement', 'sign-in-claude': 'Sign in on the cluster' };
    return el('button', { class: 'small', text: label[a], onClick: () => fix(a) });
  };
  const fix = async (a: FixAction) => {
    if (a === 'open-onboarding' || a === 'connect-portal') return openOptions();
    if (a === 'open-portal') return openPortalTab().catch((e) => notify('fail', e.message));
    if (a === 'open-shell' || a === 'sign-in-claude') return env.stripFix('sign-in-claude');
    if (a === 'acknowledge') return env.stripFix('acknowledge');
    if (a === 'run-probe') return run('Submitting the probe job', async () => { const r = await portal.shell(commands.probe(), { timeoutMs: 60_000 }); const id = parseJobId(r.output); if (id) await local.set(PROBE_KEY, { submitted_at: new Date().toISOString(), job: id } satisfies ProbeNote); notify(id ? 'ok' : 'warn', id ? `Probe job ${id} submitted; check again in about ten minutes.` : `probe: ${r.output.slice(0, 160)}`); });
    notify('info', 'Use the buttons above.');
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
  add(box, el('h4', { text: 'rc.log (the Remote Control process)' }));
  add(box, state?.rc_tail ? el('pre', { text: state.rc_tail }) : el('p', { class: 'muted small', text: state ? 'Nothing written yet.' : 'No run.' }));
  return box;
}

export async function auditRecords(): Promise<AuditRecord[]> {
  try {
    return (await portal.auditRecords()) as AuditRecord[];
  } catch {
    // the page script is not reachable; read the log straight from storage
    return ((await local.get<{ records?: AuditRecord[] }>('bridge.audit'))?.records ?? []) as AuditRecord[];
  }
}

export async function auditSection(env: { notify: Notify; render: () => Promise<void> }): Promise<HTMLElement> {
  const box = el('div', { class: 'card' });
  const records = await auditRecords();
  const recent = records.slice(-40).reverse();
  const table = el('table', { class: 'audit' }, el('thead', {}, el('tr', {}, el('th', { text: 'time (UTC)' }), el('th', { text: 'method' }), el('th', { text: 'endpoint' }), el('th', { text: 'job' }), el('th', { text: 'bytes' }), el('th', { text: 'outcome' }))));
  const body = el('tbody');
  for (const r of recent) body.append(el('tr', {}, el('td', { text: r.ts.replace('T', ' ').slice(0, 19) }), el('td', { text: r.method }), el('td', { text: r.endpoint }), el('td', { text: r.job ?? '' }), el('td', { text: String(r.bytes) }), el('td', { text: r.outcome })));
  table.append(body);
  add(box,
    el('h4', { text: `Audit log (${records.length} request(s) on this device; never sent anywhere)` }),
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
          env.notify('info', 'Audit log cleared; the once-a-minute clocks are kept.');
          await env.render();
        },
      }),
    ),
    recent.length ? table : el('p', { class: 'muted small', text: 'No requests yet.' }),
  );
  return box;
}

export function settingsSection(env: { settings: PortalSettings | undefined; prefs: Prefs; render: () => Promise<void> }, autoNote: AutoStartNote | undefined): HTMLElement {
  const { settings, prefs, render } = env;
  const box = el('div', { class: 'card' });
  const shellHost = el('input', { type: 'text', value: settings?.shell_host ?? 'default', 'aria-label': 'Shell host' });
  const site = el('input', { type: 'text', value: settings?.site ?? '', 'aria-label': 'Site profile' });
  const mode = el('select', { 'aria-label': 'Permission mode' },
    el('option', { value: 'default', text: 'supervised (default): every command waits for your approval', selected: prefs.permission_mode === 'default' }),
    el('option', { value: 'acceptEdits', text: 'accept file edits without asking (commands still ask)', selected: prefs.permission_mode === 'acceptEdits' }),
    el('option', { value: 'plan', text: 'plan only', selected: prefs.permission_mode === 'plan' }),
  );
  const auto = el('input', { type: 'checkbox', id: 'auto-start', checked: prefs.auto_start });
  const openClaude = el('input', { type: 'checkbox', id: 'open-claude', checked: prefs.open_claude_on_connect });
  add(box,
    el('div', { class: 'row' }, el('label', { text: 'Shell host (the segment after /pun/sys/shell/ssh/; "default" lets the portal choose): ' }, shellHost)),
    el('div', { class: 'row' }, el('label', { text: 'Site profile name (hpcworker install --profile; the session name the framework asks for starts with it): ' }, site)),
    el('div', { class: 'row' }, el('label', { text: 'Worker permission mode: ' }, mode)),
    el('p', { class: 'muted small', text: 'Supervised mode is the default because several campuses require that an agent never runs a command without your approval. Choosing a broader mode is your decision. The worker name is set with the data statement.' }),
    el('div', { class: 'box' }, auto, el('label', { for: 'auto-start' }, el('strong', { text: 'Start my worker when I open my portal' }), ' (on unless you turn it off). When on, Ashley Bridge starts your worker as soon as your portal tab connects and no worker of yours is alive, provided the agreement, your access, the tool, the sign-in and the data statement are in order. It asks the login node at most once a minute, never more; a start that would break that rule waits for the next minute. Your worker stays on by itself once started: the job submits its successor before its wall time ends, until you press Stop.')),
    el('div', { class: 'box' }, openClaude, el('label', { for: 'open-claude' }, el('strong', { text: 'Open claude.ai when the worker connects' }), ' (on unless you turn it off). The first time this browser sees your worker\'s link, it opens it in a new tab; afterwards the green button opens it.')),
    autoNote ? el('div', { class: 'muted small', text: `Last automatic start attempt ${fmtTime(autoNote.attempted_at)}: ${autoNote.outcome}` }) : null,
    el('div', { class: 'row' }, el('button', {
      text: 'Save settings',
      onClick: async () => {
        if (settings) await local.set(PORTAL_KEY, { ...settings, shell_host: shellHost.value.trim() || 'default', site: site.value.trim() || settings.site } satisfies PortalSettings);
        await local.set(PREFS_KEY, { ...prefs, permission_mode: mode.value as Prefs['permission_mode'], auto_start: auto.checked, open_claude_on_connect: openClaude.checked } satisfies Prefs);
        await render();
      },
    })),
  );
  return box;
}

/** the tab id of the extension's own pages is not needed anywhere; a small helper for the strip's copy button */
export function copyText(text: string, notify: Notify): void {
  navigator.clipboard.writeText(text).then(() => notify('ok', 'Link copied.'), () => notify('warn', 'The link could not be copied; use the button instead.'));
}

export { browser };
