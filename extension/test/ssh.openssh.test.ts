// Beethoven's ssh client against a real OpenSSH sshd (Ubuntu's, run in user space in WSL), configured like
// the grid's door: an RSA host key, curve25519 / ecdh-sha2-nistp256, aes-ctr, hmac-sha1; and the browser
// key's line exactly as framework 11 writes it, restrict,command="<gate>" <type> <base64> beethoven-browser
// <date>, with a gate stand-in as the forced command. What it shows: a non-extractable Ed25519 and P-256
// key sign in; whatever command is asked for, the gate runs (SSH_ORIGINAL_COMMAND); restrict refuses a
// terminal and the command still runs without one. Skipped where WSL or its extracted sshd is missing.
// The grid itself runs OpenSSH 7.4: this is 9.6, the closest at hand (unproven on the grid's own).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SshConnection, SshIdentity, generateKeyPair, type KeyAlg } from '../src/ssh';
import { tcpStream } from './sshgrid/harness';

const SCRIPT = fileURLToPath(new URL('./sshgrid/wsl_sshd.sh', import.meta.url));
const PORT = 2232;

function wslPath(win: string): string {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(win);
  return m ? `/mnt/${m[1]!.toLowerCase()}/${m[2]!.replace(/\\/g, '/')}` : win;
}

function wsl(args: string[], input?: string): { ok: boolean; out: string } {
  try {
    const r = spawnSync('wsl', ['-e', 'bash', wslPath(SCRIPT), ...args], { input, timeout: 60_000, encoding: 'utf8' });
    return { ok: r.status === 0, out: String(r.stdout ?? '') };
  } catch {
    return { ok: false, out: '' };
  }
}

const started = process.platform === 'win32' ? wsl(['start', String(PORT)]) : { ok: false, out: '' };
const READY = started.ok && /READY/.test(started.out);
const FP = /HOST_FP=(\S+)/.exec(started.out)?.[1] ?? '';
const USER = /USER=(\S+)/.exec(started.out)?.[1] ?? '';
const GATE = /GATE=(\S+)/.exec(started.out)?.[1] ?? '';

async function identity(alg: KeyAlg): Promise<SshIdentity> {
  const pair = await generateKeyPair(alg, false);
  return new SshIdentity(alg, pair.privateKey, new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
}

describe.skipIf(!READY)('against OpenSSH configured like the grid, the browser key restricted to the gate', () => {
  let ed: SshIdentity | undefined;
  let ec: SshIdentity;
  beforeAll(async () => {
    try {
      ed = await identity('ed25519');
    } catch {
      ed = undefined;
    }
    ec = await identity('ecdsa-p256');
    const line = (id: SshIdentity) => `restrict,command="${GATE}" ${id.keyType} ${id.publicKeyBase64()} beethoven-browser 2026-10-02`;
    const lines = [ec, ...(ed ? [ed] : [])].map(line).join('\n') + '\n';
    expect(wsl(['authkeys'], lines).ok).toBe(true);
  });
  afterAll(() => {
    wsl(['stop']);
  });

  const open = async () => {
    const stream = await tcpStream(PORT);
    const conn = new SshConnection({ stream, username: USER, pinnedFingerprint: FP });
    const info = await conn.connect();
    return { conn, info };
  };

  it('negotiates what the grid offers, the host key pinned', async () => {
    const { conn, info } = await open();
    expect(info.hostKeyFingerprint).toBe(FP);
    expect(info.negotiated).toMatchObject({ macCS: 'hmac-sha1', macSC: 'hmac-sha1' });
    expect(info.negotiated?.hostAlgo).toMatch(/^rsa-sha2-(512|256)$/);
    expect(info.negotiated?.encCS).toMatch(/-ctr$/);
    expect((await conn.authMethods()).methods).toEqual(['publickey']);
    await conn.close();
  });

  for (const which of ['ecdsa-p256', 'ed25519'] as const) {
    it(`a non-extractable ${which} key signs in; any command runs the gate; no terminal is given`, async () => {
      const id = which === 'ed25519' ? ed : ec;
      if (!id) return; // no Ed25519 in this WebCrypto
      expect(id.privateKey.extractable).toBe(false);
      const { conn } = await open();
      expect((await conn.authPublicKey(id)).success).toBe(true);
      const v = await conn.exec('version');
      expect(v.stdoutText).toBe(`HPCW-GATE ok 11 never ${USER} claude=no\n`);
      const other = await conn.exec('cat /etc/passwd; id');
      expect(other.exitStatus).toBe(126);
      expect(other.stdoutText).toBe('HPCW-GATE refused\n');
      const tty = await conn.exec('tty', { pty: true });
      expect(tty.stdoutText.replace(/\r/g, '')).toBe('tty=no\n');
      await conn.close();
    });
  }

  it('a key not in the file is refused', async () => {
    const stranger = await identity('ecdsa-p256');
    const { conn } = await open();
    expect((await conn.authPublicKey(stranger)).success).toBe(false);
    await conn.close();
  });
});
