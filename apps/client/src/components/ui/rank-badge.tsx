import { Medal } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The places that carry a medal (SPEC-FINAL 13.2, 13.5: "medals on the top 3"). */
export const MEDAL_PLACES = 3;

/**
 * THEME "Rank badge (side)" (team search, 2026-10-23): a 24 px `--line-2` tag, "#7" in mono
 * 12.5 px / 600 `--ink-2`; the top 3 on `--accent-tint` / `--accent-ink` with a 15 px outline
 * medal (no metal colours). No rank: 12 px `--muted` words in its place (`none`, e.g. "not
 * ranked yet", "not at this event").
 *
 * The badge is one image to assistive technology, named "Rank 7" or "Rank 1, medal", so its
 * meaning never rests on the colour or the glyph.
 */
export function RankBadge({
  rank,
  none,
  className,
}: {
  rank: number | null;
  /** The words shown when there is no rank. */
  none: string;
  className?: string;
}) {
  if (rank === null) {
    return <span className={cn('text-xs whitespace-nowrap text-muted', className)}>{none}</span>;
  }
  const medal = rank <= MEDAL_PLACES;
  return (
    <span
      role="img"
      aria-label={medal ? `Rank ${rank}, medal` : `Rank ${rank}`}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-tag px-[7px] num text-[0.78125rem] font-semibold',
        medal ? 'bg-accent-tint text-accent-ink' : 'bg-line-2 text-ink-2',
        className,
      )}
    >
      {medal && <Medal aria-hidden="true" strokeWidth={2} className="size-[15px]" />}#{rank}
    </span>
  );
}
