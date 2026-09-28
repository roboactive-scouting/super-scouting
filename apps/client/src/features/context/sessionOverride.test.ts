import { beforeEach, describe, expect, it } from 'vitest';
import { session } from '@/auth/session';
import { db } from '@/data/db';
import { sessionOverride } from './sessionOverride';

const alice = {
  id: 'u-alice',
  username: 'alice',
  full_name: 'Alice',
  role: 'scouter' as const,
  must_change_password: false,
};
const bob = { ...alice, id: 'u-bob', username: 'bob', full_name: 'Bob' };

beforeEach(async () => {
  await db.delete();
  await db.open();
  await session.signIn(alice, 'tok-alice');
  sessionOverride.clear();
});

describe('the session override and the signed-in person (branch review, finding 5)', () => {
  it('is cleared by a sign-out', async () => {
    sessionOverride.set('ev-2', 'Week 3');
    await session.signOut();
    expect(sessionOverride.get()).toBeNull();
    expect(sessionOverride.name()).toBeNull();
  });

  it('is cleared when Switch scouter hands the device to someone else', async () => {
    sessionOverride.set('ev-2', 'Week 3');
    await session.signIn(bob, 'tok-bob');
    expect(sessionOverride.get()).toBeNull();
  });

  it('survives a new token or an expiry for the same person', async () => {
    sessionOverride.set('ev-2', 'Week 3');
    await session.replaceToken('tok-alice-2', 'tok-alice');
    await session.signIn(alice, 'tok-alice-3');
    await session.expire();
    expect(sessionOverride.get()).toBe('ev-2');
  });
});
