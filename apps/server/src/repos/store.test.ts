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
