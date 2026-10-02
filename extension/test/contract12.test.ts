// 12.0.0's wire agreements with framework 11, against the gate's own grammar (the prototype's
// lib/browser_key.sh, which framework 11 carries): the verbs, the 11.0.0 lines the gate carries in their
// place and the ones it never does (a Claude sign-in, an install, a probe), the version line, the
// enrolment line, and the grid's 2FA refusal as it was read on 2026-10-01.
import { describe, expect, it } from 'vitest';
import { browserKeyAddLine, browserKeyAdded, commands, gate, gateLineFor, parseForget, parseGateVersion, TWO_FA_REFUSAL_RE, CODE_PROMPT_RE, PASSWORD_PROMPT_RE } from '../src/core/contract';

const SHARED = '/rs/rs_grp_oschome/shared/beethoven/hpcworker/current';
const ID = '0123456789abcdef0123456789abcdef';
/** the gate's own check of a command (browser_key.sh cmd_gate): words of [A-Za-z0-9._-], single spaces, at most 200 characters */
const gateAccepts = (c: string) => c.length > 0 && c.length <= 200 && !/[^A-Za-z0-9._ -]/.test(c) && !/^ | $|  /.test(c) && c.split(' ').every((w) => /^[A-Za-z0-9._-]{1,64}$/.test(w));

describe('the gate verbs', () => {
  it('builds exactly what the gate accepts', () => {
    const lines = [gate.version(), gate.status('worker'), gate.watch('worker'), gate.stop('w2'), gate.restrict('worker'), gate.read('worker', 'status.json'), gate.read('worker', 'progress.log'), gate.forget(), gate.connect({ name: 'worker', site: 'wayne', installId: ID, permissionMode: 'acceptEdits', chain: false }), gate.connect({ name: 'worker', site: 'wayne', permissionMode: 'default', chain: true })];
    for (const l of lines) expect(gateAccepts(l), l).toBe(true);
    expect(gate.connect({ name: 'worker', site: 'wayne', installId: ID, permissionMode: 'acceptEdits', chain: false })).toBe(`connect worker wayne ${ID} acceptEdits no-chain`);
    expect(gate.connect({ name: 'worker', site: 'wayne', permissionMode: 'default', chain: true })).toBe('connect worker wayne - default chain');
  });

  it('refuses a value the gate would refuse, before anything is sent', () => {
    expect(() => gate.status('-rf')).toThrow();
    expect(() => gate.status('a b')).toThrow();
    expect(() => gate.read('worker', 'id_rsa' as never)).toThrow();
    expect(() => gate.connect({ name: 'worker', site: 'Wayne', permissionMode: 'default', chain: true })).toThrow();
    expect(() => gate.connect({ name: 'worker', site: 'wayne', installId: 'xyz', permissionMode: 'default', chain: true })).toThrow();
  });
});

describe('the 11.0.0 lines the gate carries, and the ones it never does', () => {
  it('status, stop and restrict become the verbs', () => {
    expect(gateLineFor(commands.statusJson(SHARED, 'worker'))).toBe('status worker');
    expect(gateLineFor(commands.stop(SHARED, 'worker'))).toBe('stop worker');
    expect(gateLineFor(commands.restrict(SHARED, 'worker'))).toBe('restrict worker');
  });

  it('connect only with --login never (the gate cannot sign a worker in to Claude)', () => {
    const base = { name: 'worker', site: 'wayne', installId: ID, permissionMode: 'default' as const, chain: true };
    expect(gateLineFor(commands.connect(SHARED, { ...base, login: 'never' }))).toBe(`connect worker wayne ${ID} default chain`);
    expect(gateLineFor(commands.connect(SHARED, { ...base, login: 'never', chain: false }))).toBe(`connect worker wayne ${ID} default no-chain`);
    for (const login of ['auto', 'always', 'fresh'] as const) expect(gateLineFor(commands.connect(SHARED, { ...base, login }))).toBeUndefined();
  });

  it('install, consent, probe and anything else are not carried', () => {
    expect(gateLineFor(commands.installShared(SHARED, 'wayne'))).toBeUndefined();
    expect(gateLineFor(commands.consentRecord(SHARED, ID))).toBeUndefined();
    expect(gateLineFor(commands.probe())).toBeUndefined();
    expect(gateLineFor(commands.loginSetup(SHARED))).toBeUndefined();
    expect(gateLineFor("bash '/x/bin/hpcworker' worker stop --name 'w'; rm -rf ~")).toBeUndefined();
    expect(gateLineFor('cat /etc/passwd')).toBeUndefined();
  });
});

describe('what the gate answers', () => {
  it('version', () => {
    expect(parseGateVersion('HPCW-GATE ok 11 never st1234 claude=yes\n')).toEqual({ framework: '11', due: 'never', account: 'st1234', claude: 'yes' });
    expect(parseGateVersion('motd line\nHPCW-GATE ok 11 2026-12-31 ab1234 claude=unknown\n')?.due).toBe('2026-12-31');
    expect(parseGateVersion('HPCW-GATE refused\n')).toBeUndefined();
  });
  it('forget', () => {
    expect(parseForget('HPCW-KEY forgotten\n')).toBe('forgotten');
    expect(parseForget('HPCW-KEY none\n')).toBe('none');
    expect(parseForget('HPCW-KEY stuck\n')).toBe('stuck');
    expect(parseForget('')).toBeUndefined();
  });
});

describe('the enrolment line', () => {
  const ED = 'AAAAC3NzaC1lZDI1NTE5AAAAI' + 'A'.repeat(43);
  const EC = 'AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBB' + 'A'.repeat(87);
  it('names the shared copy, the key type, the key and the comment, and nothing else', () => {
    expect(ED).toHaveLength(68);
    expect(EC).toHaveLength(140);
    expect(browserKeyAddLine(SHARED, 'ssh-ed25519', ED)).toBe(`bash '${SHARED}/bin/hpcworker' browser-key add ssh-ed25519 ${ED} beethoven-browser`);
    expect(browserKeyAddLine(SHARED, 'ecdsa-sha2-nistp256', EC)).toContain(' browser-key add ecdsa-sha2-nistp256 ');
  });
  it('refuses anything that is not exactly a public key of the two types', () => {
    expect(() => browserKeyAddLine(SHARED, 'ssh-rsa', ED)).toThrow();
    expect(() => browserKeyAddLine(SHARED, 'ssh-ed25519', ED + 'A')).toThrow();
    expect(() => browserKeyAddLine(SHARED, 'ssh-ed25519', ED.slice(0, 60) + "';rm -")).toThrow();
    expect(() => browserKeyAddLine('relative/path', 'ssh-ed25519', ED)).toThrow();
    expect(() => browserKeyAddLine(SHARED, 'ssh-ed25519', ED, 'a b')).toThrow();
  });
  it('reads its success', () => {
    // framework 11's own words (lib/browser_key.sh), as its sshd end-to-end test and a pty session print them
    expect(browserKeyAdded('HPCW-KEY added SHA256:evKD7rL46qlWjJpsUsQ6oLfa6NqQkLpCDWx8Ak50TRs\r\n', 0)).toBe(true);
    expect(browserKeyAdded('bashrc says hello\nHPCW-KEY added SHA256:evKD7rL46qlWjJpsUsQ6oLfa6NqQkLpCDWx8Ak50TRs\n', 0)).toBe(true);
    expect(browserKeyAdded('HPCW-KEY refused agent this runs only for a person at a terminal.', 3)).toBe(false);
    expect(browserKeyAdded('HPCW-KEY added SHA256:evKD7rL46qlWjJpsUsQ6oLfa6NqQkLpCDWx8Ak50TRs', 1)).toBe(false);
    // the words the 12.0.0 core first expected, which framework 11 never prints
    expect(browserKeyAdded('Done. Beethoven on your computer can now reach your grid account (st1234). Go back to your computer.\r\n', 0)).toBe(false);
  });
});

describe("the grid's words, read on 2026-10-01", () => {
  it('the 2FA refusal is recognised, a wrong password is not', () => {
    expect(TWO_FA_REFUSAL_RE.test('You either typed in the wrong code, or you do not have Google Authenticator 2FA setup. Please try again, or login to OnDemand and run the 2FA Setup app.')).toBe(true);
    expect(TWO_FA_REFUSAL_RE.test('Permission denied, please try again.')).toBe(false);
  });
  it('the prompts are told apart for the field and the hint only', () => {
    expect(CODE_PROMPT_RE.test('Your google authenticator one-time verification code: ')).toBe(true);
    expect(PASSWORD_PROMPT_RE.test('Password: ')).toBe(true);
    expect(CODE_PROMPT_RE.test('Password: ')).toBe(false);
  });
});
