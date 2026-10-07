import { describe, expect, it } from 'vitest';
import {
  bulkResultLine,
  checkCreateField,
  matchPatch,
  missingLine,
  nextNumber,
  offRosterTeamIds,
  resolveTyped,
  rosterSuggestions,
  toggled,
  withSlot,
} from './matchOps';
import {
  Q10_PARTIAL,
  Q7_ONE_EMPTY,
  Q8_WITH_7845,
  Q9_FULL,
  qual,
  ROSTER_22,
  ROSTER_IDS,
  T7845,
  tid,
} from './matchFixtures';

describe('matchOps', () => {
  it('lists the matches missing robots in words', () => {
    expect(missingLine([Q9_FULL])).toBeNull();
    expect(missingLine([Q7_ONE_EMPTY])).toBe('Q7 is missing robots');
    expect(missingLine([Q7_ONE_EMPTY, Q9_FULL, Q10_PARTIAL])).toBe('Q7 and Q10 are missing robots');
    const many = [1, 2, 3, 4, 5, 6].map((n) => qual(n, [0, 0, 0, 0, 0, 0]));
    expect(missingLine(many.slice(0, 3))).toBe('Q1, Q2 and Q3 are missing robots');
    expect(missingLine(many)).toBe('Q1, Q2, Q3 and 3 more are missing robots');
  });

  it('finds line-up teams that are not on the roster, once each', () => {
    expect(offRosterTeamIds([Q8_WITH_7845, Q8_WITH_7845, Q9_FULL], ROSTER_IDS)).toEqual([T7845]);
  });

  it('changes one station and keeps the rest, in station order', () => {
    expect(withSlot(Q10_PARTIAL.slots, 'blue', 1, tid(6230))).toEqual([
      { alliance: 'red', station: 1, team_id: tid(5951) },
      { alliance: 'red', station: 2, team_id: tid(1937) },
      { alliance: 'blue', station: 1, team_id: tid(6230) },
    ]);
    expect(withSlot(Q10_PARTIAL.slots, 'red', 1, null)).toEqual([
      { alliance: 'red', station: 2, team_id: tid(1937) },
    ]);
  });

  it('suggests roster teams by number prefix or name', () => {
    expect(rosterSuggestions(ROSTER_22, '62').map((r) => r.number)).toEqual([6230, 6238]);
    expect(rosterSuggestions(ROSTER_22, 'koi').map((r) => r.number)).toEqual([6230]);
    expect(rosterSuggestions(ROSTER_22, ' ')).toEqual([]);
  });

  it('reads what was typed: blank clears, a roster number fills, the team already there stays', () => {
    expect(resolveTyped('', ROSTER_22, null)).toEqual({ kind: 'empty' });
    expect(resolveTyped('6230', ROSTER_22, null)).toEqual({ kind: 'team', teamId: tid(6230) });
    expect(resolveTyped('team koi', ROSTER_22, null)).toEqual({ kind: 'team', teamId: tid(6230) });
    expect(resolveTyped('7845', ROSTER_22, { teamId: T7845, number: 7845 })).toEqual({
      kind: 'team',
      teamId: T7845,
    });
    expect(resolveTyped('7845', ROSTER_22, null)).toEqual({ kind: 'unknown', text: '7845' });
  });

  it('words a bulk create and finds the next free number', () => {
    expect(bulkResultLine('playoff', 1, 1)).toBe('Created 1 playoff match.');
    expect(bulkResultLine('qualification', 3, 1)).toBe(
      'Created 1 qualification match; 2 already existed.',
    );
    expect(nextNumber([Q7_ONE_EMPTY, Q10_PARTIAL], 'qualification')).toBe(11);
    expect(nextNumber([Q7_ONE_EMPTY], 'playoff')).toBe(1);
  });

  it('builds a type/number patch with the shared rule', () => {
    expect(matchPatch(Q10_PARTIAL, 'qualification', '10')).toEqual({ patch: {} });
    expect(matchPatch(Q10_PARTIAL, 'playoff', '3')).toEqual({
      patch: { match_type: 'playoff', number: 3 },
    });
    expect(matchPatch(Q10_PARTIAL, 'qualification', '0')).toHaveProperty('error');
  });

  it('checks a create field with the shared rule: the number, or the line saying why not', () => {
    expect(checkCreateField('count', '72')).toBe(72);
    expect(checkCreateField('number', '11')).toBe(11);
    expect(typeof checkCreateField('count', '0')).toBe('string');
    expect(typeof checkCreateField('number', 'abc')).toBe('string');
  });

  it('adds or drops one id, leaving the set it was given alone', () => {
    const before: ReadonlySet<string> = new Set(['a']);
    expect([...toggled(before, 'b', true)]).toEqual(['a', 'b']);
    expect([...toggled(before, 'a', false)]).toEqual([]);
    expect([...before]).toEqual(['a']);
  });
});
