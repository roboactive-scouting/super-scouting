import { describe, expect, it } from 'vitest';
import { operationSchema, SYNC_ENTITIES, type Operation } from './operation';

const valid: Operation = {
  op_id: '11111111-1111-4111-8111-111111111111',
  entity: 'scouting_entry',
  row_id: '22222222-2222-4222-8222-222222222222',
  action: 'create',
  base_version: null,
  payload: { team_id: 't' },
  author_user_id: '33333333-3333-4333-8333-333333333333',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: 1,
};

describe('Operation', () => {
  it('accepts a well-formed create', () => {
    expect(operationSchema.parse(valid)).toEqual(valid);
  });

  it('requires base_version to be null on a create and a number on an update', () => {
    expect(
      operationSchema.safeParse({ ...valid, action: 'update', base_version: null }).success,
    ).toBe(false);
    expect(operationSchema.safeParse({ ...valid, action: 'update', base_version: 3 }).success).toBe(
      true,
    );
    expect(operationSchema.safeParse({ ...valid, action: 'create', base_version: 3 }).success).toBe(
      false,
    );
  });

  it('requires an empty payload on a delete', () => {
    expect(
      operationSchema.safeParse({ ...valid, action: 'delete', base_version: 1, payload: { a: 1 } })
        .success,
    ).toBe(false);
    expect(
      operationSchema.safeParse({ ...valid, action: 'delete', base_version: 1, payload: {} })
        .success,
    ).toBe(true);
  });

  it('carries author_user_id, because push authorizes per operation and not per bearer', () => {
    const { author_user_id: _omitted, ...without } = valid;
    expect(operationSchema.safeParse(without).success).toBe(false);
  });

  it('covers exactly the seven syncable entities of SPEC-FINAL 9.4', () => {
    expect([...SYNC_ENTITIES]).toEqual([
      'scouting_entry',
      'match',
      'pick_list',
      'pick_list_entry',
      'do_not_pick',
      'alliance_slot',
      'alliance_decline',
    ]);
  });

  it('rejects a non-ISO client timestamp', () => {
    expect(operationSchema.safeParse({ ...valid, client_created_at: '14/11/2026' }).success).toBe(
      false,
    );
  });
});
