import { describe, expect, it } from 'vitest';
import type { EntryShape } from './entryShape';
import { validateEntryShape } from './entryShape';

const matchEntry = (over: Partial<EntryShape> = {}): EntryShape => ({
  form_kind: 'match',
  match_id: 'm-1',
  alliance: 'red',
  robot_status: 'played',
  breakdown_seconds: null,
  ...over,
});

const superEntry = (over: Partial<EntryShape> = {}): EntryShape => ({
  form_kind: 'super',
  match_id: null,
  alliance: null,
  robot_status: null,
  breakdown_seconds: null,
  ...over,
});

describe('validateEntryShape', () => {
  it('accepts a complete match entry', () => {
    expect(validateEntryShape(matchEntry())).toEqual([]);
  });

  it('rejects a match entry missing its match', () => {
    const issues = validateEntryShape(matchEntry({ match_id: null }));
    expect(issues).toEqual(['a match entry needs a match']);
  });

  it('rejects a match entry missing its alliance', () => {
    const issues = validateEntryShape(matchEntry({ alliance: null }));
    expect(issues).toEqual(['a match entry needs an alliance']);
  });

  it('rejects a match entry missing its robot status', () => {
    const issues = validateEntryShape(matchEntry({ robot_status: null }));
    expect(issues).toEqual(['a match entry needs a robot status']);
  });

  it('accepts a clean super entry', () => {
    expect(validateEntryShape(superEntry())).toEqual([]);
  });

  it('rejects a super entry that carries a match', () => {
    const issues = validateEntryShape(superEntry({ match_id: 'm-1' }));
    expect(issues).toEqual(['a super entry has no match']);
  });

  it('rejects a super entry that carries an alliance', () => {
    const issues = validateEntryShape(superEntry({ alliance: 'red' }));
    expect(issues).toEqual(['a super entry has no alliance']);
  });

  it('rejects a super entry that carries a robot status', () => {
    const issues = validateEntryShape(superEntry({ robot_status: 'played' }));
    expect(issues).toEqual(['a super entry has no robot status']);
  });

  it('rejects a super entry that carries a breakdown time', () => {
    // breakdown_seconds is non-null while robot_status stays null (not 'broke_down'),
    // so this also trips the fourth, cross-cutting rule below it in the same call.
    const issues = validateEntryShape(superEntry({ breakdown_seconds: 30 }));
    expect(issues).toEqual([
      'a super entry has no breakdown time',
      'breakdown time is recorded only when the robot broke down',
    ]);
  });

  it('rejects broke_down without a breakdown time', () => {
    const issues = validateEntryShape(matchEntry({ robot_status: 'broke_down' }));
    expect(issues).toEqual(['a robot that broke down needs its breakdown time in seconds']);
  });

  it('rejects a breakdown time when the robot did not break down', () => {
    const issues = validateEntryShape(matchEntry({ breakdown_seconds: 45 }));
    expect(issues).toEqual(['breakdown time is recorded only when the robot broke down']);
  });

  it('accepts no_show with a null breakdown time', () => {
    expect(
      validateEntryShape(matchEntry({ robot_status: 'no_show', breakdown_seconds: null })),
    ).toEqual([]);
  });
});
