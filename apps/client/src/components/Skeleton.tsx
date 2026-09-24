/**
 * SPEC-FINAL 17.8: skeletons, not spinners, for lists and tables. Grey bars at the row
 * height they are about to fill, so the page does not jump when the data lands. A spinner
 * is for a single indeterminate action only, never a list.
 *
 * Still by default: SPEC-FINAL 17.9 allows motion only where it carries information, and a
 * shimmer carries none. `shimmer` opts in, and even then only under `motion-safe`, so
 * `prefers-reduced-motion` gets the same bars standing still.
 */
export function Skeleton({
  rows,
  rowHeight = '3rem',
  label = 'Loading',
  shimmer = false,
}: {
  /** How many bars: the number of rows the list is expected to fill. */
  rows: number;
  /** A CSS length; the height of one real row (3rem = the 48 px row floor). */
  rowHeight?: string;
  /** The accessible name of the busy region. */
  label?: string;
  shimmer?: boolean;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          data-skeleton-bar=""
          aria-hidden="true"
          className={`rounded-md bg-[var(--surface-raised)]${shimmer ? ' motion-safe:animate-pulse' : ''}`}
          style={{ blockSize: rowHeight }}
        />
      ))}
    </div>
  );
}
