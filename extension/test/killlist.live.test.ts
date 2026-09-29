// The kill-list the site actually serves: the signed file in the site repository, read from disk beside
// this checkout and verified with the extension's real verifier and the keys compiled into this build.
// This is the one test that would catch a list signed with a key the build does not trust, a readable
// copy that disagrees with what was signed, or a revocation nobody meant to publish. It skips, and says
// why, when the site repository is not checked out beside ashley-bridge.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KILLLIST_URL, killListVerdict, refreshKillList, verifyKillList } from '../src/licensing/killlist';
import { BUNDLED_KEYS } from '../src/licensing/license';

const SITE = process.env.ASHLEY_SITE_DIR ?? fileURLToPath(new URL('../../../openspineconsortium.github.io/', import.meta.url));
const FILE = path.join(SITE, 'ashley', 'bridge-killlist.json');
const present = existsSync(FILE);
// vitest swallows console output from a file whose tests all skip, so the reason goes to the raw
// stream and into the suite's name, where the reporter shows it
const WHY_SKIPPED = `skipped: ${FILE} is not there. Check out the site repository beside ashley-bridge (or point ASHLEY_SITE_DIR at it) and sign the list: node ../ashley/tools/license/ashley-license.mjs sign-killlist --out <site>/ashley/bridge-killlist.json`;
if (!present) process.stderr.write(`killlist.live: ${WHY_SKIPPED}\n`);
const FIELDS = ['v', 'kid', 'issued', 'revoked_versions', 'revoked_lids', 'message'] as const;

describe.skipIf(!present)(present ? 'the kill-list published on the site' : `the kill-list published on the site (${WHY_SKIPPED})`, () => {
  const doc = present ? (JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, unknown>) : {};
  const version = (JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as { version: string }).version;

  it('sits at the path the extension fetches', () => {
    expect(KILLLIST_URL).toBe('https://openspineconsortium.com/ashley/bridge-killlist.json');
    expect(FILE.replace(/\\/g, '/')).toMatch(/\/ashley\/bridge-killlist\.json$/);
  });

  it('verifies with the keys compiled into this build, under a release key, and withdraws nothing', async () => {
    const v = await verifyKillList(doc, BUNDLED_KEYS);
    expect(v.ok, v.detail).toBe(true);
    expect(Object.keys(BUNDLED_KEYS)).toContain(v.list?.kid);
    expect(v.list?.kid).not.toMatch(/^trial/);
    expect(v.list?.revoked_versions).toEqual([]);
    expect(v.list?.revoked_lids).toEqual([]);
    expect(typeof v.list?.message).toBe('string');
    expect(v.list?.issued).toBeGreaterThan(1_780_000_000); // after June 2026: not a stale or zero date
  });

  it('reads the same to a person as to the extension: the readable fields equal the signed payload', async () => {
    const v = await verifyKillList(doc, BUNDLED_KEYS);
    expect(v.ok, v.detail).toBe(true);
    for (const k of FIELDS) expect(doc[k], k).toEqual(v.list?.[k]);
    expect(Object.keys(doc).sort()).toEqual([...FIELDS, 'sig'].sort());
  });

  it('is accepted by the daily refresh and clears this version and any licence', async () => {
    const fetchFn = (async () => new Response(JSON.stringify(doc), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const out = await refreshKillList(undefined, BUNDLED_KEYS, fetchFn);
    expect(out.fresh, out.detail).toBe(true);
    expect(killListVerdict(out.current, version, 'L-anyone')).toEqual({ versionRevoked: false, licenseRevoked: false, message: doc.message });
  });
});
