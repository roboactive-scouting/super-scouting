import { describe, expect, it } from 'vitest';
import {
  SCORABLE_FIELD_TYPES,
  countDataFields,
  isScorable,
  validateScoringRules,
  type ScoringField,
} from './scoring';

const fields: ScoringField[] = [
  { key: 'auto_notes', type: 'counter', config: {} },
  { key: 'parked', type: 'toggle', config: {} },
  {
    key: 'climb',
    type: 'single_select',
    config: {
      options: [
        { value: 'none', label: 'None' },
        { value: 'high', label: 'High' },
      ],
    },
  },
  { key: 'notes', type: 'long_text', config: {} },
];

const check = (rules: Parameters<typeof validateScoringRules>[0]) =>
  validateScoringRules(rules, fields, { prefix: 'rules', noun: 'form' });

describe('validateScoringRules (SPEC-FINAL 4.1)', () => {
  it('names exactly the five scorable types', () => {
    expect([...SCORABLE_FIELD_TYPES].sort()).toEqual(
      ['counter', 'multi_select', 'number', 'single_select', 'toggle'].sort(),
    );
    expect(isScorable('rating')).toBe(false);
    expect(isScorable('multi_select')).toBe(true);
  });

  it('accepts points on a counter and a toggle, and option points on a select', () => {
    expect(
      check([
        { field_key: 'auto_notes', points: 5 },
        { field_key: 'parked', points: 2, option_points: null },
        { field_key: 'climb', points: 0, option_points: { none: 0, high: 10 } },
      ]),
    ).toEqual([]);
  });

  it('positions every problem by field key and path', () => {
    expect(
      check([
        { field_key: 'auto_notes', points: -1 },
        { field_key: 'climb', points: 0, option_points: { moon: 5, high: -2 } },
        { field_key: 'notes', points: 1 },
        { field_key: 'ghost', points: 1 },
        { field_key: 'auto_notes', points: 1 },
        { field_key: 'parked', points: 1, option_points: { yes: 1 } },
        { field_key: 'climb', points: 3 },
      ]),
    ).toEqual([
      { field_key: 'auto_notes', path: 'rules.0.points', message: expect.any(String) },
      {
        field_key: 'climb',
        path: 'rules.1.option_points.moon',
        message: expect.stringContaining('moon'),
      },
      { field_key: 'climb', path: 'rules.1.option_points.high', message: expect.any(String) },
      {
        field_key: 'notes',
        path: 'rules.2.field_key',
        message: expect.stringContaining('long_text'),
      },
      {
        field_key: 'ghost',
        path: 'rules.3.field_key',
        message: expect.stringContaining('ghost'),
      },
      { field_key: 'auto_notes', path: 'rules.4.field_key', message: expect.any(String) },
      { field_key: 'parked', path: 'rules.5.option_points', message: expect.any(String) },
      { field_key: 'climb', path: 'rules.6.field_key', message: expect.any(String) },
      { field_key: 'climb', path: 'rules.6.points', message: expect.any(String) },
    ]);
  });

  it('refuses a non-finite number', () => {
    expect(check([{ field_key: 'auto_notes', points: Number.POSITIVE_INFINITY }])).toHaveLength(1);
    expect(
      check([{ field_key: 'climb', points: 0, option_points: { high: Number.NaN } }]),
    ).toHaveLength(1);
  });
});

describe('countDataFields', () => {
  it('counts live, non-section fields', () => {
    expect(
      countDataFields([
        { type: 'counter', deprecated: false },
        { type: 'section', deprecated: false },
        { type: 'toggle', deprecated: true },
        { type: 'toggle' },
      ]),
    ).toBe(2);
  });
});
