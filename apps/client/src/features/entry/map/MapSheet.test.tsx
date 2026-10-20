import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapSheet } from './MapSheet';

/** jsdom has no PointerEvent: a MouseEvent carrying the pointer fields React reads. */
class TestPointerEvent extends MouseEvent {
  pointerId = 1;
  pointerType = 'touch';
  isPrimary = true;
}

const pointer = (el: Element, type: string, x: number, y: number) =>
  fireEvent(el, new TestPointerEvent(type, { bubbles: true, clientX: x, clientY: y }));

function sized() {
  const drawing = screen.getByTestId('map-drawing');
  vi.spyOn(drawing, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 200 }),
  );
  return drawing;
}

function map(viewOnly: boolean, onStroke: () => void, onTap: () => void) {
  render(
    <MapSheet
      open
      layout="desktop"
      title="Cycle routes"
      subtitle="Q39 · 1690 · Teleop"
      alliance="red"
      station="R1"
      imagePath="seasons/2026/field.webp"
      marks={[]}
      paths={[
        {
          id: '0',
          name: 'Path 1',
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.3, y: 0.2 },
          ],
        },
      ]}
      onStroke={onStroke}
      onTap={onTap}
      onClose={() => undefined}
      viewOnly={viewOnly}
    />,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('MapSheet drag to draw (UF.25)', () => {
  it('an editing map hands a drag over as a stroke, on a surface that keeps the finger', () => {
    const onStroke = vi.fn();
    const onTap = vi.fn();
    map(false, onStroke, onTap);
    const drawing = sized();
    expect(drawing).toHaveClass('touch-none');
    pointer(drawing, 'pointerdown', 40, 100);
    pointer(drawing, 'pointermove', 240, 100);
    pointer(drawing, 'pointerup', 240, 100);
    expect(onStroke).toHaveBeenCalledTimes(1);
    expect(onStroke.mock.calls[0]![0]).toEqual([
      { x: 0.1, y: 0.5 },
      { x: 0.6, y: 0.5 },
      { x: 0.6, y: 0.5 },
    ]);
    expect(onTap).not.toHaveBeenCalled();
  });

  it('view only ignores a drag: nothing drawn, nothing handed over, the page may scroll', () => {
    const onStroke = vi.fn();
    const onTap = vi.fn();
    map(true, onStroke, onTap);
    const drawing = sized();
    expect(drawing).not.toHaveClass('touch-none');
    pointer(drawing, 'pointerdown', 40, 100);
    pointer(drawing, 'pointermove', 240, 100);
    expect(screen.queryByTestId('map-stroke')).toBeNull();
    pointer(drawing, 'pointerup', 240, 100);
    fireEvent.click(drawing, { clientX: 240, clientY: 100 });
    expect(onStroke).not.toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();
  });
});
