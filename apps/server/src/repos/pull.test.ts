import { describe, expect, it } from 'vitest';
import type { Db } from '../db/client.js';
import { supabasePullEntity } from './pull.js';

type Result = { data: unknown; error: { message: string } | null };
type Call = [string, string, ...unknown[]];

/**
 * Just enough of the supabase-js chain for pull.ts. Each `from(table)` starts its own
 * chain, and awaiting it resolves to that table's result (default: no rows, no error).
 */
function fakeDb(results: Record<string, Result>): { db: Db; calls: Call[] } {
  const calls: Call[] = [];
  const db = {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'gt', 'order', 'range']) {
        chain[method] = (...args: unknown[]) => {
          calls.push([table, method, ...args]);
          return chain;
        };
      }
      chain.then = (resolve: (value: Result) => unknown) =>
        resolve(results[table] ?? { data: [], error: null });
      return chain;
    },
  } as unknown as Db;
  return { db, calls };
}

const scope = { eventId: 'ev-1', seasonId: 's-1' };
const failing: Result = { data: null, error: { message: 'connection refused' } };

describe('supabasePullEntity parent lookups (review fix: a failed lookup is not "no parents")', () => {
  // Swallowed, a failed parent lookup scoped the child query to no ids: an empty page
  // that still advanced the device's watermark, so those rows never arrived.
  const cases: [key: string, parentTable: string][] = [
    ['match_teams', 'matches'],
    ['form_versions', 'forms'],
    ['scoring_rules', 'forms'],
    ['form_fields', 'forms'],
    ['form_fields', 'form_versions'],
    ['pick_list_entries', 'pick_lists'],
    ['alliance_slots', 'alliances'],
    ['alliance_declines', 'alliances'],
    ['dashboard_charts', 'dashboards'],
    ['teams', 'events'],
    ['teams', 'event_teams'],
    ['teams', 'scouting_entries'],
  ];

  it.each(cases)('%s throws when its %s lookup fails', async (key, parentTable) => {
    const { db } = fakeDb({ [parentTable]: failing });
    await expect(supabasePullEntity(db)(key, scope, undefined, 0, 100)).rejects.toThrow(
      'connection refused',
    );
  });

  it('still scopes a child table to its parents ids when the lookups succeed', async () => {
    const { db, calls } = fakeDb({
      matches: { data: [{ id: 'm-1' }, { id: 'm-2' }], error: null },
      match_teams: { data: [{ id: 'mt-1' }], error: null },
    });
    expect(await supabasePullEntity(db)('match_teams', scope, undefined, 0, 100)).toEqual([
      { id: 'mt-1' },
    ]);
    expect(calls).toContainEqual(['match_teams', 'in', 'match_id', ['m-1', 'm-2']]);
  });

  it('throws when the child query itself fails', async () => {
    const { db } = fakeDb({ matches: failing });
    await expect(supabasePullEntity(db)('matches', scope, undefined, 0, 100)).rejects.toThrow(
      'matches: connection refused',
    );
  });
});
