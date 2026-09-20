import { describe, expect, it } from 'vitest';
import {
  isAck,
  MAX_OPERATIONS_PER_PUSH,
  PULL_ENTITY_KEYS,
  pullRequestSchema,
  pushRequestSchema,
  WATERMARK_OVERLAP_MS,
} from './protocol';

describe('push protocol', () => {
  it('caps a batch at 200 operations (SPEC-FINAL 9.3.1)', () => {
    expect(MAX_OPERATIONS_PER_PUSH).toBe(200);
    const op = {
      op_id: '11111111-1111-4111-8111-111111111111',
      entity: 'scouting_entry',
      row_id: '22222222-2222-4222-8222-222222222222',
      action: 'create',
      base_version: null,
      payload: {},
      author_user_id: '33333333-3333-4333-8333-333333333333',
      client_created_at: '2026-11-14T09:00:00.000Z',
      client_updated_at: '2026-11-14T09:00:00.000Z',
      seq: 1,
    };
    const many = Array.from({ length: 201 }, (_, i) => ({ ...op, seq: i, op_id: `${i}` }));
    expect(pushRequestSchema.safeParse({ device_id: op.row_id, operations: many }).success).toBe(
      false,
    );
  });

  it('treats applied, noop, divergence and duplicate as a cloud ack, and rejected as not', () => {
    expect(isAck('applied')).toBe(true);
    expect(isAck('noop')).toBe(true);
    expect(isAck('divergence')).toBe(true);
    expect(isAck('duplicate')).toBe(true);
    expect(isAck('rejected')).toBe(false);
  });
});

describe('pull protocol', () => {
  it('names exactly the 24 synced entity keys of SPEC-FINAL 9.3', () => {
    expect(PULL_ENTITY_KEYS).toHaveLength(24);
    expect(PULL_ENTITY_KEYS).toContain('app_settings');
    expect(PULL_ENTITY_KEYS).toContain('weight_presets');
    expect(PULL_ENTITY_KEYS).not.toContain('drafts');
  });

  it('overlaps the watermark by five seconds so nothing committed in the same instant is skipped', () => {
    expect(WATERMARK_OVERLAP_MS).toBe(5000);
  });

  it('accepts a first pull with no since and a delta pull with one', () => {
    const eventId = '22222222-2222-4222-8222-222222222222';
    expect(pullRequestSchema.parse({ event_id: eventId })).toMatchObject({ event_id: eventId });
    expect(
      pullRequestSchema.parse({ event_id: eventId, since: '2026-11-14T09:00:00.000Z' }).since,
    ).toBe('2026-11-14T09:00:00.000Z');
  });
});
