import {
  PHASE_SORT_KEYS,
  type FieldPhase,
  type RankRow,
  type RankSortKey,
  type RankSortStep,
} from '@frc/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OUR_TEAM_NUMBER } from '@/features/teams/teamSearch';
import { cn } from '@/lib/utils';
import {
  FigureValue,
  PhaseBar,
  PhaseLegend,
  RankMedal,
  SortBadge,
  SortGlyph,
  SpreadHead,
  StatusLegend,
  StatusMarks,
  StatusShape,
  StatusSpread,
} from './parts';
import {
  availabilityLabel,
  consistencyText,
  figureOf,
  highestTotal,
  matchesText,
  sortIndex,
  spreadScale,
  type Category,
  type StatusKey,
} from './rankingView';

/*
 * The computer's ranking table (27-ranking final, frames 1 and 2): the locked `Table` with a
 * sticky header under the crumb bar and numeric cells. A sortable header is a button (a click
 * makes its figure the whole sort, a second click reverses it); the first figure of the sort
 * carries `aria-sort`, every figure in the sort its Numbered sort badge, the others a faint ⇕,
 * and Consistency nothing at all. A row click selects the team for the study panel.
 */

/** Our own team's tag. */
export function UsTag() {
  return (
    <span className="ms-[7px] inline-flex h-[19px] items-center rounded-tag border border-line bg-line-2 px-1.5 align-[1px] text-[0.6875rem] font-[650] text-ink-2">
      Us
    </span>
  );
}

function SortableHead({
  figure,
  sort,
  onSort,
  status,
}: {
  figure: RankSortKey;
  sort: readonly RankSortStep[];
  onSort: (key: RankSortKey) => void;
  status?: StatusKey;
}) {
  const at = sortIndex(sort, figure);
  const primary = at === 0 ? sort[0] : undefined;
  const label = figureOf(figure).label;
  return (
    <TableHead
      numeric
      aria-sort={primary ? (primary.direction === 'asc' ? 'ascending' : 'descending') : undefined}
      onClick={() => onSort(figure)}
      className={cn(
        'cursor-pointer px-2 text-ink-2',
        at >= 0 && 'font-[750] text-accent-ink shadow-[inset_0_-2px_0_var(--accent)]',
      )}
    >
      <button
        type="button"
        className="own-focus inline-flex items-center gap-[5px] whitespace-nowrap"
      >
        {status && <StatusShape status={status} />}
        {label}
        {at >= 0 ? (
          <>
            <SortBadge n={at + 1} />
            {at > 0 && <span className="sr-only">, tie-breaker {at}</span>}
          </>
        ) : (
          <SortGlyph />
        )}
      </button>
    </TableHead>
  );
}

const GROUP =
  'block border-b-2 border-line pb-[5px] text-[0.6875rem] font-[650] tracking-[0.07em] text-muted uppercase';

export function RankingTable({
  category,
  rows,
  allRows,
  phases,
  sort,
  onSort,
  selected,
  onSelect,
}: {
  category: Category;
  /** The rows in the sort's order. */
  rows: readonly RankRow[];
  /** Every row (the bar's and the spread's scale). */
  allRows: readonly RankRow[];
  phases: readonly FieldPhase[];
  sort: readonly RankSortStep[];
  onSort: (key: RankSortKey) => void;
  selected: string | null;
  onSelect: (teamId: string) => void;
}) {
  const inSort = (key: RankSortKey) => sortIndex(sort, key) >= 0;
  const max = highestTotal(allRows);
  const scale = spreadScale(allRows);
  const scoring = category === 'scoring';
  return (
    <Table
      // From 1360 px the table always fits (beside the study panel too): the header sticks under
      // the crumb bar. Narrower, it scrolls sideways inside its card at its least width, and a
      // sticky header would stick to that scroll box instead of the page, so it does not stick.
      containerClassName="overflow-x-auto rounded-card border border-line bg-surface min-[1360px]:overflow-visible"
      className={cn('table-fixed text-[0.84375rem]', scoring ? 'min-w-[728px]' : 'min-w-[920px]')}
    >
      {/* The design's widths (27-ranking final); the team's name (Scoring) or the spread
          (Availability) takes the room the others leave. */}
      <colgroup>
        <col className="w-12" />
        {scoring ? (
          <>
            <col />
            <col className="w-[84px]" />
            <col className="w-[66px]" />
            {phases.map((phase) => (
              <col
                key={phase}
                className={phase === 'endgame' || phase === 'post_match' ? 'w-[74px]' : 'w-[60px]'}
              />
            ))}
            <col className="w-[78px]" />
            <col className="w-[104px]" />
          </>
        ) : (
          <>
            <col className="w-[160px]" />
            <col />
            <col className="w-[100px]" />
            <col className="w-[110px]" />
            <col className="w-[100px]" />
            <col className="w-[92px]" />
          </>
        )}
        <col className="w-[70px]" />
      </colgroup>
      <caption className="sr-only">
        {scoring
          ? 'Ranking, Scoring: average points per match, by phase, with consistency and availability'
          : 'Ranking, Availability: the scouted matches by status'}
      </caption>
      <TableHeader className="z-10 bg-surface min-[1360px]:sticky min-[1360px]:top-[3.75rem] [&_tr]:border-b-0">
        <tr aria-hidden="true">
          <th colSpan={2} />
          {scoring ? (
            <>
              <th
                colSpan={3 + phases.length}
                className="px-2 pt-2 text-start align-bottom font-normal"
              >
                <span className={cn(GROUP, 'flex items-center justify-between gap-3')}>
                  <span>Average points per match</span>
                  <PhaseLegend phases={phases} />
                </span>
              </th>
              <th colSpan={2} className="px-2 pt-2 text-start align-bottom font-normal">
                <span className={GROUP}>Availability</span>
              </th>
            </>
          ) : (
            <>
              {/* Over the spread and Availability, so the legend keeps to one line. */}
              <th colSpan={2} className="px-2 pt-2 text-start align-bottom font-normal">
                <span className={cn(GROUP, 'flex items-center justify-between gap-3')}>
                  <span className="whitespace-nowrap">Scouted matches by status</span>
                  <StatusLegend className="flex-nowrap whitespace-nowrap" />
                </span>
              </th>
              <th colSpan={3} className="px-2 pt-2 text-start align-bottom font-normal">
                <span className={cn(GROUP, 'whitespace-nowrap')}>Counts of matches</span>
              </th>
              <th />
            </>
          )}
        </tr>
        <tr className="border-b border-line">
          <TableHead className="ps-3.5 pe-2 text-ink-2">Rank</TableHead>
          <TableHead className="px-2 text-ink-2">Team</TableHead>
          {scoring ? (
            <>
              <TableHead className="px-2 text-ink-2">By phase</TableHead>
              <SortableHead figure="average_points" sort={sort} onSort={onSort} />
              {phases.map((phase) => (
                <SortableHead
                  key={phase}
                  figure={PHASE_SORT_KEYS[phase]}
                  sort={sort}
                  onSort={onSort}
                />
              ))}
              <TableHead numeric className="px-2 font-medium text-muted">
                Consistency
              </TableHead>
              <TableHead numeric className="px-2 pe-2.5 text-ink-2">
                Availability
              </TableHead>
            </>
          ) : (
            <>
              <TableHead className="px-2">
                <SpreadHead scale={scale} />
              </TableHead>
              <SortableHead figure="availability_rate" sort={sort} onSort={onSort} />
              <SortableHead figure="breakdowns" sort={sort} onSort={onSort} status="broke_down" />
              <SortableHead figure="no_shows" sort={sort} onSort={onSort} status="no_show" />
              <SortableHead figure="disabled" sort={sort} onSort={onSort} status="disabled" />
            </>
          )}
          <TableHead numeric className="px-2 pe-3.5 text-ink-2">
            Matches
          </TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const isSelected = row.team_id === selected;
          return (
            <TableRow
              key={row.team_id}
              data-team={row.number}
              onClick={() => onSelect(row.team_id)}
              className={cn(
                'cursor-pointer',
                scoring ? '[&>td]:h-[31px]' : '[&>td]:h-[33px]',
                isSelected &&
                  'bg-accent-tint hover:bg-accent-tint [&>td:first-child]:shadow-[inset_3px_0_0_var(--accent)]',
              )}
            >
              <TableCell className="ps-3 pe-0">
                <RankMedal rank={row.rank} />
              </TableCell>
              <TableCell className="truncate px-2 text-ink-2">
                <button type="button" aria-pressed={isSelected} className="own-focus text-start">
                  <b className="num me-[3px] font-semibold text-ink">{row.number}</b> {row.name}
                </button>
                {row.number === OUR_TEAM_NUMBER && <UsTag />}
              </TableCell>
              {scoring ? (
                <>
                  <TableCell className="px-2">
                    <PhaseBar row={row} phases={phases} max={max} className="w-20" />
                  </TableCell>
                  <TableCell className="px-2 text-end">
                    <FigureValue
                      row={row}
                      figure="average_points"
                      inSort={inSort('average_points')}
                    />
                  </TableCell>
                  {phases.map((phase) => (
                    <TableCell key={phase} className="px-2 text-end">
                      <FigureValue
                        row={row}
                        figure={PHASE_SORT_KEYS[phase]}
                        inSort={inSort(PHASE_SORT_KEYS[phase])}
                      />
                    </TableCell>
                  ))}
                  <TableCell numeric className="px-2 font-normal text-muted">
                    {consistencyText(row)}
                  </TableCell>
                  <TableCell aria-label={availabilityLabel(row)} className="px-2 pe-2.5 text-end">
                    <StatusMarks row={row} />
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell className="px-2">
                    <StatusSpread row={row} scale={scale} />
                  </TableCell>
                  {(['availability_rate', 'breakdowns', 'no_shows', 'disabled'] as const).map(
                    (key) => (
                      <TableCell key={key} className="px-2 text-end">
                        <FigureValue row={row} figure={key} inSort={inSort(key)} />
                      </TableCell>
                    ),
                  )}
                </>
              )}
              <TableCell numeric className="px-2 pe-3.5 font-normal text-muted">
                {matchesText(row)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
