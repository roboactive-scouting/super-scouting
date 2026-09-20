import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from './types';
import { validateEntryData } from './validate';

const fields: FormFieldDefinition[] = [
  {
    // The config range is the input's own limit; expected_range is the narrower
    // sanity band that blocks a submit (SPEC-FINAL 15.1). They are deliberately
    // different here so each rule is tested on its own.
    id: 'f1',
    key: 'auto_notes',
    label: 'Auto notes',
    type: 'counter',
    display_order: 1,
    required: true,
    config: { min: 0, max: 99, step: 1 },
    section: null,
    help_text: null,
    default_value: 0,
    visibility_condition: null,
    deprecated: false,
    description: 'Notes in auto',
    unit: 'count',
    phase: 'auto',
    direction: 'higher_is_better',
    category: null,
    expected_range: { min: 0, max: 10 },
    include_in_ai_context: null,
    is_ordinal: null,
  },
  {
    id: 'f2',
    key: 'auto_left_zone',
    label: 'Left zone',
    type: 'toggle',
    display_order: 2,
    required: false,
    config: {},
    section: null,
    help_text: null,
    default_value: false,
    visibility_condition: null,
    deprecated: false,
    description: 'Left the zone',
    unit: 'boolean',
    phase: 'auto',
    direction: 'higher_is_better',
    category: null,
    expected_range: null,
    include_in_ai_context: null,
    is_ordinal: null,
  },
  {
    id: 'f3',
    key: 'endgame_climb',
    label: 'Climb',
    type: 'single_select',
    display_order: 3,
    required: true,
    config: {
      is_ordinal: true,
      options: [
        { value: 'none', label: 'None' },
        { value: 'high', label: 'High' },
      ],
    },
    section: null,
    help_text: null,
    default_value: null,
    visibility_condition: null,
    deprecated: false,
    description: 'Climb level',
    unit: 'enum',
    phase: 'endgame',
    direction: 'higher_is_better',
    category: null,
    expected_range: null,
    include_in_ai_context: null,
    is_ordinal: true,
  },
  {
    id: 'f4',
    key: 'notes',
    label: 'Notes',
    type: 'long_text',
    display_order: 4,
    required: false,
    config: {},
    section: null,
    help_text: null,
    default_value: null,
    visibility_condition: null,
    deprecated: false,
    description: 'Free notes',
    unit: 'text',
    phase: 'post_match',
    direction: 'neutral',
    category: null,
    expected_range: null,
    include_in_ai_context: null,
    is_ordinal: null,
  },
];

describe('validateEntryData', () => {
  it('accepts a complete, in-range payload', () => {
    const result = validateEntryData(fields, 'played', {
      auto_notes: 3,
      auto_left_zone: true,
      endgame_climb: 'high',
      notes: 'טוב',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a missing required field', () => {
    const result = validateEntryData(fields, 'played', { auto_notes: 3, auto_left_zone: true });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.issues.map((i) => i.field_key)).toContain('endgame_climb');
  });

  it('blocks a numeric value outside its expected_range (SPEC-FINAL 15.1)', () => {
    const result = validateEntryData(fields, 'played', {
      auto_notes: 11,
      auto_left_zone: false,
      endgame_climb: 'none',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.issues[0]?.code).toBe('out-of-expected-range');
  });

  it('blocks a numeric value outside the input own min/max separately', () => {
    const result = validateEntryData(fields, 'played', {
      auto_notes: 120,
      auto_left_zone: false,
      endgame_climb: 'none',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.issues[0]?.code).toBe('out-of-config-range');
  });

  it('rejects a select value that is not in the option list', () => {
    const result = validateEntryData(fields, 'played', {
      auto_notes: 1,
      auto_left_zone: false,
      endgame_climb: 'moon',
    });
    expect(result.ok).toBe(false);
  });

  it('requires data to be empty for no_show and disabled, and validates nothing else', () => {
    expect(validateEntryData(fields, 'no_show', {}).ok).toBe(true);
    expect(validateEntryData(fields, 'disabled', {}).ok).toBe(true);
    const withValues = validateEntryData(fields, 'no_show', { auto_notes: 0 });
    expect(withValues.ok).toBe(false);
    expect(withValues.ok === false && withValues.issues[0]?.code).toBe('dead-robot-has-data');
  });

  it('validates broke_down exactly like played — its partial data is real observed performance', () => {
    expect(
      validateEntryData(fields, 'broke_down', {
        auto_notes: 1,
        auto_left_zone: true,
        endgame_climb: 'none',
      }).ok,
    ).toBe(true);
    expect(validateEntryData(fields, 'broke_down', {}).ok).toBe(false);
  });

  it('ignores a deprecated field entirely', () => {
    const withDeprecated = fields.map((f) =>
      f.key === 'endgame_climb' ? { ...f, deprecated: true } : f,
    );
    expect(
      validateEntryData(withDeprecated, 'played', { auto_notes: 1, auto_left_zone: false }).ok,
    ).toBe(true);
  });

  it('rejects a key that belongs to no field', () => {
    const result = validateEntryData(fields, 'played', {
      auto_notes: 1,
      auto_left_zone: false,
      endgame_climb: 'none',
      invented: 7,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.issues[0]?.code).toBe('unknown-field');
  });
});
