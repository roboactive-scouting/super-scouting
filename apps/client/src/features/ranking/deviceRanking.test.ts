import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRankTable } from '@frc/shared';
import type * as Shared from '@frc/shared';
import { db } from '@/data/db';
import { loadDeviceTeamStats } from '@/features/teams/teamStats';
import { EMPTY_TEAM_ID, EVENT_ID, TEAM_ID, TEAM_ROWS } from '@/test/teamPageFixtures';
import { deviceRankInput, loadDeviceRanking } from './deviceRanking';

/*
 * Task 1.58: the device's ranking is the server's builder over the team page's own inputs, so
 * the ranking, the team page and the server's `rankTeams` cannot disagree (the server's side:
 * `apps/server/src/core/queries/stats.test.ts`, "is exactly the shared builder over the same rows").
 */

// The real shared builder, watched: the device computes nothing of its own.
vi.mock('@frc/shared', async (original) => {
  const actual = await original<typeof Shared>();
  return { ...actual, buildRankTable: vi.fn(actual.buildRankTable) };
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut(TEAM_ROWS);
  vi.mocked(buildRankTable).mockClear();
});

describe('the device ranking (task 1.58)', () => {
  it('is @frc/shared’s buildRankTable, called once with the event’s roster, entries and scoring', async () => {
    const out = (await loadDeviceRanking(EVENT_ID))!;
    expect(buildRankTable).toHaveBeenCalledTimes(1);
    const { input } = (await deviceRankInput(EVENT_ID))!;
    expect(out.rows).toEqual(buildRankTable(input));
    expect(out.event).toEqual({ id: EVENT_ID, name: 'District #3 · Tel Aviv' });
    // The roster (four teams), every live entry of the event (not the deleted one, not another
    // event's), and the match form's active scoring.
    expect(input.teams.map((t) => t.number).sort()).toEqual([1690, 2096, 5951, 5987]);
    expect(input.entries.every((e) => e.event_id === EVENT_ID && e.deleted_at === null)).toBe(true);
    expect(input.scoring.rules.length).toBeGreaterThan(0);
  });

  it('agrees with the team page for every team: rank, Total, Consistency, availability', async () => {
    const { rows } = (await loadDeviceRanking(EVENT_ID))!;
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      const page = await loadDeviceTeamStats(row.team_id, EVENT_ID);
      if (page.state !== 'held') throw new Error(`no team page for ${row.team_id}`);
      const { stats } = page;
      expect(stats.rank, row.name).toEqual({ rank: row.rank, of: rows.length });
      expect(stats.headline.value, row.name).toBe(row.average_points);
      expect(stats.metrics.find((m) => m.key === 'stddev_points')!.value, row.name).toBe(
        row.stddev,
      );
      expect(stats.reliability.availability_rate, row.name).toBe(row.availability_rate);
      expect(stats.reliability.breakdowns, row.name).toBe(row.breakdowns);
      expect(stats.reliability.no_shows, row.name).toBe(row.no_shows);
    }
  });

  it('gives 1690 its phases, adding up to its Total, and the empty team nulls', async () => {
    const { rows } = (await loadDeviceRanking(EVENT_ID))!;
    const orbit = rows.find((r) => r.team_id === TEAM_ID)!;
    expect(orbit.phase_averages.map((p) => p.phase)).toEqual(['auto', 'teleop', 'endgame']);
    const sum = orbit.phase_averages.reduce((s, p) => s + (p.average ?? 0), 0);
    expect(sum).toBeCloseTo(orbit.average_points!, 9);
    const empty = rows.find((r) => r.team_id === EMPTY_TEAM_ID)!;
    expect(empty).toMatchObject({ rank: null, average_points: null, stddev: null });
    expect(empty.phase_averages.every((p) => p.average === null)).toBe(true);
    expect(rows.at(-1)!.team_id).toBe(EMPTY_TEAM_ID);
  });

  it('holds nothing for an event the device does not have', async () => {
    expect(await loadDeviceRanking('ev-nowhere')).toBeNull();
  });

  it('ranks before a match through the same builder, as rankTeams does (task 1.58b)', async () => {
    const { input } = (await deviceRankInput(EVENT_ID))!;
    for (const before of [1, 10, 20, 32, 38, 99]) {
      vi.mocked(buildRankTable).mockClear();
      const out = (await loadDeviceRanking(EVENT_ID, before))!;
      // The very call the server's rankTeams makes with { before_match_number } (stats.test.ts,
      // "ranks the event before a match through the same builder").
      expect(buildRankTable).toHaveBeenCalledWith({ ...input, before_match_number: before });
      expect(out.rows, `before Q${before}`).toEqual(
        buildRankTable({ ...input, before_match_number: before }),
      );
    }
    // 1690 played Q3, Q9, Q14 (broke down), Q20, Q26 (no-show), Q31, Q37: before Q20 it counts
    // three, and its trend line and last match are the earlier ones.
    const early = (await loadDeviceRanking(EVENT_ID, 20))!.rows.find((r) => r.team_id === TEAM_ID)!;
    expect(early).toMatchObject({
      matches_counted: 3,
      last_counted_match: 14,
      recent_totals: [29, 36, 11],
    });
    const now = (await loadDeviceRanking(EVENT_ID))!.rows.find((r) => r.team_id === TEAM_ID)!;
    expect(now).toMatchObject({ last_counted_match: 37, recent_totals: [36, 11, 40, 36, 42] });
  });
});
