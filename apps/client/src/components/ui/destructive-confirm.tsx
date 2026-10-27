import { Ban, type LucideIcon } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
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
  /**
   * Why the confirm waits although nothing is in flight (offline; what goes with it not read
   * yet): only the confirm holds, Cancel and Escape still work, and this line says why. A string
   * is a quiet line; a node (the wipe's warning notice) is drawn as given.
   */
  held?: ReactNode;
  /**
   * Draw no confirm at all while held (Phase 1 I side task 3): the held node carries its own way
   * out (the device wipe's Wipe anyway…), and a greyed confirm beside it would read as a second,
   * dead copy of that action. Cancel is then the footer alone.
   */
  hideConfirm?: boolean;
  /**
   * More the confirm waits for, filled in by the caller's own fields (`children`): the device
   * wipe's lead's code. True unless given.
   */
  ready?: boolean;
  /** The caller's own fields, between the body and type-to-confirm (the wipe's lead's code). */
  children?: ReactNode;
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

/** Held, not disabled: a held button stays focusable (Cancel takes first focus while busy). */
const HELD = 'aria-disabled:pointer-events-none aria-disabled:opacity-50';

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
  held = null,
  hideConfirm = false,
  ready = true,
  children,
  error,
  onConfirm,
  onCancel,
}: DestructiveConfirmProps) {
  const id = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState('');
  const armed = (typeToConfirm === undefined || typed === typeToConfirm) && ready && !held;

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
          <Button
            ref={cancel}
            variant="secondary"
            aria-disabled={busy || undefined}
            onClick={busy ? undefined : onCancel}
            className={HELD}
          >
            {cancelLabel}
          </Button>
          {!hideConfirm && (
            <Button
              variant="destructive"
              aria-disabled={busy || !armed || undefined}
              onClick={busy || !armed ? undefined : onConfirm}
              className={HELD}
            >
              {Icon && <Icon aria-hidden="true" />}
              <span dir="auto">{confirmLabel}</span>
            </Button>
          )}
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
      {children}
      {typeToConfirm !== undefined && (
        <div>
          <label htmlFor={`${id}-type`} className="text-sm font-semibold">
            {/* THEME "Type to confirm": the phrase in mono on `--line-2`, exactly as typed. */}
            Type{' '}
            <code
              dir="auto"
              className="rounded-[4px] bg-line-2 px-[5px] py-px font-num font-semibold whitespace-pre-wrap text-ink"
            >
              {typeToConfirm}
            </code>{' '}
            to confirm
          </label>
          <input
            id={`${id}-type`}
            type="text"
            value={typed}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            dir="auto"
            onChange={(e) => setTyped(e.target.value)}
            className={cn(inputClass, 'mt-1.5')}
          />
        </div>
      )}
      {typeof held === 'string' ? held && <p className="text-sm text-muted">{held}</p> : held}
      {error && <ErrorLine>{error}</ErrorLine>}
    </ResponsiveDialog>
  );
}
