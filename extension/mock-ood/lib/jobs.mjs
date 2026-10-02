#!/usr/bin/env node
// The mock cluster's job table, shared by the fake scheduler commands (bin/sbatch, squeue,
// scancel), the stand-in tool (lib/tool.mjs), the job simulator (lib/jobsim.mjs) and the mock
// portal's Active Jobs route. One JSON file under the mock home, written under a lock (a directory
// made with mkdir, which is atomic) so that the server's simulator and a command in the shell never
// lose each other's change.
//   node jobs.mjs add <name> [queue]     -> prints the new job id
//   node jobs.mjs list                   -> prints the table as JSON
//   node jobs.mjs remove <id>
//   node jobs.mjs squeue [-h] [-j ids] [-u user] [-o fmt]   -> what Slurm's squeue prints
//
// A job is {pbsid, status: "queued" | "running", nodes, ...} as the Active Jobs JSON wants it. A
// worker submitted by the framework 10 stand-in also carries `sim` (lib/jobsim.mjs): while it is
// PENDING, squeue reports its reason (MOCK_QUEUE_REASON) and an expected start; the simulator moves
// it to RUNNING when its time in line is over.
import { promises as fs } from 'node:fs';
import path from 'node:path';

export function stateDir(home = process.env.MOCK_HOME || process.env.HOME || '.') {
  return path.join(home, '.mock-ood');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** run fn holding the table's lock; a lock older than 10 s is a dead holder's and is taken over */
export async function withLock(home, fn) {
  const dir = stateDir(home);
  const lock = path.join(dir, 'jobs.lock');
  await fs.mkdir(dir, { recursive: true });
  for (let i = 0; ; i++) {
    try {
      await fs.mkdir(lock);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        const st = await fs.stat(lock);
        if (Date.now() - st.mtimeMs > 10_000) {
          await fs.rmdir(lock).catch(() => {});
          continue;
        }
      } catch {
        continue;
      }
      if (i > 800) throw new Error('mock-ood: the job table lock was not released');
      await sleep(15);
    }
  }
  try {
    return await fn();
  } finally {
    await fs.rmdir(lock).catch(() => {});
  }
}

export async function readJobs(home) {
  let jobs;
  try {
    jobs = JSON.parse(await fs.readFile(path.join(stateDir(home), 'jobs.json'), 'utf8'));
  } catch {
    jobs = [];
  }
  // the highest job id ever issued (jobs.seq), so an id is never issued twice after a job leaves the
  // table, as Slurm never does (a stopped job's id coming back made the extension read a new worker as the stopped one)
  let seq = 0;
  try {
    seq = Number(await fs.readFile(path.join(stateDir(home), 'jobs.seq'), 'utf8')) || 0;
  } catch {
    /* none yet */
  }
  Object.defineProperty(jobs, 'seq', { value: seq, enumerable: false, writable: true });
  return jobs;
}

/** the next job id: above every job in the table and every id issued before */
export function nextJobNumber(jobs) {
  return String(Math.max(100000 + jobs.reduce((m, j) => Math.max(m, Number(j.pbsid) - 100000), 0), Number(jobs.seq) || 0) + 1);
}

/** write a file whole: a temporary file and a rename, falling back to a plain write where Windows refuses the rename (a reader holds the file open) */
export async function writeWhole(file, text) {
  const tmp = `${file}.part${process.pid}`;
  await fs.writeFile(tmp, text);
  for (let i = 0; i < 5; i++) {
    try {
      await fs.rename(tmp, file);
      return;
    } catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      await sleep(20);
    }
  }
  await fs.writeFile(file, text);
  await fs.rm(tmp, { force: true });
}

export async function writeJobs(home, jobs) {
  await fs.mkdir(stateDir(home), { recursive: true });
  await writeWhole(path.join(stateDir(home), 'jobs.json'), JSON.stringify(jobs, null, 1));
  let before = 0;
  try {
    before = Number(await fs.readFile(path.join(stateDir(home), 'jobs.seq'), 'utf8')) || 0;
  } catch {
    /* none yet */
  }
  const top = Math.max(before, Number(jobs.seq) || 0, ...jobs.map((j) => Number(j.pbsid) || 0));
  if (top > 0) await writeWhole(path.join(stateDir(home), 'jobs.seq'), String(top));
}

/** read, change in place (fn may return a result), write back, all under the lock */
export async function mutateJobs(home, fn) {
  return withLock(home, async () => {
    const jobs = await readJobs(home);
    const result = await fn(jobs);
    await writeJobs(home, jobs);
    return result;
  });
}

function nextId(jobs, floor = 0) {
  return String(Math.max(Number(nextJobNumber(jobs)), floor));
}

/** a job, running at once (what the 10.0.0 stand-in did for every job), unless `extra` says otherwise (status, nodes, sim) */
export async function addJob(home, name, queue = 'reqp', extra = {}) {
  return mutateJobs(home, (jobs) => {
    const id = nextId(jobs);
    jobs.push({
      cluster: 'mock',
      cluster_title: 'Mock Cluster',
      status: 'running',
      pbsid: id,
      jobname: name,
      account: 'lab',
      queue,
      walltime_used: '00:00:07',
      username: process.env.MOCK_USER || 'student',
      extended_available: false,
      nodes: ['node01'],
      delete_path: `/pun/sys/dashboard/activejobs?cluster=mock&pbsid=${id}`,
      ...extra,
    });
    return id;
  });
}

export async function removeJob(home, id) {
  await mutateJobs(home, (jobs) => {
    const keep = jobs.filter((j) => String(j.pbsid) !== String(id));
    jobs.length = 0;
    jobs.push(...keep);
  });
}

/** Slurm's state word for a job of the table */
export function slurmState(j) {
  return j.status === 'queued' ? 'PENDING' : 'RUNNING';
}

/** "2026-10-01T09:12:00": Slurm's %S, the cluster's local time without a zone */
export function slurmTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const HEADERS = { i: 'JOBID', T: 'STATE', r: 'REASON', S: 'START_TIME', N: 'NODELIST', j: 'NAME', P: 'PARTITION', u: 'USER', M: 'TIME', t: 'ST' };

/** one field of squeue's -o format for job j */
function field(j, c, now) {
  const pending = j.status === 'queued';
  const sim = j.sim ?? {};
  switch (c) {
    case 'i':
      return String(j.pbsid);
    case 'T':
      return slurmState(j);
    case 't':
      return pending ? 'PD' : 'R';
    case 'r':
      return pending ? sim.reason || 'Priority' : 'None';
    case 'S':
      if (pending) return sim.expected === 'none' || !sim.start_at ? 'N/A' : slurmTime(Math.max(sim.start_at, now));
      return slurmTime(sim.got_at ?? sim.start_at ?? now);
    case 'N':
      return pending ? '' : (j.nodes ?? []).join(',');
    case 'j':
      return j.jobname ?? '';
    case 'P':
      return j.queue ?? '';
    case 'u':
      return j.username ?? '';
    case 'M':
      return pending ? '0:00' : j.walltime_used ?? '0:01';
    default:
      return `%${c}`;
  }
}

/** what `squeue` prints for these arguments (the subset the framework uses: -h, -j, -u, -o) */
export function squeueLines(jobs, args, now = Date.now()) {
  let header = true;
  let ids;
  let user;
  let fmt;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-h' || a === '--noheader') header = false;
    else if (a === '-j' || a === '--jobs') ids = String(args[++i] ?? '').split(',').filter(Boolean);
    else if (a.startsWith('--jobs=')) ids = a.slice(7).split(',').filter(Boolean);
    else if (a === '-u' || a === '--user') user = args[++i];
    else if (a === '-o' || a === '--format') fmt = args[++i];
    else if (a.startsWith('--format=')) fmt = a.slice(9);
    else if (/^-o./.test(a)) fmt = a.slice(2);
  }
  let rows = jobs;
  if (ids) rows = rows.filter((j) => ids.includes(String(j.pbsid)));
  if (user) rows = rows.filter((j) => j.username === user);
  // the 10.0.0 stand-in's own format, kept for its callers: "id|STATE|nodes", no header
  if (!fmt) return rows.map((j) => `${j.pbsid}|${slurmState(j)}|${(j.nodes || []).join(',')}`);
  const render = (fn) => fmt.replace(/%(?:\.?\d+)?([A-Za-z])/g, (_m, c) => fn(c));
  const out = rows.map((j) => render((c) => field(j, c, now)));
  if (header) out.unshift(render((c) => HEADERS[c] ?? c.toUpperCase()));
  return out;
}

/** one line per scheduler question, so a test can count them (the framework asks at most once a minute) */
export async function noteSchedulerCall(home, what) {
  try {
    await fs.mkdir(stateDir(home), { recursive: true });
    await fs.appendFile(path.join(stateDir(home), 'scheduler.log'), `${new Date().toISOString()} ${what}\n`);
  } catch {
    /* the count is a convenience */
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const [verb, ...rest] = process.argv.slice(2);
  const home = process.env.MOCK_HOME || process.env.HOME;
  if (verb === 'add') console.log(await addJob(home, rest[0] || 'job', rest[1]));
  else if (verb === 'list') console.log(JSON.stringify(await readJobs(home)));
  else if (verb === 'remove') await removeJob(home, rest[0]);
  else if (verb === 'squeue') {
    await noteSchedulerCall(home, `squeue ${rest.join(' ')}`);
    const lines = squeueLines(await readJobs(home), rest);
    if (lines.length) console.log(lines.join('\n'));
  } else {
    console.error('usage: jobs.mjs add <name> [queue] | list | remove <id> | squeue [-h] [-j ids] [-u user] [-o fmt]');
    process.exit(2);
  }
}
