// The SSH binary packet transport: version exchange, KEXINIT negotiation, key exchange (curve25519 and
// ecdh-sha2-nistp256), the host key PIN (no trust on first use), NEWKEYS, rekey, strict kex, and the
// transport's own messages (ignore, debug, unimplemented, global requests, ext-info). Everything else
// goes, in arrival order, to ONE consumer (client.ts Connection), which sorts it by its kind.
//
// Ported to TypeScript for 12.0.0 from the spike (v12/iwa/app/client/src/transport.js). The four earlier
// fixes are kept, each marked where it lives:
//   FIX 1 (review t1): application payloads wait for the first NEWKEYS (pin verified, keys in place) and
//          are refused once the transport has failed; a failure closes the stream at once.
//   FIX 2 (review t3): the version exchange and the first key exchange are bounded in time.
//   FIX 3 (review t8): AES-GCM's invocation counter carries (crypto.ts AesGcm.bump).
//   FIX 4 (review t2): the key-exchange message rules are enforced, with strict kex's "KEXINIT first".
// And the three findings the 12.0.0 review left open:
//   NEW A: the host-key signature must be of the algorithm KEXINIT negotiated (crypto.ts verifyHostSig).
//   NEW B: one ordered consumer of application messages (onMessage), never a second waiter that a
//          timed-out read leaves behind to swallow the next message (client.ts sorts by channel id).
//   NEW C: the receive loop no longer stalls on a packet split across reads: bytes that arrive while a
//          packet is being decrypted are seen by the same loop before it rests (`more`).
// Plus a 20-second SSH_MSG_IGNORE keepalive while the connection is idle, and authentication packets
// padded to a 256-byte bucket (sendPacket's `auth` flag).
import { concat, fromUtf8, Reader, SshProtocolError, utf8, Writer, mpintBodyUnsigned } from './bytes';
import { CIPHER_INFO, MAC_INFO, NoneCipher, makeCtrCipher, makeGcmCipher, type PacketCipher } from './ciphers';
import { ecdhP256Ephemeral, fingerprintOf, hasX25519, sha256, verifyHostSig, x25519Ephemeral, type Ephemeral, type HashName } from './crypto';
import { deriveAll } from './kdf';
import { DISCONNECT_REASON, MSG } from './messages';

export const CLIENT_IDENT = 'SSH-2.0-Beethoven_12';
const BANNER_MAX = 8 * 1024;
const IDENT_MAX = 255;
export const KEX_ALGOS = ['curve25519-sha256', 'curve25519-sha256@libssh.org', 'ecdh-sha2-nistp256'];
export const HOSTKEY_ALGOS = ['rsa-sha2-512', 'rsa-sha2-256', 'ssh-ed25519', 'ecdsa-sha2-nistp256', 'ssh-rsa'];
export const CIPHERS = ['aes256-gcm@openssh.com', 'aes256-ctr', 'aes192-ctr', 'aes128-ctr'];
export const MACS = ['hmac-sha2-256', 'hmac-sha1'];
const STRICT_S = 'kex-strict-s-v00@openssh.com';
const STRICT_C = 'kex-strict-c-v00@openssh.com';
const EXT_INFO_C = 'ext-info-c';
/** the idle keepalive: an SSH_MSG_IGNORE when nothing was sent for this long */
export const KEEPALIVE_MS = 20_000;
/** authentication packets are padded to a multiple of this */
export const AUTH_PAD = 256;

function negotiate(client: readonly string[], server: readonly string[], what: string): string {
  for (const a of client) if (server.includes(a)) return a;
  throw new SshProtocolError(`no common ${what}`, DISCONNECT_REASON.KEY_EXCHANGE_FAILED);
}

export interface Negotiated {
  kexAlgo: string;
  hostAlgo: string;
  encCS: string;
  encSC: string;
  macCS: string | null;
  macSC: string | null;
}

export interface TransportOptions {
  /** write bytes to the stream */
  send: (b: Uint8Array) => void;
  /** "SHA256:…": required; the host key must match it before anything else is done with the connection */
  pinnedFingerprint: string;
  log?: (line: string) => void;
  hostKeyAlgos?: string[];
  /** called once, on the first fatal error; the owner closes the stream */
  onFatal?: (e: Error) => void;
  /** the version exchange and the first key exchange must finish within this (20 s) */
  handshakeTimeoutMs?: number;
  /** the idle keepalive's period (20 s; 0: none) */
  keepaliveMs?: number;
}

export class Transport {
  private readonly sendBytes: (b: Uint8Array) => void;
  private readonly pinned: string;
  private readonly log: (line: string) => void;
  private readonly hostKeyAlgos: string[];
  private readonly onFatal: (e: Error) => void;
  private readonly handshakeTimeoutMs: number;
  private readonly keepaliveMs: number;

  /** the one consumer of application messages, in arrival order (NEW B) */
  onMessage: (payload: Uint8Array) => void = () => undefined;

  private ready: Promise<void>;
  private readyRes!: () => void;
  private readyRej!: (e: Error) => void;
  private kexInbound = false;

  private inBuf: Uint8Array = new Uint8Array(0);
  private seqIn = 0;
  private seqOut = 0;
  private cIn: PacketCipher = new NoneCipher();
  private cOut: PacketCipher = new NoneCipher();

  closedError: Error | null = null;
  serverIdent = '';
  readonly clientIdent = CLIENT_IDENT;
  private clientKexInit: Uint8Array | null = null;
  private serverKexInit: Uint8Array | null = null;
  sessionId: Uint8Array | null = null;
  negotiated: Negotiated | null = null;
  strictKex = false;
  firstKexDone = false;
  extInfo: Record<string, string> | null = null;
  serverHostKeyFp = '';

  private processing = false;
  /** NEW C: bytes arrived while the loop was busy; it looks again before it rests */
  private more = false;
  private handshakeResolve: (() => void) | null = null;
  private handshakeReject: ((e: Error) => void) | null = null;
  private kexCtx: { kexAlgo: string; hostAlgo: string; eph: Ephemeral; hashAlg: HashName } | null = null;
  private pendingKeys: { H: Uint8Array; kBody: Uint8Array; hashAlg: HashName } | null = null;
  private outChain: Promise<void> = Promise.resolve();
  private rekeyBlock: Promise<void> | null = null;
  private rekeyResolve: (() => void) | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | undefined;
  private lastSentAt = 0;

  constructor(o: TransportOptions) {
    this.sendBytes = o.send;
    this.pinned = o.pinnedFingerprint;
    this.log = o.log ?? (() => undefined);
    this.hostKeyAlgos = o.hostKeyAlgos ?? HOSTKEY_ALGOS;
    this.onFatal = o.onFatal ?? (() => undefined);
    this.handshakeTimeoutMs = o.handshakeTimeoutMs ?? 20_000;
    this.keepaliveMs = o.keepaliveMs ?? KEEPALIVE_MS;
    this.ready = new Promise<void>((res, rej) => {
      this.readyRes = res;
      this.readyRej = rej;
    });
    this.ready.catch(() => undefined);
  }

  // ---- public ----------------------------------------------------------------------------------------

  /** bytes from the stream */
  receive(bytes: Uint8Array): void {
    if (this.closedError) return; // FIX 1: a failed transport buffers nothing more
    this.inBuf = this.inBuf.length ? concat(this.inBuf, bytes) : bytes.slice();
    this.more = true;
    this.pump().catch((e) => this.fail(e));
  }

  /** the stream ended (peer closed, socket error) */
  remoteClosed(why = 'connection closed by peer'): void {
    this.fail(new SshProtocolError(why));
  }

  /** resolves once the version exchange and the first key exchange are complete (keys in place) */
  async start(): Promise<void> {
    if (this.closedError) throw this.closedError;
    const done = new Promise<void>((res, rej) => {
      this.handshakeResolve = res;
      this.handshakeReject = rej;
    });
    // FIX 2: bounded in time; a silent or half-closed peer fails it
    const timer = setTimeout(() => this.fail(new SshProtocolError(`handshake timed out after ${this.handshakeTimeoutMs} ms`)), this.handshakeTimeoutMs);
    try {
      this.sendBytes(utf8(this.clientIdent + '\r\n'));
      this.log(`> ${this.clientIdent}`);
      await done;
    } finally {
      clearTimeout(timer);
    }
    this.startKeepalive();
  }

  /** send an application payload; `auth` pads it to a 256-byte bucket */
  async sendPacket(payload: Uint8Array, o: { auth?: boolean } = {}): Promise<void> {
    if (this.closedError) throw this.closedError;
    await this.ready; // FIX 1: never before the pinned key exchange has completed
    if (this.rekeyBlock) await this.rekeyBlock;
    if (this.closedError) throw this.closedError;
    await this.writePacket(payload, o.auth ? AUTH_PAD : undefined, !!o.auth);
  }

  /** a DISCONNECT, when the session is up (best effort) */
  disconnect(reason: number = DISCONNECT_REASON.BY_APPLICATION, desc = 'bye'): Promise<void> {
    if (this.closedError || !this.firstKexDone) return Promise.resolve();
    const p = new Writer().byte(MSG.DISCONNECT).u32(reason).string(desc).string('').bytes();
    return this.writePacket(p).catch(() => undefined);
  }

  /** end this transport: nothing more is read or written; the owner closes the stream (onFatal) */
  close(why = 'closed by client'): void {
    this.fail(new SshProtocolError(why));
  }

  // ---- internals -------------------------------------------------------------------------------------

  private fail(e: unknown): void {
    if (this.closedError) return;
    this.closedError = e instanceof Error ? e : new Error(String(e));
    this.inBuf = new Uint8Array(0);
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = undefined;
    if (this.handshakeReject) {
      this.handshakeReject(this.closedError);
      this.handshakeReject = null;
    }
    this.readyRej(this.closedError);
    if (this.rekeyResolve) {
      const r = this.rekeyResolve;
      this.rekeyResolve = null;
      r();
    }
    this.log(`! ${this.closedError.message}`);
    try {
      this.onFatal(this.closedError);
    } catch {
      /* the owner's business */
    }
  }

  private startKeepalive(): void {
    if (!this.keepaliveMs || this.keepaliveTimer || this.closedError) return;
    const period = Math.max(50, Math.floor(this.keepaliveMs / 2));
    this.keepaliveTimer = setInterval(() => {
      if (this.closedError) return;
      if (Date.now() - this.lastSentAt < this.keepaliveMs) return;
      const pad = new Uint8Array(1 + Math.floor(Math.random() * 16));
      globalThis.crypto.getRandomValues(pad);
      void this.sendPacket(new Writer().byte(MSG.IGNORE).string(pad).bytes()).catch(() => undefined);
    }, period);
  }

  private async writePacket(payload: Uint8Array, padTo?: number, wipe = false): Promise<void> {
    // every outbound write in order: the cipher's counter and the sequence number move with each packet,
    // so two packs must never interleave at their await points
    const prev = this.outChain;
    let release!: () => void;
    this.outChain = new Promise<void>((r) => (release = r));
    await prev;
    try {
      if (this.closedError) throw this.closedError; // FIX 1: nothing after a fatal error
      const wire = await this.cOut.pack(payload, this.seqOut, { ...(padTo ? { padTo } : {}), ...(wipe ? { wipe } : {}) });
      if (this.closedError) throw this.closedError;
      this.seqOut = (this.seqOut + 1) >>> 0;
      this.lastSentAt = Date.now();
      this.sendBytes(wire);
    } finally {
      release();
    }
  }

  private async pump(): Promise<void> {
    if (this.processing) return; // NEW C: the running loop sees `more` and looks again
    this.processing = true;
    try {
      while (this.more && !this.closedError) {
        this.more = false;
        if (!this.serverIdent && !this.readServerIdent()) continue;
        for (;;) {
          const r = await this.cIn.unpack(this.inBuf, this.seqIn);
          if (!r) break;
          this.inBuf = this.inBuf.subarray(r.consumed);
          const seq = this.seqIn;
          this.seqIn = (this.seqIn + 1) >>> 0;
          await this.handle(r.payload, seq);
          if (this.closedError) return;
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private readServerIdent(): boolean {
    // lines that do not start "SSH-" are the optional pre-banner (RFC 4253 4.2) and are dropped
    const buf = this.inBuf;
    let start = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] !== 0x0a) continue;
      let end = i;
      if (end > start && buf[end - 1] === 0x0d) end -= 1;
      const line = fromUtf8(buf.subarray(start, end));
      if (line.startsWith('SSH-')) {
        if (line.length > IDENT_MAX) {
          this.fail(new SshProtocolError('ident line too long'));
          return false;
        }
        if (!/^SSH-(2\.0|1\.99)-/.test(line)) {
          this.fail(new SshProtocolError('not an SSH-2 server'));
          return false;
        }
        this.serverIdent = line;
        this.log(`< ${line}`);
        this.inBuf = buf.subarray(i + 1);
        this.more = true;
        this.startKex().catch((e) => this.fail(e));
        return true;
      }
      start = i + 1;
      if (start > BANNER_MAX) {
        this.fail(new SshProtocolError('pre-banner too large'));
        return false;
      }
    }
    if (buf.length > BANNER_MAX + IDENT_MAX) this.fail(new SshProtocolError('ident not seen within limit'));
    return false;
  }

  private async handle(payload: Uint8Array, seq: number): Promise<void> {
    const type = payload[0]!;
    // FIX 4: between a party's KEXINIT and its NEWKEYS only transport messages (1-49) may come; a
    // service, auth or channel message before the first NEWKEYS, or inside a later exchange, is fatal
    // (and SERVICE_ACCEPT, which belongs to the encrypted session: one injected before NEWKEYS would be read for the real one)
    if ((type >= 50 || type === MSG.SERVICE_ACCEPT) && (!this.firstKexDone || this.kexInbound)) throw new SshProtocolError(`unexpected message ${type} during key exchange`);
    // strict kex: during the initial exchange only KEXINIT, 30-49 and NEWKEYS (DISCONNECT ends it anyway)
    if (!this.firstKexDone && this.strictKex && !(type === MSG.KEXINIT || type === MSG.NEWKEYS || type === MSG.DISCONNECT || (type >= 30 && type <= 49))) {
      throw new SshProtocolError(`strict kex violation: message ${type} during initial key exchange`);
    }
    switch (type) {
      case MSG.DISCONNECT: {
        const r = new Reader(payload);
        r.byte();
        const code = r.u32();
        const desc = r.text();
        this.fail(Object.assign(new SshProtocolError(`server disconnect (${code}): ${desc}`), { serverDisconnect: { code, desc } }));
        return;
      }
      case MSG.IGNORE:
        return;
      case MSG.DEBUG: {
        const r = new Reader(payload);
        r.byte();
        r.bool();
        this.log(`<debug ${r.text().slice(0, 200)}`);
        return;
      }
      case MSG.UNIMPLEMENTED:
        return;
      case MSG.EXT_INFO:
        this.parseExtInfo(payload);
        return;
      case MSG.KEXINIT:
        await this.onServerKexInit(payload, seq);
        return;
      case MSG.NEWKEYS:
        await this.onNewKeys();
        return;
      case MSG.KEX_ECDH_REPLY:
        await this.onKexReply(payload);
        return;
      case MSG.GLOBAL_REQUEST: {
        // nothing is granted: REQUEST_FAILURE when a reply is wanted
        const r = new Reader(payload);
        r.byte();
        r.text();
        if (r.bool()) await this.writePacket(new Writer().byte(MSG.REQUEST_FAILURE).bytes());
        return;
      }
      default:
        // an unknown transport message is ignored; SERVICE_ACCEPT and everything from 50 up go to the one consumer, in order (NEW B)
        if (type < 50 && type !== MSG.SERVICE_ACCEPT) return;
        this.onMessage(payload);
    }
  }

  private parseExtInfo(payload: Uint8Array): void {
    const r = new Reader(payload);
    r.byte();
    const n = r.u32();
    const ext: Record<string, string> = {};
    for (let i = 0; i < n && i < 64; i++) {
      const k = r.text();
      ext[k] = r.text();
    }
    this.extInfo = ext;
  }

  // ---- key exchange ----------------------------------------------------------------------------------

  private buildKexInit(): Uint8Array {
    const cookie = new Uint8Array(16);
    globalThis.crypto.getRandomValues(cookie);
    const w = new Writer();
    w.byte(MSG.KEXINIT).raw(cookie);
    w.nameList([...KEX_ALGOS, STRICT_C, EXT_INFO_C]);
    w.nameList(this.hostKeyAlgos);
    w.nameList(CIPHERS).nameList(CIPHERS);
    w.nameList(MACS).nameList(MACS);
    w.nameList(['none']).nameList(['none']);
    w.nameList([]).nameList([]);
    w.bool(false);
    w.u32(0);
    return w.bytes();
  }

  private async startKex(): Promise<void> {
    this.clientKexInit = this.buildKexInit();
    await this.writePacket(this.clientKexInit);
  }

  private async onServerKexInit(payload: Uint8Array, seq: number): Promise<void> {
    if (this.kexInbound) throw new SshProtocolError('KEXINIT received during a key exchange');
    this.kexInbound = true;
    this.serverKexInit = payload.slice();
    // a KEXINIT with none of ours outstanding is the server's rekey: hold the application's traffic and answer
    if (!this.clientKexInit) {
      if (this.firstKexDone) this.beginRekeyBlock();
      await this.startKex();
    }
    const r = new Reader(payload);
    r.byte();
    r.raw(16);
    const sKex = r.nameList();
    const sHost = r.nameList();
    const sCS = r.nameList();
    const sSC = r.nameList();
    const sMacCS = r.nameList();
    const sMacSC = r.nameList();
    if (!this.firstKexDone && sKex.includes(STRICT_S)) {
      this.strictKex = true;
      // FIX 4: under strict kex the server's KEXINIT must be its very first packet
      if (seq !== 0) throw new SshProtocolError('strict kex violation: KEXINIT was not the first packet');
    }
    const kexAlgo = negotiate(KEX_ALGOS, sKex, 'kex');
    const hostAlgo = negotiate(this.hostKeyAlgos, sHost, 'host key');
    const encCS = negotiate(CIPHERS, sCS, 'cipher c->s');
    const encSC = negotiate(CIPHERS, sSC, 'cipher s->c');
    const macCS = CIPHER_INFO[encCS]!.kind === 'gcm' ? null : negotiate(MACS, sMacCS, 'mac c->s');
    const macSC = CIPHER_INFO[encSC]!.kind === 'gcm' ? null : negotiate(MACS, sMacSC, 'mac s->c');
    this.negotiated = { kexAlgo, hostAlgo, encCS, encSC, macCS, macSC };
    this.log(`negotiated kex=${kexAlgo} host=${hostAlgo} enc=${encCS}/${encSC} mac=${macCS}/${macSC}`);
    let eph: Ephemeral;
    if (kexAlgo.startsWith('curve25519')) {
      if (!(await hasX25519())) throw new SshProtocolError('the server needs curve25519 and this browser lacks X25519', DISCONNECT_REASON.KEY_EXCHANGE_FAILED);
      eph = await x25519Ephemeral();
    } else eph = await ecdhP256Ephemeral();
    this.kexCtx = { kexAlgo, hostAlgo, eph, hashAlg: 'SHA-256' };
    await this.writePacket(new Writer().byte(MSG.KEX_ECDH_INIT).string(eph.pub).bytes());
  }

  private async onKexReply(payload: Uint8Array): Promise<void> {
    const ctx = this.kexCtx;
    if (!ctx) throw new SshProtocolError('unexpected KEX_ECDH_REPLY');
    const r = new Reader(payload);
    r.byte();
    const hostKeyBlob = r.string();
    const serverPub = r.string();
    const sigBlob = r.string();
    // the pin first: nothing else is done with a host that is not the grid
    const fp = await fingerprintOf(hostKeyBlob);
    if (fp !== this.pinned) throw Object.assign(new SshProtocolError(`host key fingerprint mismatch: got ${fp}`, DISCONNECT_REASON.HOST_KEY_NOT_VERIFIABLE), { hostKeyMismatch: true });
    const shared = await ctx.eph.deriveShared(serverPub);
    const kBody = mpintBodyUnsigned(shared);
    const hashInput = new Writer()
      .string(this.clientIdent)
      .string(this.serverIdent)
      .string(this.clientKexInit!)
      .string(this.serverKexInit!)
      .string(hostKeyBlob)
      .string(ctx.eph.pub)
      .string(serverPub)
      .string(kBody)
      .bytes();
    const H = await sha256(hashInput);
    // NEW A: the signature must be of the negotiated algorithm
    const ok = await verifyHostSig(ctx.hostAlgo, hostKeyBlob, sigBlob, H);
    if (!ok) throw Object.assign(new SshProtocolError('host key signature verification failed', DISCONNECT_REASON.HOST_KEY_NOT_VERIFIABLE), { hostKeyMismatch: true });
    this.serverHostKeyFp = fp;
    if (!this.sessionId) this.sessionId = H.slice();
    this.pendingKeys = { H, kBody, hashAlg: ctx.hashAlg };
    await this.writePacket(new Writer().byte(MSG.NEWKEYS).bytes());
    // our outgoing cipher changes after our NEWKEYS is on the wire
    await this.installKeys('out');
    if (this.strictKex) this.seqOut = 0;
    this.kexCtx = null;
  }

  private async onNewKeys(): Promise<void> {
    if (!this.pendingKeys) throw new SshProtocolError('unexpected NEWKEYS');
    await this.installKeys('in');
    if (this.strictKex) this.seqIn = 0;
    const first = !this.firstKexDone;
    this.firstKexDone = true;
    this.kexInbound = false;
    this.pendingKeys = null;
    this.clientKexInit = null; // a later server KEXINIT starts a new round
    if (first) this.readyRes();
    if (this.rekeyBlock) {
      const r = this.rekeyResolve;
      this.rekeyBlock = null;
      this.rekeyResolve = null;
      r?.();
    }
    if (first && this.handshakeResolve) {
      const res = this.handshakeResolve;
      this.handshakeResolve = null;
      this.handshakeReject = null;
      res();
    }
  }

  private async installKeys(dir: 'in' | 'out'): Promise<void> {
    const pk = this.pendingKeys!;
    const n = this.negotiated!;
    const name = dir === 'out' ? n.encCS : n.encSC;
    const macName = dir === 'out' ? n.macCS : n.macSC;
    const info = CIPHER_INFO[name]!;
    const keys = await deriveAll(pk.hashAlg, pk.kBody, pk.H, this.sessionId!, {
      ivCtoS: CIPHER_INFO[n.encCS]!.ivBytes,
      ivStoC: CIPHER_INFO[n.encSC]!.ivBytes,
      encCtoS: CIPHER_INFO[n.encCS]!.keyBytes,
      encStoC: CIPHER_INFO[n.encSC]!.keyBytes,
      intCtoS: n.macCS ? MAC_INFO[n.macCS]!.keyBytes : 0,
      intStoC: n.macSC ? MAC_INFO[n.macSC]!.keyBytes : 0,
    });
    const encKey = dir === 'out' ? keys.encCtoS : keys.encStoC;
    const iv = dir === 'out' ? keys.ivCtoS : keys.ivStoC;
    const cipher = info.kind === 'gcm' ? await makeGcmCipher(encKey, iv) : await makeCtrCipher(macName!, encKey, iv, dir === 'out' ? keys.intCtoS : keys.intStoC);
    if (dir === 'out') this.cOut = cipher;
    else this.cIn = cipher;
  }

  private beginRekeyBlock(): void {
    if (this.rekeyBlock) return;
    this.rekeyBlock = new Promise<void>((res) => (this.rekeyResolve = res));
  }
}
