import { ChevronRight, TriangleAlert } from 'lucide-react';
import { useId, useState } from 'react';
import type { Point } from '@frc/shared';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { imageUrlFor, isKnownSeasonImage } from '@/season/images';
import { endAngle, imageToView, viewRotation } from './mapGeometry';
import { PathMark } from './PathMark';

/** The season image's shape: `public/seasons/2026/field.webp` is 2000 × 812. */
const RATIO = 2000 / 812;

export type MapButtonProps = {
  /** The field's label: the button is named "Scoring spots: 3 spots". */
  label: string;
  /** "3 spots", "2 paths"; null when nothing is marked. */
  count: string | null;
  alliance: 'red' | 'blue';
  /** The season's `field_image_path`; null when the device does not know it. */
  imagePath: string | null;
  /** The spots, in IMAGE coordinates. */
  spots?: readonly Point[];
  /** The routes, in IMAGE coordinates. */
  paths?: readonly (readonly Point[])[];
  onOpen: () => void;
};

/**
 * THEME "Map button" (design 12-form-builder, "The map: one pattern for every map field"): a map
 * field in the form is one ≥ 76 px white row: a 112 px thumbnail of what is marked, the count at
 * 15 px / 650 over a `--muted` "Tap to open the map", and › at the right. Empty, the edge is
 * dashed with "Mark on the map" in `--accent-ink` over "Not marked yet". The thumbnail lies flat
 * like the computer's dialog, the scout's own end on the left.
 *
 * When the season image is missing (not in this build, or it fails to load) the button says the
 * map is unavailable; it still opens the map, where FieldImage's alert says why (16.7).
 */
export function MapButton({
  label,
  count,
  alliance,
  imagePath,
  spots = [],
  paths = [],
  onOpen,
}: MapButtonProps) {
  const sub = useId();
  const desktop = useIsDesktop();
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const usable = imagePath !== null && isKnownSeasonImage(imagePath) && failedPath !== imagePath;
  const empty = usable && count === null;
  const title = !usable ? 'Map unavailable' : (count ?? 'Mark on the map');
  const hint = !usable
    ? "The season's game image is missing"
    : empty
      ? 'Not marked yet'
      : `${desktop ? 'Click' : 'Tap'} to open the map`;
  const rotation = viewRotation(alliance, 'desktop');
  const red = alliance === 'red';
  const view = (p: Point) => imageToView(p, rotation);

  return (
    <button
      type="button"
      aria-label={`${label}: ${title}`}
      aria-describedby={sub}
      onClick={onOpen}
      className={cn(
        'tap-target hover-veil flex min-h-[4.75rem] w-full items-center gap-3 rounded-control border border-control-border bg-surface py-2 ps-2 pe-3 text-start text-ink',
        empty && 'border-dashed',
      )}
    >
      <span
        aria-hidden="true"
        style={{ aspectRatio: String(RATIO) }}
        className="relative w-28 flex-none overflow-hidden rounded-[6px] border border-line bg-line-2"
      >
        {usable ? (
          <>
            <img
              src={imageUrlFor(imagePath)}
              alt=""
              draggable={false}
              onError={() => setFailedPath(imagePath)}
              style={{ transform: `rotate(${rotation}deg)` }}
              className="pointer-events-none absolute inset-0 size-full select-none"
            />
            {paths.length > 0 && (
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 size-full"
              >
                {paths.map((route, i) => (
                  <polyline
                    key={i}
                    points={route
                      .map(view)
                      .map((p) => `${p.x * 100},${p.y * 100}`)
                      .join(' ')}
                    className={cn(
                      'fill-none [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.5px] [vector-effect:non-scaling-stroke]',
                      red ? 'stroke-alliance-red' : 'stroke-alliance-blue',
                    )}
                  />
                ))}
              </svg>
            )}
            {paths.flatMap((route, i) => {
              // The first point's ring and the last's arrow, as on the map itself (v1.31); the
              // thumbnail has no dots, so they are as big as a spot's.
              if (route.length === 0) return [];
              const angle = endAngle(route, rotation, RATIO);
              const first = view(route[0]!);
              const last = view(route[route.length - 1]!);
              return [
                <PathMark
                  key={`${i}-start`}
                  kind="start"
                  alliance={alliance}
                  size={8}
                  x={first.x}
                  y={first.y}
                />,
                ...(angle !== null
                  ? [
                      <PathMark
                        key={`${i}-end`}
                        kind="end"
                        alliance={alliance}
                        size={8}
                        angle={angle}
                        x={last.x}
                        y={last.y}
                      />,
                    ]
                  : []),
              ];
            })}
            {spots.map((p, i) => {
              const at = view(p);
              return (
                <span
                  key={i}
                  style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
                  className={cn(
                    'absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-surface',
                    red ? 'bg-alliance-red' : 'bg-alliance-blue',
                  )}
                />
              );
            })}
          </>
        ) : (
          <TriangleAlert className="absolute top-1/2 left-1/2 size-4 -translate-1/2 text-muted" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-[0.9375rem] font-[650]',
            empty ? 'text-accent-ink' : 'text-ink',
          )}
        >
          {title}
        </span>
        <span id={sub} className="mt-0.5 block text-[0.78125rem] text-muted">
          {hint}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 flex-none text-muted" />
    </button>
  );
}
