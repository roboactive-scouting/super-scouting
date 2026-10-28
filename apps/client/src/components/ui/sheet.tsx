import { X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useDragDismiss } from './drag-dismiss';
import { SurfaceFoot } from './surface-foot';
import { useModalFocus, type InitialFocus } from './useModalFocus';

export type SheetProps = {
  open: boolean;
  /** The sheet's accessible name, shown as its heading. */
  title: string;
  onClose: () => void;
  /** `start`: the phone menu. `bottom`: a phone action sheet. */
  side?: 'start' | 'bottom';
  children: ReactNode;
  /** Width of a `start` sheet in px (default 252, never wider than 85 vw). */
  width?: number;
  /** `dark` is the phone menu on `--rail`; `light` is everything else. */
  tone?: 'light' | 'dark';
  /**
   * First focus goes here instead of the first focusable element. `'panel'` focuses the sheet
   * itself, so nothing inside is focused (no keyboard on a sheet of text fields).
   */
  initialFocus?: InitialFocus;
  /** `false` holds Escape and the scrim tap (an action in flight). Default true. */
  dismissible?: boolean;
  /** The id of the element that describes the sheet (aria-describedby). */
  describedBy?: string;
  /** A bottom sheet's ✕ at the title's end. Default false: the finals draw only the handle. */
  showClose?: boolean;
  /**
   * Drag to dismiss (UF.4): a bottom sheet down, the menu toward its edge. Default true; it
   * holds while not dismissible.
   */
  dragToClose?: boolean;
  /** A bottom sheet's round icon, centred above a centred title (as Dialog's `icon`). */
  icon?: ReactNode;
  /**
   * A foot pinned to the sheet's bottom edge while the rest scrolls (the Review sheet's buttons;
   * Phase 1 I side task 1): `SurfaceFoot`, edge to edge, opaque down to the bottom edge, the
   * safe-area inset inside it. Its children are laid out as a column.
   */
  foot?: ReactNode;
  /**
   * A bottom sheet's THEME "Delete bill" (task 1.61): a dark `--ink` band edge to edge at the top,
   * the grab handle inside it, then the title on white. The band is the drag handle.
   */
  band?: ReactNode;
};

/**
 * A modal panel over a scrim, with useModalFocus's rules (focus trap, Escape, focus
 * returned to the opener). THEME "Bottom sheet": a dark scrim, white sheet with 20 px top
 * corners, a grab handle and an upward shadow; a `start` sheet is the phone menu. It slides
 * in and goes at once: an exit animation would keep a closed sheet in the page. A drag
 * toward its edge closes it the same way (useDragDismiss), finishing its slide first.
 */
export function Sheet(props: SheetProps) {
  if (!props.open) return null;
  return createPortal(<OpenSheet {...props} />, document.body);
}

function OpenSheet({
  onClose,
  side = 'start',
  children,
  width = 252,
  tone = 'light',
  initialFocus,
  dismissible = true,
  describedBy,
  title,
  showClose = false,
  dragToClose = true,
  icon,
  foot,
  band,
}: SheetProps) {
  const heading = useId();
  const close = () => {
    if (dismissible) onClose();
  };
  const { panel, onKeyDown } = useModalFocus(close, initialFocus);
  const bottom = side === 'bottom';
  const drag = useDragDismiss(panel, {
    edge: bottom ? 'bottom' : 'start',
    enabled: dragToClose && dismissible,
    onDismiss: close,
  });
  return (
    <div className="fixed inset-0 z-50">
      {/* A tap on the scrim closes; the keyboard has Escape and the close button. */}
      <div
        aria-hidden="true"
        data-sheet-scrim=""
        className="motion-safe:animate-fade-in absolute inset-0 bg-[var(--scrim)]"
        onClick={close}
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        data-surface="sheet"
        {...(bottom ? { 'aria-labelledby': heading } : { 'aria-label': title })}
        aria-describedby={describedBy}
        onKeyDown={onKeyDown}
        {...drag}
        style={bottom ? undefined : { width: `min(${width / 16}rem, 85vw)` }}
        className={cn(
          'absolute flex flex-col overflow-y-auto overscroll-contain',
          // A pinned foot carries the bottom room itself: padding here would be a strip under
          // it that the scroller does not paint over, where scrolled content shows through.
          bottom && (foot ? 'pb-0' : 'pb-[env(safe-area-inset-bottom)]'),
          bottom
            ? cn(
                'motion-safe:animate-sheet-up inset-x-0 bottom-0 max-h-[86dvh] rounded-t-[20px] bg-surface px-4 text-ink shadow-[var(--shadow-sheet)]',
                band ? 'pt-0' : 'pt-2.5',
              )
            : cn(
                'motion-safe:animate-drawer-in inset-y-0 start-0 touch-pan-y border-e',
                tone === 'dark'
                  ? 'border-rail-line bg-rail text-rail-ink'
                  : 'border-line bg-surface text-ink',
              ),
        )}
      >
        {bottom && band && (
          <>
            {/* The band is the handle: a drag on it pulls the sheet down even when scrolled. */}
            <div
              data-drag-handle=""
              data-band=""
              className="-mx-4 shrink-0 touch-none bg-ink px-5 pt-2.5 pb-5 text-surface"
            >
              <div
                aria-hidden="true"
                className="mx-auto mb-3.5 h-1 w-10 rounded-sm bg-rail-muted"
              />
              {band}
            </div>
            <h2 id={heading} className="mt-[1.125rem] mb-1.5 text-lg font-[750]" dir="auto">
              {title}
            </h2>
          </>
        )}
        {bottom && !band && (
          // The handle and the title: a drag here pulls the sheet down even when scrolled.
          <div data-drag-handle="" className="touch-none">
            <div aria-hidden="true" className="mx-auto mb-3 h-[5px] w-10 rounded-sm bg-line" />
            <div
              className={cn(
                'mb-3 flex gap-3',
                icon ? 'flex-col items-center gap-2 text-center' : 'items-center',
              )}
            >
              {icon}
              <h2 id={heading} className="min-w-0 flex-1 text-xl font-[750]" dir="auto">
                {title}
              </h2>
              {showClose && !icon && (
                <button
                  type="button"
                  aria-label="Close"
                  onClick={dismissible ? onClose : undefined}
                  aria-disabled={!dismissible || undefined}
                  className="tap-target hover-veil motion-safe:transition motion-safe:active:not-disabled:scale-[0.97] -my-2.5 -me-2 flex shrink-0 items-center justify-center rounded-control text-muted aria-disabled:opacity-50"
                >
                  <X aria-hidden="true" className="size-5" />
                </button>
              )}
            </div>
          </div>
        )}
        {children}
        {foot && (
          <SurfaceFoot
            scroller={panel}
            className={cn(
              'pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]',
              bottom ? '-mx-4 px-4' : 'px-4',
            )}
          >
            {foot}
          </SurfaceFoot>
        )}
      </div>
    </div>
  );
}
