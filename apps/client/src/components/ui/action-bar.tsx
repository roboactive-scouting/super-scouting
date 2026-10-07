import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * An entry-path screen's one primary action, pinned in the thumb zone (SPEC-FINAL 17.3;
 * THEME "Primary action bar": a white bar with a line top border and a 52 px block
 * button). Sticky, not fixed: it never covers the sidebar on a wide screen or the last
 * field of a short form, and it clears the phone's home indicator. Where the shell shows
 * its phone bottom bar, it rides on top of it (ShellLayout sets --bottom-bar), flush: it
 * reaches down through the room kept for the raised Scout button (--below-content) and pads
 * its own foot by that overhang so the button never covers it. On a short page it is still
 * at the bottom: the page's <main> carries `data-pinned-foot`, fills the height (ShellLayout)
 * and grows the content above the bar.
 *
 * `desktop="static"`: from `lg` the bar drops its chrome and sits in the page flow, so the
 * button stands under the content (Scout's desktop design).
 */
export function ActionBar({ children, desktop }: { children: ReactNode; desktop?: 'static' }) {
  return (
    <div
      className={cn(
        'sticky bottom-[var(--bottom-bar,0px)] z-20 -mx-4 mt-6 mb-[calc(var(--below-content,0px)*-1)] flex gap-2.5 border-t border-line bg-surface px-4 pt-3 pb-[max(calc(var(--raised-overhang,0px)+0.75rem),env(safe-area-inset-bottom))] [&>button]:min-h-13',
        desktop === 'static' &&
          'lg:static lg:mx-0 lg:mt-4 lg:mb-0 lg:border-0 lg:bg-transparent lg:p-0',
      )}
    >
      {children}
    </div>
  );
}
