import { createContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The one action-row rule for every sheet and dialog (Phase 1 I side task 3, plan v1.31), by
 * width, so a surface's two shapes can never disagree. Below 1024 px (the phone's bottom sheet)
 * the row is full width and its buttons share it equally; at 1024 px and above (the computer's
 * dialog) they sit right-aligned at their own widths (THEME "Dialog (desktop)"). Secondary first,
 * primary or destructive last: the caller's order.
 */
export const ACTIONS_ROW = 'flex gap-2.5 max-lg:w-full lg:flex-wrap lg:justify-end lg:gap-2';

/**
 * The row below 1024 px when a label would not fit its equal share on one line: the buttons stack,
 * full width, one per line, in the caller's order, so the primary or destructive one is at the
 * bottom. A label never wraps.
 */
export const ACTIONS_STACKED = 'max-lg:flex-col';

/**
 * Every button in the row, one size by width: 52 px with equal widths below 1024 px (the phone's
 * action size, THEME "Primary action bar"), the 44 px `md` button at 1024 px and above. The label
 * stays on one line (the button's own `whitespace-nowrap`); a row whose labels do not fit stacks
 * (`ACTIONS_STACKED`). `Button` adds it by itself inside `SurfaceActions`; a link drawn as a
 * button takes it through `actionButtonClass`.
 */
export const ACTION_BUTTON =
  'max-lg:min-h-[52px] max-lg:min-w-0 max-lg:flex-1 max-lg:px-3 max-lg:text-base';

/** True inside a `SurfaceActions` row: `Button` takes the row's one size. */
export const InActionRow = createContext(false);

/**
 * Whether `count` buttons, the widest needing `need` px on one line, fit side by side in a `width`
 * px row with `gap` px between them. Half a pixel of slack: a measured text width is fractional.
 */
export function fitsInRow(need: number, count: number, width: number, gap: number): boolean {
  if (count <= 1) return true;
  return need <= (width - (count - 1) * gap) / count + 0.5;
}

/**
 * The width a button needs for its label on one line, measured on the button itself at the live
 * font and text size: laid out at `max-content` for the read, then put back before paint.
 */
function oneLineWidth(el: HTMLElement): number {
  const { width, flex, maxWidth } = el.style;
  el.style.width = 'max-content';
  el.style.flex = 'none';
  el.style.maxWidth = 'none';
  const need = el.getBoundingClientRect().width;
  el.style.width = width;
  el.style.flex = flex;
  el.style.maxWidth = maxWidth;
  return need;
}

/**
 * A sheet's or dialog's action row. `Dialog` and `ResponsiveDialog` draw their `footer` in it; a
 * pinned `foot` (the Review sheet) or an action row in the content (the held wipe's ways out, a
 * form's Cancel · Save) uses it directly. Never a `flex` row of its own.
 *
 * Measured, not guessed (as `OptionButtons` drops columns): each button's one-line width against
 * its equal share of the row. When any label would not fit, the row stacks below 1024 px
 * (`data-stacked`). A ResizeObserver on the row and its buttons re-measures as the sheet, a
 * label, the font or the text size changes; the one-line width does not depend on the layout, so
 * stacking never feeds back into the measure.
 */
export function SurfaceActions({
  className,
  children,
}: {
  /** Spacing from what is above (`mt-…`) only; the layout is the rule's. */
  className?: string;
  children: ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => {
      const width = el.getBoundingClientRect().width;
      // A row with no width (a hidden surface, a stacked column's own box) keeps its answer.
      if (width <= 0) return;
      const buttons = [...el.children].filter((c): c is HTMLElement => c instanceof HTMLElement);
      const need = Math.max(0, ...buttons.map(oneLineWidth));
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      setStacked(!fitsInRow(need, buttons.length, width, gap));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const c of el.children) observer.observe(c);
    return () => observer.disconnect();
  });
  return (
    <InActionRow.Provider value>
      <div
        ref={row}
        data-surface-actions=""
        data-stacked={stacked}
        className={cn(ACTIONS_ROW, stacked && ACTIONS_STACKED, className)}
      >
        {children}
      </div>
    </InActionRow.Provider>
  );
}
