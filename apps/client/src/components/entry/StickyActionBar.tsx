import type { ReactNode } from 'react';

/**
 * An entry-path screen's one primary action, pinned in the thumb zone (SPEC-FINAL 17.3).
 * Sticky, not fixed: it never covers the sidebar on a wide screen or the last field of a
 * short form, and it clears the phone's home indicator.
 */
export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-border bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}
