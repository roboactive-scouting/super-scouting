import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DESTRUCTIVE_BUTTON, FIELD, SECONDARY_BUTTON } from './buttonStyles';

export type ConfirmDialogProps = {
  open: boolean;
  /** The question, e.g. "Disable this account?". It is the dialog's accessible name. */
  title: string;
  /** The thing acted on, named in full (SPEC-FINAL 17.8). May be Hebrew. */
  objectName: string;
  /** What happens, in a sentence or two. */
  body: ReactNode;
  /** What is lost, as a count, where there is one: "This deletes 4 entries." */
  loss?: string;
  /** The destructive verb and its object: "Disable Dana Cohen". Never "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  /**
   * Type-to-confirm: the primary button waits until exactly this is typed. Only for
   * multi-record irreversibles — a season, a form version, wiping device data
   * (SPEC-FINAL 17.8). A single record gets the plain confirm.
   */
  typeToConfirm?: string;
  /** The action is in flight: both buttons hold, Escape does nothing. */
  busy?: boolean;
  /** A sentence to show inside the dialog when the action failed. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * The single destructive pattern of SPEC-FINAL 17.8. A modal with a focus trap: first
 * focus on Cancel, never on the destructive button; Escape cancels; focus returns to what
 * opened it. Not a native <dialog>: jsdom has no `showModal`, and the tests must exercise
 * the same focus rules the app ships.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  if (!props.open) return null;
  return createPortal(<OpenDialog {...props} />, document.body);
}

function OpenDialog({
  title,
  objectName,
  body,
  loss,
  confirmLabel,
  cancelLabel = 'Cancel',
  typeToConfirm,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState('');
  const armed = typeToConfirm === undefined || typed === typeToConfirm;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    return () => {
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!busy) onCancel();
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)]/80 p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        onKeyDown={onKeyDown}
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
      >
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="mt-3 font-semibold" dir="auto">
          {objectName}
        </p>
        <div id={`${id}-body`} className="mt-2 text-[var(--text-muted)]">
          {body}
        </div>
        {loss && <p className="mt-2 font-medium">{loss}</p>}
        {typeToConfirm !== undefined && (
          <div className="mt-4">
            <label htmlFor={`${id}-type`} className="block text-sm font-medium">
              Type <span dir="auto">{typeToConfirm}</span> to confirm
            </label>
            <input
              id={`${id}-type`}
              type="text"
              value={typed}
              autoComplete="off"
              spellCheck={false}
              dir="auto"
              className={`${FIELD} mt-1`}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        )}
        {error && (
          <p
            role="alert"
            dir="auto"
            className="mt-4 rounded-lg border-2 border-[var(--danger)] p-3 text-sm"
          >
            {error}
          </p>
        )}
        <div className="tap-row mt-6 flex justify-end">
          <button
            ref={cancel}
            type="button"
            className={SECONDARY_BUTTON}
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={DESTRUCTIVE_BUTTON}
            disabled={busy || !armed}
            onClick={onConfirm}
          >
            <span dir="auto">{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
