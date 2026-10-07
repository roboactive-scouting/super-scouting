import { describe, expect, it } from 'vitest';
import type { Db } from '../db/client.js';
import { escapeLikePattern, numberPrefixFilter, supabaseStore } from './store.js';

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
    'upsert',
    'eq',
    'is',
    'gt',
    'lt',
    'or',
    'in',
    'order',
    'limit',
    'single',
    'maybeSingle',
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

describe('supabaseStore.getActiveContext (task 1.17b)', () => {
  it('reads the app_settings singleton row', async () => {
    const seen: Query = {};
    const ids = { active_season_id: 'se-1', active_event_id: 'ev-1' };
    const store = supabaseStore(fakeDbById({ data: ids, error: null }, seen));
    expect(await store.getActiveContext()).toEqual(ids);
    expect(seen).toMatchObject({ table: 'app_settings', column: 'id', pattern: true });
  });

  it('reads a missing singleton as both null', async () => {
    const store = supabaseStore(fakeDbById({ data: null, error: null }, {}));
    expect(await store.getActiveContext()).toEqual({
      active_season_id: null,
      active_event_id: null,
    });
  });

  it('throws on a database error instead of reading as "no competition is set up"', async () => {
    const store = supabaseStore(
      fakeDbById({ data: null, error: { message: 'connection refused' } }, {}),
    );
    await expect(store.getActiveContext()).rejects.toThrow('connection refused');
  });
});

describe('supabaseStore seasons, events and the active context (task 1.18)', () => {
  const SEASON = '11111111-1111-4111-8111-111111111111';
  const EVENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('setActiveContext writes both ids in one upsert of the singleton', async () => {
    const ids = { active_season_id: SEASON, active_event_id: EVENT };
    const { db, calls } = recordingDb({ data: ids, error: null });
    expect(await supabaseStore(db).setActiveContext(ids)).toEqual(ids);
    expect(calls).toContainEqual(['from', 'app_settings']);
    expect(calls).toContainEqual(['upsert', { id: true, ...ids }, { onConflict: 'id' }]);
    expect(calls.filter(([m]) => m === 'upsert' || m === 'update')).toHaveLength(1);
  });

  it('setActiveContext throws on a database error, keeping the Postgres code', async () => {
    const { db } = recordingDb({ data: null, error: { message: 'fk', code: '23503' } });
    await expect(
      supabaseStore(db).setActiveContext({ active_season_id: SEASON, active_event_id: null }),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('season and event reads select an explicit column list with no version', async () => {
    const { db, calls } = recordingDb({ data: null, error: null });
    const store = supabaseStore(db);
    await store.getSeason(SEASON);
    await store.getEvent(EVENT);
    const selects = calls.filter(([m]) => m === 'select').map(([, cols]) => cols);
    expect(selects).toEqual([
      'id, year, game_name, field_image_path, created_at, updated_at',
      'id, season_id, name, code, sort_order, created_at, updated_at',
    ]);
  });

  it('keeps the Postgres code on a duplicate year or event name', async () => {
    const { db } = recordingDb({ data: null, error: { message: 'dup', code: '23505' } });
    await expect(supabaseStore(db).insertSeason({ id: SEASON })).rejects.toMatchObject({
      code: '23505',
    });
    await expect(supabaseStore(db).insertEvent({ id: EVENT })).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('listSeasons orders newest first and pages with lt on year', async () => {
    const { db, calls } = recordingDb({ data: [], error: null });
    await supabaseStore(db).listSeasons(51, { year: 2026 });
    expect(calls).toContainEqual(['lt', 'year', 2026]);
    expect(calls).toContainEqual(['order', 'year', { ascending: false }]);
    expect(calls).toContainEqual(['limit', 51]);
  });

  it('listEvents filters the season, orders by sort_order then id, and pages on both', async () => {
    const { db, calls } = recordingDb({ data: [], error: null });
    await supabaseStore(db).listEvents(SEASON, 3, { sort_order: 2, id: EVENT });
    expect(calls).toContainEqual(['eq', 'season_id', SEASON]);
    expect(calls).toContainEqual(['or', `sort_order.gt.2,and(sort_order.eq.2,id.gt.${EVENT})`]);
    expect(calls).toContainEqual(['order', 'sort_order', { ascending: true }]);
    expect(calls).toContainEqual(['order', 'id', { ascending: true }]);
  });

  it('listEvents refuses a keyset that is not an integer and a uuid, before any query', async () => {
    const { db, calls } = recordingDb({ data: [], error: null });
    await expect(
      supabaseStore(db).listEvents(SEASON, 3, { sort_order: 1, id: 'x),id.gt.(' }),
    ).rejects.toThrow('listEvents: a keyset must be an integer sort_order and a uuid');
    expect(calls.find(([m]) => m === 'or')).toBeUndefined();
  });

  it('countEntriesBySeason counts every entry of the season’s events', async () => {
    const { db, calls } = recordingDb({ data: [{ id: EVENT }], error: null, count: 40 });
    expect(await supabaseStore(db).countEntriesBySeason(SEASON)).toBe(40);
    expect(calls).toContainEqual(['from', 'scouting_entries']);
    expect(calls).toContainEqual(['in', 'event_id', [EVENT]]);
    // soft-deleted entries count too: nothing filters deleted_at
    expect(calls.find(([m, col]) => m === 'is' && col === 'deleted_at')).toBeUndefined();
  });

  it('countEntriesBySeason is 0 for a season with no events, without counting entries', async () => {
    const { db, calls } = recordingDb({ data: [], error: null });
    expect(await supabaseStore(db).countEntriesBySeason(SEASON)).toBe(0);
    expect(calls).not.toContainEqual(['from', 'scouting_entries']);
  });

  it('countEntriesBySeason throws on a database error instead of reading as "no entries"', async () => {
    // Swallowed, a blip would read as 0 and let the image be swapped under real entries.
    const { db } = recordingDb({ data: null, error: { message: 'connection refused' } });
    await expect(supabaseStore(db).countEntriesBySeason(SEASON)).rejects.toThrow(
      'connection refused',
    );
  });

  it('countEntriesByScouterForSeason counts live entries per scouter, paging past 1000 rows', async () => {
    const page = (scouter: string, n: number) =>
      Array.from({ length: n }, () => ({ scouter_id: scouter }));
    const { db, chains } = scriptedDb([
      { data: [{ id: EVENT }], error: null },
      { data: [...page('u1', 600), ...page('u2', 400)], error: null },
      { data: page('u1', 5), error: null },
    ]);
    const out = await supabaseStore(db).countEntriesByScouterForSeason(SEASON);
    expect(out).toEqual([
      { scouter_id: 'u1', count: 605 },
      { scouter_id: 'u2', count: 400 },
    ]);
    expect(chains).toHaveLength(3);
    expect(chains[1]).toContainEqual(['in', 'event_id', [EVENT]]);
    expect(chains[1]).toContainEqual(['is', 'deleted_at', null]);
    expect(chains[1]).toContainEqual(['order', 'id']);
    expect(chains[1]).toContainEqual(['range', 0, 999]);
    expect(chains[2]).toContainEqual(['range', 1000, 1999]);
  });

  it('countEntriesByScouterForSeason sends the event ids in chunks, like every `in` filter', async () => {
    const events = Array.from({ length: 101 }, (_, i) => ({ id: `ev-${i}` }));
    const { db, chains } = scriptedDb([
      { data: events, error: null },
      { data: [{ scouter_id: 'u1' }, { scouter_id: 'u2' }], error: null },
      { data: [{ scouter_id: 'u1' }], error: null },
    ]);
    const out = await supabaseStore(db).countEntriesByScouterForSeason(SEASON);
    expect(out).toEqual([
      { scouter_id: 'u1', count: 2 },
      { scouter_id: 'u2', count: 1 },
    ]);
    expect(chains).toHaveLength(3);
    const ids = (chain: unknown[][]) => chain.find((c) => c[0] === 'in')?.[2] as string[];
    expect(ids(chains[1]!)).toHaveLength(100);
    expect(ids(chains[2]!)).toEqual(['ev-100']);
  });

  it('countEntriesByScouterForSeason is empty for a season with no events, without reading entries', async () => {
    const { db, chains } = scriptedDb([{ data: [], error: null }]);
    expect(await supabaseStore(db).countEntriesByScouterForSeason(SEASON)).toEqual([]);
    expect(chains).toHaveLength(1);
  });

  it('countEntriesByScouterForSeason throws on a database error instead of reading as "no entries"', async () => {
    const { db } = scriptedDb([
      { data: [{ id: EVENT }], error: null },
      { data: null, error: { message: 'connection refused' } },
    ]);
    await expect(supabaseStore(db).countEntriesByScouterForSeason(SEASON)).rejects.toThrow(
      'connection refused',
    );
  });
});

type Result = {
  data?: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

/**
 * Like recordingDb, but each `from()` starts its own chain and resolves to the NEXT
 * scripted result, so a method that reads and then writes can be driven step by step.
 * `chains[i]` is every call made on the i-th chain, starting with ['from', table].
 */
function scriptedDb(results: Result[]): { db: Db; chains: Call[][] } {
  const chains: Call[][] = [];
  const db = {
    from: (table: string) => {
      const calls: Call[] = [['from', table]];
      chains.push(calls);
      const result = results[chains.length - 1] ?? { data: [], error: null };
      const chain: Record<string, unknown> = {};
      for (const method of [
        'select',
        'insert',
        'update',
        'upsert',
        'delete',
        'eq',
        'is',
        'gt',
        'lt',
        'or',
        'in',
        'ilike',
        'order',
        'limit',
        'range',
        'single',
        'maybeSingle',
      ]) {
        chain[method] = (...args: unknown[]) => {
          calls.push([method, ...args]);
          return chain;
        };
      }
      chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
      return chain;
    },
  } as unknown as Db;
  return { db, chains };
}

describe('supabaseStore teams and the roster (task 1.19)', () => {
  const EVENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const A = '00000000-0000-4000-8000-00000000000a';
  const B = '00000000-0000-4000-8000-00000000000b';
  const C = '00000000-0000-4000-8000-00000000000c';
  const D = '00000000-0000-4000-8000-00000000000d';
  const TEAM_COLUMNS = 'id, number, name, created_at, updated_at';
  const team = (id: string, number: number) => ({ id, number, name: `T${number}` });

  it('team reads and writes select an explicit column list and keep the Postgres code', async () => {
    const { db, calls } = recordingDb({ data: null, error: { message: 'dup', code: '23505' } });
    const store = supabaseStore(db);
    await expect(store.insertTeam({ id: A })).rejects.toMatchObject({ code: '23505' });
    await expect(store.getTeamByNumber(2096)).rejects.toMatchObject({ code: '23505' });
    expect(calls).toContainEqual(['eq', 'number', 2096]);
    const selects = calls.filter(([m]) => m === 'select').map(([, cols]) => cols);
    expect(selects).toEqual([TEAM_COLUMNS, TEAM_COLUMNS]);
  });

  it('listTeams with no query is one keyset query by number', async () => {
    const { db, chains } = scriptedDb([{ data: [team(A, 20)], error: null }]);
    const rows = await supabaseStore(db).listTeams({ limit: 3, after: { number: 7 } });
    expect(rows).toEqual([team(A, 20)]);
    expect(chains).toHaveLength(1);
    expect(chains[0]).toContainEqual(['gt', 'number', 7]);
    expect(chains[0]).toContainEqual(['order', 'number', { ascending: true }]);
    expect(chains[0]).toContainEqual(['limit', 3]);
  });

  it('listTeams matches an escaped name substring and a number prefix, merged by number', async () => {
    const { db, chains } = scriptedDb([
      { data: [team(A, 20), team(C, 5990)], error: null },
      { data: [team(A, 20), team(B, 2096)], error: null },
    ]);
    const rows = await supabaseStore(db).listTeams({ query: '20', limit: 2 });
    expect(rows.map((r) => r.number)).toEqual([20, 2096]);
    expect(chains[0]).toContainEqual(['ilike', 'name', '%20%']);
    expect(chains[1]).toContainEqual(['or', numberPrefixFilter('20')]);
    expect(chains[1]).toContainEqual(['limit', 2]);
  });

  it('listTeams escapes LIKE wildcards and skips the number query for a non-number', async () => {
    const { db, chains } = scriptedDb([{ data: [], error: null }]);
    await supabaseStore(db).listTeams({ query: '100%_x', limit: 5 });
    expect(chains).toHaveLength(1);
    expect(chains[0]).toContainEqual(['ilike', 'name', `%100${BS}%${BS}_x%`]);
  });

  it('listTeams refuses a keyset that is not an integer, before any query', async () => {
    const { db, chains } = scriptedDb([]);
    await expect(
      supabaseStore(db).listTeams({ limit: 3, after: { number: 'x' as never } }),
    ).rejects.toThrow('listTeams: a keyset must be an integer team number');
    expect(chains).toHaveLength(0);
  });

  it('numberPrefixFilter covers every integer that starts with the digits, and only digits', () => {
    expect(numberPrefixFilter('209')).toBe(
      [
        'number.eq.209',
        'and(number.gte.2090,number.lte.2099)',
        'and(number.gte.20900,number.lte.20999)',
      ].join(','),
    );
    // Team numbers stop at 99999 (TEAM_NUMBER_MAX), so a five-digit prefix is exact.
    expect(numberPrefixFilter('20960')).toBe('number.eq.20960');
    expect(() => numberPrefixFilter('2),x')).toThrow();
    expect(() => numberPrefixFilter('012')).toThrow();
  });

  it('getRoster reads the live rows, then their teams by number', async () => {
    const { db, chains } = scriptedDb([
      { data: [{ team_id: A }, { team_id: B }], error: null },
      { data: [team(B, 1577), team(A, 2096)], error: null },
    ]);
    const rows = await supabaseStore(db).getRoster(EVENT);
    expect(rows.map((r) => r.number)).toEqual([1577, 2096]);
    expect(chains[0]).toContainEqual(['eq', 'event_id', EVENT]);
    expect(chains[0]).toContainEqual(['is', 'deleted_at', null]);
    expect(chains[1]).toContainEqual(['in', 'id', [A, B]]);
  });

  it('getRoster of an empty roster reads nothing more', async () => {
    const { db, chains } = scriptedDb([{ data: [], error: null }]);
    expect(await supabaseStore(db).getRoster(EVENT)).toEqual([]);
    expect(chains).toHaveLength(1);
  });

  it('setRoster inserts only what is new, revives the newest tombstone, then tombstones removals', async () => {
    const AT = '2026-11-14T10:00:00.000Z';
    const { db, chains } = scriptedDb([
      {
        data: [
          { id: 'et-a', team_id: A, deleted_at: null, updated_at: '2026-01-01' },
          { id: 'et-b', team_id: B, deleted_at: null, updated_at: '2026-01-01' },
          { id: 'et-c-old', team_id: C, deleted_at: 'x', updated_at: '2026-01-01' },
          { id: 'et-c', team_id: C, deleted_at: 'x', updated_at: '2026-02-01' },
        ],
        error: null,
      },
      { error: null },
      { error: null },
      { error: null },
    ]);
    await supabaseStore(db).setRoster(EVENT, [A, C, D], AT);
    expect(chains).toHaveLength(4);
    // The insert first: it is the write a foreign key can refuse, so a refusal changes nothing.
    const insert = chains[1]!.find(([m]) => m === 'insert')!;
    expect(insert[1]).toEqual([{ id: expect.any(String), event_id: EVENT, team_id: D }]);
    expect(chains[2]).toContainEqual(['update', { deleted_at: null }]);
    expect(chains[2]).toContainEqual(['in', 'id', ['et-c']]);
    expect(chains[3]).toContainEqual(['update', { deleted_at: AT }]);
    expect(chains[3]).toContainEqual(['in', 'id', ['et-b']]);
  });

  it('setRoster with nothing to change only reads', async () => {
    const { db, chains } = scriptedDb([
      { data: [{ id: 'et-a', team_id: A, deleted_at: null, updated_at: '1' }], error: null },
    ]);
    await supabaseStore(db).setRoster(EVENT, [A], 'now');
    expect(chains).toHaveLength(1);
  });

  it('setRoster keeps the Postgres code of a failed write', async () => {
    const { db } = scriptedDb([
      { data: [], error: null },
      { error: { message: 'fk', code: '23503' } },
    ]);
    await expect(supabaseStore(db).setRoster(EVENT, [A], 'now')).rejects.toMatchObject({
      code: '23503',
    });
  });
});

describe('supabaseStore matches and match slots (task 1.19)', () => {
  const EVENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const MATCH = 'bbbbbbbb-0000-4000-8000-000000000001';
  const A = '00000000-0000-4000-8000-00000000000a';
  const B = '00000000-0000-4000-8000-00000000000b';
  const MATCH_COLUMNS = 'id, event_id, match_type, number, created_at, updated_at';
  const match = (match_type: string, number: number) => ({
    id: `${match_type}${number}`,
    match_type,
    number,
  });

  it('match reads select an explicit column list with no official results', async () => {
    const { db, calls } = recordingDb({ data: null, error: null });
    const store = supabaseStore(db);
    await store.getMatch(MATCH);
    await store.findMatch(EVENT, 'qualification', 3);
    const selects = calls.filter(([m]) => m === 'select').map(([, cols]) => cols);
    expect(selects).toEqual([MATCH_COLUMNS, MATCH_COLUMNS]);
    expect(calls).toContainEqual(['eq', 'match_type', 'qualification']);
    expect(calls).toContainEqual(['eq', 'number', 3]);
  });

  it('listMatches reads practice, qualification, playoff in turn from the keyset', async () => {
    const { db, chains } = scriptedDb([
      { data: [match('qualification', 4)], error: null },
      { data: [match('playoff', 1), match('playoff', 2)], error: null },
    ]);
    const rows = await supabaseStore(db).listMatches(EVENT, 3, {
      match_type: 'qualification',
      number: 3,
    });
    expect(rows.map((r) => r.id)).toEqual(['qualification4', 'playoff1', 'playoff2']);
    expect(chains).toHaveLength(2);
    expect(chains[0]).toContainEqual(['eq', 'match_type', 'qualification']);
    expect(chains[0]).toContainEqual(['gt', 'number', 3]);
    expect(chains[0]).toContainEqual(['limit', 3]);
    expect(chains[1]).toContainEqual(['eq', 'match_type', 'playoff']);
    expect(chains[1]!.find(([m]) => m === 'gt')).toBeUndefined();
    expect(chains[1]).toContainEqual(['limit', 2]);
  });

  it('listMatches stops as soon as the page is full', async () => {
    const { db, chains } = scriptedDb([
      { data: [match('practice', 1), match('practice', 2)], error: null },
    ]);
    await supabaseStore(db).listMatches(EVENT, 2);
    expect(chains).toHaveLength(1);
  });

  it('listMatches refuses a keyset with an unknown type or a non-integer number', async () => {
    const { db, chains } = scriptedDb([]);
    await expect(
      supabaseStore(db).listMatches(EVENT, 2, { match_type: 'final' as never, number: 1 }),
    ).rejects.toThrow('listMatches: a keyset must be a match type and an integer number');
    await expect(
      supabaseStore(db).listMatches(EVENT, 2, { match_type: 'playoff', number: 'x' as never }),
    ).rejects.toThrow('listMatches');
    expect(chains).toHaveLength(0);
  });

  it('listMatchSlots reads the slots of the given matches, and nothing for none', async () => {
    const { db, chains } = scriptedDb([{ data: [], error: null }]);
    const store = supabaseStore(db);
    expect(await store.listMatchSlots([])).toEqual([]);
    expect(chains).toHaveLength(0);
    await store.listMatchSlots([MATCH]);
    expect(chains[0]).toContainEqual(['select', 'match_id, alliance, station, team_id']);
    expect(chains[0]).toContainEqual(['in', 'match_id', [MATCH]]);
  });

  it('setMatchTeams deletes cleared slots, updates a changed team in place, inserts new ones', async () => {
    const { db, chains } = scriptedDb([
      {
        data: [
          { id: 's-r1', alliance: 'red', station: 1, team_id: A },
          { id: 's-r2', alliance: 'red', station: 2, team_id: A },
          { id: 's-b1', alliance: 'blue', station: 1, team_id: B },
        ],
        error: null,
      },
      { error: null },
      { error: null },
      { error: null },
    ]);
    await supabaseStore(db).setMatchTeams(MATCH, [
      { alliance: 'red', station: 1, team_id: A },
      { alliance: 'red', station: 2, team_id: B },
      { alliance: 'blue', station: 3, team_id: A },
    ]);
    expect(chains).toHaveLength(4);
    expect(chains[1]).toContainEqual(['delete']);
    expect(chains[1]).toContainEqual(['in', 'id', ['s-b1']]);
    expect(chains[2]).toContainEqual(['update', { team_id: B }]);
    expect(chains[2]).toContainEqual(['eq', 'id', 's-r2']);
    const insert = chains[3]!.find(([m]) => m === 'insert')!;
    expect(insert[1]).toEqual([
      { id: expect.any(String), match_id: MATCH, alliance: 'blue', station: 3, team_id: A },
    ]);
  });

  it('countEntriesByMatch counts every entry of the match, soft-deleted ones included', async () => {
    const { db, calls } = recordingDb({ data: null, error: null, count: 6 });
    expect(await supabaseStore(db).countEntriesByMatch(MATCH)).toBe(6);
    expect(calls).toContainEqual(['from', 'scouting_entries']);
    expect(calls).toContainEqual(['eq', 'match_id', MATCH]);
    expect(calls.find(([m, col]) => m === 'is' && col === 'deleted_at')).toBeUndefined();
  });

  it('deleteMatch keeps the Postgres code when the entries foreign key refuses it', async () => {
    const { db, chains } = scriptedDb([{ error: { message: 'fk', code: '23503' } }]);
    await expect(supabaseStore(db).deleteMatch(MATCH)).rejects.toMatchObject({ code: '23503' });
    expect(chains[0]).toContainEqual(['delete']);
    expect(chains[0]).toContainEqual(['eq', 'id', MATCH]);
  });
});

describe('supabaseStore hard deletes (RB.20, SPEC-FINAL 3.9)', () => {
  const SEASON = '11111111-1111-4111-8111-111111111111';
  const EVENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const EVENT_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';

  /** Just `rpc`: what the two cascade deletes call. */
  function rpcDb(error: { message: string; code?: string } | null) {
    const calls: Call[] = [];
    const db = {
      rpc: (name: string, args: unknown) => {
        calls.push(['rpc', name, args]);
        return Promise.resolve({ data: null, error });
      },
    } as unknown as Db;
    return { db, calls };
  }

  it('deleteEvent and deleteSeason each call their one cascade function', async () => {
    const event = rpcDb(null);
    await supabaseStore(event.db).deleteEvent(EVENT);
    expect(event.calls).toEqual([['rpc', 'delete_event_cascade', { p_event_id: EVENT }]]);
    const season = rpcDb(null);
    await supabaseStore(season.db).deleteSeason(SEASON);
    expect(season.calls).toEqual([['rpc', 'delete_season_cascade', { p_season_id: SEASON }]]);
  });

  it('a refused cascade throws with the Postgres code, never reads as deleted', async () => {
    const { db } = rpcDb({ message: 'fk', code: '23503' });
    await expect(supabaseStore(db).deleteEvent(EVENT)).rejects.toMatchObject({ code: '23503' });
    await expect(supabaseStore(db).deleteSeason(SEASON)).rejects.toMatchObject({ code: '23503' });
  });

  it("countDeleteImpact('event') head-counts the event's matches and live entries", async () => {
    const { db, chains } = scriptedDb([
      { error: null, count: 3 },
      { error: null, count: 17 },
    ]);
    expect(await supabaseStore(db).countDeleteImpact('event', EVENT)).toEqual({
      events: 1,
      matches: 3,
      entries: 17,
      forms: 0,
    });
    expect(chains[0]).toContainEqual(['from', 'matches']);
    expect(chains[0]).toContainEqual(['in', 'event_id', [EVENT]]);
    expect(chains[1]).toContainEqual(['from', 'scouting_entries']);
    expect(chains[1]).toContainEqual(['select', 'id', { count: 'exact', head: true }]);
    expect(chains[1]).toContainEqual(['is', 'deleted_at', null]);
  });

  it("countDeleteImpact('season') counts its events, their matches and entries, and its forms", async () => {
    const { db, chains } = scriptedDb([
      { data: [{ id: EVENT }, { id: EVENT_2 }], error: null },
      { error: null, count: 2 },
      { error: null, count: 40 },
      { error: null, count: 300 },
    ]);
    expect(await supabaseStore(db).countDeleteImpact('season', SEASON)).toEqual({
      events: 2,
      matches: 40,
      entries: 300,
      forms: 2,
    });
    expect(chains[0]).toContainEqual(['eq', 'season_id', SEASON]);
    expect(chains[1]).toContainEqual(['from', 'forms']);
    expect(chains[2]).toContainEqual(['in', 'event_id', [EVENT, EVENT_2]]);
  });

  it('countDeleteImpact for a season with no events counts no matches or entries', async () => {
    const { db, chains } = scriptedDb([
      { data: [], error: null },
      { error: null, count: 0 },
    ]);
    expect(await supabaseStore(db).countDeleteImpact('season', SEASON)).toEqual({
      events: 0,
      matches: 0,
      entries: 0,
      forms: 0,
    });
    expect(chains).toHaveLength(2);
  });

  it('countDeleteImpact throws on a database error instead of reading as "nothing to lose"', async () => {
    const { db } = scriptedDb([{ error: { message: 'connection refused' } }]);
    await expect(supabaseStore(db).countDeleteImpact('event', EVENT)).rejects.toThrow(
      'connection refused',
    );
  });
});
