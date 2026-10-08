import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatTime } from '@frc/shared';
import { AllianceTag, StationTag } from '@/components/ui/tag';
import type { Station } from '@/data/station';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';

/**
 * The page's tag (Entry README): the station ("Blue 2") on a phone, the alliance ("Blue
 * alliance") on desktop, and the alliance when the team is not in the match's line-up.
 */
export function EntryTag({
  alliance,
  station,
  desktop,
}: {
  alliance: 'red' | 'blue';
  station: Station | null;
  desktop: boolean;
}) {
  if (!desktop && station) return <StationTag station={station} />;
  return (
    <AllianceTag alliance={alliance}>
      {alliance === 'red' ? 'Red alliance' : 'Blue alliance'}
    </AllianceTag>
  );
}

/**
 * The title ("Q38 · 5951 Tiny Titans"), the tag and the saved-draft line. Desktop: one row.
 * Phone: a white bar with the 48 px "‹ Scout" link and the tag above the title.
 */
export function EntryHeader({
  desktop,
  matchLabel,
  teamLabel,
  savedAt,
  tag,
}: {
  desktop: boolean;
  matchLabel: string;
  teamLabel: string;
  /** The draft's last write (ISO), or null before the first one. */
  savedAt: string | null;
  tag: ReactNode;
}) {
  const title = (
    <>
      <h1
        className={cn(
          'font-[750] tracking-[-0.02em] text-ink',
          desktop ? 'text-[1.75rem]' : 'mt-1.5 text-[1.375rem]',
        )}
      >
        <span className="num font-semibold">{matchLabel}</span> ·{' '}
        <span dir="auto">{teamLabel}</span>
      </h1>
      {savedAt && (
        <p
          className={cn(
            'mt-1.5 flex items-center gap-2 text-muted',
            desktop ? 'text-[0.8125rem]' : 'text-[0.78125rem]',
          )}
        >
          <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-accent" />
          Draft saved on this device · {formatTime(savedAt)}
        </p>
      )}
    </>
  );

  if (desktop) {
    return (
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">{title}</div>
        {tag}
      </header>
    );
  }
  return (
    <header className="border-b border-line bg-surface px-4 pt-3 pb-3.5">
      <div className="flex items-center justify-between gap-2.5">
        <Link
          to={PATHS.scout}
          className="hover-veil -ms-2 flex min-h-12 items-center rounded-control px-2 text-[0.8125rem] font-medium text-muted"
        >
          ‹ Scout
        </Link>
        {tag}
      </div>
      {title}
    </header>
  );
}
