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

const f = (over: Partial<FormFieldDefinition>): FormFieldDefinition => ({
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
  ...over,
});

const ok = (field: FormFieldDefinition, value: unknown) =>
  validateEntryData([field], 'played', { [field.key]: value }).ok;

describe('validateEntryData over the whole catalogue', () => {
  it('accepts a rating inside its configured max and rejects one above it', () => {
    const rating = f({ key: 'skill', type: 'rating', config: { max: 5, style: 'stars' } });
    expect(ok(rating, 4)).toBe(true);
    expect(ok(rating, 6)).toBe(false);
    expect(ok(rating, 0)).toBe(false);
  });

  it('accepts a timer as seconds, and accepts its absence when the scouter is unsure', () => {
    const timer = f({
      key: 'climb_time',
      type: 'timer',
      unit: 'seconds',
      config: { allow_unsure: true },
    });
    expect(ok(timer, 12.5)).toBe(true);
    expect(ok(timer, -1)).toBe(false);
    expect(validateEntryData([timer], 'played', {}).ok).toBe(true);
  });

  it('accepts a number like a counter, with the same range blocks', () => {
    const number = f({
      key: 'weight',
      type: 'number',
      config: { min: 0, max: 100 },
      expected_range: { min: 10, max: 90 },
    });
    expect(ok(number, 50)).toBe(true);
    expect(ok(number, 150)).toBe(false);
    expect(ok(number, 95)).toBe(false);
    expect(ok(number, 'heavy')).toBe(false);
  });

  it('accepts short text as a string and rejects anything else', () => {
    const text = f({ key: 'drive', type: 'short_text', unit: 'text' });
    expect(ok(text, 'swerve')).toBe(true);
    expect(ok(text, 4)).toBe(false);
  });

  it('accepts an event log as {type, t} taps with a known type, in ascending t', () => {
    const log = f({
      key: 'events',
      type: 'event_log',
      unit: 'count',
      config: {
        event_types: [
          { value: 'score', label: 'Score' },
          { value: 'miss', label: 'Miss' },
        ],
      },
    });
    expect(
      ok(log, [
        { type: 'score', t: 10 },
        { type: 'miss', t: 20 },
      ]),
    ).toBe(true);
    expect(
      ok(log, [
        { type: 'score', t: 20 },
        { type: 'score', t: 10 },
      ]),
    ).toBe(false);
    expect(ok(log, [{ type: 'defence', t: 10 }])).toBe(false);
  });

  describe('an event log tap with a place (SPEC-FINAL 5.2, 5.6)', () => {
    const types = [{ value: 'score', label: 'Score' }];
    const withoutAsk = f({
      key: 'events',
      type: 'event_log',
      unit: 'count',
      config: { event_types: types },
    });
    const withAsk = f({
      key: 'events',
      type: 'event_log',
      unit: 'count',
      config: { event_types: types, ask_position: true, mirror_axis: 'horizontal' },
    });

    it('accepts {type, t, x, y}, mixed with {type, t}', () => {
      expect(
        ok(withAsk, [
          { type: 'score', t: 4, x: 0.25, y: 0.75 },
          { type: 'score', t: 9 },
        ]),
      ).toBe(true);
      expect(ok(withAsk, [{ type: 'score', t: 4, x: 0, y: 1 }])).toBe(true);
    });

    it('accepts a place whether or not ask_position is on now, so a config edit never strands data', () => {
      expect(ok(withoutAsk, [{ type: 'score', t: 4, x: 0.5, y: 0.5 }])).toBe(true);
    });

    it('rejects only one of x and y', () => {
      expect(ok(withAsk, [{ type: 'score', t: 4, x: 0.5 }])).toBe(false);
      expect(ok(withAsk, [{ type: 'score', t: 4, y: 0.5 }])).toBe(false);
    });

    it('rejects x or y outside 0..1, or not a number', () => {
      expect(ok(withAsk, [{ type: 'score', t: 4, x: 1.2, y: 0.5 }])).toBe(false);
      expect(ok(withAsk, [{ type: 'score', t: 4, x: 0.5, y: -0.1 }])).toBe(false);
      expect(ok(withAsk, [{ type: 'score', t: 4, x: '0.5', y: 0.5 }])).toBe(false);
      expect(ok(withAsk, [{ type: 'score', t: 4, x: 0.5, y: null }])).toBe(false);
    });

    it('rejects an extra key on a tap', () => {
      expect(ok(withAsk, [{ type: 'score', t: 4, side: 'left' }])).toBe(false);
      expect(ok(withAsk, [{ type: 'score', t: 4, x: 0.5, y: 0.5, z: 1 }])).toBe(false);
    });

    it('rejects a tap that is not an object', () => {
      expect(ok(withAsk, ['score'])).toBe(false);
      expect(ok(withAsk, [null])).toBe(false);
      expect(ok(withAsk, [[{ type: 'score', t: 4 }]])).toBe(false);
      expect(ok(withAsk, { type: 'score', t: 4 })).toBe(false);
    });
  });

  it('accepts a position as normalized {x, y} pairs inside 0..1', () => {
    const single = f({
      key: 'shot',
      type: 'position',
      unit: 'coordinate',
      config: { multi_point: false, mirror_axis: 'horizontal' },
    });
    const many = f({
      key: 'shots',
      type: 'position',
      unit: 'coordinate',
      config: { multi_point: true, mirror_axis: 'horizontal' },
    });
    expect(ok(single, { x: 0.25, y: 0.75 })).toBe(true);
    expect(
      ok(many, [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBe(true);
    expect(
      ok(single, [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ]),
    ).toBe(false);
  });

  it('rejects a position outside 0..1, because coordinates are normalized to the image', () => {
    const point = f({
      key: 'shot',
      type: 'position',
      unit: 'coordinate',
      config: { multi_point: false, mirror_axis: 'none' },
    });
    expect(ok(point, { x: 1.4, y: 0.5 })).toBe(false);
    expect(ok(point, { x: -0.1, y: 0.5 })).toBe(false);
  });

  it('accepts a cycle path as a list of cycles and caps points per cycle', () => {
    const path = f({
      key: 'cycles',
      type: 'cycle_path',
      unit: 'coordinate',
      config: { max_points_per_cycle: 3, mirror_axis: 'none' },
    });
    expect(
      ok(path, [
        [
          { x: 0.1, y: 0.1 },
          { x: 0.2, y: 0.2 },
        ],
      ]),
    ).toBe(true);
    expect(
      ok(path, [
        [
          { x: 0.1, y: 0.1 },
          { x: 0.2, y: 0.2 },
          { x: 0.3, y: 0.3 },
          { x: 0.4, y: 0.4 },
        ],
      ]),
    ).toBe(false);
    expect(ok(path, [[{ x: 2, y: 0.1 }]])).toBe(false);
    expect(ok(path, [{ x: 0.1, y: 0.1 }])).toBe(false);
  });

  it('accepts a computed key without validating it, because the engine writes that value, never the scouter', () => {
    const computed = f({
      key: 'total',
      type: 'computed',
      unit: 'points',
      config: { expression: null, result_type: 'float' },
      required: true,
    });
    expect(validateEntryData([computed], 'played', { total: 17 }).ok).toBe(true);
    expect(validateEntryData([computed], 'played', {}).ok).toBe(true);
  });

  it('ignores a section entirely, since it holds no data and is never required', () => {
    const section = f({
      key: 'auto_header',
      type: 'section',
      required: true,
      description: null,
      unit: null,
      phase: null,
      direction: null,
    });
    expect(validateEntryData([section], 'played', {}).ok).toBe(true);
  });

  it('accepts a multi select whose values are all in the option list, and rejects one that is not', () => {
    const multi = f({
      key: 'defended',
      type: 'multi_select',
      unit: 'enum',
      is_ordinal: false,
      config: {
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
    });
    expect(ok(multi, ['a', 'b'])).toBe(true);
    expect(ok(multi, [])).toBe(true);
    expect(ok(multi, ['a', 'c'])).toBe(false);
    expect(ok(multi, 'a')).toBe(false);
  });
});

describe('validateEntryData and conditional visibility (SPEC-FINAL 5.8)', () => {
  const climbed = f({ key: 'climbed', type: 'toggle', unit: 'boolean' });
  const climbTime = f({
    key: 'climb_time',
    label: 'Climb time',
    required: true,
    visibility_condition: { field_key: 'climbed', op: '=', value: true },
  });
  const fields = [climbed, climbTime];

  it('does not require a field that its condition hides', () => {
    expect(validateEntryData(fields, 'played', { climbed: false }).ok).toBe(true);
  });

  it('requires the same field once its condition shows it', () => {
    const result = validateEntryData(fields, 'played', { climbed: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((i) => i.code)).toEqual(['required']);
    expect(validateEntryData(fields, 'played', { climbed: true, climb_time: 12 }).ok).toBe(true);
  });

  it('does not reject a value present for a hidden field, because a condition is an in-place edit', () => {
    expect(validateEntryData(fields, 'played', { climbed: false, climb_time: 12 }).ok).toBe(true);
  });
});
