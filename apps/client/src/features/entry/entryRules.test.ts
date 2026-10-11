import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from '@frc/shared';
import { entryProblems, entryView, isAnswered, rangeProblem, requiredLine } from './entryRules';
import { phasesOf } from './phases';

const f = (over: Partial<FormFieldDefinition>): FormFieldDefinition => ({
  id: over.key ?? 'f',
  key: 'k',
  label: 'L',
  help_text: null,
  type: 'counter',
  section: null,
  display_order: 1,
  required: false,
  default_value: null,
  config: {},
  visibility_condition: null,
  deprecated: false,
  description: 'x',
  unit: 'count',
  phase: 'teleop',
  direction: 'higher_is_better',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
  ...over,
});

const cycle = f({
  key: 'cycle',
  label: 'Cycle estimate',
  type: 'number',
  unit: 'seconds',
  expected_range: { min: 3, max: 60 },
});

describe('rangeProblem', () => {
  it('names the limit in words, with the unit, and the value in the reason', () => {
    expect(rangeProblem(cycle, 140)).toEqual({
      reason: '140 is over the most, 60',
      line: 'Most is 60 seconds — check this number',
    });
    expect(rangeProblem(cycle, 1)).toEqual({
      reason: '1 is under the least, 3',
      line: 'Least is 3 seconds — check this number',
    });
    expect(rangeProblem(cycle, 60)).toBeNull();
    expect(rangeProblem(cycle, undefined)).toBeNull();
  });

  it('checks the input limits before the expected range, as the validator does; a count is bare', () => {
    const counter = f({ config: { min: 0, max: 99 }, expected_range: { min: 0, max: 10 } });
    expect(rangeProblem(counter, 120)?.line).toBe('Most is 99 — check this number');
    expect(rangeProblem(counter, 11)?.line).toBe('Most is 10 — check this number');
  });

  it('is never raised for a type without a range', () => {
    expect(rangeProblem(f({ type: 'rating', config: { max: 5 } }), 9)).toBeNull();
  });
});

describe('entryView', () => {
  const climbed = f({ key: 'climbed', type: 'toggle', unit: 'boolean', phase: 'endgame' });
  const time = f({
    key: 'climb_time',
    type: 'number',
    phase: 'endgame',
    visibility_condition: { field_key: 'climbed', op: '=', value: true },
  });
  const total = f({
    key: 'total',
    type: 'computed',
    config: {
      result_type: 'float',
      expression: {
        kind: 'op',
        op: '*',
        left: { kind: 'field', key: 'n' },
        right: { kind: 'literal', value: 5 },
      },
    },
  });
  const n = f({ key: 'n' });

  it('leaves a hidden field out of what is shown and saved, and works out a computed one', () => {
    const fields = [climbed, time, n, total];
    const hidden = entryView(fields, { climbed: false, climb_time: 9, n: 2 });
    expect(hidden.shown.map((x) => x.key)).toEqual(['climbed', 'n', 'total']);
    expect(hidden.saved).toEqual({ climbed: false, n: 2, total: 10 });
    const shown = entryView(fields, { climbed: true, climb_time: 9, n: 2 });
    expect(shown.saved).toEqual({ climbed: true, climb_time: 9, n: 2, total: 10 });
  });

  it('hides a field whose controlling field is itself hidden (a chain)', () => {
    const detail = f({
      key: 'detail',
      type: 'short_text',
      phase: 'endgame',
      visibility_condition: { field_key: 'climb_time', op: '>', value: 5 },
    });
    const view = entryView([climbed, time, detail], { climbed: false, climb_time: 9, detail: 'x' });
    expect(view.shown.map((x) => x.key)).toEqual(['climbed']);
    expect(view.saved).toEqual({ climbed: false });
  });
});

describe('entryProblems', () => {
  const level = f({
    key: 'level',
    label: 'Climb level',
    type: 'single_select',
    unit: 'enum',
    phase: 'endgame',
    required: true,
    config: { options: [{ value: 'a', label: 'A' }] },
  });
  const timer = f({
    key: 'hang',
    label: 'Hang time',
    type: 'timer',
    unit: 'seconds',
    phase: 'auto',
    required: true,
  });
  const notRunning = () => false;

  it('lists every problem in phase order, the breakdown time first', () => {
    const phases = phasesOf([level, cycle, timer]);
    const problems = entryProblems({
      phases,
      values: { cycle: 140 },
      breakdownMissing: true,
      running: notRunning,
    });
    expect(problems.map((p) => [p.key, p.phase, p.kind])).toEqual([
      ['breakdown_seconds', null, 'breakdown'],
      ['hang', 'auto', 'required'],
      ['cycle', 'teleop', 'range'],
      ['level', 'endgame', 'required'],
    ]);
    expect(problems[3]?.line).toBe('Required — pick one');
  });

  it('takes a Timer’s "unsure" (null) as answered, and flags a stopwatch left running', () => {
    const phases = phasesOf([timer]);
    expect(
      entryProblems({
        phases,
        values: { hang: null },
        breakdownMissing: false,
        running: notRunning,
      }),
    ).toEqual([]);
    const running = entryProblems({
      phases,
      values: { hang: 4.2 },
      breakdownMissing: false,
      running: (key) => key === 'hang',
    });
    expect(running).toMatchObject([
      { key: 'hang', kind: 'running', reason: 'still running — stop it' },
    ]);
  });

  it('never asks anything of a section or a computed field', () => {
    const phases = phasesOf([
      f({ key: 's', type: 'section', phase: null, required: true }),
      f({ key: 'c', type: 'computed', required: true, config: { expression: null } }),
      f({ key: 'x' }),
    ]);
    expect(
      entryProblems({ phases, values: {}, breakdownMissing: false, running: notRunning }),
    ).toEqual([]);
  });
});

describe('isAnswered and requiredLine', () => {
  it('reads an empty list and an empty text as unanswered, a 0 as answered', () => {
    expect(isAnswered(cycle, 0)).toBe(true);
    expect(isAnswered(cycle, '')).toBe(false);
    expect(isAnswered(f({ type: 'multi_select' }), [])).toBe(false);
  });

  it('says what answering takes', () => {
    expect(requiredLine(f({ type: 'multi_select' }))).toBe('Required — pick at least one');
    expect(requiredLine(f({ type: 'short_text' }))).toBe('Required — fill it in');
    expect(requiredLine(f({ type: 'timer' }))).toBe('Required — time it, or switch on Unsure');
  });
});
