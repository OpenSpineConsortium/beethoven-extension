// The username a licence is matched against: the portal-observed one wins, a typed one is only
// a stand-in, and the note says which was used.
import { describe, expect, it } from 'vitest';
import { bindIdentity, identityNote } from '../src/core/identity';
import { verifyLicense } from '../src/licensing/license';
import { issuer, NOW } from './helpers';

const I = issuer();

describe('identity binding', () => {
  it('prefers the portal-observed username over anything typed', () => {
    expect(bindIdentity('ab1234', 'zz9999')).toEqual({ accessId: 'ab1234', source: 'portal' });
    expect(bindIdentity('  ab1234 ', undefined)).toEqual({ accessId: 'ab1234', source: 'portal' });
    expect(bindIdentity(undefined, 'zz9999')).toEqual({ accessId: 'zz9999', source: 'typed' });
    expect(bindIdentity('', '  ')).toEqual({ source: 'none' });
    expect(identityNote(bindIdentity('ab1234', 'x'))).toMatch(/portal username ab1234/);
    expect(identityNote(bindIdentity(undefined, 'x'))).toMatch(/username you typed \(x\)/);
    expect(identityNote(bindIdentity(undefined, undefined))).toMatch(/not matched/);
  });

  it('a key issued to one student does not verify for another who typed that student\'s username', async () => {
    const key = I.license(); // issued to ab1234
    const bypass = bindIdentity('zz9999', 'ab1234');
    const c = await verifyLicense(key, { keys: I.keys, now: NOW, identity: { accessId: bypass.accessId } });
    expect(c.ok).toBe(false);
    expect(c.status).toBe('wrong-person');
    const honest = bindIdentity('ab1234', 'zz9999');
    expect((await verifyLicense(key, { keys: I.keys, now: NOW, identity: { accessId: honest.accessId } })).ok).toBe(true);
  });
});
