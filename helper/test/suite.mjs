// The Beethoven bridge test suite. Starts one installed or source host the way Chrome would and
// speaks protocol 1 to it: hello, connections to local TCP servers (echo, sink, sender), an ssh
// server's banner, large transfers, both kinds of half-close, close, refusals before any connection,
// malformed frames, the frame-size cap, the connection cap and exit when stdin closes.
//
//   node test/suite.mjs --host <bridge.cmd | bridge.pl | bridge.py | installed launcher>
//        [--sshd 127.0.0.1:PORT]                       ssh banner exchange through the bridge
//        [--ssh-user U --ssh-fp SHA256:... --ssh-authkeys FILE --ssh-client DIR]
//                                                      a whole ssh sign-in and exec through it
//        [--grid-banner]                               one connection to grid.wayne.edu:22 that
//                                                      reads the banner and closes; sends nothing
//        [--label NAME] [--json OUT]
//
// The suite writes allow.txt beside the real host file (that is where every host reads it) with
// the local servers' ports, and removes it afterwards. It never logs payloads either.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import {
  launchHost, echoServer, sinkServer, slowSinkServer, senderServer, counterServer, closedPort, sha, stats, sleep,
} from './lib.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const flag = (k) => args.includes(k);
const hostPath = opt('--host');
if (!hostPath) { console.error('usage: node test/suite.mjs --host <path> [options]'); process.exit(2); }
const label = opt('--label') || path.basename(hostPath);
const EXPECT_VERSION = fs.readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim();

const results = [];
const metrics = {};
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
}
async function test(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail || '');
  } catch (e) {
    record(name, false, e.message);
  }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

// The directory where the host really lives (a launcher may sit beside it or be the file itself).
const realHost = fs.realpathSync(hostPath);
const hostDir = path.dirname(realHost);
const allowFile = path.join(hostDir, 'allow.txt');
const hadAllow = fs.existsSync(allowFile) ? fs.readFileSync(allowFile) : null;
const filesBefore = fs.readdirSync(hostDir).sort();

const echo = await echoServer();
const sink = await sinkServer();
const slow = await slowSinkServer(1500);
const SENDER_SIZE = 2 * 1024 * 1024;
const sender = await senderServer(SENDER_SIZE);
const counter = await counterServer();
const deadPort = await closedPort();
const sshd = opt('--sshd');
const allowLines = [
  '# written by helper/test/suite.mjs; removed when the suite ends',
  `127.0.0.1:${echo.port}`,
  `127.0.0.1:${sink.port}`,
  `127.0.0.1:${slow.port}`,
  `127.0.0.1:${sender.port}`,
  `127.0.0.1:${deadPort}`,
  'no-such-host.invalid:22',
];
if (sshd) allowLines.push(sshd);
fs.writeFileSync(allowFile, allowLines.join('\n') + '\n');

const hosts = [];
function start() { const h = launchHost(hostPath); hosts.push(h); return h; }

let seq = 0;
const nid = (p = 'c') => `${p}${++seq}`;

async function openTo(h, hostName, port, id = nid()) {
  const t = performance.now();
  h.send({ t: 'open', id, host: hostName, port });
  const m = await h.waitFor((x) => x.id === id && (x.t === 'opened' || x.t === 'error'), 20000, `opened ${id}`);
  if (m.t !== 'opened') throw new Error(`open ${hostName}:${port} gave ${m.t} ${m.reason}`);
  return { id, ms: performance.now() - t };
}

async function collect(h, id, expectBytes, ms = 60000) {
  const parts = [];
  let got = 0;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`received ${got} of ${expectBytes} bytes`)), ms);
    h.sink(id, (b) => {
      parts.push(b);
      got += b.length;
      if (got >= expectBytes) { clearTimeout(timer); h.sinks.delete(id); resolve(Buffer.concat(parts)); }
    });
  });
}

const main = start();

await test('hello: protocol, version, os, kind and allowlist', async () => {
  main.send({ t: 'hello', v: 1 });
  const m = await main.waitT('hello', undefined, 30000);
  metrics.coldStartToHelloMs = +(m._at - main.t0).toFixed(1);
  assert(m.v === 1, `v=${m.v}`);
  assert(m.helper === EXPECT_VERSION, `helper=${m.helper}, expected ${EXPECT_VERSION}`);
  assert(['windows', 'mac', 'linux'].includes(m.os), `os=${m.os}`);
  assert(m.kind === 'script', `kind=${m.kind}`);
  assert(Array.isArray(m.allow) && m.allow[0] === 'grid.wayne.edu:22', `allow[0]=${m.allow?.[0]}`);
  assert(m.allow.includes(`127.0.0.1:${echo.port}`), 'allow.txt entries missing from hello');
  metrics.os = m.os;
  metrics.runtime = m.runtime;
  return `${m.os}/${m.runtime} ${m.helper}, cold start to hello ${metrics.coldStartToHelloMs} ms, allow ${m.allow.length}`;
});

await test('open to a local echo server and round-trip small messages', async () => {
  const { id, ms } = await openTo(main, '127.0.0.1', echo.port);
  metrics.openMs = +ms.toFixed(1);
  const rtts = [];
  for (let i = 0; i < 50; i++) {
    const payload = crypto.randomBytes(32);
    const t = performance.now();
    const got = collect(main, id, 32, 10000);
    main.sendBytes(id, payload);
    const b = await got;
    rtts.push(performance.now() - t);
    assert(b.equals(payload), `echo ${i} differs`);
  }
  metrics.echoRttMs = stats(rtts);
  main.send({ t: 'close', id });
  const c = await main.waitT('closed', id);
  assert(c.reason === 'local', `closed reason ${c.reason}`);
  return `open ${metrics.openMs} ms; echo RTT median ${metrics.echoRttMs.median} ms, p95 ${metrics.echoRttMs.p95} ms (n=50)`;
});

await test('large transfer: 4 MiB each way through an echo, byte-exact, frames within 64 KiB of base64', async () => {
  const { id } = await openTo(main, '127.0.0.1', echo.port);
  const size = 4 * 1024 * 1024;
  const payload = crypto.randomBytes(size);
  const t = performance.now();
  const got = collect(main, id, size, 120000);
  main.sendBytes(id, payload);
  const b = await got;
  const secs = (performance.now() - t) / 1000;
  assert(sha(b) === sha(payload), 'echoed bytes differ');
  assert(main.maxB64 <= 65536, `a data frame carried ${main.maxB64} base64 characters`);
  metrics.echo4MiBSeconds = +secs.toFixed(2);
  metrics.echoMiBps = +((size / 1048576) / secs).toFixed(2);
  main.send({ t: 'close', id });
  await main.waitT('closed', id);
  return `${metrics.echo4MiBSeconds} s round trip (${metrics.echoMiBps} MiB/s each way), largest frame ${main.maxB64} b64 chars`;
});

await test('a 700 KiB data message (under the 1 MiB frame cap) is accepted', async () => {
  const { id } = await openTo(main, '127.0.0.1', echo.port);
  const payload = crypto.randomBytes(700 * 1024);
  const got = collect(main, id, payload.length, 30000);
  main.send({ t: 'data', id, b64: payload.toString('base64') });
  const b = await got;
  assert(b.equals(payload), 'bytes differ');
  main.send({ t: 'close', id });
  await main.waitT('closed', id);
});

await test('data sent before "opened" is held and delivered once the connection is up', async () => {
  const id = nid('early');
  const payload = crypto.randomBytes(5000);
  const got = collect(main, id, payload.length, 30000);
  main.send({ t: 'open', id, host: '127.0.0.1', port: echo.port });
  main.sendBytes(id, payload);
  const b = await got;
  assert(b.equals(payload), 'bytes differ');
  await main.waitT('opened', id);
  main.send({ t: 'close', id });
  await main.waitT('closed', id);
});

await test('backpressure: 16 MiB to a server that reads nothing for 1.5 s arrives whole', async () => {
  const { id } = await openTo(main, '127.0.0.1', slow.port);
  const payload = crypto.randomBytes(16 * 1024 * 1024);
  const t = performance.now();
  main.sendBytes(id, payload);
  main.send({ t: 'hello', v: 1 });
  const h = await main.waitT('hello', undefined, 120000);
  main.send({ t: 'close', id });
  await main.waitT('closed', id, 120000);
  const r = await slow.next(120000);
  assert(r.bytes === payload.length && r.sha === sha(payload) && r.fin, `server got ${r.bytes} of ${payload.length} bytes, fin ${r.fin}`);
  return `all ${r.bytes} bytes and a FIN; a hello queued behind them answered after ${((h._at - t) / 1000).toFixed(1)} s`;
});

await test('two connections at once keep their bytes apart', async () => {
  const a = await openTo(main, '127.0.0.1', echo.port);
  const b = await openTo(main, '127.0.0.1', echo.port);
  const pa = crypto.randomBytes(300 * 1024);
  const pb = crypto.randomBytes(200 * 1024);
  const ga = collect(main, a.id, pa.length);
  const gb = collect(main, b.id, pb.length);
  for (let off = 0; off < Math.max(pa.length, pb.length); off += 16384) {
    if (off < pa.length) main.sendBytes(a.id, pa.subarray(off, off + 16384));
    if (off < pb.length) main.sendBytes(b.id, pb.subarray(off, off + 16384));
  }
  const [ra, rb] = await Promise.all([ga, gb]);
  assert(ra.equals(pa) && rb.equals(pb), 'streams mixed or corrupted');
  main.send({ t: 'close', id: a.id });
  main.send({ t: 'close', id: b.id });
  await main.waitT('closed', a.id);
  await main.waitT('closed', b.id);
});

await test('half-close by the server: every byte arrives before closed(eof)', async () => {
  const { id } = await openTo(main, '127.0.0.1', sender.port);
  const parts = [];
  let lastDataAt = 0;
  main.sink(id, (b, m) => { parts.push(b); lastDataAt = m._at; });
  const c = await main.waitT('closed', id, 30000);
  main.sinks.delete(id);
  const b = Buffer.concat(parts);
  assert(c.reason === 'eof', `reason ${c.reason}`);
  assert(b.length === SENDER_SIZE, `got ${b.length} of ${SENDER_SIZE}`);
  assert(sha(b) === sha(sender.payload), 'bytes differ');
  assert(c._at >= lastDataAt, 'closed arrived before the last data');
  return `${b.length} bytes then closed(eof)`;
});

await test('close right after 3 MiB: the bridge flushes, then sends FIN (half-close by us)', async () => {
  const { id } = await openTo(main, '127.0.0.1', sink.port);
  const payload = crypto.randomBytes(3 * 1024 * 1024);
  main.sendBytes(id, payload);
  main.send({ t: 'close', id });
  const c = await main.waitT('closed', id, 30000);
  assert(c.reason === 'local', `reason ${c.reason}`);
  const r = await sink.next(30000);
  assert(r.bytes === payload.length, `server got ${r.bytes} of ${payload.length}`);
  assert(r.sha === sha(payload), 'server bytes differ');
  assert(r.fin, 'server saw no FIN');
  return `server received all ${r.bytes} bytes and a FIN`;
});

await test('data and close for an unknown or closed id are refused', async () => {
  const { id } = await openTo(main, '127.0.0.1', echo.port);
  main.send({ t: 'close', id });
  await main.waitT('closed', id);
  main.send({ t: 'data', id, b64: 'AAAA' });
  const e1 = await main.waitT('error', id);
  main.send({ t: 'close', id });
  const e2 = await main.waitT('error', id);
  main.send({ t: 'data', id: 'never-opened', b64: 'AAAA' });
  const e3 = await main.waitT('error', 'never-opened');
  assert(e1.reason === 'unknown_id' && e2.reason === 'unknown_id' && e3.reason === 'unknown_id', `${e1.reason} ${e2.reason} ${e3.reason}`);
});

await test('hosts and ports off the allowlist are refused before any connection', async () => {
  const before = counter.accepts;
  const cases = [
    ['127.0.0.1', counter.port],
    ['localhost', echo.port],
    ['grid.wayne.edu', 2222],
    ['grid.wayne.edu', 23],
    ['grid.wayne.edu.evil.example', 22],
    ['evil.example.com', 22],
    ['ondemand.grid.wayne.edu', 443],
  ];
  for (const [h, p] of cases) {
    const id = nid('na');
    const t = performance.now();
    main.send({ t: 'open', id, host: h, port: p });
    const m = await main.waitFor((x) => x.id === id && (x.t === 'error' || x.t === 'opened'), 10000, `refusal ${h}:${p}`);
    assert(m.t === 'error' && m.reason === 'not_allowed', `${h}:${p} gave ${m.t} ${m.reason}`);
    metrics.refusalMs = +(performance.now() - t).toFixed(2);
  }
  await sleep(300);
  assert(counter.accepts === before, `the refused port saw ${counter.accepts - before} connection(s)`);
  return `${cases.length} refusals, 0 connections reached the listener`;
});

await test('connection refused and unknown name are reported as errors', async () => {
  const id1 = nid('rf');
  main.send({ t: 'open', id: id1, host: '127.0.0.1', port: deadPort });
  const m1 = await main.waitFor((x) => x.id === id1 && (x.t === 'error' || x.t === 'opened'), 20000, 'refused');
  assert(m1.t === 'error' && m1.reason === 'refused', `closed port gave ${m1.t} ${m1.reason}`);
  const id2 = nid('dn');
  main.send({ t: 'open', id: id2, host: 'no-such-host.invalid', port: 22 });
  const m2 = await main.waitFor((x) => x.id === id2 && (x.t === 'error' || x.t === 'opened'), 30000, 'dns');
  assert(m2.t === 'error' && m2.reason === 'dns', `unknown name gave ${m2.t} ${m2.reason}`);
});

await test('malformed frames get an error and the bridge carries on', async () => {
  const raw = (s) => main.sendRaw(Buffer.isBuffer(s) ? s : Buffer.from(s, 'utf8'));
  const expect = async (send, id, reason) => {
    send();
    const m = await main.waitFor((x) => x.t === 'error' && x.id === id, 10000, `error ${reason}`);
    assert(m.reason === reason, `expected ${reason}, got ${m.reason}`);
  };
  await expect(() => raw('not json'), '', 'bad_json');
  await expect(() => raw('[1,2]'), '', 'bad_json');
  await expect(() => raw('"open"'), '', 'bad_json');
  await expect(() => raw('{"t":"open","id":"x","host":"grid.wayne.edu","port":22'), '', 'bad_json');
  await expect(() => raw('{"t":"open","id":"n1","host":{"a":1},"port":22}'), '', 'bad_json');
  await expect(() => raw(Buffer.from([0x7b, 0x22, 0x74, 0x22, 0x3a, 0x22, 0xff, 0xfe, 0x22, 0x7d])), '', 'bad_json');
  await expect(() => raw(Buffer.alloc(0)), '', 'bad_json');
  await expect(() => raw('{"t":5}'), '', 'bad_message');
  await expect(() => raw('{"id":"m1"}'), 'm1', 'bad_message');
  await expect(() => raw('{"t":"bogus","id":"m2"}'), 'm2', 'unknown_type');
  await expect(() => raw('{"t":"open","host":"grid.wayne.edu","port":22}'), '', 'bad_id');
  await expect(() => raw('{"t":"open","id":"bad id!","host":"grid.wayne.edu","port":22}'), '', 'bad_id');
  await expect(() => raw(`{"t":"open","id":"${'x'.repeat(65)}","host":"grid.wayne.edu","port":22}`), '', 'bad_id');
  await expect(() => raw('{"t":"open","id":"nl\\n","host":"grid.wayne.edu","port":22}'), '', 'bad_id');
  await expect(() => raw('{"t":"open","id":"p1","host":"grid.wayne.edu","port":"22"}'), 'p1', 'bad_port');
  await expect(() => raw('{"t":"open","id":"p2","host":"grid.wayne.edu","port":22.5}'), 'p2', 'bad_port');
  await expect(() => raw('{"t":"open","id":"p3","host":"grid.wayne.edu","port":70000}'), 'p3', 'bad_port');
  await expect(() => raw('{"t":"open","id":"p4","host":"grid.wayne.edu","port":true}'), 'p4', 'bad_port');
  await expect(() => raw('{"t":"open","id":"h1","host":"grid wayne edu","port":22}'), 'h1', 'bad_host');
  await expect(() => raw('{"t":"open","id":"h2","port":22}'), 'h2', 'bad_host');
  const { id } = await openTo(main, '127.0.0.1', echo.port);
  await expect(() => raw(`{"t":"open","id":"${id}","host":"127.0.0.1","port":${echo.port}}`), id, 'duplicate_id');
  await expect(() => raw(`{"t":"data","id":"${id}","b64":"!!!!"}`), id, 'bad_b64');
  await expect(() => raw(`{"t":"data","id":"${id}","b64":"abc"}`), id, 'bad_b64');
  await expect(() => raw(`{"t":"data","id":"${id}","b64":"QUJD RA=="}`), id, 'bad_b64');
  await expect(() => raw(`{"t":"data","id":"${id}"}`), id, 'bad_b64');
  // escapes in a key and in a value are read, and unknown fields are ignored
  const got = collect(main, id, 3, 10000);
  raw(`{"t":"d\\u0061ta","id":"${id}","b64":"QUJD","extra":null}`);
  assert((await got).toString() === 'ABC', 'escaped message was not read');
  main.send({ t: 'close', id });
  await main.waitT('closed', id);
  main.send({ t: 'hello', v: 1 });
  await main.waitT('hello');
  return '25 malformed frames refused with the right reason; the bridge still answers';
});

await test('no more than 8 connections at once', async () => {
  // A connection the extension has just closed keeps its slot until its last bytes and FIN are
  // through (normally milliseconds; at most 12 s), so give the earlier tests' connections a moment.
  await sleep(500);
  const ids = [];
  for (let i = 0; i < 8; i++) { try { ids.push((await openTo(main, "127.0.0.1", echo.port)).id); } catch (e) { throw new Error(`open ${i + 1} of 8: ${e.message}`); } }
  const id = nid('cap');
  main.send({ t: 'open', id, host: '127.0.0.1', port: echo.port });
  const m = await main.waitFor((x) => x.id === id, 10000, 'too_many');
  assert(m.t === 'error' && m.reason === 'too_many', `ninth gave ${m.t} ${m.reason}`);
  for (const i of ids) main.send({ t: 'close', id: i });
  for (const i of ids) await main.waitT('closed', i);
  await sleep(2500);   // closed connections linger up to 2 s after their FIN
});

if (sshd) {
  await test(`ssh server banner and key exchange start through the bridge (${sshd})`, async () => {
    const [h, p] = sshd.split(':');
    const { id, ms } = await openTo(main, h, Number(p));
    let acc = Buffer.alloc(0);
    let resolveBanner;
    const banner = new Promise((r) => { resolveBanner = r; });
    main.sink(id, (b) => { acc = Buffer.concat([acc, b]); if (acc.includes('\r\n')) resolveBanner(); });
    await Promise.race([banner, sleep(10000).then(() => { throw new Error('no banner'); })]);
    const line = acc.subarray(0, acc.indexOf('\r\n')).toString('latin1');
    assert(/^SSH-2\.0-OpenSSH/.test(line), `banner ${JSON.stringify(line)}`);
    const end = acc.indexOf('\r\n') + 2;
    main.sendBytes(id, Buffer.from('SSH-2.0-BeethovenBridgeTest\r\n'));
    for (let i = 0; i < 100 && acc.length <= end + 20; i++) await sleep(50);
    assert(acc.length > end + 20 && acc[end + 5] === 20, 'no KEXINIT after the banner');
    main.sinks.delete(id);
    main.send({ t: 'close', id });
    await main.waitT('closed', id);
    return `${line}; KEXINIT received; open ${ms.toFixed(1)} ms`;
  });
}

if (sshd && opt('--ssh-client')) {
  await test('a whole ssh sign-in (throwaway key) and exec through the bridge', async () => {
    const dir = path.resolve(opt('--ssh-client'));
    const { SshClient } = await import(pathToFileURL(path.join(dir, 'client.js')).href);
    const { EcdsaIdentity } = await import(pathToFileURL(path.join(dir, 'publickey.js')).href);
    const ident = await EcdsaIdentity.generate();
    fs.writeFileSync(opt('--ssh-authkeys'), ident.authorizedKeysLine('beethoven-bridge-test') + '\n');
    const [h, p] = sshd.split(':');
    const { id } = await openTo(main, h, Number(p));
    let onData = () => {};
    let onClose = () => {};
    main.sink(id, (b) => onData(new Uint8Array(b.buffer, b.byteOffset, b.byteLength)));
    const closedWatch = main.waitT('closed', id, 120000).then((m) => onClose(`bridge closed: ${m.reason}`), () => {});
    const stream = {
      write: (u8) => main.sendBytes(id, Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength)),
      onData: (cb) => { onData = cb; },
      onClose: (cb) => { onClose = cb; },
      close: () => main.send({ t: 'close', id }),
    };
    const t = performance.now();
    const client = new SshClient({ stream, username: opt('--ssh-user'), pinnedFingerprint: opt('--ssh-fp') });
    const info = await client.connect();
    await client.authMethods();   // the ssh-userauth service request and the "none" probe come first
    const auth = await client.authPublicKey(ident);
    assert(auth.success, 'publickey sign-in refused');
    const out = await client.exec('printf bridge-ok; head -c 1000000 /dev/zero | wc -c');
    const secs = ((performance.now() - t) / 1000).toFixed(2);
    assert(out.stdoutText.startsWith('bridge-ok') && out.stdoutText.includes('1000000'), `stdout ${JSON.stringify(out.stdoutText)}`);
    await client.disconnect();
    await closedWatch;
    return `negotiated ${JSON.stringify(info.negotiated)}, host key ${info.hostKeyFingerprint.slice(0, 18)}..., signed in and ran a command in ${secs} s`;
  });
}

if (flag('--grid-banner')) {
  await test('grid.wayne.edu:22 through the built-in allowlist: banner only, nothing sent', async () => {
    const { id, ms } = await openTo(main, 'grid.wayne.edu', 22);
    let acc = Buffer.alloc(0);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no banner in 15 s')), 15000);
      main.sink(id, (b) => { acc = Buffer.concat([acc, b]); if (acc.includes('\r\n')) { clearTimeout(timer); resolve(); } });
    });
    main.sinks.delete(id);
    main.send({ t: 'close', id });
    await main.waitT('closed', id);
    const line = acc.subarray(0, acc.indexOf('\r\n')).toString('latin1');
    assert(line.startsWith('SSH-2.0-OpenSSH_7.4'), `banner ${JSON.stringify(line)}`);
    return `${line} (open ${ms.toFixed(0)} ms)`;
  });
}

await test('stdin closed with a connection open: the bridge exits and the socket closes', async () => {
  const before = echo.conns.size;
  await openTo(main, '127.0.0.1', echo.port);
  await sleep(100);
  assert(echo.conns.size === before + 1, 'echo did not see the connection');
  const t = performance.now();
  main.closeStdin();
  const ex = await Promise.race([main.exited, sleep(15000).then(() => null)]);
  assert(ex, 'still running 15 s after stdin closed');
  metrics.exitAfterStdinCloseMs = +(ex.at - t).toFixed(1);
  for (let i = 0; i < 50 && echo.conns.size > before; i++) await sleep(50);
  assert(echo.conns.size === before, 'the echo connection stayed open');
  assert(ex.code === 0, `exit code ${ex.code}`);
  return `exit code 0 after ${metrics.exitAfterStdinCloseMs} ms`;
});

await test('nothing on stderr, no frame over 1 MiB, every frame valid JSON, no files written', async () => {
  assert(main.stderr === '', `stderr: ${JSON.stringify(main.stderr.slice(0, 300))}`);
  assert(main.badFrames === 0, `${main.badFrames} bad frames`);
  const after = fs.readdirSync(hostDir).sort().filter((f) => f !== 'allow.txt');
  const before = filesBefore.filter((f) => f !== 'allow.txt');
  assert(JSON.stringify(after) === JSON.stringify(before), `files changed: ${after.join(',')}`);
  return `${main.frames} frames read from the host`;
});

await test('a declared length over 1 MiB: error too_large, then exit 1', async () => {
  const h = start();
  h.send({ t: 'hello', v: 1 });
  await h.waitT('hello', undefined, 30000);
  h.sendHeaderOnly(2 * 1024 * 1024);
  const m = await h.waitT('error', '', 10000);
  assert(m.reason === 'too_large', `reason ${m.reason}`);
  const ex = await Promise.race([h.exited, sleep(10000).then(() => null)]);
  assert(ex && ex.code === 1, `exit ${ex ? ex.code : 'none'}`);
});

for (const h of hosts) h.kill();
echo.close(); sink.close(); slow.close(); sender.close(); counter.close();
if (hadAllow) fs.writeFileSync(allowFile, hadAllow); else fs.rmSync(allowFile, { force: true });

const passed = results.filter((r) => r.ok).length;
console.log(`\n${label}: ${passed}/${results.length} passed`);
console.log('metrics ' + JSON.stringify(metrics));
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ label, host: hostPath, passed, total: results.length, results, metrics }, null, 2));
process.exit(passed === results.length ? 0 : 1);
