import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '@frc/shared';
import { resolveConflict } from './resolveConflict.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';

const scouter: Caller = { kind: 'user', userId: 'u-s', role: 'scouter' };
const lead: Caller = { kind: 'user', userId: 'u-l', role: 'lead' };

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  ctx.rows.scouting_entries.set('e-1', {
    id: 'e-1',
    version: 4,
    event_id: 'ev-1',
    data: { auto_notes: 9 },
    client_updated_at: '2026-11-14T09:09:00.000Z',
    deleted_at: null,
    scouter_id: 'u-s',
  } as never);
  ctx.rows.scouting_entries.set('e-2', {
    id: 'e-2',
    version: 1,
    event_id: 'ev-1',
    data: { auto_notes: 3 },
    client_updated_at: '2026-11-14T09:08:00.000Z',
    deleted_at: null,
    scouter_id: 'u-s',
  } as never);
  ctx.conflicts.set('c-div', {
    id: 'c-div',
    event_id: 'ev-1',
    entity: 'scouting_entry',
    row_id: 'e-1',
    kind: 'divergence',
    superseded_payload: { data: { auto_notes: 4 } },
    superseded_author_id: 'u-s',
    superseded_client_updated_at: '2026-11-14T09:07:00.000Z',
    base_version: 1,
    resolved_at: null,
  } as never);
  ctx.conflicts.set('c-dup', {
    id: 'c-dup',
    event_id: 'ev-1',
    entity: 'scouting_entry',
    row_id: 'e-2',
    kind: 'duplicate',
    duplicate_row_id: 'e-1',
    resolved_at: null,
  } as never);
});

describe('resolveConflict (SPEC-FINAL 9.5)', () => {
  it('refuses a scouter — a flagged row is not settled until a lead or admin acts', async () => {
    await expect(
      resolveConflict(scouter, { conflict_id: 'c-div', resolution: { keep: 'live' } }, ctx),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(ctx.conflicts.get('c-div')!.resolved_at).toBeNull();
  });

  it('keeps the live copy and records who resolved it', async () => {
    await resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'live' } }, ctx);
    const conflict = ctx.conflicts.get('c-div')!;
    expect(conflict.resolved_at).not.toBeNull();
    expect(conflict.resolved_by).toBe('u-l');
    expect(ctx.rows.scouting_entries.get('e-1')!.data).toEqual({ auto_notes: 9 });
  });

  it('restores the superseded copy in full and bumps the version', async () => {
    await resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'superseded' } }, ctx);
    const row = ctx.rows.scouting_entries.get('e-1')!;
    expect(row.data).toEqual({ auto_notes: 4 });
    expect(row.version).toBe(5);
  });

  it('resolves a duplicate by soft-deleting the row that was not chosen', async () => {
    await resolveConflict(lead, { conflict_id: 'c-dup', resolution: { keep_row_id: 'e-1' } }, ctx);
    expect(ctx.rows.scouting_entries.get('e-2')!.deleted_at).not.toBeNull();
    expect(ctx.rows.scouting_entries.get('e-1')!.deleted_at).toBeNull();
    expect(ctx.conflicts.get('c-dup')!.resolved_at).not.toBeNull();
  });

  it('refuses to keep a row that is not one of the two linked rows', async () => {
    await expect(
      resolveConflict(lead, { conflict_id: 'c-dup', resolution: { keep_row_id: 'e-9' } }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('refuses the wrong resolution shape for the conflict kind', async () => {
    await expect(
      resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep_row_id: 'e-1' } }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('is idempotent-safe: resolving an already-resolved conflict is refused, not silently redone', async () => {
    await resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'live' } }, ctx);
    await expect(
      resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'superseded' } }, ctx),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects a service caller', async () => {
    await expect(
      resolveConflict(
        { kind: 'service', label: 'mcp' },
        { conflict_id: 'c-div', resolution: { keep: 'live' } },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

// Task 1.41 additions (the orchestrator's decisions): beyond the plan's eight.
const admin: Caller = { kind: 'user', userId: 'u-a', role: 'admin' };
const AT = '2026-11-14T10:00:00.000Z'; // the fake clock

const snapshot = () =>
  JSON.parse(JSON.stringify([...ctx.rows.scouting_entries.entries()])) as unknown;

describe('resolveConflict — what it stores and answers (task 1.41)', () => {
  it('stores the choice exactly as given, for each of the three kinds of choice', async () => {
    await resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'live' } }, ctx);
    expect(ctx.conflicts.get('c-div')!.resolution).toEqual({ keep: 'live' });

    ctx.conflicts.set('c-div-2', {
      ...ctx.conflicts.get('c-div')!,
      id: 'c-div-2',
      resolved_at: null,
      resolved_by: null,
      resolution: null,
    });
    await resolveConflict(
      lead,
      { conflict_id: 'c-div-2', resolution: { keep: 'superseded' } },
      ctx,
    );
    expect(ctx.conflicts.get('c-div-2')!.resolution).toEqual({ keep: 'superseded' });

    await resolveConflict(admin, { conflict_id: 'c-dup', resolution: { keep_row_id: 'e-2' } }, ctx);
    expect(ctx.conflicts.get('c-dup')!).toMatchObject({
      resolution: { keep_row_id: 'e-2' },
      resolved_by: 'u-a',
      resolved_at: AT,
    });
  });

  it('moves the conflict row’s updated_at, so devices pull the resolution', async () => {
    ctx.conflicts.set('c-div', {
      ...ctx.conflicts.get('c-div')!,
      updated_at: '2026-11-14T09:07:01.000Z',
    });
    await resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'live' } }, ctx);
    expect(ctx.conflicts.get('c-div')!.updated_at).toBe(AT);
  });

  it('answers what stayed live: keep live rewrites nothing', async () => {
    const out = await resolveConflict(
      lead,
      { conflict_id: 'c-div', resolution: { keep: 'live' } },
      ctx,
    );
    expect(out).toEqual({
      conflict_id: 'c-div',
      resolved_at: AT,
      resolution: { keep: 'live' },
      row_id: 'e-1',
      new_version: null,
      soft_deleted: null,
    });
    expect(ctx.rows.scouting_entries.get('e-1')!.version).toBe(4);
  });

  it('answers the restored row’s new version', async () => {
    const out = await resolveConflict(
      lead,
      { conflict_id: 'c-div', resolution: { keep: 'superseded' } },
      ctx,
    );
    expect(out).toMatchObject({ row_id: 'e-1', new_version: 5, soft_deleted: null });
  });

  it('answers the kept row and the soft-deleted one with its new version', async () => {
    const out = await resolveConflict(
      lead,
      { conflict_id: 'c-dup', resolution: { keep_row_id: 'e-1' } },
      ctx,
    );
    expect(out).toMatchObject({
      row_id: 'e-1',
      new_version: null,
      soft_deleted: { row_id: 'e-2', new_version: 2 },
    });
    expect(ctx.rows.scouting_entries.get('e-2')).toMatchObject({
      deleted_at: AT,
      version: 2,
      data: { auto_notes: 3 },
    });
  });

  it('restoring keeps the row’s own id, scouter and self-edit window, and takes the superseded client time', async () => {
    ctx.rows.scouting_entries.set('e-1', {
      ...ctx.rows.scouting_entries.get('e-1')!,
      client_created_at: '2026-11-14T09:00:00.000Z',
      robot_status: 'played',
      created_at: '2026-11-14T09:00:01.000Z',
      updated_at: '2026-11-14T09:09:01.000Z',
    });
    ctx.conflicts.set('c-div', {
      ...ctx.conflicts.get('c-div')!,
      superseded_payload: {
        id: 'e-other',
        scouter_id: 'u-other',
        client_created_at: '2026-11-14T08:00:00.000Z',
        client_updated_at: '2026-11-14T08:30:00.000Z',
        version: 99,
        deleted_at: '2026-11-14T08:31:00.000Z',
        robot_status: 'no_show',
        data: {},
        not_a_column: 1,
      },
    });
    await resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'superseded' } }, ctx);
    const row = ctx.rows.scouting_entries.get('e-1')!;
    expect(row).toMatchObject({
      id: 'e-1',
      scouter_id: 'u-s',
      client_created_at: '2026-11-14T09:00:00.000Z',
      client_updated_at: '2026-11-14T09:07:00.000Z',
      version: 5,
      deleted_at: null,
      robot_status: 'no_show',
      data: {},
      event_id: 'ev-1',
    });
    // The database's own stamps are not written back: the trigger moves updated_at.
    expect(row).not.toHaveProperty('updated_at');
    expect(row).not.toHaveProperty('created_at');
    expect(row).not.toHaveProperty('not_a_column');
  });

  it('a second resolve of the same conflict is refused and leaves the entry rows untouched', async () => {
    await resolveConflict(lead, { conflict_id: 'c-dup', resolution: { keep_row_id: 'e-1' } }, ctx);
    const before = snapshot();
    await expect(
      resolveConflict(admin, { conflict_id: 'c-dup', resolution: { keep_row_id: 'e-2' } }, ctx),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(snapshot()).toEqual(before);
    expect(ctx.conflicts.get('c-dup')).toMatchObject({
      resolved_by: 'u-l',
      resolution: { keep_row_id: 'e-1' },
    });
  });

  it('two resolves racing: exactly one takes, and only its choice reaches the entry', async () => {
    const results = await Promise.allSettled([
      resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'superseded' } }, ctx),
      resolveConflict(admin, { conflict_id: 'c-div', resolution: { keep: 'live' } }, ctx),
    ]);
    const taken = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r) => r.status === 'rejected');
    expect(taken).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect((refused[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'conflict' });
    const stored = ctx.conflicts.get('c-div')!.resolution as { keep: string };
    const row = ctx.rows.scouting_entries.get('e-1')!;
    if (stored.keep === 'superseded') expect(row.version).toBe(5);
    else expect(row).toMatchObject({ version: 4, data: { auto_notes: 9 } });
  });

  it('answers not-found for an unknown conflict', async () => {
    await expect(
      resolveConflict(lead, { conflict_id: 'c-nope', resolution: { keep: 'live' } }, ctx),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('answers not-found, writing nothing, when the entry a divergence names is gone', async () => {
    ctx.rows.scouting_entries.delete('e-1');
    await expect(
      resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'superseded' } }, ctx),
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(ctx.conflicts.get('c-div')!.resolved_at).toBeNull();
    expect(ctx.rows.scouting_entries.has('e-1')).toBe(false);
  });

  it('answers not-found, writing nothing, when either row of a duplicate is gone', async () => {
    ctx.rows.scouting_entries.delete('e-2');
    await expect(
      resolveConflict(lead, { conflict_id: 'c-dup', resolution: { keep_row_id: 'e-1' } }, ctx),
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(ctx.conflicts.get('c-dup')!.resolved_at).toBeNull();
    expect(ctx.rows.scouting_entries.get('e-1')!.deleted_at).toBeNull();
  });

  it('refuses keeping a copy that is already soft-deleted', async () => {
    ctx.rows.scouting_entries.set('e-1', {
      ...ctx.rows.scouting_entries.get('e-1')!,
      deleted_at: AT,
    });
    await expect(
      resolveConflict(lead, { conflict_id: 'c-dup', resolution: { keep_row_id: 'e-1' } }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(ctx.conflicts.get('c-dup')!.resolved_at).toBeNull();
  });

  it('settles a duplicate whose other row is already soft-deleted without writing it again', async () => {
    const deletedAt = '2026-11-14T09:30:00.000Z';
    ctx.rows.scouting_entries.set('e-2', {
      ...ctx.rows.scouting_entries.get('e-2')!,
      deleted_at: deletedAt,
    });
    const out = await resolveConflict(
      lead,
      { conflict_id: 'c-dup', resolution: { keep_row_id: 'e-1' } },
      ctx,
    );
    expect(out).toMatchObject({ row_id: 'e-1', soft_deleted: null });
    expect(ctx.rows.scouting_entries.get('e-2')).toMatchObject({
      deleted_at: deletedAt,
      version: 1,
    });
    expect(ctx.conflicts.get('c-dup')!.resolved_at).toBe(AT);
  });

  it('refuses a duplicate resolution for a divergence’s sibling shape too', async () => {
    await expect(
      resolveConflict(lead, { conflict_id: 'c-dup', resolution: { keep: 'live' } }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(ctx.conflicts.get('c-dup')!.resolved_at).toBeNull();
  });

  it('refuses a malformed resolution as invalid', async () => {
    await expect(
      resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'both' } } as never, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('reopens the conflict when the entry write fails, so a retry can settle it', async () => {
    const putRow = ctx.store.putRow;
    ctx.store.putRow = async () => {
      throw new Error('connection reset');
    };
    await expect(
      resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'superseded' } }, ctx),
    ).rejects.toThrow('connection reset');
    expect(ctx.conflicts.get('c-div')).toMatchObject({
      resolved_at: null,
      resolved_by: null,
      resolution: null,
    });
    expect(ctx.rows.scouting_entries.get('e-1')!.version).toBe(4);

    ctx.store.putRow = putRow;
    await resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'superseded' } }, ctx);
    expect(ctx.rows.scouting_entries.get('e-1')!.version).toBe(5);
  });

  it('a foreign-key failure on the restore reads as parent-deleted, and the conflict reopens', async () => {
    ctx.store.putRow = async () => {
      throw Object.assign(new Error('violates foreign key constraint'), { code: '23503' });
    };
    await expect(
      resolveConflict(lead, { conflict_id: 'c-div', resolution: { keep: 'superseded' } }, ctx),
    ).rejects.toMatchObject({ code: 'parent-deleted' });
    expect(ctx.conflicts.get('c-div')!.resolved_at).toBeNull();
  });

  it('refuses a conflict of an entity that is not resolved yet (phase 1G)', async () => {
    ctx.conflicts.set('c-pick', {
      ...ctx.conflicts.get('c-div')!,
      id: 'c-pick',
      entity: 'pick_list',
    });
    await expect(
      resolveConflict(lead, { conflict_id: 'c-pick', resolution: { keep: 'live' } }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});
