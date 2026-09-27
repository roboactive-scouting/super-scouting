import { describe, expect, it } from 'vitest';
import { PURGE_ORDER, SEED_PREFIX, strayIds } from './strays';

describe('strayIds', () => {
  it('keeps only ids outside the seed id space', () => {
    const seedId = `${SEED_PREFIX}000000000006`;
    const strayId = '11111111-1111-4111-8111-111111111111';
    expect(strayIds([seedId, strayId])).toEqual([strayId]);
  });

  it('returns nothing when every id is seeded', () => {
    const seedId = `${SEED_PREFIX}000000000001`;
    expect(strayIds([seedId])).toEqual([]);
  });

  it('returns everything when nothing is seeded', () => {
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    expect(strayIds([a, b])).toEqual([a, b]);
  });

  it('accepts an explicit prefix', () => {
    expect(strayIds(['other-1', 'seed-1'], 'seed-')).toEqual(['other-1']);
  });
});

describe('PURGE_ORDER', () => {
  const at = (table: (typeof PURGE_ORDER)[number]) => PURGE_ORDER.indexOf(table);

  it('purges every child before the parent it references', () => {
    // [child, parent] for each foreign key between the purged tables (skeleton migration)
    const references: [(typeof PURGE_ORDER)[number], (typeof PURGE_ORDER)[number]][] = [
      ['scouting_entries', 'matches'],
      ['scouting_entries', 'events'],
      ['scouting_entries', 'teams'],
      ['scouting_entries', 'users'],
      ['match_teams', 'matches'],
      ['match_teams', 'teams'],
      ['matches', 'events'],
      ['event_teams', 'events'],
      ['event_teams', 'teams'],
      ['events', 'seasons'],
    ];
    for (const [child, parent] of references) {
      expect(at(child), `${child} before ${parent}`).toBeLessThan(at(parent));
    }
  });

  it('keeps the tables the first version purged, and never the applied-operations ledger', () => {
    expect(PURGE_ORDER).toEqual(expect.arrayContaining(['scouting_entries', 'matches', 'users']));
    expect(PURGE_ORDER).not.toContain('applied_operations' as never);
    expect(new Set(PURGE_ORDER).size).toBe(PURGE_ORDER.length);
  });
});
