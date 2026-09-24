import { beforeEach, describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from '@frc/shared';
import { db } from '@/data/db';
import { ackResults, pending } from '@/data/outbox';
import { submitEntry } from './submitEntry';

const fields: FormFieldDefinition[] = [
  {
    id: 'f1',
    key: 'auto_notes',
    label: 'Auto notes',
    type: 'counter',
    display_order: 1,
    required: true,
    config: { min: 0, max: 99, step: 1 },
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
    expected_range: { min: 0, max: 10 },
    include_in_ai_context: null,
    is_ordinal: null,
  },
];

const base = {
  fields,
  eventId: 'ev-1',
  formVersionId: 'fv-1',
  formKind: 'match' as const,
  matchId: 'm-1',
  teamId: 't-1',
  alliance: 'red' as const,
  authorUserId: 'u-1',
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('submitEntry', () => {
  it('queues one create operation carrying the whole row', async () => {
    const { row_id } = await submitEntry({
      ...base,
      robotStatus: 'played',
      data: { auto_notes: 3 },
    });
    const [op] = await pending(10);
    expect(op!.entity).toBe('scouting_entry');
    expect(op!.action).toBe('create');
    expect(op!.row_id).toBe(row_id);
    expect(op!.payload).toMatchObject({
      event_id: 'ev-1',
      match_id: 'm-1',
      team_id: 't-1',
      alliance: 'red',
      form_kind: 'match',
      robot_status: 'played',
      data: { auto_notes: 3 },
    });
    expect(op!.author_user_id).toBe('u-1');
  });

  it('writes the row into the local dataset immediately, so statistics include it offline', async () => {
    const { row_id } = await submitEntry({
      ...base,
      robotStatus: 'played',
      data: { auto_notes: 3 },
    });
    const row = await db.rows.get(['scouting_entries', row_id]);
    expect(row).toMatchObject({ event_id: 'ev-1', version: 1 });
  });

  it('submits data = {} for a no-show and never a zero (SPEC-FINAL 8.2)', async () => {
    await submitEntry({ ...base, robotStatus: 'no_show', data: { auto_notes: 0 } });
    const [op] = await pending(10);
    expect(op!.payload.data).toEqual({});
    expect(op!.payload.robot_status).toBe('no_show');
  });

  it('carries breakdown_seconds only for broke_down', async () => {
    await submitEntry({
      ...base,
      robotStatus: 'broke_down',
      breakdownSeconds: 45,
      data: { auto_notes: 2 },
    });
    const [op] = await pending(10);
    expect(op!.payload.breakdown_seconds).toBe(45);

    await db.delete();
    await db.open();
    await submitEntry({
      ...base,
      robotStatus: 'played',
      breakdownSeconds: 45,
      data: { auto_notes: 2 },
    });
    const [second] = await pending(10);
    expect(second!.payload.breakdown_seconds).toBeNull();
  });

  it('refuses a value outside the expected range (SPEC-FINAL 15.1)', async () => {
    await expect(
      submitEntry({ ...base, robotStatus: 'played', data: { auto_notes: 11 } }),
    ).rejects.toThrow(/expected range/i);
    expect(await pending(10)).toHaveLength(0);
  });

  it('refuses a second entry for the same (event, kind, team, match) already on this device', async () => {
    await submitEntry({ ...base, robotStatus: 'played', data: { auto_notes: 1 } });
    await expect(
      submitEntry({ ...base, robotStatus: 'played', data: { auto_notes: 2 } }),
    ).rejects.toThrow(/already an entry/i);
  });

  it('clears the draft once the entry is queued', async () => {
    await db.drafts.put({ key: 'match:m-1:t-1', row_id: 'x', payload: {}, updated_at: 'now' });
    await submitEntry({
      ...base,
      robotStatus: 'played',
      data: { auto_notes: 1 },
      draftKey: 'match:m-1:t-1',
    });
    expect(await db.drafts.get('match:m-1:t-1')).toBeUndefined();
  });

  it("keeps the scouter of an entry a lead edits, and makes the lead the op's author", async () => {
    const { row_id } = await submitEntry({
      ...base,
      robotStatus: 'played',
      data: { auto_notes: 1 },
    });
    // The create has synced, so the lead's change is an update of a row the server holds.
    const [created] = await pending(10);
    await ackResults([{ op_id: created!.op_id, status: 'applied', row_id, new_version: 1 }]);
    await submitEntry({
      ...base,
      authorUserId: 'u-lead',
      rowId: row_id,
      robotStatus: 'played',
      data: { auto_notes: 2 },
    });
    const [op] = await pending(10);
    expect(op!.author_user_id).toBe('u-lead');
    expect(op!.payload).toMatchObject({ scouter_id: 'u-1' });
    expect(await db.rows.get(['scouting_entries', row_id])).toMatchObject({ scouter_id: 'u-1' });
  });
});
