import { useRef, type ReactNode, type RefObject } from 'react';
import { SELF_EDIT_WINDOW_MS, type RobotStatus } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { ErrorLine } from '@/components/ui/notice';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { EntryAnswers, useMapView } from './EntryAnswers';
import { MapFieldView } from './lazyParts';
import type { Phase } from './phases';

const MINUTES = Math.round(SELF_EDIT_WINDOW_MS / 60_000);

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
  // The map field open view only, and the row to put focus back on when it closes.
  const map = useMapView();
  // The sheet closing (a submit, Keep editing) closes the map with it.
  if (!props.open && map.viewing) map.close();

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
        <EntryAnswers
          phases={props.phases}
          data={props.data}
          status={showStatus ? props.status : undefined}
          map={map}
        />
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
      {props.open && map.viewing && (
        <MapFieldView field={map.viewing} value={props.data[map.viewing.key]} onClose={map.close} />
      )}
    </>
  );
}
