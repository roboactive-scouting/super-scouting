import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import type { StoredEvent } from '../context.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';
import { countEntriesByScouter } from './countEntriesByScouter.js';

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S1 = uuid(1);
const S2 = uuid(2);
const E1 = uuid(11);
const E2 = uuid(12);
const E3 = uuid(13);
const U1 = uuid(21);
const U2 = uuid(22);
const U3 = uuid(23);
const U9 = uuid(29);

const CALLERS: Caller[] = [
  { kind: 'user', userId: U9, role: 'scouter' },
  { kind: 'user', userId: U9, role: 'lead' },
  { kind: 'user', userId: U9, role: 'admin' },
  { kind: 'service', label: 'mcp' },
];
const admin = CALLERS[2] as Caller;

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
});

type SeedEntry = { id: string; event_id: string; scouter_id: string; deleted_at: string | null };

/** Seeds the fake store through its own maps: events, and scouting_entries rows. */
function seedFake(seed: { events: { id: string; season_id: string }[]; entries: SeedEntry[] }) {
  for (const e of seed.events) {
    ctx.events.set(e.id, {
      name: e.id,
      code: null,
      sort_order: 0,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
      ...e,
    } satisfies StoredEvent);
  }
  for (const r of seed.entries) ctx.rows.scouting_entries.set(r.id, { ...r, version: 1 });
}

const entry = (n: number, event_id: string, scouter_id: string, deleted_at: string | null = null) =>
  ({ id: uuid(100 + n), event_id, scouter_id, deleted_at }) satisfies SeedEntry;

describe('countEntriesByScouter (RB.13)', () => {
  it('counts live entries per scouter across the season, never deleted ones or other seasons', async () => {
    seedFake({
      events: [
        { id: E1, season_id: S1 },
        { id: E2, season_id: S1 },
        { id: E3, season_id: S2 },
      ],
      entries: [
        entry(1, E1, U1),
        entry(2, E2, U1),
        entry(3, E2, U2, '2026-10-06T00:00:00Z'),
        entry(4, E3, U2),
      ],
    });
    const out = await countEntriesByScouter(admin, { season_id: S1 }, ctx);
    expect(out.items).toEqual([{ scouter_id: U1, count: 2 }]);
  });

  it('lists the scouter with the most entries first', async () => {
    seedFake({
      events: [{ id: E1, season_id: S1 }],
      entries: [
        entry(1, E1, U1),
        entry(2, E1, U2),
        entry(3, E1, U2),
        entry(4, E1, U3),
        entry(5, E1, U2),
      ],
    });
    const out = await countEntriesByScouter(admin, { season_id: S1 }, ctx);
    expect(out.items[0]).toEqual({ scouter_id: U2, count: 3 });
    expect(out.items.map((i) => i.count)).toEqual([3, 1, 1]);
  });

  it('returns no items for a season with no entries', async () => {
    seedFake({ events: [{ id: E1, season_id: S1 }], entries: [] });
    expect(await countEntriesByScouter(admin, { season_id: S1 }, ctx)).toEqual({ items: [] });
    expect(await countEntriesByScouter(admin, { season_id: S2 }, ctx)).toEqual({ items: [] });
  });

  it('answers every role and a service caller', async () => {
    seedFake({ events: [{ id: E1, season_id: S1 }], entries: [entry(1, E1, U1)] });
    for (const caller of CALLERS) {
      const out = await countEntriesByScouter(caller, { season_id: S1 }, ctx);
      expect(out.items, JSON.stringify(caller)).toEqual([{ scouter_id: U1, count: 1 }]);
    }
  });

  it('rejects a season id that is not a uuid', async () => {
    await expect(countEntriesByScouter(admin, { season_id: 'nope' }, ctx)).rejects.toMatchObject({
      code: 'invalid',
    });
  });
});
