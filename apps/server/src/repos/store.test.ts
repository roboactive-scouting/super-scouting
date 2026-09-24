import { describe, expect, it } from 'vitest';
import type { Db } from '../db/client.js';
import { escapeLikePattern, supabaseStore } from './store.js';

const BS = '\\';

describe('escapeLikePattern', () => {
  it('leaves an ordinary username alone', () => {
    expect(escapeLikePattern('seed.lead-2')).toBe('seed.lead-2');
  });

  it('escapes the Postgres LIKE wildcards and the escape character itself', () => {
    expect(escapeLikePattern('a_b')).toBe(`a${BS}_b`);
    expect(escapeLikePattern('a%b')).toBe(`a${BS}%b`);
    expect(escapeLikePattern(`a${BS}b`)).toBe(`a${BS}${BS}b`);
    expect(escapeLikePattern(`${BS}%_`)).toBe(`${BS}${BS}${BS}%${BS}_`);
  });

  it("turns PostgREST's `*` alias for `%` into a single-character wildcard", () => {
    // PostgREST rewrites every `*` in a like/ilike pattern to `%`, and `\*` then means a
    // literal `%`, so a literal `*` cannot be expressed. `_` matches it (and any other
    // single character); the exact-match check in getUserByUsername removes the rest.
    expect(escapeLikePattern('a*b')).toBe('a_b');
  });
});

type Query = { table?: string; column?: string; pattern?: string; limit?: number };

/** Just enough of the supabase-js chain for getUserByUsername. */
function fakeDb(result: { data: unknown; error: { message: string } | null }, seen: Query): Db {
  const chain = {
    select: () => chain,
    ilike: (column: string, pattern: string) => {
      seen.column = column;
      seen.pattern = pattern;
      return chain;
    },
    limit: (n: number) => {
      seen.limit = n;
      return Promise.resolve(result);
    },
  };
  return {
    from: (table: string) => {
      seen.table = table;
      return chain;
    },
  } as unknown as Db;
}

const row = (username: string) => ({
  id: 'u-1',
  username,
  full_name: 'Lead',
  password_hash: 'h',
  role: 'lead',
  must_change_password: false,
  disabled_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
});

describe('supabaseStore.getUserByUsername', () => {
  it('queries users with the escaped pattern', async () => {
    const seen: Query = {};
    const store = supabaseStore(fakeDb({ data: [row('seed_lead')], error: null }, seen));
    const user = await store.getUserByUsername('seed_lead');
    expect(user?.username).toBe('seed_lead');
    expect(seen).toMatchObject({ table: 'users', column: 'username', pattern: `seed${BS}_lead` });
  });

  it('matches the stored username case-insensitively', async () => {
    const store = supabaseStore(fakeDb({ data: [row('Seed_Lead')], error: null }, {}));
    expect((await store.getUserByUsername('seed_lead'))?.username).toBe('Seed_Lead');
  });

  it('returns null when the database returns a row that is not an exact match', async () => {
    // Defence in depth: even if a wildcard slipped through, `seed_lea_` is not `seed_lead`.
    const store = supabaseStore(fakeDb({ data: [row('seed_lead')], error: null }, {}));
    expect(await store.getUserByUsername('seed_lea_')).toBeNull();
  });

  it('picks the exact match out of several wildcard hits', async () => {
    const store = supabaseStore(
      fakeDb({ data: [row('axb'), { ...row('a*b'), id: 'u-2' }], error: null }, {}),
    );
    expect((await store.getUserByUsername('a*b'))?.id).toBe('u-2');
  });

  it('returns null when nothing matches', async () => {
    const store = supabaseStore(fakeDb({ data: [], error: null }, {}));
    expect(await store.getUserByUsername('nobody')).toBeNull();
  });

  it('throws on a database error instead of presenting it as an unknown user', async () => {
    const store = supabaseStore(
      fakeDb({ data: null, error: { message: 'connection refused' } }, {}),
    );
    await expect(store.getUserByUsername('seed_lead')).rejects.toThrow('connection refused');
  });
});

/** Just enough of the supabase-js chain for getUser and getFullUser: select → eq → maybeSingle. */
function fakeDbById(result: { data: unknown; error: { message: string } | null }, seen: Query): Db {
  const chain = {
    select: () => chain,
    eq: (column: string, value: string) => {
      seen.column = column;
      seen.pattern = value;
      return chain;
    },
    maybeSingle: () => Promise.resolve(result),
  };
  return {
    from: (table: string) => {
      seen.table = table;
      return chain;
    },
  } as unknown as Db;
}

describe('supabaseStore.getUser and getFullUser', () => {
  it('look the user up by id', async () => {
    const seen: Query = {};
    const store = supabaseStore(fakeDbById({ data: row('seed_lead'), error: null }, seen));
    expect((await store.getFullUser('u-1'))?.username).toBe('seed_lead');
    expect(seen).toMatchObject({ table: 'users', column: 'id', pattern: 'u-1' });
    expect((await store.getUser('u-1'))?.id).toBe('u-1');
  });

  it('return null for an unknown id', async () => {
    const store = supabaseStore(fakeDbById({ data: null, error: null }, {}));
    expect(await store.getUser('u-missing')).toBeNull();
    expect(await store.getFullUser('u-missing')).toBeNull();
  });

  it('throw on a database error, so a blip never reads as "sign in again"', async () => {
    const store = supabaseStore(
      fakeDbById({ data: null, error: { message: 'connection refused' } }, {}),
    );
    await expect(store.getUser('u-1')).rejects.toThrow('connection refused');
    await expect(store.getFullUser('u-1')).rejects.toThrow('connection refused');
  });
});

type Call = [string, ...unknown[]];

/** Records every supabase-js chain call and resolves to `result` wherever it is awaited. */
function recordingDb(result: {
  data?: unknown;
  error: { message: string; code?: string; details?: string } | null;
  count?: number | null;
}): { db: Db; calls: Call[] } {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of [
    'select',
    'insert',
    'update',
    'eq',
    'is',
    'gt',
    'order',
    'limit',
    'single',
  ]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
  const db = {
    from: (table: string) => {
      calls.push(['from', table]);
      return chain;
    },
  } as unknown as Db;
  return { db, calls };
}

describe('supabaseStore user writes and listUsers', () => {
  it('listUsers selects an explicit column list with no password_hash', async () => {
    const { db, calls } = recordingDb({ data: [], error: null });
    await supabaseStore(db).listUsers({ includeDisabled: false, limit: 51 });
    const select = calls.find(([m]) => m === 'select');
    expect(select?.[1]).toBe(
      'id, username, full_name, role, must_change_password, disabled_at, created_at',
    );
    expect(String(select?.[1])).not.toContain('password_hash');
    expect(String(select?.[1])).not.toContain('*');
  });

  it('listUsers hides disabled users unless asked, orders by username then id, and bounds the page', async () => {
    const hidden = recordingDb({ data: [], error: null });
    await supabaseStore(hidden.db).listUsers({ includeDisabled: false, limit: 51 });
    expect(hidden.calls).toContainEqual(['is', 'disabled_at', null]);
    expect(hidden.calls).toContainEqual(['order', 'username', { ascending: true }]);
    expect(hidden.calls).toContainEqual(['order', 'id', { ascending: true }]);
    expect(hidden.calls).toContainEqual(['limit', 51]);

    const all = recordingDb({ data: [], error: null });
    await supabaseStore(all.db).listUsers({
      includeDisabled: true,
      limit: 10,
      after: { username: 'dana', id: 'u-1' },
    });
    expect(all.calls.find(([m]) => m === 'is')).toBeUndefined();
    expect(all.calls).toContainEqual(['gt', 'username', 'dana']);
  });

  it('keeps the Postgres code on a unique violation, and never the details', async () => {
    const { db } = recordingDb({
      data: null,
      error: {
        message: 'duplicate key value violates unique constraint "users_username_lower_idx"',
        code: '23505',
        details: 'Failing row contains (..., $2a$10$abc, ...)',
      },
    });
    const error = await supabaseStore(db)
      .insertUser({ id: 'u-1', username: 'dana' })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: '23505' });
    expect(JSON.stringify(error)).not.toContain('$2a$');
    expect(String((error as Error).message)).not.toContain('$2a$');
  });

  it('countEnabledAdmins counts enabled admins with a head-only count', async () => {
    const { db, calls } = recordingDb({ data: null, error: null, count: 2 });
    expect(await supabaseStore(db).countEnabledAdmins()).toBe(2);
    expect(calls).toContainEqual(['eq', 'role', 'admin']);
    expect(calls).toContainEqual(['is', 'disabled_at', null]);
  });
});

describe('supabaseStore sync reads and the applied ledger (review fix: errors are not "no row")', () => {
  const failing = { data: null, error: { message: 'connection refused' } };

  it('getRow throws on a database error instead of reading as "no such row"', async () => {
    // Swallowed, a blip made syncPush treat an existing entry as a create and upsert over
    // it with the pushing scouter as its author.
    const store = supabaseStore(fakeDbById(failing, {}));
    await expect(store.getRow('scouting_entry', 'e-1')).rejects.toThrow('connection refused');
  });

  it('wasApplied throws on a database error instead of reading as "never applied"', async () => {
    const store = supabaseStore(fakeDbById(failing, {}));
    await expect(store.wasApplied('op-1')).rejects.toThrow('connection refused');
  });

  it('markApplied throws when the ledger insert fails, so a replay is never silently allowed', async () => {
    const { db } = recordingDb(failing);
    await expect(supabaseStore(db).markApplied('op-1')).rejects.toThrow('connection refused');
  });

  it('getFormFields throws instead of validating an entry against no fields', async () => {
    const { db } = recordingDb(failing);
    await expect(supabaseStore(db).getFormFields('fv-1')).rejects.toThrow('connection refused');
  });

  it('eventExists throws instead of reading as "no such event"', async () => {
    const store = supabaseStore(fakeDbById(failing, {}));
    await expect(store.eventExists('ev-1')).rejects.toThrow('connection refused');
  });

  it('still reads a missing row, an unapplied op and a missing event as null / false', async () => {
    const store = supabaseStore(fakeDbById({ data: null, error: null }, {}));
    expect(await store.getRow('scouting_entry', 'e-1')).toBeNull();
    expect(await store.wasApplied('op-1')).toBe(false);
    expect(await store.eventExists('ev-1')).toBe(false);
  });
});
