import { beforeEach, describe, expect, it } from 'vitest';
import { operationSchema } from '@frc/shared';
import { db } from '@/data/db';
import { DeleteNotAllowedError, pending } from '@/data/outbox';
import { NOT_ON_DEVICE, softDeleteEntry } from './softDeleteEntry';

const ENTRY = '33333333-3333-4333-8333-333333333333';
const LEAD = '44444444-4444-4444-8444-444444444444';
const SCOUTER = '55555555-5555-4555-8555-555555555555';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    { entity: 'users', id: LEAD, role: 'lead' },
    { entity: 'users', id: SCOUTER, role: 'scouter' },
    {
      entity: 'scouting_entries',
      id: ENTRY,
      scouter_id: SCOUTER,
      version: 3,
      deleted_at: null,
      client_created_at: '2026-03-17T09:02:00+00:00',
    },
  ]);
});

describe('softDeleteEntry (SPEC-FINAL 3.9, 9.4; task 1.61)', () => {
  it("queues a lead's delete through the outbox and hides the device's copy at once", async () => {
    await softDeleteEntry(ENTRY, LEAD);
    const [op] = await pending(10);
    expect(operationSchema.parse(op)).toMatchObject({
      entity: 'scouting_entry',
      row_id: ENTRY,
      action: 'delete',
      base_version: 3,
      payload: {},
      author_user_id: LEAD,
      client_created_at: '2026-03-17T09:02:00.000Z',
    });
    const row = await db.rows.get(['scouting_entries', ENTRY]);
    expect(row?.deleted_at).toEqual(expect.any(String));
  });

  it("refuses a scouter's delete, their own entry included, and writes nothing", async () => {
    await expect(softDeleteEntry(ENTRY, SCOUTER)).rejects.toBeInstanceOf(DeleteNotAllowedError);
    expect(await pending(10)).toHaveLength(0);
    expect((await db.rows.get(['scouting_entries', ENTRY]))?.deleted_at).toBeNull();
  });

  it('says so when the device does not hold the entry, or it is already deleted', async () => {
    await expect(softDeleteEntry('66666666-6666-4666-8666-666666666666', LEAD)).rejects.toThrow(
      NOT_ON_DEVICE,
    );
    await softDeleteEntry(ENTRY, LEAD);
    await expect(softDeleteEntry(ENTRY, LEAD)).rejects.toThrow(NOT_ON_DEVICE);
  });
});
