import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import { createEvent, listEvents, reorderEvents, setActiveEvent, updateEvent } from './events.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';

// Wire ids are uuids (the schemas are strict), so the plan's 'se-1' / 'nope' are these.
const SE_1 = '11111111-1111-4111-8111-111111111111';
const SE_2 = '22222222-2222-4222-8222-222222222222';
const NOPE = '99999999-9999-4999-8999-999999999999';

const admin: Caller = { kind: 'user', userId: 'u-a', role: 'admin' };
const lead: Caller = { kind: 'user', userId: 'u-l', role: 'lead' };
const scouter: Caller = { kind: 'user', userId: 'u-s', role: 'scouter' };
const service: Caller = { kind: 'service', label: 'mcp' };

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  ctx.seasons.set(SE_1, {
    id: SE_1,
    year: 2026,
    game_name: 'X',
    field_image_path: 'seasons/2026/field.webp',
  } as never);
  ctx.seasons.set(SE_2, {
    id: SE_2,
    year: 2027,
    game_name: 'Y',
    field_image_path: 'seasons/2026/field.webp',
  } as never);
});

describe('events (SPEC-FINAL 6.2, 6.3)', () => {
  it('creates an event with the next sort_order in its season', async () => {
    const first = await createEvent(admin, { season_id: SE_1, name: 'Week 1' }, ctx);
    const second = await createEvent(admin, { season_id: SE_1, name: 'Week 3' }, ctx);
    expect(first.sort_order).toBe(1);
    expect(second.sort_order).toBe(2);
  });

  it('refuses two events with the same name in one season', async () => {
    await createEvent(admin, { season_id: SE_1, name: 'Week 1' }, ctx);
    await expect(
      createEvent(admin, { season_id: SE_1, name: 'Week 1' }, ctx),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: "this season already has an event named 'Week 1'",
    });
  });

  it('reorders events and changes nothing but sort_order', async () => {
    const a = await createEvent(admin, { season_id: SE_1, name: 'Week 1' }, ctx);
    const b = await createEvent(admin, { season_id: SE_1, name: 'Week 3' }, ctx);
    await reorderEvents(admin, { season_id: SE_1, event_ids: [b.id, a.id] }, ctx);
    expect(ctx.events.get(b.id)!.sort_order).toBe(1);
    expect(ctx.events.get(a.id)!.sort_order).toBe(2);
    expect(ctx.events.get(a.id)!.name).toBe('Week 1');
  });

  it('sets the active event and its season together, so the two can never disagree', async () => {
    const event = await createEvent(admin, { season_id: SE_2, name: 'Champs' }, ctx);
    const context = await setActiveEvent(admin, { event_id: event.id }, ctx);
    expect(context).toEqual({ active_season_id: SE_2, active_event_id: event.id });
  });

  it('reports not-found for an event that does not exist', async () => {
    await expect(setActiveEvent(admin, { event_id: NOPE }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('lists events in sort_order, which is what makes the season slope view read left to right', async () => {
    const a = await createEvent(admin, { season_id: SE_1, name: 'Week 1' }, ctx);
    const b = await createEvent(admin, { season_id: SE_1, name: 'Week 3' }, ctx);
    await reorderEvents(admin, { season_id: SE_1, event_ids: [b.id, a.id] }, ctx);
    const listed = await listEvents(admin, { season_id: SE_1 }, ctx);
    expect(listed.items.map((e) => e.name)).toEqual(['Week 3', 'Week 1']);
  });
});

describe('createEvent', () => {
  it('numbers each season on its own, and allows one name in two seasons', async () => {
    await createEvent(admin, { season_id: SE_1, name: 'Week 1' }, ctx);
    const other = await createEvent(admin, { season_id: SE_2, name: 'Week 1' }, ctx);
    expect(other.sort_order).toBe(1);
  });

  it('goes after the highest sort_order, not after the count, once events were reordered', async () => {
    const a = await createEvent(admin, { season_id: SE_1, name: 'A' }, ctx);
    ctx.events.set(a.id, { ...ctx.events.get(a.id)!, sort_order: 7 });
    expect((await createEvent(admin, { season_id: SE_1, name: 'B' }, ctx)).sort_order).toBe(8);
  });

  it('trims the name, and returns the row with a null code', async () => {
    const event = await createEvent(admin, { season_id: SE_1, name: '  Week 1 ' }, ctx);
    expect(event).toMatchObject({ season_id: SE_1, name: 'Week 1', code: null });
  });

  it('reports not-found for a season that does not exist', async () => {
    await expect(createEvent(admin, { season_id: NOPE, name: 'W' }, ctx)).rejects.toMatchObject({
      code: 'not-found',
      message: 'that season does not exist; it may have been deleted',
    });
  });

  it('turns a unique violation that raced past the pre-check into conflict, not a 500', async () => {
    await createEvent(admin, { season_id: SE_1, name: 'Week 1' }, ctx);
    const realList = ctx.store.listEvents;
    ctx.store.listEvents = async () => []; // another admin created it in between
    await expect(
      createEvent(admin, { season_id: SE_1, name: 'Week 1' }, ctx),
    ).rejects.toMatchObject({ code: 'conflict' });
    ctx.store.listEvents = realList;
  });
});

describe('updateEvent (a rename)', () => {
  it('renames, and keeps the order and the season', async () => {
    const a = await createEvent(admin, { season_id: SE_1, name: 'Week 1' }, ctx);
    const renamed = await updateEvent(admin, { event_id: a.id, name: 'District 1' }, ctx);
    expect(renamed).toMatchObject({ name: 'District 1', sort_order: 1, season_id: SE_1 });
  });

  it('refuses a name another event of the season holds, but not its own', async () => {
    const a = await createEvent(admin, { season_id: SE_1, name: 'Week 1' }, ctx);
    await createEvent(admin, { season_id: SE_1, name: 'Week 3' }, ctx);
    await expect(updateEvent(admin, { event_id: a.id, name: 'Week 3' }, ctx)).rejects.toMatchObject(
      { code: 'conflict', message: "this season already has an event named 'Week 3'" },
    );
    await expect(
      updateEvent(admin, { event_id: a.id, name: 'Week 1' }, ctx),
    ).resolves.toMatchObject({ name: 'Week 1' });
  });

  it('refuses to reorder or move an event: that is reorderEvents, and never', async () => {
    const a = await createEvent(admin, { season_id: SE_1, name: 'Week 1' }, ctx);
    await expect(
      updateEvent(admin, { event_id: a.id, name: 'W', sort_order: 5 } as never, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      updateEvent(admin, { event_id: a.id, name: 'W', season_id: SE_2 } as never, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(ctx.events.get(a.id)).toMatchObject({ name: 'Week 1', season_id: SE_1 });
  });

  it('reports not-found for an event that does not exist', async () => {
    await expect(updateEvent(admin, { event_id: NOPE, name: 'W' }, ctx)).rejects.toMatchObject({
      code: 'not-found',
      message: 'that event does not exist; it may have been deleted',
    });
  });
});

describe('reorderEvents (SPEC-FINAL 6.2)', () => {
  it('refuses a list that is not exactly the season’s events, and writes nothing', async () => {
    const a = await createEvent(admin, { season_id: SE_1, name: 'A' }, ctx);
    const b = await createEvent(admin, { season_id: SE_1, name: 'B' }, ctx);
    const elsewhere = await createEvent(admin, { season_id: SE_2, name: 'C' }, ctx);
    for (const event_ids of [
      [a.id], // missing one
      [a.id, a.id], // a duplicate
      [a.id, b.id, a.id], // a duplicate and too long
      [b.id, elsewhere.id], // an event of another season
      [b.id, NOPE], // an event that does not exist
    ]) {
      await expect(
        reorderEvents(admin, { season_id: SE_1, event_ids }, ctx),
        JSON.stringify(event_ids),
      ).rejects.toMatchObject({
        code: 'invalid',
        message:
          'the new order must name every event in this season exactly once (it has 2); reload the events and try again',
      });
    }
    expect(ctx.events.get(a.id)!.sort_order).toBe(1);
    expect(ctx.events.get(b.id)!.sort_order).toBe(2);
  });

  it('writes sort_order and nothing else, and only on events that moved', async () => {
    const a = await createEvent(admin, { season_id: SE_1, name: 'A' }, ctx);
    const b = await createEvent(admin, { season_id: SE_1, name: 'B' }, ctx);
    const c = await createEvent(admin, { season_id: SE_1, name: 'C' }, ctx);
    const patches: [string, Record<string, unknown>][] = [];
    const realUpdate = ctx.store.updateEvent;
    ctx.store.updateEvent = async (id, patch) => {
      patches.push([id, patch]);
      return realUpdate(id, patch);
    };
    const result = await reorderEvents(
      admin,
      { season_id: SE_1, event_ids: [c.id, b.id, a.id] },
      ctx,
    );
    expect(patches).toEqual([
      [c.id, { sort_order: 1 }],
      [a.id, { sort_order: 3 }],
    ]);
    expect(result.items.map((e) => [e.name, e.sort_order])).toEqual([
      ['C', 1],
      ['B', 2],
      ['A', 3],
    ]);
  });

  it('reports not-found for a season that does not exist', async () => {
    await expect(
      reorderEvents(admin, { season_id: NOPE, event_ids: [] }, ctx),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('the event commands are admin only', () => {
  it('refuses each to a lead and to a service caller', async () => {
    const a = await createEvent(admin, { season_id: SE_1, name: 'A' }, ctx);
    for (const caller of [lead, scouter, service]) {
      await expect(createEvent(caller, { season_id: SE_1, name: 'B' }, ctx)).rejects.toMatchObject({
        code: 'forbidden',
      });
      await expect(updateEvent(caller, { event_id: a.id, name: 'B' }, ctx)).rejects.toMatchObject({
        code: 'forbidden',
      });
      await expect(
        reorderEvents(caller, { season_id: SE_1, event_ids: [a.id] }, ctx),
      ).rejects.toMatchObject({ code: 'forbidden' });
      await expect(setActiveEvent(caller, { event_id: a.id }, ctx)).rejects.toMatchObject({
        code: 'forbidden',
      });
    }
  });
});

describe('listEvents (a query: every role and a service caller)', () => {
  it('may be called by every role and by a service caller', async () => {
    await createEvent(admin, { season_id: SE_1, name: 'Week 1' }, ctx);
    for (const caller of [scouter, lead, admin, service]) {
      const listed = await listEvents(caller, { season_id: SE_1 }, ctx);
      expect(
        listed.items.map((e) => e.name),
        caller.kind,
      ).toEqual(['Week 1']);
    }
  });

  it('lists only that season', async () => {
    await createEvent(admin, { season_id: SE_1, name: 'Week 1' }, ctx);
    await createEvent(admin, { season_id: SE_2, name: 'Champs' }, ctx);
    const listed = await listEvents(scouter, { season_id: SE_2 }, ctx);
    expect(listed.items.map((e) => e.name)).toEqual(['Champs']);
  });

  it('breaks a sort_order tie by id, and pages with no gap and no repeat', async () => {
    const ids = [
      '30000000-0000-4000-8000-000000000000',
      '10000000-0000-4000-8000-000000000000',
      '20000000-0000-4000-8000-000000000000',
    ];
    for (const id of ids) {
      ctx.events.set(id, {
        id,
        season_id: SE_1,
        name: id,
        code: null,
        sort_order: 1,
        created_at: 'x',
        updated_at: 'x',
      });
    }
    const first = await listEvents(scouter, { season_id: SE_1, limit: 2 }, ctx);
    expect(first.items.map((e) => e.id)).toEqual([ids[1], ids[2]]);
    const second = await listEvents(
      scouter,
      { season_id: SE_1, limit: 2, cursor: first.next_cursor! },
      ctx,
    );
    expect(second.items.map((e) => e.id)).toEqual([ids[0]]);
    expect(second.next_cursor).toBeNull();
  });

  it('reports not-found for a season that does not exist, rather than an empty list', async () => {
    await expect(listEvents(scouter, { season_id: NOPE }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('refuses a cursor whose content is not a sort_order and a uuid', async () => {
    const forged = Buffer.from(JSON.stringify({ s: 1, i: 'x),id.gt.(' }), 'utf8').toString(
      'base64url',
    );
    await expect(
      listEvents(scouter, { season_id: SE_1, cursor: forged }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('the fake refuses a column events does not have', () => {
  it('fails on a phantom `version` the way PostgREST would', async () => {
    await expect(
      ctx.store.insertEvent({ id: NOPE, season_id: SE_1, name: 'A', sort_order: 1, version: 1 }),
    ).rejects.toThrow("Could not find the 'version' column of 'events' in the schema cache");
  });
});
