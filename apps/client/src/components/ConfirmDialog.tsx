import { useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Notice } from './ui/notice';
import { useModalFocus } from './ui/useModalFocus';

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

/**
 * The single destructive pattern of SPEC-FINAL 17.8. A modal with a focus trap: first
 * focus on Cancel, never on the destructive button; Escape cancels; focus returns to what
 * opened it (useModalFocus). It scales in once, and goes at once.
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
  const cancel = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState('');
  const armed = typeToConfirm === undefined || typed === typeToConfirm;
  // First focus on Cancel, never on the destructive button; Escape cancels unless busy.
  const { panel, onKeyDown } = useModalFocus(() => {
    if (!busy) onCancel();
  }, cancel);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        onKeyDown={onKeyDown}
        className="enter-scale w-full max-w-md rounded-2xl border border-border bg-surface p-6"
      >
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="mt-3 font-semibold" dir="auto">
          {objectName}
        </p>
        <div id={`${id}-body`} className="mt-2 text-sm text-text-muted">
          {body}
        </div>
        {loss && <p className="mt-3 text-sm font-medium">{loss}</p>}
        {typeToConfirm !== undefined && (
          <div className="mt-5">
            <Label htmlFor={`${id}-type`}>
              Type <span dir="auto">{typeToConfirm}</span> to confirm
            </Label>
            <Input
              id={`${id}-type`}
              type="text"
              value={typed}
              autoComplete="off"
              spellCheck={false}
              dir="auto"
              className="mt-1.5"
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        )}
        {error && (
          <Notice role="alert" tone="danger" className="mt-4">
            {error}
          </Notice>
        )}
        <div className="tap-row mt-6 flex justify-end">
          <Button ref={cancel} variant="secondary" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="destructive" disabled={busy || !armed} onClick={onConfirm}>
            <span dir="auto">{confirmLabel}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
