// The bridges (core/bridge.ts) against the helper's wire contract (framework/contract-text/V12_CONTRACT.md: native messaging
// host com.openspineconsortium.beethoven.bridge; hello, open, data, close; opened, data, closed, error),
// with a stand-in for Chrome's native port, and Chrome's own sentences when a host is missing or broken.
// D3's order: the store stub, the relay (not configured at Wayne State), the helper.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BridgeError, chooseBridge, classifyNativeError, HELPER_CHUNK, HELPER_HOST, HelperBridge, helperDownloadFor, helperOsFrom, parseBridgeManifest, RelayBridge, relayConfigFrom, sizeWords, StoreExtensionBridge, type NativeApi, type NativePort } from '../src/core/bridge';

/** a native host that answers like the bundled helper (or like Chrome when it cannot start one) */
function fakeNative(o: { missing?: string; allow?: string[]; refuseOpen?: boolean; silent?: boolean; v?: number } = {}) {
  const posted: Array<Record<string, unknown>> = [];
  let lastError: string | undefined;
  const ports: NativePort[] = [];
  const api: NativeApi & { posted: typeof posted; ports: typeof ports; serverSend(m: unknown): void; serverEnd(err?: string): void } = {
    posted,
    ports,
    connectNative(name) {
      expect(name).toBe(HELPER_HOST);
      const msgL: Array<(m: unknown) => void> = [];
      const discL: Array<() => void> = [];
      let open = true;
      const port: NativePort = {
        postMessage(m) {
          if (!open) throw new Error('Attempting to use a disconnected port object');
          const msg = m as Record<string, unknown>;
          posted.push(msg);
          setTimeout(() => {
            if (msg.t === 'hello' && !o.silent && !o.missing) msgL.forEach((f) => f({ t: 'hello', v: o.v ?? 1, helper: '1', os: 'windows', kind: 'script', allow: o.allow ?? ['grid.wayne.edu:22'] }));
            if (msg.t === 'open') msgL.forEach((f) => f(o.refuseOpen ? { t: 'error', id: msg.id, reason: 'not in the allowlist' } : { t: 'opened', id: msg.id }));
            if (msg.t === 'data') msgL.forEach((f) => f({ t: 'data', id: msg.id, b64: msg.b64 })); // an echo
          }, 1);
        },
        disconnect() {
          open = false;
        },
        onMessage: { addListener: (f) => msgL.push(f) },
        onDisconnect: { addListener: (f) => discL.push(f) },
      };
      ports.push(port);
      api.serverSend = (m) => msgL.forEach((f) => f(m));
      api.serverEnd = (err) => {
        lastError = err;
        open = false;
        discL.forEach((f) => f());
        lastError = undefined;
      };
      if (o.missing) {
        setTimeout(() => api.serverEnd(o.missing), 2);
      }
      return port;
    },
    lastError: () => lastError,
    serverSend: () => undefined,
    serverEnd: () => undefined,
  };
  return api;
}

describe("Chrome's words when a native host cannot be reached", () => {
  it('reads "not found" as not installed, and the rest as broken', () => {
    expect(classifyNativeError('Specified native messaging host not found.').state).toBe('not-installed');
    expect(classifyNativeError('Access to the specified native messaging host is forbidden.').state).toBe('broken');
    expect(classifyNativeError('Native host has exited.').state).toBe('broken');
    expect(classifyNativeError('Failed to start native messaging host.').state).toBe('broken');
    expect(classifyNativeError('Error when communicating with the native messaging host.').state).toBe('broken');
    expect(classifyNativeError(undefined).state).toBe('broken');
  });
});

describe('the helper bridge', () => {
  it('probe: the hello names the helper, its system and its allowlist', async () => {
    const api = fakeNative();
    const r = await new HelperBridge(api).probe();
    expect(r).toMatchObject({ id: 'helper', state: 'available', helper: { version: '1', os: 'windows', kind: 'script', allow: ['grid.wayne.edu:22'] } });
    expect(api.posted[0]).toEqual({ t: 'hello', v: 1 });
  });

  it('probe: not installed, broken, silent, the wrong protocol, an allowlist without the grid, no native messaging at all', async () => {
    expect((await new HelperBridge(fakeNative({ missing: 'Specified native messaging host not found.' })).probe()).state).toBe('not-installed');
    expect((await new HelperBridge(fakeNative({ missing: 'Native host has exited.' })).probe()).state).toBe('broken');
    expect((await new HelperBridge(fakeNative({ silent: true }), { helloTimeoutMs: 50 }).probe()).state).toBe('broken');
    expect((await new HelperBridge(fakeNative({ v: 2 })).probe()).state).toBe('broken');
    expect((await new HelperBridge(fakeNative({ allow: ['example.org:22'] })).probe()).state).toBe('broken');
    expect((await new HelperBridge(undefined).probe()).state).toBe('not-available');
  });

  it('open: one stream to grid.wayne.edu:22, bytes both ways in base64 chunks of at most 48 KiB, close sends close', async () => {
    const api = fakeNative();
    const s = await new HelperBridge(api).open('grid.wayne.edu', 22);
    const open = api.posted.find((m) => m.t === 'open')!;
    expect(open).toMatchObject({ t: 'open', host: 'grid.wayne.edu', port: 22 });
    const got: Uint8Array[] = [];
    s.onData((b) => got.push(b));
    const big = new Uint8Array(HELPER_CHUNK * 2 + 10).map((_, i) => i & 0xff);
    s.write(big);
    const datas = api.posted.filter((m) => m.t === 'data');
    expect(datas).toHaveLength(3);
    for (const d of datas) expect(String(d.b64).length).toBeLessThanOrEqual(65536);
    await new Promise((r) => setTimeout(r, 20));
    const echoed = Buffer.concat(got.map((g) => Buffer.from(g)));
    expect(echoed.equals(Buffer.from(big))).toBe(true);
    let closedWhy = '';
    s.onClose((w) => (closedWhy = w ?? ''));
    api.serverSend({ t: 'closed', id: open.id, reason: 'eof' });
    expect(closedWhy).toMatch(/eof/);
    s.close();
  });

  it('open: refuses a destination not in the helper allowlist without asking it, and reports a refusal from it', async () => {
    await expect(new HelperBridge(fakeNative()).open('example.org', 22)).rejects.toBeInstanceOf(BridgeError);
    await expect(new HelperBridge(fakeNative({ refuseOpen: true })).open('grid.wayne.edu', 22)).rejects.toMatchObject({ state: 'refused' });
  });
});

describe("D3's order", () => {
  it('store (a stub), relay (not configured), then the helper', async () => {
    const providers = [new StoreExtensionBridge(), new RelayBridge(undefined, undefined), new HelperBridge(fakeNative())];
    const c = await chooseBridge(providers);
    expect(c.chosen).toBe('helper');
    expect(c.probes.map((p) => [p.id, p.state])).toEqual([
      ['store', 'not-available'],
      ['relay', 'not-configured'],
      ['helper', 'available'],
    ]);
    const none = await chooseBridge([new StoreExtensionBridge(), new RelayBridge(undefined, undefined), new HelperBridge(fakeNative({ missing: 'Specified native messaging host not found.' }))]);
    expect(none.chosen).toBe('none');
  });

  it('a relay counts only when the profile names a wss relay', () => {
    expect(relayConfigFrom({ ssh_relay: null })).toBeUndefined();
    expect(relayConfigFrom({ ssh_relay: { url: 'http://relay.example' } })).toBeUndefined();
    expect(relayConfigFrom({ ssh_relay: { url: 'wss://relay.example/ssh', ticket_url: 'https://lab.example/ticket' } })).toEqual({ url: 'wss://relay.example/ssh', ticket_url: 'https://lab.example/ticket' });
  });
});

describe("the helper's download, from the package's own manifest", () => {
  const manifest = parseBridgeManifest({
    v: 1,
    helper: '1',
    files: [
      { os: 'windows', file: 'beethoven-bridge-setup.cmd', bytes: 3100, sha256: 'a'.repeat(64), kind: 'script' },
      { os: 'windows', file: 'beethoven-bridge.exe', bytes: 2_100_000, kind: 'binary' },
      { os: 'mac', file: 'Beethoven Bridge Setup.command', bytes: 2000, kind: 'script' },
      { os: 'linux', file: 'beethoven-bridge-setup.sh', bytes: 1800, kind: 'script' },
      { os: 'linux', file: '../escape.sh' },
    ],
  });
  it('takes this computer script, with its size and checksum, at the extension own address', () => {
    const d = helperDownloadFor(manifest, 'windows', (p) => `chrome-extension://id${p}`);
    expect(d).toMatchObject({ os: 'windows', osLabel: 'Windows', file: 'beethoven-bridge-setup.cmd', url: 'chrome-extension://id/bridge/beethoven-bridge-setup.cmd', size: '3 KB', sha256: 'a'.repeat(64), kind: 'script', version: '1', signed: false });
    expect(helperDownloadFor(manifest, 'linux', (p) => p)?.file).toBe('beethoven-bridge-setup.sh');
    // a name with a space or a path is not a file of the package's bridge folder
    expect(helperDownloadFor(manifest, 'mac', (p) => p)).toBeUndefined();
    expect(helperDownloadFor(manifest, undefined, (p) => p)).toBeUndefined();
    expect(helperDownloadFor(undefined, 'windows', (p) => p)).toBeUndefined();
  });
  it("reads the helper stream's manifest as it ships (name, size, open, protocol, host_name)", () => {
    const m = parseBridgeManifest({ name: 'Beethoven bridge', host_name: 'com.openspineconsortium.beethoven.bridge', helper: '1.0.0', protocol: 1, files: [{ os: 'windows', kind: 'script', name: 'beethoven-bridge-windows.zip', open: 'install.cmd', size: 12660, sha256: '9249bf47f344bf18d1b0074d0409d5eac0c28e1bcf82acf982b1c5eb7c497a95' }] });
    expect(m).toMatchObject({ v: 1, helper: '1.0.0', host: HELPER_HOST });
    expect(helperDownloadFor(m, 'windows', (p) => `chrome-extension://id${p}`)).toMatchObject({ file: 'beethoven-bridge-windows.zip', open: 'install.cmd', bytes: 12660, size: '12 KB', url: 'chrome-extension://id/bridge/beethoven-bridge-windows.zip', version: '1.0.0', signed: false });
  });

  it('names the systems as Chrome does', () => {
    expect(helperOsFrom('win')).toBe('windows');
    expect(helperOsFrom('mac')).toBe('mac');
    expect(helperOsFrom('linux')).toBe('linux');
    expect(helperOsFrom('cros')).toBeUndefined();
    expect(sizeWords(2_100_000)).toBe('2.0 MB');
  });
});

// 15.0.0: the signed installers (helper/release/mac, helper/release/windows) are made out to one extension when
// they are built (allowed_origins baked in), so the picker offers one only to the extension it names: Chrome
// would refuse to start a host made out to another, and the panel could only say the helper did not answer.
describe("the signed installer's pick, by the extension's own identifier", () => {
  const OWN = 'abcdefghijklmnopabcdefghijklmnop';
  const OTHER = 'ponmlkjihgfedcbaponmlkjihgfedcba';
  const url = (p: string) => `chrome-extension://${OWN}${p}`;
  const msi = (origins: string[], signed: unknown = 'authenticode') => ({ os: 'windows', kind: 'binary', name: 'beethoven-bridge-windows.msi', size: 1_258_291, sha256: 'b'.repeat(64), allowed_origins: origins, signed });
  const zip = { os: 'windows', kind: 'script', name: 'beethoven-bridge-windows.zip', open: 'install.cmd', size: 12663, sha256: 'c'.repeat(64) };
  const pkg = { os: 'mac', kind: 'binary', name: 'beethoven-bridge-mac.pkg', size: 1_468_006, sha256: 'd'.repeat(64), allowed_origins: [`chrome-extension://${OWN}/`], signed: 'developer-id-notarized' };
  const macZip = { os: 'mac', kind: 'script', name: 'beethoven-bridge-mac.zip', open: 'install.command', size: 9174 };

  it('prefers the signed binary whose origins name this extension, over the script that comes first', () => {
    const m = parseBridgeManifest({ helper: '1.0.0', protocol: 1, files: [zip, msi([`chrome-extension://${OWN}/`]), macZip, pkg] });
    expect(helperDownloadFor(m, 'windows', url, OWN)).toMatchObject({ file: 'beethoven-bridge-windows.msi', kind: 'binary', signed: true, size: '1.2 MB', url: `chrome-extension://${OWN}/bridge/beethoven-bridge-windows.msi`, version: '1.0.0' });
    expect(helperDownloadFor(m, 'windows', url, OWN)?.open).toBeUndefined();
    expect(helperDownloadFor(m, 'mac', url, OWN)).toMatchObject({ file: 'beethoven-bridge-mac.pkg', kind: 'binary', signed: true, size: '1.4 MB' });
    // the script's download says it is not signed
    expect(helperDownloadFor(m, 'mac', url, OTHER)).toMatchObject({ file: 'beethoven-bridge-mac.zip', kind: 'script', signed: false });
  });

  it('falls back to the script when the binary names another extension, or when no own identifier is given (a development build)', () => {
    const other = parseBridgeManifest({ helper: '1.0.0', files: [zip, msi([`chrome-extension://${OTHER}/`])] });
    expect(helperDownloadFor(other, 'windows', url, OWN)).toMatchObject({ file: 'beethoven-bridge-windows.zip', kind: 'script', signed: false });
    const own = parseBridgeManifest({ helper: '1.0.0', files: [zip, msi([`chrome-extension://${OWN}/`])] });
    expect(helperDownloadFor(own, 'windows', url)?.file).toBe('beethoven-bridge-windows.zip');
    expect(helperDownloadFor(own, 'windows', url, 'ext')?.file).toBe('beethoven-bridge-windows.zip');
    expect(helperDownloadFor(own, 'windows', url, OWN.toUpperCase())?.file).toBe('beethoven-bridge-windows.zip');
  });

  it('never offers a binary without origins, even when it is the only file for this computer', () => {
    const bare = parseBridgeManifest({ helper: '1.0.0', files: [{ os: 'windows', kind: 'binary', name: 'beethoven-bridge-windows.msi', size: 1_000_000, signed: 'authenticode' }] });
    expect(helperDownloadFor(bare, 'windows', url, OWN)).toBeUndefined();
    expect(helperDownloadFor(bare, 'windows', url)).toBeUndefined();
    // the older rule, a lone binary offered when there is no script, is gone with it
    const lone = parseBridgeManifest({ helper: '1.0.0', files: [msi([`chrome-extension://${OTHER}/`])] });
    expect(helperDownloadFor(lone, 'windows', url, OWN)).toBeUndefined();
  });

  it('drops an origins list with a member that is not one Chrome extension origin, an empty list, and a "signed" it does not know', () => {
    const own = `chrome-extension://${OWN}/`;
    for (const bad of [[own, 'https://example.org/'], [own, `chrome-extension://${OWN}`], [`chrome-extension://${OWN.toUpperCase()}/`], ['*'], [], [own, 42]]) {
      const m = parseBridgeManifest({ files: [msi(bad as string[])] })!;
      expect(m.files[0]!.allowed_origins, JSON.stringify(bad)).toBeUndefined();
      expect(helperDownloadFor(m, 'windows', url, OWN), JSON.stringify(bad)).toBeUndefined();
    }
    expect(parseBridgeManifest({ files: [msi([own])] })!.files[0]!.allowed_origins).toEqual([own]);
    const { signed: _none, ...unsaid } = msi([own]);
    for (const s of ['self-signed', 'developer-id', 'AUTHENTICODE', true, 1, null, 'absent']) {
      const m = parseBridgeManifest({ files: [zip, s === 'absent' ? unsaid : msi([own], s)] })!;
      expect(m.files[1]!.signed, String(s)).toBeUndefined();
      expect(m.files[1]!.allowed_origins, String(s)).toEqual([own]);
      // made out to this extension but not saying how it was signed: never offered (the panel would call it
      // signed), so the zip is, as on a development build
      expect(helperDownloadFor(m, 'windows', url, OWN), String(s)).toMatchObject({ file: 'beethoven-bridge-windows.zip', kind: 'script', signed: false });
    }
    expect(parseBridgeManifest({ files: [msi([own], 'developer-id-notarized')] })!.files[0]!.signed).toBe('developer-id-notarized');
  });

  it('the shipped manifest still parses, with its three zips and nothing signed', () => {
    const shipped = JSON.parse(readFileSync(fileURLToPath(new URL('../public/bridge/manifest.json', import.meta.url)), 'utf8')) as unknown;
    const m = parseBridgeManifest(shipped)!;
    expect(m).toMatchObject({ v: 1, helper: '1.0.0', host: HELPER_HOST });
    expect(m.files.filter((f) => f.kind === 'script').map((f) => f.os).sort()).toEqual(['linux', 'mac', 'windows']);
    for (const os of ['windows', 'mac', 'linux'] as const) {
      const d = helperDownloadFor(m, os, url, OWN)!;
      expect(d).toMatchObject({ file: `beethoven-bridge-${os}.zip`, kind: 'script', signed: false });
      expect(d.open).toMatch(/^install\.(cmd|command|sh)$/);
    }
  });
});
