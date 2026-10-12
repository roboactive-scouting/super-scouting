import { beforeEach, describe, expect, it } from 'vitest';
import { PULL_ENTITY_KEYS, type Caller } from '@frc/shared';
import { syncPull } from './syncPull.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';

const scouter: Caller = { kind: 'user', userId: 'u-scouter', role: 'scouter' };
const EVENT = 'ev-1';

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  ctx.pullRows.set('scouting_entries', [
    { id: 'e-1', event_id: EVENT, updated_at: '2026-11-14T09:00:00.000Z', deleted_at: null },
    { id: 'e-2', event_id: EVENT, updated_at: '2026-11-14T09:00:30.000Z', deleted_at: null },
    {
      id: 'e-3',
      event_id: EVENT,
      updated_at: '2026-11-14T09:01:00.000Z',
      deleted_at: '2026-11-14T09:01:00.000Z',
    },
  ]);
  ctx.pullRows.set('teams', [{ id: 't-1', number: 2096, updated_at: '2026-11-13T08:00:00.000Z' }]);
});

describe('syncPull', () => {
  it('returns all 24 entity keys, even the empty ones', async () => {
    const res = await syncPull(scouter, { event_id: EVENT }, ctx);
    expect(Object.keys(res.entities).sort()).toEqual([...PULL_ENTITY_KEYS].sort());
  });

  it('returns the whole dataset on a first pull and marks it complete', async () => {
    const res = await syncPull(scouter, { event_id: EVENT }, ctx);
    expect(res.entities.scouting_entries).toHaveLength(3);
    expect(res.complete).toBe(true);
    expect(res.next_cursor).toBeNull();
  });

  it('returns tombstones as ordinary rows carrying deleted_at', async () => {
    const res = await syncPull(scouter, { event_id: EVENT }, ctx);
    const tombstone = res.entities.scouting_entries.find((r) => r.id === 'e-3');
    expect(tombstone?.deleted_at).toBe('2026-11-14T09:01:00.000Z');
  });

  it('returns only rows newer than `since` on a delta pull', async () => {
    const res = await syncPull(
      scouter,
      { event_id: EVENT, since: '2026-11-14T09:00:15.000Z' },
      ctx,
    );
    expect(res.entities.scouting_entries.map((r) => r.id)).toEqual(['e-2', 'e-3']);
    expect(res.entities.teams).toHaveLength(0);
  });

  it('rewinds the watermark five seconds behind the newest row it returned', async () => {
    const res = await syncPull(scouter, { event_id: EVENT }, ctx);
    expect(res.watermark).toBe('2026-11-14T09:00:55.000Z');
  });

  it('pages a large first pull and reports complete only on the last page', async () => {
    ctx.pullRows.set(
      'scouting_entries',
      Array.from({ length: 2500 }, (_, i) => ({
        id: `e-${i}`,
        event_id: EVENT,
        updated_at: new Date(Date.UTC(2026, 10, 14, 9, 0, 0) + i * 1000).toISOString(),
        deleted_at: null,
      })),
    );
    const first = await syncPull(scouter, { event_id: EVENT }, ctx);
    expect(first.complete).toBe(false);
    expect(first.next_cursor).not.toBeNull();
    expect(first.entities.scouting_entries.length).toBeLessThanOrEqual(2000);

    const second = await syncPull(scouter, { event_id: EVENT, cursor: first.next_cursor! }, ctx);
    expect(second.complete).toBe(true);
    expect(second.next_cursor).toBeNull();
    const ids = new Set([
      ...first.entities.scouting_entries.map((r) => r.id),
      ...second.entities.scouting_entries.map((r) => r.id),
    ]);
    expect(ids.size).toBe(2500);
  });

  it('caches every user row including the password hash, for offline login (SPEC-FINAL 7.5, 9.2)', async () => {
    ctx.pullRows.set('users', [
      {
        id: 'u-1',
        username: 'a',
        full_name: 'A',
        role: 'scouter',
        password_hash: '$2a$10$x',
        disabled_at: null,
        updated_at: '2026-11-13T08:00:00.000Z',
      },
    ]);
    const res = await syncPull(scouter, { event_id: EVENT }, ctx);
    expect(res.entities.users[0]).toHaveProperty('password_hash');
  });

  it('a service caller may call it — syncPull is a query', async () => {
    const res = await syncPull({ kind: 'service', label: 'mcp' }, { event_id: EVENT }, ctx);
    expect(res.complete).toBe(true);
  });

  describe('deleted matches (UF.1, SPEC-FINAL 9.3 v1.18)', () => {
    const tombstone = (matchId: string, eventId: string, at: string) =>
      ctx.matchDeletions.set(matchId, { event_id: eventId, deleted_at: at });

    it('a delta pull names the event’s matches deleted after `since`, and no others', async () => {
      tombstone('m-old', EVENT, '2026-11-14T08:00:00.000Z');
      tombstone('m-new', EVENT, '2026-11-14T09:00:20.000Z');
      tombstone('m-other-event', 'ev-2', '2026-11-14T09:00:20.000Z');
      const res = await syncPull(
        scouter,
        { event_id: EVENT, since: '2026-11-14T09:00:15.000Z' },
        ctx,
      );
      expect(res.deleted_matches).toEqual(['m-new']);
    });

    it('a full pull names none: its dataset already leaves them out', async () => {
      tombstone('m-new', EVENT, '2026-11-14T09:00:20.000Z');
      const res = await syncPull(scouter, { event_id: EVENT }, ctx);
      expect(res.deleted_matches).toEqual([]);
    });

    it('names them on the first page of a delta pull only', async () => {
      tombstone('m-new', EVENT, '2026-11-14T09:00:20.000Z');
      const res = await syncPull(
        scouter,
        {
          event_id: EVENT,
          since: '2026-11-14T09:00:15.000Z',
          cursor: btoa('{"entityIndex":0,"offset":0}'),
        },
        ctx,
      );
      expect(res.deleted_matches).toEqual([]);
    });

    it('moves the watermark past a deletion newer than every row', async () => {
      tombstone('m-new', EVENT, '2026-11-14T10:00:00.000Z');
      const res = await syncPull(
        scouter,
        { event_id: EVENT, since: '2026-11-14T09:00:15.000Z' },
        ctx,
      );
      expect(res.watermark).toBe('2026-11-14T09:59:55.000Z');
    });

    it('follows the store: a match deleted through it is named, one created again is not', async () => {
      ctx.knownEvents.add(EVENT);
      const match = await ctx.store.insertMatch({
        id: 'm-9',
        event_id: EVENT,
        match_type: 'qualification',
        number: 9,
      });
      ctx.nowValue = new Date('2026-11-14T11:00:00.000Z');
      await ctx.store.deleteMatch(match.id);
      const since = { event_id: EVENT, since: '2026-11-14T10:00:00.000Z' };
      expect((await syncPull(scouter, since, ctx)).deleted_matches).toEqual(['m-9']);
      await ctx.store.insertMatch({
        id: 'm-9',
        event_id: EVENT,
        match_type: 'qualification',
        number: 9,
      });
      expect((await syncPull(scouter, since, ctx)).deleted_matches).toEqual([]);
    });
  });

  describe('a cleared match slot (task 1.40, spec 7.5 item 1)', () => {
    it('reaches a device through the delta pull as a row carrying deleted_at', async () => {
      await ctx.store.insertTeam({ id: 't-a', number: 1, name: 'A' });
      await ctx.store.insertTeam({ id: 't-b', number: 2, name: 'B' });
      await ctx.store.insertMatch({
        id: 'm-1',
        event_id: EVENT,
        match_type: 'qualification',
        number: 1,
      });
      const at = '2026-11-14T10:00:00.000Z';
      await ctx.store.setMatchTeams(
        'm-1',
        [
          { alliance: 'red', station: 1, team_id: 't-a' },
          { alliance: 'red', station: 2, team_id: 't-b' },
        ],
        at,
      );
      const since = { event_id: EVENT, since: '2026-11-14T10:30:00.000Z' };
      expect((await syncPull(scouter, since, ctx)).entities.match_teams).toEqual([]);

      ctx.nowValue = new Date('2026-11-14T11:00:00.000Z');
      await ctx.store.setMatchTeams(
        'm-1',
        [{ alliance: 'red', station: 1, team_id: 't-a' }],
        ctx.nowValue.toISOString(),
      );
      const res = await syncPull(scouter, since, ctx);
      expect(res.entities.match_teams).toEqual([
        expect.objectContaining({
          match_id: 'm-1',
          alliance: 'red',
          station: 2,
          team_id: 't-b',
          deleted_at: '2026-11-14T11:00:00.000Z',
        }),
      ]);
    });
  });

  describe('deleted form rows (task 1.40, spec 7.5 item 5)', () => {
    const SEASON = 'se-1'; // the fake's resolveScope
    const fieldRow = (id: string, key: string) => ({
      id,
      key,
      label: key,
      type: 'counter',
      display_order: 1,
      config: {},
      description: 'x',
      unit: 'count',
      phase: 'auto',
      direction: 'higher_is_better',
    });
    const since = { event_id: EVENT, since: '2026-11-14T10:30:00.000Z' };

    beforeEach(async () => {
      ctx.forms.set('form-1', { id: 'form-1', version: 1, season_id: SEASON, kind: 'match' });
      ctx.formVersions.set('fv-1', { id: 'fv-1', version: 1, form_id: 'form-1', version_no: 1 });
      ctx.nowValue = new Date('2026-11-14T10:00:00.000Z');
      await ctx.store.writeFormFields('fv-1', [fieldRow('f-a', 'a'), fieldRow('f-b', 'b')], []);
      await ctx.store.replaceScoringRules('form-1', [
        { id: 'r-a', field_key: 'a', points: 1 },
        { id: 'r-b', field_key: 'b', points: 2 },
      ]);
      ctx.nowValue = new Date('2026-11-14T11:00:00.000Z');
    });

    it('a delta pull names a field removed from a draft and a dropped scoring rule', async () => {
      await ctx.store.writeFormFields('fv-1', [fieldRow('f-b', 'b')], ['a']);
      await ctx.store.replaceScoringRules('form-1', [{ id: 'r-a', field_key: 'a', points: 1 }]);
      const res = await syncPull(scouter, since, ctx);
      expect(res.deleted_form_rows).toEqual({
        forms: [],
        form_versions: [],
        form_fields: ['f-a'],
        scoring_rules: ['r-b'],
      });
      // The watermark moves past the deletion, as it does for a deleted match.
      expect(res.watermark).toBe('2026-11-14T10:59:55.000Z');
    });

    it('a deleted form names the form; what it cascaded to is not named on its own', async () => {
      await ctx.store.deleteFormCascade('form-1');
      expect((await syncPull(scouter, since, ctx)).deleted_form_rows).toEqual({
        forms: ['form-1'],
        form_versions: [],
        form_fields: [],
        scoring_rules: [],
      });
    });

    it('a deleted version names the version, and its fields go with it', async () => {
      await ctx.store.deleteFormVersion('fv-1');
      expect((await syncPull(scouter, since, ctx)).deleted_form_rows).toEqual({
        forms: [],
        form_versions: ['fv-1'],
        form_fields: [],
        scoring_rules: [],
      });
    });

    it('a row written again under its id is live again, and named no more', async () => {
      await ctx.store.writeFormFields('fv-1', [fieldRow('f-b', 'b')], ['a']);
      await ctx.store.writeFormFields('fv-1', [fieldRow('f-a', 'a'), fieldRow('f-b', 'b')], []);
      expect((await syncPull(scouter, since, ctx)).deleted_form_rows?.form_fields).toEqual([]);
    });

    it('names none on a full pull, on a later page, or before `since`', async () => {
      await ctx.store.writeFormFields('fv-1', [fieldRow('f-b', 'b')], ['a']);
      const empty = { forms: [], form_versions: [], form_fields: [], scoring_rules: [] };
      expect((await syncPull(scouter, { event_id: EVENT }, ctx)).deleted_form_rows).toEqual(empty);
      const page = { ...since, cursor: btoa('{"entityIndex":0,"offset":0}') };
      expect((await syncPull(scouter, page, ctx)).deleted_form_rows).toEqual(empty);
      const later = { event_id: EVENT, since: '2026-11-14T12:00:00.000Z' };
      expect((await syncPull(scouter, later, ctx)).deleted_form_rows).toEqual(empty);
    });
  });

  it('reports not-found when the event no longer exists, so the client can wipe its cache', async () => {
    ctx.knownEvents.clear();
    await expect(syncPull(scouter, { event_id: EVENT }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});
