import { z } from 'zod';
import { NAME_MAX_LENGTH } from './context';

/**
 * The wire schemas of the team and roster use cases (SPEC-FINAL 3.1, 6.4; task 1.19).
 * `teams` is the global registry: a team number is global and permanent, its name is
 * editable. `event_teams` is one event's roster, soft-deleted so a removal propagates
 * through sync. The commands are admin only (`manage_events`); the lists are queries
 * every role may call. Browser-safe: zod only.
 *
 * Every input is strict, so a field a use case does not take is REFUSED rather than
 * dropped: `updateTeam` cannot renumber a team, and a client that sends `number` to it
 * should hear so.
 */

/** Wire ids are uuids: every primary key is one (SPEC-FINAL 3). */
const uuid = z.string().uuid();

export const TEAM_NUMBER_MIN = 1;
/** FRC team numbers are at most five digits. */
export const TEAM_NUMBER_MAX = 99999;
/** The longest `listTeams` query: a name is at most NAME_MAX_LENGTH characters. */
export const TEAM_QUERY_MAX_LENGTH = NAME_MAX_LENGTH;
/** The most teams one event's roster may hold; an FRC event has well under 100. */
export const ROSTER_MAX_TEAMS = 200;

export const LIST_TEAMS_DEFAULT_LIMIT = 50;
/** A larger `limit` is clamped to this, not rejected: `next_cursor` says there is more. */
export const LIST_TEAMS_MAX_LIMIT = 200;

const teamNumber = z.number().int().min(TEAM_NUMBER_MIN).max(TEAM_NUMBER_MAX);
const teamName = z.string().trim().min(1).max(NAME_MAX_LENGTH);

/** A team as it leaves the server. `teams` has no `version` column. */
export const teamRow = z.object({
  id: uuid,
  number: z.number().int(),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type TeamRow = z.infer<typeof teamRow>;

/** The server generates the id: teams are made by an admin online, never offline. */
export const createTeamInput = z.object({ number: teamNumber, name: teamName }).strict();
export type CreateTeamInput = z.input<typeof createTeamInput>;

/** A rename only. The number is permanent (SPEC-FINAL 6.4), so it is not an input. */
export const updateTeamInput = z.object({ team_id: uuid, name: teamName }).strict();
export type UpdateTeamInput = z.input<typeof updateTeamInput>;

/**
 * `query` matches a team-number prefix or a case-insensitive name substring. It is
 * trimmed, and a blank one is no query at all. Every character in it is literal: a `%`
 * or `_` is not a wildcard.
 */
export const listTeamsInput = z
  .object({
    query: z
      .string()
      .trim()
      .max(TEAM_QUERY_MAX_LENGTH)
      .optional()
      .transform((value) => (value ? value : undefined)),
    limit: z.number().int().min(1).optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();
export type ListTeamsInput = z.input<typeof listTeamsInput>;

/** By team number. */
export const listTeamsOutput = z.object({
  items: z.array(teamRow),
  next_cursor: z.string().nullable(),
});
export type ListTeamsOutput = z.infer<typeof listTeamsOutput>;

/** One team on an event's live roster. */
export const rosterRow = z.object({
  team_id: uuid,
  number: z.number().int(),
  name: z.string(),
});
export type RosterRow = z.infer<typeof rosterRow>;

/**
 * `team_ids` is the event's whole new roster. A team left out is removed (soft-deleted);
 * a team named again after a removal comes back on its old row. Each team at most once.
 */
export const setEventRosterInput = z
  .object({
    event_id: uuid,
    team_ids: z
      .array(uuid)
      .max(ROSTER_MAX_TEAMS)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'name each team only once',
      }),
  })
  .strict();
export type SetEventRosterInput = z.input<typeof setEventRosterInput>;

export const listEventRosterInput = z.object({ event_id: uuid }).strict();
export type ListEventRosterInput = z.input<typeof listEventRosterInput>;

/**
 * An event's live roster, by team number. Not paginated: `setEventRoster` bounds a
 * roster at ROSTER_MAX_TEAMS, and the admin page and the robot picker want all of it.
 */
export const eventRosterOutput = z.object({ items: z.array(rosterRow) });
export type EventRosterOutput = z.infer<typeof eventRosterOutput>;
