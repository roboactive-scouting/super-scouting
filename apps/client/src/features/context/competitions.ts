import type { EventRow, SeasonRow } from '@frc/shared';
import { cachedRows } from '@/data/cache';
import type { Rpc } from '@/data/rpc';

export type SeasonCard = Pick<SeasonRow, 'id' | 'year' | 'game_name'>;
export type EventCard = Pick<EventRow, 'id' | 'season_id' | 'name' | 'sort_order'>;
type AppSettings = { active_season_id: string | null; active_event_id: string | null };

/** Page bound for following `next_cursor`: 10 pages of 200 is far past any real list. */
const MAX_PAGES = 10;

/** Every page of a cursor-paged list use case. */
export async function listAll<T>(
  rpc: Rpc,
  name: string,
  input: Record<string, unknown>,
): Promise<T[]> {
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

/** The admin default as this device last pulled it. */
export async function latestSettings(): Promise<{
  seasonId: string | null;
  eventId: string | null;
}> {
  const row = (await cachedRows<AppSettings>('app_settings'))[0];
  return { seasonId: row?.active_season_id ?? null, eventId: row?.active_event_id ?? null };
}

/**
 * What the device holds: the pull scopes seasons and events to the admin default, so
 * offline this is the whole choice. Seasons newest first; events grouped by season.
 */
export async function readCompetitionCache() {
  const [settings, seasons, events] = await Promise.all([
    latestSettings(),
    cachedRows<SeasonCard>('seasons'),
    cachedRows<EventCard>('events'),
  ]);
  const grouped: Record<string, EventCard[]> = {};
  for (const e of events) (grouped[e.season_id] ??= []).push(e);
  return {
    ...settings,
    seasons: [...seasons].sort((a, b) => b.year - a.year),
    events: grouped,
  };
}
