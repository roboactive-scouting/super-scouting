import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import { createTeam, listTeams, setEventRoster, updateTeam } from './teams.js';
import { listEventRoster } from '../queries/roster.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';

// Wire ids are uuids (the schemas are strict), so the plan's 'ev-1' / 't-1' are these.
const SE_1 = '11111111-1111-4111-8111-111111111111';
const EV_1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const EV_2 = 'eeeeeeee-eeee-4eee-8eee-000000000002';
const T_1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const NOPE = '99999999-9999-4999-8999-999999999999';

const admin: Caller = { kind: 'user', userId: 'u-a', role: 'admin' };
const lead: Caller = { kind: 'user', userId: 'u-l', role: 'lead' };
const scouter: Caller = { kind: 'user', userId: 'u-s', role: 'scouter' };
const service: Caller = { kind: 'service', label: 'mcp' };

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  ctx.events.set(EV_1, { id: EV_1, season_id: SE_1, name: 'E', sort_order: 1 } as never);
  ctx.events.set(EV_2, { id: EV_2, season_id: SE_1, name: 'F', sort_order: 2 } as never);
});

describe('teams and the event roster (SPEC-FINAL 6.4, 3.1)', () => {
  it('creates a team from a number and a name', async () => {
    const team = await createTeam(admin, { number: 2096, name: 'ROBACTIVE' }, ctx);
    expect(ctx.teams.get(team.id)).toMatchObject({ number: 2096, name: 'ROBACTIVE' });
  });

  it('keeps team numbers globally unique', async () => {
    await createTeam(admin, { number: 2096, name: 'ROBACTIVE' }, ctx);
    await expect(createTeam(admin, { number: 2096, name: 'Clone' }, ctx)).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('edits the name and never the number, because a team number is permanent', async () => {
    const team = await createTeam(admin, { number: 2096, name: 'Robactive' }, ctx);
    await updateTeam(admin, { team_id: team.id, name: 'ROBACTIVE' }, ctx);
    expect(ctx.teams.get(team.id)!.name).toBe('ROBACTIVE');
    await expect(
      updateTeam(admin, { team_id: team.id, number: 1 } as never, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('adds teams to the roster and lists them', async () => {
    const a = await createTeam(admin, { number: 2096, name: 'A' }, ctx);
    const b = await createTeam(admin, { number: 1577, name: 'B' }, ctx);
    await setEventRoster(admin, { event_id: EV_1, team_ids: [a.id, b.id] }, ctx);
    const roster = await listEventRoster(admin, { event_id: EV_1 }, ctx);
    expect(roster.items.map((r) => r.team_id).sort()).toEqual([a.id, b.id].sort());
  });

  it('soft-deletes a removal so the tombstone propagates through sync', async () => {
    const a = await createTeam(admin, { number: 2096, name: 'A' }, ctx);
    await setEventRoster(admin, { event_id: EV_1, team_ids: [a.id] }, ctx);
    await setEventRoster(admin, { event_id: EV_1, team_ids: [] }, ctx);
    const row = [...ctx.eventTeams.values()].find((r) => r.team_id === a.id)!;
    expect(row.deleted_at).not.toBeNull();
    expect((await listEventRoster(admin, { event_id: EV_1 }, ctx)).items).toEqual([]);
  });

  it('clears the tombstone when a removed team is added back, rather than making a second row', async () => {
    const a = await createTeam(admin, { number: 2096, name: 'A' }, ctx);
    await setEventRoster(admin, { event_id: EV_1, team_ids: [a.id] }, ctx);
    await setEventRoster(admin, { event_id: EV_1, team_ids: [] }, ctx);
    await setEventRoster(admin, { event_id: EV_1, team_ids: [a.id] }, ctx);
    const rows = [...ctx.eventTeams.values()].filter((r) => r.team_id === a.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deleted_at).toBeNull();
  });

  it('refuses all three to a lead', async () => {
    await expect(createTeam(lead, { number: 1, name: 'X' }, ctx)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(updateTeam(lead, { team_id: T_1, name: 'X' }, ctx)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(setEventRoster(lead, { event_id: EV_1, team_ids: [] }, ctx)).rejects.toMatchObject(
      { code: 'forbidden' },
    );
  });
});

describe('createTeam and updateTeam', () => {
  it('returns the team, with its name trimmed', async () => {
    const team = await createTeam(admin, { number: 2096, name: '  ROBACTIVE ' }, ctx);
    expect(team).toMatchObject({ number: 2096, name: 'ROBACTIVE' });
    expect(Object.keys(team).sort()).toEqual(['created_at', 'id', 'name', 'number', 'updated_at']);
  });

  it('names the number in the refusal, and reads a race as conflict', async () => {
    await createTeam(admin, { number: 2096, name: 'A' }, ctx);
    await expect(createTeam(admin, { number: 2096, name: 'B' }, ctx)).rejects.toMatchObject({
      code: 'conflict',
      message: 'team 2096 already exists',
    });
    ctx.store.getTeamByNumber = async () => null; // the pre-check loses the race
    await expect(createTeam(admin, { number: 2096, name: 'B' }, ctx)).rejects.toMatchObject({
      code: 'conflict',
      message: 'team 2096 already exists',
    });
  });

  it('refuses a number outside 1..99999 and a blank or overlong name', async () => {
    for (const input of [
      { number: 0, name: 'X' },
      { number: 100000, name: 'X' },
      { number: 1.5, name: 'X' },
      { number: 1, name: '   ' },
      { number: 1, name: 'x'.repeat(81) },
      { number: 1, name: 'X', id: T_1 },
    ]) {
      await expect(
        createTeam(admin, input as never, ctx),
        JSON.stringify(input),
      ).rejects.toMatchObject({ code: 'invalid' });
    }
    expect(ctx.teams.size).toBe(0);
  });

  it('refuses to rename a team that does not exist', async () => {
    await expect(updateTeam(admin, { team_id: NOPE, name: 'X' }, ctx)).rejects.toMatchObject({
      code: 'not-found',
      message: 'that team does not exist; it may have been deleted',
    });
  });

  it('refuses a service caller', async () => {
    await expect(createTeam(service, { number: 1, name: 'X' }, ctx)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('setEventRoster', () => {
  it('returns the live roster in team-number order', async () => {
    const a = await createTeam(admin, { number: 2096, name: 'A' }, ctx);
    const b = await createTeam(admin, { number: 1577, name: 'B' }, ctx);
    const result = await setEventRoster(admin, { event_id: EV_1, team_ids: [a.id, b.id] }, ctx);
    expect(result).toEqual({
      items: [
        { team_id: b.id, number: 1577, name: 'B' },
        { team_id: a.id, number: 2096, name: 'A' },
      ],
    });
  });

  it('never rewrites a row that did not change', async () => {
    const a = await createTeam(admin, { number: 2096, name: 'A' }, ctx);
    const b = await createTeam(admin, { number: 1577, name: 'B' }, ctx);
    await setEventRoster(admin, { event_id: EV_1, team_ids: [a.id] }, ctx);
    const before = { ...[...ctx.eventTeams.values()].find((r) => r.team_id === a.id)! };
    ctx.nowValue = new Date('2026-11-15T10:00:00.000Z');
    await setEventRoster(admin, { event_id: EV_1, team_ids: [a.id, b.id] }, ctx);
    expect([...ctx.eventTeams.values()].find((r) => r.team_id === a.id)).toEqual(before);
  });

  it('stamps a removal with the server clock', async () => {
    const a = await createTeam(admin, { number: 2096, name: 'A' }, ctx);
    await setEventRoster(admin, { event_id: EV_1, team_ids: [a.id] }, ctx);
    ctx.nowValue = new Date('2026-11-15T10:00:00.000Z');
    await setEventRoster(admin, { event_id: EV_1, team_ids: [] }, ctx);
    expect([...ctx.eventTeams.values()][0]!.deleted_at).toBe('2026-11-15T10:00:00.000Z');
  });

  it('keeps each event its own roster', async () => {
    const a = await createTeam(admin, { number: 2096, name: 'A' }, ctx);
    await setEventRoster(admin, { event_id: EV_1, team_ids: [a.id] }, ctx);
    await setEventRoster(admin, { event_id: EV_2, team_ids: [] }, ctx);
    expect((await listEventRoster(scouter, { event_id: EV_1 }, ctx)).items).toHaveLength(1);
  });

  it('refuses an unknown team and changes nothing', async () => {
    const a = await createTeam(admin, { number: 2096, name: 'A' }, ctx);
    await setEventRoster(admin, { event_id: EV_1, team_ids: [a.id] }, ctx);
    await expect(
      setEventRoster(admin, { event_id: EV_1, team_ids: [NOPE] }, ctx),
    ).rejects.toMatchObject({
      code: 'not-found',
      message: 'that team does not exist; it may have been deleted',
    });
    expect((await listEventRoster(scouter, { event_id: EV_1 }, ctx)).items).toHaveLength(1);
  });

  it('refuses an unknown event, a duplicate team and more than 200 teams', async () => {
    const a = await createTeam(admin, { number: 2096, name: 'A' }, ctx);
    await expect(
      setEventRoster(admin, { event_id: NOPE, team_ids: [a.id] }, ctx),
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(
      setEventRoster(admin, { event_id: EV_1, team_ids: [a.id, a.id] }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
    const many = Array.from(
      { length: 201 },
      (_, i) => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    await expect(
      setEventRoster(admin, { event_id: EV_1, team_ids: many }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(ctx.eventTeams.size).toBe(0);
  });
});

describe('listEventRoster', () => {
  it('lets every role and a service caller read it, and refuses an unknown event', async () => {
    const a = await createTeam(admin, { number: 2096, name: 'A' }, ctx);
    await setEventRoster(admin, { event_id: EV_1, team_ids: [a.id] }, ctx);
    for (const caller of [scouter, lead, service]) {
      expect((await listEventRoster(caller, { event_id: EV_1 }, ctx)).items).toEqual([
        { team_id: a.id, number: 2096, name: 'A' },
      ]);
    }
    await expect(listEventRoster(scouter, { event_id: NOPE }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('listTeams', () => {
  beforeEach(async () => {
    for (const [number, name] of [
      [2096, 'RoboActive'],
      [20, 'The Rocketeers'],
      [1577, 'Steampunk'],
      [120, 'Cleveland'],
      [5990, '100% TRIGON'],
      [3339, 'Bumblebee'],
    ] as const) {
      await createTeam(admin, { number, name }, ctx);
    }
  });

  it('lists every team by number, for every role and a service caller', async () => {
    const page = await listTeams(service, {}, ctx);
    expect(page.items.map((t) => t.number)).toEqual([20, 120, 1577, 2096, 3339, 5990]);
    expect(page.next_cursor).toBeNull();
  });

  it('matches a number prefix or a case-insensitive name substring', async () => {
    const numbers = async (query: string) =>
      (await listTeams(scouter, { query }, ctx)).items.map((t) => t.number);
    expect(await numbers('20')).toEqual([20, 2096]);
    expect(await numbers('roc')).toEqual([20]);
    expect(await numbers('ACTIVE')).toEqual([2096]);
    expect(await numbers('  steam ')).toEqual([1577]);
    expect(await numbers('bee')).toEqual([3339]);
  });

  it('reads LIKE wildcards in the query literally', async () => {
    const numbers = async (query: string) =>
      (await listTeams(scouter, { query }, ctx)).items.map((t) => t.number);
    expect(await numbers('%')).toEqual([5990]);
    expect(await numbers('_')).toEqual([]);
    expect(await numbers('0%')).toEqual([5990]);
  });

  it('pages with an opaque cursor', async () => {
    const first = await listTeams(scouter, { limit: 4 }, ctx);
    expect(first.items.map((t) => t.number)).toEqual([20, 120, 1577, 2096]);
    const second = await listTeams(scouter, { limit: 4, cursor: first.next_cursor! }, ctx);
    expect(second.items.map((t) => t.number)).toEqual([3339, 5990]);
    expect(second.next_cursor).toBeNull();
  });

  it('refuses an unreadable cursor and an overlong query', async () => {
    await expect(listTeams(scouter, { cursor: 'nope' }, ctx)).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(listTeams(scouter, { query: 'x'.repeat(81) }, ctx)).rejects.toMatchObject({
      code: 'invalid',
    });
  });
});
