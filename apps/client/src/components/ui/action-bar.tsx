import type { ReactNode } from 'react';

/**
 * An entry-path screen's one primary action, pinned in the thumb zone (SPEC-FINAL 17.3;
 * THEME "Primary action bar": a white bar with a line top border and a 52 px block
 * button). Sticky, not fixed: it never covers the sidebar on a wide screen or the last
 * field of a short form, and it clears the phone's home indicator. Where the shell shows
 * its phone bottom bar, it rides on top of it (ShellLayout sets --bottom-bar).
 */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[var(--bottom-bar,0px)] z-20 -mx-4 mt-6 flex gap-2.5 border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [&>button]:min-h-13">
      {children}
    </div>
  );
}
