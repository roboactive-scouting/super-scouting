import {
  formatPercent,
  NO_VALUE,
  type FieldPhase,
  type RankRow,
  type RankSortKey,
} from '@frc/shared';
import { cn } from '@/lib/utils';
import {
  figureText,
  hasData,
  phaseAverage,
  PHASE_NAME,
  STATUS_WORD,
  statusMarks,
  statusSpread,
  type StatusKey,
} from './rankingView';

/*
 * The ranking's locked pieces (THEME "Locked components", Ranking, 2026-10-28): the medal, the
 * Numbered sort badge, the By-phase bar, the Robot status shapes, Status marks and the Status
 * spread bar, and the one figure cell that task 1.59 shades.
 */

/** No counted matches: the words in place of a bar (THEME "By-phase bar"). */
export const NO_MATCHES = 'No counted matches yet';

/**
 * The rank: a medal on the top 3 (SPEC-FINAL 13.5) — a ribbon over a disc holding the number,
 * one image named "Medal, rank 1" — else the number in `--muted`; no rank is "—".
 */
export function RankMedal({ rank, className }: { rank: number | null; className?: string }) {
  if (rank === null) {
    return (
      <span className={cn('num inline-block w-6 text-center text-muted', className)}>
        {NO_VALUE}
      </span>
    );
  }
  if (rank > 3) {
    return (
      <span
        className={cn(
          'num inline-block w-6 text-center text-[0.8125rem] font-medium text-muted',
          className,
        )}
      >
        {rank}
      </span>
    );
  }
  return (
    <svg
      role="img"
      aria-label={`Medal, rank ${rank}`}
      viewBox="0 0 24 24"
      className={cn('block size-6', className)}
    >
      <polygon points="6,1 10.5,1 13,8 8.5,8" className="fill-muted" />
      <polygon points="18,1 13.5,1 11,8 15.5,8" className="fill-ink-2" />
      <circle cx="12" cy="15" r="7.5" className="fill-ink" />
      <text
        x="12"
        y="18.6"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        className="num fill-surface"
      >
        {rank}
      </text>
    </svg>
  );
}

/** THEME "Numbered sort badge": the place of a header's figure in the sort. */
export function SortBadge({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'num inline-grid size-4 shrink-0 place-items-center rounded-[4px] bg-accent text-[0.65625rem] font-semibold text-on-accent',
        className,
      )}
    >
      {n}
    </span>
  );
}

/** The faint ⇕ of a sortable header that is not in the sort. */
export function SortGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 10 14"
      className="inline-block h-2.5 w-[7px] shrink-0 fill-faint"
    >
      <path d="M5 1 9 5H1zM5 13 1 9h8z" />
    </svg>
  );
}

/** Each phase's segment colour (THEME "By-phase bar"); a fourth phase takes `--control-border`. */
export const PHASE_FILL: Record<FieldPhase, string> = {
  auto: 'bg-ink-2',
  teleop: 'bg-faint',
  endgame: 'bg-muted',
  post_match: 'bg-control-border',
};

/**
 * THEME "By-phase bar": a segment per scoring phase with 2 px gaps, each as wide as its points
 * against `max` (the event's highest Total in a list; the team's own Total in the study). No
 * data: "No counted matches yet". Decorative: the figures are printed beside it.
 */
export function PhaseBar({
  row,
  phases,
  max,
  className,
}: {
  row: RankRow;
  phases: readonly FieldPhase[];
  max: number;
  className?: string;
}) {
  if (!hasData(row) || row.average_points === null) {
    return <span className="text-xs whitespace-nowrap text-muted">{NO_MATCHES}</span>;
  }
  return (
    <span aria-hidden="true" className={cn('flex h-2.5 gap-0.5', className)}>
      {phases.map((phase) => {
        const value = phaseAverage(row, phase) ?? 0;
        const width = max > 0 ? (value / max) * 100 : 0;
        if (width <= 0) return null;
        return (
          <i
            key={phase}
            data-phase={phase}
            className={cn('block rounded-[2px]', PHASE_FILL[phase])}
            style={{ width: `${width.toFixed(2)}%` }}
          />
        );
      })}
    </span>
  );
}

/** The phases' legend: 8 px squares and their words. */
export function PhaseLegend({
  phases,
  className,
}: {
  phases: readonly FieldPhase[];
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {phases.map((phase) => (
        <span
          key={phase}
          className="inline-flex items-center gap-1 text-[0.71875rem] font-medium text-muted normal-case tracking-normal"
        >
          <i
            aria-hidden="true"
            className={cn('inline-block size-2 rounded-[2px]', PHASE_FILL[phase])}
          />
          {PHASE_NAME[phase]}
        </span>
      ))}
    </span>
  );
}

/**
 * THEME "Robot status" shapes: Played a green dot, Broke down a `--warn` diamond, Disabled a
 * hollow `--warn` square, No show an `--ink-2` dash. Decorative: the words are beside them.
 */
export function StatusShape({ status, className }: { status: StatusKey; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-status={status}
      className={cn(
        'inline-block shrink-0 align-middle',
        status === 'played' && 'size-[7px] rounded-full bg-accent',
        status === 'broke_down' && 'mx-px size-[7px] rotate-45 bg-warn',
        status === 'disabled' && 'size-2 rounded-[1px] border-[1.5px] border-warn bg-surface',
        status === 'no_show' && 'h-0.5 w-[9px] rounded-[1px] bg-ink-2',
        className,
      )}
    />
  );
}

/** The four statuses' legend (the Availability view's group header). */
export function StatusLegend({
  className,
  lower = false,
}: {
  className?: string;
  lower?: boolean;
}) {
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2.5 gap-y-1', className)}>
      {(['played', 'broke_down', 'disabled', 'no_show'] as const).map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1 text-[0.71875rem] font-medium text-muted normal-case tracking-normal"
        >
          <StatusShape status={s} />
          {lower ? STATUS_WORD[s].toLowerCase() : STATUS_WORD[s]}
        </span>
      ))}
    </span>
  );
}

/**
 * THEME "Status marks": the availability % (mono, `--ink-2`; bold `--ink` under 100 %) with, before
 * it, one shape per problem match — broke down, disabled, no show, in that order. A clean team
 * shows the % alone; no data is a muted "—". `percentFirst`: the phone row puts the % first.
 */
export function StatusMarks({
  row,
  percentFirst = false,
  className,
}: {
  row: RankRow;
  percentFirst?: boolean;
  className?: string;
}) {
  if (!hasData(row)) {
    return <span className={cn('num text-muted', className)}>{NO_VALUE}</span>;
  }
  const low = row.availability_rate !== null && row.availability_rate < 1;
  const percent = (
    <span
      className={cn(
        'num whitespace-nowrap',
        percentFirst ? 'text-xs' : 'min-w-10 text-end text-[0.8125rem]',
        low ? 'font-semibold text-ink' : 'text-ink-2',
      )}
    >
      {formatPercent(row.availability_rate)}
    </span>
  );
  const marks = statusMarks(row);
  return (
    <span
      className={cn('inline-flex items-center gap-1.5', !percentFirst && 'justify-end', className)}
    >
      {percentFirst && percent}
      {marks.length > 0 && (
        <span aria-hidden="true" className="inline-flex items-center gap-[3px]">
          {marks.map((status, i) => (
            <StatusShape key={i} status={status} />
          ))}
        </span>
      )}
      {!percentFirst && percent}
    </span>
  );
}

const BLOCK: Record<StatusKey, string> = {
  played: 'border border-line bg-line-2 text-ink-2',
  broke_down: 'bg-warn-tint text-warn',
  disabled: 'border border-warn bg-surface text-warn',
  no_show: 'border border-control-border bg-surface text-ink-2',
};

/**
 * THEME "Status spread bar": one row of blocks over the team's SCOUTED matches — Played and Broke
 * down left of a 2 px `--ink-2` line ("On the field"), Disabled and No show right of it
 * ("Missed") — each as wide as its count against the table's `scale` and printing its shape and
 * count. A match nobody scouted is in none of the four, so it is never drawn as missed. No data:
 * "No counted matches yet". `size`: `lg` in the team study (22 px blocks).
 */
export function StatusSpread({
  row,
  scale,
  size = 'row',
  className,
}: {
  row: RankRow;
  scale: { onField: number; missed: number };
  size?: 'row' | 'lg';
  className?: string;
}) {
  if (!hasData(row)) {
    return <span className="text-xs text-muted">{NO_MATCHES}</span>;
  }
  const s = statusSpread(row);
  const block = (status: StatusKey, of: number) =>
    s[status] > 0 ? (
      <span
        key={status}
        data-block={status}
        className={cn(
          'num inline-flex shrink-0 items-center justify-center gap-[3px] overflow-hidden rounded-[4px] text-[0.71875rem]',
          size === 'lg' ? 'h-[22px] text-xs' : 'h-5',
          BLOCK[status],
        )}
        style={{ width: `calc(${((s[status] / of) * 100).toFixed(2)}% - 2px)` }}
      >
        <StatusShape status={status} />
        <b className="font-semibold">{s[status]}</b>
      </span>
    ) : null;
  return (
    <span
      role="img"
      aria-label={`Scouted matches: ${s.played} played, ${s.broke_down} broke down, ${s.disabled} disabled, ${s.no_show} no show`}
      className={cn('grid h-6 items-center', className)}
      style={{ gridTemplateColumns: `${scale.onField}fr 2px ${scale.missed}fr` }}
    >
      <span className="flex justify-end gap-0.5 pe-[3px]">
        {block('played', scale.onField)}
        {block('broke_down', scale.onField)}
      </span>
      <span aria-hidden="true" className="h-6 w-0.5 rounded-[1px] bg-ink-2" />
      <span className="flex justify-start gap-0.5 ps-[3px]">
        {block('disabled', scale.missed)}
        {block('no_show', scale.missed)}
      </span>
    </span>
  );
}

/** The spread's header: "On the field · Played + Broke down" | "Missed", on the same scale. */
export function SpreadHead({
  scale,
  short = false,
  className,
}: {
  scale: { onField: number; missed: number };
  short?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn('grid items-center text-[0.71875rem] font-semibold text-muted', className)}
      style={{ gridTemplateColumns: `${scale.onField}fr 2px ${scale.missed}fr` }}
    >
      <span className="truncate pe-1.5 text-end">
        {short ? 'On the field' : 'On the field · Played + Broke down'}
      </span>
      <span aria-hidden="true" className="h-3.5 w-0.5 rounded-[1px] bg-ink-2" />
      <span className="ps-1.5">Missed</span>
    </span>
  );
}

/**
 * One figure of a row: "81.2", "100%", "3", "—" — the cell task 1.59 shades. `inSort` marks the
 * figures in the current sort (the ones 1.59 wraps in `ShadedValue`); this task prints them all
 * plain, in the chip's box so the shading lands without moving anything.
 */
export function FigureValue({
  row,
  figure,
  inSort,
  className,
}: {
  row: RankRow;
  figure: RankSortKey;
  inSort: boolean;
  className?: string;
}) {
  const text = figureText(row, figure);
  return (
    <span
      data-figure={figure}
      data-in-sort={inSort ? '' : undefined}
      className={cn(
        'num inline-block text-end',
        // The chip's box, so 1.59's shading lands without moving anything.
        inSort && 'min-w-[3.25rem] px-[7px] py-[3px]',
        text === NO_VALUE
          ? 'font-medium text-muted'
          : inSort
            ? 'font-semibold text-ink'
            : 'text-ink-2',
        className,
      )}
    >
      {text}
    </span>
  );
}
