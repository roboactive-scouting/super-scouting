import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/utils';

/**
 * The pinned foot of a modal surface (Phase 1 I side task 1, plan v1.29): `Sheet` and `Dialog`
 * draw it as the last child of their scroller when given a `foot`, never a page by itself. It is
 * opaque from its top edge to the surface's bottom edge: the surface keeps no bottom padding of
 * its own while a foot is pinned, and the foot carries that room (the safe-area inset, the
 * surface's bottom margin) inside its own painted box, so no answer scrolled under the buttons
 * shows through a strip below them. While content passes under it (the list is not at its end)
 * it wears a `--line` hairline on its top edge, so the edge reads as a bar, not a gap; at the end
 * of the list the hairline goes, and the last row sits wholly above the foot.
 *
 * It lays its children out as a column (`gap-3`): a failed-submit line and then the action row
 * are its direct children (the Review sheet; EntryPage.test.tsx asserts the error's parent).
 */
export function SurfaceFoot({
  scroller,
  className,
  children,
}: {
  /** The surface's scrolling element, whose end decides the hairline. */
  scroller: RefObject<HTMLElement | null>;
  /** The surface's own edge-to-edge margins and bottom room. */
  className: string;
  children: ReactNode;
}) {
  const stuck = useContentUnder(scroller);
  return (
    <div
      data-surface-foot=""
      data-stuck={stuck}
      className={cn(
        'sticky bottom-0 z-10 flex shrink-0 flex-col gap-3 bg-surface data-[stuck=true]:shadow-[0_-1px_0_var(--line)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** True while `scroller` has content below its visible end, i.e. under a foot pinned there. */
function useContentUnder(scroller: RefObject<HTMLElement | null>): boolean {
  const [under, setUnder] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // A pixel of slack: a zoomed or scaled scroller can stop a fraction short of its end.
    const measure = () => setUnder(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    // The surface or its content changing size (an error line, a font loading) moves the end.
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
      for (const child of el.children) observer.observe(child);
    }
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [scroller]);
  return under;
}
