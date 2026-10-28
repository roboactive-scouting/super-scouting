import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ArrowDownWideNarrow, ChevronDown, X } from 'lucide-react';
import { forwardRef, useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { FieldPhase, RankSortKey, RankSortStep } from '@frc/shared';
import { onRadioGroupKey } from '@/components/ui/radio-keys';
import { Sheet } from '@/components/ui/sheet';
import { SortableGrip } from '@/components/ui/sortable-grip';
import { prefersReducedMotion } from '@/lib/animate';
import { cn } from '@/lib/utils';
import { SortBadge } from './parts';
import {
  addStep,
  CATEGORY_NAME,
  directionText,
  directionWords,
  figureOf,
  isBestFirst,
  moveStep,
  removeStep,
  setStepBest,
  tieBreakers,
  type Category,
} from './rankingView';

/*
 * THEME "Sort control" and "Sort builder" (Ranking, 2026-10-28): the sort in words, and where it
 * is built — a popover under the control on a computer, a bottom sheet on a phone. Only the open
 * category's figures are offered; Consistency never (it is not a sort key at all).
 */

/** "**Availability**, best first · then **Breakdowns**, fewest first". */
export function SortSentence({ sort }: { sort: readonly RankSortStep[] }) {
  return (
    <>
      {sort.map((step, i) => (
        <span key={step.key}>
          {i > 0 && <span className="text-muted"> · then </span>}
          <b className="font-[650] text-ink">{figureOf(step.key).label}</b>, {directionText(step)}
        </span>
      ))}
    </>
  );
}

/**
 * THEME "Sort control": a 40 px white button (`--control-border`), a sort icon, the whole sort as a
 * sentence and a ⌄; open, a 2 px `--accent` ring. `compact` (a phone): "Sorted by" as a small label
 * inside, at least 52 px tall.
 */
export const SortControl = forwardRef<
  HTMLButtonElement,
  {
    sort: readonly RankSortStep[];
    category: Category;
    open: boolean;
    onOpen: () => void;
    compact?: boolean;
    controls?: string;
  }
>(function SortControl({ sort, category, open, onOpen, compact = false, controls }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      aria-label={`Sort ${CATEGORY_NAME[category]}: ${sort
        .map((s, i) => `${i ? 'then ' : ''}${figureOf(s.key).label}, ${directionText(s)}`)
        .join(', ')}`}
      className={cn(
        'hover-veil motion-safe:transition flex items-center gap-2.5 rounded-control border border-control-border bg-surface text-start text-sm text-ink-2',
        compact ? 'min-h-[3.25rem] w-full px-3 py-1.5 leading-[1.3]' : 'h-10 px-3',
        open && 'border-accent shadow-[0_0_0_1px_var(--accent)]',
      )}
    >
      <ArrowDownWideNarrow aria-hidden="true" className="size-4 shrink-0 text-muted" />
      {compact ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <small className="text-[0.71875rem] text-muted">Sorted by</small>
          <span>
            <SortSentence sort={sort} />
          </span>
        </span>
      ) : (
        <span className="whitespace-nowrap">
          <SortSentence sort={sort} />
        </span>
      )}
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted" />
    </button>
  );
});

type BuilderProps = {
  category: Category;
  phases: readonly FieldPhase[];
  sort: readonly RankSortStep[];
  onChange: (sort: RankSortStep[]) => void;
};

/** The builder's content (THEME "Sort builder"): rows, tie-breakers, the footnote. */
function SortBuilderBody({
  category,
  phases,
  sort,
  onChange,
  headingId,
}: BuilderProps & { headingId?: string }) {
  const [announcer, setAnnouncer] = useState<HTMLDivElement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = sort.map((s) => s.key);
  const placeOf = (id: string | number) => ids.indexOf(id as RankSortKey);
  const nameOf = (id: string | number) => figureOf(id as RankSortKey).label;
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${nameOf(active.id)}, figure ${placeOf(active.id) + 1}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} is at figure ${placeOf(over.id) + 1}.`
        : `${nameOf(active.id)} is over nothing.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} is now figure ${placeOf(over.id) + 1}.`
        : `${nameOf(active.id)} was put back.`,
    onDragCancel: ({ active }) => `${nameOf(active.id)} was put back.`,
  };
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    onChange(moveStep(sort, placeOf(active.id), placeOf(over.id)));
  }
  const offered = tieBreakers(category, phases, sort);
  return (
    <div className="flex flex-col gap-2">
      <div className="mb-1 flex flex-col gap-0.5">
        {headingId && (
          <b id={headingId} className="text-[0.9375rem] font-bold">
            Sort {CATEGORY_NAME[category]} by
          </b>
        )}
        <span className="text-[0.78125rem] text-muted">
          The first figure orders the list; each next one settles ties in the one above.
        </span>
      </div>
      <div ref={setAnnouncer} />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{ announcements, container: announcer ?? undefined }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol aria-label="Sort figures" className="flex flex-col gap-2">
            {sort.map((step, i) => (
              <StepRow
                key={step.key}
                step={step}
                index={i}
                only={sort.length === 1}
                onBest={(best) => onChange(setStepBest(sort, step.key, best))}
                onRemove={() => onChange(removeStep(sort, step.key))}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {offered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-0.5 pt-1.5 pb-0.5 text-[0.78125rem] text-muted">
          <span className="me-1">Add a tie-breaker</span>
          {offered.map((figure) => (
            <button
              key={figure.key}
              type="button"
              onClick={() => onChange(addStep(sort, figure.key))}
              className="hover-veil motion-safe:transition inline-flex h-[34px] items-center rounded-full border border-control-border px-3.5 text-[0.8125rem] font-semibold text-ink-2"
            >
              + {figure.label}
            </button>
          ))}
        </div>
      )}
      <p className="mt-0.5 border-t border-line pt-2.5 text-[0.78125rem] text-muted">
        Still tied after every figure: by rank. Rank is always the place by Total.
      </p>
    </div>
  );
}

/** One figure of the sort: grip · By/then · badge + figure · direction · ×. */
function StepRow({
  step,
  index,
  only,
  onBest,
  onRemove,
}: {
  step: RankSortStep;
  index: number;
  only: boolean;
  onBest: (best: boolean) => void;
  onRemove: () => void;
}) {
  const sortable = useSortable({
    id: step.key,
    transition: prefersReducedMotion() ? null : undefined,
  });
  const t = sortable.transform;
  const label = figureOf(step.key).label;
  const words = directionWords(step.key);
  const best = isBestFirst(step);
  return (
    <li
      ref={sortable.setNodeRef}
      data-sort-step={step.key}
      style={{
        transform: t ? `translate3d(0, ${t.y}px, 0)` : undefined,
        transition: sortable.transition ?? undefined,
      }}
      className={cn(
        'grid min-h-[52px] grid-cols-[28px_34px_minmax(0,1fr)_auto_36px] items-center gap-2 rounded-control border border-line bg-surface py-1 ps-1 pe-1.5',
        sortable.isDragging && 'relative z-10 shadow-[var(--shadow-float)]',
      )}
    >
      <SortableGrip sortable={sortable} label={`Move ${label}`} className="size-7" />
      <span className="text-[0.78125rem] text-muted">{index === 0 ? 'By' : 'then'}</span>
      <span className="flex min-w-0 items-center gap-2 text-[0.90625rem] font-[650]">
        <SortBadge n={index + 1} className="size-[18px] text-[0.6875rem]" />
        <span className="truncate">{label}</span>
      </span>
      <span
        role="radiogroup"
        aria-label={`${label} direction`}
        onKeyDown={(e) => onRadioGroupKey(e, (i) => onBest(i === 0))}
        className="flex gap-[3px] rounded-control border border-line bg-line-2 p-[3px]"
      >
        {[true, false].map((side) => (
          <button
            key={String(side)}
            type="button"
            role="radio"
            aria-checked={best === side}
            tabIndex={best === side ? 0 : -1}
            onClick={() => onBest(side)}
            className={cn(
              'hover-veil motion-safe:transition inline-flex h-[34px] min-w-[82px] items-center justify-center rounded-[6px] px-2.5 text-[0.8125rem] font-[650]',
              best === side
                ? 'bg-accent-tint text-accent-ink shadow-[inset_0_0_0_2px_var(--accent)]'
                : 'text-ink-2',
            )}
          >
            {side ? words.best : words.worst} first
          </button>
        ))}
      </span>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        disabled={only}
        onClick={onRemove}
        className="hover-veil motion-safe:transition grid size-9 place-items-center rounded-control text-muted disabled:opacity-40"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </li>
  );
}

/**
 * The Sort builder on a computer: a 520 px popover under the Sort control (10 px radius, `--line`
 * edge, the dialog shadow). Escape or a click outside closes it, and focus goes back to the
 * control.
 */
export function SortPopover({
  open,
  onClose,
  anchor,
  id,
  ...builder
}: BuilderProps & {
  open: boolean;
  onClose: () => void;
  anchor: RefObject<HTMLButtonElement | null>;
  id: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const heading = useId();
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  if (!open) return null;
  return (
    <div
      ref={panel}
      id={id}
      role="dialog"
      aria-labelledby={heading}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
          anchor.current?.focus();
        }
      }}
      className="absolute end-0 top-[calc(100%+8px)] z-30 w-[520px] rounded-[10px] border border-line bg-surface p-4 shadow-[var(--shadow-float)] outline-none"
    >
      <SortBuilderBody {...builder} headingId={heading} />
    </div>
  );
}

/** The Sort builder on a phone: the same content in a bottom sheet. */
export function SortSheet({
  open,
  onClose,
  ...builder
}: BuilderProps & { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      side="bottom"
      title={`Sort ${CATEGORY_NAME[builder.category]} by`}
      onClose={onClose}
      showClose
    >
      <div className="pb-4">
        <SortBuilderBody {...builder} />
      </div>
    </Sheet>
  );
}
