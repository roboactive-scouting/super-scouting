import { describe, expect, it } from 'vitest';
import { denormalizeForAlliance } from '@frc/shared';
import { endAngle, viewRotation } from './mapGeometry';

describe('the end arrow points along the last leg as drawn (SPEC-FINAL 8.2 v1.31)', () => {
  // Stored (alliance-normalized) points: the last leg runs toward +x, away from the red end.
  const stored = [
    { x: 0.1, y: 0.4 },
    { x: 0.2, y: 0.4 },
    { x: 0.4, y: 0.4 },
  ];
  const shown = (alliance: 'red' | 'blue', axis: 'none' | 'horizontal') =>
    stored.map((p) => denormalizeForAlliance(p, alliance, axis));

  it('follows the turn: right on a flat view, up on a phone for the same stored path', () => {
    expect(endAngle(stored, 0, 2)).toBeCloseTo(0);
    expect(endAngle(stored, 270, 0.5)).toBeCloseTo(-90);
    expect(endAngle(stored, 180, 2)).toBeCloseTo(180);
    expect(endAngle(stored, 90, 0.5)).toBeCloseTo(90);
  });

  it('is the same arrow for both alliances once the blue path is mirrored back', () => {
    for (const layout of ['desktop', 'phone'] as const) {
      const aspect = layout === 'desktop' ? 2.46 : 1 / 2.46;
      const red = endAngle(shown('red', 'horizontal'), viewRotation('red', layout), aspect);
      const blue = endAngle(shown('blue', 'horizontal'), viewRotation('blue', layout), aspect);
      expect(blue).toBeCloseTo(red!);
    }
    // Unmirrored, the blue scout's drawing is turned the whole way round and the arrow with it.
    const unmirrored = endAngle(shown('blue', 'none'), viewRotation('blue', 'desktop'), 2.46);
    expect(unmirrored).toBeCloseTo(180);
  });

  it('puts the drawing’s width : height back, since the view’s 0–1 is not square', () => {
    const diagonal = [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
    ];
    expect(endAngle(diagonal, 0, 1)).toBeCloseTo(45);
    expect(endAngle(diagonal, 0, 2.46)).toBeCloseTo((Math.atan2(1, 2.46) * 180) / Math.PI);
  });

  it('uses the last leg that has a length, and none for a path that never moves', () => {
    expect(endAngle([...stored, stored[2]!], 0, 2)).toBeCloseTo(0);
    expect(endAngle([stored[0]!, stored[0]!], 0, 2)).toBeNull();
    expect(endAngle([stored[0]!], 0, 2)).toBeNull();
  });
});
