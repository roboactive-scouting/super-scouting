import { beforeEach, describe, expect, it } from 'vitest';
import { getTeamStatsOutput, rankTeamsOutput, type Caller } from '@frc/shared';
import { getTeamStats, rankTeams } from './stats.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';

const lead: Caller = { kind: 'user', userId: 'u-l', role: 'lead' };
const service: Caller = { kind: 'service', label: 'mcp' };

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  // t-1: three qualification entries scoring 10, 20 and a no-show.
  // t-2: two qualification entries scoring 12 and 12, one of them broke_down.
  // t-3: one practice entry only.
  ctx.seedRankingFixture();
});

describe('rankTeams — the fixed phase 1 table (SPEC-FINAL 13.5, 11.5)', () => {
  it('ranks by the status-aware average points per match, descending, by default', async () => {
    const table = await rankTeams(lead, { event_id: 'ev-1' }, ctx);
    expect(table.rows.map((r) => r.team_id)).toEqual(['t-1', 't-2', 't-3']);
    expect(table.rows[0]!.average_points).toBeCloseTo(15, 6);
  });

  it('excludes a no-show from the mean rather than averaging in a zero', async () => {
    const table = await rankTeams(lead, { event_id: 'ev-1' }, ctx);
    expect(table.rows.find((r) => r.team_id === 't-1')!.average_points).toBeCloseTo(15, 6);
  });

  it('includes a broke_down entry, because its partial data is real observed performance', async () => {
    const table = await rankTeams(lead, { event_id: 'ev-1' }, ctx);
    expect(table.rows.find((r) => r.team_id === 't-2')!.average_points).toBeCloseTo(12, 6);
  });

  it('excludes practice and playoff matches from every figure', async () => {
    const table = await rankTeams(lead, { event_id: 'ev-1' }, ctx);
    expect(table.rows.find((r) => r.team_id === 't-3')!.average_points).toBeNull();
  });

  it('counts a duplicated (team, match) once, using the latest client_updated_at', async () => {
    ctx.duplicateEntry('t-1-match-1', { scoreDelta: 100, newer: true });
    const table = await rankTeams(lead, { event_id: 'ev-1' }, ctx);
    expect(table.rows.find((r) => r.team_id === 't-1')!.matches_counted).toBe(2);
  });

  it('returns the four reliability figures and the availability rate per team', async () => {
    const row = (await rankTeams(lead, { event_id: 'ev-1' }, ctx)).rows.find(
      (r) => r.team_id === 't-1',
    )!;
    expect(row).toMatchObject({ breakdowns: 0, no_shows: 1, disabled: 0 });
    expect(row.availability_rate).toBeCloseTo(2 / 3, 6);
  });

  it('returns null, not zero, for a team with no qualification entries', async () => {
    const row = (await rankTeams(lead, { event_id: 'ev-1' }, ctx)).rows.find(
      (r) => r.team_id === 't-3',
    )!;
    expect(row.average_points).toBeNull();
    expect(row.availability_rate).toBeNull();
  });

  it('sorts by any column on request, and never by standard deviation', async () => {
    const byReliability = await rankTeams(
      lead,
      { event_id: 'ev-1', sort_by: 'availability_rate' },
      ctx,
    );
    expect(byReliability.rows[0]!.availability_rate).toBeGreaterThanOrEqual(
      byReliability.rows[1]!.availability_rate ?? 0,
    );
    await expect(
      rankTeams(lead, { event_id: 'ev-1', sort_by: 'stddev' } as never, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('returns no weighting inputs at all in phase 1', async () => {
    const table = await rankTeams(lead, { event_id: 'ev-1' }, ctx);
    expect(table).not.toHaveProperty('weights');
    expect(table).not.toHaveProperty('contributions');
  });
});

describe('getTeamStats (SPEC-FINAL 13.1)', () => {
  it('returns the match-by-match series in match-number order', async () => {
    const stats = await getTeamStats(
      lead,
      { team_id: 't-1', scope: { mode: 'event', event_id: 'ev-1' } },
      ctx,
    );
    expect(stats.matches.map((m) => m.match_number)).toEqual([1, 2, 3]);
  });

  it('returns the long-text notes newest first with match, field label and scouter', async () => {
    const stats = await getTeamStats(
      lead,
      { team_id: 't-1', scope: { mode: 'event', event_id: 'ev-1' } },
      ctx,
    );
    expect(stats.notes[0]).toMatchObject({ field_label: 'Notes', scouter_name: 'Seed Scouter' });
    expect(stats.notes[0]!.client_updated_at >= stats.notes[1]!.client_updated_at).toBe(true);
  });

  it('refuses a metric whose field type changed between versions, with that message', async () => {
    ctx.changeFieldTypeBetweenVersions('auto_notes');
    const stats = await getTeamStats(
      lead,
      { team_id: 't-1', scope: { mode: 'event', event_id: 'ev-1' } },
      ctx,
    );
    const broken = stats.metrics.find((m) => m.field_key === 'auto_notes')!;
    expect(broken.value).toBeNull();
    expect(broken.unavailable_reason).toBe('type-changed');
  });

  it('is bounded and paginated, and a service caller may call it', async () => {
    await expect(
      getTeamStats(service, { team_id: 't-1', scope: { mode: 'event', event_id: 'ev-1' } }, ctx),
    ).resolves.toBeTruthy();
    const stats = await getTeamStats(
      lead,
      { team_id: 't-1', scope: { mode: 'event', event_id: 'ev-1' }, limit: 2 },
      ctx,
    );
    expect(stats.matches.length).toBeLessThanOrEqual(2);
  });
});

// Beyond the plan's test: the task brief's proofs.
const t1 = { team_id: 't-1', scope: { mode: 'event' as const, event_id: 'ev-1' } };

describe('getTeamStats — what the team page reads (task 1.57)', () => {
  it('passes its own wire schema, and so does rankTeams', async () => {
    expect(getTeamStatsOutput.safeParse(await getTeamStats(lead, t1, ctx)).success).toBe(true);
    expect(
      rankTeamsOutput.safeParse(await rankTeams(lead, { event_id: 'ev-1' }, ctx)).success,
    ).toBe(true);
  });

  it('shows a no-show as null everywhere — points, every cell, every series — never 0', async () => {
    const stats = await getTeamStats(lead, t1, ctx);
    const noShow = stats.matches.find((m) => m.robot_status === 'no_show')!;
    expect(noShow.scouted_points).toBeNull();
    expect(Object.values(noShow.columns).length).toBeGreaterThan(0);
    for (const cell of Object.values(noShow.columns)) {
      expect(cell).toEqual({ value: null, display: null });
    }
    for (const metric of stats.metrics.filter((m) => m.series.length > 0)) {
      const point = metric.series.find((p) => p.entry_id === noShow.entry_id);
      expect(point, metric.key).toEqual({
        entry_id: noShow.entry_id,
        match_label: 'Q3',
        value: null,
      });
    }
    const points = stats.metrics.find((m) => m.key === 'average_points')!;
    expect(points.series.map((p) => p.value)).toEqual([10, 20, null]);
  });

  it('carries the headline, the tiles and the reliability counts with the matches named', async () => {
    const stats = await getTeamStats(lead, t1, ctx);
    expect(stats.team).toEqual({ id: 't-1', number: 2096, name: 'ROBACTIVE' });
    expect(stats.event).toEqual({ id: 'ev-1', name: 'District #3 · Tel Aviv' });
    expect(stats.headline).toEqual({ label: 'Average points', value: 15 });
    expect(stats.tiles).toEqual({
      median: 15,
      availability: { rate: 2 / 3, available: 2, total: 3 },
      best_match: { entry_id: 't-1-match-2', match_label: 'Q2', points: 20 },
      trend: 10,
    });
    expect(stats.reliability).toEqual({
      breakdowns: 0,
      no_shows: 1,
      disabled: 0,
      available: 2,
      missed: 1,
      availability_rate: 2 / 3,
      breakdown_matches: [],
      no_show_matches: ['Q3'],
      disabled_matches: [],
    });
    const t2 = await getTeamStats(lead, { ...t1, team_id: 't-2' }, ctx);
    expect(t2.reliability.breakdown_matches).toEqual(['Q2']);
    expect(stats.entry_count).toBe(4); // three match entries and a super entry
  });

  it('lists every metric: Overall, then one per scorable field by phase, std dev neutral', async () => {
    const stats = await getTeamStats(lead, t1, ctx);
    expect(stats.metrics.map((m) => [m.group, m.key])).toEqual([
      ['overall', 'average_points'],
      ['overall', 'median_points'],
      ['overall', 'stddev_points'],
      ['auto', 'field:auto_leave'],
      ['auto', 'field:auto_notes'],
      ['teleop', 'field:tele_notes'],
      ['teleop', 'field:pickup'],
      ['teleop', 'field:defense'],
      ['endgame', 'field:climb'],
    ]);
    const by = (key: string) => stats.metrics.find((m) => m.key === key)!;
    expect(by('stddev_points')).toMatchObject({ direction: 'neutral', value: 5 });
    // Rates are 0–1 fractions over the answered matches; an unanswered toggle is no data.
    expect(by('field:defense')).toMatchObject({
      kind: 'rate',
      direction: 'neutral',
      value: 0.5,
      domain: { min: 0, max: 1 },
    });
    expect(by('field:auto_leave')).toMatchObject({ kind: 'rate', value: null });
    // Counters: the average, with the observed domain over the roster's teams.
    expect(by('field:auto_notes')).toMatchObject({
      kind: 'number',
      value: 2,
      domain: { min: 2, max: 2 },
    });
    expect(by('field:tele_notes')).toMatchObject({ value: 2, domain: { min: 2, max: 6 } });
    // Ordinal: the average rank ((0 + 2) / 2 = 1), named by the nearest option.
    expect(by('field:climb')).toMatchObject({
      kind: 'ordinal',
      value: 1,
      display: 'Parked',
      domain: { min: 0, max: 2 },
    });
    // Nominal: words only — no value, no bar, no trend.
    expect(by('field:pickup')).toMatchObject({
      kind: 'nominal',
      aggregation: 'mode',
      value: null,
      display: 'Floor',
      domain: null,
      series: [],
    });
    // Overall points: the domain spans the roster's averages (t-1 15, t-2 12; t-3 has none).
    expect(by('average_points').domain).toEqual({ min: 12, max: 15 });
  });

  it('gives the match table the scored fields as columns, with values as the device shows them', async () => {
    const stats = await getTeamStats(lead, t1, ctx);
    expect(stats.columns).toEqual([
      { key: 'field:auto_leave', label: 'Leave' },
      { key: 'field:auto_notes', label: 'Auto notes' },
      { key: 'field:tele_notes', label: 'Teleop notes' },
      { key: 'field:climb', label: 'Climb' },
    ]);
    const q2 = stats.matches.find((m) => m.match_label === 'Q2')!;
    expect(q2).toMatchObject({
      entry_id: 't-1-match-2',
      match_type: 'qualification',
      robot_status: 'played',
      scouted_points: 20,
      scouter_name: 'Seed Scouter',
    });
    expect(q2.columns).toEqual({
      'field:auto_leave': { value: null, display: null },
      'field:auto_notes': { value: 2, display: null },
      'field:tele_notes': { value: 2, display: null },
      'field:climb': { value: 2, display: 'Deep' },
    });
  });

  it('lists practice matches in the table but never counts them', async () => {
    const stats = await getTeamStats(lead, { ...t1, team_id: 't-3' }, ctx);
    expect(stats.matches.map((m) => m.match_label)).toEqual(['P1']);
    expect(stats.matches[0]!.scouted_points).toBe(30);
    expect(stats.headline.value).toBeNull();
    expect(stats.rank).toEqual({ rank: null, of: 3 });
    expect(stats.metrics.find((m) => m.key === 'average_points')!.series).toEqual([]);
  });

  it('puts every Long-text answer in the notes, both kinds, newest first', async () => {
    const stats = await getTeamStats(lead, t1, ctx);
    expect(stats.notes.map((n) => [n.entry_id, n.form_kind, n.match_label, n.value])).toEqual([
      ['t-1-match-3', 'match', 'Q3', 'Never came out'],
      ['t-1-super', 'super', null, 'Smooth driver'],
      ['t-1-match-2', 'match', 'Q2', 'Climbed deep'],
      ['t-1-match-1', 'match', 'Q1', 'Slow start'],
    ]);
  });

  it('shows the same rank in the header as in the ranking table', async () => {
    const table = await rankTeams(lead, { event_id: 'ev-1' }, ctx);
    for (const row of table.rows) {
      const stats = await getTeamStats(lead, { ...t1, team_id: row.team_id }, ctx);
      expect(stats.rank, row.team_id).toEqual({ rank: row.rank, of: table.rows.length });
      expect(stats.headline.value, row.team_id).toBe(row.average_points);
    }
    expect(table.rows.map((r) => r.rank)).toEqual([1, 2, null]);
  });

  it('never counts a soft-deleted entry', async () => {
    ctx.softDelete('t-1-match-2');
    const stats = await getTeamStats(lead, t1, ctx);
    expect(stats.headline.value).toBe(10);
    expect(stats.matches.map((m) => m.entry_id)).not.toContain('t-1-match-2');
    expect(stats.notes.map((n) => n.entry_id)).not.toContain('t-1-match-2');
    const row = (await rankTeams(lead, { event_id: 'ev-1' }, ctx)).rows.find(
      (r) => r.team_id === 't-1',
    )!;
    expect(row).toMatchObject({ average_points: 10, matches_counted: 1 });
    expect(row.availability_rate).toBeCloseTo(1 / 2, 6);
  });

  it('reads the newer duplicate only, in the table, the series and the average', async () => {
    ctx.duplicateEntry('t-1-match-1', { scoreDelta: 100, newer: true });
    const stats = await getTeamStats(lead, t1, ctx);
    expect(stats.headline.value).toBe(65); // (110 + 20) / 2
    expect(stats.matches.map((m) => m.entry_id)).toEqual([
      't-1-match-1-dup',
      't-1-match-2',
      't-1-match-3',
    ]);
    ctx.duplicateEntry('t-1-match-2', { scoreDelta: 100, newer: false });
    expect((await getTeamStats(lead, t1, ctx)).headline.value).toBe(65);
  });

  it('pages the match list with a cursor, and keeps the whole count', async () => {
    const first = await getTeamStats(lead, { ...t1, limit: 2 }, ctx);
    expect(first.matches.map((m) => m.match_label)).toEqual(['Q1', 'Q2']);
    expect(first.match_count).toBe(3);
    expect(first.next_cursor).not.toBeNull();
    const second = await getTeamStats(lead, { ...t1, limit: 2, cursor: first.next_cursor! }, ctx);
    expect(second.matches.map((m) => m.match_label)).toEqual(['Q3']);
    expect(second.next_cursor).toBeNull();
    // Every other part comes whole on every page.
    expect(second.metrics).toEqual(first.metrics);
    expect(second.notes).toEqual(first.notes);
  });

  it('refuses an unknown team or event, another scope and an unreadable cursor', async () => {
    await expect(getTeamStats(lead, { ...t1, team_id: 't-9' }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(
      getTeamStats(lead, { ...t1, scope: { mode: 'event', event_id: 'ev-9' } }, ctx),
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(
      getTeamStats(lead, { ...t1, scope: { mode: 'season' } } as never, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(getTeamStats(lead, { ...t1, cursor: 'nope' }, ctx)).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(rankTeams(lead, { event_id: 'ev-9' }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('answers every role and a service caller with the same table', async () => {
    const expected = await rankTeams(lead, { event_id: 'ev-1' }, ctx);
    for (const caller of [
      { kind: 'user', userId: 'u-s', role: 'scouter' },
      { kind: 'user', userId: 'u-a', role: 'admin' },
      service,
    ] as Caller[]) {
      expect(await rankTeams(caller, { event_id: 'ev-1' }, ctx)).toEqual(expected);
      await expect(getTeamStats(caller, t1, ctx)).resolves.toMatchObject({
        headline: { value: 15 },
      });
    }
  });
});

describe('rankTeams — sorting (task 1.57)', () => {
  const order = async (input: Parameters<typeof rankTeams>[1]) =>
    (await rankTeams(lead, input, ctx)).rows.map((r) => r.team_id);

  it('puts a null last whatever the direction', async () => {
    expect(await order({ event_id: 'ev-1', direction: 'asc' })).toEqual(['t-2', 't-1', 't-3']);
    expect(await order({ event_id: 'ev-1', sort_by: 'availability_rate' })).toEqual([
      't-2',
      't-1',
      't-3',
    ]);
    expect(
      await order({ event_id: 'ev-1', sort_by: 'availability_rate', direction: 'asc' }),
    ).toEqual(['t-1', 't-2', 't-3']);
  });

  it('sorts a count column fewest first by default, ties to the canonical rank', async () => {
    // no_shows: t-2 0, t-3 0, t-1 1. The tie t-2 / t-3 falls to the rank (t-2 #2, t-3 none).
    expect(await order({ event_id: 'ev-1', sort_by: 'no_shows' })).toEqual(['t-2', 't-3', 't-1']);
    expect(await order({ event_id: 'ev-1', sort_by: 'number' })).toEqual(['t-2', 't-1', 't-3']);
    expect(await order({ event_id: 'ev-1', sort_by: 'matches_counted' })).toEqual([
      't-1',
      't-2',
      't-3',
    ]);
  });

  it('keeps the canonical rank on every row whatever the sort', async () => {
    const rows = (await rankTeams(lead, { event_id: 'ev-1', sort_by: 'number' }, ctx)).rows;
    expect(rows.map((r) => [r.team_id, r.rank])).toEqual([
      ['t-2', 2],
      ['t-1', 1],
      ['t-3', null],
    ]);
  });
});
