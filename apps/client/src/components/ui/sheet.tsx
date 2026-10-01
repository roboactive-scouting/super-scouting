import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useModalFocus } from './useModalFocus';

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  /** The dialog's accessible name, e.g. "Menu". */
  label: string;
  /** `start`: the phone nav drawer. `bottom`: a phone action sheet. */
  side?: 'start' | 'bottom';
  children: ReactNode;
};

/**
 * A modal panel over a scrim, with ConfirmDialog's focus rules (useModalFocus). It slides
 * in (M3 emphasized-decelerate) and goes at once: an exit animation would keep a closed
 * sheet in the page, and M3 lets exits be quicker than entries.
 */
export function Sheet(props: SheetProps) {
  if (!props.open) return null;
  return createPortal(<OpenSheet {...props} />, document.body);
}

function OpenSheet({ onClose, label, side = 'start', children }: SheetProps) {
  const { panel, onKeyDown } = useModalFocus(onClose);
  return (
    <div className="fixed inset-0 z-50">
      {/* A tap on the scrim closes; the keyboard has Escape and the close button. */}
      <div
        aria-hidden="true"
        data-sheet-scrim=""
        className="enter-fade absolute inset-0 bg-bg/70"
        onClick={onClose}
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn(
          'absolute flex flex-col overflow-y-auto border-border bg-surface',
          side === 'start'
            ? 'enter-drawer inset-y-0 start-0 w-[min(20rem,85vw)] border-e'
            : 'enter-sheet-up inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)]',
        )}
      >
        {children}
      </div>
    </div>
  );
}
