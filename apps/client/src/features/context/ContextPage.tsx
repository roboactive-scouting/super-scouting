import { useEffect, useState } from 'react';
import {
  LIST_EVENTS_MAX_LIMIT,
  LIST_SEASONS_MAX_LIMIT,
  type EventRow,
  type SeasonRow,
} from '@frc/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { clientConfig } from '@/config';
import { cachedRows } from '@/data/cache';
import { typedCall as defaultCall, type Rpc } from '@/data/rpc';
import { useOnline } from '@/lib/useOnline';
import { cn } from '@/lib/utils';
import { sessionOverride, useSessionOverride } from './sessionOverride';

/**
 * SPEC-FINAL 6.3, 17.9: the page a user deliberately opens to look at another season or
 * event — never a header dropdown. A calm document: seasons as a card grid, most recent
 * first, then the chosen season's events as big cards in `sort_order`.
 *
 * The device caches only the admin default (the pull scopes seasons and events to it), so
 * what renders first is the cache; online, `listSeasons` and `listEvents` fill in the rest
 * through the injectable `rpc` (task-1.22 addendum A.2). Choosing an event sets the
 * session-only override; choosing the default clears it. Every switch away from the
 * default is disabled offline; going back to it never is.
 *
 * Reads no event data through the shell (it is a NO_HYDRATION route), so it never calls
 * `useActiveEventId()`, and it uses no router hook: it renders on its own.
 */

export const OFFLINE_CONTEXT_LINE = 'Only the default competition is available offline.';
export const SERVER_SILENT_LINE =
  'The server did not answer, so only the default competition is shown.';

type SeasonCard = Pick<SeasonRow, 'id' | 'year' | 'game_name'>;
type EventCard = Pick<EventRow, 'id' | 'season_id' | 'name' | 'sort_order'>;
type AppSettings = { active_season_id: string | null; active_event_id: string | null };

/** Page bound for following `next_cursor`: 10 pages of 200 is far past any real list. */
const MAX_PAGES = 10;

async function listAll<T>(rpc: Rpc, name: string, input: Record<string, unknown>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const out = (await rpc.call(name, { ...input, ...(cursor ? { cursor } : {}) })) as {
      items: T[];
      next_cursor: string | null;
    };
    items.push(...out.items);
    if (!out.next_cursor) break;
    cursor = out.next_cursor;
  }
  return items;
}

const newestFirst = (a: SeasonCard, b: SeasonCard) => b.year - a.year;
const bySortOrder = (a: EventCard, b: EventCard) => a.sort_order - b.sort_order;

/** A card: big, bordered, a 48 px floor, and one quiet marker under the name. */
const CARD =
  'tap-target state-layer motion-transition flex w-full flex-col items-start gap-1 rounded-xl border border-border bg-surface p-5 text-left disabled:cursor-not-allowed disabled:opacity-50';
const CARD_SELECTED = 'border-text bg-surface-raised';

export function ContextPage({ rpc = { call: defaultCall } }: { rpc?: Rpc }) {
  const online = useOnline();
  const override = useSessionOverride();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [seasons, setSeasons] = useState<SeasonCard[]>([]);
  /** Events per season: the cache's first, replaced by the server's list when it answers. */
  const [events, setEvents] = useState<Record<string, EventCard[]>>({});
  const [chosenSeasonId, setChosenSeasonId] = useState<string | null>(null);
  const [serverSilent, setServerSilent] = useState(false);
  const [cacheRead, setCacheRead] = useState(false);

  // The cache first: it is what the device works on, and all there is offline.
  useEffect(() => {
    let live = true;
    void Promise.all([
      cachedRows<AppSettings>('app_settings'),
      cachedRows<SeasonCard>('seasons'),
      cachedRows<EventCard>('events'),
    ]).then(([appSettings, cachedSeasons, cachedEvents]) => {
      if (!live) return;
      const current = appSettings[0] ?? null;
      setSettings(current);
      setSeasons((known) => (known.length > 0 ? known : [...cachedSeasons].sort(newestFirst)));
      const grouped: Record<string, EventCard[]> = {};
      for (const e of cachedEvents) (grouped[e.season_id] ??= []).push(e);
      setEvents((known) => ({ ...grouped, ...known }));
      setChosenSeasonId((chosen) => chosen ?? current?.active_season_id ?? null);
      setCacheRead(true);
    });
    return () => {
      live = false;
    };
  }, []);

  // Online, the server has every season. Offline, or unanswered, the cache stands.
  useEffect(() => {
    if (!online) return;
    let live = true;
    listAll<SeasonCard>(rpc, 'listSeasons', { limit: LIST_SEASONS_MAX_LIMIT }).then(
      (items) => {
        if (!live) return;
        setSeasons([...items].sort(newestFirst));
        setServerSilent(false);
      },
      () => {
        if (live) setServerSilent(true);
      },
    );
    return () => {
      live = false;
    };
    // rpc is an injected dependency held stable by the caller; a reconnect re-asks.
  }, [online]);

  // The chosen season's events, asked for when it is chosen (and on a reconnect).
  useEffect(() => {
    if (!online || chosenSeasonId === null) return;
    let live = true;
    const seasonId = chosenSeasonId;
    listAll<EventCard>(rpc, 'listEvents', {
      season_id: seasonId,
      limit: LIST_EVENTS_MAX_LIMIT,
    }).then(
      (items) => {
        if (live) setEvents((known) => ({ ...known, [seasonId]: items }));
      },
      () => {
        if (live) setServerSilent(true);
      },
    );
    return () => {
      live = false;
    };
  }, [online, chosenSeasonId]);

  const defaultEventId = settings?.active_event_id ?? null;
  const defaultSeasonId = settings?.active_season_id ?? null;
  const allEvents = Object.values(events).flat();
  const defaultName = allEvents.find((e) => e.id === defaultEventId)?.name ?? null;
  const workingOn = override?.eventId ?? defaultEventId;
  const chosenSeason = seasons.find((s) => s.id === chosenSeasonId) ?? null;
  const shownEvents = [...(chosenSeasonId ? (events[chosenSeasonId] ?? []) : [])].sort(bySortOrder);

  /**
   * The default is read again at the moment of choosing (branch review, finding 4): the
   * admin can move it while this page is open, and the shell follows. Judged against the
   * page's first read, the new default would become an "override" that pauses entries on
   * the very competition they belong to.
   */
  async function choose(event: EventCard) {
    const latest = (await cachedRows<AppSettings>('app_settings'))[0] ?? null;
    setSettings(latest);
    if (event.id === (latest?.active_event_id ?? null)) sessionOverride.clear();
    else sessionOverride.set(event.id, event.name);
  }

  const defaultLabel = defaultName ?? 'the default competition';

  return (
    <section aria-labelledby="context-title" className="mt-10">
      <h2 id="context-title" className="text-lg font-semibold">
        Competitions
      </h2>
      <p className="mt-1 max-w-prose text-sm text-text-muted">
        This device works on the competition an admin set as the default. You can look at another
        one for this session; reopening the app always returns to the default.
      </p>

      {override && (
        <Notice
          role="status"
          tone="warning"
          className="mt-4"
          action={
            <Button variant="secondary" onClick={() => sessionOverride.clear()}>
              <span dir="auto">Back to {defaultLabel}</span>
            </Button>
          }
        >
          You are looking at {override.eventName ?? 'another competition'} only for this session.
          You cannot create new entries here, and reopening the app returns to {defaultLabel}.
        </Notice>
      )}

      {!online ? (
        <p className="mt-4 text-sm text-text-muted">{OFFLINE_CONTEXT_LINE}</p>
      ) : (
        serverSilent && <p className="mt-4 text-sm text-text-muted">{SERVER_SILENT_LINE}</p>
      )}

      {cacheRead && seasons.length === 0 ? (
        <p className="mt-6 text-text-muted">No competition is set up on this device yet.</p>
      ) : (
        <section className="mt-6" aria-labelledby="context-seasons">
          <h3 id="context-seasons" className="text-sm font-medium text-text-muted">
            Seasons
          </h3>
          <ul
            aria-label="Seasons"
            className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {seasons.map((season) => {
              const isDefault = season.id === defaultSeasonId;
              const chosen = season.id === chosenSeasonId;
              return (
                <li key={season.id}>
                  <button
                    type="button"
                    aria-pressed={chosen}
                    disabled={!online && !isDefault}
                    className={cn(CARD, chosen && CARD_SELECTED)}
                    onClick={() => setChosenSeasonId(season.id)}
                  >
                    <span className="text-2xl font-semibold tabular-nums">{season.year}</span>
                    <span dir="auto" className="text-sm text-text-muted">
                      {season.game_name}
                    </span>
                    {isDefault && <Badge className="mt-2">Default season</Badge>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {chosenSeason && (
        <section className="mt-8" aria-labelledby="context-events">
          <h3 id="context-events" className="text-sm font-medium text-text-muted">
            Events in {chosenSeason.year} <span dir="auto">{chosenSeason.game_name}</span>
          </h3>
          {shownEvents.length === 0 ? (
            <p className="mt-3 text-text-muted">
              {online
                ? 'This season has no events yet.'
                : 'This season’s events need a connection to the server.'}
            </p>
          ) : (
            <ul
              aria-label={`Events in ${chosenSeason.year} ${chosenSeason.game_name}`}
              className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {shownEvents.map((event) => {
                const isDefault = event.id === defaultEventId;
                const isCurrent = event.id === workingOn;
                // One marker per card. "Current" is the event this session works on: the
                // default, or the override while one is set.
                const marker = isCurrent
                  ? override
                    ? 'Current, this session only'
                    : 'Current'
                  : isDefault
                    ? 'Default'
                    : null;
                return (
                  <li key={event.id}>
                    <button
                      type="button"
                      aria-pressed={isCurrent}
                      disabled={!online && !isDefault}
                      className={cn(CARD, isCurrent && CARD_SELECTED)}
                      onClick={() => void choose(event)}
                    >
                      <span dir="auto" className="text-lg font-semibold">
                        {event.name}
                      </span>
                      {marker && (
                        <Badge tone={isCurrent ? 'success' : 'neutral'} className="mt-2">
                          {marker}
                        </Badge>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <footer className="mt-16 border-t border-border pt-4 text-center text-xs text-text-muted">
        version {clientConfig().appVersion}
      </footer>
    </section>
  );
}
