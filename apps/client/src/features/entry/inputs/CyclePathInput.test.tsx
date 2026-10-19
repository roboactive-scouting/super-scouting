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
