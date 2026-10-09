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
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { ActiveContext, EventRow, SeasonRow } from '@frc/shared';
import { ErrorLine } from '@/components/ui/notice';
import type { Rpc } from '@/data/rpc';
import { useOnline } from '@/lib/useOnline';
import { cn } from '@/lib/utils';
import { EventCard } from './EventCard';
import { EventFormDialog } from './EventFormDialog';
import { panelErrorLine } from './adminMessages';
import { SeasonCard } from './SeasonCard';
import { SeasonFormDialog } from './SeasonFormDialog';

export const OFFLINE_SWITCH_HINT = 'Changing the active season or event needs a connection.';
export const ORDER_NOTE = 'Order is display order only — every event counts equally.';

type Form =
  | { kind: 'none' }
  | { kind: 'season'; season: SeasonRow | null }
  | { kind: 'event'; event: EventRow | null };

/** A 36 px pill with the 48 px target grown by its ::after. */
const CHIP =
  'tap-target hover-veil motion-safe:transition motion-safe:active:not-disabled:scale-[0.97] relative inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-[0.84375rem] font-[650] after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[""]';

/**
 * The Competitions tab (07-manage final): Seasons and Events merged. Season chips (newest
 * first; the active one filled ink, "+ New season" last), the chosen season's card, then
 * its events as cards in display order with "+ New event" last. Make active, make default
 * and reordering change in place at once and go back if the server refuses (today's
 * behaviour); the first two are off while offline. An event is moved by its grip, by pointer
 * or keyboard (2026-10-09, replacing ↑ ↓); every grip is held while a change is in flight.
 * The page owns the lists. The Edit dialogs carry Delete (RB.20).
 */
export function CompetitionsPanel({
  rpc,
  seasons,
  active,
  seasonId,
  events,
  eventsGate,
  onSelectSeason,
  onSeasonSaved,
  onActiveChange,
  onEventsChange,
  onSeasonDeleted,
  onEventDeleted,
}: {
  rpc: Rpc;
  seasons: SeasonRow[];
  active: ActiveContext;
  seasonId: string | null;
  /** The chosen season's events in display order; `null` while `eventsGate` explains why. */
  events: EventRow[] | null;
  eventsGate: ReactNode;
  onSelectSeason: (seasonId: string) => void;
  onSeasonSaved: (row: SeasonRow) => void;
  onActiveChange: (context: ActiveContext) => void;
  onEventsChange: (seasonId: string, update: (prev: EventRow[]) => EventRow[]) => void;
  /** A season or event was hard-deleted (RB.20): drop it from the page's lists. */
  onSeasonDeleted: (seasonId: string) => void;
  onEventDeleted: (seasonId: string, eventId: string) => void;
}) {
  const online = useOnline();
  const [form, setForm] = useState<Form>({ kind: 'none' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const season = seasons.find((s) => s.id === seasonId) ?? null;
  const close = () => setForm({ kind: 'none' });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Show the new active season or event at once; put the old one back on a refusal. */
  async function switchTo(id: string, next: ActiveContext, name: string, input: unknown) {
    const before = active;
    setBusyId(id);
    setError(null);
    onActiveChange(next);
    try {
      const out = (await rpc.call(name, input)) as Partial<ActiveContext> | undefined;
      if (out && 'active_season_id' in out && 'active_event_id' in out) {
        onActiveChange(out as ActiveContext);
      }
    } catch (e) {
      onActiveChange(before);
      setError(panelErrorLine(e));
    } finally {
      setBusyId(null);
    }
  }

  // The whole new order goes out (display order only, never a re-weight).
  async function move(list: EventRow[], from: number, to: number) {
    if (!seasonId || from === to) return;
    const forSeason = seasonId;
    const order = arrayMove(list, from, to);
    const moved = order[to];
    if (!moved) return;
    const ranked = (rows: EventRow[]) => rows.map((e, i) => ({ ...e, sort_order: i + 1 }));
    setBusyId(moved.id);
    setError(null);
    onEventsChange(forSeason, () => ranked(order));
    try {
      const out = (await rpc.call('reorderEvents', {
        season_id: forSeason,
        event_ids: order.map((e) => e.id),
      })) as { items?: EventRow[] } | undefined;
      if (out?.items) onEventsChange(forSeason, () => out.items!);
    } catch (e) {
      onEventsChange(forSeason, () => list);
      setError(panelErrorLine(e));
    } finally {
      setBusyId(null);
    }
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!events || !over || active.id === over.id) return;
    const from = events.findIndex((e) => e.id === active.id);
    const to = events.findIndex((e) => e.id === over.id);
    if (from === -1 || to === -1) return;
    void move(events, from, to);
  }

  /** What a screen reader hears during a drag: the event and its place, never an id. */
  const placeOf = (id: string | number) => (events ?? []).findIndex((e) => e.id === id) + 1;
  const nameOf = (id: string | number) => events?.find((e) => e.id === id)?.name ?? 'The event';
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}, position ${placeOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} is at position ${placeOf(over.id)}.`
        : `${nameOf(active.id)} is over nothing.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} is now position ${placeOf(over.id)}.`
        : `${nameOf(active.id)} was put back.`,
    onDragCancel: ({ active }) => `${nameOf(active.id)} was put back.`,
  };

  return (
    <div>
      <div role="group" aria-label="Seasons" className="flex flex-wrap gap-2">
        {seasons.map((s) => {
          const isActive = s.id === active.active_season_id;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === seasonId}
              onClick={() => onSelectSeason(s.id)}
              className={cn(
                CHIP,
                isActive
                  ? 'border-ink bg-ink text-surface'
                  : s.id === seasonId
                    ? 'border-2 border-accent bg-accent-tint px-[13px] text-accent-ink'
                    : 'border-control-border bg-surface text-ink',
              )}
            >
              <span className="num">{s.year}</span> <span dir="auto">{s.game_name}</span>
              {isActive && ' · Active'}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setForm({ kind: 'season', season: null })}
          className={cn(CHIP, 'border-dashed border-control-border text-accent-ink')}
        >
          <Plus aria-hidden="true" className="size-4" />
          New season
        </button>
      </div>
      {!online && <p className="mt-2 text-[0.8125rem] text-muted">{OFFLINE_SWITCH_HINT}</p>}
      {error && <ErrorLine className="mt-3">{error}</ErrorLine>}

      {season && (
        <>
          <SeasonCard
            season={season}
            active={season.id === active.active_season_id}
            switching={busyId === season.id}
            canSwitch={online && busyId === null}
            onMakeActive={() =>
              void switchTo(
                season.id,
                { ...active, active_season_id: season.id },
                'setActiveSeason',
                { season_id: season.id },
              )
            }
            onEdit={() => setForm({ kind: 'season', season })}
          />
          <section aria-label="Events" className="mt-4">
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <h2 className="text-[0.9375rem] font-bold">Events</h2>
              <p className="text-[0.78125rem] text-muted">{ORDER_NOTE}</p>
            </div>
            {events === null ? (
              <div className="mt-3">{eventsGate}</div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
                accessibility={{ announcements }}
              >
                <SortableContext items={events.map((e) => e.id)} strategy={rectSortingStrategy}>
                  <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                    {events.map((event, index) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        position={index + 1}
                        isDefault={event.id === active.active_event_id}
                        busy={busyId !== null}
                        canSwitch={online}
                        onMakeDefault={() =>
                          void switchTo(
                            event.id,
                            { ...active, active_event_id: event.id },
                            'setActiveEvent',
                            { event_id: event.id },
                          )
                        }
                        onRename={() => setForm({ kind: 'event', event })}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => setForm({ kind: 'event', event: null })}
                      className="hover-veil motion-safe:transition min-h-[110px] rounded-card border border-dashed border-control-border font-[650] text-accent-ink"
                    >
                      + New event
                    </button>
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </section>
        </>
      )}

      <SeasonFormDialog
        open={form.kind === 'season'}
        season={form.kind === 'season' ? form.season : null}
        rpc={rpc}
        onSaved={(row) => {
          close();
          onSeasonSaved(row);
        }}
        onClose={close}
        active={form.kind === 'season' && form.season?.id === active.active_season_id}
        onDeleted={(id) => {
          close();
          onSeasonDeleted(id);
        }}
      />
      {season && (
        <EventFormDialog
          open={form.kind === 'event'}
          event={form.kind === 'event' ? form.event : null}
          seasonId={season.id}
          rpc={rpc}
          onSaved={(row) => {
            close();
            onEventsChange(season.id, (prev) => [...prev.filter((e) => e.id !== row.id), row]);
          }}
          onClose={close}
          isDefault={form.kind === 'event' && form.event?.id === active.active_event_id}
          onDeleted={(id) => {
            close();
            onEventDeleted(season.id, id);
          }}
        />
      )}
    </div>
  );
}
