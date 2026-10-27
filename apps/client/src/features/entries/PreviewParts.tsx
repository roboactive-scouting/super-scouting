import { NO_VALUE, type FieldPhase } from '@frc/shared';
import { Note } from '@/components/ui/notice';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { MapRow, type MapView } from '@/features/entry/EntryAnswers';
import { PHASE_NAME, PHASE_TAB } from '@/features/entry/phases';
import { formatPoints } from './EntryParts';
import type { EntryPreview, PreviewPhase, PreviewRow } from './entryPreview';

/*
 * The entry preview's pieces (25-entry-preview final; THEME "Score band", "Answer rows with
 * points"): the score band, the answers by phase with subtotals and points, and the note that
 * stands in for the answers of a no-show or disabled robot.
 */

/** A phase heading's word: "Autonomous" … "Post-match" (a super entry's last phase is "Notes"). */
export function phaseTitle(phase: FieldPhase, kind: 'match' | 'super'): string {
  if (phase === 'post_match') return kind === 'super' ? 'Notes' : 'Post-match';
  return PHASE_NAME[phase];
}

/** The band's shades, in phase order: `--accent-ink`, `--accent`, the accent at 45 % and 25 %. */
const SHADES = [
  'bg-accent-ink',
  'bg-accent',
  'bg-[color-mix(in_srgb,var(--accent)_45%,var(--surface))]',
  'bg-[color-mix(in_srgb,var(--accent)_25%,var(--surface))]',
] as const;

/** "avg 38.4": the team's average at the event, to one place. */
export function averageText(avg: number): string {
  return `avg ${avg.toFixed(1)}`;
}

/**
 * THEME "Score band": "Where the 47 points came from" with the team's average at the right, a
 * 14 px bar split by phase (2 px gaps), and a legend with each phase's points.
 */
export function ScoreBand({
  total,
  average,
  phases,
  className,
}: {
  total: number;
  average: number | null;
  phases: readonly PreviewPhase[];
  className?: string;
}) {
  const scored = phases.filter((p) => p.subtotal !== null);
  const legend = scored.map((p, i) => ({
    name: p.phase === 'post_match' ? 'Post-match' : PHASE_TAB[p.phase],
    points: p.subtotal ?? 0,
    shade: SHADES[i % SHADES.length]!,
  }));
  return (
    <section
      aria-label="Score breakdown"
      className={cn('rounded-card border border-line bg-surface px-3.5 py-3', className)}
    >
      <div className="flex items-center gap-2 whitespace-nowrap text-[0.8125rem] font-[650] text-ink">
        <span>Where the {formatPoints(total)} points came from</span>
        <span className="flex-1" />
        {average !== null ? (
          <span className="num text-[0.8125rem] font-medium text-muted">
            {averageText(average)}
          </span>
        ) : null}
      </div>
      <div
        role="img"
        aria-label={legend.map((l) => `${l.name} ${formatPoints(l.points)}`).join(', ')}
        className="my-2 flex h-3.5 gap-0.5 overflow-hidden rounded-[4px] bg-line-2"
      >
        {legend
          .filter((l) => l.points > 0)
          .map((l) => (
            <i key={l.name} className={cn('block h-full', l.shade)} style={{ flex: l.points }} />
          ))}
      </div>
      <div aria-hidden="true" className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted">
        {legend.map((l) => (
          <span key={l.name} className="inline-flex items-center gap-1.5">
            <i className={cn('inline-block size-2.5 rounded-[2px]', l.shade)} />
            {l.name} <b className="num font-semibold text-ink">{formatPoints(l.points)}</b>
          </span>
        ))}
      </div>
    </section>
  );
}

/** "+8" in `--accent-ink`, a faint "0", or (unscored, in a scored phase) an empty cell. */
function PointsCell({ points }: { points: number | null }) {
  if (points === null) return <span aria-hidden="true" className="w-[34px] shrink-0" />;
  return (
    <span
      className={cn(
        'num w-[34px] shrink-0 text-end text-xs font-semibold',
        points === 0 ? 'text-faint' : 'text-accent-ink',
      )}
    >
      <span aria-hidden="true">{points === 0 ? '0' : `+${formatPoints(points)}`}</span>
      <span className="sr-only">
        , {formatPoints(points)} {points === 1 ? 'point' : 'points'}
      </span>
    </span>
  );
}

const ROW = 'flex min-h-[42px] items-center gap-3 border-t border-line-2 px-3.5';

function AnswerRow({
  row,
  pointsColumn,
  map,
}: {
  row: PreviewRow;
  /** The phase scores something: every row keeps the 34 px points column. */
  pointsColumn: boolean;
  map: MapView;
}) {
  const desktop = useIsDesktop();
  if (row.map) {
    const field = row.map.field;
    return (
      <MapRow
        label={row.label}
        words={row.map.words}
        verb={desktop ? 'Click' : 'Tap'}
        rowRef={map.rowRef(row.key)}
        onOpen={() => map.open(field)}
        className="gap-3"
        end={pointsColumn ? <PointsCell points={row.points} /> : undefined}
      />
    );
  }
  if (row.long) {
    return (
      <div className={cn(ROW, 'flex-col items-stretch gap-1 py-2.5')}>
        <dt className="text-ink-2" dir="auto">
          {row.label}
        </dt>
        <dd className="break-words text-start font-medium leading-[1.45] text-ink" dir="auto">
          {row.text}
        </dd>
      </div>
    );
  }
  const numeric = row.type === 'counter' || row.type === 'number' || row.type === 'computed';
  return (
    <div className={ROW}>
      <dt className="flex-1 py-2 text-ink-2" dir="auto">
        {row.label}
      </dt>
      <dd className="flex items-center gap-3 py-2">
        <span
          className={cn(
            'text-end font-[650] text-ink',
            numeric && 'num text-[0.9375rem]',
            row.text === NO_VALUE && 'font-medium text-muted',
          )}
          dir="auto"
        >
          {row.text}
        </span>
        {pointsColumn ? <PointsCell points={row.points} /> : null}
      </dd>
    </div>
  );
}

/**
 * THEME "Answer rows with points": a card of phases, each with a 12 px uppercase heading and its
 * subtotal ("14 pts") at the right, then its rows: the label, the value, the row's points. A
 * super entry's rows carry no points (`scored` false).
 */
export function PreviewAnswers({
  phases,
  kind,
  map,
  className,
}: {
  phases: readonly PreviewPhase[];
  kind: 'match' | 'super';
  map: MapView;
  className?: string;
}) {
  if (phases.length === 0) return null;
  return (
    <div
      className={cn(
        'overflow-hidden rounded-card border border-line bg-surface text-[0.875rem]',
        className,
      )}
    >
      {phases.map((phase, i) => {
        const pointsColumn = kind === 'match' && phase.subtotal !== null;
        return (
          <section key={phase.phase} className={cn(i > 0 && 'border-t border-line')}>
            <h2 className="flex items-center gap-2 px-3.5 pt-[11px] pb-1 text-xs font-[750] uppercase tracking-[0.06em] text-muted">
              {phaseTitle(phase.phase, kind)}
              <span className="flex-1" />
              {kind === 'match' && phase.subtotal !== null ? (
                <span className="num text-[0.78125rem] font-semibold normal-case tracking-normal text-ink-2">
                  {formatPoints(phase.subtotal)} pts
                </span>
              ) : null}
            </h2>
            <dl className="[&>*:first-child]:border-t-0">
              {phase.rows.map((row) => (
                <AnswerRow key={row.key} row={row} pointsColumn={pointsColumn} map={map} />
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

/**
 * A no-show or disabled robot (SPEC-FINAL 11.3): this note in place of the answers — no band,
 * no field rows, never a wall of zeros.
 */
export function DeadRobotNote({ status }: { status: 'no_show' | 'disabled' }) {
  const noShow = status === 'no_show';
  return (
    <Note className="rounded-s-none rounded-e-[12px] text-ink">
      <b className="mb-0.5 block text-[0.90625rem] font-bold">
        {noShow ? 'The robot did not show up.' : 'The robot was disabled for the match.'}
      </b>
      A {noShow ? 'no-show' : 'disabled'} entry records no field values, and the statistics leave it
      out — it is never counted as zero.
    </Note>
  );
}

/** The scored phases (left on a computer) and Post-match (right). */
export function splitPhases(entry: EntryPreview): { left: PreviewPhase[]; right: PreviewPhase[] } {
  return {
    left: entry.phases.filter((p) => p.phase !== 'post_match'),
    right: entry.phases.filter((p) => p.phase === 'post_match'),
  };
}
