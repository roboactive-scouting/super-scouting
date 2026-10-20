import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormFieldDefinition, Point } from '@frc/shared';
import { EntryContext, type EntryContextValue } from '../entryContext';
import { imageToView, viewRotation, type Rotation } from '../map/mapGeometry';
import { PositionInput } from './PositionInput';

const IMAGE = 'seasons/2026/field.webp';

const spots = (config: Record<string, unknown> = {}): FormFieldDefinition => ({
  id: 'f-spots',
  key: 'auto_score_spots',
  label: 'Scoring spots',
  help_text: 'Where it scored from',
  type: 'position',
  section: null,
  display_order: 1,
  required: false,
  default_value: null,
  config: { multi_point: true, mirror_axis: 'horizontal', ...config },
  visibility_condition: null,
  deprecated: false,
  description: 'Where it scored from',
  unit: 'coordinate',
  phase: 'auto',
  direction: 'neutral',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
});

const ONE = { multi_point: false };

/** The page's part: it holds the value and hands it back, inside the entry's context. */
function Held({
  field,
  start,
  spy,
  context,
}: {
  field: FormFieldDefinition;
  start?: unknown;
  spy: (v: unknown) => void;
  context?: Partial<EntryContextValue>;
}) {
  const [value, setValue] = useState<unknown>(start);
  return (
    <EntryContext value={{ alliance: 'red', station: 'R1', fieldImagePath: IMAGE, ...context }}>
      <PositionInput
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

const last = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.at(-1)![0] as unknown;

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

/** A tap on the drawing at (vx, vy) of its box. */
function tapView(vx: number, vy: number, w = 400, h = 200) {
  const drawing = sizeMap(w, h);
  fireEvent.click(drawing, { clientX: vx * w, clientY: vy * h });
}

/** A tap on the drawing where the image point `spot` is drawn, whatever the turn. */
function tapImagePoint(spot: Point, w: number, h: number) {
  const drawing = sizeMap(w, h);
  const at = imageToView(spot, Number(drawing.dataset.rotation) as Rotation);
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

const mapButton = () => screen.getByRole('button', { name: /^Scoring spots: / });

async function openMap() {
  fireEvent.click(mapButton());
  return screen.findByRole('dialog', { name: 'Scoring spots' });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PositionInput (SPEC-FINAL 5.2, 5.6, 8.2)', () => {
  it('is one map button in the form: empty, then the count of spots', async () => {
    render(<Held field={spots()} spy={vi.fn()} />);
    expect(mapButton()).toHaveAccessibleName('Scoring spots: Mark on the map');
    expect(within(mapButton()).getByText('Not marked yet')).toBeVisible();
    const dialog = await openMap();
    tapView(0.3, 0.3);
    tapView(0.6, 0.6);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mapButton()).toHaveAccessibleName('Scoring spots: 2 spots');
  });

  it('a tap at the centre of a 400 × 200 box stores {x: 0.5, y: 0.5}', async () => {
    const spy = vi.fn();
    render(<Held field={spots(ONE)} spy={spy} />);
    await openMap();
    tapView(0.5, 0.5, 400, 200);
    expect(last(spy)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('a red tap is stored raw', async () => {
    const spy = vi.fn();
    render(<Held field={spots(ONE)} spy={spy} />);
    await openMap();
    tapView(0.25, 0.75, 400, 200);
    expect(last(spy)).toEqual({ x: 0.25, y: 0.75 });
  });

  it('a blue scout’s tap is stored mirrored, and the drawing turns, not the data', async () => {
    const spot = { x: 0.25, y: 0.75 }; // one physical place on the field, in image terms
    const stored: unknown[] = [];
    for (const layout of ['desktop', 'phone'] as const) {
      if (layout === 'phone') phoneViewport();
      const spy = vi.fn();
      const { unmount } = render(
        <Held field={spots(ONE)} spy={spy} context={{ alliance: 'blue', station: 'B2' }} />,
      );
      await openMap();
      const drawing = screen.getByTestId('map-drawing');
      expect(Number(drawing.dataset.rotation)).toBe(viewRotation('blue', layout));
      if (layout === 'phone') tapImagePoint(spot, 325, 800);
      else tapImagePoint(spot, 800, 325);
      stored.push(last(spy));
      unmount();
    }
    // Mirrored on the horizontal axis: x flips, y stays.
    expect(stored[0]).toEqual({ x: 0.75, y: 0.75 });
    // The same physical tap stores the same point whatever the display rotation.
    expect(stored[1]).toEqual(stored[0]);
  });

  it('draws a stored blue point back where the blue scout tapped it', async () => {
    render(
      <Held
        field={spots()}
        spy={vi.fn()}
        start={[{ x: 0.75, y: 0.75 }]}
        context={{ alliance: 'blue', station: 'B2' }}
      />,
    );
    await openMap();
    // Desktop, blue: turned 180°. Image point (0.25, 0.75) is drawn at (0.75, 0.25).
    const spot = screen.getByRole('button', { name: 'Spot 1' });
    expect(spot.style.left).toBe('75%');
    expect(spot.style.top).toBe('25%');
  });

  it('a single-point field replaces its point on a second tap', async () => {
    const spy = vi.fn();
    render(<Held field={spots(ONE)} spy={spy} />);
    await openMap();
    tapView(0.2, 0.2);
    tapView(0.6, 0.4);
    expect(last(spy)).toEqual({ x: 0.6, y: 0.4 });
    expect(screen.getAllByRole('button', { name: /^Spot/ })).toHaveLength(1);
  });

  it('a multi-point field appends, numbering the spots', async () => {
    const spy = vi.fn();
    render(<Held field={spots()} spy={spy} />);
    await openMap();
    tapView(0.2, 0.2);
    tapView(0.6, 0.4);
    expect(last(spy)).toEqual([
      { x: 0.2, y: 0.2 },
      { x: 0.6, y: 0.4 },
    ]);
    expect(screen.getByRole('button', { name: 'Spot 2' })).toHaveTextContent('2');
  });

  it('Undo takes back only the last point; Clear all empties the list, and Undo brings it back', async () => {
    const spy = vi.fn();
    render(<Held field={spots()} spy={spy} />);
    const dialog = await openMap();
    tapView(0.1, 0.1);
    tapView(0.2, 0.2);
    tapView(0.3, 0.3);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Undo' }));
    expect(last(spy)).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
    ]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear all' }));
    expect(last(spy)).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Undo' }));
    expect(last(spy)).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
    ]);
  });

  it('tap a spot to select it, ✕ Remove takes that spot only, and Undo puts it back', async () => {
    const spy = vi.fn();
    render(
      <Held
        field={spots()}
        spy={spy}
        start={[
          { x: 0.1, y: 0.1 },
          { x: 0.5, y: 0.5 },
          { x: 0.9, y: 0.9 },
        ]}
      />,
    );
    const dialog = await openMap();
    expect(within(dialog).queryByRole('button', { name: /^Remove/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Spot 2' }));
    expect(within(dialog).getByRole('button', { name: 'Spot 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(spy).not.toHaveBeenCalled(); // selecting is not a change
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove spot 2' }));
    expect(last(spy)).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.9 },
    ]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Undo' }));
    expect(last(spy)).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 0.9, y: 0.9 },
    ]);
  });

  it('tapping the map while a spot is selected keeps it and adds nothing', async () => {
    const spy = vi.fn();
    render(<Held field={spots()} spy={spy} start={[{ x: 0.5, y: 0.5 }]} />);
    const dialog = await openMap();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Spot 1' }));
    tapView(0.2, 0.8);
    expect(spy).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole('button', { name: /^Remove/ })).toBeNull();
    // The next tap, with nothing selected, adds.
    tapView(0.2, 0.8);
    expect(last(spy)).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 0.2, y: 0.8 },
    ]);
  });

  it('the Delete key removes the selected spot', async () => {
    const spy = vi.fn();
    render(
      <Held
        field={spots()}
        spy={spy}
        start={[
          { x: 0.1, y: 0.1 },
          { x: 0.5, y: 0.5 },
        ]}
      />,
    );
    const dialog = await openMap();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Spot 1' }));
    fireEvent.keyDown(dialog, { key: 'Delete' });
    expect(last(spy)).toEqual([{ x: 0.5, y: 0.5 }]);
  });

  it('a single-point field emptied holds nothing, not a null point', async () => {
    const spy = vi.fn();
    render(<Held field={spots(ONE)} spy={spy} start={{ x: 0.5, y: 0.5 }} />);
    const dialog = await openMap();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Spot' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove spot' }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(last(spy)).toBeUndefined();
  });

  it('a missing season image fails loudly and records no coordinate', async () => {
    const spy = vi.fn();
    render(
      <Held field={spots()} spy={spy} context={{ fieldImagePath: 'seasons/1999/field.webp' }} />,
    );
    expect(mapButton()).toHaveAccessibleName('Scoring spots: Map unavailable');
    const dialog = await openMap();
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      "This season's game image is missing.",
    );
    expect(screen.queryByTestId('map-drawing')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Done' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('an image that fails to load is missing too: the alert, and nothing can be tapped', async () => {
    const spy = vi.fn();
    render(<Held field={spots()} spy={spy} />);
    const dialog = await openMap();
    fireEvent.error(within(dialog).getByRole('img', { name: "The season's field" }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "This season's game image is missing.",
    );
    expect(screen.queryByTestId('map-drawing')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
