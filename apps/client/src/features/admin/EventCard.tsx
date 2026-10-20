import { useSortable } from '@dnd-kit/sortable';
import { useId } from 'react';
import { Check, Pencil } from 'lucide-react';
import type { EventRow } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { SortableGrip } from '@/components/ui/sortable-grip';
import { prefersReducedMotion } from '@/lib/animate';
import { cn } from '@/lib/utils';
import { STATE_TAG } from './SeasonCard';

/** A 36 px drawn icon button with the 48 px target grown by its ::after (THEME "icon button"). */
const ICON =
  'w-9 px-0 after:-inset-x-1.5 border-line text-ink-2 disabled:opacity-100 disabled:text-faint [&_svg]:size-4';

/**
 * The grip at the card's start edge: 28 × 48 px drawn, its ::after growing the target to 48 px
 * wide (SPEC-FINAL 17.7) over the card's padding and the gap, never over a control.
 */
const GRIP =
  "relative -ms-1.5 h-12 w-7 self-center after:absolute after:-inset-x-2.5 after:inset-y-0 after:content-['']";

/**
 * One event (07-manage final, Competitions): the six-dot grip it is dragged by, its name and
 * position, "Default event" or "Make default", ✎ to rename. The grip replaced ↑ ↓ on
 * 2026-10-09 at the user's request (README; DEVIATIONS): a pointer drags it, and from the
 * keyboard Space or Enter picks it up, the arrows move it, Space or Enter drops it. The grip is
 * held (focusable, `aria-disabled`) while a change is in flight. Rows jump rather than slide
 * under reduced motion (SPEC-FINAL 17.9). The default event's card is accent-tinted.
 * "Make default" is described by the event's name, so a screen reader hears which event each
 * one is for.
 */
export function EventCard({
  event,
  position,
  isDefault,
  busy,
  canSwitch,
  onMakeDefault,
  onRename,
}: {
  event: EventRow;
  /** 1-based. */
  position: number;
  isDefault: boolean;
  /** A change is in flight on this season's events. */
  busy: boolean;
  /** Online, so the default can change. */
  canSwitch: boolean;
  onMakeDefault: () => void;
  onRename: () => void;
}) {
  const nameId = useId();
  const sortable = useSortable({
    id: event.id,
    disabled: busy,
    transition: prefersReducedMotion() ? null : undefined,
  });
  const t = sortable.transform;
  return (
    <article
      ref={sortable.setNodeRef}
      aria-labelledby={nameId}
      style={{
        transform: t ? `translate3d(${t.x}px, ${t.y}px, 0)` : undefined,
        transition: sortable.transition ?? undefined,
      }}
      className={cn(
        'flex gap-2.5 rounded-card border bg-surface',
        isDefault ? 'border-2 border-accent bg-accent-tint p-[13px]' : 'border-line p-3.5',
        sortable.isDragging && 'relative z-10 shadow-[var(--shadow-float)]',
      )}
    >
      <SortableGrip sortable={sortable} label={`Move ${event.name}`} className={GRIP} />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <h3 id={nameId} className="min-w-0 text-[0.9375rem] font-[650]" dir="auto">
            {event.name}
          </h3>
          <span className="num ms-auto text-xs text-muted">#{position}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isDefault ? (
            <span className={cn(STATE_TAG, 'bg-transparent px-1.5')}>
              <Check aria-hidden="true" className="size-[13px]" strokeWidth={2.6} />
              Default event
            </span>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              aria-describedby={nameId}
              disabled={!canSwitch || busy}
              onClick={onMakeDefault}
            >
              Make default
            </Button>
          )}
          <span className="flex-1" />
          <Button
            size="sm"
            className={ICON}
            aria-label={`Rename ${event.name}`}
            title={`Rename ${event.name}`}
            onClick={onRename}
          >
            <Pencil aria-hidden="true" />
          </Button>
        </div>
      </div>
    </article>
  );
}
