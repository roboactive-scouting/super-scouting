import { useEffect, useState } from 'react';
import { QUERY_ENTRIES_MAX_LIMIT, type EntrySummary, type QueryEntriesOutput } from '@frc/shared';
import type { Rpc } from '@/data/rpc';
import { useCapability } from '@/lib/useCapability';
import { timeLabel, type EntryRow } from './useEntriesView';

/**
 * At most this many pages of `queryEntries` (200 a page): an event holds a few hundred entries
 * (about 70 qualification matches × 6, plus the super entries), so 2,000 is far above it.
 */
export const MAX_PAGES = 10;

/**
 * One server entry as the list's row. The server scored it (`scouted_points`: null for a no-show,
 * a disabled robot and a super entry, never 0). Waiting, refused and the line-up are this
 * device's states and say nothing about another event's rows: all off.
 */
export function rowFromSummary(item: EntrySummary, now: Date): EntryRow {
  const kind = item.form_kind === 'super' ? 'super' : 'match';
  return {
    id: item.id,
    kind,
    matchLabel: kind === 'super' ? '' : (item.match_label ?? ''),
    matchNumber: kind === 'super' ? null : item.match_number,
    teamNumber: item.team_number,
    teamName: item.team_name,
    status: kind === 'super' ? null : item.robot_status,
    scouter: item.scouter_name ?? '',
    scouterId: item.scouter_id,
    time: timeLabel(item.client_created_at, now),
    points: kind === 'super' ? null : item.scouted_points,
    waiting: false,
    unsent: false,
    refused: null,
    notInLineup: false,
    look: false,
  };
}

/** Every live entry of `eventId` from the server, newest first (the server's order), both kinds. */
export async function serverEntryRows(rpc: Rpc, eventId: string): Promise<EntryRow[]> {
  const items: EntrySummary[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const out = (await rpc.call('queryEntries', {
      event_id: eventId,
      limit: QUERY_ENTRIES_MAX_LIMIT,
      ...(cursor ? { cursor } : {}),
    })) as QueryEntriesOutput;
    items.push(...out.items);
    if (!out.next_cursor) break;
    cursor = out.next_cursor;
  }
  const now = new Date();
  return items.map((item) => rowFromSummary(item, now));
}

export type ServerEntries =
  | { status: 'offline' }
  | { status: 'loading' }
  | { status: 'failed'; retry: () => void }
  | { status: 'ok'; rows: EntryRow[] };

type Remote =
  | { key: string; status: 'loading' }
  | { key: string; status: 'ok'; rows: EntryRow[] }
  | { key: string; status: 'failed' };

/**
 * The Entries list under a session override (SPEC-FINAL 6.3: "the client asks the server"): the
 * device holds only the default event, so the overridden event's entries are a server read, held
 * offline through `cross_event_view` (9.6). Read once per event; search, kind and chip then run
 * in memory over the rows, as on the device path.
 */
export function useServerEntries(rpc: Rpc, eventId: string): ServerEntries {
  const canView = useCapability('cross_event_view');
  const [retry, setRetry] = useState(0);
  const key = `${eventId}|${retry}`;
  const [remote, setRemote] = useState<Remote | null>(null);
  useEffect(() => {
    if (!canView) return;
    let live = true;
    setRemote({ key, status: 'loading' });
    serverEntryRows(rpc, eventId).then(
      (rows) => live && setRemote({ key, status: 'ok', rows }),
      () => live && setRemote({ key, status: 'failed' }),
    );
    return () => {
      live = false;
    };
    // rpc is an injected dependency held stable by the caller; a reconnect asks again.
  }, [key, canView]);
  if (!canView) return { status: 'offline' };
  const current = remote?.key === key ? remote : null;
  if (current?.status === 'ok') return { status: 'ok', rows: current.rows };
  if (current?.status === 'failed')
    return { status: 'failed', retry: () => setRetry((n) => n + 1) };
  return { status: 'loading' };
}
