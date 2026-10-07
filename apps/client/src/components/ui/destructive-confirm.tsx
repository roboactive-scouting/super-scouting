import { Ban, type LucideIcon } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { inputClass } from './input';
import { ErrorLine } from './notice';
import { ResponsiveDialog } from './responsive-dialog';

export type DestructiveConfirmProps = {
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
  /** The confirm button's icon: Ban unless given; `null` for none ("Leave anyway"). */
  icon?: LucideIcon | null;
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
 * The single destructive pattern of SPEC-FINAL 17.8 (THEME "Destructive confirmation"):
 * the title as a question, the object's name in bold, the body, then Cancel and a filled
 * `--ink` confirm button that names the object. Never red: red is the red alliance. A
 * dialog at 1024 px and wider, a bottom sheet below. First focus on Cancel, never on the
 * destructive button; Escape cancels; focus returns to what opened it (useModalFocus).
 */
export function DestructiveConfirm(props: DestructiveConfirmProps) {
  if (!props.open) return null;
  return <OpenConfirm {...props} />;
}

const BUTTON =
  'tap-target hover-veil motion-safe:transition motion-safe:active:not-disabled:scale-[0.97] inline-flex items-center justify-center gap-2 rounded-control px-4 font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-50';

function OpenConfirm({
  title,
  objectName,
  body,
  loss,
  confirmLabel,
  cancelLabel = 'Cancel',
  icon: Icon = Ban,
  typeToConfirm,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: DestructiveConfirmProps) {
  const id = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState('');
  const armed = typeToConfirm === undefined || typed === typeToConfirm;

  return (
    <ResponsiveDialog
      open
      title={title}
      onClose={onCancel}
      dismissible={!busy}
      showClose={false}
      initialFocus={cancel}
      describedBy={`${id}-body`}
      width={460}
      footer={
        <>
          <button
            ref={cancel}
            type="button"
            aria-disabled={busy || undefined}
            onClick={busy ? undefined : onCancel}
            className={`${BUTTON} border border-control-border bg-surface text-ink`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            aria-disabled={busy || !armed || undefined}
            onClick={busy || !armed ? undefined : onConfirm}
            className={`${BUTTON} border border-ink bg-ink text-surface`}
          >
            {Icon && <Icon aria-hidden="true" className="size-5 shrink-0" />}
            <span dir="auto">{confirmLabel}</span>
          </button>
        </>
      }
    >
      <p className="font-bold" dir="auto">
        {objectName}
      </p>
      <div id={`${id}-body`} className="text-sm text-ink-2">
        {body}
      </div>
      {loss && <p className="text-sm font-semibold">{loss}</p>}
      {typeToConfirm !== undefined && (
        <div>
          <label htmlFor={`${id}-type`} className="text-sm font-semibold">
            Type <span dir="auto">{typeToConfirm}</span> to confirm
          </label>
          <input
            id={`${id}-type`}
            type="text"
            value={typed}
            autoComplete="off"
            spellCheck={false}
            dir="auto"
            onChange={(e) => setTyped(e.target.value)}
            className={cn(inputClass, 'mt-1.5')}
          />
        </div>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </ResponsiveDialog>
  );
}
