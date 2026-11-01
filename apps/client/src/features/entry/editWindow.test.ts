import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from '@frc/shared';
import { countdownText } from './EditCountdown';
import { keepSavable, notKeptLine, type EntryState } from './editWindow';

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

const highGoal = f({ key: 'high_goal', label: 'High goal', expected_range: { min: 0, max: 20 } });
const driver = f({
  key: 'driver',
  label: 'Driver',
  type: 'short_text',
  unit: 'text',
  required: true,
  display_order: 2,
});
const cycle = f({ key: 'cycle', label: 'Cycle time', type: 'timer', unit: 'seconds' });
const climbed = f({ key: 'climbed', label: 'Climbed', type: 'toggle', unit: 'boolean' });
const climbTime = f({
  key: 'climb_time',
  label: 'Climb time',
  type: 'number',
  unit: 'seconds',
  required: true,
  display_order: 3,
  visibility_condition: { field_key: 'climbed', op: '=', value: true },
});
const fields = [highGoal, driver];
const last: EntryState = {
  status: 'played',
  breakdownSeconds: null,
  data: { high_goal: 12, driver: 'Ana' },
};
const none = () => false;

describe('countdownText', () => {
  it('rounds up to the whole second, as m:ss', () => {
    expect(countdownText(60_000)).toBe('1:00');
    expect(countdownText(59_001)).toBe('1:00');
    expect(countdownText(45_000)).toBe('0:45');
    expect(countdownText(44_200)).toBe('0:45');
    expect(countdownText(1)).toBe('0:01');
    expect(countdownText(0)).toBe('0:00');
    expect(countdownText(-5)).toBe('0:00');
  });
});

describe('notKeptLine', () => {
  it('says the field, the value and the limit: "Not kept: High goal 40 is over 20."', () => {
    expect(notKeptLine(highGoal, 'range', 40)).toBe('Not kept: High goal 40 is over 20.');
    expect(notKeptLine(highGoal, 'range', -1)).toBe('Not kept: High goal -1 is under 0.');
    expect(notKeptLine(driver, 'required', '')).toBe(
      'Not kept: Driver is required and was left empty.',
    );
    expect(notKeptLine(cycle, 'running', 4)).toBe('Not kept: Cycle time was still running.');
  });
});

describe('keepSavable (SPEC-FINAL 7.6 v1.45)', () => {
  it('keeps everything typed when the save would take it all', () => {
    const typed = { ...last, data: { high_goal: 14, driver: 'Bo' } };
    expect(keepSavable({ fields, last, typed, running: none })).toEqual({
      ...typed,
      saved: { high_goal: 14, driver: 'Bo' },
      notKept: [],
      refused: false,
    });
  });

  it('puts an out-of-range change back to its saved value, names it, and keeps the rest', () => {
    const typed = { ...last, data: { high_goal: 40, driver: 'Bo' } };
    const settled = keepSavable({ fields, last, typed, running: none });
    expect(settled.saved).toEqual({ high_goal: 12, driver: 'Bo' });
    expect(settled.notKept).toEqual(['Not kept: High goal 40 is over 20.']);
    expect(settled.refused).toBe(false);
  });

  it('puts an emptied required field back, and names it', () => {
    const typed = { ...last, data: { high_goal: 13, driver: '' } };
    const settled = keepSavable({ fields, last, typed, running: none });
    expect(settled.saved).toEqual({ high_goal: 13, driver: 'Ana' });
    expect(settled.notKept).toEqual(['Not kept: Driver is required and was left empty.']);
  });

  it('a field the saved entry never held goes back to nothing (its starting value)', () => {
    const settled = keepSavable({
      fields,
      last: { ...last, data: { driver: 'Ana' } },
      typed: { ...last, data: { driver: 'Ana', high_goal: 21 } },
      running: none,
    });
    // A counter starts at its minimum, 0 here (seedValues).
    expect(settled.data).toEqual({ driver: 'Ana' });
    expect(settled.notKept).toEqual(['Not kept: High goal 21 is over 20.']);
  });

  it('a stopwatch still running at the mark keeps its saved time, and is always named', () => {
    const settled = keepSavable({
      fields: [cycle],
      last: { ...last, data: { cycle: 4.2 } },
      typed: { ...last, data: { cycle: 4.2 } },
      running: (key) => key === 'cycle',
    });
    expect(settled.saved).toEqual({ cycle: 4.2 });
    expect(settled.notKept).toEqual(['Not kept: Cycle time was still running.']);
  });

  it('Broke down with no time keeps the saved status; the field changes are still kept', () => {
    const settled = keepSavable({
      fields,
      last,
      typed: { status: 'broke_down', breakdownSeconds: null, data: { high_goal: 3, driver: 'Bo' } },
      running: none,
    });
    expect(settled).toMatchObject({ status: 'played', breakdownSeconds: null, refused: false });
    expect(settled.saved).toEqual({ high_goal: 3, driver: 'Bo' });
    expect(settled.notKept).toEqual(['Not kept: Broke down needs the time it stopped.']);
  });

  it('a dead robot saves no field data at all, whatever was typed', () => {
    const settled = keepSavable({
      fields,
      last,
      typed: { status: 'no_show', breakdownSeconds: null, data: { high_goal: 40 } },
      running: none,
    });
    expect(settled).toMatchObject({ status: 'no_show', saved: {}, notKept: [], refused: false });
  });

  it('checks again after putting a value back, which can show a field (a condition)', () => {
    // Saved: climbed with a time. Typed: the time made 999 (out of range). Put back, it is fine.
    const time = { ...climbTime, expected_range: { min: 0, max: 30 } };
    const settled = keepSavable({
      fields: [climbed, time],
      last: { ...last, data: { climbed: true, climb_time: 8 } },
      typed: { ...last, data: { climbed: true, climb_time: 999 } },
      running: none,
    });
    expect(settled.saved).toEqual({ climbed: true, climb_time: 8 });
    expect(settled.notKept).toEqual(['Not kept: Climb time 999 is over 30.']);
  });

  it('refuses when the saved entry itself fails a check now (a field made required in place)', () => {
    const settled = keepSavable({
      fields,
      last: { ...last, data: { high_goal: 12 } },
      typed: { ...last, data: { high_goal: 13 } },
      running: none,
    });
    expect(settled.refused).toBe(true);
    // Nothing was changed there by the scout, so nothing is named as not kept.
    expect(settled.notKept).toEqual([]);
  });
});
