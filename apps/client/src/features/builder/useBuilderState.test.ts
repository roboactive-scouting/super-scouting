import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from '@frc/shared';
import {
  insertIndexFor,
  keyFromLabel,
  phaseAt,
  useBuilderState,
  type BuilderInitial,
} from './useBuilderState';

// The plan's fixture, typed: an untyped literal widens `type: 'counter'` to string.
const initial: BuilderInitial = {
  form_id: 'f-1',
  version_id: 'fv-1',
  is_locked: false,
  timer_config: { phases: [] },
  fields: [
    {
      id: 'a',
      key: 'auto_notes',
      label: 'Auto notes',
      type: 'counter',
      display_order: 1,
      required: false,
      config: {},
      section: null,
      help_text: null,
      default_value: null,
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
    },
  ],
};

describe('useBuilderState', () => {
  it('adds a field of the chosen type with a generated unique key and no metadata yet', () => {
    const { result } = renderHook(() => useBuilderState(initial));
    act(() => result.current.addField('rating'));
    const added = result.current.fields.at(-1)!;
    expect(added.type).toBe('rating');
    expect(added.key).not.toBe('auto_notes');
    expect(added.description).toBeNull();
    expect(result.current.selectedKey).toBe(added.key);
  });

  it('reports the new field as incomplete until its semantic metadata is filled', () => {
    const { result } = renderHook(() => useBuilderState(initial));
    act(() => result.current.addField('rating'));
    expect(result.current.issuesFor(result.current.selectedKey!)).not.toEqual([]);
    act(() =>
      result.current.updateField(result.current.selectedKey!, {
        description: 'driver skill',
        unit: 'count',
        phase: 'post_match',
        direction: 'higher_is_better',
        config: { max: 5, style: 'stars' },
      }),
    );
    expect(result.current.issuesFor(result.current.selectedKey!)).toEqual([]);
  });

  it('reorders fields and renumbers display_order contiguously', () => {
    const { result } = renderHook(() => useBuilderState(initial));
    act(() => result.current.addField('toggle'));
    act(() => result.current.reorder(1, 0));
    expect(result.current.fields.map((f) => f.display_order)).toEqual([1, 2]);
    expect(result.current.fields[0]!.type).toBe('toggle');
  });

  it("derives a new field's key from its label until the first save (SPEC-FINAL 5.1)", () => {
    const { result } = renderHook(() => useBuilderState(initial));
    act(() => result.current.addField('counter'));
    act(() => result.current.updateField(result.current.selectedKey!, { label: 'Pieces dropped' }));
    expect(result.current.fields.at(-1)!.key).toBe('pieces_dropped');
  });

  it("never lets a saved field's key change", () => {
    const { result } = renderHook(() => useBuilderState(initial));
    act(() =>
      result.current.updateField('auto_notes', { key: 'renamed', label: 'Renamed' } as never),
    );
    expect(result.current.fields[0]!.key).toBe('auto_notes');
  });

  it('marks the state dirty on any change and clean after save', async () => {
    const { result } = renderHook(() => useBuilderState(initial));
    expect(result.current.dirty).toBe(false);
    act(() => result.current.addField('toggle'));
    expect(result.current.dirty).toBe(true);
    // The save's answer: the version's rows with server ids, the new field's key now permanent.
    const sent: unknown[] = [];
    await act(() =>
      result.current.save(async (fields) => {
        sent.push(...fields);
        return fields.map(
          (f, i) => ({ id: f.id ?? `srv-${i}`, deprecated: false, ...f }) as FormFieldDefinition,
        );
      }),
    );
    expect(result.current.dirty).toBe(false);
    expect(sent).toHaveLength(2);
  });

  it('warns that a structural change on a locked version will fork a new version', () => {
    const { result } = renderHook(() => useBuilderState({ ...initial, is_locked: true }));
    act(() => result.current.addField('toggle'));
    expect(result.current.willForkNewVersion).toBe(true);
  });

  it('does not warn for an in-place label edit on a locked version', () => {
    const { result } = renderHook(() => useBuilderState({ ...initial, is_locked: true }));
    act(() => result.current.updateField('auto_notes', { label: 'הערות' }));
    expect(result.current.willForkNewVersion).toBe(false);
  });
});

describe('useBuilderState — keys, saves and Publish (task 1.29)', () => {
  it('dedupes a generated key with _2, _3 against live and retired keys', () => {
    const retired: BuilderInitial = {
      ...initial,
      fields: [
        ...initial.fields,
        { ...initial.fields[0]!, id: 'r', key: 'toggle', deprecated: true, display_order: 2 },
      ],
    };
    const { result } = renderHook(() => useBuilderState(retired));
    act(() => result.current.addField('toggle'));
    act(() => result.current.addField('toggle'));
    expect(result.current.fields.map((f) => f.key)).toEqual(['auto_notes', 'toggle_2', 'toggle_3']);
  });

  it('leads a key with the phase it was added to, as the design names keys', () => {
    const { result } = renderHook(() => useBuilderState(initial));
    act(() => result.current.addField('counter', { phase: 'teleop' }));
    act(() => result.current.updateField(result.current.selectedKey!, { label: 'Pieces dropped' }));
    expect(result.current.selectedKey).toBe('tele_pieces_dropped');
    expect(result.current.selectedField?.phase).toBe('teleop');
    // Its meaning is still missing, but the phase came from the tab: three of the four.
    const missing = result.current
      .issuesFor('tele_pieces_dropped')
      .map((i) => i.path)
      .sort();
    expect(missing).toEqual(['description', 'direction', 'unit']);
  });

  it('a new key is permanent once saved: a later label edit no longer moves it', async () => {
    const { result } = renderHook(() => useBuilderState(initial));
    act(() => result.current.addField('counter'));
    act(() => result.current.updateField(result.current.selectedKey!, { label: 'Pieces dropped' }));
    await act(() =>
      result.current.save(async (fields) =>
        fields.map(
          (f, i) => ({ id: f.id ?? `srv-${i}`, deprecated: false, ...f }) as FormFieldDefinition,
        ),
      ),
    );
    expect(result.current.selectedKey).toBe('pieces_dropped');
    act(() => result.current.updateField('pieces_dropped', { label: 'Pieces lost' }));
    expect(result.current.fields.at(-1)!.key).toBe('pieces_dropped');
    expect(result.current.fields.at(-1)!.label).toBe('Pieces lost');
  });

  it('sends the whole live set, with ids only on saved fields and no deprecated flag', () => {
    const { result } = renderHook(() => useBuilderState(initial));
    act(() => result.current.addField('computed'));
    const input = result.current.toSaveInput();
    expect(input).toHaveLength(2);
    expect(input[0]).toMatchObject({ id: 'a', key: 'auto_notes' });
    expect(input[1]).not.toHaveProperty('id');
    expect(input[1]).not.toHaveProperty('deprecated');
    expect(input[1]).toMatchObject({ unit: null, phase: null, direction: null });
    expect(input[1]!.config).toEqual({ expression: null, result_type: 'float' });
  });

  it('lists the incomplete fields in display order; a section is never incomplete', () => {
    const { result } = renderHook(() => useBuilderState(initial));
    act(() => result.current.addField('section'));
    act(() => result.current.addField('toggle'));
    expect(result.current.incomplete.map((f) => f.key)).toEqual(['toggle']);
    expect(result.current.hasDataField).toBe(true);
  });

  it('a removed field goes from the live set, and a saved one counts as structural', () => {
    const { result } = renderHook(() => useBuilderState({ ...initial, is_locked: true }));
    act(() => result.current.removeField('auto_notes'));
    expect(result.current.fields).toEqual([]);
    expect(result.current.hasDataField).toBe(false);
    expect(result.current.willForkNewVersion).toBe(true);
    expect(result.current.dirty).toBe(true);
  });
});

describe('useBuilderState — review fixes (task 1.29, fix round 1)', () => {
  const row = (over: Partial<FormFieldDefinition> & { id: string; key: string }) =>
    ({ ...initial.fields[0]!, ...over }) as FormFieldDefinition;

  it('never reuses the key of a saved field removed in this session, even for another type', () => {
    const { result } = renderHook(() =>
      useBuilderState({
        ...initial,
        fields: [
          row({ id: 'a', key: 'auto_leave', type: 'toggle', display_order: 1 }),
          row({ id: 'h', key: 'auto_high', type: 'counter', display_order: 2 }),
        ],
      }),
    );
    act(() => result.current.removeField('auto_high'));
    act(() => result.current.addField('toggle', { phase: 'auto' }));
    act(() => result.current.updateField(result.current.selectedKey!, { label: 'high' }));
    expect(result.current.selectedField?.type).toBe('toggle');
    expect(result.current.selectedKey).toBe('auto_high_2');
  });

  it("a field added to a phase joins the section of the phase's last field", () => {
    const { result } = renderHook(() =>
      useBuilderState({
        ...initial,
        fields: [
          row({ id: 'a', key: 'auto_leave', phase: 'auto', display_order: 1 }),
          row({ id: 't', key: 'tele_high', phase: 'teleop', display_order: 2 }),
          row({ id: 'd', key: 'tele_def', phase: 'teleop', section: 'Defence', display_order: 3 }),
          row({ id: 'e', key: 'end_climb', phase: 'endgame', display_order: 4 }),
        ],
      }),
    );
    act(() => result.current.addField('counter', { phase: 'teleop' }));
    const added = result.current.selectedField!;
    expect(result.current.fields.map((f) => f.key)).toEqual([
      'auto_leave',
      'tele_high',
      'tele_def',
      added.key,
      'end_climb',
    ]);
    expect(added.section).toBe('Defence');
    // A phase with no fields yet gives nothing to join; nor does a section heading added.
    act(() => result.current.addField('counter', { phase: 'post_match' }));
    expect(result.current.selectedField!.section).toBeNull();
    act(() => result.current.addField('section', { phase: 'teleop' }));
    expect(result.current.selectedField!.section).toBeNull();
  });
});

describe('keys and phase placement', () => {
  it('makes a key that passes the key rule from any label', () => {
    expect(keyFromLabel('Climb level', 'endgame', 'single_select', new Set())).toBe(
      'end_climb_level',
    );
    expect(keyFromLabel('Teleop shots', 'teleop', 'counter', new Set())).toBe('teleop_shots');
    expect(keyFromLabel('הערות', null, 'long_text', new Set())).toBe('long_text');
    expect(keyFromLabel('3 balls', null, 'counter', new Set())).toBe('f_3_balls');
  });

  it('puts a field added to a phase after that phase, and a section at its head', () => {
    const f = (key: string, phase: FormFieldDefinition['phase'], type = 'counter') =>
      ({ ...initial.fields[0]!, key, phase, type }) as FormFieldDefinition;
    const fields = [f('a1', 'auto'), f('t1', 'teleop'), f('e1', 'endgame')];
    expect(insertIndexFor(fields, 'teleop', 'counter')).toBe(2);
    expect(insertIndexFor(fields, 'teleop', 'section')).toBe(1);
    expect(insertIndexFor(fields, 'post_match', 'counter')).toBe(3);
    const withSection = [f('a1', 'auto'), f('s', null, 'section'), f('t1', 'teleop')];
    expect(phaseAt(withSection, 1)).toBe('teleop');
  });
});
