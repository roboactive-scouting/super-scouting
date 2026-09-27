import { loginInput, loginOutput, refreshTokenInput } from './auth';
import {
  activeContext,
  createEventInput,
  createSeasonInput,
  eventRow,
  getActiveContextInput,
  listEventsInput,
  listEventsOutput,
  listSeasonsInput,
  listSeasonsOutput,
  reorderEventsInput,
  reorderEventsOutput,
  seasonRow,
  setActiveEventInput,
  setActiveSeasonInput,
  updateEventInput,
  updateSeasonInput,
} from './context';
import {
  changeOwnPasswordInput,
  createUserInput,
  disableUserInput,
  enableUserInput,
  listUsersInput,
  listUsersOutput,
  publicUser,
  renameUserInput,
  resetPasswordInput,
  setUserRoleInput,
} from './users';

/**
 * SPEC-FINAL 16.1: "the Zod schemas in packages/shared are the single validation source
 * for both sides". One row per registry use case, name → its input and output schema.
 * The server's REGISTRY reads `input`/`output` from here, and the client's typed
 * `call(name, input)` is derived from it, so a renamed field is a compile error at the
 * call site rather than `undefined` at a venue.
 *
 * Every task that adds a use case adds its row here as well.
 */
export const API = {
  login: { input: loginInput, output: loginOutput },
  refreshToken: { input: refreshTokenInput, output: loginOutput },
  changeOwnPassword: { input: changeOwnPasswordInput, output: publicUser },
  createUser: { input: createUserInput, output: publicUser },
  setUserRole: { input: setUserRoleInput, output: publicUser },
  resetPassword: { input: resetPasswordInput, output: publicUser },
  disableUser: { input: disableUserInput, output: publicUser },
  enableUser: { input: enableUserInput, output: publicUser },
  renameUser: { input: renameUserInput, output: publicUser },
  listUsers: { input: listUsersInput, output: listUsersOutput },
  getActiveContext: { input: getActiveContextInput, output: activeContext },
  createSeason: { input: createSeasonInput, output: seasonRow },
  updateSeason: { input: updateSeasonInput, output: seasonRow },
  setActiveSeason: { input: setActiveSeasonInput, output: activeContext },
  listSeasons: { input: listSeasonsInput, output: listSeasonsOutput },
  createEvent: { input: createEventInput, output: eventRow },
  updateEvent: { input: updateEventInput, output: eventRow },
  reorderEvents: { input: reorderEventsInput, output: reorderEventsOutput },
  setActiveEvent: { input: setActiveEventInput, output: activeContext },
  listEvents: { input: listEventsInput, output: listEventsOutput },
} as const;

export type Api = typeof API;
export type ApiName = keyof Api;

/** The two use cases that take no caller (SPEC-FINAL 16.5): no bearer is sent to them. */
export const UNAUTHENTICATED_USE_CASES = [
  'login',
  'refreshToken',
] as const satisfies readonly ApiName[];
