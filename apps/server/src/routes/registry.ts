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
};
