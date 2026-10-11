import { MapPin, Undo2, X } from 'lucide-react';
import { lazy, Suspense, useId, useMemo, useState } from 'react';
import {
  denormalizeForAlliance,
  formatClock,
  selectOptions,
  type EventLogTap,
  type FormFieldDefinition,
  type MirrorAxis,
  type Point,
} from '@frc/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEntryContext } from '../entryContext';
import { storeImagePoint } from '../map/mapGeometry';
import { matchClock } from '../matchClock';
import { useUndoable } from '../useUndoable';
import { FieldLabel, FieldRow } from './FieldRow';

// The map pop-up is its own chunk: only an event log that asks where (and 1.35's map fields)
// opens it, and the service worker precaches it, so it still opens offline.
const MapSheet = lazy(() => import('../map/MapSheet').then((m) => ({ default: m.MapSheet })));

/** What the last change was, for the Undo's words. */
type Note = 'tap' | 'remove';

/** A tap waiting on "where?": its time is fixed at the tap; the place is being picked. */
type Pending = { type: string; label: string; t: number; spot: Point | null };

/**
 * The chips' rows, spaced for the tap floor (SPEC-FINAL 17.7: 48 × 48 px, 8 px apart). A chip is
 * 30 px with a 22 px ✕ whose hit area is 48 px, so it reaches 9 px above and below its chip:
 * rows 26 px apart keep two rows' ✕ areas 8 px apart; 17 px from the buttons above (10 px column
 * gap + 7) and 24 px to the Undo below (10 + 14, whose own hit area reaches 7 px up) do the same.
 * A chip is wider than 48 px, so ✕ areas side by side are always further apart than that.
 */
const CHIP_LIST = 'mt-[0.4375rem] flex flex-wrap gap-x-2 gap-y-[1.625rem]';

/** A tap's time to a tenth of a second. */
const tenth = (t: number) => Math.round(t * 10) / 10;

/** The taps as a list, in time order, whatever the page handed in. */
function tapsOf(value: unknown): EventLogTap[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (tap): tap is EventLogTap =>
      typeof tap === 'object' &&
      tap !== null &&
      typeof (tap as EventLogTap).type === 'string' &&
      typeof (tap as EventLogTap).t === 'number',
  );
}

/** `taps` with `tap` added, kept ascending by `t` (a later equal time goes after). */
function withTap(taps: readonly EventLogTap[], tap: EventLogTap): EventLogTap[] {
  const at = taps.findIndex((other) => other.t > tap.t);
  return at === -1 ? [...taps, tap] : [...taps.slice(0, at), tap, ...taps.slice(at)];
}

/**
 * An Event-log field (SPEC-FINAL 5.2, 5.5; THEME "Event-log buttons and tap chips"): one equal
 * 52 px filled-ink button per event type, the tap count in mono under its label. A tap stores
 * `{type, t}`, `t` in seconds from `matchClock` (Start match, or the entry's first tap when the
 * timer was never started), and the list stays ascending by `t`. The taps show newest first as
 * 30 px chips — a pin when the tap has a place, the label, the time, ✕ to delete that tap and
 * no other — then "Undo last tap" and the count.
 *
 * With `ask_position`, each tap then opens the map ("High goal · where?"): this field's earlier
 * taps grey, tapping again moves the new spot; **Skip · no place** (or ✕) keeps `{type, t}`
 * with no `x`/`y` keys at all, **Save tap** keeps `{type, t, x, y}`, alliance-normalized (red
 * raw, blue mirrored on `mirror_axis`, 5.6). A missing season image offers only Skip.
 */
export function EventLogInput({
  field,
  value,
  onChange,
}: {
  field: FormFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = useId();
  const { alliance, station, fieldImagePath } = useEntryContext();
  const types = selectOptions({ config: { options: field.config.event_types } });
  const askWhere = field.config.ask_position === true;
  const axis = ((field.config.mirror_axis as MirrorAxis | undefined) ?? 'none') as MirrorAxis;
  const held = useMemo(() => tapsOf(value), [value]);
  const history = useUndoable<EventLogTap[], Note>(held, onChange);
  const taps = history.value;
  const [pending, setPending] = useState<Pending | null>(null);
  const labelOf = (type: string) => types.find((o) => o.value === type)?.label ?? type;

  function tap(type: string, label: string) {
    const t = tenth(matchClock.tapTime(field.key));
    if (askWhere) {
      setPending({ type, label, t, spot: null });
      return;
    }
    history.set(withTap(taps, { type, t }), 'tap');
  }

  /** Keeps the waiting tap, with its place when one was picked (never empty x/y keys). */
  function keep(spot: Point | null) {
    if (!pending) return;
    const tapped: EventLogTap = { type: pending.type, t: pending.t };
    if (spot) {
      const stored = storeImagePoint(spot, alliance, axis);
      tapped.x = stored.x;
      tapped.y = stored.y;
    }
    setPending(null);
    history.set(withTap(taps, tapped), 'tap');
  }

  function remove(index: number) {
    history.set(
      taps.filter((_, i) => i !== index),
      'remove',
    );
  }

  // The last change made here is taken back exactly. With no history (the field was drawn anew:
  // another phase, a turned tablet) "Undo last tap" takes the latest tap in time.
  const undoesRemove = history.canUndo && history.note === 'remove';
  function undoLast() {
    if (history.canUndo) history.undo();
    else onChange(taps.slice(0, -1));
  }

  const newestFirst = taps.map((t, index) => ({ tap: t, index })).reverse();
  const count = (type: string) => taps.filter((t) => t.type === type).length;
  const pin = alliance === 'red' ? 'text-alliance-red' : 'text-alliance-blue';

  return (
    <FieldRow label={<FieldLabel field={field} id={`${id}-label`} />}>
      <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-2.5">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-2">
          {types.map((type) => {
            const n = count(type.value);
            return (
              <button
                key={type.value}
                type="button"
                aria-label={`${type.label}, ${n} ${n === 1 ? 'tap' : 'taps'}`}
                onClick={() => tap(type.value, type.label)}
                className="tap-target hover-veil motion-safe:transition motion-safe:active:scale-[0.97] flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center rounded-control bg-ink px-2 text-surface"
              >
                <span className="max-w-full truncate text-sm font-[650]" dir="auto">
                  {type.label}
                </span>
                <span className="font-num text-[0.71875rem] font-medium text-rail-ink">{n}</span>
              </button>
            );
          })}
        </div>
        {taps.length > 0 && (
          <>
            <ul aria-label={`${field.label} taps, newest first`} className={CHIP_LIST}>
              {newestFirst.map(({ tap: t, index }) => {
                const placed = t.x !== undefined && t.y !== undefined;
                const label = labelOf(t.type);
                return (
                  <li
                    key={`${index}-${t.type}-${t.t}`}
                    className="inline-flex h-[1.875rem] items-center gap-1.5 rounded-tag bg-line-2 ps-[9px] pe-1 text-[0.78125rem] font-[650] text-ink-2"
                  >
                    {placed && (
                      <>
                        <MapPin
                          data-pin=""
                          aria-hidden="true"
                          className={cn('size-[0.8125rem] shrink-0', pin)}
                        />
                        <span className="sr-only">Placed on the map:</span>
                      </>
                    )}
                    <span dir="auto">{label}</span>
                    <span className="font-num text-xs font-medium text-muted">
                      {formatClock(t.t)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${label} at ${formatClock(t.t)}`}
                      onClick={() => remove(index)}
                      className="tap-target hover-veil relative grid size-[1.375rem] min-h-0 min-w-0 place-items-center rounded-full text-muted after:absolute after:-inset-[0.8125rem] after:content-['']"
                    >
                      <X aria-hidden="true" className="size-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-[0.875rem] flex items-center gap-2 text-[0.78125rem] text-muted">
              {
                <Button
                  size="sm"
                  onClick={undoLast}
                  className="min-h-[2.125rem] px-2.5 text-[0.78125rem] font-[650] after:-inset-y-[0.4375rem] [&_svg]:size-3.5"
                >
                  <Undo2 aria-hidden="true" />
                  {undoesRemove ? 'Undo remove' : 'Undo last tap'}
                </Button>
              }
              <span className="ms-auto whitespace-nowrap">
                <span className="font-num text-ink">{taps.length}</span>{' '}
                {taps.length === 1 ? 'tap' : 'taps'}
              </span>
            </div>
          </>
        )}
      </div>
      {pending && (
        <Suspense fallback={null}>
          <MapSheet
            open
            title={`${pending.label} · where?`}
            subtitle={`${field.label} · tap at ${formatClock(pending.t)} · optional`}
            alliance={alliance}
            station={station}
            imagePath={fieldImagePath}
            marks={[
              ...taps
                .filter((t) => t.x !== undefined && t.y !== undefined)
                .map((t, i) => ({
                  id: `old-${i}`,
                  point: denormalizeForAlliance({ x: t.x!, y: t.y! }, alliance, axis),
                  tone: 'old' as const,
                })),
              ...(pending.spot ? [{ id: 'new', point: pending.spot, tone: 'own' as const }] : []),
            ]}
            onTap={(spot) => setPending({ ...pending, spot })}
            onClose={() => keep(null)}
            hint={
              pending.spot ? (
                <>
                  Earlier taps are grey. <b className="text-ink-2">Tap again</b> to move this one.
                </>
              ) : (
                <>
                  <b className="text-ink-2">Tap the map</b> where it happened. Earlier taps are
                  grey.
                </>
              )
            }
            tools={
              <Button onClick={() => keep(null)} className="min-h-11 px-3.5 text-sm font-[650]">
                Skip · no place
              </Button>
            }
            status="time is saved either way"
            done={{
              label: 'Save tap',
              onClick: () => keep(pending.spot),
              disabled: pending.spot === null,
            }}
          />
        </Suspense>
      )}
    </FieldRow>
  );
}
