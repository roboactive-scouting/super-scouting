import { ArrowRight, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  formatMetric,
  formatPercent,
  formatStdDev,
  NO_VALUE,
  type FieldPhase,
  type RankRow,
} from '@frc/shared';
import { actionButtonClass } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { SurfaceActions } from '@/components/ui/surface-actions';
import { teamPath } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { NO_MATCHES, PHASE_FILL, PhaseBar, StatusShape, StatusSpread, SpreadHead } from './parts';
import {
  hasData,
  ordinal,
  PHASE_NAME,
  phaseAverage,
  phasePlace,
  phaseShare,
  rankedCount,
  STATUS_WORD,
  statusSpread,
  typicalRange,
  type StatusKey,
} from './rankingView';

/*
 * THEME "Team study panel / summary sheet" (Ranking, 2026-10-28): one team's record beside the
 * list on a computer, in a bottom sheet on a phone. Figures only from the table's rows.
 */

type StudyProps = { row: RankRow; rows: readonly RankRow[]; phases: readonly FieldPhase[] };

/** "Rank 4 of 23 · 10 matches counted". */
function RankLine({ row, rows }: { row: RankRow; rows: readonly RankRow[] }) {
  return (
    <p className="mt-[3px] text-[0.8125rem] text-muted">
      {row.rank === null ? (
        'Not ranked yet'
      ) : (
        <>
          Rank <b className="num font-semibold text-ink-2">{row.rank}</b> of{' '}
          <span className="num">{rankedCount(rows)}</span>
        </>
      )}{' '}
      · <span className="num">{row.matches_counted}</span>{' '}
      {row.matches_counted === 1 ? 'match' : 'matches'} counted
    </p>
  );
}

function Section({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-[7px] border-t border-line pt-2.5">
      <h3 className="flex items-center justify-between text-[0.90625rem] font-[650]">
        {title}
        <span className="text-[0.6875rem] font-[650] tracking-[0.07em] text-muted uppercase">
          {kicker}
        </span>
      </h3>
      {children}
    </section>
  );
}

function Big({ value, words }: { value: string; words: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <b className="num text-2xl font-semibold tracking-[-0.02em] whitespace-nowrap">{value}</b>
      <span className="min-w-0 text-[0.8125rem] text-muted">{words}</span>
    </div>
  );
}

/** Where the points come from: the figure, the bar, Phase · Avg · Share · Place, Consistency. */
function ScoringSection({ row, rows, phases }: StudyProps) {
  const range = typicalRange(rows, row);
  const at = (v: number) => `${((Math.min(v, range!.axisMax) / range!.axisMax) * 100).toFixed(1)}%`;
  return (
    <Section title="Where the points come from" kicker="Scoring">
      <Big value={formatMetric(row.average_points)} words="average points per match" />
      {row.average_points === null ? (
        <span className="text-xs text-muted">{NO_MATCHES}</span>
      ) : (
        <PhaseBar row={row} phases={phases} max={row.average_points} className="h-3.5 w-full" />
      )}
      <table className="w-full border-collapse text-[0.8125rem]">
        <thead>
          <tr className="border-b border-line text-[0.71875rem] font-semibold text-muted">
            <th scope="col" className="pb-1 text-start font-semibold">
              Phase
            </th>
            <th scope="col" className="pb-1 text-end font-semibold">
              Avg
            </th>
            <th scope="col" className="pb-1 text-end font-semibold">
              Share
            </th>
            <th scope="col" className="pb-1 text-end font-semibold">
              Place
            </th>
          </tr>
        </thead>
        <tbody>
          {phases.map((phase) => {
            const place = phasePlace(rows, row, phase);
            return (
              <tr key={phase} className="h-6 border-b border-line-2 text-ink-2">
                <th scope="row" className="text-start font-normal">
                  <i
                    aria-hidden="true"
                    className={cn(
                      'me-[7px] inline-block size-[9px] rounded-[2px]',
                      PHASE_FILL[phase],
                    )}
                  />
                  {PHASE_NAME[phase]}
                </th>
                <td className="num text-end">{formatMetric(phaseAverage(row, phase))}</td>
                <td className="num text-end">{phaseShare(row, phase)}</td>
                <td className="text-end">
                  {place === null ? (
                    <span className="num text-muted">{NO_VALUE}</span>
                  ) : place === 1 ? (
                    <span className="inline-flex h-5 items-center rounded-tag bg-accent-tint px-[7px] text-xs font-[650] text-accent-ink">
                      1st · best
                    </span>
                  ) : (
                    <span className="num">{ordinal(place)}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-0.5">
        <div className="flex items-baseline justify-between text-[0.8125rem] font-medium text-muted">
          <span>Consistency</span>
          <b className="num text-[0.9375rem] font-semibold text-ink-2">
            {formatStdDev(row.stddev)}
          </b>
        </div>
        {range && (
          <>
            <div aria-hidden="true" className="relative mx-1.5 mt-1.5 h-[30px]">
              <span className="absolute inset-x-0 top-[7px] h-0.5 bg-line" />
              <span
                className="absolute top-[3px] h-2.5 rounded-[3px] border border-control-border bg-line"
                style={{ left: at(range.low), width: `calc(${at(range.high)} - ${at(range.low)})` }}
              />
              <span
                className="absolute top-0 -ms-px h-4 w-0.5 bg-ink"
                style={{ left: at(range.mean) }}
              />
              {[0, range.low, range.high, range.axisMax].map((tick, i) => (
                <span
                  key={i}
                  className="num absolute top-[17px] -translate-x-1/2 text-[0.6875rem] text-muted"
                  style={{ left: at(tick) }}
                >
                  {Math.round(tick)}
                </span>
              ))}
            </div>
            <p className="text-[0.78125rem] leading-[1.4] text-muted">
              Typical match:{' '}
              <b className="num font-semibold text-ink-2">
                {Math.round(range.low)}–{Math.round(range.high)}
              </b>{' '}
              points (Total ± spread)
            </p>
          </>
        )}
      </div>
    </Section>
  );
}

/** How dependable: the %, the Status spread, the tally of the four statuses. */
function AvailabilitySection({ row }: { row: RankRow }) {
  const s = statusSpread(row);
  const onField = s.played + s.broke_down;
  const scouted = onField + s.disabled + s.no_show;
  // The study draws one team: its own matches set the scale.
  const scale = { onField: Math.max(onField, 1), missed: Math.max(s.disabled + s.no_show, 1) };
  return (
    <Section title="How dependable" kicker="Availability">
      <Big
        value={hasData(row) ? formatPercent(row.availability_rate) : NO_VALUE}
        words={
          hasData(row) ? (
            <>
              available · on the field in <span className="num">{onField}</span> of{' '}
              <span className="num">{scouted}</span>
            </>
          ) : (
            'available'
          )
        }
      />
      {hasData(row) ? (
        <>
          <SpreadHead scale={scale} short />
          <StatusSpread row={row} scale={scale} size="lg" />
        </>
      ) : (
        <span className="text-xs text-muted">{NO_MATCHES}</span>
      )}
      <dl className="grid grid-cols-2 gap-x-3.5 gap-y-[3px]">
        {(['played', 'broke_down', 'disabled', 'no_show'] as StatusKey[]).map((status) => (
          <div
            key={status}
            className="flex items-center border-b border-line-2 py-0.5 text-[0.78125rem] text-ink-2"
          >
            <dt className="flex items-center gap-[7px]">
              <StatusShape status={status} />
              {STATUS_WORD[status]}
            </dt>
            <dd className="num ms-auto font-semibold text-ink">
              {hasData(row) ? s[status] : NO_VALUE}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-[0.78125rem] leading-[1.4] text-muted">
        A breakdown counts as available: the robot was on the field. Only scouted matches count.
      </p>
    </Section>
  );
}

const teamName = (row: RankRow) => `${row.number} ${row.name}`;

/** The computer's study panel, beside the list. */
export function TeamStudyPanel({
  onClose,
  id,
  ...props
}: StudyProps & { onClose: () => void; id?: string }) {
  const { row, rows } = props;
  return (
    <aside
      id={id}
      aria-label={`Team study, ${teamName(row)}`}
      className="flex flex-col gap-2.5 self-start rounded-card border border-line bg-surface px-[18px] py-4 sticky top-[calc(var(--top-bar,0px)+1rem)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.6875rem] font-[650] tracking-[0.07em] text-muted uppercase">
            Team study
          </div>
          <h2 className="mt-1.5 text-[1.375rem] font-bold tracking-[-0.01em] text-ink-2">
            <span className="num font-semibold text-ink">{row.number}</span> {row.name}
          </h2>
          <RankLine row={row} rows={rows} />
          <Link
            to={teamPath(row.team_id)}
            className="mt-[3px] inline-block text-[0.8125rem] font-semibold text-accent-ink underline underline-offset-2"
          >
            Open team page →
          </Link>
        </div>
        <button
          type="button"
          aria-label="Close the team study"
          onClick={onClose}
          className="hover-veil motion-safe:transition grid size-8 shrink-0 place-items-center rounded-control border border-line text-ink-2"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <ScoringSection {...props} />
      <AvailabilitySection row={row} />
    </aside>
  );
}

/** The phone's summary sheet: the same record, a 48 px Open team page at the bottom. */
export function TeamStudySheet({
  open,
  onClose,
  row,
  rows,
  phases,
}: Omit<StudyProps, 'row'> & { row: RankRow | null; open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open && row !== null}
      side="bottom"
      title={row ? teamName(row) : ''}
      onClose={onClose}
      showClose
    >
      {row && (
        <div className="flex flex-col gap-2 pb-4">
          <div className="-mt-3">
            <RankLine row={row} rows={rows} />
          </div>
          <ScoringSection row={row} rows={rows} phases={phases} />
          <AvailabilitySection row={row} />
          {/* The sheet's one action, in the shared action row (Phase 1 I side task 3). */}
          <SurfaceActions className="mt-2">
            <Link to={teamPath(row.team_id)} className={actionButtonClass('secondary')}>
              Open team page
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </SurfaceActions>
        </div>
      )}
    </Sheet>
  );
}
