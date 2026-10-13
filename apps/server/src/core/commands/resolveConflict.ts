import {
  AppError,
  assertCan,
  resolveConflictInput,
  type Caller,
  type ResolveConflictInput,
  type ResolveConflictOutput,
} from '@frc/shared';
import type { StoredConflict, StoredRow, UseCaseContext } from '../context.js';
import { pgCode } from '../seasonRows.js';
import { parseInput } from './users.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  resolveConflictInput,
  resolveConflictOutput,
  type ResolveConflictInput,
  type ResolveConflictOutput,
} from '@frc/shared';

/**
 * The columns of a superseded copy that a restore writes: the entry's content. Everything
 * else is the server's or the row's own — id, scouter_id, version, created_at, updated_at,
 * deleted_at, client_created_at — and client_updated_at comes from the conflict row. Only
 * known columns, because an existing-wins divergence stored the OPERATION's payload, which
 * was never written to the table and may carry a key that is not a column.
 */
const ENTRY_CONTENT_COLUMNS = [
  'form_version_id',
  'form_kind',
  'event_id',
  'match_id',
  'team_id',
  'alliance',
  'robot_status',
  'breakdown_seconds',
  'data',
] as const;

const noSuchConflict = (id: string) =>
  new AppError('not-found', 'that conflict does not exist; it may have been deleted', {
    conflict_id: id,
  });

const rowGone = (id: string) =>
  new AppError('not-found', 'an entry this conflict names no longer exists', { row_id: id });

/** A stored row minus the two stamps the database owns, ready to be written back. */
function withoutStamps(row: StoredRow): Record<string, unknown> {
  const { created_at: _c, updated_at: _u, ...rest } = row;
  return rest;
}

/**
 * The live row becomes the superseded copy in full (SPEC-FINAL 9.5): its content columns
 * from the payload, its client_updated_at from the conflict, and its own id, author,
 * self-edit window and deleted_at kept. The version moves on, so every device pulls it.
 */
function restoredRow(live: StoredRow, conflict: StoredConflict): Record<string, unknown> {
  const payload = conflict.superseded_payload ?? {};
  const content = Object.fromEntries(
    ENTRY_CONTENT_COLUMNS.filter((key) => key in payload).map((key) => [key, payload[key]]),
  );
  return {
    ...withoutStamps(live),
    ...content,
    id: live.id,
    scouter_id: live.scouter_id,
    client_created_at: live.client_created_at,
    client_updated_at: conflict.superseded_client_updated_at ?? live.client_updated_at,
    deleted_at: live.deleted_at ?? null,
    version: live.version + 1,
  };
}

/**
 * The entry write that follows a taken resolution. If it fails, the resolution is undone
 * (only the one this call made), so the card reopens and a retry can settle it rather than
 * meeting `conflict` over a row that was never rewritten.
 */
async function writeAfterResolving(
  ctx: UseCaseContext,
  conflictId: string,
  resolvedAt: string,
  write: () => Promise<void>,
): Promise<void> {
  try {
    await write();
  } catch (e) {
    try {
      await ctx.store.reopenConflictRow(conflictId, resolvedAt);
    } catch (reopen) {
      const message = reopen instanceof Error ? reopen.message : String(reopen);
      console.error(`resolveConflict: could not reopen ${conflictId}: ${message}`);
    }
    if (pgCode(e) === '23503') {
      throw new AppError('parent-deleted', 'a record this entry belongs to no longer exists', {
        conflict_id: conflictId,
      });
    }
    throw e;
  }
}

/**
 * SPEC-FINAL 9.5 (task 1.41): a lead or admin settles one conflict. A `service` caller and
 * a scouter are refused (`forbidden`). A divergence takes `{ keep: 'live' }` (nothing is
 * rewritten) or `{ keep: 'superseded' }` (the row becomes that copy, version + 1); a
 * duplicate takes `{ keep_row_id }`, one of its two rows, and the other is soft-deleted.
 * The wrong shape for the kind, or a row that is not one of the two, is `invalid`; an
 * unknown conflict, or one naming an entry that no longer exists, is `not-found`.
 *
 * Resolution sets resolved_at, resolved_by and `resolution` — the choice exactly as given.
 * The conflict row is resolved FIRST, by one conditional update (`where resolved_at is
 * null`), and only the call that takes it writes an entry: a second resolve, even one
 * racing the first, is `conflict` and touches no entry row. There is no server undo: the
 * client delays the send instead.
 */
export async function resolveConflict(
  caller: Caller,
  input: ResolveConflictInput,
  ctx: UseCaseContext,
): Promise<ResolveConflictOutput> {
  assertCan(caller, 'resolve_conflict');
  if (caller.kind !== 'user') throw new AppError('forbidden', 'a service caller may not resolve');
  const { conflict_id: conflictId, resolution } = parseInput(resolveConflictInput, input);

  const conflict = await ctx.store.getConflict(conflictId);
  if (!conflict) throw noSuchConflict(conflictId);
  if (conflict.resolved_at != null) {
    throw new AppError('conflict', 'this conflict is already resolved', {
      conflict_id: conflictId,
      resolved_at: conflict.resolved_at,
    });
  }
  // Pick-list and alliance conflicts arrive with phase 1G.
  if (conflict.entity !== 'scouting_entry') {
    throw new AppError('invalid', `a ${conflict.entity} conflict cannot be resolved yet`);
  }

  const at = ctx.now().toISOString();
  const take = async (): Promise<void> => {
    const took = await ctx.store.resolveConflictRow(conflictId, {
      resolved_at: at,
      resolved_by: caller.userId,
      resolution,
    });
    if (!took) {
      throw new AppError('conflict', 'this conflict is already resolved', {
        conflict_id: conflictId,
      });
    }
  };
  const answer = { conflict_id: conflictId, resolved_at: at, resolution };

  if (conflict.kind === 'divergence') {
    if (!('keep' in resolution)) {
      throw new AppError(
        'invalid',
        "a divergence is resolved with { keep: 'live' | 'superseded' }",
      );
    }
    const live = await ctx.store.getRow('scouting_entry', conflict.row_id);
    if (!live) throw rowGone(conflict.row_id);
    if (resolution.keep === 'live') {
      await take();
      return { ...answer, row_id: live.id, new_version: null, soft_deleted: null };
    }
    if (conflict.superseded_payload === null) {
      throw new AppError('invalid', 'this conflict holds no superseded copy to restore');
    }
    const restored = restoredRow(live, conflict);
    await take();
    await writeAfterResolving(ctx, conflictId, at, () =>
      ctx.store.putRow('scouting_entry', live.id, restored),
    );
    return { ...answer, row_id: live.id, new_version: live.version + 1, soft_deleted: null };
  }

  if (!('keep_row_id' in resolution)) {
    throw new AppError('invalid', 'a duplicate is resolved with { keep_row_id }');
  }
  const pair = [conflict.row_id, conflict.duplicate_row_id];
  if (conflict.duplicate_row_id === null || !pair.includes(resolution.keep_row_id)) {
    throw new AppError('invalid', 'keep_row_id must be one of the two rows of this conflict', {
      row_ids: pair,
    });
  }
  const otherId = (
    resolution.keep_row_id === conflict.row_id ? conflict.duplicate_row_id : conflict.row_id
  ) as string;
  const [kept, other] = await Promise.all([
    ctx.store.getRow('scouting_entry', resolution.keep_row_id),
    ctx.store.getRow('scouting_entry', otherId),
  ]);
  if (!kept) throw rowGone(resolution.keep_row_id);
  if (!other) throw rowGone(otherId);
  if (kept.deleted_at != null) {
    throw new AppError('invalid', 'that copy has been deleted; keep the other one', {
      row_id: kept.id,
    });
  }
  await take();
  // The other row may already be soft-deleted (a lead deleted it from the entry page):
  // then there is nothing left to write.
  if (other.deleted_at != null) {
    return { ...answer, row_id: kept.id, new_version: null, soft_deleted: null };
  }
  const newVersion = other.version + 1;
  await writeAfterResolving(ctx, conflictId, at, () =>
    ctx.store.putRow('scouting_entry', other.id, {
      ...withoutStamps(other),
      deleted_at: at,
      version: newVersion,
    }),
  );
  return {
    ...answer,
    row_id: kept.id,
    new_version: null,
    soft_deleted: { row_id: other.id, new_version: newVersion },
  };
}
