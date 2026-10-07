import { X } from 'lucide-react';
import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from './useModalFocus';

export type DialogProps = {
  open: boolean;
  /** The dialog's accessible name and its heading. */
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Actions, right-aligned: secondary first, then primary. */
  footer?: ReactNode;
  /** Width in px (default 520); never wider than the screen. */
  width?: number;
  /** First focus goes here. Default: the first control in the body, else the footer. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** `false` holds Escape and the × (an action in flight). Default true. */
  dismissible?: boolean;
  /** Show the × at the title's end. Default true. */
  showClose?: boolean;
  /** The id of the element that describes the dialog (aria-describedby). */
  describedBy?: string;
};

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * The centred desktop dialog (THEME "Dialog (desktop)": 16 px radius, white, a float
 * shadow over the sheet scrim; title 20 px / 750 with × at the right; actions right-aligned).
 * The desktop twin of the bottom sheet; ResponsiveDialog picks between them. Escape and ×
 * close it; a tap on the scrim does not, so a half-filled form survives a stray click.
 */
export function Dialog(props: DialogProps) {
  if (!props.open) return null;
  return createPortal(<OpenDialog {...props} />, document.body);
}

function OpenDialog({
  title,
  onClose,
  children,
  footer,
  width = 520,
  initialFocus,
  dismissible = true,
  showClose = true,
  describedBy,
}: DialogProps) {
  const heading = useId();
  const body = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLElement | null>(null);
  // The × comes first in the DOM, but first focus belongs to the work in the body.
  useLayoutEffect(() => {
    first.current =
      initialFocus?.current ?? body.current?.querySelector<HTMLElement>(FOCUSABLE) ?? close.current;
  }, [initialFocus]);
  const { panel, onKeyDown } = useModalFocus(() => {
    if (dismissible) onClose();
  }, first);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[var(--scrim)] p-4">
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        data-surface="dialog"
        aria-labelledby={heading}
        aria-describedby={describedBy}
        onKeyDown={onKeyDown}
        style={{ width }}
        className="enter-scale flex max-h-full max-w-full flex-col gap-3 overflow-y-auto rounded-2xl bg-surface px-6 py-[1.375rem] text-ink shadow-[var(--shadow-float)]"
      >
        <div className="flex items-center gap-3">
          <h2 id={heading} className="min-w-0 flex-1 text-xl font-[750]" dir="auto">
            {title}
          </h2>
          {showClose && (
            <button
              ref={close}
              type="button"
              aria-label="Close"
              onClick={dismissible ? onClose : undefined}
              aria-disabled={!dismissible || undefined}
              className="tap-target state-layer press motion-transition -me-2 flex shrink-0 items-center justify-center rounded-control text-muted aria-disabled:opacity-50"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          )}
        </div>
        <div ref={body} className="flex flex-col gap-3">
          {children}
          {footer && <div className="mt-2 flex flex-wrap justify-end gap-2">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
