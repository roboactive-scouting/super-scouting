import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * A short-lived line with one action, e.g. "Match timer reset · Undo" (entry parts, the sticky
 * match timer; task 1.34). `--ink` with white text and a bold light action at the right; it
 * goes by itself after `timeoutMs`, so the undo is only offered while it is fresh. Polite live
 * region: a screen reader hears it without losing its place. Placed by `className` (fixed
 * position), above the page's pinned action bar on a phone.
 */
export function Toast({
  open,
  message,
  action,
  onDismiss,
  timeoutMs = 8_000,
  className,
}: {
  open: boolean;
  message: string;
  action: { label: string; onClick: () => void };
  onDismiss: () => void;
  timeoutMs?: number;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(onDismiss, timeoutMs);
    return () => clearTimeout(id);
  }, [open, onDismiss, timeoutMs]);
  if (!open) return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'motion-safe:animate-rise-in fixed z-40 flex items-center gap-2.5 rounded-[10px] bg-ink ps-3.5 pe-1.5 text-sm text-surface shadow-[var(--shadow-float)]',
        className,
      )}
    >
      <span className="min-w-0 flex-1 py-3" dir="auto">
        {message}
      </span>
      <button
        type="button"
        onClick={() => {
          action.onClick();
          onDismiss();
        }}
        className="tap-target hover-veil shrink-0 rounded-control px-2.5 font-bold text-accent-tint"
      >
        {action.label}
      </button>
    </div>,
    document.body,
  );
}
