import { X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useDragDismiss } from './drag-dismiss';
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
          bottom
            ? 'motion-safe:animate-sheet-up inset-x-0 bottom-0 max-h-[86dvh] rounded-t-[20px] bg-surface px-4 pt-2.5 pb-[env(safe-area-inset-bottom)] text-ink shadow-[var(--shadow-sheet)]'
            : cn(
                'motion-safe:animate-drawer-in inset-y-0 start-0 touch-pan-y border-e',
                tone === 'dark'
                  ? 'border-rail-line bg-rail text-rail-ink'
                  : 'border-line bg-surface text-ink',
              ),
        )}
      >
        {bottom && (
          // The handle and the title: a drag here pulls the sheet down even when scrolled.
          <div data-drag-handle="" className="touch-none">
            <div aria-hidden="true" className="mx-auto mb-3 h-[5px] w-10 rounded-sm bg-line" />
            <div className="mb-3 flex items-center gap-3">
              <h2 id={heading} className="min-w-0 flex-1 text-xl font-[750]" dir="auto">
                {title}
              </h2>
              {showClose && (
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
      </div>
    </div>
  );
}
