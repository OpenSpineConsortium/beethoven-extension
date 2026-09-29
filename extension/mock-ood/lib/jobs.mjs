#!/usr/bin/env node
// The mock cluster's job table, shared by the fake scheduler commands (bin/sbatch, squeue,
// scancel) and the mock portal's Active Jobs route. One JSON file under the mock home.
//   node jobs.mjs add <name> [queue]     -> prints the new job id
//   node jobs.mjs list                   -> prints the table as JSON
//   node jobs.mjs remove <id>
import { promises as fs } from 'node:fs';
import path from 'node:path';

export function stateDir(home = process.env.MOCK_HOME || process.env.HOME || '.') {
  return path.join(home, '.mock-ood');
}

export async function readJobs(home) {
  try {
    return JSON.parse(await fs.readFile(path.join(stateDir(home), 'jobs.json'), 'utf8'));
  } catch {
    return [];
  }
}

export async function writeJobs(home, jobs) {
  await fs.mkdir(stateDir(home), { recursive: true });
  await fs.writeFile(path.join(stateDir(home), 'jobs.json'), JSON.stringify(jobs, null, 1));
}

export async function addJob(home, name, queue = 'reqp') {
  const jobs = await readJobs(home);
  const id = String(100000 + jobs.reduce((m, j) => Math.max(m, Number(j.pbsid) - 100000), 0) + 1);
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
  });
  await writeJobs(home, jobs);
  return id;
}

export async function removeJob(home, id) {
  const jobs = await readJobs(home);
  await writeJobs(home, jobs.filter((j) => String(j.pbsid) !== String(id)));
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const [verb, a, b] = process.argv.slice(2);
  const home = process.env.MOCK_HOME || process.env.HOME;
  if (verb === 'add') console.log(await addJob(home, a || 'job', b));
  else if (verb === 'list') console.log(JSON.stringify(await readJobs(home)));
  else if (verb === 'remove') await removeJob(home, a);
  else {
    console.error('usage: jobs.mjs add <name> [queue] | list | remove <id>');
    process.exit(2);
  }
}
