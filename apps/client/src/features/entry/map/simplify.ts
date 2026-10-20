import type { Point } from '@frc/shared';

/*
 * A freehand stroke made into a cycle path's few points (UF.25; SPEC-FINAL 8.2 v1.30). Pure: the
 * map gathers the stroke, the cycle path stores what this keeps.
 */

/**
 * How far, in field short sides, a point may sit off the kept route before it is worth keeping
 * itself: 0.025, about 20 cm on the field and about 8 px on a phone (the field is ~340 px across)
 * or in the computer's dialog (~310 px tall). Finger wobble stays under it; a real bend does not.
 */
export const STROKE_EPSILON = 0.025;

/** How far a press may move, in CSS px, and still be a tap rather than a drag. */
export const DRAW_SLOP_PX = 8;

/** The distance from `p` to the segment `a`–`b`, x scaled by `aspect` so both axes are one unit. */
function offSegment(p: Point, a: Point, b: Point, aspect: number): number {
  const px = p.x * aspect;
  const ax = a.x * aspect;
  const bx = b.x * aspect;
  const dx = bx - ax;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(px - (ax + t * dx), p.y - (a.y + t * dy));
}

/**
 * Ramer–Douglas–Peucker with a cap: the first and last points are always kept, then, one at a
 * time, the point that sits furthest off the route kept so far, until every other point is
 * within `epsilon` of it or `maxPoints` are kept. Taking the furthest point first means that,
 * cut short by the cap, what is kept is still the stroke's strongest bends.
 *
 * Distances are to the kept segment, not its infinite line, so a stroke that turns back on
 * itself keeps its turn. `aspect` is the field's width over its height: points are 0–1 on each
 * axis of a field that is not square, so x is scaled by it and `epsilon` is in short sides.
 * Repeated points (a finger resting) are dropped first. With `maxPoints` 1 the stroke's end is
 * kept.
 */
export function simplifyStroke(
  stroke: readonly Point[],
  maxPoints: number,
  epsilon = STROKE_EPSILON,
  aspect = 1,
): Point[] {
  const points = stroke.filter(
    (p, i) => i === 0 || p.x !== stroke[i - 1]!.x || p.y !== stroke[i - 1]!.y,
  );
  if (points.length === 0 || maxPoints < 1) return [];
  if (maxPoints === 1) return [points[points.length - 1]!];
  if (points.length <= 2) return points.slice();

  // The indices kept so far, in order along the stroke.
  const kept = [0, points.length - 1];
  while (kept.length < maxPoints) {
    let far = -1;
    let at = -1;
    for (let s = 0; s < kept.length - 1; s++) {
      const a = points[kept[s]!]!;
      const b = points[kept[s + 1]!]!;
      for (let i = kept[s]! + 1; i < kept[s + 1]!; i++) {
        const d = offSegment(points[i]!, a, b, aspect);
        if (d > far) {
          far = d;
          at = i;
        }
      }
    }
    if (at < 0 || far <= epsilon) break;
    kept.push(at);
    kept.sort((a, b) => a - b);
  }
  return kept.map((i) => points[i]!);
}
