import type { z } from 'zod';
import { API, type Caller } from '@frc/shared';
import type { ServerConfig } from '../config.js';
import type { UseCaseContext } from '../core/context.js';
import { login } from '../core/commands/login.js';
import { refreshToken } from '../core/commands/refreshToken.js';
import {
  changeOwnPassword,
  createUser,
  disableUser,
  enableUser,
  renameUser,
  resetPassword,
  setUserRole,
} from '../core/commands/users.js';
import {
  createEvent,
  listEvents,
  reorderEvents,
  setActiveEvent,
  updateEvent,
} from '../core/commands/events.js';
import {
  createSeason,
  listSeasons,
  setActiveSeason,
  updateSeason,
} from '../core/commands/seasons.js';
import {
  createMatch,
  deleteMatch,
  ensureMatch,
  listMatches,
  setMatchTeams,
  updateMatch,
} from '../core/commands/matches.js';
import {
  createTeam,
  listEventRoster,
  listTeams,
  setEventRoster,
  updateTeam,
} from '../core/commands/teams.js';
import { getActiveContext } from '../core/queries/context.js';
import { listUsers } from '../core/queries/listUsers.js';

type EntryMeta = {
  kind: 'query' | 'command';
  /** Plain language, for a human reading the registry and for a future MCP tool list. */
  description: string;
  input: z.ZodType;
  output: z.ZodType;
};

/** Every use case but two: it takes the caller the HTTP edge built from the bearer. */
export type AuthenticatedEntry = EntryMeta & {
  unauthenticated?: never;
  handler: (
    caller: Caller,
    input: never,
    ctx: UseCaseContext,
    config: ServerConfig,
  ) => Promise<unknown>;
};

/**
 * login and refreshToken only (SPEC-FINAL 16.5). They take NO caller — they produce one —
 * so the handler has no caller parameter and nothing has to fabricate a `service` caller
 * to call it ("Nothing in v1 constructs one").
 */
export type UnauthenticatedEntry = EntryMeta & {
  unauthenticated: true;
  handler: (input: never, ctx: UseCaseContext, config: ServerConfig) => Promise<unknown>;
};

export type RegistryEntry = AuthenticatedEntry | UnauthenticatedEntry;

/**
 * Each entry's `input`/`output` come from the shared API map (SPEC-FINAL 16.1), never a
 * second declaration: the typed client validates with the identical objects.
 */
export const REGISTRY: Record<string, RegistryEntry> = {
  login: {
    kind: 'command',
    description:
      'Exchange a username and password for a 30-day session token. Takes no caller — it produces one. Rate-limited by username.',
    input: API.login.input,
    output: API.login.output,
    unauthenticated: true,
    handler: login,
  },
  refreshToken: {
    kind: 'command',
    description:
      'Exchange a still-valid session token for a fresh one. Takes no caller — it produces one. Rate-limited by username.',
    input: API.refreshToken.input,
    output: API.refreshToken.output,
    unauthenticated: true,
    handler: refreshToken,
  },
  changeOwnPassword: {
    kind: 'command',
    description:
      'Change your own password, given the current one. Acts on the caller only and clears the must-change flag. Rate-limited per user.',
    input: API.changeOwnPassword.input,
    output: API.changeOwnPassword.output,
    handler: changeOwnPassword,
  },
  createUser: {
    kind: 'command',
    description:
      'Admin only: create a user with a username, full name, role and initial password. The full name is the only personal datum stored.',
    input: API.createUser.input,
    output: API.createUser.output,
    handler: createUser,
  },
  setUserRole: {
    kind: 'command',
    description:
      "Admin only: change a user's role. Refuses to demote the last enabled admin. Takes effect on the user's next request.",
    input: API.setUserRole.input,
    output: API.setUserRole.output,
    handler: setUserRole,
  },
  resetPassword: {
    kind: 'command',
    description:
      'Admin only: set a new password for a user, optionally forcing a change at next login. Does not revoke tokens already issued.',
    input: API.resetPassword.input,
    output: API.resetPassword.output,
    handler: resetPassword,
  },
  disableUser: {
    kind: 'command',
    description:
      'Admin only: disable a user. The row and their authorship are kept forever; access ends on their next request. Refuses the last enabled admin.',
    input: API.disableUser.input,
    output: API.disableUser.output,
    handler: disableUser,
  },
  enableUser: {
    kind: 'command',
    description:
      'Admin only: re-enable a disabled user. Clears disabled_at only — it does not reset the password. A no-op on an already-enabled user.',
    input: API.enableUser.input,
    output: API.enableUser.output,
    handler: enableUser,
  },
  renameUser: {
    kind: 'command',
    description:
      "Admin only: change a user's username, full name, or both. The id never changes, so authorship is unaffected. A taken username reads as conflict.",
    input: API.renameUser.input,
    output: API.renameUser.output,
    handler: renameUser,
  },
  listUsers: {
    kind: 'query',
    description:
      'Users for the picker, the admin table and the offline cache, ordered by username and paginated. Excludes disabled users unless asked. Never returns a password hash.',
    input: API.listUsers.input,
    output: API.listUsers.output,
    handler: listUsers,
  },
  getActiveContext: {
    kind: 'query',
    description:
      "The admin's default season and event, which every device opens to. Either may be null: nothing is set up yet, or the season has no event yet. An event id that names no event comes back null.",
    input: API.getActiveContext.input,
    output: API.getActiveContext.output,
    handler: getActiveContext,
  },
  createSeason: {
    kind: 'command',
    description:
      'Admin only: create a season with a unique year, a game name and the path of its game image, which must already be committed and deployed with the client.',
    input: API.createSeason.input,
    output: API.createSeason.output,
    handler: createSeason,
  },
  updateSeason: {
    kind: 'command',
    description:
      "Admin only: correct a season's year, game name or game image path. The image cannot change once the season has entries: a new image needs a new form version.",
    input: API.updateSeason.input,
    output: API.updateSeason.output,
    handler: updateSeason,
  },
  setActiveSeason: {
    kind: 'command',
    description:
      "Admin only: make a season the default every device opens to. The active event stays if it is in that season, else becomes the season's first event, or none.",
    input: API.setActiveSeason.input,
    output: API.setActiveSeason.output,
    handler: setActiveSeason,
  },
  listSeasons: {
    kind: 'query',
    description: 'Every season, newest year first, paginated.',
    input: API.listSeasons.input,
    output: API.listSeasons.output,
    handler: listSeasons,
  },
  createEvent: {
    kind: 'command',
    description:
      'Admin only: create an event in a season. Its name is unique in the season, and it goes last in the season order.',
    input: API.createEvent.input,
    output: API.createEvent.output,
    handler: createEvent,
  },
  updateEvent: {
    kind: 'command',
    description:
      'Admin only: rename an event. Its name stays unique in its season; its order and its season never change here.',
    input: API.updateEvent.input,
    output: API.updateEvent.output,
    handler: updateEvent,
  },
  reorderEvents: {
    kind: 'command',
    description:
      "Admin only: set a season's event display order, naming every event once. Changes display order only; it never re-weights an aggregate.",
    input: API.reorderEvents.input,
    output: API.reorderEvents.output,
    handler: reorderEvents,
  },
  setActiveEvent: {
    kind: 'command',
    description:
      'Admin only: make an event, and with it its season, the default every device opens to. Both are written together, so they never disagree.',
    input: API.setActiveEvent.input,
    output: API.setActiveEvent.output,
    handler: setActiveEvent,
  },
  listEvents: {
    kind: 'query',
    description:
      "A season's events in display order (sort_order, then id), paginated. The order every season-spanning view reads left to right.",
    input: API.listEvents.input,
    output: API.listEvents.output,
    handler: listEvents,
  },
  createTeam: {
    kind: 'command',
    description:
      'Admin only: add a team to the global registry with its number (1..99999) and name. A team number is global and permanent; a taken one reads as conflict.',
    input: API.createTeam.input,
    output: API.createTeam.output,
    handler: createTeam,
  },
  updateTeam: {
    kind: 'command',
    description:
      'Admin only: rename a team. The number is permanent and cannot be changed; sending one is refused.',
    input: API.updateTeam.input,
    output: API.updateTeam.output,
    handler: updateTeam,
  },
  listTeams: {
    kind: 'query',
    description:
      'The global team registry by number, paginated. An optional query matches a number prefix or a case-insensitive name substring, taken literally.',
    input: API.listTeams.input,
    output: API.listTeams.output,
    handler: listTeams,
  },
  setEventRoster: {
    kind: 'command',
    description:
      "Admin only: make a list of teams an event's roster (at most 200). Removals are soft-deleted so they reach every device; a team added back reuses its old row.",
    input: API.setEventRoster.input,
    output: API.setEventRoster.output,
    handler: setEventRoster,
  },
  listEventRoster: {
    kind: 'query',
    description: "An event's live roster by team number: each team's id, number and name.",
    input: API.listEventRoster.input,
    output: API.listEventRoster.output,
    handler: listEventRoster,
  },
  createMatch: {
    kind: 'command',
    description:
      'Admin only: create one match by type and number (an existing one is a conflict), or matches 1..count in bulk, skipping numbers that exist. Returns the matches it created.',
    input: API.createMatch.input,
    output: API.createMatch.output,
    handler: createMatch,
  },
  updateMatch: {
    kind: 'command',
    description:
      "Admin only: correct a match's type and/or number. Never moves it to another event and never touches its slots; the corrected number must be free.",
    input: API.updateMatch.input,
    output: API.updateMatch.output,
    handler: updateMatch,
  },
  setMatchTeams: {
    kind: 'command',
    description:
      "Admin only: set a match's filled alliance slots (red and blue, stations 1..3). Omitted slots are cleared; a newly placed team must be on the event's roster.",
    input: API.setMatchTeams.input,
    output: API.setMatchTeams.output,
    handler: setMatchTeams,
  },
  deleteMatch: {
    kind: 'command',
    description:
      'Admin only: delete a match and its slots. Refused while any entry names it; correct the match number instead.',
    input: API.deleteMatch.input,
    output: API.deleteMatch.output,
    handler: deleteMatch,
  },
  listMatches: {
    kind: 'query',
    description:
      "An event's matches with their filled slots: practice, then qualification, then playoff, each by number, paginated.",
    input: API.listMatches.input,
    output: API.listMatches.output,
    handler: listMatches,
  },
  ensureMatch: {
    kind: 'command',
    description:
      'Any authenticated user: create the bare match row (event, type and number only, no teams) when a scouter enters an unknown match number. A no-op returning the existing id if it exists. Cannot set teams, edit or delete.',
    input: API.ensureMatch.input,
    output: API.ensureMatch.output,
    handler: ensureMatch,
  },
};
