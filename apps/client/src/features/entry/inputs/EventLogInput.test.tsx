import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventLogTap, FormFieldDefinition } from '@frc/shared';
import { EntryContext, type EntryContextValue } from '../entryContext';
import { imageToView, viewRotation } from '../map/mapGeometry';
import { matchClock } from '../matchClock';
import { EventLogInput } from './EventLogInput';

const IMAGE = 'seasons/2026/field.webp';

const shots = (config: Record<string, unknown> = {}): FormFieldDefinition => ({
  id: 'f-shots',
  key: 'tele_shots',
  label: 'Shots',
  help_text: 'Tap the goal each time it shoots',
  type: 'event_log',
  section: null,
  display_order: 1,
  required: false,
  default_value: null,
  config: {
    event_types: [
      { value: 'high', label: 'High goal' },
      { value: 'low', label: 'Low goal' },
      { value: 'miss', label: 'Missed' },
    ],
    ...config,
  },
  visibility_condition: null,
  deprecated: false,
  description: 'Shots taken',
  unit: 'count',
  phase: 'teleop',
  direction: 'higher_is_better',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
});

const WHERE = { ask_position: true, mirror_axis: 'horizontal' };

/** The page's part: it holds the taps and hands them back, inside the entry's context. */
function Held({
  field,
  start,
  spy,
  context,
}: {
  field: FormFieldDefinition;
  start?: EventLogTap[];
  spy: (v: unknown) => void;
  context?: Partial<EntryContextValue>;
}) {
  const [value, setValue] = useState<unknown>(start);
  return (
    <EntryContext value={{ alliance: 'red', station: 'R1', fieldImagePath: IMAGE, ...context }}>
      <EventLogInput
        field={field}
        value={value}
        onChange={(v) => {
          spy(v);
          setValue(v);
        }}
      />
    </EntryContext>
  );
}

const last = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.at(-1)![0] as EventLogTap[];
const tapButton = (label: string) =>
  screen.getByRole('button', { name: new RegExp(`^${label}, \\d+ taps?$`) });
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

/** Pretends the map drawing is a `w × h` box at the page's origin (jsdom lays nothing out). */
function sizeMap(w: number, h: number) {
  const drawing = screen.getByTestId('map-drawing');
  vi.spyOn(drawing, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: w,
    bottom: h,
    width: w,
    height: h,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return drawing;
}

/** A tap on the drawing at the place where the image point `spot` is drawn. */
function tapImagePoint(spot: { x: number; y: number }, w: number, h: number) {
  const drawing = sizeMap(w, h);
  const at = imageToView(spot, Number(drawing.dataset.rotation) as 0 | 90 | 180 | 270);
  fireEvent.click(drawing, { clientX: at.x * w, clientY: at.y * h });
}

function phoneViewport() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  );
}

beforeEach(() => {
  // Only the clock: the lazy map chunk and findBy* still need real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  matchClock.reset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('EventLogInput (SPEC-FINAL 5.2, 5.5)', () => {
  it('draws one button per configured event type, each with the 48 px floor', () => {
    render(<Held field={shots()} spy={vi.fn()} />);
    const buttons = ['High goal', 'Low goal', 'Missed'].map(tapButton);
    expect(buttons).toHaveLength(3);
    for (const b of buttons) {
      expect(b.className).toContain('tap-target');
      expect(b.className).toContain('min-h-[3.25rem]');
    }
  });

  it('appends {type, t} with t from the match clock, and counts the taps', () => {
    const spy = vi.fn();
    render(<Held field={shots()} spy={spy} />);
    matchClock.start();
    advance(5_000);
    fireEvent.click(tapButton('High goal'));
    expect(last(spy)).toEqual([{ type: 'high', t: 5 }]);
    advance(2_300);
    fireEvent.click(tapButton('Missed'));
    expect(last(spy)).toEqual([
      { type: 'high', t: 5 },
      { type: 'miss', t: 7.3 },
    ]);
    expect(tapButton('High goal')).toHaveAccessibleName('High goal, 1 tap');
    expect(screen.getByText('taps')).toBeInTheDocument();
  });

  it('lists the taps newest first, each with its own delete button', () => {
    render(
      <Held
        field={shots()}
        spy={vi.fn()}
        start={[
          { type: 'high', t: 18 },
          { type: 'high', t: 41 },
          { type: 'miss', t: 57 },
        ]}
      />,
    );
    const chips = within(
      screen.getByRole('list', { name: 'Shots taps, newest first' }),
    ).getAllByRole('listitem');
    expect(chips.map((c) => c.textContent)).toEqual([
      'Missed0:57',
      'High goal0:41',
      'High goal0:18',
    ]);
    for (const chip of chips)
      expect(within(chip).getByRole('button', { name: /^Remove / })).toBeVisible();
  });

  it('keeps the taps ascending by t, even when a tap lands earlier than the last one', () => {
    const spy = vi.fn();
    render(<Held field={shots()} spy={spy} start={[{ type: 'high', t: 30 }]} />);
    matchClock.start(); // a fresh origin: the next tap is at t = 2, before 30
    advance(2_000);
    fireEvent.click(tapButton('Low goal'));
    expect(last(spy).map((t) => t.t)).toEqual([2, 30]);
  });

  it('Undo last tap takes back only the last tap', () => {
    const spy = vi.fn();
    render(<Held field={shots()} spy={spy} />);
    fireEvent.click(tapButton('High goal'));
    advance(1_000);
    fireEvent.click(tapButton('Low goal'));
    fireEvent.click(screen.getByRole('button', { name: 'Undo last tap' }));
    expect(last(spy)).toEqual([{ type: 'high', t: 0 }]);
  });
});

describe('EventLogInput: Undo last tap after the field is drawn anew', () => {
  it('takes the latest tap in time, one at a time, when there is no history (another phase)', () => {
    const spy = vi.fn();
    render(
      <Held
        field={shots()}
        spy={spy}
        start={[
          { type: 'high', t: 18 },
          { type: 'miss', t: 57 },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo last tap' }));
    expect(last(spy)).toEqual([{ type: 'high', t: 18 }]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo last tap' }));
    expect(last(spy)).toEqual([]);
  });
});

describe('EventLogInput: what must never happen', () => {
  it('deleting a tap removes that tap and no other', () => {
    const spy = vi.fn();
    const start = [
      { type: 'high', t: 18 },
      { type: 'high', t: 41 },
      { type: 'miss', t: 57 },
    ];
    render(<Held field={shots()} spy={spy} start={start} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove High goal at 0:41' }));
    expect(last(spy)).toEqual([
      { type: 'high', t: 18 },
      { type: 'miss', t: 57 },
    ]);
    // And it can be undone.
    fireEvent.click(screen.getByRole('button', { name: 'Undo remove' }));
    expect(last(spy)).toEqual(start);
  });

  it('un-timed: the first tap is t = 0 and later taps are seconds from it', () => {
    const spy = vi.fn();
    render(<Held field={shots()} spy={spy} />);
    advance(60_000); // the entry has been open a minute; the timer was never started
    fireEvent.click(tapButton('High goal'));
    expect(last(spy)).toEqual([{ type: 'high', t: 0 }]);
    advance(4_500);
    fireEvent.click(tapButton('High goal'));
    expect(last(spy)).toEqual([
      { type: 'high', t: 0 },
      { type: 'high', t: 4.5 },
    ]);
    expect(matchClock.wasTimed()).toBe(false);
  });
});

describe('EventLogInput: "where?" (SPEC-FINAL 5.2 amended v1.20, 5.6)', () => {
  it('opens the map after the tap, titled by the button, the time fixed at the tap', async () => {
    const spy = vi.fn();
    render(<Held field={shots(WHERE)} spy={spy} />);
    matchClock.start();
    advance(72_000);
    fireEvent.click(tapButton('High goal'));
    const dialog = await screen.findByRole('dialog', { name: 'High goal · where?' });
    expect(within(dialog).getByText('Shots · tap at 1:12 · optional')).toBeInTheDocument();
    // Nothing is stored until the scout saves or skips.
    expect(spy).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Save tap' })).toBeDisabled();
  });

  it('Skip · no place stores {type, t} with no x or y keys at all', async () => {
    const spy = vi.fn();
    render(<Held field={shots(WHERE)} spy={spy} />);
    matchClock.start();
    advance(10_000);
    fireEvent.click(tapButton('Low goal'));
    await screen.findByRole('dialog');
    tapImagePoint({ x: 0.3, y: 0.6 }, 800, 325); // a spot picked, then skipped anyway
    fireEvent.click(screen.getByRole('button', { name: 'Skip · no place' }));
    const [stored] = last(spy);
    expect(stored).toEqual({ type: 'low', t: 10 });
    expect(Object.keys(stored!)).toEqual(['type', 't']);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[data-pin]')).toBeNull();
  });

  it('Save tap stores {type, t, x, y}: a red scout raw, tapping again moves the spot', async () => {
    const spy = vi.fn();
    render(<Held field={shots(WHERE)} spy={spy} />);
    fireEvent.click(tapButton('High goal'));
    await screen.findByRole('dialog');
    tapImagePoint({ x: 0.5, y: 0.5 }, 800, 325);
    tapImagePoint({ x: 0.25, y: 0.75 }, 800, 325);
    expect(document.querySelectorAll('[data-mark="own"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Save tap' }));
    expect(last(spy)).toEqual([{ type: 'high', t: 0, x: 0.25, y: 0.75 }]);
    // The chip carries a pin.
    expect(document.querySelector('[data-pin]')).not.toBeNull();
  });

  it('a blue scout’s tap is stored mirrored, and the drawing turns, not the data', async () => {
    const spot = { x: 0.25, y: 0.75 }; // one physical place on the field, in image terms
    const stored: EventLogTap[][] = [];
    for (const layout of ['desktop', 'phone'] as const) {
      if (layout === 'phone') phoneViewport();
      const spy = vi.fn();
      const { unmount } = render(
        <Held field={shots(WHERE)} spy={spy} context={{ alliance: 'blue', station: 'B2' }} />,
      );
      matchClock.reset();
      fireEvent.click(tapButton('High goal'));
      await screen.findByRole('dialog');
      const drawing = screen.getByTestId('map-drawing');
      expect(Number(drawing.dataset.rotation)).toBe(viewRotation('blue', layout));
      // The phone draws the field upright, the computer flat: the box's shape follows.
      if (layout === 'phone') tapImagePoint(spot, 325, 800);
      else tapImagePoint(spot, 800, 325);
      fireEvent.click(screen.getByRole('button', { name: 'Save tap' }));
      stored.push(last(spy));
      unmount();
    }
    // Mirrored on the horizontal axis: x flips, y stays.
    expect(stored[0]).toEqual([{ type: 'high', t: 0, x: 0.75, y: 0.75 }]);
    // The same physical tap stores the same point whatever the display rotation.
    expect(stored[1]).toEqual(stored[0]);
  });

  it('draws this field’s earlier placed taps grey, where they were tapped', async () => {
    render(
      <Held
        field={shots(WHERE)}
        spy={vi.fn()}
        start={[
          { type: 'high', t: 18, x: 0.31, y: 0.62 },
          { type: 'miss', t: 57 },
        ]}
      />,
    );
    fireEvent.click(tapButton('High goal'));
    await screen.findByRole('dialog');
    const old = document.querySelectorAll<HTMLElement>('[data-mark="old"]');
    expect(old).toHaveLength(1);
    expect(old[0]!.style.left).toBe('31%');
    expect(old[0]!.style.top).toBe('62%');
  });

  it('a missing season image fails loudly and records no coordinate', async () => {
    const spy = vi.fn();
    render(
      <Held
        field={shots(WHERE)}
        spy={spy}
        context={{ fieldImagePath: 'seasons/1999/field.webp' }}
      />,
    );
    fireEvent.click(tapButton('High goal'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      "This season's game image is missing.",
    );
    expect(screen.queryByTestId('map-drawing')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Save tap' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Skip · no place' }));
    expect(Object.keys(last(spy)[0]!)).toEqual(['type', 't']);
  });

  it('an image that fails to load is missing too: the alert, and Save tap withdrawn', async () => {
    const spy = vi.fn();
    render(<Held field={shots(WHERE)} spy={spy} />);
    fireEvent.click(tapButton('Missed'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.error(within(dialog).getByRole('img', { name: "The season's field" }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "This season's game image is missing.",
    );
    expect(within(dialog).queryByRole('button', { name: 'Save tap' })).toBeNull();
    expect(screen.queryByTestId('map-drawing')).toBeNull();
  });
});
