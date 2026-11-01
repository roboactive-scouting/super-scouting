import { cn } from '@/lib/utils';

/**
 * A cycle path's start or end mark (SPEC-FINAL 8.2 v1.31): the first point is a hollow ring and
 * the last a small arrowhead pointing along the last leg, in the path's own colour, no larger than
 * a point's dot (`size`, in px, is that dot's size) and with no label.
 *
 * It is an HTML-sized SVG, not a shape inside the route's stretched 0–100 viewBox, so the arrow is
 * never squashed with the field's aspect ratio. `angle` is in degrees on the screen (0 points
 * right, 90 down), already worked out from the drawn points (`endAngle`), so a turned or
 * mirrored drawing turns the arrow with it. A white casing keeps either mark readable over the
 * image's own red and blue, as the dots' white border does.
 */
export function PathMark({
  kind,
  alliance,
  size,
  angle = 0,
  faded = false,
  x,
  y,
}: {
  kind: 'start' | 'end';
  alliance: 'red' | 'blue';
  /** The width and height in px: a point's dot (10, or 14 on the path being drawn). */
  size: number;
  /** `end` only: where the arrow points, degrees on the screen. */
  angle?: number;
  faded?: boolean;
  /** Where the mark sits, 0–1 of the drawing's box. */
  x: number;
  y: number;
}) {
  const red = alliance === 'red';
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      data-path-point=""
      data-path-mark={kind}
      data-angle={kind === 'end' ? Math.round(angle) : undefined}
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: size,
        height: size,
        transform: `translate(-50%, -50%)${kind === 'end' ? ` rotate(${angle}deg)` : ''}`,
      }}
      className={cn('pointer-events-none absolute overflow-visible', faded && 'opacity-45')}
    >
      {kind === 'start' ? (
        <>
          <circle cx="6" cy="6" r="4" className="fill-none stroke-surface [stroke-width:3.8px]" />
          <circle
            cx="6"
            cy="6"
            r="4"
            className={cn(
              'fill-none [stroke-width:2px]',
              red ? 'stroke-alliance-red' : 'stroke-alliance-blue',
            )}
          />
        </>
      ) : (
        <polygon
          points="1.5,1.5 10.5,6 1.5,10.5"
          className={cn(
            'stroke-surface [stroke-linejoin:round] [stroke-width:1.2px]',
            red ? 'fill-alliance-red' : 'fill-alliance-blue',
          )}
        />
      )}
    </svg>
  );
}
