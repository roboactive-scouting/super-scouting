import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Caller } from '@frc/shared';
import type { StoredFullUser } from '../context.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';
import { listUsers } from './listUsers.js';

const CALLERS: Caller[] = [
  { kind: 'user', userId: 'u-scouter', role: 'scouter' },
  { kind: 'user', userId: 'u-lead', role: 'lead' },
  { kind: 'user', userId: 'u-admin', role: 'admin' },
  { kind: 'service', label: 'mcp' },
];
const admin = CALLERS[2] as Caller;

const user = (n: number, over: Partial<StoredFullUser> = {}): StoredFullUser => ({
  id: `u-${String(n).padStart(3, '0')}`,
  username: `user${String(n).padStart(3, '0')}`,
  full_name: `User ${n}`,
  role: 'scouter',
  password_hash: '$2a$10$notarealhashnotarealhashnotarealhashnotarealhashnotar',
  must_change_password: false,
  disabled_at: null,
  created_at: '2026-11-01T00:00:00.000Z',
  ...over,
});

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
});

/** Every page, following next_cursor until it is null. */
async function allPages(
  caller: Caller,
  input: { limit?: number; include_disabled?: boolean },
): Promise<{ ids: string[]; pages: number }> {
  const ids: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  for (;;) {
    const res = await listUsers(caller, { ...input, cursor }, ctx);
    ids.push(...res.items.map((u) => u.id));
    pages += 1;
    if (res.next_cursor === null) return { ids, pages };
    cursor = res.next_cursor;
    if (pages > 100) throw new Error('pagination did not terminate');
  }
}

describe('listUsers (Appendix C)', () => {
  it('may be called by every role and by a service caller', async () => {
    for (const caller of CALLERS) {
      const res = await listUsers(caller, {}, ctx);
      expect(res.items.map((u) => u.id).sort(), caller.kind).toEqual(
        ['u-admin', 'u-lead', 'u-scouter'].sort(),
      );
    }
  });

  it('never returns password_hash', async () => {
    const res = await listUsers(admin, { include_disabled: true }, ctx);
    expect(res.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(res)).not.toContain('$2');
    for (const item of res.items) expect(item).not.toHaveProperty('password_hash');
  });

  it('asks the store for no password_hash either (it selects an explicit column list)', async () => {
    const spy = vi.spyOn(ctx.store, 'listUsers');
    await listUsers(admin, {}, ctx);
    const rows = await spy.mock.results[0]!.value;
    expect(JSON.stringify(rows)).not.toContain('$2');
  });

  it('excludes disabled users unless include_disabled is true', async () => {
    ctx.users.set('u-off', {
      id: 'u-off',
      role: 'scouter',
      disabled_at: '2026-01-01T00:00:00.000Z',
    });
    const shown = (await listUsers(admin, {}, ctx)).items.map((u) => u.id);
    expect(shown).not.toContain('u-off');
    const all = (await listUsers(admin, { include_disabled: true }, ctx)).items;
    expect(all.find((u) => u.id === 'u-off')).toMatchObject({
      disabled_at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('orders by username, then id', async () => {
    ctx.usersById.set('u-b', user(2, { id: 'u-b', username: 'bravo' }));
    ctx.usersById.set('u-a', user(1, { id: 'u-a', username: 'Alpha' }));
    const names = (await listUsers(admin, {}, ctx)).items.map((u) => u.username);
    expect(names).toEqual(['admin', 'Alpha', 'bravo', 'lead', 'scouter']);
  });

  it('pages across two pages with no duplicate and no gap', async () => {
    for (let n = 0; n < 7; n += 1) ctx.usersById.set(user(n).id, user(n));
    // 3 fixtures + 7 = 10 users, 6 per page: one full page and one of 4.
    const first = await listUsers(admin, { limit: 6 }, ctx);
    expect(first.items).toHaveLength(6);
    expect(first.next_cursor).not.toBeNull();
    const second = await listUsers(admin, { limit: 6, cursor: first.next_cursor! }, ctx);
    expect(second.items).toHaveLength(4);
    expect(second.next_cursor).toBeNull();

    const ids = [...first.items, ...second.items].map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual([...ctx.usersById.keys()].sort());
  });

  it('ends with next_cursor null and no empty trailing page when the count divides evenly', async () => {
    for (let n = 0; n < 3; n += 1) ctx.usersById.set(user(n).id, user(n));
    const { ids, pages } = await allPages(admin, { limit: 3 });
    expect(pages).toBe(2);
    expect(ids).toHaveLength(6);
  });

  it('pages through a Hebrew username in the cursor', async () => {
    ctx.usersById.set('u-he1', user(1, { id: 'u-he1', username: 'אבי' }));
    ctx.usersById.set('u-he2', user(2, { id: 'u-he2', username: 'דנה' }));
    const { ids } = await allPages(admin, { limit: 1 });
    expect(ids.sort()).toEqual(['u-admin', 'u-he1', 'u-he2', 'u-lead', 'u-scouter'].sort());
  });

  it('defaults limit to 50 and clamps a larger one to 200', async () => {
    for (let n = 0; n < 250; n += 1) ctx.usersById.set(user(n).id, user(n));
    expect((await listUsers(admin, {}, ctx)).items).toHaveLength(50);
    const big = await listUsers(admin, { limit: 10_000 }, ctx);
    expect(big.items).toHaveLength(200);
    expect(big.next_cursor).not.toBeNull();
  });

  it('refuses an unreadable cursor and a non-positive limit as invalid', async () => {
    await expect(listUsers(admin, { cursor: 'not-a-cursor' }, ctx)).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(listUsers(admin, { limit: 0 }, ctx)).rejects.toMatchObject({ code: 'invalid' });
  });
});
