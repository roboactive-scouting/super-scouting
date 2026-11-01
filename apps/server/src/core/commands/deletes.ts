import {
  AppError,
  assertCan,
  deleteEntryInput,
  type Caller,
  type DeleteEntryInput,
  type DeleteEntryOutput,
} from '@frc/shared';
import type { StoredRow, UseCaseContext } from '../context.js';
import { parseInput } from './users.js';

/**
 * Task 1.60: every admin delete in one place (SPEC-FINAL 3.9). The hard cascades stay
 * beside their objects — season and event in deleteCompetition.ts (RB.20), form and form
 * version in forms.ts (task 1.27), match (with its entries, task 1.60) in matches.ts — and
 * are re-exported here; the entry soft delete is this module's own.
 */
export { deleteEvent, deleteSeason } from './deleteCompetition.js';
export { deleteForm, deleteFormVersion } from './forms.js';
export { deleteMatch } from './matches.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  deleteEntryInput,
  deleteEntryOutput,
  type DeleteEntryInput,
  type DeleteEntryOutput,
} from '@frc/shared';

/**
 * SPEC-FINAL 3.10, 7.6: what a soft delete writes — the row as it is, with `deleted_at`,
 * the next revision and the client clock of the change. The updated_at trigger moves the
 * row into every device's delta pull, so this IS the tombstone. One rule for both ways in:
 * a `delete` push operation (syncPush) and the online deleteEntry.
 */
export function softDeletedRow(
  existing: StoredRow,
  deletedAt: string,
  clientUpdatedAt: string,
): StoredRow {
  return {
    ...existing,
    deleted_at: deletedAt,
    version: existing.version + 1,
    client_updated_at: clientUpdatedAt,
  };
}

/**
 * SPEC-FINAL 3.9, 7.6: a lead or admin soft-deletes one entry. Scouters never delete — their
 * own entry included — and a service caller never (`manage_entries` is lead/admin only).
 * The row stays; it stops counting once devices pull the tombstone. An entry already
 * soft-deleted answers as deleted and is not written again, so a retry does not bump it.
 * The change has no client clock of its own, so `client_updated_at` is the server's.
 */
export async function deleteEntry(
  caller: Caller,
  input: DeleteEntryInput,
  ctx: UseCaseContext,
): Promise<DeleteEntryOutput> {
  assertCan(caller, 'manage_entries');
  const parsed = parseInput(deleteEntryInput, input);
  const existing = await ctx.store.getRow('scouting_entry', parsed.entry_id);
  if (!existing) {
    throw new AppError('not-found', 'that entry does not exist', { entry_id: parsed.entry_id });
  }
  if (existing.deleted_at != null) {
    return { id: existing.id, deleted: true, version: existing.version };
  }
  const at = ctx.now().toISOString();
  const row = softDeletedRow(existing, at, at);
  await ctx.store.putRow('scouting_entry', existing.id, row);
  return { id: existing.id, deleted: true, version: row.version };
}
