import type { Point } from './types';

export type MirrorAxis = 'none' | 'horizontal' | 'vertical' | 'both';

/**
 * SPEC-FINAL 5.6: red keeps raw coordinates, blue is mirrored, so both alliances map
 * to one canonical frame. The transform is its own inverse, which is what makes
 * denormalize a call to the same function.
 */
export function normalizeForAlliance(
  point: Point,
  alliance: 'red' | 'blue',
  axis: MirrorAxis,
): Point {
  if (alliance === 'red' || axis === 'none') return { x: point.x, y: point.y };
  const flipX = axis === 'horizontal' || axis === 'both';
  const flipY = axis === 'vertical' || axis === 'both';
  return { x: flipX ? 1 - point.x : point.x, y: flipY ? 1 - point.y : point.y };
}

export const denormalizeForAlliance = normalizeForAlliance;
