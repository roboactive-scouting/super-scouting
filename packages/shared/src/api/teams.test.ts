import { describe, expect, it } from 'vitest';
import {
  ROSTER_MAX_TEAMS,
  createTeamInput,
  listTeamsInput,
  setEventRosterInput,
  updateTeamInput,
} from './teams';

const EVENT = '00000000-0000-4000-8000-000000000002';
const TEAM = '00000000-0000-4000-8000-00000000000a';

describe('the team and roster wire schemas (SPEC-FINAL 3.1, 6.4; task 1.19)', () => {
  it('createTeam takes a number 1..99999 and a trimmed name', () => {
    expect(createTeamInput.parse({ number: 2096, name: ' RoboActive ' })).toEqual({
      number: 2096,
      name: 'RoboActive',
    });
    expect(createTeamInput.safeParse({ number: 0, name: 'X' }).success).toBe(false);
    expect(createTeamInput.safeParse({ number: 100000, name: 'X' }).success).toBe(false);
  });

  it('updateTeam renames only: a number is refused, not dropped', () => {
    expect(updateTeamInput.safeParse({ team_id: TEAM, name: 'X' }).success).toBe(true);
    expect(updateTeamInput.safeParse({ team_id: TEAM, name: 'X', number: 1 }).success).toBe(false);
  });

  it('setEventRoster refuses a duplicate team and more than the bound', () => {
    expect(setEventRosterInput.safeParse({ event_id: EVENT, team_ids: [] }).success).toBe(true);
    expect(setEventRosterInput.safeParse({ event_id: EVENT, team_ids: [TEAM, TEAM] }).success).toBe(
      false,
    );
    expect(ROSTER_MAX_TEAMS).toBe(200);
  });

  it('listTeams trims the query and treats a blank one as none', () => {
    expect(listTeamsInput.parse({ query: '  20 ' })).toEqual({ query: '20' });
    expect(listTeamsInput.parse({ query: '   ' })).toEqual({});
  });
});
