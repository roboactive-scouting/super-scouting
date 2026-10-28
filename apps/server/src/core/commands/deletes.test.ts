import { beforeEach, describe, expect, it } from 'vitest';
import {
  PARENT_DELETED_DETAIL,
  SWITCH_EVENT_FIRST,
  SWITCH_SEASON_FIRST,
  TYPE_NAME_EXACTLY,
  type Caller,
  type Operation,
} from '@frc/shared';
import {
  deleteEntry,
  deleteEvent,
  deleteForm,
  deleteFormVersion,
  deleteMatch,
  deleteSeason,
} from './deletes.js';
import { syncPush } from './syncPush.js';
import { getDeleteImpact } from '../queries/deleteImpact.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';

// Task 1.60 (SPEC-FINAL 3.9, 17.8). The plan's test, adapted: the wire ids are uuids (the
// delete schemas are strict), so the fixture is this file's own rather than the
// browse-and-search one, with the plan's shape — one season, two events, four matches,
// twelve entries, the match form in two versions.

const admin: Caller = { kind: 'user', userId: 'u-admin', role: 'admin' };
const lead: Caller = { kind: 'user', userId: 'u-lead', role: 'lead' };
const scouter: Caller = { kind: 'user', userId: 'u-scouter', role: 'scouter' };
const service: Caller = { kind: 'service', label: 'mcp' };

const id = (n: number) => `00000000-0000-4000-8000-1600000000${String(n).padStart(2, '0')}`;
const S = id(1); // season 1999, active
const S2 = id(2); // season 2000, to switch the active context to
const E1 = id(3); // "Seed District Event", the default event
const E2 = id(4); // "Second Event"
const M1 = id(5); // E1 Q1: 3 entries, slots red 1, red 2, blue 1
const M2 = id(6); // E1 Q2: 3 entries
const M3 = id(7); // E2 Q1: 3 entries, all on v1
const M4 = id(8); // E2 Q2: 2 entries
const F = id(9); // "Seed match form": v1, v2 (active), both published
const V1 = id(10);
const V2 = id(11);
const FS = id(12); // "Seed super form": one published version
const VS = id(13);
const T = [id(20), id(21), id(22), id(23), id(24), id(25)]; // teams 9001..9006
const NOPE = id(99);
const entryId = (n: number) => `00000000-0000-4000-8000-16000000e0${String(n).padStart(2, '0')}`;
const E = (n: number) => entryId(n);

const AT = '2026-11-01T09:00:00.000Z';
const at = (minute: number) => new Date(Date.UTC(2026, 10, 14, 8, minute)).toISOString();

let ctx: FakeContext;

function seedDeleteSeason(c: FakeContext): void {
  const season = (sid: string, year: number) =>
    c.seasons.set(sid, {
      id: sid,
      year,
      game_name: 'SEED GAME',
      field_image_path: 'p',
      created_at: AT,
      updated_at: AT,
    });
  season(S, 1999);
  season(S2, 2000);
  const event = (eid: string, name: string, sort_order: number) =>
    c.events.set(eid, {
      id: eid,
      season_id: S,
      name,
      code: null,
      sort_order,
      created_at: AT,
      updated_at: AT,
    });
  event(E1, 'Seed District Event', 1);
  event(E2, 'Second Event', 2);
  c.setActiveContext(S, E1);
  T.forEach((tid, i) =>
    c.teams.set(tid, { id: tid, number: 9001 + i, name: `T${i}`, created_at: AT, updated_at: AT }),
  );
  const match = (mid: string, event_id: string, number: number) =>
    c.matches.set(mid, { id: mid, event_id, match_type: 'qualification', number });
  match(M1, E1, 1);
  match(M2, E1, 2);
  match(M3, E2, 1);
  match(M4, E2, 2);
  const form = (fid: string, kind: 'match' | 'super', name: string, active: string) =>
    c.forms.set(fid, {
      id: fid,
      version: 1,
      season_id: S,
      kind,
      name,
      active_version_id: active,
      timer_config: { phases: [] },
      created_at: AT,
      updated_at: AT,
    });
  form(F, 'match', 'Seed match form', V2);
  form(FS, 'super', 'Seed super form', VS);
  const version = (vid: string, form_id: string, version_no: number, published = true) =>
    c.formVersions.set(vid, {
      id: vid,
      version: 1,
      form_id,
      version_no,
      published_at: published ? AT : null,
      is_locked: published,
      updated_by: null,
      created_at: AT,
      updated_at: AT,
    });
  version(V1, F, 1);
  version(V2, F, 2);
  version(VS, FS, 1);
  c.scoringRules.set(`${F}:auto_notes`, {
    id: id(30),
    version: 1,
    form_id: F,
    field_key: 'auto_notes',
    points: 2,
  });
  let n = 0;
  const entry = (match_id: string | null, team: number, over: Record<string, unknown> = {}) => {
    n += 1;
    const m = match_id ? c.matches.get(match_id)! : null;
    c.rows.scouting_entries.set(E(n), {
      id: E(n),
      version: 1,
      form_version_id: V2,
      form_kind: 'match',
      event_id: m ? m.event_id : E2,
      match_id,
      team_id: T[team],
      alliance: team < 3 ? 'red' : 'blue',
      scouter_id: 'u-scouter',
      robot_status: 'played',
      breakdown_seconds: null,
      data: {},
      created_at: at(n),
      updated_at: at(n),
      client_created_at: at(n),
      client_updated_at: at(n),
      deleted_at: null,
      ...over,
    });
  };
  entry(M1, 0); // e01: Q1 red 1 (9001)
  entry(M1, 1); // e02: Q1 red 2 (9002)
  entry(M1, 3); // e03: Q1 blue 1 (9004)
  entry(M2, 0);
  entry(M2, 1);
  entry(M2, 3);
  entry(M3, 0, { form_version_id: V1 }); // e07..e09 on the retired v1
  entry(M3, 1, { form_version_id: V1 });
  entry(M3, 3, { form_version_id: V1 });
  entry(M4, 0);
  entry(M4, 1); // e11
  // e12: a super entry at E2, on the super form (no match).
  entry(null, 2, {
    form_version_id: VS,
    form_kind: 'super',
    alliance: null,
    robot_status: null,
  });
}

beforeEach(async () => {
  ctx = makeFakeContext();
  seedDeleteSeason(ctx);
  await ctx.store.setMatchTeams(
    M1,
    [
      { alliance: 'red', station: 1, team_id: T[0]! },
      { alliance: 'red', station: 2, team_id: T[1]! },
      { alliance: 'blue', station: 1, team_id: T[3]! },
    ],
    AT,
  );
});

/** Every row count the fixture holds, so "deletes nothing" is one comparison. */
const sizes = () => ({
  seasons: ctx.seasons.size,
  events: ctx.events.size,
  matches: ctx.matches.size,
  entries: ctx.rows.scouting_entries.size,
  live: [...ctx.rows.scouting_entries.values()].filter((r) => r.deleted_at == null).length,
  forms: ctx.forms.size,
  versions: ctx.formVersions.size,
  rules: ctx.scoringRules.size,
  slots: ctx.matchTeams.size,
});

describe('getDeleteImpact (SPEC-FINAL 3.9, 17.8): the exact damage, counted on the server', () => {
  it('reports the exact damage of a season before anything is deleted, blocked while active', async () => {
    const impact = await getDeleteImpact(admin, { kind: 'season', id: S }, ctx);
    expect(impact).toEqual({
      kind: 'season',
      id: S,
      name: '1999',
      confirm_name: null,
      blocked_reason: 'active_season',
      blocked_message: 'Switch the active season first.',
      events: 2,
      event_names: ['Seed District Event', 'Second Event'],
      matches: 4,
      entries: 12,
      match_entries: 11,
      super_entries: 1,
      deleted_entries: 0,
      forms: 2,
      form_versions: 3,
      metrics: 0,
      dashboards: 0,
      weight_presets: 0,
      stations: null,
      last_saved_at: null,
    });
    expect(ctx.rows.scouting_entries.size).toBe(12);
  });

  it('names the year to type once the season is no longer active, and counts soft-deleted entries as going', async () => {
    ctx.setActiveContext(S2, null);
    ctx.softDelete(E(4));
    expect(await getDeleteImpact(admin, { kind: 'season', id: S }, ctx)).toMatchObject({
      confirm_name: '1999',
      blocked_reason: null,
      blocked_message: null,
      entries: 12,
      deleted_entries: 1,
    });
  });

  it('blocks the default event with the exact text, and counts another event', async () => {
    expect(await getDeleteImpact(admin, { kind: 'event', id: E1 }, ctx)).toMatchObject({
      name: 'Seed District Event',
      confirm_name: null,
      blocked_reason: 'default_event',
      blocked_message: 'Switch the default event first.',
      events: 1,
      matches: 2,
      entries: 6,
    });
    expect(await getDeleteImpact(admin, { kind: 'event', id: E2 }, ctx)).toMatchObject({
      name: 'Second Event',
      confirm_name: 'Second Event',
      blocked_reason: null,
      events: 1,
      event_names: ['Second Event'],
      matches: 2,
      entries: 6,
      match_entries: 5,
      super_entries: 1,
      forms: 0,
      form_versions: 0,
    });
  });

  it('counts a form: its versions and every entry bound to any of them', async () => {
    expect(await getDeleteImpact(admin, { kind: 'form', id: F }, ctx)).toMatchObject({
      name: 'Seed match form',
      confirm_name: 'Seed match form',
      blocked_reason: null,
      forms: 1,
      form_versions: 2,
      entries: 11,
      super_entries: 0,
      events: 0,
      matches: 0,
    });
  });

  it('blocks a form version with entries bound to it, and offers a draft with none for typing', async () => {
    expect(await getDeleteImpact(admin, { kind: 'form_version', id: V1 }, ctx)).toMatchObject({
      name: 'v1',
      confirm_name: null,
      blocked_reason: 'version_has_entries',
      blocked_message:
        'this version has 3 entries bound to it and cannot be deleted; delete the form to remove them, or leave it',
      form_versions: 1,
      entries: 3,
    });
    ctx.softDelete(E(7));
    ctx.softDelete(E(8));
    ctx.softDelete(E(9));
    // soft-deleted entries are still bound: still blocked
    expect(await getDeleteImpact(admin, { kind: 'form_version', id: V1 }, ctx)).toMatchObject({
      blocked_reason: 'version_has_entries',
      entries: 3,
      deleted_entries: 3,
    });
    const draft = id(40);
    ctx.formVersions.set(draft, { ...ctx.formVersions.get(V2)!, id: draft, version_no: 3 });
    ctx.formVersions.get(draft)!.published_at = null;
    expect(await getDeleteImpact(admin, { kind: 'form_version', id: draft }, ctx)).toMatchObject({
      name: 'v3',
      confirm_name: 'v3',
      blocked_reason: null,
      entries: 0,
    });
  });

  it('blocks a published version with no entries on the server (Phase 1 D review #2)', async () => {
    const old = id(41);
    ctx.formVersions.set(old, { ...ctx.formVersions.get(V1)!, id: old, version_no: 4 });
    expect(await getDeleteImpact(admin, { kind: 'form_version', id: old }, ctx)).toMatchObject({
      confirm_name: null,
      blocked_reason: 'version_published',
      entries: 0,
    });
  });

  it("counts a match's entries by station, soft-deleted ones included, and names its label", async () => {
    ctx.softDelete(E(2));
    expect(await getDeleteImpact(admin, { kind: 'match', id: M1 }, ctx)).toMatchObject({
      name: 'Q1',
      confirm_name: 'Q1',
      blocked_reason: null,
      matches: 1,
      entries: 3,
      match_entries: 3,
      deleted_entries: 1,
      stations: [
        { alliance: 'red', station: 1, team_number: 9001, entries: 1 },
        { alliance: 'red', station: 2, team_number: 9002, entries: 1 },
        { alliance: 'red', station: 3, team_number: null, entries: 0 },
        { alliance: 'blue', station: 1, team_number: 9004, entries: 1 },
        { alliance: 'blue', station: 2, team_number: null, entries: 0 },
        { alliance: 'blue', station: 3, team_number: null, entries: 0 },
      ],
      last_saved_at: at(3),
    });
  });

  it('gives a match with no entries nothing to type (Are you sure?)', async () => {
    const empty = id(42);
    ctx.matches.set(empty, { id: empty, event_id: E1, match_type: 'playoff', number: 3 });
    expect(await getDeleteImpact(admin, { kind: 'match', id: empty }, ctx)).toMatchObject({
      name: 'PO3',
      confirm_name: null,
      blocked_reason: null,
      entries: 0,
      last_saved_at: null,
    });
  });

  it('names one entry for a lead or an admin, with nothing to type', async () => {
    for (const caller of [lead, admin]) {
      expect(await getDeleteImpact(caller, { kind: 'entry', id: E(1) }, ctx)).toMatchObject({
        kind: 'entry',
        name: 'Q1 · 9001',
        confirm_name: null,
        blocked_reason: null,
        entries: 1,
        match_entries: 1,
      });
    }
    expect(await getDeleteImpact(lead, { kind: 'entry', id: E(12) }, ctx)).toMatchObject({
      name: '9003',
      super_entries: 1,
    });
    ctx.softDelete(E(1));
    await expect(getDeleteImpact(lead, { kind: 'entry', id: E(1) }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('refuses a lead every kind but an entry, a scouter and a service caller every kind', async () => {
    const targets = [
      { kind: 'season', id: S },
      { kind: 'event', id: E2 },
      { kind: 'form', id: F },
      { kind: 'form_version', id: V1 },
      { kind: 'match', id: M1 },
    ] as const;
    for (const target of targets) {
      await expect(getDeleteImpact(lead, target, ctx)).rejects.toMatchObject({
        code: 'forbidden',
      });
    }
    for (const caller of [scouter, service]) {
      for (const target of [...targets, { kind: 'entry', id: E(1) } as const]) {
        await expect(getDeleteImpact(caller, target, ctx)).rejects.toMatchObject({
          code: 'forbidden',
        });
      }
    }
  });

  it('answers not-found for an id that names nothing', async () => {
    for (const kind of ['season', 'event', 'form', 'form_version', 'match', 'entry'] as const) {
      await expect(getDeleteImpact(admin, { kind, id: NOPE }, ctx)).rejects.toMatchObject({
        code: 'not-found',
      });
    }
  });

  it('deletes nothing, for any kind', async () => {
    const before = sizes();
    for (const [kind, target] of [
      ['season', S],
      ['event', E1],
      ['event', E2],
      ['form', F],
      ['form_version', V1],
      ['match', M1],
      ['entry', E(1)],
    ] as const) {
      await getDeleteImpact(admin, { kind, id: target }, ctx);
    }
    expect(sizes()).toEqual(before);
    expect(ctx.matchDeletions.size).toBe(0);
    expect(ctx.formDeletions.size).toBe(0);
  });
});

describe('the cascade deletes need the name typed back exactly (SPEC-FINAL 3.9, 17.8)', () => {
  it('requires the season year typed back exactly', async () => {
    ctx.setActiveContext(S2, null); // the active-season guard fires first, by design
    for (const typed of ['wrong', ' 1999', '1999 ', '', undefined]) {
      await expect(
        deleteSeason(admin, { season_id: S, confirm_name: typed }, ctx),
      ).rejects.toMatchObject({ code: 'invalid', message: TYPE_NAME_EXACTLY });
    }
    expect(ctx.seasons.has(S)).toBe(true);
  });

  it('refuses a wrong-case name for every cascade kind, and deletes nothing', async () => {
    ctx.setActiveContext(S2, null);
    const draft = id(40);
    ctx.formVersions.set(draft, {
      ...ctx.formVersions.get(V2)!,
      id: draft,
      version_no: 3,
      published_at: null,
    });
    const before = sizes();
    const refusals = [
      () => deleteEvent(admin, { event_id: E2, confirm_name: 'second event' }, ctx),
      () => deleteEvent(admin, { event_id: E2, confirm_name: 'SECOND EVENT' }, ctx),
      () => deleteForm(admin, { form_id: F, confirm_name: 'seed match form' }, ctx),
      () => deleteForm(admin, { form_id: F }, ctx),
      () => deleteFormVersion(admin, { form_version_id: draft, confirm_name: 'V3' }, ctx),
      () => deleteFormVersion(admin, { form_version_id: draft }, ctx),
      () => deleteMatch(admin, { match_id: M1, with_entries: true, confirm_name: 'q1' }, ctx),
      () => deleteMatch(admin, { match_id: M1, with_entries: true }, ctx),
    ];
    for (const refused of refusals) {
      await expect(refused()).rejects.toMatchObject({
        code: 'invalid',
        message: TYPE_NAME_EXACTLY,
      });
    }
    expect(sizes()).toEqual(before);
  });
});

describe('admin delete (SPEC-FINAL 3.9)', () => {
  it('cascades a season to its events, matches, entries, forms, versions and rules', async () => {
    ctx.setActiveContext(S2, null);
    await expect(
      deleteSeason(admin, { season_id: S, confirm_name: '1999' }, ctx),
    ).resolves.toMatchObject({ deleted: true });
    expect(ctx.seasons.has(S)).toBe(false);
    expect(ctx.seasons.has(S2)).toBe(true);
    expect(ctx.events.size).toBe(0);
    expect(ctx.matches.size).toBe(0);
    expect(ctx.rows.scouting_entries.size).toBe(0);
    expect(ctx.forms.size).toBe(0);
    expect(ctx.formVersions.size).toBe(0);
    expect(ctx.scoringRules.size).toBe(0);
    expect(ctx.matchTeams.size).toBe(0);
    // the teams and the users are not the season's
    expect(ctx.teams.size).toBe(6);
  });

  it('refuses the active season with the exact text, whatever is typed', async () => {
    for (const typed of ['1999', 'wrong']) {
      await expect(
        deleteSeason(admin, { season_id: S, confirm_name: typed }, ctx),
      ).rejects.toMatchObject({ code: 'conflict', message: SWITCH_SEASON_FIRST });
    }
    expect(SWITCH_SEASON_FIRST).toBe('Switch the active season first.');
    expect(ctx.seasons.has(S)).toBe(true);
  });

  it('refuses the default event with the exact text, whatever is typed', async () => {
    await expect(
      deleteEvent(admin, { event_id: E1, confirm_name: 'Seed District Event' }, ctx),
    ).rejects.toMatchObject({ code: 'conflict', message: SWITCH_EVENT_FIRST });
    expect(SWITCH_EVENT_FIRST).toBe('Switch the default event first.');
    expect(ctx.events.has(E1)).toBe(true);
  });

  it('cascades an event to its matches and entries, and tombstones the matches', async () => {
    await deleteEvent(admin, { event_id: E2, confirm_name: 'Second Event' }, ctx);
    expect(ctx.events.has(E2)).toBe(false);
    expect(ctx.matches.has(M3)).toBe(false);
    expect(ctx.matches.has(M4)).toBe(false);
    expect([...ctx.rows.scouting_entries.values()].every((r) => r.event_id === E1)).toBe(true);
    expect(ctx.rows.scouting_entries.size).toBe(6);
    expect(ctx.matchDeletions.has(M3)).toBe(true);
    expect(ctx.events.has(E1)).toBe(true);
  });

  it('cascades a form to its versions, fields, scoring rules and every entry bound to it', async () => {
    await expect(
      deleteForm(admin, { form_id: F, confirm_name: 'Seed match form' }, ctx),
    ).resolves.toEqual({ versions: 2, entries: 11, deleted: true });
    expect(ctx.forms.has(F)).toBe(false);
    expect(ctx.formVersions.has(V1)).toBe(false);
    expect(ctx.formVersions.has(V2)).toBe(false);
    expect(ctx.scoringRules.size).toBe(0);
    // only the super entry, on the other form, is left
    expect([...ctx.rows.scouting_entries.keys()]).toEqual([E(12)]);
    expect(ctx.formVersions.has(VS)).toBe(true);
  });

  it('refuses every delete to a lead and a scouter', async () => {
    for (const caller of [lead, scouter]) {
      await expect(
        deleteSeason(caller, { season_id: S, confirm_name: '1999' }, ctx),
      ).rejects.toMatchObject({ code: 'forbidden' });
      await expect(
        deleteEvent(caller, { event_id: E2, confirm_name: 'Second Event' }, ctx),
      ).rejects.toMatchObject({ code: 'forbidden' });
      await expect(
        deleteForm(caller, { form_id: F, confirm_name: 'Seed match form' }, ctx),
      ).rejects.toMatchObject({ code: 'forbidden' });
      await expect(
        deleteFormVersion(caller, { form_version_id: V1, confirm_name: 'v1' }, ctx),
      ).rejects.toMatchObject({ code: 'forbidden' });
      await expect(
        deleteMatch(caller, { match_id: M1, with_entries: true, confirm_name: 'Q1' }, ctx),
      ).rejects.toMatchObject({ code: 'forbidden' });
    }
    expect(ctx.rows.scouting_entries.size).toBe(12);
  });

  it('rejects a service caller from every one of these', async () => {
    const calls = [
      () => deleteSeason(service, { season_id: S, confirm_name: '1999' }, ctx),
      () => deleteEvent(service, { event_id: E2, confirm_name: 'Second Event' }, ctx),
      () => deleteForm(service, { form_id: F, confirm_name: 'Seed match form' }, ctx),
      () => deleteFormVersion(service, { form_version_id: V1, confirm_name: 'v1' }, ctx),
      () => deleteMatch(service, { match_id: M1 }, ctx),
      () => deleteMatch(service, { match_id: M1, with_entries: true, confirm_name: 'Q1' }, ctx),
      () => deleteEntry(service, { entry_id: E(1) }, ctx),
    ];
    for (const call of calls) await expect(call()).rejects.toMatchObject({ code: 'forbidden' });
    expect(sizes().live).toBe(12);
  });
});

describe('a form version with entries is never deleted on its own (SPEC-FINAL 3.9, 17.8)', () => {
  it('refuses it under every confirm_name, the exact one included', async () => {
    for (const typed of ['v1', 'V1', '', 'Seed match form', 'v2', undefined]) {
      await expect(
        deleteFormVersion(admin, { form_version_id: V1, confirm_name: typed }, ctx),
      ).rejects.toMatchObject({
        code: 'invalid',
        details: { reason: 'has-entries', entries: 3 },
      });
    }
    // the active v2 too, with its eight entries
    await expect(
      deleteFormVersion(admin, { form_version_id: V2, confirm_name: 'v2' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid', details: { reason: 'has-entries', entries: 8 } });
    expect(ctx.formVersions.has(V1)).toBe(true);
    expect(ctx.rows.scouting_entries.size).toBe(12);
  });

  it('deletes a draft with no entries once its label is typed exactly', async () => {
    const draft = id(40);
    ctx.formVersions.set(draft, {
      ...ctx.formVersions.get(V2)!,
      id: draft,
      version_no: 3,
      published_at: null,
    });
    await expect(
      deleteFormVersion(admin, { form_version_id: draft, confirm_name: 'v3' }, ctx),
    ).resolves.toEqual({ deleted: true });
    expect(ctx.formVersions.has(draft)).toBe(false);
  });
});

describe('deleteMatch with its entries (SPEC-FINAL 3.9, v1.47)', () => {
  it('a match whose only entries are soft-deleted is still refused on its own', async () => {
    ctx.softDelete(E(10));
    ctx.softDelete(E(11));
    await expect(deleteMatch(admin, { match_id: M4 }, ctx)).rejects.toMatchObject({
      code: 'conflict',
      message:
        'qualification match 2 has 2 entries, so it cannot be deleted; correct the match number instead',
    });
    expect(ctx.matches.has(M4)).toBe(true);
  });

  it('deletes it with every entry naming it, soft-deleted ones included, and records the tombstone', async () => {
    ctx.softDelete(E(10));
    await expect(
      deleteMatch(admin, { match_id: M4, with_entries: true, confirm_name: 'Q2' }, ctx),
    ).resolves.toEqual({ id: M4, deleted: true, entries: 2 });
    expect(ctx.matches.has(M4)).toBe(false);
    expect(ctx.rows.scouting_entries.has(E(10))).toBe(false);
    expect(ctx.rows.scouting_entries.has(E(11))).toBe(false);
    expect(ctx.matchDeletions.get(M4)).toMatchObject({ event_id: E2 });
    // nothing else went
    expect(ctx.rows.scouting_entries.size).toBe(10);
    expect(ctx.matches.size).toBe(3);
  });

  it('takes the slots with it', async () => {
    await deleteMatch(admin, { match_id: M1, with_entries: true, confirm_name: 'Q1' }, ctx);
    expect([...ctx.matchTeams.values()].filter((s) => s.match_id === M1)).toEqual([]);
  });

  it('a device that later pushes an entry for it is refused parent-deleted', async () => {
    await deleteMatch(admin, { match_id: M1, with_entries: true, confirm_name: 'Q1' }, ctx);
    const op: Operation = {
      op_id: 'op-late',
      entity: 'scouting_entry',
      row_id: entryId(50),
      action: 'create',
      base_version: null,
      payload: {
        form_version_id: V2,
        form_kind: 'match',
        event_id: E1,
        match_id: M1,
        team_id: T[0],
        alliance: 'red',
        scouter_id: 'u-scouter',
        robot_status: 'played',
        data: {},
      },
      author_user_id: 'u-scouter',
      client_created_at: at(30),
      client_updated_at: at(30),
      seq: 1,
    };
    const res = await syncPush(scouter, { device_id: 'd-1', operations: [op] }, ctx);
    expect(res.results[0]).toMatchObject({
      status: 'rejected',
      reason: 'parent-deleted',
      detail: PARENT_DELETED_DETAIL.match,
    });
    expect(ctx.rows.scouting_entries.has(entryId(50))).toBe(false);
  });

  it('refuses a lead with_entries, even with the label typed', async () => {
    await expect(
      deleteMatch(lead, { match_id: M1, with_entries: true, confirm_name: 'Q1' }, ctx),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(ctx.matches.has(M1)).toBe(true);
    expect(ctx.rows.scouting_entries.size).toBe(12);
  });

  it('answers conflict and deletes nothing when an entry races in (the function rolled back)', async () => {
    ctx.store.deleteMatchCascade = async () => {
      throw Object.assign(new Error('violates foreign key'), { code: '23503' });
    };
    await expect(
      deleteMatch(admin, { match_id: M1, with_entries: true, confirm_name: 'Q1' }, ctx),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(ctx.matches.has(M1)).toBe(true);
  });

  it('a match with no entries still deletes as it stands, with nothing typed', async () => {
    const empty = id(42);
    ctx.matches.set(empty, { id: empty, event_id: E1, match_type: 'qualification', number: 9 });
    await expect(deleteMatch(admin, { match_id: empty }, ctx)).resolves.toEqual({
      id: empty,
      deleted: true,
    });
  });
});

describe('deleteEntry: a lead/admin soft delete (SPEC-FINAL 3.9, 7.6)', () => {
  it('soft-deletes an entry for a lead, keeping the row and its tombstone', async () => {
    await expect(deleteEntry(lead, { entry_id: E(1) }, ctx)).resolves.toEqual({
      id: E(1),
      deleted: true,
      version: 2,
    });
    const row = ctx.rows.scouting_entries.get(E(1))!;
    expect(row.deleted_at).toBe(ctx.nowValue.toISOString());
    expect(row.version).toBe(2);
    expect(row.data).toEqual({});
    expect(ctx.rows.scouting_entries.size).toBe(12);
  });

  it('lets an admin do the same, and a second delete writes nothing', async () => {
    await deleteEntry(admin, { entry_id: E(2) }, ctx);
    await expect(deleteEntry(admin, { entry_id: E(2) }, ctx)).resolves.toEqual({
      id: E(2),
      deleted: true,
      version: 2,
    });
    expect(ctx.rows.scouting_entries.get(E(2))!.version).toBe(2);
  });

  it('never lets a scouter delete an entry, their own included', async () => {
    expect(ctx.rows.scouting_entries.get(E(1))!.scouter_id).toBe(scouter.userId);
    await expect(deleteEntry(scouter, { entry_id: E(1) }, ctx)).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(ctx.rows.scouting_entries.get(E(1))!.deleted_at).toBeNull();
  });

  it('answers not-found for an entry that does not exist', async () => {
    await expect(deleteEntry(lead, { entry_id: NOPE }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('writes the same row as a lead pushing a delete operation', async () => {
    await deleteEntry(lead, { entry_id: E(1) }, ctx);
    const online = { ...ctx.rows.scouting_entries.get(E(1))! };
    const res = await syncPush(
      lead,
      {
        device_id: 'd-1',
        operations: [
          {
            op_id: 'op-del',
            entity: 'scouting_entry',
            row_id: E(2),
            action: 'delete',
            base_version: 1,
            payload: {},
            author_user_id: 'u-lead',
            client_created_at: ctx.nowValue.toISOString(),
            client_updated_at: ctx.nowValue.toISOString(),
            seq: 1,
          },
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied', new_version: 2 });
    const pushed = ctx.rows.scouting_entries.get(E(2))!;
    const shape = (r: Record<string, unknown>) => ({
      deleted_at: r.deleted_at,
      version: r.version,
      client_updated_at: r.client_updated_at,
    });
    expect(shape(pushed)).toEqual(shape(online));
  });
});
