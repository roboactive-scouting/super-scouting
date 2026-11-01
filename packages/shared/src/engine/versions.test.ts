import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from '../forms/types';
import { aggregate } from './aggregate';
import { aggregationValue, resolveFieldAcrossVersions, type VersionFields } from './versions';

const field = (
  key: string,
  type: FormFieldDefinition['type'],
  over: Partial<FormFieldDefinition> = {},
): FormFieldDefinition => ({
  id: `${key}-${type}`,
  key,
  label: key,
  help_text: null,
  type,
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
  direction: 'higher_is_better',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
  ...over,
});

const version = (...fields: FormFieldDefinition[]): VersionFields => ({ fields });

const options = (...values: string[]) => ({
  options: values.map((value) => ({ value, label: value.toUpperCase() })),
});

const climb = (values: string[], over: Partial<FormFieldDefinition> = {}) =>
  field('climb', 'single_select', {
    unit: 'enum',
    is_ordinal: true,
    config: options(...values),
    ...over,
  });

describe('resolveFieldAcrossVersions (SPEC-FINAL 11.7)', () => {
  it('a key with the same type across two versions resolves to the active version field', () => {
    const active = version(field('auto_notes', 'counter', { label: 'Auto notes (v2)' }));
    const older = version(field('auto_notes', 'counter', { label: 'Auto notes' }));
    const result = resolveFieldAcrossVersions('auto_notes', { active, inScope: [older, active] });
    expect(result).toEqual({ ok: true, field: active.fields[0] });
  });

  it('refuses a key whose type changed between versions: no field, no number', () => {
    const active = version(field('auto_notes', 'number'));
    const older = version(field('auto_notes', 'counter'));
    expect(resolveFieldAcrossVersions('auto_notes', { active, inScope: [older] })).toEqual({
      ok: false,
      reason: 'type-changed',
    });
  });

  it('refuses a type change in any version in scope, whatever the order', () => {
    const active = version(field('k', 'counter'));
    const same = version(field('k', 'counter'));
    const changed = version(field('k', 'toggle'));
    for (const inScope of [
      [same, changed],
      [changed, same],
      [same, active, changed],
    ]) {
      expect(resolveFieldAcrossVersions('k', { active, inScope })).toMatchObject({ ok: false });
    }
  });

  it('refuses single → multi select as a type change', () => {
    const active = version(field('k', 'multi_select', { config: options('a', 'b') }));
    const older = version(field('k', 'single_select', { config: options('a', 'b') }));
    expect(resolveFieldAcrossVersions('k', { active, inScope: [older] })).toEqual({
      ok: false,
      reason: 'type-changed',
    });
  });

  it('refuses a type change carried by a deprecated field in an older version', () => {
    const active = version(field('k', 'counter'));
    const older = version(field('k', 'short_text', { deprecated: true }));
    expect(resolveFieldAcrossVersions('k', { active, inScope: [older] })).toEqual({
      ok: false,
      reason: 'type-changed',
    });
  });

  it('refuses when the active version itself carries the key twice with two types', () => {
    const active = version(field('k', 'counter'), field('k', 'toggle'));
    expect(resolveFieldAcrossVersions('k', { active, inScope: [] })).toEqual({
      ok: false,
      reason: 'type-changed',
    });
  });

  it('a key absent from the active version yields absent', () => {
    const active = version(field('other', 'counter'));
    const older = version(field('auto_notes', 'counter'));
    expect(resolveFieldAcrossVersions('auto_notes', { active, inScope: [older] })).toEqual({
      ok: false,
      reason: 'absent',
    });
  });

  it('a key deprecated in the active version is absent from it', () => {
    const active = version(field('auto_notes', 'counter', { deprecated: true }));
    expect(resolveFieldAcrossVersions('auto_notes', { active, inScope: [active] })).toEqual({
      ok: false,
      reason: 'absent',
    });
  });

  it('absent wins over a type change elsewhere', () => {
    const active = version(field('other', 'counter'));
    const a = version(field('k', 'counter'));
    const b = version(field('k', 'toggle'));
    expect(resolveFieldAcrossVersions('k', { active, inScope: [a, b] })).toEqual({
      ok: false,
      reason: 'absent',
    });
  });

  it('a label, help text, range or metadata change is not a problem: keys aggregate', () => {
    const active = version(
      field('k', 'counter', {
        label: 'Notes scored',
        help_text: 'new help',
        config: { min: 0, max: 20 },
        direction: 'lower_is_better',
        expected_range: { min: 0, max: 20 },
      }),
    );
    const older = version(field('k', 'counter', { label: 'Notes', config: { min: 0, max: 9 } }));
    expect(resolveFieldAcrossVersions('k', { active, inScope: [older] })).toEqual({
      ok: true,
      field: active.fields[0],
    });
  });

  it('a version that never had the key is not a problem (the field was added later)', () => {
    const active = version(field('k', 'counter'));
    const older = version(field('other', 'toggle'));
    expect(resolveFieldAcrossVersions('k', { active, inScope: [older] })).toMatchObject({
      ok: true,
    });
  });

  it('a nominal select may add, remove or reorder options: values aggregate by key', () => {
    const active = version(field('k', 'single_select', { config: options('c', 'a') }));
    const older = version(field('k', 'single_select', { config: options('a', 'b', 'c') }));
    expect(resolveFieldAcrossVersions('k', { active, inScope: [older] })).toMatchObject({
      ok: true,
    });
  });

  describe('an ordinal select reads its option order as the rank', () => {
    const active = version(climb(['none', 'park', 'low', 'high']));

    it('accepts an option added anywhere: every older option keeps one rank', () => {
      for (const older of [
        ['none', 'park', 'low'],
        ['none', 'low', 'high'],
        ['park', 'high'],
        ['none', 'park', 'low', 'high'],
      ]) {
        expect(
          resolveFieldAcrossVersions('climb', { active, inScope: [version(climb(older))] }),
        ).toMatchObject({ ok: true });
      }
    });

    it('refuses a reordered option list as a type change', () => {
      const older = version(climb(['none', 'low', 'park', 'high']));
      expect(resolveFieldAcrossVersions('climb', { active, inScope: [older] })).toEqual({
        ok: false,
        reason: 'type-changed',
      });
    });

    it('refuses an option the active list no longer has as a type change', () => {
      const older = version(climb(['none', 'park', 'mid', 'low', 'high']));
      expect(resolveFieldAcrossVersions('climb', { active, inScope: [older] })).toEqual({
        ok: false,
        reason: 'type-changed',
      });
    });

    it('checks the older list even when that version marked the select nominal', () => {
      const older = version(climb(['high', 'none'], { is_ordinal: false }));
      expect(resolveFieldAcrossVersions('climb', { active, inScope: [older] })).toMatchObject({
        ok: false,
      });
    });
  });
});

describe('aggregationValue (SPEC-FINAL 5.3, 12.6)', () => {
  const ordinal = climb(['none', 'park', 'low', 'high']);

  it('an ordinal single select reads its 0-based rank, worst (top of the list) = 0', () => {
    expect(['none', 'park', 'low', 'high'].map((v) => aggregationValue(ordinal, v))).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('an unknown option, a non-string and a missing value read as null, never a rank', () => {
    for (const value of ['mid', 'NONE', '', 0, 1, true, null, undefined, ['high'], { v: 1 }]) {
      expect(aggregationValue(ordinal, value)).toBeNull();
    }
  });

  it('an option named like an Object.prototype key is unknown', () => {
    expect(aggregationValue(ordinal, 'constructor')).toBeNull();
    expect(aggregationValue(ordinal, 'toString')).toBeNull();
  });

  it('a nominal select is unchanged', () => {
    const nominal = climb(['none', 'park', 'low', 'high'], { is_ordinal: false });
    expect(aggregationValue(nominal, 'low')).toBe('low');
    expect(aggregationValue({ ...nominal, is_ordinal: null }, 'high')).toBe('high');
    expect(aggregationValue(nominal, 'unlisted')).toBe('unlisted');
  });

  it('every other field type is unchanged, even one wrongly marked ordinal', () => {
    expect(aggregationValue(field('n', 'counter'), 4)).toBe(4);
    expect(aggregationValue(field('n', 'counter', { is_ordinal: true }), 4)).toBe(4);
    expect(aggregationValue(field('t', 'toggle'), true)).toBe(true);
    const taps = [{ type: 'score', t: 1 }];
    expect(aggregationValue(field('l', 'event_log'), taps)).toBe(taps);
    expect(aggregationValue(field('r', 'rating'), undefined)).toBeUndefined();
  });

  it('an ordinal multi select reads the highest rank selected', () => {
    const multi = field('levels', 'multi_select', {
      unit: 'enum',
      is_ordinal: true,
      config: options('none', 'low', 'mid', 'high'),
    });
    expect(aggregationValue(multi, ['low'])).toBe(1);
    expect(aggregationValue(multi, ['mid', 'none', 'low'])).toBe(2);
    expect(aggregationValue(multi, ['none'])).toBe(0);
    expect(aggregationValue(multi, [])).toBeNull();
    expect(aggregationValue(multi, ['high', 'unlisted'])).toBeNull();
    expect(aggregationValue(multi, 'high')).toBeNull();
    expect(aggregationValue(multi, undefined)).toBeNull();
    const nominalMulti = { ...multi, is_ordinal: false };
    expect(aggregationValue(nominalMulti, ['mid', 'low'])).toEqual(['mid', 'low']);
  });

  it('feeds a numeric aggregation: "average climb level" is a number', () => {
    const stored = ['high', 'none', 'low', 'unlisted', undefined];
    const values = stored.map((v) => aggregationValue(ordinal, v));
    expect(aggregate(values, 'avg')).toBe(5 / 3);
    expect(aggregate(values, 'max')).toBe(3);
    expect(aggregate(values, 'count')).toBe(3);
    // Unmapped, the option strings give no number at all.
    expect(aggregate(stored, 'avg')).toBeNull();
  });

  it('ranks by the active field the guard returned, across versions', () => {
    const active = version(climb(['none', 'park', 'low', 'high']));
    const older = version(climb(['none', 'low', 'high']));
    const resolved = resolveFieldAcrossVersions('climb', { active, inScope: [older] });
    if (!resolved.ok) throw new Error('expected the field to resolve');
    // 'low' was rank 1 under the older list; it reads as 2 under the active one, for every entry.
    expect(aggregationValue(resolved.field, 'low')).toBe(2);
  });
});
