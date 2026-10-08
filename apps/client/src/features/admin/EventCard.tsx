import { useId } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil } from 'lucide-react';
import type { EventRow } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { STATE_TAG } from './SeasonCard';

/** A 36 px drawn icon button with the 48 px target grown by its ::after (THEME "icon button"). */
const ICON =
  'w-9 px-0 after:-inset-x-1.5 border-line text-ink-2 disabled:opacity-100 disabled:text-faint [&_svg]:size-4';

/**
 * One event (07-manage final, Competitions): its name and position, "Default event" or
 * "Make default", ↑ ↓ to move it (off at the ends), ✎ to rename. The default event's card
 * is accent-tinted. "Make default" is described by the event's name, so a screen reader
 * hears which event each one is for.
 */
export function EventCard({
  event,
  position,
  count,
  isDefault,
  busy,
  canSwitch,
  onMakeDefault,
  onMove,
  onRename,
}: {
  event: EventRow;
  /** 1-based. */
  position: number;
  count: number;
  isDefault: boolean;
  /** A change is in flight on this season's events. */
  busy: boolean;
  /** Online, so the default can change. */
  canSwitch: boolean;
  onMakeDefault: () => void;
  onMove: (delta: -1 | 1) => void;
  onRename: () => void;
}) {
  const nameId = useId();
  return (
    <article
      aria-labelledby={nameId}
      className={cn(
        'flex flex-col gap-2.5 rounded-card border bg-surface',
        isDefault ? 'border-2 border-accent bg-accent-tint p-[13px]' : 'border-line p-3.5',
      )}
    >
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
          aria-label={`Move ${event.name} up`}
          title={`Move ${event.name} up`}
          disabled={position === 1 || busy}
          onClick={() => onMove(-1)}
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          className={ICON}
          aria-label={`Move ${event.name} down`}
          title={`Move ${event.name} down`}
          disabled={position === count || busy}
          onClick={() => onMove(1)}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
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
    </article>
  );
}
