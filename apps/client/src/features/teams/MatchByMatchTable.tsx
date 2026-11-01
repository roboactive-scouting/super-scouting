import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { NO_VALUE, shadeFor, type StatsMatchRow, type TeamStats } from '@frc/shared';
import { shadeBackground } from '@/components/ShadedValue';
import { LinkCard, LinkTableRow } from '@/components/ui/link-row';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RobotStatusTag } from '@/components/ui/tag';
import { entryPreviewPath } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { formatStat, isDeadRow, matchLinkLabel, scouterShort } from './teamView';

/*
 * The Matches tab (SPEC-FINAL 13.1; 24-team final, D2): the match strip FIRST and only on this
 * tab, then the phone list (match · robot status · scouter · points, no station and no field
 * values) or the computer's match-by-match table (Match · Robot · Points · the metric columns ·
 * Scouter · ›). Every row and strip cell opens that entry's preview, `/entries/:id`. A dead robot
 * (no-show, disabled) is "—" in every value column — never a 0 (11.3).
 */

/** The points of a row as printed: "—" for a dead robot or no score. */
function pointsText(row: StatsMatchRow): string | null {
  if (isDeadRow(row) || row.scouted_points === null) return null;
  return formatStat(row.scouted_points);
}

/**
 * THEME "Match strip": one cell per match, oldest → newest, the label over the points, shaded
 * worst → best over the strip's own points (12.6: the observed min–max of the values shown). A
 * broke-down match has a 3 px `--warn` bottom edge; a no-show (or disabled robot) is a dashed
 * `--control-border` cell with "—". A cell opens its entry.
 */
export function MatchStrip({ matches }: { matches: readonly StatsMatchRow[] }) {
  const points = matches.flatMap((m) => {
    const p = isDeadRow(m) ? null : m.scouted_points;
    return p === null ? [] : [p];
  });
  const domain =
    points.length > 0
      ? { kind: 'range' as const, min: Math.min(...points), max: Math.max(...points) }
      : null;
  return (
    <nav
      aria-label="Match strip"
      data-match-strip=""
      className="flex gap-[5px] overflow-x-auto border-b border-line bg-surface px-3.5 py-2.5 lg:gap-2 lg:px-8 lg:py-3"
    >
      {matches.map((m) => {
        const text = pointsText(m);
        const shade = text === null ? null : shadeFor(m.scouted_points, domain, 'higher_is_better');
        const dead = text === null;
        return (
          <Link
            key={m.entry_id}
            to={entryPreviewPath(m.entry_id)}
            aria-label={matchLinkLabel(m)}
            data-shade={shade ? (shade.flat ? 'flat' : String(shade.mix)) : 'none'}
            style={shade ? ({ '--shade-bg': shadeBackground(shade) } as CSSProperties) : undefined}
            className={cn(
              'hover-veil min-w-7 flex-1 rounded-[7px] border pt-[5px] pb-1.5 text-center text-ink outline-offset-2 lg:w-[74px] lg:flex-none',
              dead
                ? 'border-dashed border-control-border bg-surface'
                : 'border-line bg-[var(--shade-bg)]',
              m.robot_status === 'broke_down' && 'shadow-[inset_0_-3px_0_var(--warn)]',
            )}
          >
            <small
              aria-hidden="true"
              className={cn('num block text-[0.625rem]', dead ? 'text-muted' : 'text-ink-2')}
            >
              {m.match_label ?? NO_VALUE}
            </small>
            <b
              aria-hidden="true"
              className={cn('num text-sm font-semibold', dead && 'font-medium text-muted')}
            >
              {text ?? NO_VALUE}
            </b>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The phone list (B's list, 24 final): NEWEST first, one card a match — match (mono) · robot
 * status · scouter (first name and initial) · points (mono 20 px over "pts", "—" when none) · ›.
 */
export function MatchList({ matches }: { matches: readonly StatsMatchRow[] }) {
  const newest = [...matches].reverse();
  return (
    <>
      <div className="mx-3.5 mt-2.5 mb-1.5 flex items-center gap-2.5 text-xs font-[750] uppercase tracking-[0.06em] text-muted">
        Newest first
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
        <span className="font-semibold normal-case tracking-normal">tap a row for the entry</span>
      </div>
      <ul aria-label="Match by match" className="border-t border-line">
        {newest.map((m) => {
          const text = pointsText(m);
          return (
            <li key={m.entry_id}>
              <LinkCard
                to={entryPreviewPath(m.entry_id)}
                label={matchLinkLabel(m)}
                className="flex min-h-[3.25rem] items-center gap-2.5 rounded-none border-0 border-b border-line-2 px-3.5 py-1.5 pe-9"
              >
                <span className="num w-[2.125rem] shrink-0 text-sm font-semibold">
                  {m.match_label ?? NO_VALUE}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {m.robot_status ? <RobotStatusTag status={m.robot_status} /> : null}
                  <span dir="auto" className="truncate text-[0.78125rem] text-muted">
                    {scouterShort(m.scouter_name)}
                  </span>
                </span>
                <span className="text-end leading-none">
                  <b
                    className={cn(
                      'num block text-xl font-semibold',
                      text === null && 'font-medium text-muted',
                    )}
                  >
                    {text ?? NO_VALUE}
                  </b>
                  <small className="mt-0.5 block text-[0.65625rem] font-semibold text-muted">
                    pts
                  </small>
                </span>
              </LinkCard>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * One metric cell: a number end-aligned in mono; words (Yes, an option's label) as text from the
 * start, like its column (`words`); "—" when there is none, or the robot was dead.
 */
function ValueCell({
  cell,
  dead,
  words,
}: {
  cell: { value: number | null; display: string | null } | undefined;
  dead: boolean;
  words: boolean;
}) {
  if (dead || !cell || (cell.value === null && cell.display === null)) {
    return (
      <TableCell numeric={!words} className="font-normal text-muted">
        {NO_VALUE}
      </TableCell>
    );
  }
  if (cell.display !== null) {
    return (
      <TableCell dir="auto" className="text-[0.84375rem]">
        {cell.display}
      </TableCell>
    );
  }
  return (
    <TableCell numeric className="font-normal">
      {formatStat(cell.value)}
    </TableCell>
  );
}

/**
 * The computer's match-by-match table (locked Data table, `aria-label="Match by match"`): newest
 * first, Match · Robot · Points · the team dashboard's metric columns (the scored fields) ·
 * Scouter · ›. A row is THEME "Table row as a link" to the entry preview.
 */
export function MatchByMatchTable({
  matches,
  columns,
}: {
  matches: readonly StatsMatchRow[];
  columns: TeamStats['columns'];
}) {
  const newest = [...matches].reverse();
  // A column of words (a toggle's Yes / No, an option) reads from the start, numbers from the end.
  const words = new Set(
    columns
      .filter((c) => matches.some((m) => (m.columns[c.key]?.display ?? null) !== null))
      .map((c) => c.key),
  );
  return (
    <Table
      aria-label="Match by match"
      containerClassName="rounded-card border border-line bg-surface"
    >
      <TableHeader>
        <TableRow>
          <TableHead className="ps-4">Match</TableHead>
          <TableHead>Robot</TableHead>
          <TableHead numeric>Points</TableHead>
          {columns.map((c) => (
            <TableHead key={c.key} numeric={!words.has(c.key)}>
              {c.label}
            </TableHead>
          ))}
          <TableHead>Scouter</TableHead>
          <TableHead className="pe-5">
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {newest.map((m) => {
          const dead = isDeadRow(m);
          const text = pointsText(m);
          return (
            <LinkTableRow
              key={m.entry_id}
              to={entryPreviewPath(m.entry_id)}
              label={matchLinkLabel(m)}
            >
              <TableCell className="num ps-4 font-semibold">{m.match_label ?? NO_VALUE}</TableCell>
              <TableCell>
                {m.robot_status ? <RobotStatusTag status={m.robot_status} /> : null}
              </TableCell>
              <TableCell numeric className={cn('font-normal', text === null && 'text-muted')}>
                {text ?? NO_VALUE}
              </TableCell>
              {columns.map((c) => (
                <ValueCell
                  key={c.key}
                  cell={m.columns[c.key]}
                  dead={dead}
                  words={words.has(c.key)}
                />
              ))}
              <TableCell dir="auto">{scouterShort(m.scouter_name)}</TableCell>
            </LinkTableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
