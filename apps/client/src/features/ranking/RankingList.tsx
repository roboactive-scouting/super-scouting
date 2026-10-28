import type { FieldPhase, RankRow, RankSortStep } from '@frc/shared';
import { OUR_TEAM_NUMBER } from '@/features/teams/teamSearch';
import { cn } from '@/lib/utils';
import {
  FigureValue,
  PhaseBar,
  PhaseLegend,
  RankMedal,
  SpreadHead,
  StatusLegend,
  StatusMarks,
  StatusShape,
  StatusSpread,
} from './parts';
import { UsTag } from './RankingTable';
import {
  CATEGORY_NAME,
  consistencyText,
  figureOf,
  highestTotal,
  spreadScale,
  type Category,
} from './rankingView';

/*
 * The phone's ranking list (27-ranking final, phone frames 1 and 2): one row per team, its whole
 * area a button that opens the team's summary sheet. A row shows the first figure of the sort
 * at its end (the one task 1.59 shades); the Scoring row adds the By-phase bar, the availability
 * with its Status marks and the ± spread, the Availability row the Status spread.
 */

/** The labels above the list: what each part of a row is. */
export function ListLabels({
  category,
  phases,
  sort,
  allRows,
}: {
  category: Category;
  phases: readonly FieldPhase[];
  sort: readonly RankSortStep[];
  allRows: readonly RankRow[];
}) {
  const first = figureOf(sort[0]!.key).label;
  if (category === 'scoring') {
    return (
      <div aria-hidden="true" className="text-[0.71875rem] font-semibold text-muted">
        <div className="flex items-center justify-between gap-1.5 px-1 pt-0.5 pb-1.5">
          <span className="shrink-0">Rank · Team</span>
          <PhaseLegend phases={phases} className="me-auto gap-[7px]" />
          <span className="shrink-0">{first} · ±</span>
        </div>
        <div className="flex items-center justify-between border-b border-line px-1 pb-1.5 text-[0.6875rem] font-medium">
          <span>
            <b className="font-[650] text-ink-2">%</b> available
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <StatusShape status="broke_down" className="ms-1" />
            broke down
            <StatusShape status="disabled" className="ms-1.5" />
            disabled
            <StatusShape status="no_show" className="ms-1.5" />
            no show
          </span>
        </div>
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="text-[0.71875rem] font-semibold text-muted">
      <div className="flex items-center justify-between gap-1.5 px-1 pt-0.5 pb-1.5">
        <StatusLegend lower className="gap-x-2 text-[0.6875rem]" />
        <span className="shrink-0">{first}</span>
      </div>
      <div className="relative border-b border-line pb-1.5 ps-[50px]">
        <span className="absolute start-1 top-0">Rank · Team</span>
        <SpreadHead scale={spreadScale(allRows)} short className="text-[0.6875rem]" />
      </div>
    </div>
  );
}

export function RankingList({
  category,
  rows,
  allRows,
  phases,
  sort,
  selected,
  onSelect,
}: {
  category: Category;
  rows: readonly RankRow[];
  allRows: readonly RankRow[];
  phases: readonly FieldPhase[];
  sort: readonly RankSortStep[];
  selected: string | null;
  onSelect: (teamId: string) => void;
}) {
  const first = sort[0]!.key;
  const max = highestTotal(allRows);
  const scale = spreadScale(allRows);
  const scoring = category === 'scoring';
  return (
    <ul
      aria-label={`Teams, ${CATEGORY_NAME[category]}`}
      className="mx-3 border-x border-line bg-surface"
    >
      {rows.map((row) => (
        <li key={row.team_id} className="border-b border-line-2">
          <button
            type="button"
            aria-haspopup="dialog"
            data-team={row.number}
            onClick={() => onSelect(row.team_id)}
            className={cn(
              'motion-safe:transition grid w-full grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-x-2 ps-2 pe-2.5 text-start active:bg-accent-tint',
              scoring ? 'min-h-[60px] py-1.5' : 'grid-rows-[auto_auto] gap-y-1 pt-1.5 pb-[7px]',
              row.team_id === selected && 'bg-accent-tint',
            )}
          >
            <span
              className={cn('grid place-items-center', !scoring && 'row-span-2 self-start pt-0.5')}
            >
              <RankMedal rank={row.rank} />
            </span>
            {scoring ? (
              <span className="flex min-w-0 flex-col gap-1.5">
                <span className="truncate text-sm text-ink-2">
                  <b className="num me-0.5 font-semibold text-ink">{row.number}</b> {row.name}
                  {row.number === OUR_TEAM_NUMBER && <UsTag />}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-[104px] shrink-0">
                    <PhaseBar row={row} phases={phases} max={max} className="h-[7px]" />
                  </span>
                  <StatusMarks row={row} percentFirst />
                </span>
              </span>
            ) : (
              <span className="truncate text-sm text-ink-2">
                <b className="num me-0.5 font-semibold text-ink">{row.number}</b> {row.name}
                {row.number === OUR_TEAM_NUMBER && <UsTag />}
              </span>
            )}
            <span className="flex flex-col items-end gap-[3px]">
              <FigureValue
                row={row}
                figure={first}
                inSort
                className="min-w-[58px] text-[0.9375rem]"
              />
              {scoring && (
                <small className="num text-[0.71875rem] text-muted">{consistencyText(row)}</small>
              )}
            </span>
            {!scoring && (
              <span className="col-span-2 col-start-2">
                <StatusSpread row={row} scale={scale} />
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
