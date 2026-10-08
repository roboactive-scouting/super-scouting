import { z } from 'zod';

/** SPEC-FINAL 9.4. `match` covers only the bare auto-creation of 6.4. */
export const SYNC_ENTITIES = [
  'scouting_entry',
  'match',
  'pick_list',
  'pick_list_entry',
  'do_not_pick',
  'alliance_slot',
  'alliance_decline',
] as const;

export type SyncEntity = (typeof SYNC_ENTITIES)[number];
export type OperationAction = 'create' | 'update' | 'delete';

/**
 * Liberal in what it accepts, strict in what it hands on (UF.12): an ISO timestamp with `Z`
 * or an offset — a pulled row carries Postgres's `…+00:00`, and a client before UF.12 copied
 * it into an edit — always comes out as UTC `Z`, so nothing downstream ever compares a
 * mixed pair as strings. The client still sends `Z`.
 */
const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .transform((value, ctx) => {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
      ctx.addIssue({ code: 'custom', message: 'Invalid datetime' });
      return z.NEVER;
    }
    return new Date(ms).toISOString();
  });

export const operationSchema = z
  .object({
    op_id: z.string().min(1),
    entity: z.enum(SYNC_ENTITIES),
    row_id: z.string().uuid(),
    action: z.enum(['create', 'update', 'delete']),
    base_version: z.number().int().positive().nullable(),
    /** Always the whole row, never a patch. Field-level merging does not exist. */
    payload: z.record(z.unknown()),
    author_user_id: z.string().uuid(),
    client_created_at: isoDateTime,
    client_updated_at: isoDateTime,
    seq: z.number().int().nonnegative(),
  })
  .superRefine((op, ctx) => {
    if (op.action === 'create' && op.base_version !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['base_version'],
        message: 'a create has no base version',
      });
    }
    if (op.action !== 'create' && op.base_version === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['base_version'],
        message: 'an edit must name its base version',
      });
    }
    if (op.action === 'delete' && Object.keys(op.payload).length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['payload'],
        message: 'a delete carries an empty payload',
      });
    }
  });

export type Operation = z.infer<typeof operationSchema>;
