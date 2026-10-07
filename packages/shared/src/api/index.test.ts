import { describe, expect, it } from 'vitest';
import { API } from './index';
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
  createMatchInput,
  createMatchOutput,
  deleteMatchInput,
  deleteMatchOutput,
  ensureMatchInput,
  ensureMatchOutput,
  listMatchesInput,
  listMatchesOutput,
  matchRow,
  setMatchTeamsInput,
  updateMatchInput,
} from './matches';
import {
  createTeamInput,
  eventRosterOutput,
  listEventRosterInput,
  listTeamsInput,
  listTeamsOutput,
  setEventRosterInput,
  teamRow,
  updateTeamInput,
} from './teams';
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

describe('the shared API map (SPEC-FINAL 16.1)', () => {
  it('names every registry use case', () => {
    expect(Object.keys(API).sort()).toEqual([
      'changeOwnPassword',
      'countEntriesByScouter',
      'createEvent',
      'createMatch',
      'createSeason',
      'createTeam',
      'createUser',
      'deleteMatch',
      'disableUser',
      'enableUser',
      'ensureMatch',
      'getActiveContext',
      'listEventRoster',
      'listEvents',
      'listMatches',
      'listSeasons',
      'listTeams',
      'listUsers',
      'login',
      'refreshToken',
      'renameUser',
      'reorderEvents',
      'resetPassword',
      'setActiveEvent',
      'setActiveSeason',
      'setEventRoster',
      'setMatchTeams',
      'setUserRole',
      'updateEvent',
      'updateMatch',
      'updateSeason',
      'updateTeam',
    ]);
  });

  it('carries the identical schema objects, so the client and the server cannot drift', () => {
    expect(API.login).toEqual({ input: loginInput, output: loginOutput });
    expect(API.refreshToken).toEqual({ input: refreshTokenInput, output: loginOutput });
    expect(API.changeOwnPassword.input).toBe(changeOwnPasswordInput);
    expect(API.changeOwnPassword.output).toBe(publicUser);
    expect(API.createUser.input).toBe(createUserInput);
    expect(API.setUserRole.input).toBe(setUserRoleInput);
    expect(API.resetPassword.input).toBe(resetPasswordInput);
    expect(API.disableUser.input).toBe(disableUserInput);
    expect(API.enableUser.input).toBe(enableUserInput);
    expect(API.renameUser.input).toBe(renameUserInput);
    expect(API.listUsers).toEqual({ input: listUsersInput, output: listUsersOutput });
    expect(API.getActiveContext).toEqual({
      input: getActiveContextInput,
      output: activeContext,
    });
    expect(API.createSeason).toEqual({ input: createSeasonInput, output: seasonRow });
    expect(API.updateSeason).toEqual({ input: updateSeasonInput, output: seasonRow });
    expect(API.setActiveSeason).toEqual({ input: setActiveSeasonInput, output: activeContext });
    expect(API.listSeasons).toEqual({ input: listSeasonsInput, output: listSeasonsOutput });
    expect(API.createEvent).toEqual({ input: createEventInput, output: eventRow });
    expect(API.updateEvent).toEqual({ input: updateEventInput, output: eventRow });
    expect(API.reorderEvents).toEqual({ input: reorderEventsInput, output: reorderEventsOutput });
    expect(API.setActiveEvent).toEqual({ input: setActiveEventInput, output: activeContext });
    expect(API.listEvents).toEqual({ input: listEventsInput, output: listEventsOutput });
    expect(API.createTeam).toEqual({ input: createTeamInput, output: teamRow });
    expect(API.updateTeam).toEqual({ input: updateTeamInput, output: teamRow });
    expect(API.listTeams).toEqual({ input: listTeamsInput, output: listTeamsOutput });
    expect(API.setEventRoster).toEqual({ input: setEventRosterInput, output: eventRosterOutput });
    expect(API.listEventRoster).toEqual({ input: listEventRosterInput, output: eventRosterOutput });
    expect(API.createMatch).toEqual({ input: createMatchInput, output: createMatchOutput });
    expect(API.updateMatch).toEqual({ input: updateMatchInput, output: matchRow });
    expect(API.setMatchTeams).toEqual({ input: setMatchTeamsInput, output: matchRow });
    expect(API.deleteMatch).toEqual({ input: deleteMatchInput, output: deleteMatchOutput });
    expect(API.listMatches).toEqual({ input: listMatchesInput, output: listMatchesOutput });
    expect(API.ensureMatch).toEqual({ input: ensureMatchInput, output: ensureMatchOutput });
  });
});
