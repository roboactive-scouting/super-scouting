import { describe, expect, it } from 'vitest';
import type { RobotStatus } from '../forms/types';
import { reliabilityFor } from './reliability';
import type { EngineEntry } from './types';

const entry = (over: Partial<EngineEntry>): EngineEntry => ({
  id: 'e',
  form_version_id: 'fv-1',
  form_kind: 'match',
  event_id: 'ev-1',
  match_id: 'm-1',
  team_id: 't-1',
  alliance: 'red',
  scouter_id: 'u-1',
  robot_status: 'played',
  data: {},
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  deleted_at: null,
  match_type: 'qualification',
  match_number: 1,
  event_sort_order: 1,
  ...over,
});

/** One qualification match entry per status, in matches 1, 2, 3… */
const season = (...statuses: RobotStatus[]) =>
  statuses.map((robot_status, i) =>
    entry({ id: `e-${i + 1}`, match_id: `m-${i + 1}`, match_number: i + 1, robot_status }),
  );

describe('reliabilityFor (SPEC-FINAL 11.3)', () => {
  it('returns the four counts and the availability rate', () => {
    const result = reliabilityFor(
      season('played', 'broke_down', 'no_show', 'disabled', 'played', 'broke_down', 'no_show'),
    );
    expect(result).toEqual({
      breakdowns: 2,
      no_shows: 2,
      disabled: 1,
      available: 4,
      missed: 3,
      availability_rate: 4 / 7,
    });
  });

  it('counts broke_down as available and flagged, not as missed', () => {
    expect(reliabilityFor(season('broke_down'))).toEqual({
      breakdowns: 1,
      no_shows: 0,
      disabled: 0,
      available: 1,
      missed: 0,
      availability_rate: 1,
    });
  });

  it('counts no_show and disabled as missed: events, not zeros', () => {
    expect(reliabilityFor(season('no_show', 'disabled'))).toEqual({
      breakdowns: 0,
      no_shows: 1,
      disabled: 1,
      available: 0,
      missed: 2,
      availability_rate: 0,
    });
  });

  it('a team with no entries yields a null rate rather than 0', () => {
    expect(reliabilityFor([])).toEqual({
      breakdowns: 0,
      no_shows: 0,
      disabled: 0,
      available: 0,
      missed: 0,
      availability_rate: null,
    });
  });

  it('counts each (team, match) once with duplicates, reading the latest one', () => {
    const rows = [
      entry({ id: 'a', robot_status: 'played', client_updated_at: '2026-11-14T09:00:00.000Z' }),
      entry({ id: 'b', robot_status: 'no_show', client_updated_at: '2026-11-14T09:05:00.000Z' }),
      entry({ id: 'c', robot_status: 'broke_down', client_updated_at: '2026-11-14T09:01:00.000Z' }),
    ];
    const expected = {
      breakdowns: 0,
      no_shows: 1,
      disabled: 0,
      available: 0,
      missed: 1,
      availability_rate: 0,
    };
    expect(reliabilityFor(rows)).toEqual(expected);
    expect(reliabilityFor([...rows].reverse())).toEqual(expected);
  });

  it('counts only qualification matches: practice and playoff never count', () => {
    const rows = [
      ...season('played'),
      entry({ id: 'pr', match_id: 'm-p', match_type: 'practice', robot_status: 'no_show' }),
      entry({ id: 'po', match_id: 'm-o', match_type: 'playoff', robot_status: 'disabled' }),
      entry({ id: 'pb', match_id: 'm-b', match_type: 'practice', robot_status: 'broke_down' }),
    ];
    expect(reliabilityFor(rows)).toEqual({
      breakdowns: 0,
      no_shows: 0,
      disabled: 0,
      available: 1,
      missed: 0,
      availability_rate: 1,
    });
  });

  it('only practice or playoff entries: no counted match, a null rate', () => {
    const rows = [
      entry({ id: 'pr', match_type: 'practice' }),
      entry({ id: 'po', match_id: 'm-2', match_type: 'playoff', robot_status: 'no_show' }),
    ];
    expect(reliabilityFor(rows).availability_rate).toBeNull();
    expect(reliabilityFor(rows).no_shows).toBe(0);
  });

  it('never counts a soft-deleted entry, and a deleted duplicate does not hide the live one', () => {
    const rows = [
      entry({ id: 'live', robot_status: 'played' }),
      entry({
        id: 'gone',
        robot_status: 'no_show',
        client_updated_at: '2026-11-14T10:00:00.000Z',
        deleted_at: '2026-11-14T10:01:00.000Z',
      }),
      entry({
        id: 'gone-2',
        match_id: 'm-2',
        robot_status: 'disabled',
        deleted_at: '2026-11-14T10:01:00.000Z',
      }),
    ];
    expect(reliabilityFor(rows)).toEqual({
      breakdowns: 0,
      no_shows: 0,
      disabled: 0,
      available: 1,
      missed: 0,
      availability_rate: 1,
    });
  });

  it('never counts a super entry, and a match entry with no status says nothing', () => {
    const rows = [
      ...season('broke_down'),
      entry({ id: 's', form_kind: 'super', match_id: null, match_type: null, robot_status: null }),
      entry({ id: 'n', match_id: 'm-7', robot_status: null }),
    ];
    expect(reliabilityFor(rows)).toEqual({
      breakdowns: 1,
      no_shows: 0,
      disabled: 0,
      available: 1,
      missed: 0,
      availability_rate: 1,
    });
  });

  it('keeps the same match number in two events apart', () => {
    const rows = [
      entry({ id: 'a', event_id: 'ev-1', match_id: 'm-1', robot_status: 'played' }),
      entry({ id: 'b', event_id: 'ev-2', match_id: 'm-21', robot_status: 'no_show' }),
    ];
    expect(reliabilityFor(rows)).toMatchObject({ available: 1, missed: 1, availability_rate: 0.5 });
  });
});
