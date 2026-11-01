import { normalizeForAlliance, type MirrorAxis, type Point } from '@frc/shared';

/**
 * How far the drawing of the season image is turned, clockwise, in degrees. Display only:
 * a tap is mapped back through `viewToImage` before anything is stored (SPEC-FINAL 8.2).
 */
export type Rotation = 0 | 90 | 180 | 270;

/** A phone draws the field upright (full screen); a computer draws it lying flat (a dialog). */
export type MapLayout = 'phone' | 'desktop';

/**
 * The turn that puts the scout's own alliance end at the bottom on a phone and on the left on a
 * computer (design 12-form-builder, "The map"). The season image is drawn with the red end on
 * its left (x = 0) and blue on its right, as `public/seasons/2026/field.webp` is.
 */
export function viewRotation(alliance: 'red' | 'blue', layout: MapLayout): Rotation {
  if (layout === 'desktop') return alliance === 'red' ? 0 : 180;
  return alliance === 'red' ? 270 : 90;
}

/** A point on the image (0–1 each way) to where it is drawn in the turned view (0–1). */
export function imageToView(p: Point, r: Rotation): Point {
  switch (r) {
    case 0:
      return { x: p.x, y: p.y };
    case 90:
      return { x: 1 - p.y, y: p.x };
    case 180:
      return { x: 1 - p.x, y: 1 - p.y };
    case 270:
      return { x: p.y, y: 1 - p.x };
  }
}

/** A tap in the turned view (0–1) back to the point on the image it covers. */
export function viewToImage(p: Point, r: Rotation): Point {
  switch (r) {
    case 0:
      return { x: p.x, y: p.y };
    case 90:
      return { x: p.y, y: 1 - p.x };
    case 180:
      return { x: 1 - p.x, y: 1 - p.y };
    case 270:
      return { x: 1 - p.y, y: p.x };
  }
}

const unit = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 10_000) / 10_000;

/**
 * What a point on the image stores (SPEC-FINAL 5.6): alliance-normalized (red raw, blue mirrored
 * on `axis`), clamped to the unit square and kept to four decimals.
 */
export function storeImagePoint(image: Point, alliance: 'red' | 'blue', axis: MirrorAxis): Point {
  const stored = normalizeForAlliance(image, alliance, axis);
  return { x: unit(stored.x), y: unit(stored.y) };
}

/**
 * What a tap in the view stores: the rotation is undone first (`viewToImage`), so the stored
 * point never depends on the rotation or the device.
 */
export function storedPoint(
  view: Point,
  r: Rotation,
  alliance: 'red' | 'blue',
  axis: MirrorAxis,
): Point {
  return storeImagePoint(viewToImage(view, r), alliance, axis);
}

/**
 * Where a cycle path's end arrow points, in degrees on the SCREEN (0 right, 90 down): the last leg
 * with any length, worked out from the points as drawn (`imageToView`, so after the mirroring and
 * the quarter turn) and with the drawing's width : height (`aspect`) put back, because the view's
 * 0–1 is not square. Null for a path whose points all sit in one place (no leg to point along).
 */
export function endAngle(
  points: readonly Point[],
  rotation: Rotation,
  aspect: number,
): number | null {
  const view = points.map((p) => imageToView(p, rotation));
  for (let i = view.length - 1; i > 0; i--) {
    const dx = (view[i]!.x - view[i - 1]!.x) * aspect;
    const dy = view[i]!.y - view[i - 1]!.y;
    if (Math.hypot(dx, dy) > 1e-6) return (Math.atan2(dy, dx) * 180) / Math.PI;
  }
  return null;
}
