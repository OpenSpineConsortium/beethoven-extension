// Setting up the cluster: upload whatever scripts/sync-framework.mjs bundled from ../framework to
// ~/.hpcworker through the Files app (PUT, one file at a time, no floor), then one install line
// through the bootstrap shell (the tool strips CR endings itself and copies nothing when it
// already runs from ~/.hpcworker). The strip runs this by itself when the tool is missing, and
// again when ~/.hpcworker/VERSION is older than the VERSION this build carries (the upload
// rewrites VERSION with the files and the tool's install keeps the profile and says "upgraded");
// the Details section keeps a button for it. The bundled files are read through `fetchAsset`,
// which the pages implement with the extension's own URL.
import { commands, paths } from './contract';
import type { PortalApi } from './portal';

/** the VERSION file of the framework this build carries: an integer, or undefined when the build has none */
export async function bundledFrameworkVersion(fetchAsset: (path: string) => Promise<Response>): Promise<string | undefined> {
  try {
    const res = await fetchAsset('/framework/files/VERSION');
    if (!res.ok) return undefined;
    const v = (await res.text()).trim();
    return /^\d+$/.test(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Is the installed tool older than the bundled one? Versions are integers; a missing or unreadable one counts as older. */
export function frameworkOlder(installed: string | undefined, bundled: string): boolean {
  const have = Number(String(installed ?? '').trim());
  const want = Number(String(bundled ?? '').trim());
  if (!Number.isFinite(want)) return false;
  return !Number.isFinite(have) || have < want;
}

export interface FrameworkManifest {
  v: number;
  generated: string;
  files: Array<{ path: string; bytes: number; sha256: string; mode: string }>;
}

export interface InstallOutcome {
  ok: boolean;
  exitCode: number;
  uploaded: number;
  log: string;
}

export async function installFramework(portal: PortalApi, o: { site: string; fetchAsset: (path: string) => Promise<Response>; onProgress?: (text: string) => void }): Promise<InstallOutcome> {
  const res = await o.fetchAsset('/framework/manifest.json');
  if (!res.ok) throw new Error('this build carries no framework files (framework/manifest.json missing)');
  const manifest = (await res.json()) as FrameworkManifest;
  if (!manifest.files.length) throw new Error('this build carries no framework files: the framework/ folder was empty when the extension was built, so there is nothing to install yet');
  const home = await portal.home();
  const root = paths.root(home);
  const log: string[] = [`home ${home}`, `uploading ${manifest.files.length} file(s) to ${root}`];
  const show = () => o.onProgress?.(log.join('\n'));
  show();
  const dirs = new Set<string>([root]);
  for (const f of manifest.files) {
    const parts = f.path.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(`${root}/${parts.slice(0, i).join('/')}`);
  }
  for (const d of [...dirs].sort()) await portal.mkdir(d);
  for (const f of manifest.files) {
    const body = await o.fetchAsset(`/framework/files/${f.path}`).then((r) => r.text());
    await portal.writeFile(`${root}/${f.path}`, body);
    log.push(`  ${f.path} (${f.bytes} bytes)`);
    show();
  }
  log.push(`running: ${commands.install(o.site)}`);
  show();
  const r = await portal.shell(commands.install(o.site), { timeoutMs: 180_000 });
  log.push(r.output, `exit ${r.exitCode}`);
  show();
  return { ok: r.exitCode === 0, exitCode: r.exitCode, uploaded: manifest.files.length, log: log.join('\n') };
}
