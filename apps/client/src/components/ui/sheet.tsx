import { useId, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useModalFocus } from './useModalFocus';

type SheetBase = {
  open: boolean;
  onClose: () => void;
  /** `start`: the phone menu. `bottom`: a phone action sheet. */
  side?: 'start' | 'bottom';
  children: ReactNode;
  /** Width of a `start` sheet in px (default 252, never wider than 85 vw). */
  width?: number;
  /** `dark` is the phone menu on `--rail`; `light` is everything else. */
  tone?: 'light' | 'dark';
  /** First focus goes here instead of the first focusable element. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** `false` holds Escape and the scrim tap (an action in flight). Default true. */
  dismissible?: boolean;
  /** The id of the element that describes the sheet (aria-describedby). */
  describedBy?: string;
};

/** The sheet's accessible name: `title`, or `label` (today's name for it, until RB.18). */
export type SheetProps = SheetBase &
  ({ title: string; label?: never } | { label: string; title?: never });

/**
 * A modal panel over a scrim, with useModalFocus's rules (focus trap, Escape, focus
 * returned to the opener). THEME "Bottom sheet": a dark scrim, white sheet with 20 px top
 * corners, a grab handle and an upward shadow; a `start` sheet is the phone menu. It slides
 * in (M3 emphasized-decelerate) and goes at once: an exit animation would keep a closed
 * sheet in the page, and M3 lets exits be quicker than entries.
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
  ...name
}: SheetProps) {
  const heading = useId();
  const title = name.title ?? name.label;
  const close = () => {
    if (dismissible) onClose();
  };
  const { panel, onKeyDown } = useModalFocus(close, initialFocus);
  const bottom = side === 'bottom';
  return (
    <div className="fixed inset-0 z-50">
      {/* A tap on the scrim closes; the keyboard has Escape and the close button. */}
      <div
        aria-hidden="true"
        data-sheet-scrim=""
        className="enter-fade absolute inset-0 bg-[var(--scrim)]"
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
        style={bottom ? undefined : { width: `min(${width / 16}rem, 85vw)` }}
        className={cn(
          'absolute flex flex-col overflow-y-auto',
          bottom
            ? 'enter-sheet-up inset-x-0 bottom-0 max-h-[86dvh] rounded-t-[20px] bg-surface px-4 pt-2.5 pb-[env(safe-area-inset-bottom)] text-ink shadow-[var(--shadow-sheet)]'
            : cn(
                'enter-drawer inset-y-0 start-0 border-e',
                tone === 'dark'
                  ? 'border-rail-line bg-rail text-rail-ink'
                  : 'border-line bg-surface text-ink',
              ),
        )}
      >
        {bottom && (
          <>
            <div aria-hidden="true" className="mx-auto mb-3 h-[5px] w-10 rounded-sm bg-line" />
            <h2 id={heading} className="mb-3 text-xl font-[750]" dir="auto">
              {title}
            </h2>
          </>
        )}
        {children}
      </div>
    </div>
  );
}
