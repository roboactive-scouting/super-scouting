import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import {
  createMatch,
  deleteMatch,
  ensureMatch,
  listMatches,
  setMatchTeams,
  updateMatch,
} from './matches.js';
import { setEventRoster } from './teams.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';

// Wire ids are uuids (the schemas are strict), so the plan's 'ev-1' / 't-1' / 'm-1' are these.
const SE_1 = '11111111-1111-4111-8111-111111111111';
const EV_1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const EV_2 = 'eeeeeeee-eeee-4eee-8eee-000000000002';
const T_1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const T_2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const T_3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const T_99 = 'aaaaaaaa-0000-4000-8000-000000000099';
const M_1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const NOPE = '99999999-9999-4999-8999-999999999999';

const admin: Caller = { kind: 'user', userId: 'u-a', role: 'admin' };
const lead: Caller = { kind: 'user', userId: 'u-l', role: 'lead' };
const scouter: Caller = { kind: 'user', userId: 'u-s', role: 'scouter' };
const service: Caller = { kind: 'service', label: 'mcp' };

const AT = '2026-11-01T00:00:00.000Z';

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  ctx.events.set(EV_1, { id: EV_1, season_id: SE_1, name: 'E', sort_order: 1 } as never);
  ctx.events.set(EV_2, { id: EV_2, season_id: SE_1, name: 'F', sort_order: 2 } as never);
  // The fake enforces the team foreign keys, so the roster's teams exist.
  ctx.teams.set(T_1, { id: T_1, number: 2096, name: 'A', created_at: AT, updated_at: AT });
  ctx.teams.set(T_2, { id: T_2, number: 1690, name: 'B', created_at: AT, updated_at: AT });
  ctx.teams.set(T_3, { id: T_3, number: 1577, name: 'C', created_at: AT, updated_at: AT });
  ctx.roster.set(EV_1, [T_1, T_2]);
});

const one = async (
  number: number,
  match_type: 'practice' | 'qualification' | 'playoff' = 'qualification',
) => (await createMatch(admin, { event_id: EV_1, match_type, number }, ctx)).items[0]!;

describe('matches (SPEC-FINAL 6.4)', () => {
  it('creates a single match and refuses a duplicate (event, type, number)', async () => {
    await createMatch(admin, { event_id: EV_1, match_type: 'qualification', number: 1 }, ctx);
    await expect(
      createMatch(admin, { event_id: EV_1, match_type: 'qualification', number: 1 }, ctx),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('creates qualification matches in bulk from a count, skipping ones that exist', async () => {
    await createMatch(admin, { event_id: EV_1, match_type: 'qualification', number: 3 }, ctx);
    const result = await createMatch(
      admin,
      { event_id: EV_1, match_type: 'qualification', count: 5 },
      ctx,
    );
    expect(result.created).toBe(4);
    expect([...ctx.matches.values()].map((m) => m.number).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('fills the six alliance slots from the roster and allows slots to be left empty', async () => {
    const match = await one(1);
    await setMatchTeams(
      admin,
      {
        match_id: match.id,
        slots: [
          { alliance: 'red', station: 1, team_id: T_1 },
          { alliance: 'blue', station: 3, team_id: T_2 },
        ],
      },
      ctx,
    );
    expect(ctx.matchTeams.get(`${match.id}:red:1`)!.team_id).toBe(T_1);
    expect(ctx.matchTeams.has(`${match.id}:red:2`)).toBe(false);
  });

  it('refuses a station outside 1..3 and an alliance outside red and blue', async () => {
    const match = await one(1);
    await expect(
      setMatchTeams(
        admin,
        { match_id: match.id, slots: [{ alliance: 'red', station: 4, team_id: T_1 }] },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      setMatchTeams(
        admin,
        {
          match_id: match.id,
          slots: [{ alliance: 'green', station: 1, team_id: T_1 } as never],
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('refuses a team that is not on the event roster', async () => {
    const match = await one(1);
    await expect(
      setMatchTeams(
        admin,
        { match_id: match.id, slots: [{ alliance: 'red', station: 1, team_id: T_99 }] },
        ctx,
      ),
    ).rejects.toThrow(/roster/i);
  });

  it('blocks deleting a match that has entries, and says to correct the number instead', async () => {
    const match = await one(1);
    ctx.entryCountsByMatch.set(match.id, 6);
    await expect(deleteMatch(admin, { match_id: match.id }, ctx)).rejects.toThrow(/6 entries/);
    await expect(deleteMatch(admin, { match_id: match.id }, ctx)).rejects.toThrow(
      /correct the match number/i,
    );
  });

  it('lets a scouter call ensureMatch, and it is a no-op when the match already exists', async () => {
    const id = '00000000-0000-4000-8000-000000000099';
    const first = await ensureMatch(
      scouter,
      { id, event_id: EV_1, match_type: 'qualification', number: 42 },
      ctx,
    );
    expect(first).toEqual({ id, created: true });
    const again = await ensureMatch(
      scouter,
      {
        id: '00000000-0000-4000-8000-000000000098',
        event_id: EV_1,
        match_type: 'qualification',
        number: 42,
      },
      ctx,
    );
    expect(again).toEqual({ id, created: false });
  });

  it('never lets ensureMatch set teams, rename or delete', async () => {
    const id = '00000000-0000-4000-8000-000000000097';
    await ensureMatch(scouter, { id, event_id: EV_1, match_type: 'qualification', number: 7 }, ctx);
    expect(Object.keys(ctx.matches.get(id)!).sort()).toEqual(
      ['event_id', 'id', 'match_type', 'number'].sort(),
    );
  });

  it('refuses createMatch, setMatchTeams and deleteMatch to a lead', async () => {
    await expect(
      createMatch(lead, { event_id: EV_1, match_type: 'qualification', number: 2 }, ctx),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(setMatchTeams(lead, { match_id: M_1, slots: [] }, ctx)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(deleteMatch(lead, { match_id: M_1 }, ctx)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('createMatch', () => {
  it('returns the match it created, with its timestamps and no slots', async () => {
    const result = await createMatch(
      admin,
      { event_id: EV_1, match_type: 'practice', number: 2 },
      ctx,
    );
    expect(result.created).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      event_id: EV_1,
      match_type: 'practice',
      number: 2,
      slots: [],
    });
    expect(typeof result.items[0]!.created_at).toBe('string');
    expect(typeof result.items[0]!.updated_at).toBe('string');
  });

  it('names the duplicate in its refusal', async () => {
    await one(4);
    await expect(
      createMatch(admin, { event_id: EV_1, match_type: 'qualification', number: 4 }, ctx),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'qualification match 4 already exists at this event',
    });
  });

  it('reads a unique violation from a race as conflict, not a 500', async () => {
    await one(4);
    ctx.store.findMatch = async () => null; // the pre-check loses the race
    await expect(
      createMatch(admin, { event_id: EV_1, match_type: 'qualification', number: 4 }, ctx),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('returns the created rows of a bulk create in number order, and none that existed', async () => {
    await one(2);
    const result = await createMatch(
      admin,
      { event_id: EV_1, match_type: 'qualification', count: 4 },
      ctx,
    );
    expect(result.created).toBe(3);
    expect(result.items.map((m) => m.number)).toEqual([1, 3, 4]);
  });

  it('keeps match types and events apart when skipping in bulk', async () => {
    await one(1, 'practice');
    await createMatch(admin, { event_id: EV_2, match_type: 'qualification', number: 2 }, ctx);
    const result = await createMatch(
      admin,
      { event_id: EV_1, match_type: 'qualification', count: 2 },
      ctx,
    );
    expect(result.created).toBe(2);
  });

  it('is a no-op when every match of the count already exists', async () => {
    await createMatch(admin, { event_id: EV_1, match_type: 'qualification', count: 3 }, ctx);
    const again = await createMatch(
      admin,
      { event_id: EV_1, match_type: 'qualification', count: 3 },
      ctx,
    );
    expect(again).toEqual({ created: 0, items: [] });
  });

  it('refuses neither or both of number and count, and a count above 200', async () => {
    for (const input of [
      { event_id: EV_1, match_type: 'qualification' },
      { event_id: EV_1, match_type: 'qualification', number: 1, count: 3 },
      { event_id: EV_1, match_type: 'qualification', count: 201 },
      { event_id: EV_1, match_type: 'qualification', count: 0 },
      { event_id: EV_1, match_type: 'qualification', number: 0 },
      { event_id: EV_1, match_type: 'final', number: 1 },
    ]) {
      await expect(
        createMatch(admin, input as never, ctx),
        JSON.stringify(input),
      ).rejects.toMatchObject({ code: 'invalid' });
    }
    expect(ctx.matches.size).toBe(0);
  });

  it('refuses an event that does not exist', async () => {
    await expect(
      createMatch(admin, { event_id: NOPE, match_type: 'qualification', number: 1 }, ctx),
    ).rejects.toMatchObject({
      code: 'not-found',
      message: 'that event does not exist; it may have been deleted',
    });
  });

  it('refuses a service caller', async () => {
    await expect(
      createMatch(service, { event_id: EV_1, match_type: 'qualification', number: 1 }, ctx),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('updateMatch', () => {
  it('corrects the number and the type, and never touches the slots or the event', async () => {
    const match = await one(1);
    await setMatchTeams(
      admin,
      { match_id: match.id, slots: [{ alliance: 'red', station: 1, team_id: T_1 }] },
      ctx,
    );
    const updated = await updateMatch(
      admin,
      { match_id: match.id, match_type: 'playoff', number: 11 },
      ctx,
    );
    expect(updated).toMatchObject({
      id: match.id,
      event_id: EV_1,
      match_type: 'playoff',
      number: 11,
      slots: [{ alliance: 'red', station: 1, team_id: T_1 }],
    });
    expect(ctx.matches.get(match.id)).toMatchObject({ match_type: 'playoff', number: 11 });
    expect(ctx.matchTeams.get(`${match.id}:red:1`)!.team_id).toBe(T_1);
  });

  it('refuses a correction onto a match that already exists', async () => {
    const match = await one(1);
    await one(2);
    await expect(updateMatch(admin, { match_id: match.id, number: 2 }, ctx)).rejects.toMatchObject({
      code: 'conflict',
      message: 'qualification match 2 already exists at this event',
    });
  });

  it('reads a unique violation from a race as conflict', async () => {
    const match = await one(1);
    await one(2);
    ctx.store.findMatch = async () => null;
    await expect(updateMatch(admin, { match_id: match.id, number: 2 }, ctx)).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('is a no-op that writes nothing when nothing changes', async () => {
    const match = await one(1);
    ctx.store.updateMatch = async () => {
      throw new Error('must not write');
    };
    await expect(updateMatch(admin, { match_id: match.id, number: 1 }, ctx)).resolves.toMatchObject(
      { number: 1 },
    );
  });

  it('refuses no change at all, an unknown key, a missing match and a lead', async () => {
    const match = await one(1);
    await expect(updateMatch(admin, { match_id: match.id }, ctx)).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(
      updateMatch(admin, { match_id: match.id, event_id: EV_2 } as never, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(updateMatch(admin, { match_id: NOPE, number: 3 }, ctx)).rejects.toMatchObject({
      code: 'not-found',
      message: 'that match does not exist; it may have been deleted',
    });
    await expect(updateMatch(lead, { match_id: match.id, number: 3 }, ctx)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('deleteMatch', () => {
  it('deletes a match with no entries, and its slots go with it', async () => {
    const match = await one(1);
    await setMatchTeams(
      admin,
      { match_id: match.id, slots: [{ alliance: 'blue', station: 2, team_id: T_2 }] },
      ctx,
    );
    expect(await deleteMatch(admin, { match_id: match.id }, ctx)).toEqual({
      id: match.id,
      deleted: true,
    });
    expect(ctx.matches.has(match.id)).toBe(false);
    expect([...ctx.matchTeams.values()].filter((s) => s.match_id === match.id)).toEqual([]);
  });

  it('gives the full refusal text, and says "1 entry" for one', async () => {
    const match = await one(3);
    ctx.entryCountsByMatch.set(match.id, 6);
    await expect(deleteMatch(admin, { match_id: match.id }, ctx)).rejects.toMatchObject({
      code: 'conflict',
      message:
        'qualification match 3 has 6 entries, so it cannot be deleted; correct the match number instead',
    });
    ctx.entryCountsByMatch.set(match.id, 1);
    await expect(deleteMatch(admin, { match_id: match.id }, ctx)).rejects.toThrow(/has 1 entry,/);
    expect(ctx.matches.has(match.id)).toBe(true);
  });

  it('maps the foreign key refusing the delete to the same answer (an entry raced in)', async () => {
    const match = await one(1);
    const count = ctx.store.countEntriesByMatch.bind(ctx.store);
    let calls = 0;
    ctx.store.countEntriesByMatch = async (id) => (calls++ === 0 ? 0 : count(id));
    ctx.entryCountsByMatch.set(match.id, 2);
    await expect(deleteMatch(admin, { match_id: match.id }, ctx)).rejects.toMatchObject({
      code: 'conflict',
      message:
        'qualification match 1 has 2 entries, so it cannot be deleted; correct the match number instead',
    });
    expect(ctx.matches.has(match.id)).toBe(true);
  });

  it('refuses a match that does not exist', async () => {
    await expect(deleteMatch(admin, { match_id: NOPE }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('setMatchTeams', () => {
  it('replaces the slots: an omitted slot is cleared, a given one is written', async () => {
    const match = await one(1);
    await setMatchTeams(
      admin,
      {
        match_id: match.id,
        slots: [
          { alliance: 'red', station: 1, team_id: T_1 },
          { alliance: 'blue', station: 3, team_id: T_2 },
        ],
      },
      ctx,
    );
    const result = await setMatchTeams(
      admin,
      { match_id: match.id, slots: [{ alliance: 'red', station: 2, team_id: T_1 }] },
      ctx,
    );
    expect(result.slots).toEqual([{ alliance: 'red', station: 2, team_id: T_1 }]);
    expect(ctx.matchTeams.has(`${match.id}:red:1`)).toBe(false);
    expect(ctx.matchTeams.has(`${match.id}:blue:3`)).toBe(false);
    expect(ctx.matchTeams.get(`${match.id}:red:2`)!.team_id).toBe(T_1);
  });

  it('clears every slot when given none', async () => {
    const match = await one(1);
    await setMatchTeams(
      admin,
      { match_id: match.id, slots: [{ alliance: 'red', station: 1, team_id: T_1 }] },
      ctx,
    );
    const result = await setMatchTeams(admin, { match_id: match.id, slots: [] }, ctx);
    expect(result.slots).toEqual([]);
    expect(ctx.matchTeams.size).toBe(0);
  });

  it('returns the slots red 1..3 then blue 1..3, and only for this match', async () => {
    const match = await one(1);
    const other = await one(2);
    await setMatchTeams(
      admin,
      { match_id: other.id, slots: [{ alliance: 'red', station: 1, team_id: T_2 }] },
      ctx,
    );
    const result = await setMatchTeams(
      admin,
      {
        match_id: match.id,
        slots: [
          { alliance: 'blue', station: 1, team_id: T_2 },
          { alliance: 'red', station: 3, team_id: T_1 },
        ],
      },
      ctx,
    );
    expect(result).toMatchObject({ id: match.id, number: 1 });
    expect(result.slots).toEqual([
      { alliance: 'red', station: 3, team_id: T_1 },
      { alliance: 'blue', station: 1, team_id: T_2 },
    ]);
  });

  it('keeps the row of a slot whose team did not change, and moves a changed one in place', async () => {
    const match = await one(1);
    await setMatchTeams(
      admin,
      {
        match_id: match.id,
        slots: [
          { alliance: 'red', station: 1, team_id: T_1 },
          { alliance: 'red', station: 2, team_id: T_2 },
        ],
      },
      ctx,
    );
    const kept = { ...ctx.matchTeams.get(`${match.id}:red:1`)! };
    const moved = { ...ctx.matchTeams.get(`${match.id}:red:2`)! };
    ctx.nowValue = new Date('2026-11-15T10:00:00.000Z');
    ctx.roster.set(EV_1, [T_1, T_2, T_3]);
    await setMatchTeams(
      admin,
      {
        match_id: match.id,
        slots: [
          { alliance: 'red', station: 1, team_id: T_1 },
          { alliance: 'red', station: 2, team_id: T_3 },
        ],
      },
      ctx,
    );
    expect(ctx.matchTeams.get(`${match.id}:red:1`)).toEqual(kept);
    const after = ctx.matchTeams.get(`${match.id}:red:2`)!;
    expect(after.id).toBe(moved.id);
    expect(after.team_id).toBe(T_3);
    expect(after.updated_at).toBe('2026-11-15T10:00:00.000Z');
  });

  it('names the team by number when it is not on the roster', async () => {
    const match = await one(1);
    await expect(
      setMatchTeams(
        admin,
        { match_id: match.id, slots: [{ alliance: 'red', station: 1, team_id: T_3 }] },
        ctx,
      ),
    ).rejects.toMatchObject({
      code: 'invalid',
      message: "team 1577 is not on this event's roster; add it to the roster first",
    });
  });

  it('refuses a team whose roster row was removed', async () => {
    const match = await one(1);
    await setEventRoster(admin, { event_id: EV_1, team_ids: [T_1] }, ctx);
    await expect(
      setMatchTeams(
        admin,
        { match_id: match.id, slots: [{ alliance: 'red', station: 1, team_id: T_2 }] },
        ctx,
      ),
    ).rejects.toThrow(/team 1690 is not on this event's roster/);
  });

  it('keeps an unchanged slot whose team has since left the roster', async () => {
    const match = await one(1);
    await setMatchTeams(
      admin,
      { match_id: match.id, slots: [{ alliance: 'red', station: 1, team_id: T_2 }] },
      ctx,
    );
    // Removing a team that still sits in a slot is allowed and leaves the slot alone.
    await setEventRoster(admin, { event_id: EV_1, team_ids: [T_1] }, ctx);
    expect(ctx.matchTeams.get(`${match.id}:red:1`)!.team_id).toBe(T_2);
    const result = await setMatchTeams(
      admin,
      {
        match_id: match.id,
        slots: [
          { alliance: 'red', station: 1, team_id: T_2 },
          { alliance: 'blue', station: 1, team_id: T_1 },
        ],
      },
      ctx,
    );
    expect(result.slots).toHaveLength(2);
  });

  it('refuses one station twice and one team twice', async () => {
    const match = await one(1);
    await expect(
      setMatchTeams(
        admin,
        {
          match_id: match.id,
          slots: [
            { alliance: 'red', station: 1, team_id: T_1 },
            { alliance: 'red', station: 1, team_id: T_2 },
          ],
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      setMatchTeams(
        admin,
        {
          match_id: match.id,
          slots: [
            { alliance: 'red', station: 1, team_id: T_1 },
            { alliance: 'blue', station: 2, team_id: T_1 },
          ],
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(ctx.matchTeams.size).toBe(0);
  });

  it('refuses a match that does not exist', async () => {
    await expect(setMatchTeams(admin, { match_id: NOPE, slots: [] }, ctx)).rejects.toMatchObject({
      code: 'not-found',
      message: 'that match does not exist; it may have been deleted',
    });
  });
});

describe('ensureMatch', () => {
  const ID = '00000000-0000-4000-8000-000000000050';

  it('lets every role call it, and refuses a service caller', async () => {
    await expect(
      ensureMatch(lead, { id: ID, event_id: EV_1, match_type: 'practice', number: 1 }, ctx),
    ).resolves.toEqual({ id: ID, created: true });
    await expect(
      ensureMatch(service, { id: ID, event_id: EV_1, match_type: 'practice', number: 1 }, ctx),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('refuses an event that does not exist, instead of failing on the foreign key', async () => {
    await expect(
      ensureMatch(scouter, { id: ID, event_id: NOPE, match_type: 'practice', number: 1 }, ctx),
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(ctx.matches.size).toBe(0);
  });

  it('returns the match that won a race, instead of a unique violation', async () => {
    const winner = '00000000-0000-4000-8000-000000000051';
    await ensureMatch(
      scouter,
      { id: winner, event_id: EV_1, match_type: 'qualification', number: 5 },
      ctx,
    );
    const find = ctx.store.findMatch.bind(ctx.store);
    let calls = 0;
    ctx.store.findMatch = async (...args) => (calls++ === 0 ? null : find(...args));
    await expect(
      ensureMatch(scouter, { id: ID, event_id: EV_1, match_type: 'qualification', number: 5 }, ctx),
    ).resolves.toEqual({ id: winner, created: false });
    expect(ctx.matches.size).toBe(1);
  });

  it('refuses a bad id, type or number, and an extra field', async () => {
    for (const input of [
      { id: 'm-1', event_id: EV_1, match_type: 'qualification', number: 1 },
      { id: ID, event_id: EV_1, match_type: 'final', number: 1 },
      { id: ID, event_id: EV_1, match_type: 'qualification', number: 0 },
      { id: ID, event_id: EV_1, match_type: 'qualification', number: 1.5 },
      { id: ID, event_id: EV_1, match_type: 'qualification', number: 1, team_id: T_1 },
    ]) {
      await expect(
        ensureMatch(scouter, input as never, ctx),
        JSON.stringify(input),
      ).rejects.toMatchObject({ code: 'invalid' });
    }
  });
});

describe('listMatches', () => {
  it('orders practice, qualification, playoff, then by number, with the slots', async () => {
    await one(2);
    await one(1, 'playoff');
    await one(10);
    await one(3, 'practice');
    const q2 = [...ctx.matches.values()].find((m) => m.number === 2)!;
    await setMatchTeams(
      admin,
      { match_id: q2.id, slots: [{ alliance: 'blue', station: 2, team_id: T_1 }] },
      ctx,
    );
    const page = await listMatches(scouter, { event_id: EV_1 }, ctx);
    expect(page.items.map((m) => `${m.match_type} ${m.number}`)).toEqual([
      'practice 3',
      'qualification 2',
      'qualification 10',
      'playoff 1',
    ]);
    expect(page.items[1]!.slots).toEqual([{ alliance: 'blue', station: 2, team_id: T_1 }]);
    expect(page.items[0]!.slots).toEqual([]);
    expect(page.next_cursor).toBeNull();
  });

  it('pages with an opaque cursor across the match types, with no gaps or repeats', async () => {
    await createMatch(admin, { event_id: EV_1, match_type: 'practice', count: 2 }, ctx);
    await createMatch(admin, { event_id: EV_1, match_type: 'qualification', count: 3 }, ctx);
    await createMatch(admin, { event_id: EV_1, match_type: 'playoff', count: 2 }, ctx);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i += 1) {
      const page = await listMatches(service, { event_id: EV_1, limit: 3, cursor }, ctx);
      seen.push(...page.items.map((m) => `${m.match_type[0]}${m.number}`));
      if (!page.next_cursor) break;
      cursor = page.next_cursor;
    }
    expect(seen).toEqual(['p1', 'p2', 'q1', 'q2', 'q3', 'p1', 'p2']);
  });

  it('lists only the given event', async () => {
    await one(1);
    await createMatch(admin, { event_id: EV_2, match_type: 'qualification', number: 1 }, ctx);
    const page = await listMatches(scouter, { event_id: EV_2 }, ctx);
    expect(page.items.map((m) => m.event_id)).toEqual([EV_2]);
  });

  it('refuses an unknown event and an unreadable cursor', async () => {
    await expect(listMatches(scouter, { event_id: NOPE }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(
      listMatches(scouter, { event_id: EV_1, cursor: 'not-a-cursor' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('clamps a limit above 200', async () => {
    await createMatch(admin, { event_id: EV_1, match_type: 'qualification', count: 200 }, ctx);
    await createMatch(admin, { event_id: EV_1, match_type: 'playoff', count: 5 }, ctx);
    const page = await listMatches(scouter, { event_id: EV_1, limit: 1000 }, ctx);
    expect(page.items).toHaveLength(200);
    expect(page.next_cursor).not.toBeNull();
  });
});
