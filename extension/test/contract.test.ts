// The agreement with the framework: the sentences hpcworker prints, the profile's state directory,
// the discovery document, the stop file and restricted marker paths, and the registration block
// `claude remote-control` prints, parsed the way the extension will meet them.
import { describe, expect, it } from 'vitest';
import { commands, expandPath, isClaudeCodeLink, isEnvironmentUrl, parseDiscovery, parseJobId, parseRegistration, paths, profileRestricts, sessionName, siteFrom, stateDirFrom } from '../src/core/contract';

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
    // framework 2: a probe still queued or running is named, not resubmitted; that is not a failure
    expect(parseJobId('probe job 4243100 is still PENDING; nothing submitted. It writes /rs/x/probe/probe.json; read it with: hpcworker probe --show')).toBe('4243100');
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
    // the lab's shared copy (framework 5), the only install typed: the shared tool installs the account itself; nothing is chmod-ed or uploaded
    expect(commands.installShared('/rs/rs_grp_oschome/shared/ashley/hpcworker/current', 'wayne')).toBe("bash '/rs/rs_grp_oschome/shared/ashley/hpcworker/current/bin/hpcworker' install --shared '/rs/rs_grp_oschome/shared/ashley/hpcworker/current' --profile 'wayne'");
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
    // the link printed is the environment link
    expect(r2.session_url).toBe('https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt');
    // nothing registered yet: nothing invented
    expect(parseRegistration('===== starting claude remote-control =====\nYou must be logged in to use Remote Control\n')).toEqual({});
    expect(parseRegistration('')).toEqual({});
  });

  it("14.0.0: a resumed session's block: its own link (session_url), no environment link, no name", () => {
    const resumed = 'Resuming session session_01N4R9mLRJ5wFbf1oaDe5pyj (43m ago)\r\n·✔︎· Connected · phone · HEAD\r\n    Single session · exits when complete\r\nContinue coding in the Claude mobile app or \x1b[4mhttps://claude.ai/code/session_01N4R9mLRJ5wFbf1oaDe5pyj\x1b[24m\r\n';
    expect(parseRegistration(resumed)).toEqual({ session_url: 'https://claude.ai/code/session_01N4R9mLRJ5wFbf1oaDe5pyj' });
    // both: the environment link stays, the link printed last is the session's
    const both = parseRegistration(REGISTRATION + resumed);
    expect(both).toMatchObject({ session_name: 'asx10-hazy-meadow', environment_url: 'https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt', session_url: 'https://claude.ai/code/session_01N4R9mLRJ5wFbf1oaDe5pyj' });
    // and claude.com for either
    expect(parseRegistration(resumed.replace(/claude\.ai/g, 'claude.com')).session_url).toBe('https://claude.com/code/session_01N4R9mLRJ5wFbf1oaDe5pyj');
  });

  it('14.0.0: a cursor code right before the link or the name takes nothing with it', () => {
    const ENV = 'https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt';
    const SES = 'https://claude.ai/code/session_01N4R9mLRJ5wFbf1oaDe5pyj';
    for (const code of ['\x1b[K', '\x1b[1C', '\x1b[2K', '\x1b[G', '\x1b[1A'])
      for (const gap of ['', ' ']) {
        const reg = REGISTRATION.replace('    asx10-hazy-meadow', `${code}    ${code}asx10-hazy-meadow`).replace('or https://', `or ${code}${gap}https://`);
        expect(parseRegistration(reg), JSON.stringify(code + gap)).toMatchObject({ session_name: 'asx10-hazy-meadow', environment_url: ENV, session_url: ENV });
        expect(parseRegistration(`Single session · exits when complete\r\nContinue coding in the Claude mobile app or \x1b[4m${code}${gap}${SES}\x1b[24m\r\n`).session_url, JSON.stringify(code + gap)).toBe(SES);
      }
  });

  it('14.0.0: only complete lines are read: a link cut mid-write is not a link until its newline comes', () => {
    const ENV = 'https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt';
    const SES = 'https://claude.ai/code/session_01N4R9mLRJ5wFbf1oaDe5pyj';
    const cut = `Continue coding in the Claude mobile app or ${SES.slice(0, 35)}`;
    expect(parseRegistration(cut)).toEqual({});
    expect(parseRegistration(`Single session · exits when complete\r\n${cut}`)).toEqual({});
    // a registration already printed stands; the cut link is not the link printed last
    expect(parseRegistration(REGISTRATION + cut)).toMatchObject({ session_name: 'asx10-hazy-meadow', environment_url: ENV, session_url: ENV });
    // the rest of the line with its newline: now it is the link
    expect(parseRegistration(`${REGISTRATION}${cut}${SES.slice(35)}\r\n`)).toMatchObject({ environment_url: ENV, session_url: SES });
    // an environment link cut the same way, a carriage return without its newline, a name line not finished
    expect(parseRegistration(`or ${ENV.slice(0, -6)}`)).toEqual({});
    expect(parseRegistration(`or ${ENV}\r`)).toEqual({});
    expect(parseRegistration('Capacity: 1/32\n    asx10-hazy')).toEqual({ capacity: '1/32' });
  });

  it('isEnvironmentUrl takes an environment link only (where a new session can start), on claude.ai or claude.com', () => {
    expect(isEnvironmentUrl('https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt')).toBe(true);
    expect(isEnvironmentUrl('https://claude.com/code?environment=env_01XzAN32jsbL8W1PAFSvitBt')).toBe(true);
    expect(isEnvironmentUrl('https://claude.ai/code/session_01N4R9mLRJ5wFbf1oaDe5pyj')).toBe(false);
    expect(isEnvironmentUrl('https://claude.ai/code/session/mock-1')).toBe(false);
    expect(isEnvironmentUrl('https://evil.example/code?environment=env_01')).toBe(false);
    expect(isEnvironmentUrl('https://claude.ai/code?environment=env_01X&next=https://evil.example')).toBe(false);
    expect(isEnvironmentUrl(undefined)).toBe(false);
  });

  it('14.0.0: isClaudeCodeLink takes either form, exactly, on claude.ai or claude.com, and nothing else', () => {
    for (const ok of ['https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt', 'https://claude.ai/code/session_01N4R9mLRJ5wFbf1oaDe5pyj', 'https://claude.com/code?environment=env_01X', 'https://claude.com/code/session_01N4R9'])
      expect(isClaudeCodeLink(ok), ok).toBe(true);
    for (const bad of [
      undefined,
      '',
      'http://claude.ai/code/session_01N4R9',
      'https://claude.ai/code/session/mock-1',
      'https://claude.ai/code/sessions',
      'https://claude.ai/code/session_01N4R9?next=https://evil.example',
      'https://claude.ai/code/session_01N4R9/../../oauth',
      'https://claude.ai.evil.example/code/session_01N4R9',
      'https://evil.example/https://claude.ai/code/session_01N4R9',
      'https://claude.org/code?environment=env_01',
      'https://claude.ai/code?environment=env_01X&next=https://evil.example',
      ' https://claude.ai/code/session_01N4R9',
    ])
      expect(isClaudeCodeLink(bad), String(bad)).toBe(false);
  });
});
