import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from './types';
import {
  isVisible,
  stripHiddenValues,
  validateVisibilityCondition,
  visibleFields,
} from './visibility';

const base: FormFieldDefinition = {
  id: 'f',
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
  phase: 'auto',
  direction: 'neutral',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
};

describe('conditional visibility (SPEC-FINAL 5.8)', () => {
  it('shows a field with no condition', () => {
    expect(isVisible(base, {})).toBe(true);
  });

  it('applies every one of the six operators', () => {
    const cases: [FormFieldDefinition['visibility_condition'], Record<string, unknown>, boolean][] =
      [
        [{ field_key: 'climbed', op: '=', value: true }, { climbed: true }, true],
        [{ field_key: 'climbed', op: '=', value: true }, { climbed: false }, false],
        [{ field_key: 'climbed', op: '!=', value: true }, { climbed: false }, true],
        [{ field_key: 'notes', op: '>', value: 3 }, { notes: 4 }, true],
        [{ field_key: 'notes', op: '<', value: 3 }, { notes: 4 }, false],
        [{ field_key: 'notes', op: '>=', value: 4 }, { notes: 4 }, true],
        [{ field_key: 'notes', op: '<=', value: 4 }, { notes: 4 }, true],
      ];
    for (const [condition, values, expected] of cases) {
      expect(
        isVisible({ ...base, visibility_condition: condition }, values),
        JSON.stringify(condition),
      ).toBe(expected);
    }
  });

  it('hides a field whose controlling value is absent', () => {
    expect(
      isVisible(
        { ...base, visibility_condition: { field_key: 'climbed', op: '=', value: true } },
        {},
      ),
    ).toBe(false);
  });

  it('does not show a field on an ordering operator when either side is not a number', () => {
    const field = { ...base, visibility_condition: { field_key: 'n', op: '>' as const, value: 3 } };
    expect(isVisible(field, { n: '4' })).toBe(false);
  });

  it('hides the fields whose condition is not met, because a hidden field records no value', () => {
    const fields = [
      { ...base, key: 'climbed', type: 'toggle' as const, unit: 'boolean' as const },
      {
        ...base,
        key: 'climb_time',
        visibility_condition: { field_key: 'climbed', op: '=' as const, value: true },
      },
    ];
    const shown = visibleFields(fields, { climbed: false, climb_time: 12 });
    expect(shown.map((f) => f.key)).toEqual(['climbed']);
  });

  it('never treats a condition as a chain: one condition per field', () => {
    const fields = [
      { ...base, key: 'a', type: 'toggle' as const, unit: 'boolean' as const },
      {
        ...base,
        key: 'b',
        visibility_condition: { field_key: 'a', op: '=' as const, value: true },
      },
      {
        ...base,
        key: 'c',
        visibility_condition: { field_key: 'b', op: '>' as const, value: 0 },
      },
    ];
    // b is hidden, but c is judged only on b's raw value, not on b's visibility.
    expect(visibleFields(fields, { a: false, b: 5 }).map((f) => f.key)).toEqual(['a', 'c']);
  });
});

describe('stripHiddenValues', () => {
  const fields = [
    { ...base, key: 'climbed', type: 'toggle' as const, unit: 'boolean' as const },
    {
      ...base,
      key: 'climb_time',
      visibility_condition: { field_key: 'climbed', op: '=' as const, value: true },
    },
    { ...base, key: 'notes' },
  ];

  it('removes the value of a hidden field and keeps the rest', () => {
    expect(stripHiddenValues(fields, { climbed: false, climb_time: 12, notes: 3 })).toEqual({
      climbed: false,
      notes: 3,
    });
  });

  it('keeps the value of a field whose condition is met', () => {
    const data = { climbed: true, climb_time: 12 };
    expect(stripHiddenValues(fields, data)).toEqual(data);
  });

  it('does not modify the object it was given', () => {
    const data = { climbed: false, climb_time: 12 };
    stripHiddenValues(fields, data);
    expect(data).toEqual({ climbed: false, climb_time: 12 });
  });

  it('judges every condition on the submitted data, not on what was already stripped', () => {
    const chain = [
      ...fields,
      {
        ...base,
        key: 'after_climb',
        visibility_condition: { field_key: 'climb_time', op: '>' as const, value: 0 },
      },
    ];
    // climb_time is hidden and stripped, yet after_climb is judged on its raw submitted value.
    expect(stripHiddenValues(chain, { climbed: false, climb_time: 12, after_climb: 1 })).toEqual({
      climbed: false,
      after_climb: 1,
    });
  });

  it('leaves a key that belongs to no field untouched', () => {
    expect(stripHiddenValues(fields, { climbed: true, stray: 1 })).toEqual({
      climbed: true,
      stray: 1,
    });
  });
});

describe('validateVisibilityCondition', () => {
  const siblings = [
    { ...base, key: 'climbed', type: 'toggle' as const, unit: 'boolean' as const },
    { ...base, key: 'notes' },
    { ...base, key: 'old', deprecated: true },
    { ...base, key: 'endgame', type: 'section' as const },
  ];
  const withCondition = (
    condition: FormFieldDefinition['visibility_condition'],
    key = 'climb_time',
  ): FormFieldDefinition => ({ ...base, key, visibility_condition: condition });

  it('accepts no condition', () => {
    expect(validateVisibilityCondition(withCondition(null), siblings)).toEqual([]);
  });

  it('accepts a valid condition on a live sibling', () => {
    expect(
      validateVisibilityCondition(
        withCondition({ field_key: 'climbed', op: '=', value: true }),
        siblings,
      ),
    ).toEqual([]);
    expect(
      validateVisibilityCondition(
        withCondition({ field_key: 'notes', op: '>=', value: 2 }),
        siblings,
      ),
    ).toEqual([]);
  });

  it('rejects a target that is not a field of the form', () => {
    const issues = validateVisibilityCondition(
      withCondition({ field_key: 'nope', op: '=', value: 1 }),
      siblings,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe('visibility_condition');
  });

  it('rejects a deprecated target', () => {
    expect(
      validateVisibilityCondition(withCondition({ field_key: 'old', op: '=', value: 1 }), siblings),
    ).toHaveLength(1);
  });

  it('rejects a field that points at itself', () => {
    const field = withCondition({ field_key: 'notes', op: '=', value: 1 }, 'notes');
    const issues = validateVisibilityCondition(field, [...siblings, field]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/own value/);
  });

  it('rejects a target that is a section', () => {
    const issues = validateVisibilityCondition(
      withCondition({ field_key: 'endgame', op: '=', value: 1 }),
      siblings,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/section/);
  });

  it('rejects an operator outside the six', () => {
    const issues = validateVisibilityCondition(
      withCondition({ field_key: 'notes', op: '≠' as unknown as '=', value: 1 }),
      siblings,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe('visibility_condition');
  });

  it('rejects an ordering operator whose value is not a finite number', () => {
    for (const op of ['>', '<', '>=', '<='] as const) {
      for (const value of ['3', null, true, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(
          validateVisibilityCondition(withCondition({ field_key: 'notes', op, value }), siblings),
          `${op} ${String(value)}`,
        ).toHaveLength(1);
      }
    }
  });

  it('lets = and != compare against any value', () => {
    for (const op of ['=', '!='] as const) {
      expect(
        validateVisibilityCondition(
          withCondition({ field_key: 'climbed', op, value: 'anything' }),
          siblings,
        ),
      ).toEqual([]);
    }
  });
});
