import { cn } from '@/lib/utils';

/**
 * A 58–64 px sparkline (task 1.53, the team page's Stat row; shared with Home's Top teams in task
 * 1.58b): a 1.5 px line ending in a dot. A trend line, so a match with no value (a no-show) is
 * left out rather than drawn as a gap; the team page's Progress chart shows the gap. Fewer than
 * two values draw nothing. `tone="accent"` (the default) is `--accent`; `tone="faint"` is a
 * `--faint` line with an `--ink-2` dot (Top teams' other teams, 03-home final). Decorative: the
 * figure beside it carries the meaning.
 */
export function Sparkline({
  values,
  tone = 'accent',
}: {
  values: readonly (number | null)[];
  tone?: 'accent' | 'faint';
}) {
  const xs = values.flatMap((v) => (v === null ? [] : [v]));
  if (xs.length < 2) return <span aria-hidden="true" />;
  const w = 64;
  const h = 20;
  const lo = Math.min(...xs);
  const span = Math.max(...xs) - lo || 1;
  const points = xs.map((v, i): [number, number] => [
    (i / (xs.length - 1)) * (w - 4) + 2,
    h - 3 - ((v - lo) / span) * (h - 6),
  ]);
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1]!;
  const faint = tone === 'faint';
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${w} ${h}`}
      data-tone={tone}
      className="block h-5 w-full max-w-16"
    >
      <path
        d={d}
        className={cn('fill-none', faint ? 'stroke-faint' : 'stroke-accent')}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2.2} className={faint ? 'fill-ink-2' : 'fill-accent'} />
    </svg>
  );
}
