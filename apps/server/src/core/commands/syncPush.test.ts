import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller, Operation } from '@frc/shared';
import { syncPush } from './syncPush.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';

const scouter: Caller = { kind: 'user', userId: 'u-scouter', role: 'scouter' };

const op = (over: Partial<Operation> = {}): Operation => ({
  op_id: `op-${Math.random()}`,
  entity: 'scouting_entry',
  row_id: 'e-1',
  action: 'create',
  base_version: null,
  payload: {
    form_version_id: 'fv-1',
    form_kind: 'match',
    event_id: 'ev-1',
    match_id: 'm-1',
    team_id: 't-1',
    alliance: 'red',
    scouter_id: 'u-scouter',
    robot_status: 'played',
    data: { auto_notes: 2 },
  },
  author_user_id: 'u-scouter',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: 1,
  ...over,
});

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
});

describe('syncPush', () => {
  it('applies a create and returns the new version', async () => {
    const res = await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    expect(res.results[0]).toMatchObject({ status: 'applied', row_id: 'e-1', new_version: 1 });
    expect(ctx.rows.scouting_entries.get('e-1')?.version).toBe(1);
  });

  it('is idempotent: replaying the same op_id returns noop and does not bump the version', async () => {
    const operation = op();
    await syncPush(scouter, { device_id: 'd-1', operations: [operation] }, ctx);
    const again = await syncPush(scouter, { device_id: 'd-1', operations: [operation] }, ctx);
    expect(again.results[0]).toMatchObject({ status: 'noop', new_version: 1 });
    expect(ctx.rows.scouting_entries.get('e-1')?.version).toBe(1);
  });

  it('fast-forwards an update whose base_version matches, bumping the version', async () => {
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({
            action: 'update',
            base_version: 1,
            client_updated_at: '2026-11-14T09:02:00.000Z',
            payload: { ...op().payload, data: { auto_notes: 5 } },
          }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied', new_version: 2 });
    expect(ctx.rows.scouting_entries.get('e-1')?.data).toEqual({ auto_notes: 5 });
  });

  it('applies operations in seq order, each in its own transaction', async () => {
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({ row_id: 'e-2', seq: 2, payload: { ...op().payload, data: { auto_notes: 2 } } }),
          op({ row_id: 'e-1', seq: 1 }),
        ],
      },
      ctx,
    );
    expect(ctx.appliedOrder).toEqual(['e-1', 'e-2']);
    expect(res.results).toHaveLength(2);
  });

  it('a rejection does not stop the batch', async () => {
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({
            row_id: 'e-1',
            seq: 1,
            payload: { ...op().payload, robot_status: 'no_show', data: { auto_notes: 1 } },
          }),
          op({ row_id: 'e-2', seq: 2 }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(res.results[1]).toMatchObject({ status: 'applied' });
  });

  it('authorizes each operation against its own author_user_id, not the bearer (SPEC-FINAL 7.5)', async () => {
    ctx.users.set('u-other', { id: 'u-other', role: 'scouter', disabled_at: null });
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-collector',
        operations: [
          op({ author_user_id: 'u-other', payload: { ...op().payload, scouter_id: 'u-other' } }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied' });
    expect(ctx.rows.scouting_entries.get('e-1')?.scouter_id).toBe('u-other');
  });

  it('rejects an operation whose author is disabled', async () => {
    ctx.users.set('u-gone', {
      id: 'u-gone',
      role: 'scouter',
      disabled_at: '2026-01-01T00:00:00.000Z',
    });
    const res = await syncPush(
      scouter,
      { device_id: 'd-1', operations: [op({ author_user_id: 'u-gone' })] },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'forbidden' });
  });

  it('rejects a service caller outright', async () => {
    const res = await syncPush(
      { kind: 'service', label: 'mcp' },
      { device_id: 'd-1', operations: [op()] },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'forbidden' });
  });

  it('creates a bare match row for the auto-creation entity (SPEC-FINAL 6.4)', async () => {
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({
            entity: 'match',
            row_id: 'm-9',
            payload: { event_id: 'ev-1', match_type: 'qualification', number: 9 },
          }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied' });
    expect(ctx.rows.matches.get('m-9')).toMatchObject({ number: 9, match_type: 'qualification' });
  });

  it('rejects a match entry missing its alliance or its robot status (SPEC-FINAL 3.5)', async () => {
    for (const missing of ['alliance', 'robot_status', 'match_id'] as const) {
      const payload = { ...op().payload, [missing]: null };
      const res = await syncPush(scouter, { device_id: 'd-1', operations: [op({ payload })] }, ctx);
      expect(res.results[0], missing).toMatchObject({ status: 'rejected', reason: 'invalid' });
    }
  });

  it('rejects a super entry that carries a match, an alliance or a robot status', async () => {
    const superPayload = {
      ...op().payload,
      form_kind: 'super',
      match_id: null,
      alliance: null,
      robot_status: null,
    };
    const ok = await syncPush(
      scouter,
      { device_id: 'd-1', operations: [op({ row_id: 's-1', payload: superPayload })] },
      ctx,
    );
    expect(ok.results[0]).toMatchObject({ status: 'applied' });

    const bad = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [op({ row_id: 's-2', payload: { ...superPayload, alliance: 'red' } })],
      },
      ctx,
    );
    expect(bad.results[0]).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });

  it('requires breakdown_seconds exactly when the robot broke down', async () => {
    const withoutSeconds = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({ row_id: 'b-1', payload: { ...op().payload, robot_status: 'broke_down' } }),
        ],
      },
      ctx,
    );
    expect(withoutSeconds.results[0]).toMatchObject({ status: 'rejected', reason: 'invalid' });

    const withSeconds = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({
            row_id: 'b-2',
            payload: { ...op().payload, robot_status: 'broke_down', breakdown_seconds: 45 },
          }),
        ],
      },
      ctx,
    );
    expect(withSeconds.results[0]).toMatchObject({ status: 'applied' });

    const straySeconds = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [op({ row_id: 'b-3', payload: { ...op().payload, breakdown_seconds: 45 } })],
      },
      ctx,
    );
    expect(straySeconds.results[0]).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });

  it('is a noop when the bare match already exists', async () => {
    ctx.rows.matches.set('m-9', {
      id: 'm-9',
      event_id: 'ev-1',
      match_type: 'qualification',
      number: 9,
    });
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({
            entity: 'match',
            row_id: 'm-9',
            payload: { event_id: 'ev-1', match_type: 'qualification', number: 9 },
          }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'noop', new_version: 1 });
  });

  const bareMatch = (over: Partial<Operation> = {}): Operation =>
    op({
      entity: 'match',
      row_id: 'm-1',
      payload: { event_id: 'ev-1', match_type: 'qualification', number: 21 },
      ...over,
    });

  it('writes only the columns matches has — no version (SPEC-FINAL 6.4)', async () => {
    const res = await syncPush(scouter, { device_id: 'd-1', operations: [bareMatch()] }, ctx);
    expect(res.results[0]).toMatchObject({ status: 'applied', row_id: 'm-1', new_version: 1 });
    expect(ctx.rows.matches.get('m-1')).toEqual({
      id: 'm-1',
      event_id: 'ev-1',
      match_type: 'qualification',
      number: 21,
    });
  });

  it('replaying a bare match op_id is a noop with version 1', async () => {
    const operation = bareMatch();
    await syncPush(scouter, { device_id: 'd-1', operations: [operation] }, ctx);
    const again = await syncPush(scouter, { device_id: 'd-1', operations: [operation] }, ctx);
    expect(again.results[0]).toMatchObject({ status: 'noop', new_version: 1 });
  });

  it('pushes a bare match and its entry in one batch, the way the client sends them', async () => {
    const res = await syncPush(
      scouter,
      { device_id: 'd-1', operations: [bareMatch({ seq: 1 }), op({ seq: 2 })] },
      ctx,
    );
    expect(res.results.map((r) => r.status)).toEqual(['applied', 'applied']);
    expect(ctx.appliedOrder).toEqual(['m-1', 'e-1']);
  });

  it('turns a thrown store error into a per-operation rejection carrying the message (SPEC-FINAL 9.3.1)', async () => {
    const putRow = ctx.store.putRow.bind(ctx.store);
    ctx.store.putRow = async (entity, id, row) => {
      if (id === 'e-boom') throw new Error('duplicate key value violates unique constraint');
      return putRow(entity, id, row);
    };
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [op({ row_id: 'e-boom', seq: 1 }), op({ row_id: 'e-2', seq: 2 })],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(res.results[0]).toHaveProperty(
      'detail',
      'unexpected server error: duplicate key value violates unique constraint',
    );
    expect(res.results[1]).toMatchObject({ status: 'applied', row_id: 'e-2' });
  });

  // --- Task 1.14: per-operation authorization and the server-side edit window ---

  it('accepts a scouter self-edit inside the five-minute window', async () => {
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({
            action: 'update',
            base_version: 1,
            client_created_at: '2026-11-14T09:00:00.000Z',
            client_updated_at: '2026-11-14T09:04:00.000Z',
          }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied' });
  });

  it('rejects a scouter self-edit outside the window with edit-window-expired', async () => {
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({
            action: 'update',
            base_version: 1,
            client_created_at: '2026-11-14T09:00:00.000Z',
            client_updated_at: '2026-11-14T09:06:00.000Z',
          }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'edit-window-expired' });
  });

  it('measures elapsed CLIENT time, so an upload six hours later still passes', async () => {
    ctx.nowValue = new Date('2026-11-14T15:00:00.000Z'); // server clock, six hours on
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({
            action: 'update',
            base_version: 1,
            client_created_at: '2026-11-14T09:00:00.000Z',
            client_updated_at: '2026-11-14T09:03:00.000Z',
          }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied' });
  });

  it('lets a lead edit an entry authored by somebody else, at any age', async () => {
    ctx.users.set('u-lead', { id: 'u-lead', role: 'lead', disabled_at: null });
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(
      { kind: 'user', userId: 'u-lead', role: 'lead' },
      {
        device_id: 'd-2',
        operations: [
          op({
            action: 'update',
            base_version: 1,
            author_user_id: 'u-lead',
            client_created_at: '2026-11-14T09:00:00.000Z',
            client_updated_at: '2026-11-20T09:00:00.000Z',
          }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied' });
  });

  it('rejects a scouter editing an entry authored by somebody else', async () => {
    ctx.users.set('u-other', { id: 'u-other', role: 'scouter', disabled_at: null });
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [op({ action: 'update', base_version: 1, author_user_id: 'u-other' })],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'forbidden' });
  });

  it('never reassigns authorship when a lead edits a scouter’s entry', async () => {
    ctx.users.set('u-lead', { id: 'u-lead', role: 'lead', disabled_at: null });
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    await syncPush(
      { kind: 'user', userId: 'u-lead', role: 'lead' },
      {
        device_id: 'd-2',
        operations: [
          op({
            action: 'update',
            base_version: 1,
            author_user_id: 'u-lead',
            client_updated_at: '2026-11-20T09:00:00.000Z',
          }),
        ],
      },
      ctx,
    );
    expect(ctx.rows.scouting_entries.get('e-1')!.scouter_id).toBe('u-scouter');
  });

  const lead: Caller = { kind: 'user', userId: 'u-lead', role: 'lead' };
  const admin: Caller = { kind: 'user', userId: 'u-admin', role: 'admin' };

  it('never lets the bearer role grant anything: a lead-carried scouter edit outside the window is locked', async () => {
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(
      lead,
      {
        device_id: 'd-collector',
        operations: [
          op({
            action: 'update',
            base_version: 1,
            author_user_id: 'u-scouter',
            client_updated_at: '2026-11-14T09:06:00.000Z',
          }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'edit-window-expired' });
    expect(ctx.rows.scouting_entries.get('e-1')?.version).toBe(1);
  });

  it('never lets the bearer role grant anything: an admin-carried scouter edit of another entry is forbidden', async () => {
    ctx.users.set('u-other', { id: 'u-other', role: 'scouter', disabled_at: null });
    await syncPush(
      scouter,
      { device_id: 'd-1', operations: [op({ author_user_id: 'u-other' })] },
      ctx,
    );
    const res = await syncPush(
      admin,
      {
        device_id: 'd-collector',
        operations: [op({ action: 'update', base_version: 1, author_user_id: 'u-scouter' })],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'forbidden' });
    expect(ctx.rows.scouting_entries.get('e-1')?.version).toBe(1);
  });

  const deleteOp = (over: Partial<Operation> = {}): Operation =>
    op({
      action: 'delete',
      base_version: 1,
      payload: {},
      client_updated_at: '2026-11-14T09:01:00.000Z',
      ...over,
    });

  it('never lets a scouter delete, not even their own fresh entry (SPEC-FINAL 7.6)', async () => {
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(scouter, { device_id: 'd-1', operations: [deleteOp()] }, ctx);
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'forbidden' });
    expect(ctx.rows.scouting_entries.get('e-1')).toMatchObject({ version: 1, deleted_at: null });
  });

  it('lets a lead author soft-delete a scouter entry', async () => {
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(
      lead,
      { device_id: 'd-2', operations: [deleteOp({ author_user_id: 'u-lead' })] },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied', new_version: 2 });
    expect(ctx.rows.scouting_entries.get('e-1')).toMatchObject({
      version: 2,
      deleted_at: ctx.nowValue.toISOString(),
      scouter_id: 'u-scouter',
    });
  });

  it('never widens the window: a resent fresher client_created_at is ignored', async () => {
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const first = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({
            action: 'update',
            base_version: 1,
            client_created_at: '2026-11-14T09:04:00.000Z',
            client_updated_at: '2026-11-14T09:04:00.000Z',
          }),
        ],
      },
      ctx,
    );
    expect(first.results[0]).toMatchObject({ status: 'applied', new_version: 2 });
    const second = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({
            action: 'update',
            base_version: 2,
            client_created_at: '2026-11-14T09:04:00.000Z',
            client_updated_at: '2026-11-14T09:07:00.000Z',
          }),
        ],
      },
      ctx,
    );
    expect(second.results[0]).toMatchObject({ status: 'rejected', reason: 'edit-window-expired' });
    expect(ctx.rows.scouting_entries.get('e-1')).toMatchObject({
      version: 2,
      client_created_at: '2026-11-14T09:00:00.000Z',
    });
  });

  it('never stores a payload-supplied updated_at or scouter_id', async () => {
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({
            payload: {
              ...op().payload,
              updated_at: '2000-01-01T00:00:00.000Z',
              scouter_id: 'u-lead',
            },
          }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied' });
    const row = ctx.rows.scouting_entries.get('e-1');
    expect(row?.scouter_id).toBe('u-scouter');
    expect(row?.updated_at).not.toBe('2000-01-01T00:00:00.000Z');
  });

  it('applies one bearer push of three creates by three scouters, each as its own author (SPEC-FINAL 7.5)', async () => {
    ctx.users.set('u-s2', { id: 'u-s2', role: 'scouter', disabled_at: null });
    ctx.users.set('u-s3', { id: 'u-s3', role: 'scouter', disabled_at: null });
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-collector',
        operations: [
          op({ row_id: 'e-a', seq: 1, author_user_id: 'u-scouter' }),
          op({ row_id: 'e-b', seq: 2, author_user_id: 'u-s2' }),
          op({ row_id: 'e-c', seq: 3, author_user_id: 'u-s3' }),
        ],
      },
      ctx,
    );
    expect(res.results.map((r) => r.status)).toEqual(['applied', 'applied', 'applied']);
    expect(ctx.rows.scouting_entries.get('e-a')?.scouter_id).toBe('u-scouter');
    expect(ctx.rows.scouting_entries.get('e-b')?.scouter_id).toBe('u-s2');
    expect(ctx.rows.scouting_entries.get('e-c')?.scouter_id).toBe('u-s3');
  });
});
