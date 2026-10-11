import { Check } from 'lucide-react';
import { useId } from 'react';
import { NO_VALUE, type FieldPhase, type RobotStatus } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { filledCount, PHASE_NAME, scoutedFields, STATUS_LABEL, type Phase } from './phases';

const ROW = 'grid grid-cols-[22px_1fr_auto] items-center gap-2.5 border-t border-line-2 text-sm';

type MarkState = 'done' | 'current' | 'todo' | 'fix';

/**
 * ✓ done (filled accent), a ring for the current phase, an empty ring otherwise, and an amber
 * ring on `--warn-tint` for a phase holding something to fix (entry parts desktop, task 1.36).
 */
function Mark({ state }: { state: MarkState }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-5 place-items-center rounded-full',
        state === 'done' && 'border-[1.5px] border-accent bg-accent text-on-accent',
        state === 'current' && 'border-2 border-accent',
        state === 'todo' && 'border-[1.5px] border-control-border',
        state === 'fix' && 'border-2 border-warn bg-warn-tint',
      )}
    >
      {state === 'done' && <Check className="size-[11px]" strokeWidth={3.2} />}
    </span>
  );
}

/**
 * Desktop "This entry" panel (Entry README): the status and, per phase, how many fields are
 * filled — not game totals, because forms change each season. A phase row opens its tab;
 * Review entry sits at the bottom. A phase with a problem (`toFix`) gets the amber ring and
 * "1 to fix" in place of its count (entry parts, "Range block and required fields").
 */
export function EntrySummary({
  status,
  showStatus = true,
  phases,
  data,
  current,
  done,
  toFix,
  onPick,
  onReview,
  reviewDisabled,
}: {
  status: RobotStatus | null;
  /** False on the super entry, which has no robot status (SPEC-FINAL 8.1). */
  showStatus?: boolean;
  /** Empty for a dead robot: it records the status only. */
  phases: readonly Phase[];
  data: Record<string, unknown>;
  current: FieldPhase;
  done: ReadonlySet<FieldPhase>;
  /** Problems marked on the form, per phase (`'status'`: the breakdown time). */
  toFix?: ReadonlyMap<FieldPhase | 'status', number>;
  onPick: (phase: FieldPhase) => void;
  onReview: () => void;
  /** Default: no status chosen yet. */
  reviewDisabled?: boolean;
}) {
  const title = useId();
  const statusFix = toFix?.get('status') ?? 0;
  return (
    <aside
      aria-labelledby={title}
      className="self-start rounded-card border border-line bg-surface p-[18px]"
    >
      <h2 id={title} className="text-[0.9375rem] font-[650] text-ink">
        This entry
      </h2>
      <p className="mt-[3px] mb-3 text-[0.78125rem] text-muted">Select a phase to jump to it.</p>
      {showStatus && (
        <div className={cn(ROW, 'py-[11px]')}>
          <Mark state={statusFix > 0 ? 'fix' : status ? 'done' : 'todo'} />
          <span>Status</span>
          <b className="font-semibold text-ink">{status ? STATUS_LABEL[status] : NO_VALUE}</b>
        </div>
      )}
      {phases.map((phase) => {
        const fix = toFix?.get(phase.key) ?? 0;
        const state: MarkState =
          fix > 0
            ? 'fix'
            : phase.key === current
              ? 'current'
              : done.has(phase.key)
                ? 'done'
                : 'todo';
        return (
          <button
            key={phase.key}
            type="button"
            aria-current={phase.key === current ? 'step' : undefined}
            onClick={() => onPick(phase.key)}
            className={cn(
              ROW,
              'hover-veil min-h-12 w-full text-start',
              phase.key === current ? 'font-[650] text-ink' : 'text-ink-2',
            )}
          >
            <Mark state={state} />
            <span>{PHASE_NAME[phase.key]}</span>
            <small
              className={cn(
                'text-[0.78125rem]',
                fix > 0
                  ? 'font-bold text-warn'
                  : phase.key === current
                    ? 'font-semibold text-ink'
                    : 'text-muted',
              )}
            >
              {fix > 0
                ? `${fix} to fix`
                : `${filledCount(phase, data)} of ${scoutedFields(phase).length}`}
            </small>
          </button>
        );
      })}
      <Button
        variant="primary"
        size="block"
        className="mt-3.5 min-h-12"
        disabled={reviewDisabled ?? status === null}
        onClick={onReview}
      >
        Review entry
      </Button>
    </aside>
  );
}
