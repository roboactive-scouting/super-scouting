import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAck, PARENT_DELETED_DETAIL, type Caller, type Operation } from '@frc/shared';
import { conflictIdFor, syncPush } from './syncPush.js';
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

// A bare match now goes through ensureMatch (task 1.19), whose input is uuids, so the bare
// match fixtures are these rather than 'ev-1' / 'm-9'. The entry fixtures are unchanged.
const EV = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const M_1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const M_9 = 'bbbbbbbb-0000-4000-8000-000000000009';
const M_OTHER = 'bbbbbbbb-0000-4000-8000-0000000000ff';

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  ctx.knownEvents.add(EV);
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
            row_id: M_9,
            payload: { event_id: EV, match_type: 'qualification', number: 9 },
          }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied' });
    expect(ctx.rows.matches.get(M_9)).toMatchObject({ number: 9, match_type: 'qualification' });
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

  it('rejects a fractional or negative breakdown time as invalid, named, before any write', async () => {
    for (const [i, seconds] of [2.5, -3].entries()) {
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-1',
          operations: [
            op({
              row_id: `b-frac-${i}`,
              payload: { ...op().payload, robot_status: 'broke_down', breakdown_seconds: seconds },
            }),
          ],
        },
        ctx,
      );
      expect(res.results[0]).toMatchObject({
        status: 'rejected',
        reason: 'invalid',
        detail: expect.stringContaining('whole number of seconds'),
      });
      expect(res.results[0]).not.toMatchObject({ detail: 'unexpected server error' });
    }
  });

  it('is a noop when the bare match already exists', async () => {
    ctx.rows.matches.set(M_9, {
      id: M_9,
      event_id: EV,
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
            row_id: M_9,
            payload: { event_id: EV, match_type: 'qualification', number: 9 },
          }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'noop', row_id: M_9, new_version: 1 });
  });

  const bareMatch = (over: Partial<Operation> = {}): Operation =>
    op({
      entity: 'match',
      row_id: M_1,
      payload: { event_id: EV, match_type: 'qualification', number: 21 },
      ...over,
    });

  it('writes only the columns matches has — no version (SPEC-FINAL 6.4)', async () => {
    const res = await syncPush(scouter, { device_id: 'd-1', operations: [bareMatch()] }, ctx);
    expect(res.results[0]).toMatchObject({ status: 'applied', row_id: M_1, new_version: 1 });
    expect(ctx.rows.matches.get(M_1)).toEqual({
      id: M_1,
      event_id: EV,
      match_type: 'qualification',
      number: 21,
    });
  });

  it('answers with the canonical id when another device already created that match number', async () => {
    // Two offline devices can auto-create the same (event, type, number) with different
    // ids. The server keeps the first; the second hears its id, so the client can remap.
    await syncPush(scouter, { device_id: 'd-1', operations: [bareMatch()] }, ctx);
    const second = bareMatch({ row_id: M_OTHER });
    const res = await syncPush(scouter, { device_id: 'd-2', operations: [second] }, ctx);
    expect(res.results[0]).toEqual({
      op_id: second.op_id,
      status: 'noop',
      row_id: M_1,
      new_version: 1,
    });
    expect(ctx.rows.matches.has(M_OTHER)).toBe(false);
    // A replay of that op, after a lost response, still names the canonical id.
    const replay = await syncPush(scouter, { device_id: 'd-2', operations: [second] }, ctx);
    expect(replay.results[0]).toMatchObject({ status: 'noop', row_id: M_1 });
  });

  it('rejects a bare match whose event no longer exists as parent-deleted', async () => {
    const operation = bareMatch({
      payload: {
        event_id: '99999999-9999-4999-8999-999999999999',
        match_type: 'qualification',
        number: 21,
      },
    });
    const res = await syncPush(scouter, { device_id: 'd-1', operations: [operation] }, ctx);
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'parent-deleted' });
    expect(ctx.rows.matches.size).toBe(0);
    expect(ctx.ops.has(operation.op_id)).toBe(false);
  });

  it('rejects a bare match with a malformed payload as invalid, naming the field', async () => {
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          bareMatch({ payload: { event_id: EV, match_type: 'final', number: 21 } }),
          bareMatch({ payload: { event_id: EV, match_type: 'qualification' } }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect((res.results[0] as { detail: string }).detail).toContain('match_type');
    expect(res.results[1]).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(ctx.rows.matches.size).toBe(0);
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
    expect(ctx.appliedOrder).toEqual([M_1, 'e-1']);
  });

  it('turns a thrown store error into a per-operation rejection with a fixed detail (SPEC-FINAL 9.3.1)', async () => {
    const putRow = ctx.store.putRow.bind(ctx.store);
    ctx.store.putRow = async (entity, id, row) => {
      if (id === 'e-boom') throw new Error('duplicate key value violates unique constraint');
      return putRow(entity, id, row);
    };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = op({ row_id: 'e-boom', seq: 1 });
    const res = await syncPush(
      scouter,
      { device_id: 'd-1', operations: [boom, op({ row_id: 'e-2', seq: 2 })] },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'invalid' });
    // The database's own text never reaches the client: it can carry Postgres detail.
    expect(res.results[0]).toHaveProperty('detail', 'unexpected server error');
    expect(JSON.stringify(res)).not.toContain('duplicate key');
    expect(res.results[1]).toMatchObject({ status: 'applied', row_id: 'e-2' });
    // It is logged server-side instead, keyed by op_id and without the payload.
    expect(errors).toHaveBeenCalledTimes(1);
    const logged = errors.mock.calls[0]!.map((a) => (a instanceof Error ? a.message : String(a)));
    expect(logged.join(' ')).toContain(boom.op_id);
    expect(logged.join(' ')).toContain('duplicate key');
    expect(logged.join(' ')).not.toContain('auto_notes');
    errors.mockRestore();
  });

  it('never writes when the row lookup fails: a DB error is not "no such row"', async () => {
    // Before the review fix a failed lookup read as a create, so the pushing scouter's op
    // upserted over another scouter's entry with itself as author and version 1.
    ctx.users.set('u-other', { id: 'u-other', role: 'scouter', disabled_at: null });
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const before = { ...ctx.rows.scouting_entries.get('e-1') };
    ctx.store.getRow = async () => {
      throw new Error('connection refused');
    };
    const writes: string[] = [];
    const putRow = ctx.store.putRow.bind(ctx.store);
    ctx.store.putRow = async (entity, id, row) => {
      writes.push(id);
      return putRow(entity, id, row);
    };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [op({ author_user_id: 'u-other', payload: { ...op().payload, data: {} } })],
      },
      ctx,
    );
    errors.mockRestore();
    expect(res.results[0]).toMatchObject({ status: 'rejected', detail: 'unexpected server error' });
    expect(writes).toEqual([]);
    expect(ctx.rows.scouting_entries.get('e-1')).toEqual(before);
  });

  it('never writes when the applied-ledger lookup fails', async () => {
    ctx.store.wasApplied = async () => {
      throw new Error('connection refused');
    };
    const writes: string[] = [];
    ctx.store.putRow = async (_entity, id) => {
      writes.push(id);
    };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    errors.mockRestore();
    expect(res.results[0]).toMatchObject({ status: 'rejected', detail: 'unexpected server error' });
    expect(writes).toEqual([]);
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
    // The detail says what happened, as the client's line does (SPEC-FINAL 7.6, v1.44).
    expect(res.results[0]).toEqual({
      op_id: expect.any(String),
      status: 'rejected',
      reason: 'edit-window-expired',
      detail: 'changed after the 5-minute edit window. A lead can save it for you.',
    });
  });

  // Phase 1 H side task 5 (SPEC-FINAL 7.6 v1.45): a form left open saves at the mark, stamped
  // client_created_at + 5:00 exactly. The bound is inclusive, so that save passes; 1 ms more does not.
  it('accepts a scouter save stamped exactly created + 5:00, and refuses created + 5:00 + 1 ms', async () => {
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const at = (updated: string, base: number) =>
      syncPush(
        scouter,
        {
          device_id: 'd-1',
          operations: [
            op({
              action: 'update',
              base_version: base,
              client_created_at: '2026-11-14T09:00:00.000Z',
              client_updated_at: updated,
            }),
          ],
        },
        ctx,
      );
    const stamped = await at('2026-11-14T09:05:00.000Z', 1);
    expect(stamped.results[0]).toMatchObject({ status: 'applied', new_version: 2 });
    const late = await at('2026-11-14T09:05:00.001Z', 2);
    expect(late.results[0]).toMatchObject({ status: 'rejected', reason: 'edit-window-expired' });
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
    // Task 1.40 (Q7.8): a scouter submits only as themselves, so the fixture names u-other.
    await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [
          op({ author_user_id: 'u-other', payload: { ...op().payload, scouter_id: 'u-other' } }),
        ],
      },
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

  it('never stores a payload-supplied updated_at', async () => {
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [op({ payload: { ...op().payload, updated_at: '2000-01-01T00:00:00.000Z' } })],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied' });
    const row = ctx.rows.scouting_entries.get('e-1');
    expect(row?.scouter_id).toBe('u-scouter');
    expect(row?.updated_at).not.toBe('2000-01-01T00:00:00.000Z');
  });

  it('refuses a scouter create crediting someone else, and never stores it (Q7.8)', async () => {
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-1',
        operations: [op({ payload: { ...op().payload, scouter_id: 'u-lead' } })],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'forbidden' });
    expect(ctx.rows.scouting_entries.size).toBe(0);
  });

  it('never lets an update reassign authorship, whatever scouter_id it carries', async () => {
    ctx.users.set('u-lead', { id: 'u-lead', role: 'lead', disabled_at: null });
    await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
    const res = await syncPush(
      lead,
      {
        device_id: 'd-2',
        operations: [
          op({
            action: 'update',
            base_version: 1,
            author_user_id: 'u-lead',
            payload: { ...op().payload, scouter_id: 'u-lead' },
          }),
        ],
      },
      ctx,
    );
    expect(res.results[0]).toMatchObject({ status: 'applied', new_version: 2 });
    expect(ctx.rows.scouting_entries.get('e-1')?.scouter_id).toBe('u-scouter');
  });

  it('applies one bearer push of three creates by three scouters, each as its own author (SPEC-FINAL 7.5)', async () => {
    ctx.users.set('u-s2', { id: 'u-s2', role: 'scouter', disabled_at: null });
    ctx.users.set('u-s3', { id: 'u-s3', role: 'scouter', disabled_at: null });
    const res = await syncPush(
      scouter,
      {
        device_id: 'd-collector',
        operations: [
          // Task 1.40: three robots (one robot three times is the duplicate path), each
          // crediting its own author (Q7.8: a scouter submits only as themselves).
          op({ row_id: 'e-a', seq: 1, author_user_id: 'u-scouter' }),
          op({
            row_id: 'e-b',
            seq: 2,
            author_user_id: 'u-s2',
            payload: { ...op().payload, team_id: 't-2', scouter_id: 'u-s2' },
          }),
          op({
            row_id: 'e-c',
            seq: 3,
            author_user_id: 'u-s3',
            payload: { ...op().payload, team_id: 't-3', scouter_id: 'u-s3' },
          }),
        ],
      },
      ctx,
    );
    expect(res.results.map((r) => r.status)).toEqual(['applied', 'applied', 'applied']);
    expect(ctx.rows.scouting_entries.get('e-a')?.scouter_id).toBe('u-scouter');
    expect(ctx.rows.scouting_entries.get('e-b')?.scouter_id).toBe('u-s2');
    expect(ctx.rows.scouting_entries.get('e-c')?.scouter_id).toBe('u-s3');
  });

  describe('an in-place edit never invalidates a collected entry (SPEC-FINAL 5.1, 15.1)', () => {
    // fv-1's only field, after an admin narrowed it IN PLACE (no new version): max 10 → 5,
    // expected_range 0–10 → 0–5, and made it required. The device collected under the old
    // definition: auto_notes 9, or nothing at all.
    beforeEach(() => {
      ctx.formVersions.set('fv-1', { id: 'fv-1', version: 1, form_id: 'form-1', version_no: 1 });
      ctx.formFields.set('fv-1:auto_notes', {
        id: 'f1',
        key: 'auto_notes',
        label: 'Auto notes',
        type: 'counter',
        display_order: 1,
        required: true,
        config: { min: 0, max: 5, step: 1 },
        section: null,
        help_text: null,
        default_value: 0,
        visibility_condition: null,
        deprecated: false,
        description: 'x',
        unit: 'count',
        phase: 'auto',
        direction: 'higher_is_better',
        category: null,
        expected_range: { min: 0, max: 5 },
        include_in_ai_context: null,
        is_ordinal: null,
      });
    });

    it('applies a queued create that was valid under the old range, and one with the now-required field absent', async () => {
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-1',
          operations: [
            op({ row_id: 'e-1', seq: 1, payload: { ...op().payload, data: { auto_notes: 9 } } }),
            // Another robot (task 1.40: the same one again is the duplicate path).
            op({ row_id: 'e-2', seq: 2, payload: { ...op().payload, team_id: 't-2', data: {} } }),
          ],
        },
        ctx,
      );
      expect(res.results.map((r) => r.status)).toEqual(['applied', 'applied']);
      expect(ctx.rows.scouting_entries.get('e-1')?.data).toEqual({ auto_notes: 9 });
    });

    it('applies an edit of an old entry that keeps its old-range value', async () => {
      ctx.rows.scouting_entries.set('e-1', {
        id: 'e-1',
        version: 1,
        form_version_id: 'fv-1',
        scouter_id: 'u-scouter',
        client_created_at: '2026-11-14T09:00:00.000Z',
        data: { auto_notes: 9 },
      });
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-1',
          operations: [
            op({
              action: 'update',
              base_version: 1,
              client_updated_at: '2026-11-14T09:02:00.000Z',
              payload: { ...op().payload, data: { auto_notes: 8 } },
            }),
          ],
        },
        ctx,
      );
      expect(res.results[0]).toMatchObject({ status: 'applied', new_version: 2 });
    });

    it('still refuses a value of the wrong type, and data on a no-show', async () => {
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-1',
          operations: [
            op({ row_id: 'e-1', seq: 1, payload: { ...op().payload, data: { auto_notes: 'x' } } }),
            op({
              row_id: 'e-2',
              seq: 2,
              payload: { ...op().payload, robot_status: 'no_show', data: { auto_notes: 0 } },
            }),
          ],
        },
        ctx,
      );
      expect(res.results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    });
  });
  // --- UF.1: a missing parent is parent-deleted, never the transient error (SPEC-FINAL 9.3.1) ---

  describe('a missing parent (UF.1, SPEC-FINAL 9.3.1 v1.18)', () => {
    it.each([
      ['match', 'm-1', PARENT_DELETED_DETAIL.match],
      ['team', 't-1', PARENT_DELETED_DETAIL.team],
      ['event', 'ev-1', PARENT_DELETED_DETAIL.event],
    ])(
      'rejects an entry whose %s is gone as parent-deleted, naming it, and writes nothing',
      async (_kind, id, detail) => {
        ctx.missingParents.add(id);
        const res = await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
        expect(res.results[0]).toEqual({
          op_id: expect.any(String),
          status: 'rejected',
          reason: 'parent-deleted',
          detail,
        });
        expect(ctx.rows.scouting_entries.size).toBe(0);
        expect(ctx.ops.size).toBe(0);
      },
    );

    it('names the event first when the event and its match are both gone', async () => {
      ctx.missingParents.add('ev-1');
      ctx.missingParents.add('m-1');
      const res = await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
      expect(res.results[0]).toMatchObject({ detail: PARENT_DELETED_DETAIL.event });
    });

    it('rejects an entry on a match an admin deleted, and lands it once the device rebuilds the match', async () => {
      // The 2026-10-08 repro: the device cached a match the server then hard-deleted.
      await syncPush(scouter, { device_id: 'd-1', operations: [bareMatch({ seq: 1 })] }, ctx);
      await ctx.store.deleteMatch(M_1);
      const entry = op({ seq: 2, payload: { ...op().payload, event_id: EV, match_id: M_1 } });
      const first = await syncPush(scouter, { device_id: 'd-1', operations: [entry] }, ctx);
      expect(first.results[0]).toMatchObject({
        status: 'rejected',
        reason: 'parent-deleted',
        detail: PARENT_DELETED_DETAIL.match,
      });
      // SPEC-FINAL 9.7 (v1.18): the bare match again, under its cached id, ahead of the entry.
      const rebuilt = bareMatch({ seq: 1 });
      const again = await syncPush(
        scouter,
        { device_id: 'd-1', operations: [{ ...entry, seq: 3 }, rebuilt] },
        ctx,
      );
      expect(again.results).toMatchObject([
        { status: 'applied', row_id: M_1 },
        { status: 'applied', row_id: 'e-1' },
      ]);
      expect(ctx.matchDeletions.has(M_1)).toBe(false);
    });

    it('rejects a match-less super entry only for its event and team', async () => {
      ctx.missingParents.add('m-1');
      const superEntry = op({
        payload: {
          ...op().payload,
          form_kind: 'super',
          match_id: null,
          alliance: null,
          robot_status: null,
        },
      });
      const res = await syncPush(scouter, { device_id: 'd-1', operations: [superEntry] }, ctx);
      expect(res.results[0]).toMatchObject({ status: 'applied' });
    });

    it('rejects an entry without an event or team id as invalid, before any lookup', async () => {
      for (const missing of ['event_id', 'team_id'] as const) {
        const payload = { ...op().payload, [missing]: undefined };
        const res = await syncPush(
          scouter,
          { device_id: 'd-1', operations: [op({ payload })] },
          ctx,
        );
        expect(res.results[0], missing).toMatchObject({ status: 'rejected', reason: 'invalid' });
      }
    });

    it.each([
      ['scouting_entries_match_id_fkey', PARENT_DELETED_DETAIL.match],
      ['scouting_entries_team_id_fkey', PARENT_DELETED_DETAIL.team],
      ['scouting_entries_event_id_fkey', PARENT_DELETED_DETAIL.event],
      ['scouting_entries_form_version_id_fkey', PARENT_DELETED_DETAIL.form_version],
      ['scouting_entries_scouter_id_fkey', PARENT_DELETED_DETAIL.other],
    ])(
      'maps a foreign-key failure on %s at the write (23503) to parent-deleted',
      async (constraint, detail) => {
        // A parent deleted between the check and the write.
        ctx.store.putRow = async () => {
          throw Object.assign(
            new Error(
              `insert or update on table "scouting_entries" violates foreign key constraint "${constraint}"`,
            ),
            { code: '23503' },
          );
        };
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
        errors.mockRestore();
        expect(res.results[0]).toMatchObject({
          status: 'rejected',
          reason: 'parent-deleted',
          detail,
        });
        // Postgres's own text never reaches the client.
        expect(JSON.stringify(res)).not.toContain('violates');
      },
    );

    it('keeps the generic transient answer for an error that is not a foreign key', async () => {
      ctx.store.putRow = async () => {
        throw Object.assign(new Error('canceling statement due to statement timeout'), {
          code: '57014',
        });
      };
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
      errors.mockRestore();
      expect(res.results[0]).toEqual({
        op_id: expect.any(String),
        status: 'rejected',
        reason: 'invalid',
        detail: 'unexpected server error',
      });
    });

    it('a failed parent lookup is the transient answer, never parent-deleted', async () => {
      ctx.store.missingParent = async () => {
        throw new Error('connection refused');
      };
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
      errors.mockRestore();
      expect(res.results[0]).toMatchObject({
        reason: 'invalid',
        detail: 'unexpected server error',
      });
    });

    it('names the event in a bare match whose event is gone', async () => {
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-1',
          operations: [
            bareMatch({
              payload: {
                event_id: '99999999-9999-4999-8999-999999999999',
                match_type: 'qualification',
                number: 21,
              },
            }),
          ],
        },
        ctx,
      );
      expect(res.results[0]).toMatchObject({
        reason: 'parent-deleted',
        detail: PARENT_DELETED_DETAIL.event,
      });
    });
  });

  // --- Task 1.40: divergence, duplicate, parent-deleted (SPEC-FINAL 9.5, 9.3.1) ---

  describe('divergence, duplicate and parent-deleted (task 1.40)', () => {
    // The plan's times were nine and seven minutes after creation, outside task 1.14's
    // five-minute window for a scouter; these keep its shape inside the window.
    const edit = (over: Partial<Operation>, notes: number) =>
      op({
        action: 'update',
        base_version: 1,
        ...over,
        payload: { ...op().payload, data: { auto_notes: notes } },
      });

    it('returns divergence with a conflict id and keeps the latest client_updated_at live', async () => {
      await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
      // another device edits from the same ancestor
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-2',
          operations: [
            edit({ op_id: 'op-diverged', client_updated_at: '2026-11-14T09:04:00.000Z' }, 9),
          ],
        },
        ctx,
      );
      const loser = await syncPush(
        scouter,
        {
          device_id: 'd-3',
          operations: [
            edit({ op_id: 'op-loser', client_updated_at: '2026-11-14T09:03:00.000Z' }, 4),
          ],
        },
        ctx,
      );

      expect(res.results[0]).toMatchObject({ status: 'applied' });
      const conflicts = [...ctx.conflicts.values()];
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({
        kind: 'divergence',
        entity: 'scouting_entry',
        row_id: 'e-1',
      });
      expect(conflicts[0]!.superseded_payload).toMatchObject({ data: { auto_notes: 4 } });
      expect(ctx.rows.scouting_entries.get('e-1')!.data).toEqual({ auto_notes: 9 });
      expect(loser.results[0]).toEqual({
        op_id: 'op-loser',
        status: 'divergence',
        row_id: 'e-1',
        new_version: 3,
        conflict_id: conflicts[0]!.id,
      });
    });

    it('divergence is still an ack, so the client may prune the operation', async () => {
      await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
      await syncPush(
        scouter,
        {
          device_id: 'd-2',
          operations: [edit({ op_id: 'op-2', client_updated_at: '2026-11-14T09:04:00.000Z' }, 2)],
        },
        ctx,
      );
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-3',
          operations: [edit({ op_id: 'op-3', client_updated_at: '2026-11-14T09:03:00.000Z' }, 2)],
        },
        ctx,
      );
      const conflicted = [...ctx.conflicts.values()][0]!;
      expect(conflicted.kind).toBe('divergence');
      expect(res.results[0]!.status).toBe('divergence');
      // isAck() is what the client consults, and it treats divergence as a cloud ack.
      expect(isAck(res.results[0]!.status)).toBe(true);
      expect(ctx.ops.has('op-3')).toBe(true);
    });

    it('keeps the later copy live in BOTH arrival orders, and stores the other in full', async () => {
      // Order 1: the later edit arrives first; the earlier one loses on arrival.
      await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
      await syncPush(
        scouter,
        {
          device_id: 'd-2',
          operations: [edit({ client_updated_at: '2026-11-14T09:04:00.000Z' }, 9)],
        },
        ctx,
      );
      await syncPush(
        scouter,
        {
          device_id: 'd-3',
          operations: [edit({ client_updated_at: '2026-11-14T09:03:00.000Z' }, 4)],
        },
        ctx,
      );
      const first = ctx.rows.scouting_entries.get('e-1')!;
      expect(first).toMatchObject({
        data: { auto_notes: 9 },
        version: 3,
        client_updated_at: '2026-11-14T09:04:00.000Z',
        scouter_id: 'u-scouter',
        client_created_at: '2026-11-14T09:00:00.000Z',
      });
      const lost = [...ctx.conflicts.values()][0]!;
      expect(lost).toMatchObject({
        event_id: 'ev-1',
        superseded_author_id: 'u-scouter',
        superseded_client_updated_at: '2026-11-14T09:03:00.000Z',
        base_version: 1,
      });
      expect(lost.superseded_payload).toEqual(edit({}, 4).payload);

      // Order 2: the earlier edit arrives first; the later one wins on arrival.
      const other = makeFakeContext();
      await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, other);
      await syncPush(
        scouter,
        {
          device_id: 'd-3',
          operations: [edit({ client_updated_at: '2026-11-14T09:03:00.000Z' }, 4)],
        },
        other,
      );
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-2',
          operations: [edit({ client_updated_at: '2026-11-14T09:04:00.000Z' }, 9)],
        },
        other,
      );
      expect(res.results[0]).toMatchObject({ status: 'divergence', new_version: 3 });
      expect(other.rows.scouting_entries.get('e-1')).toMatchObject({
        data: { auto_notes: 9 },
        version: 3,
        client_updated_at: '2026-11-14T09:04:00.000Z',
        scouter_id: 'u-scouter',
        client_created_at: '2026-11-14T09:00:00.000Z',
        deleted_at: null,
      });
      const superseded = [...other.conflicts.values()][0]!;
      expect(superseded).toMatchObject({
        kind: 'divergence',
        superseded_author_id: 'u-scouter',
        superseded_client_updated_at: '2026-11-14T09:03:00.000Z',
        base_version: 2,
      });
      // The whole losing row, not a diff.
      expect(superseded.superseded_payload).toMatchObject({
        id: 'e-1',
        data: { auto_notes: 4 },
        team_id: 't-1',
        match_id: 'm-1',
        robot_status: 'played',
      });
    });

    it('writes the conflict row before the live row, so a failed live write loses nothing', async () => {
      await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
      await syncPush(
        scouter,
        {
          device_id: 'd-3',
          operations: [edit({ client_updated_at: '2026-11-14T09:03:00.000Z' }, 4)],
        },
        ctx,
      );
      ctx.store.putRow = async () => {
        throw new Error('connection reset');
      };
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-2',
          operations: [edit({ client_updated_at: '2026-11-14T09:04:00.000Z' }, 9)],
        },
        ctx,
      );
      errors.mockRestore();
      expect(res.results[0]).toMatchObject({
        status: 'rejected',
        detail: 'unexpected server error',
      });
      // The copy that would have been overwritten is already in sync_conflicts.
      expect([...ctx.conflicts.values()][0]!.superseded_payload).toMatchObject({
        data: { auto_notes: 4 },
      });
    });

    /** putRow fails once for `rowId` — a live write lost after the conflict row went in. */
    const failLiveWriteOnce = (rowId: string) => {
      const putRow = ctx.store.putRow.bind(ctx.store);
      let failed = false;
      ctx.store.putRow = async (entity, id, row) => {
        if (id === rowId && !failed) {
          failed = true;
          throw new Error('connection reset');
        }
        return putRow(entity, id, row);
      };
    };

    it('a retried divergence names the same conflict, and writes it once', async () => {
      await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
      await syncPush(
        scouter,
        {
          device_id: 'd-3',
          operations: [edit({ client_updated_at: '2026-11-14T09:03:00.000Z' }, 4)],
        },
        ctx,
      );
      failLiveWriteOnce('e-1');
      const later = edit({ op_id: 'op-later', client_updated_at: '2026-11-14T09:04:00.000Z' }, 9);
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const first = await syncPush(scouter, { device_id: 'd-2', operations: [later] }, ctx);
      errors.mockRestore();
      expect(first.results[0]).toEqual({
        op_id: 'op-later',
        status: 'rejected',
        reason: 'invalid',
        detail: 'unexpected server error',
      });
      expect(ctx.ops.has('op-later')).toBe(false);

      const retry = await syncPush(scouter, { device_id: 'd-2', operations: [later] }, ctx);
      expect(retry.results[0]).toEqual({
        op_id: 'op-later',
        status: 'divergence',
        row_id: 'e-1',
        new_version: 3,
        conflict_id: conflictIdFor('op-later'),
      });
      expect(ctx.conflicts.size).toBe(1);
      expect(ctx.conflicts.get(conflictIdFor('op-later'))!.superseded_payload).toMatchObject({
        data: { auto_notes: 4 },
      });
      expect(ctx.rows.scouting_entries.get('e-1')!.data).toEqual({ auto_notes: 9 });
    });

    it('a retried duplicate names the same conflict, and writes it once', async () => {
      await syncPush(scouter, { device_id: 'd-1', operations: [op({ row_id: 'e-1' })] }, ctx);
      failLiveWriteOnce('e-2');
      const second = op({ op_id: 'op-dup-retry', row_id: 'e-2' });
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const first = await syncPush(scouter, { device_id: 'd-2', operations: [second] }, ctx);
      errors.mockRestore();
      expect(first.results[0]).toMatchObject({
        status: 'rejected',
        reason: 'invalid',
        detail: 'unexpected server error',
      });
      const retry = await syncPush(scouter, { device_id: 'd-2', operations: [second] }, ctx);
      expect(retry.results[0]).toEqual({
        op_id: 'op-dup-retry',
        status: 'duplicate',
        row_id: 'e-2',
        new_version: 1,
        conflict_id: conflictIdFor('op-dup-retry'),
        duplicate_row_id: 'e-1',
      });
      expect(ctx.conflicts.size).toBe(1);
    });

    it('derives a uuid-shaped conflict id from the op_id, one per operation', () => {
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(conflictIdFor('op-a')).toMatch(uuid);
      expect(conflictIdFor('op-a')).toBe(conflictIdFor('op-a'));
      expect(conflictIdFor('op-a')).not.toBe(conflictIdFor('op-b'));
    });

    it('keeps both rows on a duplicate and links them with a conflict', async () => {
      await syncPush(scouter, { device_id: 'd-1', operations: [op({ row_id: 'e-1' })] }, ctx);
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-2',
          operations: [
            op({ op_id: 'op-dup', row_id: 'e-2', client_updated_at: '2026-11-14T09:08:00.000Z' }),
          ],
        },
        ctx,
      );

      expect(res.results[0]).toMatchObject({
        status: 'duplicate',
        row_id: 'e-2',
        duplicate_row_id: 'e-1',
        new_version: 1,
      });
      expect(ctx.rows.scouting_entries.has('e-1')).toBe(true);
      expect(ctx.rows.scouting_entries.has('e-2')).toBe(true);
      const conflict = [...ctx.conflicts.values()][0]!;
      expect(conflict).toMatchObject({
        kind: 'duplicate',
        row_id: 'e-2',
        duplicate_row_id: 'e-1',
      });
      expect((res.results[0] as { conflict_id: string }).conflict_id).toBe(conflict.id);
      expect(isAck('duplicate')).toBe(true);
    });

    it('treats two super entries for the same (event, team) as duplicates, with match_id null on both', async () => {
      const superOp = (rowId: string, opId: string) =>
        op({
          op_id: opId,
          row_id: rowId,
          payload: {
            ...op().payload,
            form_kind: 'super',
            match_id: null,
            alliance: null,
            robot_status: null,
          },
        });
      await syncPush(scouter, { device_id: 'd-1', operations: [superOp('s-1', 'o-s1')] }, ctx);
      const res = await syncPush(
        scouter,
        { device_id: 'd-2', operations: [superOp('s-2', 'o-s2')] },
        ctx,
      );
      expect(res.results[0]).toMatchObject({ status: 'duplicate', duplicate_row_id: 's-1' });
    });

    it('is no duplicate for another robot, another match, or a row a lead soft-deleted', async () => {
      ctx.users.set('u-lead', { id: 'u-lead', role: 'lead', disabled_at: null });
      await syncPush(scouter, { device_id: 'd-1', operations: [op({ row_id: 'e-1' })] }, ctx);
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-2',
          operations: [
            op({ row_id: 'e-2', seq: 1, payload: { ...op().payload, team_id: 't-2' } }),
            op({ row_id: 'e-3', seq: 2, payload: { ...op().payload, match_id: 'm-2' } }),
          ],
        },
        ctx,
      );
      expect(res.results.map((r) => r.status)).toEqual(['applied', 'applied']);
      await syncPush(
        lead,
        {
          device_id: 'd-3',
          operations: [
            op({ action: 'delete', base_version: 1, payload: {}, author_user_id: 'u-lead' }),
          ],
        },
        ctx,
      );
      const again = await syncPush(
        scouter,
        { device_id: 'd-4', operations: [op({ row_id: 'e-4' })] },
        ctx,
      );
      expect(again.results[0]).toMatchObject({ status: 'applied', row_id: 'e-4' });
      expect(ctx.conflicts.size).toBe(0);
    });

    it('rejects with parent-deleted when the event, season, match or form version is gone', async () => {
      ctx.missingParents.add('ev-1');
      const res = await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
      expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'parent-deleted' });
      expect(ctx.rows.scouting_entries.size).toBe(0);
    });

    it('names a deleted form version as parent-deleted, never invalid, and writes nothing', async () => {
      ctx.forms.set('form-9', { id: 'form-9', version: 1, season_id: 'se-1', kind: 'match' });
      ctx.formVersions.set('fv-9', { id: 'fv-9', version: 1, form_id: 'form-9', version_no: 1 });
      await ctx.store.deleteFormVersion('fv-9');
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-1',
          operations: [op({ payload: { ...op().payload, form_version_id: 'fv-9' } })],
        },
        ctx,
      );
      expect(res.results[0]).toEqual({
        op_id: expect.any(String),
        status: 'rejected',
        reason: 'parent-deleted',
        detail: PARENT_DELETED_DETAIL.form_version,
      });
      expect(ctx.rows.scouting_entries.size).toBe(0);
      expect(ctx.ops.size).toBe(0);
    });

    it('checks the parents before the data, so a gone version is never "invalid"', async () => {
      ctx.missingParents.add('fv-1');
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-1',
          operations: [op({ payload: { ...op().payload, data: { auto_notes: 'x' } } })],
        },
        ctx,
      );
      expect(res.results[0]).toMatchObject({
        reason: 'parent-deleted',
        detail: PARENT_DELETED_DETAIL.form_version,
      });
    });

    it('writes one conflict row per event so the review queue can be scoped and read offline', async () => {
      await syncPush(scouter, { device_id: 'd-1', operations: [op({ row_id: 'e-1' })] }, ctx);
      await syncPush(
        scouter,
        { device_id: 'd-2', operations: [op({ op_id: 'op-dup2', row_id: 'e-2' })] },
        ctx,
      );
      const conflict = [...ctx.conflicts.values()][0]!;
      expect(conflict.event_id).toBe('ev-1');
      expect(conflict.resolved_at ?? null).toBeNull();
    });
  });

  // --- Task 1.40, spec 7.5 item 2: a bare match remapped inside one push batch ---

  describe('an entry in the same batch as its remapped bare match (spec 7.5 item 2)', () => {
    const entryOn = (matchId: string, over: Partial<Operation> = {}) =>
      op({ seq: 2, ...over, payload: { ...op().payload, event_id: EV, match_id: matchId } });

    it('is applied against the canonical match, not rejected as invalid', async () => {
      await syncPush(scouter, { device_id: 'd-1', operations: [bareMatch()] }, ctx);
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-2',
          operations: [bareMatch({ row_id: M_OTHER, seq: 1 }), entryOn(M_OTHER)],
        },
        ctx,
      );
      expect(res.results).toMatchObject([
        { status: 'noop', row_id: M_1 },
        { status: 'applied', row_id: 'e-1' },
      ]);
      expect(ctx.rows.scouting_entries.get('e-1')!.match_id).toBe(M_1);
    });

    it('fails without the remap: the device id names no match the server holds', async () => {
      // The negative: the same entry ALONE, with no bare match before it in its batch, still
      // names the device's id, which the server never created (here the fake reports it gone).
      await syncPush(scouter, { device_id: 'd-1', operations: [bareMatch()] }, ctx);
      ctx.missingParents.add(M_OTHER);
      const res = await syncPush(
        scouter,
        { device_id: 'd-2', operations: [entryOn(M_OTHER)] },
        ctx,
      );
      expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'parent-deleted' });
    });

    it('remaps after a replayed bare match too', async () => {
      await syncPush(scouter, { device_id: 'd-1', operations: [bareMatch()] }, ctx);
      const second = bareMatch({ row_id: M_OTHER, seq: 1 });
      await syncPush(scouter, { device_id: 'd-2', operations: [second] }, ctx);
      const res = await syncPush(
        scouter,
        { device_id: 'd-2', operations: [second, entryOn(M_OTHER)] },
        ctx,
      );
      expect(res.results).toMatchObject([{ status: 'noop', row_id: M_1 }, { status: 'applied' }]);
      expect(ctx.rows.scouting_entries.get('e-1')!.match_id).toBe(M_1);
    });

    it('is a duplicate when the canonical match already has an entry for that robot', async () => {
      await syncPush(
        scouter,
        { device_id: 'd-1', operations: [bareMatch(), entryOn(M_1, { row_id: 'e-first' })] },
        ctx,
      );
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-2',
          operations: [bareMatch({ row_id: M_OTHER, seq: 1 }), entryOn(M_OTHER, { row_id: 'e-2' })],
        },
        ctx,
      );
      expect(res.results[1]).toMatchObject({
        status: 'duplicate',
        row_id: 'e-2',
        duplicate_row_id: 'e-first',
      });
    });

    it('leaves an entry on another match, and one before the match op, alone', async () => {
      await syncPush(scouter, { device_id: 'd-1', operations: [bareMatch()] }, ctx);
      ctx.missingParents.add(M_OTHER);
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-2',
          operations: [
            entryOn(M_OTHER, { seq: 1, row_id: 'e-before' }),
            bareMatch({ row_id: M_OTHER, seq: 2 }),
            entryOn(M_9, { seq: 3, row_id: 'e-other' }),
          ],
        },
        ctx,
      );
      expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'parent-deleted' });
      expect(res.results[2]).toMatchObject({ status: 'applied' });
      expect(ctx.rows.scouting_entries.get('e-other')!.match_id).toBe(M_9);
    });
  });

  // --- Task 1.40 side task A: super entries are exempt from the self-edit window (7.6) ---

  describe('the self-edit window binds match entries only (SPEC-FINAL 7.6, v1.26)', () => {
    const superPayload = {
      ...op().payload,
      form_kind: 'super',
      match_id: null,
      alliance: null,
      robot_status: null,
    };
    const superCreate = (over: Partial<Operation> = {}) =>
      op({ row_id: 's-1', payload: superPayload, ...over });
    const superEdit = (updatedAt: string, over: Partial<Operation> = {}) =>
      op({
        row_id: 's-1',
        action: 'update',
        base_version: 1,
        client_updated_at: updatedAt,
        payload: { ...superPayload, data: { auto_notes: 7 } },
        ...over,
      });

    it("still refuses a scouter's own match entry at 5 min + 1 s", async () => {
      await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-1',
          operations: [
            op({
              action: 'update',
              base_version: 1,
              client_updated_at: '2026-11-14T09:05:01.000Z',
            }),
          ],
        },
        ctx,
      );
      expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'edit-window-expired' });
    });

    it("accepts a scouter's own super entry edit at 60 min", async () => {
      await syncPush(scouter, { device_id: 'd-1', operations: [superCreate()] }, ctx);
      const res = await syncPush(
        scouter,
        { device_id: 'd-1', operations: [superEdit('2026-11-14T10:00:00.000Z')] },
        ctx,
      );
      expect(res.results[0]).toMatchObject({ status: 'applied', new_version: 2 });
      expect(ctx.rows.scouting_entries.get('s-1')).toMatchObject({
        data: { auto_notes: 7 },
        scouter_id: 'u-scouter',
        client_created_at: '2026-11-14T09:00:00.000Z',
      });
    });

    it("still refuses a scouter's edit of another scouter's super entry", async () => {
      ctx.users.set('u-other', { id: 'u-other', role: 'scouter', disabled_at: null });
      await syncPush(scouter, { device_id: 'd-1', operations: [superCreate()] }, ctx);
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-2',
          operations: [superEdit('2026-11-14T09:01:00.000Z', { author_user_id: 'u-other' })],
        },
        ctx,
      );
      expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'forbidden' });
    });

    it('never lets the exemption carry match data past the window', async () => {
      await syncPush(scouter, { device_id: 'd-1', operations: [superCreate()] }, ctx);
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-1',
          operations: [superEdit('2026-11-14T10:00:00.000Z', { payload: op().payload })],
        },
        ctx,
      );
      expect(res.results[0]).toMatchObject({ status: 'rejected', reason: 'edit-window-expired' });
    });
  });

  // --- Task 1.40 side task B: Q7.8, a lead's re-save clears a refused record (9.3.1) ---

  describe("a lead's re-save keeps crediting the scouter (Q7.8, SPEC-FINAL 9.3.1 v1.27)", () => {
    beforeEach(() => {
      ctx.users.set('u-lead', { id: 'u-lead', role: 'lead', disabled_at: null });
      ctx.users.set('u-other', { id: 'u-other', role: 'scouter', disabled_at: null });
    });

    it("applies a lead's create crediting another scouter, and the row credits that scouter", async () => {
      const res = await syncPush(
        lead,
        {
          device_id: 'd-1',
          operations: [
            op({ author_user_id: 'u-lead', payload: { ...op().payload, scouter_id: 'u-other' } }),
          ],
        },
        ctx,
      );
      expect(res.results[0]).toMatchObject({ status: 'applied', new_version: 1 });
      expect(ctx.rows.scouting_entries.get('e-1')!.scouter_id).toBe('u-other');
    });

    it("refuses a scouter's create crediting another scouter", async () => {
      const res = await syncPush(
        scouter,
        {
          device_id: 'd-1',
          operations: [op({ payload: { ...op().payload, scouter_id: 'u-other' } })],
        },
        ctx,
      );
      expect(res.results[0]).toEqual({
        op_id: expect.any(String),
        status: 'rejected',
        reason: 'forbidden',
        detail: 'a scouter may submit an entry only as themselves',
      });
      expect(ctx.rows.scouting_entries.size).toBe(0);
    });

    it("applies a lead's update of a scouter's match entry at 60 min", async () => {
      await syncPush(scouter, { device_id: 'd-1', operations: [op()] }, ctx);
      const res = await syncPush(
        lead,
        {
          device_id: 'd-1',
          operations: [
            op({
              action: 'update',
              base_version: 1,
              author_user_id: 'u-lead',
              client_updated_at: '2026-11-14T10:00:00.000Z',
            }),
          ],
        },
        ctx,
      );
      expect(res.results[0]).toMatchObject({ status: 'applied', new_version: 2 });
      expect(ctx.rows.scouting_entries.get('e-1')!.scouter_id).toBe('u-scouter');
    });

    it("refuses a lead's create crediting a user who does not exist, and credits the lead when none is named", async () => {
      const unknown = await syncPush(
        lead,
        {
          device_id: 'd-1',
          operations: [
            op({ author_user_id: 'u-lead', payload: { ...op().payload, scouter_id: 'u-ghost' } }),
          ],
        },
        ctx,
      );
      expect(unknown.results[0]).toMatchObject({
        status: 'rejected',
        reason: 'invalid',
        detail: 'unknown scouter',
      });
      const { scouter_id: _dropped, ...unnamed } = op().payload as Record<string, unknown>;
      const own = await syncPush(
        lead,
        { device_id: 'd-1', operations: [op({ author_user_id: 'u-lead', payload: unnamed })] },
        ctx,
      );
      expect(own.results[0]).toMatchObject({ status: 'applied' });
      expect(ctx.rows.scouting_entries.get('e-1')!.scouter_id).toBe('u-lead');
    });
  });
});
