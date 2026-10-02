// The two pages a student never needs: "Details for your lab lead" (a sheet in the panel) and
// Settings (the options page after acceptance), as pure builders from what the background read.
// Details may name jobs, nodes, partitions, the scheduler and the tool: it is exempt from the rule that
// keeps those words from a student, and says so by its title.
import { LOGIN_SETUP_PROVEN, type SiteProfile, type StatusFile } from './contract';
import type { NodeReport } from './diagnostics';
import type { RunState } from './facts';
import type { Appearance, ChannelNote, PortalSettings, Prefs } from './keys';
import { WORDS, type ButtonView, type DetailsView, type SettingsView } from './model';
import { recordText, type TermsRecord } from './terms';

export interface DetailsInput {
  reports?: NodeReport[];
  running: boolean;
  run?: RunState;
  profile?: SiteProfile;
  settings?: PortalSettings;
  channel?: ChannelNote;
  /** the audit log's last lines, newest last */
  audit: string[];
  now: number;
}

const b = (label: string, action: ButtonView['action'], tone: ButtonView['tone'] = 'outline'): ButtonView => ({ label, tone, ...(action ? { action } : {}) });

function heartbeatAge(s: StatusFile | undefined, now: number): number | undefined {
  const t = s?.updated_at ? new Date(s.updated_at).getTime() : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 1000)) : undefined;
}

export function detailsView(i: DetailsInput): DetailsView {
  const D = WORDS.details;
  const s = i.run?.status;
  const items = (i.reports ?? []).map((r) => ({ id: r.id, title: r.title, ok: r.status === 'ok' || r.status === 'warn' || r.status === 'repaired' || r.status === 'skipped', ...(r.status === 'warn' ? { warn: true } : {}), ...(r.status === 'skipped' ? { skip: true } : {}), detail: `${r.detail}${r.rootCause ? ` (waits on ${r.rootCause})` : ''}${r.manualFix && r.status === 'fail' ? `. ${r.manualFix}` : ''}` }));
  const p = i.profile;
  const run: DetailsView['run'] = i.run
    ? {
        job: i.run.job,
        ...(i.run.next_job || s?.next_job ? { nextJob: i.run.next_job || s?.next_job } : {}),
        ...(p ? { partition: (p as Record<string, unknown>).partition_cpu_batch as string | undefined, qos: (p as Record<string, unknown>).qos_batch as string | undefined } : {}),
        ...(i.run.node || s?.node ? { node: (i.run.node || s?.node || '').trim() } : {}),
        ...(s?.scheduler_state || i.run.scheduler?.state ? { schedulerState: s?.scheduler_state || i.run.scheduler?.state } : {}),
        ...(s?.reason || i.run.scheduler?.reason ? { reason: s?.reason || i.run.scheduler?.reason } : {}),
        ...(s?.expected_start || i.run.scheduler?.expected_start ? { expectedStart: s?.expected_start || i.run.scheduler?.expected_start } : {}),
        ...(s?.checked_at || i.run.scheduler?.checked_at ? { checkedAt: s?.checked_at || i.run.scheduler?.checked_at } : {}),
        ...(s?.submitted_at ? { submittedAt: s.submitted_at } : {}),
        ...(s?.got_computer_at ? { gotComputerAt: s.got_computer_at } : {}),
        ...(s?.online_at ? { onlineAt: s.online_at } : {}),
        ...(heartbeatAge(s, i.now) !== undefined ? { heartbeatAgeS: heartbeatAge(s, i.now) } : {}),
        ...(s?.restarts ? { restarts: Array.from({ length: s.restarts }, () => ({})) } : {}),
        ...(s?.chain_note ? { chainNote: s.chain_note } : {}),
        ...(s?.consent_source ? { consentSource: s.consent_source } : {}),
        ...(s?.claude_login?.subscriptionType ? { plan: s.claude_login.subscriptionType } : {}),
      }
    : undefined;
  return {
    title: D.title,
    checks: { running: i.running, runningText: D.running, run: b(D.runChecks, { kind: 'run-checks' }), copy: b(D.copyReport, { kind: 'copy-report' }), items },
    ...(run ? { run } : {}),
    progressTail: (i.run?.progress_tail ?? []).slice(-20),
    ...(i.run?.rc_tail ? { rcTail: i.run.rc_tail.slice(-4000) } : {}),
    audit: i.audit.slice(-60),
    shellHost: i.settings?.shell_host ?? 'default',
    siteProfile: i.settings?.site ?? '',
    channel: i.channel?.mode ?? 'unknown',
    loginSetup: { proven: LOGIN_SETUP_PROVEN, text: LOGIN_SETUP_PROVEN ? '' : D.loginSetupUnproven },
    probe: b(D.probe, { kind: 'check-compute-node' }),
    footer: D.footer,
    onlineLag: D.onlineLag,
  };
}

export interface SettingsInput {
  prefs: Prefs;
  settings?: PortalSettings;
  terms?: TermsRecord;
  auditCount: number;
  driveConnected: boolean;
  hashes: string[];
  /** this installation's id (ext/storage.ts installId), shown with the record */
  installId?: string;
}

export function settingsView(i: SettingsInput): SettingsView {
  const S = WORDS.settings;
  const appearance: Appearance = i.prefs.appearance ?? 'cream';
  return {
    title: S.title,
    worker: {
      name: i.prefs.worker_name,
      permissionMode: i.prefs.permission_mode,
      modes: (['default', 'acceptEdits', 'plan'] as const).map((value) => ({ value, label: S.modes[value] })),
      keepRunning: i.prefs.auto_start,
      openClaude: i.prefs.open_claude_on_connect,
    },
    appearance: { value: appearance, options: (['cream', 'system'] as const).map((value) => ({ value, label: S.appearances[value] })) },
    grid: { ...(i.settings ? { address: i.settings.hostname } : {}), change: S.change, disconnect: S.disconnect },
    agreement: {
      ...(i.terms ? { acceptedOn: S.acceptedOn(i.terms.accepted_at.slice(0, 10)), record: recordText(i.terms) } : {}),
      ...(i.installId || i.terms?.install_id ? { installId: i.installId || i.terms!.install_id } : {}),
      installIdLabel: S.installId,
      saveRecord: S.saveRecord,
      showTerms: S.showTerms,
      save: S.saveCopy,
      print: S.print,
    },
    activity: { show: S.show, export: S.export, clear: S.clear, count: i.auditCount },
    drive: { title: S.drive, connected: i.driveConnected },
    labLead: { title: S.labLead, shellHost: i.settings?.shell_host ?? 'default', siteProfile: i.settings?.site ?? '', hashes: i.hashes },
  };
}
