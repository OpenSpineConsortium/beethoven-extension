// Which username a licence key is matched against. The portal's own dashboard says "Logged in as
// <user>", and that observed name always wins: a key issued to one student must not verify for
// another because the other typed the first one's username on the setup page. A typed name is
// only a stand-in until the portal has shown one, and the pages say so when that is the case.

export type IdentitySource = 'portal' | 'typed' | 'none';

export interface BoundIdentity {
  accessId?: string;
  source: IdentitySource;
}

/** the portal-observed username first; the typed one only when the portal has shown none */
export function bindIdentity(observed: string | undefined, typed: string | undefined): BoundIdentity {
  const seen = String(observed ?? '').trim();
  if (seen) return { accessId: seen, source: 'portal' };
  const t = String(typed ?? '').trim();
  if (t) return { accessId: t, source: 'typed' };
  return { source: 'none' };
}

/** one clause for the panel, appended to the licence line */
export function identityNote(b: BoundIdentity): string {
  if (b.source === 'portal') return `matched to your portal username ${b.accessId}`;
  if (b.source === 'typed') return `matched to the username you typed (${b.accessId}); the portal has not shown one yet, and its own name will take over when it does`;
  return 'not matched to a username yet (the portal will show one once it is connected)';
}
