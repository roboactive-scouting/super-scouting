import { ChevronLeft } from 'lucide-react';
import type { Ref } from 'react';
import type { TeamStats } from '@frc/shared';
import { plural } from '@/lib/plural';
import { cn } from '@/lib/utils';
import { formatStat, lastSeen } from './teamView';

/*
 * THEME "Team header" (24-team final, D2): the page's OWN sticky `<header>` — not PageHeader — the
 * team number in mono (40 px on a computer, 30 px on a phone), the name, a `--muted` line, the
 * headline (Average points, the canonical basic rank's value, mono) and the rank badge. A phone
 * has a ‹ back button, and once scrolled the header shrinks to ONE line (‹ · number · name ·
 * headline · "Rank #4 / 42") with a soft shadow; reduced motion gets no animation.
 */

/** Where the header sticks: under the phone's top bar, or under the computer's crumb bar. */
export const HEADER_TOP = {
  phone: 'calc(3.375rem + env(safe-area-inset-top))',
  desktop: '3.75rem',
} as const;

/** "Rank #4 / 42" (the phone's tag), or the words when the team is not ranked. */
function RankTag({ rank, of, small }: { rank: number | null; of: number; small?: boolean }) {
  if (rank === null) return <span className="text-muted">not ranked yet</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[3px] whitespace-nowrap rounded-tag bg-line-2 font-[650] text-ink-2',
        small ? 'h-5 px-1.5 text-[0.71875rem]' : 'h-[26px] px-[9px] text-[0.78125rem]',
      )}
    >
      <span className="sr-only">
        Rank {rank} of {of}
      </span>
      <span aria-hidden="true">
        Rank <span className="num font-semibold text-ink">#{rank}</span> /{' '}
        <span className="num font-semibold text-ink">{of}</span>
      </span>
    </span>
  );
}

/** The computer's 46 px badge: "#4" over "of 42". */
function RankBadgeBig({ rank, of }: { rank: number | null; of: number }) {
  if (rank === null) return <span className="text-[0.8125rem] text-muted">not ranked yet</span>;
  return (
    <span className="flex h-[46px] shrink-0 flex-col items-center justify-center rounded-tag bg-line-2 px-3 leading-[1.1]">
      <span className="sr-only">
        Rank {rank} of {of}
      </span>
      <span aria-hidden="true" className="num text-xl font-semibold text-ink">
        #{rank}
      </span>
      <small aria-hidden="true" className="text-[0.65625rem] font-[650] text-muted">
        of {of}
      </small>
    </span>
  );
}

export function TeamHeader({
  stats,
  desktop,
  compact = false,
  onBack,
  ref,
}: {
  stats: TeamStats;
  desktop: boolean;
  /** The phone's one-line header, once the page is scrolled. */
  compact?: boolean;
  onBack: () => void;
  ref?: Ref<HTMLElement>;
}) {
  const { team, rank, headline } = stats;
  const entries = plural(stats.entry_count, 'entry', 'entries');
  const empty = stats.entry_count === 0;
  const seen = lastSeen(stats);
  const value = headline.value === null ? null : formatStat(headline.value);
  const headlineValue = (size: string) =>
    value === null ? (
      <b className={cn('num block font-medium leading-[1.1] text-muted', size)}>—</b>
    ) : (
      <b className={cn('num block font-semibold leading-[1.1] text-ink', size)}>{value}</b>
    );

  const back = (
    <button
      type="button"
      onClick={onBack}
      aria-label="Back to Search"
      className="tap-target hover-veil -ms-3 grid shrink-0 place-items-center rounded-control text-ink-2"
    >
      <ChevronLeft aria-hidden="true" className="size-5" />
    </button>
  );

  const stick = {
    top: desktop ? HEADER_TOP.desktop : HEADER_TOP.phone,
  };

  if (desktop) {
    const sub = [
      stats.event?.name ?? null,
      entries,
      empty ? 'not ranked yet' : seen ? `last seen ${seen}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <header
        ref={ref}
        style={stick}
        className="sticky z-20 flex items-center gap-[18px] border-b border-line bg-surface px-8 pt-[18px] pb-4"
      >
        <span
          aria-hidden="true"
          className="num text-[2.5rem] font-semibold leading-none tracking-[-0.02em]"
        >
          {team.number}
        </span>
        <div className="min-w-0">
          <h1 dir="auto" className="truncate text-[1.375rem] font-bold tracking-[-0.01em]">
            <span className="sr-only">{team.number} </span>
            {team.name}
          </h1>
          <p dir="auto" className="mt-[3px] text-[0.8125rem] text-muted">
            {sub}
          </p>
        </div>
        <span className="flex-1" />
        <div className="text-end">
          <small className="block text-[0.71875rem] font-semibold text-muted">
            {headline.label}
          </small>
          {headlineValue('text-[2rem]')}
        </div>
        {!empty && <RankBadgeBig rank={rank.rank} of={rank.of} />}
      </header>
    );
  }

  if (compact) {
    return (
      <header
        ref={ref}
        style={stick}
        data-compact=""
        className="motion-safe:transition-[padding,box-shadow] sticky z-20 flex items-center gap-2.5 border-b border-line bg-surface px-4 py-[9px] shadow-[0_6px_14px_-12px_color-mix(in_srgb,var(--ink)_50%,transparent)]"
      >
        {back}
        <h1 className="flex min-w-0 items-baseline gap-2">
          <span className="num text-[1.1875rem] font-semibold leading-none tracking-[-0.02em]">
            {team.number}
          </span>
          <span dir="auto" className="truncate text-[0.90625rem] font-bold">
            {team.name}
          </span>
        </h1>
        <span className="flex-1" />
        <span className="sr-only">{headline.label}</span>
        {headlineValue('text-[1.0625rem]')}
        <RankTag rank={rank.rank} of={rank.of} />
      </header>
    );
  }

  return (
    <header
      ref={ref}
      style={stick}
      className="motion-safe:transition-[padding,box-shadow] sticky z-20 flex items-center gap-3 border-b border-line bg-surface px-4 pt-3.5 pb-3"
    >
      {back}
      <div className="min-w-0">
        <h1 className="flex min-w-0 items-baseline gap-2">
          <span className="num text-[1.875rem] font-semibold leading-none tracking-[-0.02em]">
            {team.number}
          </span>
          <span dir="auto" className="truncate text-[1.0625rem] font-bold tracking-[-0.01em]">
            {team.name}
          </span>
        </h1>
        <p className="mt-[3px] flex flex-wrap items-center gap-x-1 text-xs text-muted">
          {entries} · {empty ? 'not ranked yet' : <RankTag rank={rank.rank} of={rank.of} small />}
        </p>
      </div>
      <span className="flex-1" />
      <div className="shrink-0 text-end">
        <small className="block text-[0.71875rem] font-semibold text-muted">Avg points</small>
        {headlineValue('text-[1.625rem]')}
      </div>
    </header>
  );
}
