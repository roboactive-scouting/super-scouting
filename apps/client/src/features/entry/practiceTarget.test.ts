import { describe, expect, it } from 'vitest';
import type { LineupSlot } from '@/lib/derive/entries';
import { practiceTarget } from './practiceTarget';

const matches = [
  { id: 'q2', match_type: 'qualification', number: 2 },
  { id: 'q1', match_type: 'qualification', number: 1 },
  { id: 'q3', match_type: 'qualification', number: 3 },
  { id: 'bare', match_type: 'qualification', number: 4 },
];
const lineup = (match_id: string): LineupSlot[] => [
  { match_id, team_id: `${match_id}-b2`, alliance: 'blue', station: 2 },
  { match_id, team_id: `${match_id}-r1`, alliance: 'red', station: 1 },
  { match_id, team_id: `${match_id}-r2`, alliance: 'red', station: 2 },
];
const slots = [...lineup('q1'), ...lineup('q2'), ...lineup('q3')];
const none = new Set<string>();

describe('practiceTarget (SPEC-FINAL 8.5)', () => {
  it('takes the robot Scout had picked when its match is on this device', () => {
    const prefer = { matchId: 'q3', teamId: 'x', alliance: 'blue' as const };
    expect(practiceTarget({ matches, slots, station: null, scoutedMatchIds: none, prefer })).toBe(
      prefer,
    );
  });

  it('ignores a preferred match the device does not hold', () => {
    const prefer = { matchId: 'gone', teamId: 'x', alliance: 'blue' as const };
    expect(
      practiceTarget({ matches, slots, station: null, scoutedMatchIds: none, prefer })?.matchId,
    ).toBe('q1');
  });

  it('opens the first match with a line-up this device has not scouted, at the scout station', () => {
    expect(
      practiceTarget({ matches, slots, station: 'B2', scoutedMatchIds: new Set(['q1']) }),
    ).toEqual({ matchId: 'q2', teamId: 'q2-b2', alliance: 'blue' });
  });

  it('takes Red 1 when the device has no station', () => {
    expect(practiceTarget({ matches, slots, station: null, scoutedMatchIds: none })).toEqual({
      matchId: 'q1',
      teamId: 'q1-r1',
      alliance: 'red',
    });
  });

  it('walks on to the next match for Practice another match, wrapping at the end', () => {
    const base = { matches, slots, station: 'R2' as const, scoutedMatchIds: none };
    expect(practiceTarget({ ...base, after: 'q1' })?.matchId).toBe('q2');
    expect(practiceTarget({ ...base, after: 'q3' })).toEqual({
      matchId: 'q1',
      teamId: 'q1-r2',
      alliance: 'red',
    });
  });

  it('never picks a match with no line-up, and gives up when none has one', () => {
    expect(practiceTarget({ matches, slots: [], station: null, scoutedMatchIds: none })).toBeNull();
  });
});
