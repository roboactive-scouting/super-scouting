import { describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import { deleteEvent, deleteSeason } from './deleteCompetition.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';

// Wire ids are uuids (the schemas are strict).
const SEASON = '11111111-1111-4111-8111-111111111111';
const SEASON_2 = '22222222-2222-4222-8222-222222222222';
const EVENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OTHER = 'eeeeeeee-eeee-4eee-8eee-000000000002';
const NOPE = '99999999-9999-4999-8999-999999999999';

const ADMIN: Caller = { kind: 'user', userId: 'u-admin', role: 'admin' };
const LEAD: Caller = { kind: 'user', userId: 'u-lead', role: 'lead' };
const SERVICE: Caller = { kind: 'service', label: 'mcp' };

const AT = '2026-11-01T00:00:00.000Z';

/**
 * The real fake context with season 2025 (SEASON) holding `events` (default: EVENT,
 * "District #2"), `matches` matches and `entries` live entries on the first event, and
 * `forms` forms; season 2026 (SEASON_2) holds OTHER. The singleton is set as given.
 */
function fakeWith(opts: {
  active_season_id?: string;
  active_event_id?: string;
  events?: { id: string; name: string }[];
  matches?: number;
  entries?: number;
  forms?: number;
}): FakeContext {
  const ctx = makeFakeContext();
  const season = (id: string, year: number) =>
    ctx.seasons.set(id, {
      id,
      year,
      game_name: 'G',
      field_image_path: 'p',
      created_at: AT,
      updated_at: AT,
    });
  season(SEASON, 2025);
  season(SEASON_2, 2026);
  const event = (id: string, seasonId: string, name: string, sort_order: number) =>
    ctx.events.set(id, {
      id,
      season_id: seasonId,
      name,
      code: null,
      sort_order,
      created_at: AT,
      updated_at: AT,
    });
  (opts.events ?? [{ id: EVENT, name: 'District #2' }]).forEach((e, i) =>
    event(e.id, SEASON, e.name, i + 1),
  );
  event(OTHER, SEASON_2, 'Elsewhere', 1);
  const first = [...ctx.events.values()][0]!.id;
  for (let n = 1; n <= (opts.matches ?? 0); n += 1) {
    ctx.rows.matches.set(`m-${n}`, {
      id: `m-${n}`,
      event_id: first,
      match_type: 'qualification',
      number: n,
    });
  }
  for (let n = 1; n <= (opts.entries ?? 0); n += 1) {
    ctx.rows.scouting_entries.set(`x-${n}`, {
      id: `x-${n}`,
      version: 1,
      event_id: first,
      match_id: 'm-1',
      deleted_at: null,
    });
  }
  for (let n = 1; n <= (opts.forms ?? 0); n += 1) {
    ctx.forms.set(`f-${n}`, { id: `f-${n}`, version: 1, season_id: SEASON });
  }
  ctx.setActiveContext(opts.active_season_id ?? null, opts.active_event_id ?? null);
  return ctx;
}

describe('deleteEvent (SPEC-FINAL 3.9, 17.8)', () => {
  it('refuses the active event', async () => {
    const ctx = fakeWith({ active_event_id: EVENT });
    await expect(deleteEvent(ADMIN, { event_id: EVENT, dry_run: true }, ctx)).rejects.toThrow(
      'Switch the default event first.',
    );
    expect(ctx.events.has(EVENT)).toBe(true);
  });

  it('dry run returns the damage; a wrong name refuses; the right name deletes', async () => {
    const ctx = fakeWith({
      active_event_id: OTHER,
      events: [{ id: EVENT, name: 'District #2' }],
      matches: 3,
      entries: 17,
    });
    expect(await deleteEvent(ADMIN, { event_id: EVENT, dry_run: true }, ctx)).toEqual({
      deleted: false,
      events: 1,
      matches: 3,
      entries: 17,
      forms: 0,
    });
    expect(ctx.events.has(EVENT)).toBe(true);
    await expect(
      deleteEvent(ADMIN, { event_id: EVENT, confirm_name: 'district #2' }, ctx),
    ).rejects.toThrow('Type the name exactly to delete.');
    expect(
      (await deleteEvent(ADMIN, { event_id: EVENT, confirm_name: 'District #2' }, ctx)).deleted,
    ).toBe(true);
    expect(ctx.events.has(EVENT)).toBe(false);
    expect(ctx.rows.matches.size).toBe(0);
    expect(ctx.rows.scouting_entries.size).toBe(0);
    expect(ctx.seasons.has(SEASON)).toBe(true);
  });

  it('refuses a missing name and a name with stray spaces', async () => {
    const ctx = fakeWith({});
    await expect(deleteEvent(ADMIN, { event_id: EVENT }, ctx)).rejects.toMatchObject({
      code: 'invalid',
      message: 'Type the name exactly to delete.',
    });
    await expect(
      deleteEvent(ADMIN, { event_id: EVENT, confirm_name: ' District #2' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(ctx.events.has(EVENT)).toBe(true);
  });

  it('counts live entries only: a soft-deleted one is already gone', async () => {
    const ctx = fakeWith({ entries: 2 });
    ctx.rows.scouting_entries.get('x-1')!.deleted_at = AT;
    expect((await deleteEvent(ADMIN, { event_id: EVENT, dry_run: true }, ctx)).entries).toBe(1);
  });

  it('a lead may not delete', async () => {
    await expect(
      deleteEvent(LEAD, { event_id: EVENT, dry_run: true }, fakeWith({})),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('refuses a service caller and an unknown event', async () => {
    await expect(
      deleteEvent(SERVICE, { event_id: EVENT, dry_run: true }, fakeWith({})),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      deleteEvent(ADMIN, { event_id: NOPE, dry_run: true }, fakeWith({})),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('deleteSeason (SPEC-FINAL 3.9, 17.8)', () => {
  it('refuses the active season, and a season holding the default event', async () => {
    await expect(
      deleteSeason(
        ADMIN,
        { season_id: SEASON, dry_run: true },
        fakeWith({ active_season_id: SEASON }),
      ),
    ).rejects.toThrow('Switch the active season first.');
    await expect(
      deleteSeason(
        ADMIN,
        { season_id: SEASON, dry_run: true },
        fakeWith({ active_season_id: SEASON_2, active_event_id: EVENT }),
      ),
    ).rejects.toMatchObject({ code: 'conflict', message: 'Switch the active season first.' });
  });

  it('dry run names the damage; the year typed back deletes the season and all it holds', async () => {
    const ctx = fakeWith({
      active_season_id: SEASON_2,
      active_event_id: OTHER,
      events: [
        { id: EVENT, name: 'District #2' },
        { id: NOPE, name: 'District #3' },
      ],
      matches: 4,
      entries: 9,
      forms: 2,
    });
    expect(await deleteSeason(ADMIN, { season_id: SEASON, dry_run: true }, ctx)).toEqual({
      deleted: false,
      events: 2,
      matches: 4,
      entries: 9,
      forms: 2,
    });
    await expect(
      deleteSeason(ADMIN, { season_id: SEASON, confirm_name: '2026' }, ctx),
    ).rejects.toThrow('Type the name exactly to delete.');
    expect(await deleteSeason(ADMIN, { season_id: SEASON, confirm_name: '2025' }, ctx)).toEqual({
      deleted: true,
      events: 2,
      matches: 4,
      entries: 9,
      forms: 2,
    });
    expect(ctx.seasons.has(SEASON)).toBe(false);
    expect([...ctx.events.keys()]).toEqual([OTHER]);
    expect(ctx.rows.matches.size + ctx.rows.scouting_entries.size + ctx.forms.size).toBe(0);
    expect(await ctx.store.getActiveContext()).toEqual({
      active_season_id: SEASON_2,
      active_event_id: OTHER,
    });
  });

  it('a lead may not delete', async () => {
    await expect(
      deleteSeason(LEAD, { season_id: SEASON, dry_run: true }, fakeWith({})),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
