import { Maximize2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  NO_VALUE,
  SELF_EDIT_WINDOW_MS,
  type FormFieldDefinition,
  type RobotStatus,
} from '@frc/shared';
import { Button } from '@/components/ui/button';
import { ErrorLine } from '@/components/ui/notice';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { MapFieldView } from './lazyParts';
import { mapCount, opensMap } from './map/mapField';
import { displayValue, PHASE_NAME, STATUS_LABEL, type Phase } from './phases';

const MINUTES = Math.round(SELF_EDIT_WINDOW_MS / 60_000);
const ROW = 'flex items-baseline justify-between gap-4 border-t border-line-2 px-3.5 py-2.5';

/**
 * The confirmation summary of the whole entry (SPEC-FINAL 8.2): a bottom sheet on a phone,
 * a dialog on desktop (Entry README). Every field is listed by phase; first focus is Keep
 * editing, Escape keeps editing. A failed submit keeps the sheet open and shows the reason
 * beside the buttons, in the same sticky footer, so it is in view however long the list.
 *
 * A map field (position, cycle path, an event log that asks where) is one compact row like the
 * others (UF.24; SPEC-FINAL 8.2 v1.30): its name, what it holds in the map button's words
 * (`mapCount`) and Tap to view, the whole row one button; no picture of the field, so a long form
 * stays short. It opens the field's map view only (`MapFieldView`), over this sheet; Close puts
 * focus back on the row and the sheet is as it was. An empty one is a plain row with "—".
 *
 * In practice (UF.26; SPEC-FINAL 8.5) it is the same summary: the edit-window line is "Practice ·
 * nothing is saved or sent." and the primary button reads Finish practice.
 */
export function ConfirmEntry(props: {
  open: boolean;
  /** Default "Confirm this entry"; the super entry asks "Submit the super entry?". */
  title?: string;
  matchLabel?: string;
  teamLabel?: string;
  /** The alliance or station tag, as in the page header. */
  tag?: ReactNode;
  /** In place of the "Q12 · 2096 RobActive" line and tag: the super entry's own line. */
  summary?: ReactNode;
  status: RobotStatus | null;
  /** False on the super entry: it has no robot status (SPEC-FINAL 8.1). */
  showStatus?: boolean;
  /** The phases to list; empty for a dead robot, which records the status only. */
  phases: readonly Phase[];
  data: Record<string, unknown>;
  /**
   * False for a lead or admin (they edit any entry at any time, SPEC-FINAL 7.6) and when
   * re-editing: the window runs from the entry's first save, so it is not "after submitting".
   */
  windowApplies: boolean;
  /** Practice mode: the line says nothing is saved and the primary button is Finish practice. */
  practice?: boolean;
  error: string | null;
  errorRef: RefObject<HTMLDivElement | null>;
  /** A submit is in flight: Submit is disabled so a second tap cannot write a second entry. */
  submitting?: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  const showStatus = props.showStatus ?? true;
  const desktop = useIsDesktop();
  // The map field open view only, and the row to put focus back on when it closes.
  const [viewing, setViewing] = useState<FormFieldDefinition | null>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const returnTo = useRef<string | null>(null);
  useEffect(() => {
    if (viewing || returnTo.current === null) return;
    rows.current.get(returnTo.current)?.focus();
    returnTo.current = null;
  }, [viewing]);
  // The sheet closing (a submit, Keep editing) closes the map with it.
  if (!props.open && viewing) setViewing(null);

  function row(field: FormFieldDefinition) {
    const value = props.data[field.key];
    const words = mapCount(field, value);
    if (words && opensMap(field)) {
      return (
        <MapRow
          key={field.key}
          label={field.label}
          words={words}
          verb={desktop ? 'Click' : 'Tap'}
          rowRef={(el) => {
            if (el) rows.current.set(field.key, el);
            else rows.current.delete(field.key);
          }}
          onOpen={() => {
            returnTo.current = field.key;
            setViewing(field);
          }}
        />
      );
    }
    const isMapType =
      field.type === 'position' || field.type === 'cycle_path' || field.type === 'event_log';
    return (
      <div key={field.key} className={ROW}>
        <dt className="text-ink-2" dir="auto">
          {field.label}
        </dt>
        <dd
          className={`text-end font-semibold text-ink ${field.type === 'counter' ? 'num' : ''}`}
          dir="auto"
        >
          {/* An event log that never asks where reads "5 events"; an empty map field "—". */}
          {isMapType ? (words ?? NO_VALUE) : displayValue(field, value)}
        </dd>
      </div>
    );
  }

  return (
    <>
      <ResponsiveDialog
        open={props.open}
        title={props.title ?? 'Confirm this entry'}
        onClose={props.onBack}
        initialFocus={back}
        showClose={false}
      >
        <div className="-mt-2 text-[0.8125rem] text-muted">
          {props.summary ?? (
            <p className="flex flex-wrap items-center gap-2 font-semibold text-ink-2">
              <span>
                {props.matchLabel} · <span dir="auto">{props.teamLabel}</span>
              </span>
              {props.tag}
            </p>
          )}
          {props.practice ? (
            <p>Practice · nothing is saved or sent.</p>
          ) : (
            props.windowApplies && (
              <p>You can still edit it for {MINUTES} minutes after submitting.</p>
            )
          )}
        </div>
        <div className="overflow-hidden rounded-card border border-line bg-surface text-[0.84375rem]">
          {showStatus && (
            <dl>
              <div className={`${ROW} border-t-0`}>
                <dt className="text-ink-2">Status</dt>
                <dd className="font-semibold text-ink">
                  {props.status ? STATUS_LABEL[props.status] : NO_VALUE}
                </dd>
              </div>
            </dl>
          )}
          {props.phases.map((phase, i) => (
            <div
              key={phase.key}
              className={!showStatus && i > 0 ? 'border-t border-line-2' : undefined}
            >
              <h3 className="px-3.5 pt-3 pb-1 text-xs font-[650] text-muted">
                {PHASE_NAME[phase.key]}
              </h3>
              <dl>{phase.fields.filter((field) => field.type !== 'section').map(row)}</dl>
            </div>
          ))}
        </div>
        {/* The failed-submit reason is a DIRECT child of this .sticky footer: in view, beside
          the button just pressed (EntryPage.test.tsx asserts the parent). */}
        <div className="sticky bottom-0 flex flex-col gap-3 bg-surface pt-2">
          {props.error && (
            <ErrorLine ref={props.errorRef} focusable>
              Not saved. {props.error}
            </ErrorLine>
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
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              busy={props.submitting}
              onClick={props.onSubmit}
            >
              {props.practice ? 'Finish practice' : 'Submit entry'}
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
      {/* Beside the sheet, not in it: its keys, taps and drags stay the map's own. */}
      {props.open && viewing && (
        <MapFieldView
          field={viewing}
          value={props.data[viewing.key]}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}

/**
 * A map field's row (UF.24): the name at the left; at the right what it holds, in `--ink` 600,
 * over "⤢ Tap to view" in `--accent-ink`. The whole row is the button (≥ 48 px), named
 * "Teleop events: 5 events · 4 on the map"; the name is the list's term for a screen reader.
 */
function MapRow({
  label,
  words,
  verb,
  rowRef,
  onOpen,
}: {
  label: string;
  words: string;
  verb: 'Tap' | 'Click';
  rowRef: (el: HTMLButtonElement | null) => void;
  onOpen: () => void;
}) {
  const hint = useId();
  return (
    <div className="border-t border-line-2">
      <dt className="sr-only" dir="auto">
        {label}
      </dt>
      <dd>
        <button
          ref={rowRef}
          type="button"
          aria-label={`${label}: ${words}`}
          aria-describedby={hint}
          onClick={onOpen}
          className="tap-target hover-veil flex w-full items-center justify-between gap-4 px-3.5 py-2.5 text-start"
        >
          <span aria-hidden="true" className="text-ink-2" dir="auto">
            {label}
          </span>
          <span className="flex flex-col items-end text-end">
            <span aria-hidden="true" className="font-semibold text-ink">
              {words}
            </span>
            <span
              id={hint}
              className="mt-0.5 inline-flex items-center gap-1 text-[0.78125rem] font-[650] text-accent-ink"
            >
              <Maximize2 aria-hidden="true" className="size-3.5" />
              {verb} to view
            </span>
          </span>
        </button>
      </dd>
    </div>
  );
}
