import type { FormFieldDefinition, PullEntityKey } from '@frc/shared';
import { db } from './db';

export async function cachedRows<T = Record<string, unknown>>(entity: PullEntityKey): Promise<T[]> {
  return (await db.rows.where('entity').equals(entity).toArray()) as unknown as T[];
}

/**
 * Task 1.40 (spec 7.5 item 1): a cleared match slot reaches the device as a `match_teams`
 * row with `deleted_at` set, so the removal replaces the stale row. It is not a slot: drop it.
 */
export function liveSlots<T extends { deleted_at?: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => row.deleted_at == null);
}

/** The cached `match_teams` rows that are filled slots — every reader of the line-up uses this. */
export async function cachedLiveSlots<T = Record<string, unknown>>(): Promise<T[]> {
  const rows = await cachedRows<T & { deleted_at?: string | null }>('match_teams');
  return liveSlots(rows);
}

export async function cachedFormFields(formVersionId: string): Promise<FormFieldDefinition[]> {
  const all = await cachedRows<FormFieldDefinition & { form_version_id: string }>('form_fields');
  return all
    .filter((f) => f.form_version_id === formVersionId && !f.deprecated)
    .sort((a, b) => a.display_order - b.display_order);
}

export async function cachedEntry(rowId: string): Promise<Record<string, unknown> | undefined> {
  return db.rows.get(['scouting_entries', rowId]);
}

/** The cached event's name, or null when this device holds no row for it. */
export async function cachedEventName(eventId: string): Promise<string | null> {
  const row = await db.rows.get(['events', eventId]);
  return typeof row?.name === 'string' ? row.name : null;
}

/**
 * The open conflicts of the current event as this device last pulled them (SPEC-FINAL 9.5): the
 * Sync page's conflicts link and the Conflicts nav row's count (moved from syncList.ts, task 1.44,
 * so the shell does not pull the Sync page's module into the main bundle).
 */
export async function openConflictCount(eventId: string | null): Promise<number> {
  if (eventId === null) return 0;
  const rows = await cachedRows<{ event_id?: string; resolved_at?: string | null }>(
    'sync_conflicts',
  );
  return rows.filter((r) => r.event_id === eventId && r.resolved_at == null).length;
}
