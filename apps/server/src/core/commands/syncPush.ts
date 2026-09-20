import {
  isUser,
  validateEntryData,
  validateEntryShape,
  type Caller,
  type Operation,
  type PushRequest,
  type PushResponse,
  type PushResult,
  type RejectionReason,
  type RobotStatus,
} from '@frc/shared';
import type { UseCaseContext } from '../context.js';

const rejected = (opId: string, reason: RejectionReason, detail?: string): PushResult =>
  detail === undefined
    ? { op_id: opId, status: 'rejected', reason }
    : { op_id: opId, status: 'rejected', reason, detail };

/**
 * SPEC-FINAL 9.3.1. Operations are applied in seq order, each independently; a
 * rejection does not stop the batch. op_id is the idempotency key. Authorization is
 * per operation, against the operation's author_user_id and not against the bearer
 * (7.5) — which is what makes a shared collector tablet work at all.
 *
 * Divergence, duplicate and parent-deleted arrive in task 1.40. Until then a stale
 * base version is rejected as `invalid` rather than silently overwriting.
 */
export async function syncPush(
  caller: Caller,
  input: PushRequest,
  ctx: UseCaseContext,
): Promise<PushResponse> {
  const ordered = [...input.operations].sort((a, b) => a.seq - b.seq);
  const results: PushResult[] = [];

  for (const op of ordered) {
    results.push(await applyOne(caller, op, ctx));
  }
  return { results };
}

async function applyOne(caller: Caller, op: Operation, ctx: UseCaseContext): Promise<PushResult> {
  if (!isUser(caller)) return rejected(op.op_id, 'forbidden', 'a service caller may not push');

  const author = await ctx.store.getUser(op.author_user_id);
  if (!author) return rejected(op.op_id, 'forbidden', 'unknown author');
  if (author.disabled_at !== null) return rejected(op.op_id, 'forbidden', 'the author is disabled');

  if (await ctx.store.wasApplied(op.op_id)) {
    const existing = await ctx.store.getRow(op.entity, op.row_id);
    return {
      op_id: op.op_id,
      status: 'noop',
      row_id: op.row_id,
      new_version: existing?.version ?? 1,
    };
  }

  if (op.entity === 'match') return applyBareMatch(op, ctx);
  if (op.entity !== 'scouting_entry') {
    return rejected(op.op_id, 'invalid', `entity '${op.entity}' is not accepted yet`);
  }
  return applyEntry(op, ctx);
}

async function applyBareMatch(op: Operation, ctx: UseCaseContext): Promise<PushResult> {
  // SPEC-FINAL 6.4: the bare auto-creation only — event, type, number. A no-op if it exists.
  const existing = await ctx.store.getRow('match', op.row_id);
  if (existing) {
    await ctx.store.markApplied(op.op_id);
    return { op_id: op.op_id, status: 'noop', row_id: op.row_id, new_version: existing.version };
  }
  const { event_id, match_type, number } = op.payload as Record<string, unknown>;
  if (
    typeof event_id !== 'string' ||
    typeof match_type !== 'string' ||
    typeof number !== 'number'
  ) {
    return rejected(op.op_id, 'invalid', 'a bare match needs event_id, match_type and number');
  }
  await ctx.store.putRow('match', op.row_id, {
    id: op.row_id,
    event_id,
    match_type,
    number,
    version: 1,
  });
  await ctx.store.markApplied(op.op_id);
  return { op_id: op.op_id, status: 'applied', row_id: op.row_id, new_version: 1 };
}

async function applyEntry(op: Operation, ctx: UseCaseContext): Promise<PushResult> {
  const payload = op.payload as Record<string, unknown>;
  const existing = await ctx.store.getRow('scouting_entry', op.row_id);

  if (op.action === 'delete') {
    if (!existing) return rejected(op.op_id, 'invalid', 'no such entry');
    await ctx.store.putRow('scouting_entry', op.row_id, {
      ...existing,
      deleted_at: ctx.now().toISOString(),
      version: existing.version + 1,
      client_updated_at: op.client_updated_at,
    });
    await ctx.store.markApplied(op.op_id);
    return {
      op_id: op.op_id,
      status: 'applied',
      row_id: op.row_id,
      new_version: existing.version + 1,
    };
  }

  if (existing && op.base_version !== existing.version) {
    // Task 1.40 turns this into the divergence path of SPEC-FINAL 9.5.
    return rejected(op.op_id, 'invalid', `stale base version ${op.base_version}`);
  }

  const formVersionId = payload.form_version_id;
  if (typeof formVersionId !== 'string') {
    return rejected(op.op_id, 'invalid', 'form_version_id is required');
  }
  // SPEC-FINAL 3.5: the cross-column rules first, then the JSONB payload.
  const shapeIssues = validateEntryShape({
    form_kind: payload.form_kind as 'match' | 'super',
    match_id: (payload.match_id as string | null) ?? null,
    alliance: (payload.alliance as 'red' | 'blue' | null) ?? null,
    robot_status: (payload.robot_status as RobotStatus | null) ?? null,
    breakdown_seconds: (payload.breakdown_seconds as number | null) ?? null,
  });
  if (shapeIssues.length > 0) return rejected(op.op_id, 'invalid', shapeIssues.join('; '));

  const fields = await ctx.store.getFormFields(formVersionId);
  const status = (payload.robot_status as RobotStatus | null) ?? 'played';
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const validation = validateEntryData(fields, status, data);
  if (!validation.ok) {
    return rejected(op.op_id, 'invalid', validation.issues.map((i) => i.message).join('; '));
  }

  const version = existing ? existing.version + 1 : 1;
  await ctx.store.putRow('scouting_entry', op.row_id, {
    ...payload,
    id: op.row_id,
    scouter_id: op.author_user_id,
    version,
    client_created_at: op.client_created_at,
    client_updated_at: op.client_updated_at,
    deleted_at: null,
  });
  await ctx.store.markApplied(op.op_id);
  return { op_id: op.op_id, status: 'applied', row_id: op.row_id, new_version: version };
}
