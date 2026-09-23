import { db } from '@/data/db';

/** SPEC-FINAL 7.6: a scouter may edit their own entry for five minutes after creating it. */
export const SELF_EDIT_WINDOW_MS = 5 * 60 * 1000;

export type LocalEntry = {
  id: string;
  event_id: string;
  form_kind: 'match' | 'super';
  form_version_id: string;
  match_id: string | null;
  team_id: string;
  alliance: 'red' | 'blue' | null;
  scouter_id: string;
  robot_status: string | null;
  breakdown_seconds: number | null;
  data: Record<string, unknown>;
  client_created_at: string;
  deleted_at: string | null;
};

type LogicalKey = {
  eventId: string;
  formKind: 'match' | 'super';
  matchId: string | null;
  teamId: string;
};

/**
 * Every live entry this device holds for the event — its own optimistic writes and the
 * rows it has pulled. This is the device-local view only; two devices that each create
 * one while offline is the duplicate path of SPEC-FINAL 9.5, not something this sees.
 */
export async function localEntries(eventId: string): Promise<LocalEntry[]> {
  const rows = await db.rows.where('entity').equals('scouting_entries').toArray();
  return (rows as unknown as LocalEntry[]).filter(
    (row) => row.event_id === eventId && row.deleted_at == null,
  );
}

export function matchesKey(entry: LocalEntry, key: LogicalKey): boolean {
  return (
    entry.event_id === key.eventId &&
    entry.form_kind === key.formKind &&
    entry.team_id === key.teamId &&
    (entry.match_id ?? null) === key.matchId &&
    entry.deleted_at == null
  );
}

export async function findLocalEntry(key: LogicalKey): Promise<LocalEntry | undefined> {
  return (await localEntries(key.eventId)).find((entry) => matchesKey(entry, key));
}

export function editableUntil(entry: LocalEntry): Date {
  return new Date(Date.parse(entry.client_created_at) + SELF_EDIT_WINDOW_MS);
}

/**
 * Phase 1A has no roles on the device yet, so this applies the scouter rule to
 * everyone: only the author, and only inside the window. Leads edit any time (7.2)
 * once login lands.
 */
export function canSelfEdit(entry: LocalEntry, authorUserId: string, now: Date): boolean {
  return entry.scouter_id === authorUserId && now < editableUntil(entry);
}
