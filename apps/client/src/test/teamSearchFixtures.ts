import type { SearchTeamsOutput } from '@frc/shared';
import { db } from '@/data/db';

/*
 * Team search (task 1.51) unit fixtures: the device's rows for one event (roster, entries, the
 * match form with one scored counter), and the server's answer for the same page online.
 */

export const EVENT_ID = 'ev-1';
export const EVENT_NAME = 'District #3 · Tel Aviv';

/** [id, number, name, on ev-1's roster, notes scored per played entry (5 points each)] */
const TEAMS: [string, number, string, boolean, number[]][] = [
  ['t-1', 2096, 'ROBACTIVE', true, [6, 8]], // avg 35 → rank 1
  ['t-2', 1577, 'Steampunk', true, [4]], // 20 → rank 2
  ['t-3', 5987, 'Galaxia', true, [2]], // 10 → rank 3 (its no-show below is not a zero)
  ['t-6', 4590, 'GreenBlitz', true, [1]], // 5 → rank 4
  ['t-5', 1690, 'Orbit', true, []], // no entries: not ranked yet
  ['t-4', 3339, 'BumbleB', false, []], // the season's, not at ev-1
];

const T = '2026-03-17T08:00:00.000Z';

/** Writes the cached rows the offline list reads. */
export async function seedTeamCache(): Promise<void> {
  const entries: Record<string, unknown>[] = [];
  let n = 0;
  for (const [id, , , , notes] of TEAMS) {
    for (const scored of notes) {
      n += 1;
      entries.push({
        entity: 'scouting_entries',
        id: `e-${n}`,
        form_version_id: 'fv-1',
        form_kind: 'match',
        event_id: EVENT_ID,
        match_id: `m-${n}`,
        team_id: id,
        alliance: 'red',
        scouter_id: 'u-1',
        robot_status: 'played',
        breakdown_seconds: null,
        data: { notes: scored },
        client_created_at: T,
        client_updated_at: T,
        deleted_at: null,
      });
    }
  }
  const matches = entries.map((e, i) => ({
    entity: 'matches',
    id: e.match_id,
    event_id: EVENT_ID,
    match_type: 'qualification',
    number: i + 1,
  }));
  await db.rows.bulkPut([
    { entity: 'app_settings', id: 'true', active_season_id: 'se-1', active_event_id: EVENT_ID },
    { entity: 'seasons', id: 'se-1', year: 2026, game_name: 'REBUILT' },
    { entity: 'events', id: EVENT_ID, season_id: 'se-1', name: EVENT_NAME, sort_order: 3 },
    ...TEAMS.map(([id, number, name]) => ({ entity: 'teams', id, number, name })),
    ...TEAMS.filter(([, , , on]) => on).map(([id]) => ({
      entity: 'event_teams',
      id: `r-${id}`,
      event_id: EVENT_ID,
      team_id: id,
      deleted_at: null,
    })),
    {
      entity: 'forms',
      id: 'fm-1',
      season_id: 'se-1',
      kind: 'match',
      name: 'Match',
      active_version_id: 'fv-1',
    },
    {
      entity: 'form_fields',
      id: 'ff-1',
      form_version_id: 'fv-1',
      key: 'notes',
      label: 'Notes scored',
      help_text: null,
      type: 'counter',
      section: null,
      display_order: 1,
      required: false,
      default_value: null,
      config: { min: 0, max: 20, step: 1 },
      visibility_condition: null,
      deprecated: false,
      description: 'Notes scored',
      unit: 'count',
      phase: 'teleop',
      direction: 'higher_is_better',
      category: null,
      expected_range: null,
      include_in_ai_context: null,
      is_ordinal: null,
    },
    {
      entity: 'scoring_rules',
      id: 'sr-1',
      form_id: 'fm-1',
      field_key: 'notes',
      points: 5,
      option_points: null,
    },
    ...matches,
    ...entries,
    // A no-show for Galaxia: it never counts as zero points, and it is still an entry here.
    {
      entity: 'scouting_entries',
      id: 'e-ns',
      form_version_id: 'fv-1',
      form_kind: 'match',
      event_id: EVENT_ID,
      match_id: 'm-1',
      team_id: 't-3',
      alliance: 'blue',
      scouter_id: 'u-1',
      robot_status: 'no_show',
      breakdown_seconds: null,
      data: {},
      client_created_at: T,
      client_updated_at: T,
      deleted_at: null,
    },
  ] as never);
}

/** The server's answer for the plan's four teams: ranks 1, 3 and 9 here, 3339 elsewhere. */
export const SERVER_TEAMS: SearchTeamsOutput = {
  items: [
    {
      id: 't-1',
      number: 2096,
      name: 'ROBACTIVE',
      in_active_event: true,
      rank: 1,
      entries_here: 11,
      other_events: [],
    },
    {
      id: 't-2',
      number: 1577,
      name: 'Steampunk',
      in_active_event: true,
      rank: 3,
      entries_here: 10,
      other_events: [],
    },
    {
      id: 't-3',
      number: 5987,
      name: 'Galaxia',
      in_active_event: true,
      rank: 9,
      entries_here: 9,
      other_events: [],
    },
    {
      id: 't-4',
      number: 3339,
      name: 'BumbleB',
      in_active_event: false,
      rank: null,
      entries_here: 0,
      other_events: [{ id: 'ev-2', name: 'Week 3 · Haifa' }],
    },
  ],
  counts: { all: 4, at_event: 3, other: 1 },
  event: { id: EVENT_ID, name: EVENT_NAME },
  next_cursor: null,
};
