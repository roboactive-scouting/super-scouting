import { describe, expect, it } from 'vitest';
import { imageToView, storedPoint, viewRotation, viewToImage, type Rotation } from './mapGeometry';

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

describe('the map drawing turns, the data does not (SPEC-FINAL 5.6, 8.2)', () => {
  it('turns the image so the scout’s own end is at the bottom on a phone and on the left on a computer', () => {
    // The season image has the red end on its left (x = 0).
    expect(viewRotation('red', 'desktop')).toBe(0);
    expect(viewRotation('blue', 'desktop')).toBe(180);
    expect(viewRotation('red', 'phone')).toBe(270);
    expect(viewRotation('blue', 'phone')).toBe(90);
    // Red's end (image x = 0) lands at the bottom (view y = 1) of a red phone…
    expect(imageToView({ x: 0, y: 0.5 }, viewRotation('red', 'phone')).y).toBe(1);
    // …blue's end (image x = 1) at the bottom of a blue phone and the left of a blue computer.
    expect(imageToView({ x: 1, y: 0.5 }, viewRotation('blue', 'phone')).y).toBe(1);
    expect(imageToView({ x: 1, y: 0.5 }, viewRotation('blue', 'desktop')).x).toBe(0);
  });

  it.each(ROTATIONS)(
    'maps a tap on the drawing back to the image and the other way, at %i°',
    (r) => {
      for (const p of [
        { x: 0.1, y: 0.2 },
        { x: 0.75, y: 0.4 },
        { x: 0, y: 1 },
      ]) {
        const back = viewToImage(imageToView(p, r), r);
        expect(back.x).toBeCloseTo(p.x, 10);
        expect(back.y).toBeCloseTo(p.y, 10);
      }
    },
  );

  it('stores the same point for the same physical spot whatever the drawing’s rotation', () => {
    // One spot on the field, in image coordinates, as each layout draws it.
    const spot = { x: 0.3, y: 0.62 };
    for (const alliance of ['red', 'blue'] as const) {
      const stored = (['phone', 'desktop'] as const).map((layout) => {
        const r = viewRotation(alliance, layout);
        return storedPoint(imageToView(spot, r), r, alliance, 'horizontal');
      });
      expect(stored[0]).toEqual(stored[1]);
    }
  });

  it('stores red raw and blue mirrored on the configured axis', () => {
    const spot = { x: 0.3, y: 0.62 };
    expect(storedPoint(imageToView(spot, 270), 270, 'red', 'horizontal')).toEqual(spot);
    expect(storedPoint(imageToView(spot, 90), 90, 'blue', 'horizontal')).toEqual({
      x: 0.7,
      y: 0.62,
    });
    expect(storedPoint(imageToView(spot, 180), 180, 'blue', 'both')).toEqual({ x: 0.7, y: 0.38 });
  });

  it('keeps a stored point inside the unit square, at four decimals', () => {
    const p = storedPoint({ x: 1.2, y: -0.1 }, 0, 'red', 'none');
    expect(p).toEqual({ x: 1, y: 0 });
    expect(storedPoint({ x: 0.123456, y: 0.5 }, 0, 'red', 'none')).toEqual({ x: 0.1235, y: 0.5 });
  });
});
