import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { FormFieldDefinition } from '@frc/shared';
import { FieldInput } from './FieldInput';

const f = (over: Partial<FormFieldDefinition>): FormFieldDefinition => ({
  id: 'f',
  key: 'k',
  label: 'Label',
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

const sum = {
  kind: 'op',
  op: '+',
  left: { kind: 'field', key: 'a' },
  right: { kind: 'field', key: 'b' },
} as const;

describe('FieldInput across the catalogue', () => {
  it('renders a number field with min, max and step and no counter buttons', () => {
    render(
      <FieldInput
        field={f({
          key: 'n',
          type: 'number',
          label: 'Cycles',
          config: { min: 0, max: 9, step: 0.5 },
        })}
        value={2}
        onChange={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Cycles');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '9');
    expect(input).toHaveAttribute('step', '0.5');
    expect(screen.queryByRole('button', { name: /plus one/i })).not.toBeInTheDocument();
  });

  it('renders a rating as five star buttons when style is stars', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FieldInput
        field={f({ key: 'r', type: 'rating', label: 'Driver', config: { max: 5, style: 'stars' } })}
        value={null}
        onChange={onChange}
      />,
    );
    const stars = screen.getAllByRole('radio');
    expect(stars).toHaveLength(5);
    await user.click(stars[3]!);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('renders a rating as a slider when style is slider, labelled with its value', () => {
    render(
      <FieldInput
        field={f({
          key: 'r',
          type: 'rating',
          label: 'Driver',
          config: { max: 5, style: 'slider' },
        })}
        value={3}
        onChange={vi.fn()}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Driver' });
    expect(slider).toHaveValue('3');
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('toggles a multi-select option on and off and reports the whole array', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const field = f({
      key: 'm',
      type: 'multi_select',
      label: 'Roles',
      config: {
        options: [
          { value: 'a', label: 'Defence' },
          { value: 'b', label: 'Scoring' },
        ],
      },
    });
    const { rerender } = render(<FieldInput field={field} value={[]} onChange={onChange} />);
    await user.click(screen.getByRole('checkbox', { name: 'Defence' }));
    expect(onChange).toHaveBeenLastCalledWith(['a']);
    rerender(<FieldInput field={field} value={['a']} onChange={onChange} />);
    await user.click(screen.getByRole('checkbox', { name: 'Defence' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('renders a computed field read-only, recomputed from its expression as siblings change', () => {
    const computed = f({
      key: 'total',
      type: 'computed',
      label: 'Total',
      unit: 'points',
      config: { result_type: 'float', expression: sum },
    });
    const { rerender } = render(
      <FieldInput
        field={computed}
        value={undefined}
        onChange={vi.fn()}
        siblingValues={{ a: 2, b: 3 }}
      />,
    );
    expect(screen.getByLabelText('Total')).toHaveTextContent('5');
    rerender(
      <FieldInput
        field={computed}
        value={undefined}
        onChange={vi.fn()}
        siblingValues={{ a: 2, b: 8 }}
      />,
    );
    expect(screen.getByLabelText('Total')).toHaveTextContent('10');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders a section as a heading with no input at all', () => {
    render(
      <FieldInput
        field={f({
          key: 's',
          type: 'section',
          label: 'Autonomous',
          description: null,
          unit: null,
          phase: null,
          direction: null,
        })}
        value={undefined}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Autonomous' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('gives every tappable control the tap-target class, which carries the 48 px floor', () => {
    render(
      <FieldInput
        field={f({ key: 'c', type: 'counter', label: 'Notes' })}
        value={0}
        onChange={vi.fn()}
      />,
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('tap-target');
    }
  });

  it('sets dir="auto" on every label and on every free-text input', () => {
    render(
      <FieldInput
        field={f({ key: 't', type: 'long_text', label: 'הערות', unit: 'text' })}
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('הערות')).toHaveAttribute('dir', 'auto');
    expect(screen.getByRole('textbox')).toHaveAttribute('dir', 'auto');
  });
});

describe('FieldInput: the details of each simple type (entry parts, 1.33)', () => {
  it('shows the unit at the right and the expected range as a hint under a number', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Held
        field={f({
          key: 'cyc',
          type: 'number',
          label: 'Cycle estimate',
          help_text: 'Your best guess of seconds per cycle',
          unit: 'seconds',
          expected_range: { min: 3, max: 60 },
        })}
        initial={undefined}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Cycle estimate');
    expect(screen.getByText('seconds')).toBeInTheDocument();
    expect(screen.getByText('Between 3 and 60')).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription(/Your best guess of seconds per cycle/);
    expect(input).toHaveAccessibleDescription(/Between 3 and 60/);
    await user.type(input, '14');
    expect(onChange).toHaveBeenLastCalledWith(14);
    await user.clear(input);
    // An emptied number holds nothing, never a 0 the scout did not type.
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('marks a required field with a quiet "Required" beside its label', () => {
    render(
      <FieldInput
        field={f({
          key: 'climb',
          type: 'single_select',
          label: 'Climb level',
          required: true,
          config: { options: [{ value: 'none', label: 'None' }] },
        })}
        value={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Required')).toBeInTheDocument();
    // The marker is not part of the group's name.
    expect(screen.getByRole('group', { name: 'Climb level' })).toBeInTheDocument();
  });

  it('draws a short text as a one-line text box carrying dir="auto" and its length limit', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FieldInput
        field={f({
          key: 'on',
          type: 'short_text',
          label: 'What it climbed on',
          unit: 'text',
          config: { max_length: 40 },
        })}
        value=""
        onChange={onChange}
      />,
    );
    const box = screen.getByRole('textbox', { name: 'What it climbed on' });
    expect(box.tagName).toBe('INPUT');
    expect(box).toHaveAttribute('dir', 'auto');
    expect(box).toHaveAttribute('maxlength', '40');
    await user.type(box, 'L');
    expect(onChange).toHaveBeenLastCalledWith('L');
  });

  it('words the five stars Poor · Weak · OK · Good · Great, filled up to the pick', () => {
    render(
      <FieldInput
        field={f({
          key: 'r',
          type: 'rating',
          label: 'Driver skill',
          config: { max: 5, style: 'stars' },
        })}
        value={3}
        onChange={vi.fn()}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Driver skill' });
    expect(group).toHaveTextContent('PoorWeakOKGoodGreat');
    const stars = screen.getAllByRole('radio');
    expect(stars.map((s) => (s as HTMLInputElement).checked)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
    const filled = [...group.querySelectorAll('[data-star]')].map((el) =>
      el.hasAttribute('data-filled'),
    );
    expect(filled).toEqual([true, true, true, false, false]);
  });

  it('commits a slider at its first value on a tap, so 1 can be picked from unanswered', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FieldInput
        field={f({ key: 'r', type: 'rating', label: 'Speed', config: { max: 5, style: 'slider' } })}
        value={undefined}
        onChange={onChange}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Speed' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Not rated');
    await user.click(slider);
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('formats a computed float to 2 places and a whole number with none; nothing yet is a dash', () => {
    const ratio = f({
      key: 'r',
      type: 'computed',
      label: 'Ratio',
      config: { result_type: 'float', expression: { ...sum, op: '/' } },
    });
    const { rerender } = render(
      <FieldInput
        field={ratio}
        value={undefined}
        onChange={vi.fn()}
        siblingValues={{ a: 1, b: 3 }}
      />,
    );
    expect(screen.getByLabelText('Ratio')).toHaveTextContent('0.33');
    rerender(
      <FieldInput field={ratio} value={undefined} onChange={vi.fn()} siblingValues={{ a: 1 }} />,
    );
    expect(screen.getByLabelText('Ratio')).toHaveTextContent('—');
  });
});

/** A field the way a page holds it: the value comes back after every change. */
function Held({
  field,
  initial,
  onChange,
}: {
  field: FormFieldDefinition;
  initial: unknown;
  onChange: (v: unknown) => void;
}) {
  const [value, setValue] = useState<unknown>(initial);
  return (
    <FieldInput
      field={field}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('FieldInput: what must never happen', () => {
  it('a counter is never a text input', () => {
    render(
      <FieldInput
        field={f({ key: 'c', type: 'counter', label: 'Pieces scored high' })}
        value={4}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pieces scored high plus one' })).toBeInTheDocument();
  });

  it('a multi-select Undo takes back only the last toggle, never all of them (8.2)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const field = f({
      key: 'from',
      type: 'multi_select',
      label: 'Scored from',
      config: {
        options: [
          { value: 'near', label: 'Near' },
          { value: 'mid', label: 'Mid' },
          { value: 'far', label: 'Far' },
        ],
      },
    });
    render(<Held field={field} initial={[]} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Near' }));
    await user.click(screen.getByRole('checkbox', { name: 'Far' }));
    expect(onChange).toHaveBeenLastCalledWith(['near', 'far']);
    await user.click(screen.getByRole('button', { name: 'Undo “Far”' }));
    expect(onChange).toHaveBeenLastCalledWith(['near']);
    expect(screen.getByRole('checkbox', { name: 'Near' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Far' })).not.toBeChecked();
    // The next undo names the toggle under it, and then there is nothing left to undo.
    await user.click(screen.getByRole('button', { name: 'Undo “Near”' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
  });

  it('a section holds no value and draws no control', () => {
    const onChange = vi.fn();
    const { container } = render(
      <FieldInput
        field={f({ key: 's', type: 'section', label: 'Driver', unit: null, phase: null })}
        value="stray"
        onChange={onChange}
      />,
    );
    expect(container.querySelector('input, textarea, select, button, output')).toBeNull();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Driver', level: 3 })).toBeInTheDocument();
    expect(screen.queryByText('stray')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a computed field is read-only: no input of any kind', () => {
    const onChange = vi.fn();
    const { container } = render(
      <FieldInput
        field={f({
          key: 'total',
          type: 'computed',
          label: 'Total pieces scored',
          config: { result_type: 'float', expression: sum },
        })}
        value={99}
        onChange={onChange}
        siblingValues={{ a: 4, b: 5 }}
      />,
    );
    expect(
      container.querySelector('input, textarea, select, button, [contenteditable]'),
    ).toBeNull();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    // Worked out from the siblings, never a value handed to it.
    expect(screen.getByLabelText('Total pieces scored')).toHaveTextContent('9');
    expect(onChange).not.toHaveBeenCalled();
  });
});

/*
 * UF.18: every entry control lays out by its own width, so the builder's 410 px canvas and Try it
 * draw the form as the phone does. Nothing a FieldInput draws may switch on the window's width.
 */

const base: FormFieldDefinition = {
  id: 'f',
  key: 'end_climb',
  label: 'Climb level',
  help_text: 'How high it got',
  type: 'single_select',
  section: null,
  display_order: 1,
  required: false,
  default_value: null,
  config: {
    options: [
      { value: 'none', label: 'No climb' },
      { value: 'park', label: 'Parked' },
      { value: 'low', label: 'Low rung' },
      { value: 'high', label: 'High rung' },
    ],
  },
  visibility_condition: null,
  deprecated: false,
  description: 'How high',
  unit: 'enum',
  phase: 'endgame',
  direction: 'higher_is_better',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
};

/** `sm:` … `2xl:` and `max-*:` read the window; `@sm:` … read the container. */
const WINDOW_VARIANT = /(^|\s)(max-)?(sm|md|lg|xl|2xl):/;

describe('FieldInput lays out by its own width (UF.18)', () => {
  const cases: [string, Partial<FormFieldDefinition>, unknown][] = [
    ['counter', { type: 'counter', config: { min: 0, step: 1 } }, 3],
    ['toggle', { type: 'toggle', config: {} }, true],
    ['single select, four options', {}, 'park'],
    [
      'single select, two options',
      {
        config: {
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
        },
      },
      'a',
    ],
    ['long text', { type: 'long_text', config: {} }, 'Fast'],
    [
      'number',
      { type: 'number', unit: 'seconds', config: { min: 0 }, expected_range: { min: 3, max: 60 } },
      14,
    ],
    ['multi select, four options', { type: 'multi_select', required: true }, ['park', 'high']],
    [
      'multi select, two options',
      {
        type: 'multi_select',
        config: {
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
        },
      },
      ['a'],
    ],
    ['rating, stars', { type: 'rating', config: { max: 5, style: 'stars' } }, 4],
    ['rating, slider', { type: 'rating', config: { max: 5, style: 'slider' } }, 4],
    ['short text', { type: 'short_text', config: {} }, 'Left chain'],
    [
      'computed',
      { type: 'computed', config: { result_type: 'float', expression: sum } },
      undefined,
    ],
    ['section', { type: 'section', config: {} }, undefined],
  ];
  it.each(cases)('%s: no window-width class anywhere', (_name, over, value) => {
    const { container } = render(
      <FieldInput
        field={{ ...base, ...over }}
        value={value}
        onChange={vi.fn()}
        siblingValues={{ a: 1, b: 2 }}
      />,
    );
    const all = [container.firstElementChild!, ...container.querySelectorAll('*')];
    expect(all.length).toBeGreaterThan(1);
    for (const el of all) {
      expect(el.getAttribute('class') ?? '', el.tagName).not.toMatch(WINDOW_VARIANT);
    }
  });

  it('a field with a label lays out as one row once its own box is wide (the desktop field row)', () => {
    const { container } = render(
      <FieldInput field={{ ...base, type: 'number', config: {} }} value={4} onChange={vi.fn()} />,
    );
    const row = container.firstElementChild!;
    expect(row.className).toContain('@container');
    expect(container.innerHTML).toContain('@min-[44rem]:grid-cols-[minmax(0,1fr)_27.5rem]');
  });
});
