import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapButton } from './MapButton';
import { MapSheet } from './MapSheet';

const at = (x: number, y: number) => ({ x, y });
type Route = { id: string; name: string; points: { x: number; y: number }[]; drawing?: boolean };

function sheet(alliance: 'red' | 'blue', paths: Route[], viewOnly = false) {
  return render(
    <MapSheet
      open
      layout="desktop"
      title="Cycle routes"
      subtitle="Q39 · 1690 · Teleop"
      alliance={alliance}
      station={null}
      imagePath="seasons/2026/field.webp"
      marks={[]}
      paths={paths}
      onClose={() => undefined}
      viewOnly={viewOnly}
    />,
  );
}

function thumb(alliance: 'red' | 'blue', paths: { x: number; y: number }[][]) {
  return render(
    <MapButton
      label="Cycle path"
      count="paths"
      alliance={alliance}
      imagePath="seasons/2026/field.webp"
      paths={paths}
      onOpen={() => undefined}
    />,
  );
}

const marks = (kind: string) => document.querySelectorAll(`[data-path-mark="${kind}"]`);

describe('MapSheet start and end marks on a path (SPEC-FINAL 8.2 v1.31)', () => {
  it('a ring on the first point, an arrow on the last, a dot between, in the path’s colour', () => {
    sheet('red', [{ id: '0', name: 'Path 1', points: [at(0.1, 0.5), at(0.3, 0.5), at(0.5, 0.5)] }]);
    const points = document.querySelectorAll('[data-path-point]');
    expect(points).toHaveLength(3);
    expect(points[0]).toHaveAttribute('data-path-mark', 'start');
    expect(points[1]).not.toHaveAttribute('data-path-mark');
    expect(points[2]).toHaveAttribute('data-path-mark', 'end');
    expect(points[0]).toHaveStyle({ left: '10%', top: '50%' });
    expect(points[2]).toHaveStyle({ left: '50%', top: '50%' });
    expect(marks('start')[0]!.querySelector('circle.stroke-alliance-red')).not.toBeNull();
    expect(marks('end')[0]!.querySelector('polygon.fill-alliance-red')).not.toBeNull();
    // No labels: no text anywhere in a mark.
    expect(points[0]!.textContent).toBe('');
    expect(points[2]!.textContent).toBe('');
  });

  it('a one-point path shows only the ring, and view only mode shows both marks', () => {
    const { unmount } = sheet('blue', [{ id: '0', name: 'Path 1', points: [at(0.4, 0.4)] }]);
    expect(marks('start')).toHaveLength(1);
    expect(marks('end')).toHaveLength(0);
    expect(marks('start')[0]!.querySelector('circle.stroke-alliance-blue')).not.toBeNull();
    unmount();
    sheet('red', [{ id: '0', name: 'Path 1', points: [at(0.1, 0.5), at(0.3, 0.2)] }], true);
    expect(marks('start')).toHaveLength(1);
    expect(marks('end')).toHaveLength(1);
  });

  it('the arrow’s angle follows the drawing: turned for a blue scout', () => {
    // One image-space path drawn for a red scout (flat) and a blue one (turned 180): the arrow
    // points right on the one and left on the other, as the drawing does.
    const path = [{ id: '0', name: 'Path 1', points: [at(0.2, 0.5), at(0.6, 0.5)] }];
    const red = sheet('red', path);
    expect(marks('end')[0]).toHaveAttribute('data-angle', '0');
    red.unmount();
    sheet('blue', path);
    expect(marks('end')[0]).toHaveAttribute('data-angle', '180');
    expect(marks('end')[0]).toHaveStyle({ transform: 'translate(-50%, -50%) rotate(180deg)' });
  });

  it('the path being drawn keeps its marks at its bigger dot size; a path that never moves keeps a dot', () => {
    sheet('red', [
      { id: '0', name: 'Path 1', points: [at(0.1, 0.5), at(0.3, 0.5)], drawing: true },
      { id: '1', name: 'Path 2', points: [at(0.6, 0.5), at(0.6, 0.5)] },
    ]);
    const [drawingStart, doneStart] = [...marks('start')];
    expect(drawingStart).toHaveStyle({ width: '14px', height: '14px' });
    expect(doneStart).toHaveStyle({ width: '10px', height: '10px' });
    expect(marks('end')).toHaveLength(1);
    const plain = [...document.querySelectorAll('[data-path-point]:not([data-path-mark])')];
    expect(plain).toHaveLength(1);
    expect(plain[0]).toHaveClass('size-2.5');
  });
});

describe('MapButton thumbnail start and end marks (SPEC-FINAL 8.2 v1.31)', () => {
  it('a ring on each path’s first point and an arrow on its last, along the last leg', () => {
    thumb('red', [[at(0.1, 0.5), at(0.3, 0.2), at(0.6, 0.5)]]);
    const start = document.querySelector('[data-path-mark="start"]')!;
    const end = document.querySelector('[data-path-mark="end"]')!;
    expect(start).toHaveStyle({ left: '10%', top: '50%' });
    expect(end).toHaveStyle({ left: '60%', top: '50%' });
    // The last leg runs right and down on the flat thumbnail: between 0 and 90 degrees.
    const angle = Number(end.getAttribute('data-angle'));
    expect(angle).toBeGreaterThan(0);
    expect(angle).toBeLessThan(90);
  });

  it('a one-point path is only the ring, and a blue scout’s thumbnail turns the arrow round', () => {
    const { unmount } = thumb('red', [[at(0.4, 0.4)]]);
    expect(marks('start')).toHaveLength(1);
    expect(marks('end')).toHaveLength(0);
    unmount();
    thumb('blue', [[at(0.2, 0.5), at(0.6, 0.5)]]);
    expect(marks('end')[0]).toHaveAttribute('data-angle', '180');
  });
});
