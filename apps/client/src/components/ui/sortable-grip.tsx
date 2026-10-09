import type { useSortable } from '@dnd-kit/sortable';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The part of a `useSortable()` result the grip needs. A type only: no @dnd-kit code here. */
type SortableHandle = Pick<
  ReturnType<typeof useSortable>,
  'setActivatorNodeRef' | 'attributes' | 'listeners'
>;

/**
 * The six-dot drag grip: the one handle a sortable row or card is moved by (the builder's
 * fields, options and timer phases; Manage's events). A button, so the keyboard sensor reaches
 * it: focus it, Space or Enter picks up, the arrows move, Space or Enter drops, Escape puts back.
 * `touch-none` lets a finger drag the grip without scrolling the page; the rest of the row still
 * scrolls. While the sortable is disabled, dnd-kit drops its listeners and sets `aria-disabled`:
 * the grip stays focusable (a keyboard drop keeps its focus) and is drawn faint. Size and place
 * come from `className`; `label` names what moves ("Move Auto").
 */
export function SortableGrip({
  sortable,
  label,
  className,
  iconClassName,
}: {
  sortable: SortableHandle;
  label: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <button
      type="button"
      ref={sortable.setActivatorNodeRef}
      {...sortable.attributes}
      {...sortable.listeners}
      aria-label={label}
      className={cn(
        'grid shrink-0 cursor-grab touch-none place-items-center rounded-control text-muted hover:bg-line-2 aria-disabled:cursor-default aria-disabled:text-faint aria-disabled:hover:bg-transparent',
        className,
      )}
    >
      <GripVertical aria-hidden="true" className={cn('size-4', iconClassName)} />
    </button>
  );
}
