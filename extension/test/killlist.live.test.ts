// The kill-list the site serves, checked before it is published: the signed file in a checkout of the site
// repository, verified with the extension's real verifier and the keys compiled into this build. This is the
// one test that would catch a list signed with a key the build does not trust, a readable copy that disagrees
// with what was signed, or a revocation nobody meant to publish. The checkout is named by BEETHOVEN_SITE_DIR
// and by nothing else: this repository never guesses where another one is checked out (interface/README.md).
// Without the variable the check skips and says why; with it, the list must be there
// (<site>/beethoven/killlist.json; the site build never writes it, docs/PUBLISHING_SITE.md).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KILLLIST_URL, killListVerdict, refreshKillList, verifyKillList } from '../src/licensing/killlist';
import { BUNDLED_KEYS } from '../src/licensing/signed';

const SITE = process.env.BEETHOVEN_SITE_DIR || undefined;
const IN_SITE = ['beethoven', 'killlist.json'] as const;
const FILE = SITE ? path.join(SITE, ...IN_SITE) : undefined;
// vitest swallows console output from a file whose tests all skip, so the reason goes to the raw
// stream and into the suite's name, where the reporter shows it
const WHY_SKIPPED = 'skipped: BEETHOVEN_SITE_DIR is not set. To check a signed list before it is published, run this file with BEETHOVEN_SITE_DIR naming your checkout of the site repository, as docs/PUBLISHING_SITE.md says ("The kill-list")';
if (!FILE) process.stderr.write(`killlist.live: ${WHY_SKIPPED}\n`);
const FIELDS = ['v', 'kid', 'issued', 'revoked_versions', 'revoked_lids', 'message'] as const;

describe('the kill-list address', () => {
  it('is the one under /beethoven/ on the site, where the file is looked for', () => {
    expect(KILLLIST_URL).toBe('https://openspineconsortium.com/beethoven/killlist.json');
    expect(`/${IN_SITE.join('/')}`).toBe(new URL(KILLLIST_URL).pathname);
  });
});

describe.skipIf(!FILE)(FILE ? 'the kill-list published on the site' : `the kill-list published on the site (${WHY_SKIPPED})`, () => {
  const present = !!FILE && existsSync(FILE);
  const doc = FILE && existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, unknown>) : {};
  const version = (JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as { version: string }).version;

  it('is there, where BEETHOVEN_SITE_DIR says the site is checked out', () => {
    expect(present, `no list at ${FILE}: sign it there first (docs/PUBLISHING_SITE.md, "The kill-list"), or point BEETHOVEN_SITE_DIR at the checkout you signed it in`).toBe(true);
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

  it('is accepted by the daily refresh and clears this version', async () => {
    const fetchFn = (async () => new Response(JSON.stringify(doc), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const out = await refreshKillList(undefined, BUNDLED_KEYS, fetchFn);
    expect(out.fresh, out.detail).toBe(true);
    expect(killListVerdict(out.current, version)).toEqual({ versionRevoked: false, message: doc.message });
  });
});
