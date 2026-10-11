import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormFieldDefinition } from '@frc/shared';
import { stopwatches } from '../stopwatches';
import { TimerInput } from './TimerInput';

const field: FormFieldDefinition = {
  id: 'f-climb',
  key: 'end_climb_time',
  label: 'Climb time',
  help_text: 'From starting the climb to hanging',
  type: 'timer',
  section: null,
  display_order: 1,
  required: false,
  default_value: null,
  config: { allow_unsure: true },
  visibility_condition: null,
  deprecated: false,
  description: 'Seconds to climb',
  unit: 'seconds',
  phase: 'endgame',
  direction: 'lower_is_better',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
};

/** The page's part: it holds the value and hands it back, as EntryPage does. */
function Held({ start, spy }: { start?: unknown; spy: (v: unknown) => void }) {
  const [value, setValue] = useState<unknown>(start);
  return (
    <TimerInput
      field={field}
      value={value}
      onChange={(v) => {
        spy(v);
        setValue(v);
      }}
    />
  );
}

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  stopwatches.resetAll();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('TimerInput (SPEC-FINAL 5.2; design "The Timer field")', () => {
  it('starts ready: one Start and the "Unsure — no time" switch, nothing else', () => {
    render(<Held spy={vi.fn()} />);
    expect(button('Start Climb time')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Unsure — no time' })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: /Pause|Clear|Resume/ })).toBeNull();
  });

  it('runs, then pauses with the accumulated seconds as a number', () => {
    const spy = vi.fn();
    render(<Held spy={spy} />);
    fireEvent.click(button('Start Climb time'));
    advance(6_400);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByTestId('timer-face')).toHaveTextContent('6.4');
    fireEvent.click(button('Pause'));
    expect(spy).toHaveBeenLastCalledWith(6.4);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(button('Resume')).toBeInTheDocument();
    expect(button('Clear')).toBeInTheDocument();
  });

  it('resumes from the banked time, so it accumulates across stops', () => {
    const spy = vi.fn();
    render(<Held spy={spy} />);
    fireEvent.click(button('Start Climb time'));
    advance(3_000);
    fireEvent.click(button('Pause'));
    advance(10_000);
    fireEvent.click(button('Resume'));
    advance(2_500);
    fireEvent.click(button('Pause'));
    expect(spy).toHaveBeenLastCalledWith(5.5);
  });

  it('counts from timestamps: a sleeping tab (no ticks) and a re-mount lose no time', () => {
    const spy = vi.fn();
    const { unmount } = render(<Held spy={spy} />);
    fireEvent.click(button('Start Climb time'));
    // The phase is left: the field unmounts while its stopwatch runs.
    unmount();
    vi.setSystemTime(Date.now() + 30_000);
    render(<Held spy={spy} />);
    expect(screen.getByTestId('timer-face')).toHaveTextContent('30.0');
    fireEvent.click(button('Pause'));
    expect(spy).toHaveBeenLastCalledWith(30);
  });

  it('is editable once stopped: ✎ corrects a late stop', () => {
    const spy = vi.fn();
    render(<Held start={9.1} spy={spy} />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    fireEvent.click(button('Correct the time'));
    const input = screen.getByRole('spinbutton', { name: 'Climb time, seconds' });
    fireEvent.change(input, { target: { value: '7.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(spy).toHaveBeenLastCalledWith(7.5);
    expect(screen.getByTestId('timer-face')).toHaveTextContent('7.5');
  });

  it('"Unsure — no time" records no value (null), and switching it off brings the time back', () => {
    const spy = vi.fn();
    render(<Held start={6.4} spy={spy} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Unsure — no time' }));
    expect(spy).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('No time recorded · unsure')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start|Resume/ })).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Unsure — no time' }));
    expect(spy).toHaveBeenLastCalledWith(6.4);
  });
});

describe('TimerInput: what must never happen', () => {
  it('Clear is never final: Undo brings back the accumulated value (8.2)', () => {
    const spy = vi.fn();
    render(<Held start={8.2} spy={spy} />);
    fireEvent.click(button('Clear'));
    expect(spy).toHaveBeenLastCalledWith(undefined);
    expect(button('Start Climb time')).toBeInTheDocument();
    fireEvent.click(button('Undo clear'));
    expect(spy).toHaveBeenLastCalledWith(8.2);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByTestId('timer-face')).toHaveTextContent('8.2');
  });

  it('Clear while running is undoable back to the time it had run, not to nothing', () => {
    const spy = vi.fn();
    render(<Held spy={spy} />);
    fireEvent.click(button('Start Climb time'));
    advance(12_300);
    fireEvent.click(button('Clear'));
    expect(spy).toHaveBeenLastCalledWith(undefined);
    fireEvent.click(button('Undo clear'));
    expect(spy).toHaveBeenLastCalledWith(12.3);
    expect(screen.getByTestId('timer-face')).toHaveTextContent('12.3');
  });
});
