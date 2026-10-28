import { X } from 'lucide-react';
import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { SurfaceActions } from './surface-actions';
import { SurfaceFoot } from './surface-foot';
import { useModalFocus } from './useModalFocus';

export type DialogProps = {
  open: boolean;
  /** The dialog's accessible name and its heading. */
  title: string;
  onClose: () => void;
  children: ReactNode;
  /**
   * Actions, secondary first, then primary or destructive, in `SurfaceActions`: right-aligned
   * at 1024 px and up, full width with equal buttons below (Phase 1 I side task 3).
   */
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
  /**
   * A round icon centred above a centred title (entry parts, "Practice finished"; task 1.37).
   * The body lays itself out; the × is not drawn.
   */
  icon?: ReactNode;
  /**
   * A foot pinned to the dialog's bottom edge while the rest scrolls (the Review sheet's
   * buttons; Phase 1 I side task 1): `SurfaceFoot`, edge to edge, opaque down to the bottom
   * edge. Its children are laid out as a column. `footer` is the unpinned action row.
   */
  foot?: ReactNode;
  /**
   * THEME "Delete bill" (task 1.61): a dark `--ink` band drawn edge to edge above the title, the
   * damage before anything else. The dialog then has the bill's 32 px sides. Not with `foot`.
   */
  band?: ReactNode;
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
  icon,
  foot,
  band,
}: DialogProps) {
  const heading = useId();
  const body = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLElement | null>(null);
  // The × comes first in the DOM, but first focus belongs to the work in the body, then to a
  // pinned foot's actions (the body's next sibling).
  useLayoutEffect(() => {
    first.current =
      initialFocus?.current ??
      body.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      body.current?.nextElementSibling?.querySelector<HTMLElement>(FOCUSABLE) ??
      close.current;
  }, [initialFocus]);
  const { panel, onKeyDown } = useModalFocus(() => {
    if (dismissible) onClose();
  }, first);

  const head = (
    <div
      className={icon ? 'flex flex-col items-center gap-2 text-center' : 'flex items-center gap-3'}
    >
      {icon}
      <h2 id={heading} className="min-w-0 flex-1 text-xl font-[750]" dir="auto">
        {title}
      </h2>
      {showClose && !icon && (
        <button
          ref={close}
          type="button"
          aria-label="Close"
          onClick={dismissible ? onClose : undefined}
          aria-disabled={!dismissible || undefined}
          className="tap-target hover-veil motion-safe:transition motion-safe:active:not-disabled:scale-[0.97] -me-2 flex shrink-0 items-center justify-center rounded-control text-muted aria-disabled:opacity-50"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      )}
    </div>
  );
  const content = (
    <div ref={body} className="flex flex-col gap-3">
      {children}
      {footer && <SurfaceActions className="mt-2">{footer}</SurfaceActions>}
    </div>
  );

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
        className={cn(
          'motion-safe:animate-scale-in flex max-h-full max-w-full flex-col overflow-y-auto rounded-2xl bg-surface text-ink shadow-[var(--shadow-float)]',
          band
            ? 'gap-0'
            : // A pinned foot carries the bottom room itself: padding here would be a strip under
              // it that the scroller does not paint over, where scrolled content shows through.
              cn('gap-3 px-6 pt-[1.375rem]', foot ? 'pb-0' : 'pb-[1.375rem]'),
        )}
      >
        {band ? (
          <>
            <div data-band="" className="shrink-0 bg-ink px-8 pt-[1.375rem] pb-6 text-surface">
              {band}
            </div>
            <div className="flex flex-col gap-3 px-8 pt-5 pb-[1.375rem]">
              {head}
              {content}
            </div>
          </>
        ) : (
          <>
            {head}
            {content}
            {foot && (
              <SurfaceFoot scroller={panel} className="-mx-6 px-6 pt-2 pb-[1.375rem]">
                {foot}
              </SurfaceFoot>
            )}
          </>
        )}
      </div>
    </div>
  );
}
