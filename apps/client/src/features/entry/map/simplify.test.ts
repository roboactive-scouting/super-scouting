import { describe, expect, it } from 'vitest';
import type { Point } from '@frc/shared';
import { simplifyStroke, STROKE_EPSILON } from './simplify';

/** `n` samples from `a` to `b`, both ends included. */
function line(a: Point, b: Point, n = 40): Point[] {
  return Array.from({ length: n }, (_, i) =>
    i === 0
      ? a
      : i === n - 1
        ? b
        : { x: a.x + ((b.x - a.x) * i) / (n - 1), y: a.y + ((b.y - a.y) * i) / (n - 1) },
  );
}

describe('simplifyStroke (UF.25)', () => {
  it('a straight stroke is its two ends', () => {
    const stroke = line({ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.6 });
    expect(simplifyStroke(stroke, 10)).toEqual([stroke[0], stroke.at(-1)]);
  });

  it('a wobbly straight stroke, the wobble under epsilon, is still its two ends', () => {
    const stroke = line({ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }, 80).map((p, i) => ({
      x: p.x,
      y: p.y + (i % 2 === 0 ? 1 : -1) * STROKE_EPSILON * 0.4,
    }));
    expect(simplifyStroke(stroke, 10)).toHaveLength(2);
  });

  it('an L-shape is its start, its corner and its end', () => {
    const corner = { x: 0.6, y: 0.2 };
    const stroke = [
      ...line({ x: 0.1, y: 0.2 }, corner),
      ...line(corner, { x: 0.6, y: 0.9 }).slice(1),
    ];
    expect(simplifyStroke(stroke, 10)).toEqual([{ x: 0.1, y: 0.2 }, corner, { x: 0.6, y: 0.9 }]);
  });

  it('a stroke that turns back on itself keeps the turn', () => {
    const turn = { x: 0.8, y: 0.5 };
    const stroke = [...line({ x: 0.1, y: 0.5 }, turn), ...line(turn, { x: 0.3, y: 0.5 }).slice(1)];
    expect(simplifyStroke(stroke, 10)).toEqual([{ x: 0.1, y: 0.5 }, turn, { x: 0.3, y: 0.5 }]);
  });

  it('a long wiggly stroke is never more than the limit, its first and last points kept', () => {
    const stroke = Array.from({ length: 600 }, (_, i) => ({
      x: 0.05 + (0.9 * i) / 599,
      y: 0.5 + 0.3 * Math.sin(i / 12),
    }));
    for (const max of [2, 3, 6, 10]) {
      const kept = simplifyStroke(stroke, max);
      expect(kept.length).toBeLessThanOrEqual(max);
      expect(kept.length).toBe(max); // every bend is far past epsilon: the cap is what stops it
      expect(kept[0]).toEqual(stroke[0]);
      expect(kept.at(-1)).toEqual(stroke.at(-1));
      // The kept points are the stroke's own, in its order.
      const at = kept.map((p) => stroke.indexOf(p));
      expect(at).toEqual([...at].sort((a, b) => a - b));
    }
  });

  it('measures in field short sides: x counts `aspect` times more than y', () => {
    // A bend of 0.015 across the field: 0.037 short sides on a 2.46 : 1 field, past epsilon.
    const bend = { x: 0.515, y: 0.5 };
    const stroke = [...line({ x: 0.5, y: 0.1 }, bend), ...line(bend, { x: 0.5, y: 0.9 }).slice(1)];
    expect(simplifyStroke(stroke, 10, STROKE_EPSILON, 1)).toHaveLength(2);
    expect(simplifyStroke(stroke, 10, STROKE_EPSILON, 2000 / 812)).toHaveLength(3);
  });

  it('drops a resting finger’s repeats, keeps the end with a limit of one, and keeps a dot', () => {
    const p = { x: 0.3, y: 0.3 };
    const q = { x: 0.4, y: 0.3 };
    expect(simplifyStroke([p, p, p, q, q], 6)).toEqual([p, q]);
    expect(simplifyStroke(line(p, q), 1)).toEqual([q]);
    expect(simplifyStroke([p, p], 6)).toEqual([p]);
    expect(simplifyStroke([], 6)).toEqual([]);
  });
});
