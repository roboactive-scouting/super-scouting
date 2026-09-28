import { describe, expect, it } from 'vitest';
import {
  MATCH_TYPES,
  createMatchInput,
  ensureMatchInput,
  matchRow,
  setMatchTeamsInput,
  updateMatchInput,
} from './matches';

const EVENT = '00000000-0000-4000-8000-000000000002';
const MATCH = '00000000-0000-4000-8000-000000000003';
const TEAM_A = '00000000-0000-4000-8000-00000000000a';
const TEAM_B = '00000000-0000-4000-8000-00000000000b';

describe('the match wire schemas (SPEC-FINAL 3.1, 6.4; task 1.19)', () => {
  it('orders the match types the way every list renders them', () => {
    expect(MATCH_TYPES).toEqual(['practice', 'qualification', 'playoff']);
  });

  it('createMatch takes exactly one of number and count', () => {
    const base = { event_id: EVENT, match_type: 'qualification' };
    expect(createMatchInput.safeParse({ ...base, number: 1 }).success).toBe(true);
    expect(createMatchInput.safeParse({ ...base, count: 200 }).success).toBe(true);
    expect(createMatchInput.safeParse(base).success).toBe(false);
    expect(createMatchInput.safeParse({ ...base, number: 1, count: 2 }).success).toBe(false);
    expect(createMatchInput.safeParse({ ...base, count: 201 }).success).toBe(false);
    expect(createMatchInput.safeParse({ ...base, number: 1000 }).success).toBe(false);
  });

  it('updateMatch needs a change and refuses the event or the slots', () => {
    expect(updateMatchInput.safeParse({ match_id: MATCH, number: 2 }).success).toBe(true);
    expect(updateMatchInput.safeParse({ match_id: MATCH }).success).toBe(false);
    expect(updateMatchInput.safeParse({ match_id: MATCH, event_id: EVENT }).success).toBe(false);
    expect(updateMatchInput.safeParse({ match_id: MATCH, slots: [] }).success).toBe(false);
  });

  it('setMatchTeams refuses a seventh slot, one station twice and one team twice', () => {
    const slot = (alliance: 'red' | 'blue', station: number, team_id: string) => ({
      alliance,
      station,
      team_id,
    });
    expect(setMatchTeamsInput.safeParse({ match_id: MATCH, slots: [] }).success).toBe(true);
    expect(
      setMatchTeamsInput.safeParse({
        match_id: MATCH,
        slots: [slot('red', 1, TEAM_A), slot('red', 1, TEAM_B)],
      }).success,
    ).toBe(false);
    expect(
      setMatchTeamsInput.safeParse({
        match_id: MATCH,
        slots: [slot('red', 1, TEAM_A), slot('blue', 1, TEAM_A)],
      }).success,
    ).toBe(false);
    const seven = Array.from({ length: 7 }, (_, i) =>
      slot(i < 3 ? 'red' : 'blue', (i % 3) + 1, `00000000-0000-4000-8000-00000000010${i}`),
    );
    expect(setMatchTeamsInput.safeParse({ match_id: MATCH, slots: seven }).success).toBe(false);
  });

  it('ensureMatch is event, type and number with a client id, and nothing else', () => {
    const bare = { id: MATCH, event_id: EVENT, match_type: 'playoff', number: 3 };
    expect(ensureMatchInput.parse(bare)).toEqual(bare);
    expect(ensureMatchInput.safeParse({ ...bare, slots: [] }).success).toBe(false);
    expect(ensureMatchInput.safeParse({ ...bare, id: 'm-1' }).success).toBe(false);
  });

  it('a match row carries its slots', () => {
    expect(
      matchRow.safeParse({
        id: MATCH,
        event_id: EVENT,
        match_type: 'qualification',
        number: 1,
        created_at: 'x',
        updated_at: 'x',
        slots: [{ alliance: 'red', station: 1, team_id: TEAM_A }],
      }).success,
    ).toBe(true);
  });
});
