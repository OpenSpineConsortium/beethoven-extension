#!/usr/bin/env node
// The mock cluster's worker jobs, run by the clock instead of by a node: what framework 10's job
// (jobs/worker.sbatch.tpl) writes, written at the times it would write it. The mock portal calls
// advance() once a second; `node jobsim.mjs tick` does one step from a shell or a test.
//
// A worker the framework 10 stand-in submitted (lib/tool.mjs start) is in the job table with `sim`:
//   pending      in line for sim.queue_s seconds (MOCK_QUEUE_S), squeue answering PENDING with the
//                reason (MOCK_QUEUE_REASON) and an expected start;
//   starting     "Got a computer": the node file, status.json "starting" with got_computer_at,
//                started_at and ends_at, progress.log "Got a computer"; the chain's successor is
//                queued (next.id, "Dependency") unless --no-chain;
//   need_consent no Remote Control answer on record (no ~/.hpcworker/consent and MOCK_CONSENT=false);
//   need_login   the account is not signed in to Claude (lib/common.mjs claudeState): status
//                need_login and "Waiting for your Claude sign-in"; past sim.abandon_s from the job's
//                own start (login_abandon_s, MOCK_ABANDON_S) the job stops itself, stop_reason
//                login_abandoned, queues nothing;
//   online       sim.start_s seconds after it got its computer (MOCK_START_S): "Connecting to
//                Claude", then status.json online with the link, connection.json, the registration
//                block in rc.log, "Online: <link>" in progress.log and "<H:MM> Online. Open in Claude:
//                <link>" in the job's output; the sign-in checked again every 300 s;
//                MOCK_RECONNECT_AFTER_S plays one Remote Control restart;
//   heartbeat    13.0.0: in every live state (starting, need_consent, need_login, online), the last
//                status.json written again with a new updated_at every 30 s, as the job's main loop
//                does (worker.sbatch.tpl: write_status every HEARTBEAT_S), so the mock's runs never read
//                as stale (R12) while their job is alive;
//   wall time    at ends_at (sim.renew_s: MOCK_RENEW_S, else the profile's hours): "Renewing", status
//                preempted with next_job, and the successor gets in line (renewal: true); with the
//                chain off, "Ended".
// A stop file in the run folder (worker stop, or a 10.0.0 extension writing it through Files) ends a
// started job: status stopped, stop_reason request, "Stopped", stop.done, the successor cancelled.
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { claudeState, hasConsentMarker, iso, progress, PROGRESS, registrationBlock, STATE_WORDS, writeStatus } from './common.mjs';
import { mutateJobs, nextJobNumber } from './jobs.mjs';

const S = 1000;

function hm(ms) {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** status.json for job j in `state`, built from what the simulator knows (every framework 10 field) */
export function statusDoc(j, s, state, now, extra = {}) {
  const w = STATE_WORDS[state] ?? STATE_WORDS.error;
  const cl = claudeState(s.home, s.claude_default, s.user);
  const started = !!s.got_at;
  const online = !!s.online_at;
  const consentSource = hasConsentMarker(s.home) ? 'marker' : s.consent_default ? 'claude_config' : 'none';
  return {
    version: 10,
    site: s.site,
    run: s.run,
    job: String(j.pbsid),
    node: started ? 'node01' : '',
    ...(started ? { pid: 4242 } : {}),
    state,
    message: state === 'online' ? `Open in Claude: ${s.env_url} and find ${s.session} (or tap Code in the Claude app). Connected · phone · HEAD` : w.message,
    needs: w.needs,
    hint: w.hint,
    submitted_at: s.submitted_at ? iso(s.submitted_at) : '',
    got_computer_at: started ? iso(s.got_at) : '',
    started_at: started ? iso(s.got_at) : '',
    online_at: online ? iso(s.online_at) : '',
    ends_at: started ? iso(s.got_at + s.renew_s * S) : '',
    renewal: !!s.renewal,
    updated_at: iso(now),
    title: s.title,
    session_name: online ? s.session : s.requested,
    requested_name: s.requested,
    environment_url: online ? s.env_url : '',
    environment_id: online ? s.env_id : '',
    session_url: online ? s.env_url : '',
    claude_login: { loggedIn: !!cl.loggedIn, email: cl.email || '', subscriptionType: cl.subscriptionType || '', checked_at: iso(s.last_auth || now) },
    consent: consentSource !== 'none',
    consent_source: consentSource,
    workspace_trusted: true,
    rc_alive: state === 'online',
    resumed: false,
    tmux: true,
    restarts: s.restarts || 0,
    chain: !!s.chain,
    next_job: s.next || '',
    chain_note: s.next ? `successor ${s.next} queued (afterany:${j.pbsid})` : s.chain ? '' : 'the chain is off (--no-chain)',
    scheduler_in_worker: true,
    scheduler_note: '',
    workspace: s.workspaceShown,
    rc_log: s.rcLogShown,
    token_path: s.tokenShown,
    scheduler_state: '',
    reason: '',
    expected_start: '',
    checked_at: '',
    ...extra,
  };
}

/** the states whose file the job keeps heartbeating (the contract's live states once the job has its computer) */
const BEATING = new Set(['starting', 'need_login', 'need_consent', 'running', 'online']);

async function write(j, s, state, now, extra) {
  // what the heartbeat writes again: this state, with the same extra fields
  s.last_written = { state, ...(extra ? { extra } : {}) };
  s.last_beat = now;
  await writeStatus(s.rd, statusDoc(j, s, state, now, extra));
}

const nextJobId = (jobs) => nextJobNumber(jobs);

/** end a started job: the student's stop (request) or the sign-in abandon (login_abandoned) */
async function finish(jobs, j, s, now, why) {
  const drop = new Set([String(j.pbsid), String(s.next ?? '')]);
  const keep = jobs.filter((x) => !drop.has(String(x.pbsid)));
  jobs.length = 0;
  jobs.push(...keep);
  const abandoned = why === 'login_abandoned';
  s.next = '';
  await write(j, s, 'stopped', now, { stop_reason: why, message: abandoned ? 'stopped: waiting for your Claude sign-in timed out' : 'stopped at your request', rc_alive: false });
  await progress(s.rd, abandoned ? PROGRESS.abandoned : PROGRESS.stopped, new Date(now));
  await fs.writeFile(path.join(s.rd, 'stop.done'), '');
  await fs.rm(path.join(s.rd, 'next.id'), { force: true });
}

async function goOnline(j, s, now) {
  const first = !s.online_at;
  if (!s.logged?.connecting) {
    s.logged = { ...(s.logged ?? {}), connecting: true };
    await progress(s.rd, PROGRESS.connecting, new Date(now));
  }
  s.phase = 'online';
  s.online_at ||= now;
  s.last_beat = now;
  s.last_auth = now;
  await fs.appendFile(path.join(s.rd, 'rc.log'), `\n===== ${iso(now)} job ${j.pbsid} on node01: starting claude remote-control --name ${s.requested} --permission-mode ${s.permission_mode} =====\n${registrationBlock(s.session, s.env_url)}`);
  await fs.writeFile(
    path.join(s.rd, 'connection.json'),
    `${JSON.stringify({ session_name: s.session, requested_name: s.requested, session_url: s.env_url, environment_url: s.env_url, environment_id: s.env_id, node: 'node01', job: String(j.pbsid), pid: 4242, started_at: iso(s.got_at), token_path: s.tokenShown, workspace: s.workspaceShown, rc_log: s.rcLogShown, permission_mode: s.permission_mode, capacity: '1/32', resumed: false, next_job: s.next || '', title: s.title, online_at: iso(s.online_at) })}\n`,
  );
  await write(j, s, 'online', now);
  if (first) {
    await progress(s.rd, PROGRESS.online(s.env_url), new Date(now));
    await fs.appendFile(path.join(s.rd, `slurm_${j.pbsid}.out`), `${hm(now)} Online. Open in Claude: ${s.env_url}\n`);
  }
}

/** one step of every simulated worker; returns what changed, for the server's log */
export async function advance(home, { now = Date.now() } = {}) {
  return mutateJobs(home, async (jobs) => {
    const changed = [];
    for (const j of [...jobs]) {
      const s = j.sim;
      if (!s || s.kind !== 'worker' || !jobs.includes(j)) continue;
      if (!existsSync(s.rd)) continue;
      // a stop file ends a job that has its computer (a job still in line is cancelled by worker stop)
      if (s.phase !== 'pending' && existsSync(path.join(s.rd, 'stop'))) {
        await finish(jobs, j, s, now, 'request');
        changed.push(`${j.pbsid} stopped (stop file)`);
        continue;
      }
      if (s.phase === 'pending') {
        if (now < s.start_at) continue;
        j.status = 'running';
        j.nodes = ['node01'];
        s.got_at = now;
        s.phase = 'starting';
        s.online_target = now + s.start_s * S;
        s.logged = {};
        await fs.writeFile(path.join(s.rd, 'node'), 'node01\n');
        await fs.writeFile(path.join(s.rd, 'job.id'), `${j.pbsid}\n`);
        await fs.rm(path.join(s.rd, 'stop.done'), { force: true });
        if (s.chain) {
          const succ = nextJobId(jobs);
          jobs.push({ ...j, pbsid: succ, status: 'queued', nodes: [], delete_path: `/pun/sys/dashboard/activejobs?cluster=mock&pbsid=${succ}`, sim: { kind: 'successor', parent: String(j.pbsid), reason: 'Dependency', expected: 'none' } });
          s.next = succ;
          await fs.writeFile(path.join(s.rd, 'next.id'), `${succ} ${j.pbsid}\n`);
        } else s.next = '';
        await write(j, s, 'starting', now);
        await progress(s.rd, PROGRESS.got, new Date(now));
        changed.push(`${j.pbsid} got a computer`);
        continue;
      }
      // the wall time: renew into the successor, or end
      if (now >= s.got_at + s.renew_s * S) {
        const succ = jobs.find((x) => String(x.pbsid) === String(s.next));
        const keep = jobs.filter((x) => x !== j);
        jobs.length = 0;
        jobs.push(...keep);
        if (succ) {
          await write(j, s, 'preempted', now, { rc_alive: false });
          await progress(s.rd, PROGRESS.renewing, new Date(now));
          succ.sim = { ...s, kind: 'worker', renewal: true, submitted_at: s.got_at, start_at: now + s.renew_queue_s * S, reason: 'Priority', expected: 'estimate', phase: 'pending', got_at: undefined, online_at: undefined, online_target: undefined, last_beat: undefined, last_written: undefined, last_auth: undefined, logged: {}, restarts: 0, next: '', reconnected: false, parent: undefined };
          changed.push(`${j.pbsid} renewing into ${succ.pbsid}`);
        } else {
          s.next = '';
          await write(j, s, 'preempted', now, { rc_alive: false, message: 'ended at its wall time' });
          await progress(s.rd, PROGRESS.ended, new Date(now));
          await fs.rm(path.join(s.rd, 'next.id'), { force: true });
          changed.push(`${j.pbsid} ended`);
        }
        continue;
      }
      // the heartbeat: every 30 s in every live state, the last file written again with a new updated_at (write
      // keeps last_written and last_beat); a branch below that writes for another reason beats with it
      const lw = s.last_written;
      if (lw && BEATING.has(lw.state) && now - (s.last_beat ?? now) >= 30 * S) await write(j, s, lw.state, now, lw.extra);
      if (s.phase === 'online') {
        if (now - s.last_auth >= 300 * S) {
          s.last_auth = now;
          if (!claudeState(s.home, s.claude_default, s.user).loggedIn) {
            s.phase = 'need_login';
            await write(j, s, 'need_login', now);
            await progress(s.rd, PROGRESS.waitingSignin, new Date(now));
            changed.push(`${j.pbsid} signed out of Claude`);
            continue;
          }
          s.last_beat = now;
          await write(j, s, 'online', now);
          continue;
        }
        if (s.reconnect_after_s > 0 && !s.reconnected && now - s.online_at >= s.reconnect_after_s * S) {
          s.reconnected = true;
          s.restarts = (s.restarts || 0) + 1;
          s.phase = 'reconnecting';
          s.online_target = now + 5 * S;
          await write(j, s, 'starting', now, { rc_alive: false });
          await progress(s.rd, PROGRESS.reconnecting, new Date(now));
          changed.push(`${j.pbsid} reconnecting`);
          continue;
        }
        continue;
      }
      // starting, reconnecting, need_consent, need_login: waiting for the computer's Claude Code
      if (now < s.online_target) continue;
      if (!hasConsentMarker(s.home) && !s.consent_default) {
        if (s.phase !== 'need_consent') {
          s.phase = 'need_consent';
          await write(j, s, 'need_consent', now);
          changed.push(`${j.pbsid} needs the Remote Control answer`);
        }
        continue;
      }
      if (!claudeState(s.home, s.claude_default, s.user).loggedIn) {
        if (now - s.got_at >= s.abandon_s * S) {
          await finish(jobs, j, s, now, 'login_abandoned');
          changed.push(`${j.pbsid} stopped: the sign-in was not made in time`);
          continue;
        }
        if (s.phase !== 'need_login') {
          s.phase = 'need_login';
          await write(j, s, 'need_login', now);
          await progress(s.rd, PROGRESS.waitingSignin, new Date(now));
          changed.push(`${j.pbsid} waiting for the Claude sign-in`);
        }
        continue;
      }
      await goOnline(j, s, now);
      changed.push(`${j.pbsid} online`);
    }
    return changed;
  });
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const [verb] = process.argv.slice(2);
  if (verb === 'tick') {
    const out = await advance(process.env.MOCK_HOME || process.env.HOME);
    if (out.length) console.log(out.join('\n'));
  } else {
    console.error('usage: jobsim.mjs tick');
    process.exit(2);
  }
}
