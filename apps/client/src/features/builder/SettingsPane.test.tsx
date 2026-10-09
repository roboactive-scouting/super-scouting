import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { FormFieldDefinition } from '@frc/shared';
import { SettingsPane, type PaneField, type PanePatch } from './SettingsPane';

/** dnd-kit's keyboard sensor listens for the next key only after a tick. */
const tick = () => act(() => new Promise((done) => setTimeout(done, 20)));

const field = (over: Record<string, unknown> = {}) =>
  ({
    id: 'a',
    key: 'auto_notes',
    label: 'Auto notes',
    type: 'counter',
    display_order: 1,
    required: false,
    config: { min: 0, max: 10, step: 1 },
    section: null,
    help_text: null,
    default_value: null,
    visibility_condition: null,
    deprecated: false,
    description: null,
    unit: null,
    phase: null,
    direction: null,
    category: null,
    expected_range: null,
    include_in_ai_context: null,
    is_ordinal: null,
    ...over,
  }) as PaneField;

describe('SettingsPane (SPEC-FINAL 5.4, 4.2)', () => {
  it('shows the key as permanent and not editable', () => {
    render(<SettingsPane field={field()} allFields={[field()]} onChange={vi.fn()} />);
    expect(screen.getByText('auto_notes')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^key$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/permanent/i)).toBeInTheDocument();
  });

  it('marks the four semantic attributes required and says they cannot be backfilled', () => {
    render(<SettingsPane field={field()} allFields={[field()]} onChange={vi.fn()} />);
    // `^unit$`, not the plan's /unit/: the counter's "Points per unit" box is a label too.
    for (const label of [/description/i, /^unit$/i, /phase/i, /direction/i]) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
    expect(screen.getByText(/cannot be added later/i)).toBeInTheDocument();
  });

  it('offers scoring for a counter, as points per unit', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SettingsPane field={field()} allFields={[field()]} onChange={onChange} />);
    await user.type(screen.getByLabelText(/points per unit/i), '5');
    expect(onChange).toHaveBeenLastCalledWith({ points: 5, option_points: null });
  });

  it('offers one point box per option for a single select', () => {
    render(
      <SettingsPane
        field={field({
          type: 'single_select',
          unit: 'enum',
          is_ordinal: true,
          config: {
            options: [
              { value: 'none', label: 'None' },
              { value: 'high', label: 'High' },
            ],
          },
        })}
        allFields={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/points for None/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/points for High/i)).toBeInTheDocument();
  });

  it('explains why a long text field has no scoring instead of hiding it silently', () => {
    render(
      <SettingsPane
        field={field({ type: 'long_text', unit: 'text' })}
        allFields={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/long text fields are not scored/i)).toBeInTheDocument();
  });

  it('shows is_ordinal only for selects and states that list order is the rank', () => {
    const { rerender } = render(<SettingsPane field={field()} allFields={[]} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/ordered/i)).not.toBeInTheDocument();
    rerender(
      <SettingsPane
        field={field({
          type: 'single_select',
          unit: 'enum',
          config: { options: [{ value: 'a', label: 'A' }] },
        })}
        allFields={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/ordered/i)).toBeInTheDocument();
    expect(screen.getByText(/worst .* best/i)).toBeInTheDocument();
  });

  it('shows a mirroring preview for a position field', () => {
    render(
      <SettingsPane
        field={field({
          type: 'position',
          unit: 'coordinate',
          config: { multi_point: false, mirror_axis: 'horizontal' },
        })}
        allFields={[]}
        onChange={vi.fn()}
        seasonImagePath="seasons/2026/field.webp"
      />,
    );
    expect(screen.getByRole('img', { name: /mirroring preview/i })).toBeInTheDocument();
    expect(screen.getByText(/blue is mirrored/i)).toBeInTheDocument();
  });

  it('offers one visibility condition, never a list', async () => {
    const user = userEvent.setup();
    render(
      <SettingsPane
        field={field()}
        allFields={[field(), field({ key: 'climbed', type: 'toggle' })]}
        onChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /show this field only when/i }));
    expect(screen.getAllByLabelText(/when field/i)).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: /add another condition/i }),
    ).not.toBeInTheDocument();
  });
});

/** The pane over a field that takes its own patches, as the page does. */
function Live({
  start,
  allFields = [],
  onPatch = () => undefined,
  ...rest
}: {
  start: PaneField;
  allFields?: FormFieldDefinition[];
  onPatch?: (patch: PanePatch) => void;
} & Partial<Parameters<typeof SettingsPane>[0]>) {
  const [f, setF] = useState(start);
  return (
    <SettingsPane
      {...rest}
      field={f}
      allFields={allFields.length > 0 ? allFields.map((x) => (x.id === f.id ? f : x)) : [f]}
      onChange={(patch) => {
        onPatch(patch);
        setF((was) => ({ ...was, ...patch }));
      }}
    />
  );
}

const complete = {
  description: 'Pieces it scored high',
  unit: 'count',
  phase: 'teleop',
  direction: 'higher_is_better',
};

describe('SettingsPane: groups, meaning and the key (task 1.30)', () => {
  it('a new field shows every group open, and its key follows the label until saved', () => {
    render(<SettingsPane field={field()} allFields={[]} onChange={vi.fn()} saved={false} />);
    expect(
      screen.getByText('follows the label until the first save, then it is permanent'),
    ).toBeVisible();
    for (const name of ['Field', 'Configuration', 'Meaning', 'Scoring', 'Show when']) {
      expect(screen.getByRole('heading', { level: 3, name })).toBeVisible();
    }
    expect(screen.getByLabelText('Label')).toHaveValue('Auto notes');
  });

  it('a saved, complete field folds Field and Meaning to one line each, with ✓ Complete', async () => {
    const u = userEvent.setup();
    render(
      <SettingsPane
        field={field({ ...complete, category: 'scoring', section: 'Shooting', required: true })}
        allFields={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('· permanent, never changes')).toBeVisible();
    expect(screen.getAllByText('Complete')).toHaveLength(2);
    expect(screen.getByText('Shooting section · required · no help text')).toBeVisible();
    expect(screen.getByText('count · Teleop · higher is better · Scoring')).toBeVisible();
    expect(screen.queryByLabelText('Description')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Meaning' }));
    expect(screen.getByRole('button', { name: 'Meaning' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByLabelText('Description')).toHaveValue('Pieces it scored high');
  });

  it('a blank required control has the warn edge and "Needed to publish"; filling it clears that', async () => {
    const u = userEvent.setup();
    render(<Live start={field({ unit: 'count', phase: 'auto' })} />);
    expect(screen.getByText('2 missing')).toBeVisible();
    expect(screen.getAllByText('Needed to publish')).toHaveLength(2);
    const description = screen.getByLabelText('Description');
    expect(description).toHaveAccessibleDescription('Needed to publish');
    await u.type(description, 'Pieces it dropped');
    await u.click(
      within(screen.getByRole('radiogroup', { name: 'Direction' })).getByRole('radio', {
        name: 'Lower is better',
      }),
    );
    expect(screen.queryByText('Needed to publish')).toBeNull();
    // Field and Meaning are both complete now.
    expect(screen.getAllByText('Complete')).toHaveLength(2);
  });

  it('writes the meaning as columns: a phase, a direction, a unit, a cleared description as null', async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    render(<Live start={field({ description: 'x' })} onPatch={onPatch} />);
    await u.click(screen.getByRole('radio', { name: 'Endgame' }));
    expect(onPatch).toHaveBeenLastCalledWith({ phase: 'endgame' });
    await u.click(screen.getByRole('radio', { name: 'Neutral' }));
    expect(onPatch).toHaveBeenLastCalledWith({ direction: 'neutral' });
    await u.selectOptions(screen.getByLabelText(/^unit$/i), 'seconds');
    expect(onPatch).toHaveBeenLastCalledWith({ unit: 'seconds' });
    await u.clear(screen.getByLabelText('Description'));
    expect(onPatch).toHaveBeenLastCalledWith({ description: null });
  });

  it('the expected range is written whole, says what it does, and is null while half given', async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    render(<Live start={field()} onPatch={onPatch} />);
    expect(
      screen.getByText('A value outside it is blocked when the scouter enters it.'),
    ).toBeVisible();
    await u.type(screen.getByLabelText('Expected range, lowest'), '0');
    expect(onPatch).toHaveBeenLastCalledWith({ expected_range: null });
    expect(screen.getByText('Give both ends of the range, or neither.')).toBeVisible();
    await u.type(screen.getByLabelText('Expected range, highest'), '12');
    expect(onPatch).toHaveBeenLastCalledWith({ expected_range: { min: 0, max: 12 } });
  });

  it('an older version is read-only: every control is held', () => {
    render(
      <SettingsPane
        field={field()}
        allFields={[]}
        onChange={vi.fn()}
        editable={false}
        saved={false}
      />,
    );
    expect(screen.getByLabelText('Label')).toBeDisabled();
    expect(screen.getByLabelText('Description')).toBeDisabled();
    expect(screen.getByLabelText(/points per unit/i)).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Teleop' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /show this field only when/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /field actions/i })).toBeNull();
  });

  it('⋯ Remove field calls onRemove and says what removing does here', async () => {
    const onRemove = vi.fn();
    const u = userEvent.setup();
    render(
      <SettingsPane
        field={field()}
        allFields={[]}
        onChange={vi.fn()}
        published
        forkNote="starts draft v4"
        onRemove={onRemove}
      />,
    );
    await u.click(screen.getByRole('button', { name: 'Field actions: Auto notes' }));
    const item = screen.getByRole('menuitem', { name: /Remove field/ });
    expect(item).toHaveTextContent('removing it starts draft v4');
    await u.click(item);
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('the ⋯ menu closes on Escape and on Tab', async () => {
    const u = userEvent.setup();
    render(<SettingsPane field={field()} allFields={[]} onChange={vi.fn()} onRemove={vi.fn()} />);
    const actions = screen.getByRole('button', { name: 'Field actions: Auto notes' });
    await u.click(actions);
    expect(screen.getByRole('menu')).toBeVisible();
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(actions).toHaveFocus();
    await u.click(actions);
    await u.tab();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a blank label names the pane by its type', () => {
    render(
      <SettingsPane
        field={field({ label: '' })}
        allFields={[]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Counter');
    expect(screen.getByRole('button', { name: 'Field actions: Counter' })).toBeVisible();
  });
});

describe('SettingsPane: configuration (task 1.30)', () => {
  const climb = (over: Record<string, unknown> = {}) =>
    field({
      key: 'end_climb',
      label: 'Climb level',
      type: 'single_select',
      ...complete,
      phase: 'endgame',
      unit: 'enum',
      is_ordinal: true,
      config: {
        options: [
          { value: 'none', label: 'None' },
          { value: 'park', label: 'Parked' },
        ],
      },
      ...over,
    });

  it('an ordered select shows the rank, WORST and BEST, and on a published version what adding does', () => {
    render(
      <SettingsPane field={climb()} allFields={[]} onChange={vi.fn()} forkNote="starts draft v4" />,
    );
    expect(screen.getByLabelText(/ordered/i)).toBeChecked();
    expect(screen.getByText('WORST')).toBeVisible();
    expect(screen.getByText('BEST')).toBeVisible();
    expect(screen.getByText('Adding an option starts draft v4')).toBeVisible();
  });

  it("a saved option keeps its value when relabelled; a new one's value follows its label", async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    render(<Live start={climb()} onPatch={onPatch} savedOptionValues={['none', 'park']} />);
    await u.type(screen.getByLabelText('Option 2 label'), ' up');
    expect(onPatch).toHaveBeenLastCalledWith({
      config: {
        options: [
          { value: 'none', label: 'None' },
          { value: 'park', label: 'Parked up' },
        ],
      },
    });
    await u.click(screen.getByRole('button', { name: 'Add an option' }));
    await u.clear(screen.getByLabelText('Option 3 label'));
    await u.type(screen.getByLabelText('Option 3 label'), 'High bar');
    const last = onPatch.mock.lastCall![0] as PanePatch;
    expect((last.config as { options: unknown[] }).options[2]).toEqual({
      value: 'high_bar',
      label: 'High bar',
    });
  });

  it('options reorder by their 6-dot grip from the keyboard, and are removed with ✕, never below one', async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    render(<Live start={climb()} onPatch={onPatch} />);
    // No ↑ ↓ any more (final review, U1): the grip, named after its option, is the handle.
    expect(screen.queryByRole('button', { name: 'Move Parked up' })).toBeNull();
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const row = this.closest<HTMLElement>('[data-choice-row]');
        const top = row ? Number(row.dataset.choiceRow) * 48 : 0;
        return DOMRect.fromRect({ x: 0, y: top, width: 380, height: 48 });
      });
    const grip = screen.getByRole('button', { name: 'Move Parked' });
    grip.focus();
    fireEvent.keyDown(grip, { code: 'Space', key: ' ' });
    await tick();
    fireEvent.keyDown(document, { code: 'ArrowUp', key: 'ArrowUp' });
    await tick();
    fireEvent.keyDown(document, { code: 'Space', key: ' ' });
    await tick();
    rect.mockRestore();
    await waitFor(() => expect(screen.getByLabelText('Option 1 label')).toHaveValue('Parked'));
    // The moved row keeps its grip focused.
    expect(screen.getByRole('button', { name: 'Move Parked' })).toHaveFocus();
    expect(onPatch).toHaveBeenLastCalledWith({
      config: {
        options: [
          { value: 'park', label: 'Parked' },
          { value: 'none', label: 'None' },
        ],
      },
    });
    await u.click(screen.getByRole('button', { name: 'Remove None' }));
    expect(screen.getByRole('button', { name: 'Remove Parked' })).toBeDisabled();
  });

  it("a new option's points follow its value when it is relabelled, and go when it is removed", async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    const start = climb({
      config: {
        options: [
          { value: 'none', label: 'None' },
          { value: 'park', label: 'Parked' },
          { value: 'option_3', label: 'Option 3' },
        ],
      },
      points: 0,
      option_points: { none: 0, park: 2, option_3: 5 },
    });
    render(<Live start={start} onPatch={onPatch} savedOptionValues={['none', 'park']} />);
    await u.clear(screen.getByLabelText('Option 3 label'));
    await u.type(screen.getByLabelText('Option 3 label'), 'Low');
    expect(onPatch).toHaveBeenLastCalledWith({
      config: {
        options: [
          { value: 'none', label: 'None' },
          { value: 'park', label: 'Parked' },
          { value: 'low', label: 'Low' },
        ],
      },
      option_points: { none: 0, park: 2, low: 5 },
    });
    expect(screen.getByLabelText('Points for Low')).toHaveValue('5');

    await u.click(screen.getByRole('button', { name: 'Remove Low' }));
    expect(onPatch.mock.lastCall![0]).toMatchObject({ option_points: { none: 0, park: 2 } });
    expect(onPatch.mock.lastCall![0].option_points).not.toHaveProperty('low');
  });

  it("a saved option's points stay when it is removed: another version still has it", async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    render(
      <Live
        start={climb({ points: 0, option_points: { none: 0, park: 2 } })}
        onPatch={onPatch}
        savedOptionValues={['none', 'park']}
      />,
    );
    await u.click(screen.getByRole('button', { name: 'Remove Parked' }));
    expect(onPatch).toHaveBeenLastCalledWith({
      config: { options: [{ value: 'none', label: 'None' }] },
    });
  });

  it('a step must be above 0, and a counter’s default a whole number', async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    render(<Live start={field({ ...complete })} onPatch={onPatch} />);
    const step = screen.getByLabelText('Step');
    await u.clear(step);
    onPatch.mockClear();
    await u.type(step, '0');
    expect(onPatch).not.toHaveBeenCalledWith({ config: { min: 0, max: 10, step: 0 } });
    expect(step).toHaveAttribute('aria-invalid', 'true');
    await u.type(screen.getByLabelText('Default'), '1.5');
    expect(onPatch).not.toHaveBeenCalledWith({ default_value: 1.5 });
    expect(screen.getByLabelText('Default')).toHaveAttribute('aria-invalid', 'true');
  });

  it('turning Ordered on writes is_ordinal', async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    render(<Live start={climb({ is_ordinal: false })} onPatch={onPatch} />);
    await u.click(screen.getByLabelText(/ordered/i));
    expect(onPatch).toHaveBeenLastCalledWith({ is_ordinal: true });
  });

  it('a counter takes min, max, step and its default; a blank one drops the key', async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    render(<Live start={field({ ...complete })} onPatch={onPatch} />);
    await u.clear(screen.getByLabelText('Max'));
    expect(onPatch).toHaveBeenLastCalledWith({ config: { min: 0, step: 1 } });
    await u.type(screen.getByLabelText('Max'), '20');
    expect(onPatch).toHaveBeenLastCalledWith({ config: { min: 0, step: 1, max: 20 } });
    await u.type(screen.getByLabelText('Default'), '2');
    expect(onPatch).toHaveBeenLastCalledWith({ default_value: 2 });
  });

  it('changing the type resets its config and meaning unit, and leaves its points alone', async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    render(
      <Live
        start={field({ ...complete, points: 4 })}
        onPatch={onPatch}
        forkNote="starts draft v4"
        saved={false}
      />,
    );
    expect(screen.getByText('Changing the type starts draft v4.')).toBeVisible();
    await u.selectOptions(screen.getByLabelText('Type'), 'single_select');
    // No points in the patch: the page keeps the rule, and the save drops only what the new
    // type cannot carry (fix round 1, I1). is_ordinal is null, as a palette select starts.
    expect(onPatch).toHaveBeenLastCalledWith({
      type: 'single_select',
      config: {
        options: [
          { value: 'option_1', label: 'Option 1' },
          { value: 'option_2', label: 'Option 2' },
        ],
      },
      default_value: null,
      unit: null,
      is_ordinal: null,
    });
    expect(screen.getByLabelText(/ordered/i)).not.toBeChecked();
  });

  it('a counter changed to a number keeps its 4 points each, with no warning', async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    render(<Live start={field({ ...complete, points: 4 })} onPatch={onPatch} saved={false} />);
    await u.selectOptions(screen.getByLabelText('Type'), 'number');
    expect(onPatch.mock.lastCall![0]).not.toHaveProperty('points');
    expect(onPatch.mock.lastCall![0]).not.toHaveProperty('option_points');
    expect(screen.getByLabelText('Points per unit')).toHaveValue('4');
    expect(screen.queryByText(/Its points are removed/)).toBeNull();
  });

  it('a counter changed to long text says its points go for every version, before it is saved', async () => {
    const u = userEvent.setup();
    render(<Live start={field({ ...complete, points: 4 })} saved={false} />);
    expect(screen.queryByText(/Its points are removed/)).toBeNull();
    await u.selectOptions(screen.getByLabelText('Type'), 'long_text');
    expect(screen.getByLabelText('Type')).toHaveAccessibleDescription(
      'Its points are removed for every version of this form.',
    );
    expect(screen.getByText(/Long text fields are not scored/)).toBeVisible();
    // Back to a counter before saving: the points were never lost.
    await u.selectOptions(screen.getByLabelText('Type'), 'counter');
    expect(screen.queryByText(/Its points are removed/)).toBeNull();
    expect(screen.getByLabelText('Points per unit')).toHaveValue('4');
  });

  it('an event log lists its buttons, asks where with the mirror preview, and says what a tap saves', async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    render(
      <Live
        start={field({
          type: 'event_log',
          ...complete,
          config: { event_types: [{ value: 'high', label: 'High goal' }], ask_position: false },
        })}
        onPatch={onPatch}
      />,
    );
    expect(screen.getByLabelText('Button 1 label')).toHaveValue('High goal');
    expect(screen.getByText(/Event logs are not scored/)).toBeVisible();
    expect(screen.getByText('What a tap saves:')).toBeVisible();
    expect(screen.queryByRole('img', { name: 'Mirroring preview' })).toBeNull();
    await u.click(screen.getByLabelText(/Ask where on the field/));
    expect(onPatch).toHaveBeenLastCalledWith({
      config: {
        event_types: [{ value: 'high', label: 'High goal' }],
        ask_position: true,
        mirror_axis: 'horizontal',
      },
    });
    expect(screen.getByRole('img', { name: 'Mirroring preview' })).toBeVisible();
  });

  it('a cycle path caps its points per cycle with − and +, and previews the mirror as a route', async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    render(
      <Live
        start={field({
          type: 'cycle_path',
          ...complete,
          config: { max_points_per_cycle: 6, mirror_axis: 'none' },
        })}
        onPatch={onPatch}
      />,
    );
    await u.click(screen.getByRole('button', { name: 'One point fewer' }));
    expect(onPatch).toHaveBeenLastCalledWith({
      config: { max_points_per_cycle: 5, mirror_axis: 'none' },
    });
    expect(screen.getByText(/nothing is mirrored/)).toBeVisible();
    await u.click(screen.getByRole('radio', { name: 'Both' }));
    expect(screen.getByText(/blue is mirrored/)).toBeVisible();
    expect(screen.getByText(/A rough sketch, not a trajectory/)).toBeVisible();
  });
});

describe('SettingsPane: scoring (task 1.30)', () => {
  it('the field phase column holds the points; the other phases are greyed and say why', async () => {
    const onChange = vi.fn();
    const u = userEvent.setup();
    render(
      <SettingsPane
        field={field({ ...complete, points: 4 })}
        allFields={[]}
        onChange={onChange}
        published
      />,
    );
    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Auto', 'Teleop', 'Endgame']);
    expect(within(table).getAllByText("not this field's phase")).toHaveLength(2);
    const box = screen.getByLabelText('Points per unit');
    expect(box).toHaveValue('4');
    expect(screen.getByText('in place · no new version')).toBeVisible();
    await u.clear(box);
    await u.type(box, '6');
    expect(onChange).toHaveBeenLastCalledWith({ points: 6, option_points: null });
  });

  it('a select scores per option and sends points 0 with its option points', async () => {
    const onChange = vi.fn();
    const u = userEvent.setup();
    render(
      <SettingsPane
        field={field({
          ...complete,
          phase: 'endgame',
          type: 'single_select',
          config: {
            options: [
              { value: 'none', label: 'None' },
              { value: 'high', label: 'High bar' },
            ],
          },
          points: 0,
          option_points: { none: 0, high: 12 },
        })}
        allFields={[]}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText('Points for High bar')).toHaveValue('12');
    await u.type(screen.getByLabelText('Points for None'), '1');
    expect(onChange).toHaveBeenLastCalledWith({ points: 0, option_points: { none: 1, high: 12 } });
  });

  it('a toggle has one row; a negative number is refused', async () => {
    const onChange = vi.fn();
    const u = userEvent.setup();
    render(
      <SettingsPane
        field={field({ ...complete, type: 'toggle', config: {} })}
        allFields={[]}
        onChange={onChange}
      />,
    );
    // The header row and the one row for yes.
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
    expect(within(screen.getByRole('table')).getAllByRole('rowheader')).toHaveLength(1);
    const box = screen.getByLabelText('Points for yes');
    await u.clear(box);
    onChange.mockClear();
    await u.type(box, '-3');
    expect(onChange).not.toHaveBeenCalledWith({ points: -3, option_points: null });
    expect(box).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the problems the page found with this field’s points', () => {
    render(
      <SettingsPane
        field={field({ ...complete })}
        allFields={[]}
        onChange={vi.fn()}
        scoringIssues={["'x' is not an option of 'auto_notes'"]}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent("'x' is not an option of 'auto_notes'");
  });
});

describe('SettingsPane: computed fields and Show when (task 1.30)', () => {
  const high = field({ id: 'h', key: 'auto_high', label: 'Pieces high', ...complete });
  const low = field({ id: 'l', key: 'auto_low', label: 'Pieces low', ...complete });
  const total = field({
    id: 't',
    key: 'post_total',
    label: 'Total',
    type: 'computed',
    ...complete,
    config: { expression: null, result_type: 'float' },
  });

  it('a sum of two fields writes the expression; until both are chosen it stays null', async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    render(<Live start={total} allFields={[high, low, total]} onPatch={onPatch} />);
    expect(screen.getByText(/Computed fields are not scored/)).toBeVisible();
    await u.selectOptions(screen.getByLabelText('Field 1'), 'auto_high');
    expect(onPatch).toHaveBeenLastCalledWith({
      config: { expression: null, result_type: 'float' },
    });
    await u.selectOptions(screen.getByLabelText('Field 2'), 'auto_low');
    expect(onPatch).toHaveBeenLastCalledWith({
      config: {
        expression: {
          kind: 'op',
          op: '+',
          left: { kind: 'field', key: 'auto_high' },
          right: { kind: 'field', key: 'auto_low' },
        },
        result_type: 'float',
      },
    });
    expect(screen.getByText('auto_high + auto_low')).toBeVisible();
  });

  it('a ratio can divide by a number', async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    render(<Live start={total} allFields={[high, low, total]} onPatch={onPatch} />);
    await u.selectOptions(screen.getByLabelText('Worked out as'), 'ratio');
    await u.selectOptions(screen.getByLabelText('First'), 'auto_high');
    await u.selectOptions(screen.getByLabelText('Second'), 'A number');
    await u.clear(screen.getByLabelText('The number'));
    await u.type(screen.getByLabelText('The number'), '2');
    expect(onPatch).toHaveBeenLastCalledWith({
      config: {
        expression: {
          kind: 'op',
          op: '/',
          left: { kind: 'field', key: 'auto_high' },
          right: { kind: 'literal', value: 2 },
        },
        result_type: 'float',
      },
    });
  });

  it('an expression the editor does not offer is shown as text, with Replace it', () => {
    const odd = field({
      ...total,
      config: {
        expression: {
          kind: 'op',
          op: '+',
          left: { kind: 'literal', value: 1 },
          right: { kind: 'field', key: 'auto_high' },
        },
        result_type: 'float',
      },
    });
    render(<SettingsPane field={odd} allFields={[high, odd]} onChange={vi.fn()} />);
    expect(screen.getByText('1 + auto_high')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Replace it' })).toBeVisible();
  });

  it('a condition on a toggle is written when its field is chosen, with ASCII operators', async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    const climbed = field({
      id: 'c',
      key: 'climbed',
      label: 'Climbed',
      type: 'toggle',
      config: {},
    });
    render(
      <Live
        start={field({ ...complete })}
        allFields={[field({ ...complete }), climbed]}
        onPatch={onPatch}
      />,
    );
    await u.click(screen.getByRole('button', { name: /show this field only when/i }));
    await u.selectOptions(screen.getByLabelText('When field'), 'climbed');
    expect(onPatch).toHaveBeenLastCalledWith({
      visibility_condition: { field_key: 'climbed', op: '=', value: true },
    });
    expect(
      within(screen.getByLabelText('Is'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['=', '!=']);
    await u.selectOptions(screen.getByLabelText('Value'), 'No');
    expect(onPatch).toHaveBeenLastCalledWith({
      visibility_condition: { field_key: 'climbed', op: '=', value: false },
    });
    await u.click(screen.getByRole('button', { name: 'Remove the condition' }));
    expect(onPatch).toHaveBeenLastCalledWith({ visibility_condition: null });
  });

  it('a condition on a number waits for its value, and offers the ordering operators', async () => {
    const onPatch = vi.fn();
    const u = userEvent.setup();
    const me = field({
      ...complete,
      key: 'tele_quality',
      type: 'rating',
      config: { max: 5, style: 'stars' },
    });
    render(<Live start={me} allFields={[me, high]} onPatch={onPatch} />);
    await u.click(screen.getByRole('button', { name: /show this field only when/i }));
    await u.selectOptions(screen.getByLabelText('When field'), 'auto_high');
    expect(onPatch).toHaveBeenLastCalledWith({ visibility_condition: null });
    expect(
      within(screen.getByLabelText('Is'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['=', '!=', '>', '<', '>=', '<=']);
    await u.selectOptions(screen.getByLabelText('Is'), '>=');
    await u.type(screen.getByLabelText('Value'), '3');
    expect(onPatch).toHaveBeenLastCalledWith({
      visibility_condition: { field_key: 'auto_high', op: '>=', value: 3 },
    });
  });
});
