import { Check } from 'lucide-react';
import { useId } from 'react';
import { NO_VALUE, type FieldPhase, type RobotStatus } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { filledCount, PHASE_NAME, STATUS_LABEL, type Phase } from './phases';

const ROW = 'grid grid-cols-[22px_1fr_auto] items-center gap-2.5 border-t border-line-2 text-sm';

/** ✓ done (filled accent), a ring for the current phase, an empty ring otherwise. */
function Mark({ state }: { state: 'done' | 'current' | 'todo' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-5 place-items-center rounded-full',
        state === 'done' && 'border-[1.5px] border-accent bg-accent text-on-accent',
        state === 'current' && 'border-2 border-accent',
        state === 'todo' && 'border-[1.5px] border-control-border',
      )}
    >
      {state === 'done' && <Check className="size-[11px]" strokeWidth={3.2} />}
    </span>
  );
}

/**
 * Desktop "This entry" panel (Entry README): the status and, per phase, how many fields are
 * filled — not game totals, because forms change each season. A phase row opens its tab;
 * Review entry sits at the bottom.
 */
export function EntrySummary({
  status,
  phases,
  data,
  current,
  done,
  onPick,
  onReview,
}: {
  status: RobotStatus | null;
  /** Empty for a dead robot: it records the status only. */
  phases: readonly Phase[];
  data: Record<string, unknown>;
  current: FieldPhase;
  done: ReadonlySet<FieldPhase>;
  onPick: (phase: FieldPhase) => void;
  onReview: () => void;
}) {
  const title = useId();
  return (
    <aside
      aria-labelledby={title}
      className="self-start rounded-card border border-line bg-surface p-[18px]"
    >
      <h2 id={title} className="text-[0.9375rem] font-[650] text-ink">
        This entry
      </h2>
      <p className="mt-[3px] mb-3 text-[0.78125rem] text-muted">Select a phase to jump to it.</p>
      <div className={cn(ROW, 'py-[11px]')}>
        <Mark state={status ? 'done' : 'todo'} />
        <span>Status</span>
        <b className="font-semibold text-ink">{status ? STATUS_LABEL[status] : NO_VALUE}</b>
      </div>
      {phases.map((phase) => {
        const state = phase.key === current ? 'current' : done.has(phase.key) ? 'done' : 'todo';
        return (
          <button
            key={phase.key}
            type="button"
            aria-current={state === 'current' ? 'step' : undefined}
            onClick={() => onPick(phase.key)}
            className={cn(
              ROW,
              'state-layer min-h-12 w-full text-start',
              state === 'current' ? 'font-[650] text-ink' : 'text-ink-2',
            )}
          >
            <Mark state={state} />
            <span>{PHASE_NAME[phase.key]}</span>
            <small
              className={cn(
                'text-[0.78125rem]',
                state === 'current' ? 'font-semibold text-ink' : 'text-muted',
              )}
            >
              {`${filledCount(phase, data)} of ${phase.fields.length}`}
            </small>
          </button>
        );
      })}
      <Button
        variant="primary"
        size="block"
        className="mt-3.5 min-h-12"
        disabled={status === null}
        onClick={onReview}
      >
        Review entry
      </Button>
    </aside>
  );
}
