// The agreement with the framework: the sentences hpcworker prints, the profile's state directory,
// and the discovery document, parsed the way the extension will meet them.
import { describe, expect, it } from 'vitest';
import { commands, expandPath, parseDiscovery, parseJobId, paths, sessionName, siteFrom, stateDirFrom } from '../src/core/contract';

describe('framework contract', () => {
  it('reads the job id out of every sentence hpcworker and sbatch print', () => {
    expect(parseJobId('worker worker submitted as job 4243102 (secp/secondary, 8 h). When it runs, open claude.ai/code')).toBe('4243102');
    expect(parseJobId('worker thesis already has job 4243101 (RUNNING on asx15); nothing submitted')).toBe('4243101');
    expect(parseJobId('probe job 4243100 submitted (secp/secondary, 00:05:00). It writes /rs/x/probe/probe.json')).toBe('4243100');
    expect(parseJobId('Submitted batch job 12345')).toBe('12345');
    expect(parseJobId('12345;cluster\n')).toBe('12345');
    expect(parseJobId('job=777')).toBe('777');
    expect(parseJobId('hpcworker: the scheduler refused the job: sbatch: error: invalid partition')).toBeUndefined();
  });

  it('expands the profile path variables and falls back to ~/.hpcworker', () => {
    const vars = { home: '/home/ab1234', user: 'ab1234' };
    expect(expandPath('/rs/rs_grp_oschome/$USER/hpcworker', vars)).toBe('/rs/rs_grp_oschome/ab1234/hpcworker');
    expect(expandPath('${HOME}/.hpcworker/state/', vars)).toBe('/home/ab1234/.hpcworker/state');
    expect(expandPath('~/state', vars)).toBe('/home/ab1234/state');
    expect(stateDirFrom('{"site":"wayne","shared_state_dir":"/rs/rs_grp_oschome/$USER/hpcworker"}', vars)).toBe('/rs/rs_grp_oschome/ab1234/hpcworker');
    expect(stateDirFrom(undefined, vars)).toBe('/home/ab1234/.hpcworker');
    expect(stateDirFrom('not json', vars)).toBe('/home/ab1234/.hpcworker');
    expect(siteFrom('{"site":"wayne"}')).toBe('wayne');
    expect(paths.status('/rs/x/hpcworker', 'worker')).toBe('/rs/x/hpcworker/worker/status.json');
    expect(paths.probe('/rs/x/hpcworker')).toBe('/rs/x/hpcworker/probe/probe.json');
    expect(paths.workspace('/rs/x/hpcworker', 'thesis')).toBe('/rs/x/hpcworker/workspaces/thesis');
    expect(sessionName('wayne', '4243102')).toBe('wayne-4243102');
  });

  it("parses hpcworker discover's JSON and the one-line fallback", () => {
    const j = parseDiscovery('{"version":1,"scheduler":{"family":"slurm","bins":{"sbatch":"/usr/bin/sbatch"}},"runtime":{"candidates":[{"name":"apptainer","path":"/usr/bin/apptainer","user_local":false}],"modules":["apptainer/1.2.2"],"pyxis":false,"user_namespaces":{"max":15000}},"partitions":[{"name":"reqp","timelimit":"7-00:00:00","avail":"up","default":true}],"env":{"TMPDIR":"/wsu/tmp","SLURM_TMPDIR":"","https_proxy":""},"tools":{"tmux":"/usr/bin/tmux","python3":"/usr/bin/python3"},"os":"CentOS Linux 7 (Core)","glibc":"2.17"}');
    expect(j.scheduler).toBe('slurm');
    expect(j.runtime).toBe('apptainer');
    expect(j.modules).toBe('apptainer/1.2.2');
    expect(j.user_namespaces).toBe(15000);
    expect(j.partitions).toEqual(['reqp|7-00:00:00|up']);
    expect(j.tmux).toBe(true);
    expect(j.os).toMatch(/CentOS/);
    const f = parseDiscovery('sched=/usr/bin/sbatch /usr/bin/qsub\nrt=\nuserns=0\nos=Rocky Linux 8\nglibc=ldd (GNU libc) 2.28\ntmp=/tmp/job|/tmp\nproxy=http://proxy:3128\npart=reqp*|7-00:00:00|up\npart=gmsap|3-00:00:00|up\n');
    expect(f.scheduler).toBe('slurm');
    expect(f.runtime).toBeUndefined();
    expect(f.partitions).toHaveLength(2);
    expect(f.proxy).toBe('http://proxy:3128');
  });

  it('types one line per verb, quoting what the student typed', () => {
    expect(commands.workerStart("thesis' ; rm -rf /", 'default')).toBe("bash ~/.hpcworker/bin/hpcworker worker start --name 'thesis ; rm -rf /' --permission-mode 'default'");
    expect(commands.workerStop('worker')).toBe("bash ~/.hpcworker/bin/hpcworker worker stop --name 'worker'");
    expect(commands.install('wayne')).toMatch(/install --profile 'wayne'$/);
    for (const line of [commands.discover(), commands.probe(), commands.diag(), commands.claudeLogin, commands.claudeConsent]) expect(line).not.toMatch(/[\r\n]/);
  });
});
