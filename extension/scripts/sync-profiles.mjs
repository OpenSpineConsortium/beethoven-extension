#!/usr/bin/env node
// Runs before every build and zip (prebuild, prezip). Since 8.0.0 the package carries no
// cluster-side code: the tool lives once, read-only, in the lab's shared copy on the cluster, and
// the extension only points the student's account at it. What the extension needs from
// ../framework is data: the site profiles (framework/profiles/<site>.json), for a site's
// shared_install folder and its settings. Each is copied to public/profiles/<site>.json as JSON,
// without its free-text "notes". Whatever a build before 8.0.0 left in public/framework/ is removed
// here, so it can never ship again (test/hygiene.test.ts checks the built package for it).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = path.resolve(root, '..', 'framework', 'profiles');
const target = path.join(root, 'public', 'profiles');
const fail = (msg) => {
  console.error(`sync-profiles: ${msg}`);
  process.exit(1);
};

await fs.rm(path.join(root, 'public', 'framework'), { recursive: true, force: true });
await fs.rm(target, { recursive: true, force: true });
await fs.mkdir(target, { recursive: true });
let names = [];
try {
  names = (await fs.readdir(source)).filter((n) => n.endsWith('.json')).sort();
} catch {
  console.warn(`sync-profiles: ${source} not found; the build carries no site profile, so every site reads as keeping no shared copy`);
}
for (const name of names) {
  const site = name.slice(0, -'.json'.length);
  // the extension asks for /profiles/<site>.json by the site name in Settings (core/install.ts bundledSharedInstall)
  if (!/^[A-Za-z0-9_-]+$/.test(site)) fail(`framework/profiles/${name}: a site name is letters, digits, _ and - only`);
  let profile;
  try {
    profile = JSON.parse(await fs.readFile(path.join(source, name), 'utf8'));
  } catch (e) {
    fail(`framework/profiles/${name} is not JSON (${e.message})`);
  }
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) fail(`framework/profiles/${name} is not a JSON object`);
  delete profile.notes;
  await fs.writeFile(path.join(target, name), JSON.stringify(profile, null, 1) + '\n');
}
console.log(`sync-profiles: ${names.length} site profile(s) copied from ${source}, without their notes; no framework code is bundled`);

// The agreement texts the extension ships must be byte-identical to the canonical ones at the
// repository root (CLAUDE.md, "Terms"); copy them at the same moment, so a build can never carry
// a stale or foreign text. The signing dialog hashes what it shows, so the copy is what is recorded.
for (const name of ['LICENSE.txt', 'PRIVACY.md']) {
  const from = path.resolve(root, '..', name);
  try {
    const text = await fs.readFile(from);
    await fs.writeFile(path.join(root, 'public', name), text);
    console.log(`sync-profiles: ${name} copied from the repository root (${text.length} bytes)`);
  } catch {
    console.warn(`sync-profiles: ${from} not found; public/${name} left as it is`);
  }
}

// The signing dialog records the version it names (src/core/terms.ts TERMS_VERSION, TERMS_DATE) and
// hashes the LICENSE.txt it shows. A build in which the two disagree would record an acceptance of
// "version N" beside a text headed "Version M", so the build stops here instead of shipping that.
const termsSource = await fs.readFile(path.join(root, 'src', 'core', 'terms.ts'), 'utf8');
const termsVersion = /export const TERMS_VERSION = (\d+);/.exec(termsSource)?.[1];
const termsDate = /export const TERMS_DATE = '(\d{4}-\d{2}-\d{2})';/.exec(termsSource)?.[1];
if (!termsVersion || !termsDate) fail('src/core/terms.ts does not declare TERMS_VERSION = <integer> and TERMS_DATE = <yyyy-mm-dd>');
const licenceText = await fs.readFile(path.join(root, 'public', 'LICENSE.txt'), 'utf8').catch(() => '');
const licenceHead = /^Version (\d+), (\d{4}-\d{2}-\d{2})\./m.exec(licenceText);
if (!licenceHead) fail('public/LICENSE.txt carries no "Version N, yyyy-mm-dd." line');
if (licenceHead[1] !== termsVersion) fail(`public/LICENSE.txt is Version ${licenceHead[1]} but src/core/terms.ts has TERMS_VERSION = ${termsVersion}; change the text and the constant together`);
if (licenceHead[2] !== termsDate) fail(`public/LICENSE.txt is dated ${licenceHead[2]} but src/core/terms.ts has TERMS_DATE = '${termsDate}'; change the text and the constant together`);
console.log(`sync-profiles: LICENSE.txt Version ${licenceHead[1]}, ${licenceHead[2]} matches TERMS_VERSION and TERMS_DATE`);
