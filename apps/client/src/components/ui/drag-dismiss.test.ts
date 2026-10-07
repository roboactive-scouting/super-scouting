import { describe, expect, it } from 'vitest';
import {
  dismissThreshold,
  DRAG_SLOP_PX,
  followOffset,
  gestureIntent,
  releaseVelocity,
  RUBBER_BAND_PX,
  shouldDismiss,
  towardEdge,
} from './drag-dismiss';

describe('drag-dismiss thresholds (UF.4)', () => {
  it('closes at 30 % of the panel, never further than 120 px', () => {
    expect(dismissThreshold(300)).toBe(90);
    expect(dismissThreshold(400)).toBe(120);
    expect(dismissThreshold(800)).toBe(120);
  });

  it('measures toward the edge: down for a sheet, toward the start for the menu', () => {
    expect(towardEdge('bottom', 5, 40)).toBe(40);
    expect(towardEdge('start', -60, 3)).toBe(60);
    expect(towardEdge('start', 60, 3)).toBe(-60);
    expect(towardEdge('start', 60, 3, true)).toBe(60);
  });

  it('reads the intent only past the slop, and only along the axis toward the edge', () => {
    expect(gestureIntent('bottom', 0, DRAG_SLOP_PX - 1)).toBeNull();
    expect(gestureIntent('bottom', 2, 10)).toBe('dismiss');
    expect(gestureIntent('bottom', 2, -10)).toBe('other');
    expect(gestureIntent('bottom', 12, 8)).toBe('other');
    expect(gestureIntent('start', -10, 3)).toBe('dismiss');
    expect(gestureIntent('start', 10, 3)).toBe('other');
    expect(gestureIntent('start', -4, 12)).toBe('other');
    expect(gestureIntent('start', 10, 3, true)).toBe('dismiss');
  });

  it('follows toward the edge one to one, and the other way only as a short rubber band', () => {
    expect(followOffset(0)).toBe(0);
    expect(followOffset(75)).toBe(75);
    expect(followOffset(-10)).toBeLessThan(0);
    expect(followOffset(-10)).toBeGreaterThan(-10);
    expect(followOffset(-1000)).toBeGreaterThan(-RUBBER_BAND_PX);
    expect(followOffset(-40)).toBeLessThan(followOffset(-20));
  });

  it('measures the release speed over the last 100 ms', () => {
    expect(releaseVelocity([])).toBe(0);
    expect(releaseVelocity([{ t: 5, d: 10 }])).toBe(0);
    expect(
      releaseVelocity([
        { t: 0, d: 0 },
        { t: 500, d: 10 },
        { t: 550, d: 40 },
        { t: 600, d: 70 },
      ]),
    ).toBeCloseTo(0.6);
  });

  it('closes past the threshold or on a flick toward the edge; springs back otherwise', () => {
    expect(shouldDismiss(130, 0, 500)).toBe(true);
    expect(shouldDismiss(119, 0.1, 500)).toBe(false);
    expect(shouldDismiss(30, 0.8, 500)).toBe(true);
    expect(shouldDismiss(0, 2, 500)).toBe(false);
    expect(shouldDismiss(-20, 2, 500)).toBe(false);
  });
});
