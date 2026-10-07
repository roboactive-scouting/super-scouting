import { beforeEach, describe, expect, it } from 'vitest';
import type { Operation } from '@frc/shared';
import { db, setMeta } from './db';
import { readSyncStatus } from './syncStatus';

function op(id: string, entity: Operation['entity'], author: string): Operation {
  return {
    op_id: id,
    entity,
    row_id: `r-${id}`,
    action: 'create',
    base_version: null,
    payload: {},
    author_user_id: author,
    client_created_at: '2026-10-06T09:00:00Z',
    client_updated_at: '2026-10-06T09:00:00Z',
    seq: 1,
  } as Operation;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('readSyncStatus', () => {
  it('counts records per author, not bare matches', async () => {
    await db.outbox.bulkPut([
      op('1', 'scouting_entry', 'u1'),
      op('2', 'scouting_entry', 'u1'),
      op('3', 'scouting_entry', 'u2'),
      op('4', 'match', 'u1'),
    ]);
    await setMeta('sync.last_success_at', '2026-10-06T10:00:00Z');
    expect(await readSyncStatus()).toEqual({
      waiting: 3,
      byAuthor: { u1: 2, u2: 1 },
      lastSyncAt: '2026-10-06T10:00:00Z',
    });
  });
  it('is empty on a fresh device', async () => {
    expect(await readSyncStatus()).toEqual({ waiting: 0, byAuthor: {}, lastSyncAt: null });
  });
});
