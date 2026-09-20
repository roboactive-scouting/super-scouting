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
      version: 1,
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
    expect(res.results[0]).toMatchObject({ status: 'noop' });
  });
});
