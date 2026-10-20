import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CyclePath, FormFieldDefinition, Point } from '@frc/shared';
import { EntryContext, type EntryContextValue } from '../entryContext';
import { imageToView, viewRotation, type Rotation } from '../map/mapGeometry';
import { CyclePathInput } from './CyclePathInput';

const IMAGE = 'seasons/2026/field.webp';

const routes = (config: Record<string, unknown> = {}): FormFieldDefinition => ({
  id: 'f-routes',
  key: 'tele_cycle_routes',
  label: 'Cycle routes',
  help_text: 'The route of each cycle',
  type: 'cycle_path',
  section: null,
  display_order: 1,
  required: false,
  default_value: null,
  config: { max_points_per_cycle: 6, mirror_axis: 'horizontal', ...config },
  visibility_condition: null,
  deprecated: false,
  description: 'The route of each cycle',
  unit: 'coordinate',
  phase: 'teleop',
  direction: 'neutral',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
});

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
      <CyclePathInput
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

const last = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.at(-1)![0] as CyclePath[];

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

/** A tap on the desktop drawing (red: unturned) at (vx, vy) of a 400 × 200 box. */
function tap(vx: number, vy: number) {
  const drawing = sizeMap(400, 200);
  fireEvent.click(drawing, { clientX: vx * 400, clientY: vy * 200 });
}

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

/** jsdom has no PointerEvent: a MouseEvent carrying the pointer fields React reads. */
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, { bubbles: true, cancelable: true, ...init });
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
    this.isPrimary = init.isPrimary ?? true;
  }
}

function pointer(el: Element, type: string, x: number, y: number, init: PointerEventInit = {}) {
  fireEvent(el, new TestPointerEvent(type, { clientX: x, clientY: y, ...init }));
}

/**
 * A drag with the mouse through `points` (px on a `w` × `h` drawing), released at the last one;
 * a mouse sends a click there too, which the map must not take as a tap.
 */
function drag(points: readonly (readonly [number, number])[], w = 400, h = 200) {
  const drawing = sizeMap(w, h);
  points.forEach(([x, y], i) => pointer(drawing, i === 0 ? 'pointerdown' : 'pointermove', x, y));
  const [x, y] = points[points.length - 1]!;
  pointer(drawing, 'pointerup', x, y);
  fireEvent.click(drawing, { clientX: x, clientY: y });
}

/** `n` px points along the straight line from `a` to `b`. */
const along = (a: readonly [number, number], b: readonly [number, number], n = 12) =>
  Array.from(
    { length: n },
    (_, i) => [a[0] + ((b[0] - a[0]) * i) / (n - 1), a[1] + ((b[1] - a[1]) * i) / (n - 1)] as const,
  );

/** A zig-zag across the 400 × 200 drawing: far more bends than any cap. */
const wiggle = Array.from(
  { length: 200 },
  (_, i) => [40 + (320 * i) / 199, 100 + 70 * Math.sin(i / 6)] as const,
);

const mapButton = () => screen.getByRole('button', { name: /^Cycle routes: / });

async function openMap() {
  fireEvent.click(mapButton());
  return screen.findByRole('dialog', { name: 'Cycle routes' });
}

const button = (dialog: HTMLElement, name: string) => within(dialog).getByRole('button', { name });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CyclePathInput (SPEC-FINAL 5.2, 5.6, 8.2)', () => {
  it('taps append to the path being drawn, in order; the value is an array of arrays', async () => {
    const spy = vi.fn();
    render(<Held field={routes()} spy={spy} />);
    const dialog = await openMap();
    tap(0.1, 0.1);
    expect(within(dialog).getByText('Drawing path 1')).toBeVisible();
    tap(0.2, 0.3);
    tap(0.4, 0.5);
    expect(last(spy)).toEqual([
      [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.3 },
        { x: 0.4, y: 0.5 },
      ],
    ]);
    expect(within(dialog).getByText('3 of 6 points')).toBeVisible();
  });

  it('Finish ends the path; the next path starts with + New path or a tap', async () => {
    const spy = vi.fn();
    render(<Held field={routes()} spy={spy} />);
    const dialog = await openMap();
    tap(0.1, 0.1);
    tap(0.2, 0.2);
    fireEvent.click(button(dialog, 'Finish'));
    expect(within(dialog).getByTestId('map-status')).toHaveTextContent('1 path');
    fireEvent.click(button(dialog, 'New path'));
    expect(within(dialog).getByText('Drawing path 2')).toBeVisible();
    expect(within(dialog).getByText('0 of 6 points')).toBeVisible();
    tap(0.7, 0.7);
    fireEvent.click(button(dialog, 'Finish'));
    tap(0.9, 0.9); // nothing drawing: a tap starts path 3
    expect(within(dialog).getByText('Drawing path 3')).toBeVisible();
    expect(last(spy)).toEqual([
      [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ],
      [{ x: 0.7, y: 0.7 }],
      [{ x: 0.9, y: 0.9 }],
    ]);
  });

  it('a path refuses a seventh point at the default cap, and says so', async () => {
    const spy = vi.fn();
    const field = routes();
    delete (field.config as Record<string, unknown>).max_points_per_cycle;
    render(<Held field={field} spy={spy} />);
    const dialog = await openMap();
    for (let i = 1; i <= 6; i++) tap(i / 10, i / 10);
    expect(last(spy)[0]).toHaveLength(6);
    expect(spy).toHaveBeenCalledTimes(6);
    tap(0.95, 0.05);
    expect(spy).toHaveBeenCalledTimes(6);
    expect(last(spy)[0]).toHaveLength(6);
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'A path holds at most 6 points. Finish it to start the next.',
    );
  });

  it('Undo removes only the last point of the path being drawn', async () => {
    const spy = vi.fn();
    render(<Held field={routes()} spy={spy} />);
    const dialog = await openMap();
    tap(0.1, 0.1);
    tap(0.2, 0.2);
    tap(0.3, 0.3);
    fireEvent.click(button(dialog, 'Undo'));
    expect(last(spy)).toEqual([
      [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ],
    ]);
    expect(within(dialog).getByText('Drawing path 1')).toBeVisible();
  });

  it('Clear path empties only the path being drawn; finished paths are untouched', async () => {
    const first = [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
    ];
    const spy = vi.fn();
    render(<Held field={routes()} spy={spy} start={[first]} />);
    const dialog = await openMap();
    fireEvent.click(button(dialog, 'New path'));
    tap(0.5, 0.5);
    tap(0.6, 0.6);
    fireEvent.click(button(dialog, 'Clear path'));
    expect(last(spy)).toEqual([first]);
    // Still drawing the same path, so it can be started again.
    expect(within(dialog).getByText('Drawing path 2')).toBeVisible();
    expect(within(dialog).getByText('0 of 6 points')).toBeVisible();
    tap(0.8, 0.8);
    expect(last(spy)).toEqual([first, [{ x: 0.8, y: 0.8 }]]);
  });

  it('Undo after Clear path brings the path back, still being drawn', async () => {
    const spy = vi.fn();
    render(<Held field={routes()} spy={spy} />);
    const dialog = await openMap();
    tap(0.5, 0.5);
    tap(0.6, 0.6);
    fireEvent.click(button(dialog, 'Clear path'));
    expect(last(spy)).toEqual([]);
    fireEvent.click(button(dialog, 'Undo'));
    expect(last(spy)).toEqual([
      [
        { x: 0.5, y: 0.5 },
        { x: 0.6, y: 0.6 },
      ],
    ]);
    expect(within(dialog).getByText('2 of 6 points')).toBeVisible();
  });

  it('tap a path to select it; ✕ Remove path takes that path only; tapping the map keeps it', async () => {
    const a = [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
    ];
    const b = [
      { x: 0.7, y: 0.7 },
      { x: 0.8, y: 0.9 },
    ];
    const spy = vi.fn();
    render(<Held field={routes()} spy={spy} start={[a, b]} />);
    const dialog = await openMap();
    fireEvent.click(button(dialog, 'Path 1'));
    expect(button(dialog, 'Path 1')).toHaveAttribute('aria-pressed', 'true');
    // Tapping elsewhere keeps the path, deselects it and adds nothing.
    tap(0.5, 0.5);
    expect(spy).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole('button', { name: /^Remove path/ })).toBeNull();
    fireEvent.click(button(dialog, 'Path 2'));
    fireEvent.click(button(dialog, 'Remove path 2'));
    expect(last(spy)).toEqual([a]);
    fireEvent.click(button(dialog, 'Undo'));
    expect(last(spy)).toEqual([a, b]);
  });

  it('the Delete key removes the selected path', async () => {
    const a = [{ x: 0.1, y: 0.1 }];
    const b = [{ x: 0.7, y: 0.7 }];
    const spy = vi.fn();
    render(<Held field={routes()} spy={spy} start={[a, b]} />);
    const dialog = await openMap();
    fireEvent.click(button(dialog, 'Path 1'));
    fireEvent.keyDown(dialog, { key: 'Delete' });
    expect(last(spy)).toEqual([b]);
  });

  it('a blue scout’s points are stored mirrored, the same at every display rotation', async () => {
    const spot = { x: 0.25, y: 0.75 };
    const stored: unknown[] = [];
    for (const layout of ['desktop', 'phone'] as const) {
      if (layout === 'phone') phoneViewport();
      const spy = vi.fn();
      const { unmount } = render(
        <Held field={routes()} spy={spy} context={{ alliance: 'blue', station: 'B2' }} />,
      );
      await openMap();
      expect(Number(screen.getByTestId('map-drawing').dataset.rotation)).toBe(
        viewRotation('blue', layout),
      );
      if (layout === 'phone') tapImagePoint(spot, 325, 800);
      else tapImagePoint(spot, 800, 325);
      stored.push(last(spy));
      unmount();
    }
    expect(stored[0]).toEqual([[{ x: 0.75, y: 0.75 }]]);
    expect(stored[1]).toEqual(stored[0]);
  });

  describe('a drag draws the route freehand (UF.25)', () => {
    it('a straight stroke is stored as its two ends, in one change, its click no tap', async () => {
      const spy = vi.fn();
      render(<Held field={routes()} spy={spy} />);
      const dialog = await openMap();
      drag(along([40, 100], [240, 100]));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(last(spy)).toEqual([
        [
          { x: 0.1, y: 0.5 },
          { x: 0.6, y: 0.5 },
        ],
      ]);
      expect(within(dialog).getByText('Drawing path 1')).toBeVisible();
      expect(within(dialog).getByText('2 of 6 points')).toBeVisible();
    });

    it('an L-shaped stroke keeps its corner', async () => {
      const spy = vi.fn();
      render(<Held field={routes()} spy={spy} />);
      await openMap();
      drag([...along([40, 40], [240, 40]), ...along([240, 40], [240, 180]).slice(1)]);
      expect(last(spy)).toEqual([
        [
          { x: 0.1, y: 0.2 },
          { x: 0.6, y: 0.2 },
          { x: 0.6, y: 0.9 },
        ],
      ]);
    });

    it('shows the stroke live while the finger is down, and only then', async () => {
      render(<Held field={routes()} spy={vi.fn()} />);
      await openMap();
      const drawing = sizeMap(400, 200);
      expect(drawing).toHaveClass('touch-none');
      pointer(drawing, 'pointerdown', 40, 100, { pointerType: 'touch' });
      pointer(drawing, 'pointermove', 44, 100, { pointerType: 'touch' });
      expect(screen.queryByTestId('map-stroke')).toBeNull(); // still a tap
      pointer(drawing, 'pointermove', 120, 140, { pointerType: 'touch' });
      const lines = screen.getByTestId('map-stroke').querySelectorAll('polyline');
      expect(lines[1]).toHaveAttribute('points', '10,50 11,50 30,70');
      pointer(drawing, 'pointerup', 120, 140, { pointerType: 'touch' });
      expect(screen.queryByTestId('map-stroke')).toBeNull();
    });

    it('a press that moves under 8 px is a tap; 8 px is a drag', async () => {
      const spy = vi.fn();
      render(<Held field={routes()} spy={spy} />);
      const dialog = await openMap();
      // 7 px of wobble: a tap, its point where the click lands.
      drag([
        [100, 100],
        [104, 103],
        [107, 100],
      ]);
      expect(last(spy)).toEqual([[{ x: 0.2675, y: 0.5 }]]);
      fireEvent.click(button(dialog, 'Finish'));
      // 8 px: a stroke, both its ends kept.
      drag([
        [200, 100],
        [208, 100],
      ]);
      expect(last(spy)).toEqual([
        [{ x: 0.2675, y: 0.5 }],
        [
          { x: 0.5, y: 0.5 },
          { x: 0.52, y: 0.5 },
        ],
      ]);
    });

    it('Undo takes back a whole stroke, then the tapped point before it', async () => {
      const spy = vi.fn();
      render(<Held field={routes()} spy={spy} />);
      const dialog = await openMap();
      tap(0.1, 0.1);
      drag([...along([40, 100], [240, 100]), ...along([240, 100], [240, 180]).slice(1)]);
      expect(last(spy)[0]).toHaveLength(4);
      fireEvent.click(button(dialog, 'Undo'));
      expect(last(spy)).toEqual([[{ x: 0.1, y: 0.1 }]]);
      expect(within(dialog).getByText('1 of 6 points')).toBeVisible();
      fireEvent.click(button(dialog, 'Undo'));
      expect(last(spy)).toEqual([]);
    });

    it('a stroke goes on from a tapped path up to the limit; at the limit a drag is refused', async () => {
      const spy = vi.fn();
      render(<Held field={routes({ max_points_per_cycle: 4 })} spy={spy} />);
      const dialog = await openMap();
      tap(0.05, 0.05);
      tap(0.08, 0.1);
      drag(wiggle);
      const path = last(spy)[0]!;
      expect(path).toHaveLength(4);
      expect(path.slice(0, 2)).toEqual([
        { x: 0.05, y: 0.05 },
        { x: 0.08, y: 0.1 },
      ]);
      expect(path.at(-1)).toEqual({
        x: 0.9,
        y: Math.round((wiggle.at(-1)![1] / 200) * 10_000) / 10_000,
      });
      const calls = spy.mock.calls.length;
      drag(along([40, 20], [360, 20]));
      expect(spy).toHaveBeenCalledTimes(calls);
      expect(screen.queryByTestId('map-stroke')).toBeNull();
      expect(within(dialog).getByRole('status')).toHaveTextContent(
        'A path holds at most 4 points. Finish it to start the next.',
      );
      // Finished, the next drag starts the next path.
      fireEvent.click(button(dialog, 'Finish'));
      drag(along([40, 20], [360, 20]));
      expect(last(spy)).toHaveLength(2);
      expect(last(spy)[1]).toEqual([
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
      ]);
    });

    it('a blue scout’s stroke is stored mirrored, as a tap there is, at every rotation', async () => {
      const from = { x: 0.2, y: 0.3 };
      const to = { x: 0.6, y: 0.3 };
      const stored: unknown[] = [];
      for (const layout of ['desktop', 'phone'] as const) {
        if (layout === 'phone') phoneViewport();
        const spy = vi.fn();
        const { unmount } = render(
          <Held field={routes()} spy={spy} context={{ alliance: 'blue', station: 'B2' }} />,
        );
        await openMap();
        const [w, h] = layout === 'phone' ? [325, 800] : [800, 325];
        const rotation = Number(screen.getByTestId('map-drawing').dataset.rotation) as Rotation;
        const px = (p: Point) => {
          const v = imageToView(p, rotation);
          return [v.x * w, v.y * h] as const;
        };
        drag(along(px(from), px(to)), w, h);
        stored.push(last(spy));
        unmount();
      }
      expect(stored[0]).toEqual([
        [
          { x: 0.8, y: 0.3 },
          { x: 0.4, y: 0.3 },
        ],
      ]);
      expect(stored[1]).toEqual(stored[0]);
    });

    it('a second finger is ignored; the first one draws', async () => {
      const spy = vi.fn();
      render(<Held field={routes()} spy={spy} />);
      await openMap();
      const drawing = sizeMap(400, 200);
      const touch = { pointerType: 'touch' };
      pointer(drawing, 'pointerdown', 40, 100, { ...touch, pointerId: 7 });
      pointer(drawing, 'pointerdown', 300, 20, { ...touch, pointerId: 8, isPrimary: false });
      pointer(drawing, 'pointermove', 140, 100, { ...touch, pointerId: 7 });
      pointer(drawing, 'pointermove', 340, 180, { ...touch, pointerId: 8, isPrimary: false });
      pointer(drawing, 'pointerup', 340, 180, { ...touch, pointerId: 8, isPrimary: false });
      pointer(drawing, 'pointermove', 240, 100, { ...touch, pointerId: 7 });
      pointer(drawing, 'pointerup', 240, 100, { ...touch, pointerId: 7 });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(last(spy)).toEqual([
        [
          { x: 0.1, y: 0.5 },
          { x: 0.6, y: 0.5 },
        ],
      ]);
    });

    it('a drag with a path selected only lets go of it, like a tap', async () => {
      const a = [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ];
      const spy = vi.fn();
      render(<Held field={routes()} spy={spy} start={[a]} />);
      const dialog = await openMap();
      fireEvent.click(button(dialog, 'Path 1'));
      drag(along([40, 100], [240, 100]));
      expect(spy).not.toHaveBeenCalled();
      expect(button(dialog, 'Path 1')).toHaveAttribute('aria-pressed', 'false');
    });
  });

  it('shows the count of paths and their points on its map button (UF.24 words)', () => {
    render(
      <Held
        field={routes()}
        spy={vi.fn()}
        start={[
          [{ x: 0.1, y: 0.1 }],
          [
            { x: 0.2, y: 0.2 },
            { x: 0.3, y: 0.3 },
          ],
        ]}
      />,
    );
    expect(mapButton()).toHaveAccessibleName('Cycle routes: 2 paths · 3 spots');
  });

  it('a missing season image fails loudly and records no coordinate', async () => {
    const spy = vi.fn();
    render(
      <Held field={routes()} spy={spy} context={{ fieldImagePath: 'seasons/1999/field.webp' }} />,
    );
    expect(mapButton()).toHaveAccessibleName('Cycle routes: Map unavailable');
    const dialog = await openMap();
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      "This season's game image is missing.",
    );
    expect(screen.queryByTestId('map-drawing')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'New path' })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
