import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullResponse, PushResponse } from '@frc/shared';
import { PULL_ENTITY_KEYS } from '@frc/shared';
import { ApiError, SyncTimeoutError } from './api';
import { db, getMeta } from './db';
import { enqueue } from './outbox';
import { syncNow } from './sync';
import { describeSyncFailure, LAST_FAILURE, type SyncFailure } from './syncFailure';

vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: 'https://api.test', deviceWipeCode: 'w', appVersion: 't' }),
}));

/** What the route answers for a malformed envelope: zod's issues as the message. */
const ZOD_400 = JSON.stringify(
  [{ code: 'invalid_string', validation: 'uuid', path: ['device_id'], message: 'Invalid uuid' }],
  null,
  2,
);

describe('describeSyncFailure (UF.13, SPEC-FINAL 17.8)', () => {
  it.each([
    ['no connection', new TypeError('Failed to fetch'), 'offline', 'No connection to the server'],
    ['a deadline', new SyncTimeoutError(), 'timeout', "The server didn't answer in time"],
    [
      'a 401',
      new ApiError('unauthenticated', 'sign in again', 401),
      'signin',
      'Your sign-in expired',
    ],
    [
      'a 500',
      new ApiError('invalid', 'that did not work', 500),
      'server',
      'The server is having trouble',
    ],
    [
      'a 503',
      new ApiError('unknown', 'Service Unavailable', 503),
      'server',
      'The server is having trouble',
    ],
    [
      'a 400 with zod issues',
      new ApiError('invalid', ZOD_400, 400),
      'refused',
      "The server refused this device's data — device_id: Invalid uuid",
    ],
    [
      'a 400 with no issues to read',
      new ApiError('invalid', 'Bad Request', 400),
      'refused',
      "The server refused this device's data",
    ],
    [
      'anything else',
      new Error('results is not iterable'),
      'offline',
      'No connection to the server',
    ],
  ])('%s → one plain line', (_, error, kind, text) => {
    expect(describeSyncFailure(error)).toEqual({ kind, text });
  });

  it('never shows a raw code or the server’s own text', () => {
    const text = describeSyncFailure(new ApiError('invalid', 'that did not work', 500)).text;
    expect(text).not.toMatch(/invalid|500|that did not work/);
  });
});

const emptyEntities = Object.fromEntries(
  PULL_ENTITY_KEYS.map((k) => [k, []]),
) as unknown as PullResponse['entities'];
const pull = async (): Promise<PullResponse> => ({
  watermark: '2026-11-14T09:00:55.000Z',
  next_cursor: null,
  complete: true,
  entities: emptyEntities,
});
const run = (push: () => Promise<PushResponse>) =>
  syncNow({ api: { push, pull }, eventId: 'ev-1', deviceId: 'd-1' });
const lastFailure = () => getMeta<SyncFailure | null>(LAST_FAILURE, null);

describe('syncNow keeps why the last sync failed (UF.13)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await enqueue({
      op_id: 'op-1',
      entity: 'scouting_entry',
      row_id: 'row-1',
      action: 'create',
      base_version: null,
      payload: {},
      author_user_id: 'u-1',
      client_created_at: '2026-11-14T09:00:00.000Z',
      client_updated_at: '2026-11-14T09:00:00.000Z',
      seq: 1,
    });
  });

  it('records a failed push, and clears it on the next sync that succeeds', async () => {
    const outcome = await run(async () => {
      throw new ApiError('invalid', 'that did not work', 500);
    });
    expect(outcome.status).toBe('offline');
    expect(await lastFailure()).toMatchObject({
      kind: 'server',
      text: 'The server is having trouble',
      at: expect.any(String),
    });

    await run(async () => ({
      results: [{ op_id: 'op-1', status: 'applied', row_id: 'row-1', new_version: 1 }],
    }));
    expect(await lastFailure()).toBeNull();
  });

  it('records an expired sign-in as such', async () => {
    const outcome = await run(async () => {
      throw new ApiError('unauthenticated', 'sign in again', 401);
    });
    expect(outcome.status).toBe('unauthenticated');
    expect(await lastFailure()).toMatchObject({ kind: 'signin', text: 'Your sign-in expired' });
  });

  it('records a failed pull too', async () => {
    const outcome = await syncNow({
      api: {
        push: async () => ({ results: [] }),
        pull: async () => {
          throw new SyncTimeoutError();
        },
      },
      eventId: 'ev-1',
      deviceId: 'd-1',
    });
    expect(outcome.status).toBe('offline');
    expect(await lastFailure()).toMatchObject({ kind: 'timeout' });
  });
});
