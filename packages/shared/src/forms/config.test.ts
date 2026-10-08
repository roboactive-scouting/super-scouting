import { describe, expect, it } from 'vitest';
import { FIELD_TYPES, validateFieldDefinition } from './config';
import type { FormFieldDefinition } from './types';

const field = (over: Partial<FormFieldDefinition>): FormFieldDefinition => ({
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
  description: 'what it means',
  unit: 'count',
  phase: 'auto',
  direction: 'higher_is_better',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
  ...over,
});

describe('the field-type catalogue (SPEC-FINAL 5.2)', () => {
  it('ships all fourteen types and no Photo field', () => {
    expect([...FIELD_TYPES]).toEqual([
      'counter',
      'number',
      'toggle',
      'single_select',
      'multi_select',
      'rating',
      'short_text',
      'long_text',
      'timer',
      'event_log',
      'position',
      'cycle_path',
      'computed',
      'section',
    ]);
    expect(FIELD_TYPES).not.toContain('photo');
  });
});

describe('semantic metadata (SPEC-FINAL 3.3, 5.4)', () => {
  it('requires description, unit, phase and direction on every data field', () => {
    for (const missing of ['description', 'unit', 'phase', 'direction'] as const) {
      const issues = validateFieldDefinition(field({ [missing]: null }));
      expect(
        issues.map((i) => i.path),
        missing,
      ).toContain(missing);
    }
  });

  it('rejects an empty-string description as firmly as a null one', () => {
    expect(validateFieldDefinition(field({ description: '   ' }))).not.toEqual([]);
  });

  it('requires all seven semantic columns to be null on a section', () => {
    expect(
      validateFieldDefinition(
        field({ type: 'section', description: null, unit: null, phase: null, direction: null }),
      ),
    ).toEqual([]);
    expect(
      validateFieldDefinition(
        field({ type: 'section', unit: 'count', description: null, phase: null, direction: null }),
      ),
    ).not.toEqual([]);
  });

  it('allows is_ordinal only on the two select types', () => {
    const options = { options: [{ value: 'a', label: 'A' }] };
    expect(
      validateFieldDefinition(
        field({ type: 'single_select', unit: 'enum', is_ordinal: true, config: options }),
      ),
    ).toEqual([]);
    expect(
      validateFieldDefinition(
        field({ type: 'multi_select', unit: 'enum', is_ordinal: false, config: options }),
      ),
    ).toEqual([]);
    expect(validateFieldDefinition(field({ type: 'counter', is_ordinal: true }))).not.toEqual([]);
  });

  it('checks the per-type config shape of SPEC-FINAL 5.3', () => {
    expect(
      validateFieldDefinition(
        field({ type: 'rating', unit: 'count', config: { max: 5, style: 'stars' } }),
      ),
    ).toEqual([]);
    expect(
      validateFieldDefinition(field({ type: 'rating', unit: 'count', config: { style: 'dial' } })),
    ).not.toEqual([]);
    expect(
      validateFieldDefinition(
        field({
          type: 'cycle_path',
          unit: 'coordinate',
          config: { max_points_per_cycle: 6, mirror_axis: 'horizontal' },
        }),
      ),
    ).toEqual([]);
    expect(
      validateFieldDefinition(
        field({
          type: 'position',
          unit: 'coordinate',
          config: { multi_point: true, mirror_axis: 'sideways' },
        }),
      ),
    ).not.toEqual([]);
    expect(
      validateFieldDefinition(
        field({ type: 'timer', unit: 'seconds', config: { allow_unsure: true } }),
      ),
    ).toEqual([]);
  });

  it('requires a non-empty option list on both select types', () => {
    expect(
      validateFieldDefinition(
        field({ type: 'single_select', unit: 'enum', is_ordinal: false, config: { options: [] } }),
      ),
    ).not.toEqual([]);
  });

  it('refuses a key that is not a safe permanent identifier', () => {
    expect(validateFieldDefinition(field({ key: 'auto notes' }))).not.toEqual([]);
    expect(validateFieldDefinition(field({ key: 'auto_notes_2' }))).toEqual([]);
  });
});

describe('the event log config (SPEC-FINAL 5.3, v1.20)', () => {
  const types = [{ value: 'score', label: 'Score' }];
  const log = (config: Record<string, unknown>) =>
    field({ type: 'event_log', unit: 'count', config });

  it('accepts ask_position with a mirror_axis', () => {
    expect(
      validateFieldDefinition(
        log({ event_types: types, ask_position: true, mirror_axis: 'horizontal' }),
      ),
    ).toEqual([]);
  });

  it('rejects ask_position without a mirror_axis, at config.mirror_axis', () => {
    const issues = validateFieldDefinition(log({ event_types: types, ask_position: true }));
    expect(issues.map((i) => i.path)).toEqual(['config.mirror_axis']);
  });

  it('accepts a plain event log with neither', () => {
    expect(validateFieldDefinition(log({ event_types: types }))).toEqual([]);
    expect(validateFieldDefinition(log({ event_types: types, ask_position: false }))).toEqual([]);
  });

  it('still refuses an unknown key and an empty event type list', () => {
    expect(validateFieldDefinition(log({ event_types: types, colour: 'red' }))).not.toEqual([]);
    expect(validateFieldDefinition(log({ event_types: [] }))).not.toEqual([]);
  });
});

describe('computed field config (SPEC-FINAL 5.7)', () => {
  const computed = (config: Record<string, unknown>) =>
    field({ type: 'computed', unit: 'count', config });
  const tree = {
    kind: 'op',
    op: '+',
    left: { kind: 'field', key: 'auto' },
    right: { kind: 'literal', value: 1 },
  };

  it('accepts a well-formed expression tree', () => {
    expect(validateFieldDefinition(computed({ expression: tree, result_type: 'float' }))).toEqual(
      [],
    );
  });

  it('refuses a node kind outside the three, at config.expression', () => {
    const issues = validateFieldDefinition(
      computed({ expression: { kind: 'call' }, result_type: 'float' }),
    );
    expect(issues).not.toEqual([]);
    expect(issues.every((i) => i.path.startsWith('config.expression'))).toBe(true);
  });

  it('accepts a null expression: a draft not yet written', () => {
    expect(validateFieldDefinition(computed({ expression: null, result_type: 'float' }))).toEqual(
      [],
    );
  });
});

describe('garbage definitions are refused (review #7)', () => {
  const paths = (f: FormFieldDefinition) => validateFieldDefinition(f).map((i) => i.path);

  it('a counter or number whose min exceeds its max, at config.max', () => {
    expect(paths(field({ config: { min: 10, max: 5 } }))).toEqual(['config.max']);
    expect(paths(field({ type: 'number', config: { min: 3, max: -3 } }))).toEqual(['config.max']);
    expect(paths(field({ config: { min: 5, max: 5 } }))).toEqual([]);
    expect(paths(field({ config: { min: 5 } }))).toEqual([]);
  });

  it('a select or event log naming one value twice, at the duplicate', () => {
    const options = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
      { value: 'a', label: 'A again' },
    ];
    expect(
      paths(field({ type: 'single_select', unit: 'enum', is_ordinal: true, config: { options } })),
    ).toEqual(['config.options.2.value']);
    expect(paths(field({ type: 'multi_select', unit: 'enum', config: { options } }))).toEqual([
      'config.options.2.value',
    ]);
    expect(paths(field({ type: 'event_log', config: { event_types: options } }))).toEqual([
      'config.event_types.2.value',
    ]);
  });

  it('a default_value that is not a valid value for the field, at default_value', () => {
    const counter = { config: { min: 0, max: 10 }, expected_range: { min: 0, max: 8 } };
    expect(paths(field({ ...counter, default_value: 0 }))).toEqual([]);
    expect(paths(field({ ...counter, default_value: 12 }))).toEqual(['default_value']);
    expect(paths(field({ ...counter, default_value: 9 }))).toEqual(['default_value']);
    expect(paths(field({ ...counter, default_value: 'three' }))).toEqual(['default_value']);
    expect(paths(field({ type: 'toggle', unit: 'boolean', default_value: 'yes' }))).toEqual([
      'default_value',
    ]);
    expect(paths(field({ type: 'toggle', unit: 'boolean', default_value: false }))).toEqual([]);
    const select = {
      type: 'single_select' as const,
      unit: 'enum' as const,
      config: { options: [{ value: 'low', label: 'Low' }] },
    };
    expect(paths(field({ ...select, default_value: 'low' }))).toEqual([]);
    expect(paths(field({ ...select, default_value: 'moon' }))).toEqual(['default_value']);
    // null is "no default", whatever the field
    expect(paths(field({ ...counter, default_value: null }))).toEqual([]);
  });

  it('a required default is judged the same, and a condition on the field does not hide it', () => {
    expect(
      paths(
        field({
          required: true,
          config: { min: 0, max: 10 },
          default_value: 11,
          visibility_condition: { field_key: 'other', op: '=', value: true },
        }),
      ),
    ).toEqual(['default_value']);
  });
});
