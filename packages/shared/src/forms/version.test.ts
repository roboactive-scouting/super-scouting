import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from './types';
import { isStructuralChange, type FieldDraft } from './version';

const draft = (key: string, over: Partial<FieldDraft> = {}): FieldDraft => ({
  key,
  label: key,
  help_text: null,
  type: 'counter',
  section: null,
  display_order: 1,
  required: false,
  default_value: null,
  config: { min: 0, max: 10, step: 1 },
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

const saved = (key: string, over: Partial<FieldDraft> = {}): FormFieldDefinition => ({
  id: `id-${key}`,
  ...draft(key, over),
});

const select = (values: string[], labels: string[] = values) => ({
  type: 'single_select' as const,
  unit: 'enum' as const,
  config: { options: values.map((value, i) => ({ value, label: labels[i] ?? value })) },
});

describe('isStructuralChange (SPEC-FINAL 5.1, amended v1.20)', () => {
  it('is false when nothing structural changed', () => {
    expect(isStructuralChange([saved('a'), saved('b')], [draft('a'), draft('b')])).toBe(false);
  });

  it('is true when a live field is added', () => {
    expect(isStructuralChange([saved('a')], [draft('a'), draft('b')])).toBe(true);
  });

  it('is true when a live field is removed (absent from next)', () => {
    expect(isStructuralChange([saved('a'), saved('b')], [draft('a')])).toBe(true);
  });

  it("is true when a field's type changes", () => {
    expect(isStructuralChange([saved('a')], [draft('a', { type: 'number' })])).toBe(true);
  });

  it('ignores a field already deprecated in the current version', () => {
    expect(isStructuralChange([saved('a'), saved('old', { deprecated: true })], [draft('a')])).toBe(
      false,
    );
  });

  it('treats a field marked deprecated in next as removed', () => {
    expect(
      isStructuralChange([saved('a'), saved('b')], [draft('a'), draft('b', { deprecated: true })]),
    ).toBe(true);
  });

  it('keeps label, help text, range, order, section, metadata and scoring-adjacent edits in place', () => {
    const next = draft('a', {
      label: 'Renamed',
      help_text: 'help',
      config: { min: 0, max: 20, step: 2 },
      expected_range: { min: 0, max: 20 },
      display_order: 9,
      section: 'Auto',
      description: 'other',
      unit: 'points',
      phase: 'teleop',
      direction: 'neutral',
      category: 'scoring',
      required: true,
      default_value: 3,
    });
    expect(isStructuralChange([saved('a')], [next])).toBe(false);
  });

  it('is true when a select option is added', () => {
    expect(
      isStructuralChange([saved('s', select(['a', 'b']))], [draft('s', select(['a', 'b', 'c']))]),
    ).toBe(true);
  });

  it('is true when a select option is removed', () => {
    expect(isStructuralChange([saved('s', select(['a', 'b']))], [draft('s', select(['a']))])).toBe(
      true,
    );
  });

  it('reorder two options → structural', () => {
    expect(
      isStructuralChange(
        [saved('s', select(['low', 'high']))],
        [draft('s', select(['high', 'low']))],
      ),
    ).toBe(true);
  });

  it('relabel an option → not structural', () => {
    expect(
      isStructuralChange(
        [saved('s', select(['low', 'high'], ['Low', 'High']))],
        [draft('s', select(['low', 'high'], ['Ground', 'Top bar']))],
      ),
    ).toBe(false);
  });

  it('applies the option rule to multi_select too', () => {
    const multi = (values: string[]) => ({ ...select(values), type: 'multi_select' as const });
    expect(
      isStructuralChange([saved('m', multi(['a', 'b']))], [draft('m', multi(['b', 'a']))]),
    ).toBe(true);
    expect(
      isStructuralChange([saved('m', multi(['a', 'b']))], [draft('m', multi(['a', 'b']))]),
    ).toBe(false);
  });

  it('does not treat a change to an event log button list as structural', () => {
    const log = (values: string[]) => ({
      type: 'event_log' as const,
      unit: 'count' as const,
      config: { event_types: values.map((value) => ({ value, label: value })) },
    });
    expect(isStructuralChange([saved('e', log(['a']))], [draft('e', log(['a', 'b']))])).toBe(false);
  });
});
