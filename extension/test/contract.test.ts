// The agreement with the framework: the sentences hpcworker prints, the profile's state directory,
// the discovery document, the stop file and restricted marker paths, and the registration block
// `claude remote-control` prints, parsed the way the extension will meet them.
import { describe, expect, it } from 'vitest';
import { commands, expandPath, isEnvironmentUrl, parseDiscovery, parseJobId, parseRegistration, paths, profileRestricts, sessionName, siteFrom, stateDirFrom } from '../src/core/contract';

/** the maintainer's live output of `claude remote-control` (2.1.283) on 2026-09-28/29, after the QR code */
const REGISTRATION = `  █▀▀▀▀▀█ ▄▀▄▀ █▀▀▀▀▀█
  ▀▀▀▀▀▀▀ ▀ ▀ ▀ ▀▀▀▀▀▀▀

·✔︎· Connected · phone · HEAD
    Capacity: 1/32 · New sessions will be created in the current directory
    asx10-hazy-meadow
Continue coding in the Claude mobile app or https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt
Or ask Claude to work in this folder from your projects on claude.ai
`;

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
    expect(paths.stop('/rs/x/hpcworker', 'thesis')).toBe('/rs/x/hpcworker/thesis/stop');
    expect(paths.stopDone('/rs/x/hpcworker', 'thesis')).toBe('/rs/x/hpcworker/thesis/stop.done');
    expect(paths.restrictedMarker('/rs/x/hpcworker', 'thesis')).toBe('/rs/x/hpcworker/workspaces/thesis/.restricted');
    expect(sessionName('wayne', '4243102')).toBe('wayne-4243102');
  });

  it('reads a restricted flag out of a profile when one carries it, and nothing else', () => {
    expect(profileRestricts('{"site":"wayne"}', 'worker')).toBe(false);
    expect(profileRestricts(undefined, 'worker')).toBe(false);
    expect(profileRestricts('not json', 'worker')).toBe(false);
    expect(profileRestricts('{"restricted":true}', 'worker')).toBe(true);
    expect(profileRestricts('{"restricted_workspaces":["thesis"]}', 'worker')).toBe(false);
    expect(profileRestricts('{"restricted_workspaces":["thesis"]}', 'thesis')).toBe(true);
    expect(profileRestricts('{"restricted_workspaces":["*"]}', 'anything')).toBe(true);
  });

  it("parses hpcworker discover's JSON (with the login node it ran on) and the one-line fallback", () => {
    const j = parseDiscovery('{"version":1,"host":"warrior","scheduler":{"family":"slurm","bins":{"sbatch":"/usr/bin/sbatch"}},"runtime":{"candidates":[{"name":"apptainer","path":"/usr/bin/apptainer","user_local":false}],"modules":["apptainer/1.2.2"],"pyxis":false,"user_namespaces":{"max":15000}},"partitions":[{"name":"reqp","timelimit":"7-00:00:00","avail":"up","default":true}],"env":{"TMPDIR":"/wsu/tmp","SLURM_TMPDIR":"","https_proxy":""},"tools":{"tmux":"/usr/bin/tmux","python3":"/usr/bin/python3"},"os":"CentOS Linux 7 (Core)","glibc":"2.17"}');
    expect(j.host).toBe('warrior');
    expect(j.scheduler).toBe('slurm');
    expect(j.runtime).toBe('apptainer');
    expect(j.modules).toBe('apptainer/1.2.2');
    expect(j.user_namespaces).toBe(15000);
    expect(j.partitions).toEqual(['reqp|7-00:00:00|up']);
    expect(j.tmux).toBe(true);
    expect(j.os).toMatch(/CentOS/);
    const f = parseDiscovery('sched=/usr/bin/sbatch /usr/bin/qsub\nrt=\nuserns=0\nos=Rocky Linux 8\nglibc=ldd (GNU libc) 2.28\ntmp=/tmp/job|/tmp\nproxy=http://proxy:3128\npart=reqp*|7-00:00:00|up\npart=gmsap|3-00:00:00|up\n');
    expect(f.host).toBeUndefined();
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

  it('parses the registration block claude remote-control prints: the session name and the environment link', () => {
    const r = parseRegistration(REGISTRATION);
    expect(r.session_name).toBe('asx10-hazy-meadow');
    expect(r.environment_url).toBe('https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt');
    expect(r.capacity).toBe('1/32');
    // the raw terminal transcript carries carriage returns and colour codes; the last registration wins
    const raw = `\x1b[32m·✔︎·\x1b[0m Connected · phone · HEAD\r\n    Capacity: 2/32 · New sessions will be created in the current directory\r\n    \x1b[1masx15-quiet-harbor\x1b[0m\r\nContinue coding in the Claude mobile app or \x1b[4mhttps://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt\x1b[0m\r\n`;
    const r2 = parseRegistration(REGISTRATION + raw);
    expect(r2.session_name).toBe('asx15-quiet-harbor');
    expect(r2.capacity).toBe('2/32');
    expect(r2.environment_url).toBe('https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt');
    // nothing registered yet: nothing invented
    expect(parseRegistration('===== starting claude remote-control =====\nYou must be logged in to use Remote Control\n')).toEqual({});
    expect(parseRegistration('')).toEqual({});
  });

  it('opens only a claude.ai/code environment link', () => {
    expect(isEnvironmentUrl('https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt')).toBe(true);
    expect(isEnvironmentUrl('https://claude.ai/code/session/mock-1')).toBe(false);
    expect(isEnvironmentUrl('https://evil.example/code?environment=env_01')).toBe(false);
    expect(isEnvironmentUrl('https://claude.ai/code?environment=env_01X&next=https://evil.example')).toBe(false);
    expect(isEnvironmentUrl(undefined)).toBe(false);
  });
});
