import { can, canEditEntry, SELF_EDIT_WINDOW_MS, type Role } from '@frc/shared';
import { db } from '@/data/db';

/** Who is editing: the signed-in user (SessionUser satisfies this). */
export type Editor = { id: string; role: Role };

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
 * SPEC-FINAL 7.6, through the one shared rule the server also applies (`canEditEntry` in
 * packages/shared): a lead or admin (`manage_entries`) edits any entry at any time; a
 * scouter only their own, inside the five-minute window measured from
 * `client_created_at` — here, to `now` on this device's clock.
 */
export function canSelfEdit(entry: LocalEntry, editor: Editor, now: Date): boolean {
  return canEditEntry(
    { kind: 'user', userId: editor.id, role: editor.role },
    {
      scouter_id: entry.scouter_id,
      client_created_at: entry.client_created_at,
      client_updated_at: now.toISOString(),
    },
  );
}

/** True when the editor's role lifts the window entirely (7.6: leads and admins). */
export function editsAnyTime(editor: Editor): boolean {
  return can({ kind: 'user', userId: editor.id, role: editor.role }, 'manage_entries');
}
