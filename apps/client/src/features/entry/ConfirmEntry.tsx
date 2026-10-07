import { useRef, type ReactNode, type RefObject } from 'react';
import { NO_VALUE, SELF_EDIT_WINDOW_MS, type RobotStatus } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { displayValue, PHASE_NAME, STATUS_LABEL, type Phase } from './phases';

const MINUTES = Math.round(SELF_EDIT_WINDOW_MS / 60_000);
const ROW = 'flex items-baseline justify-between gap-4 border-t border-line-2 px-3.5 py-2.5';

/**
 * The confirmation summary of the whole entry (SPEC-FINAL 8.2): a bottom sheet on a phone,
 * a dialog on desktop (Entry README). Every field is listed by phase; first focus is Keep
 * editing, Escape keeps editing. A failed submit keeps the sheet open and shows the reason
 * beside the buttons, in the same sticky footer, so it is in view however long the list.
 */
export function ConfirmEntry(props: {
  open: boolean;
  matchLabel: string;
  teamLabel: string;
  /** The alliance or station tag, as in the page header. */
  tag: ReactNode;
  status: RobotStatus | null;
  /** The phases to list; empty for a dead robot, which records the status only. */
  phases: readonly Phase[];
  data: Record<string, unknown>;
  /**
   * False for a lead or admin (they edit any entry at any time, SPEC-FINAL 7.6) and when
   * re-editing: the window runs from the entry's first save, so it is not "after submitting".
   */
  windowApplies: boolean;
  error: string | null;
  errorRef: RefObject<HTMLParagraphElement | null>;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  return (
    <ResponsiveDialog
      open={props.open}
      title="Confirm this entry"
      onClose={props.onBack}
      initialFocus={back}
      showClose={false}
    >
      <div className="-mt-2 text-[0.8125rem] text-muted">
        <p className="flex flex-wrap items-center gap-2 font-semibold text-ink-2">
          <span>
            {props.matchLabel} · <span dir="auto">{props.teamLabel}</span>
          </span>
          {props.tag}
        </p>
        {props.windowApplies && (
          <p>You can still edit it for {MINUTES} minutes after submitting.</p>
        )}
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-surface text-[0.84375rem]">
        <dl>
          <div className={`${ROW} border-t-0`}>
            <dt className="text-ink-2">Status</dt>
            <dd className="font-semibold text-ink">
              {props.status ? STATUS_LABEL[props.status] : NO_VALUE}
            </dd>
          </div>
        </dl>
        {props.phases.map((phase) => (
          <div key={phase.key}>
            <h3 className="px-3.5 pt-3 pb-1 text-xs font-[650] text-muted">
              {PHASE_NAME[phase.key]}
            </h3>
            <dl>
              {phase.fields.map((field) => (
                <div key={field.key} className={ROW}>
                  <dt className="text-ink-2" dir="auto">
                    {field.label}
                  </dt>
                  <dd
                    className={`text-end font-semibold text-ink ${field.type === 'counter' ? 'num' : ''}`}
                    dir="auto"
                  >
                    {displayValue(field, props.data[field.key])}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      {/* The failed-submit reason is a DIRECT child of this .sticky footer: in view, beside
          the button just pressed (EntryPage.test.tsx asserts the parent). */}
      <div className="sticky bottom-0 flex flex-col gap-3 bg-surface pt-2">
        {props.error && (
          <p
            ref={props.errorRef}
            role="alert"
            tabIndex={-1}
            dir="auto"
            className="rounded-control border border-s-[3px] border-line border-s-warn bg-surface px-3.5 py-2.5 text-sm text-ink"
          >
            <span className="font-semibold">Not saved. </span>
            {props.error}
          </p>
        )}
        <div className="flex gap-2.5">
          <Button
            ref={back}
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={props.onBack}
          >
            Keep editing
          </Button>
          <Button variant="primary" size="lg" className="flex-1" onClick={props.onSubmit}>
            Submit entry
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
