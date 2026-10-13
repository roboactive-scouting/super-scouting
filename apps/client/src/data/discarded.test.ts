import { beforeEach, describe, expect, it } from 'vitest';
import { PARENT_DELETED_DETAIL, type Operation } from '@frc/shared';
import { db } from '@/data/db';
import { ackResults, enqueue, pending, syncStateOf } from './outbox';
import {
  dismissDiscarded,
  groupDiscarded,
  listDiscarded,
  recordDiscarded,
  undismissedDiscarded,
  UNKNOWN_EVENT,
  UNKNOWN_SCOUTER,
} from './discarded';

const EVENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MATCH = 'bbbbbbbb-0000-4000-8000-000000000012';

const op: Operation = {
  op_id: 'o-1',
  entity: 'scouting_entry',
  row_id: 'e-1',
  action: 'create',
  base_version: null,
  payload: {
    event_id: EVENT,
    match_id: MATCH,
    team_id: 't-1',
    form_kind: 'match',
    alliance: 'red',
    scouter_id: 'u-1',
    robot_status: 'broke_down',
    breakdown_seconds: 7319,
    data: { auto_notes: 'ENTERED-VALUE-QX', comment: 'ENTERED-COMMENT-QZ' },
  },
  author_user_id: 'u-1',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: 1,
};

const refused = (reason: 'parent-deleted' | 'invalid' | 'forbidden' | 'edit-window-expired') =>
  ackResults([
    reason === 'parent-deleted'
      ? { op_id: 'o-1', status: 'rejected', reason, detail: PARENT_DELETED_DETAIL.event }
      : { op_id: 'o-1', status: 'rejected', reason },
  ]);

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    { entity: 'events', id: EVENT, name: 'District #2 · Haifa' },
    { entity: 'teams', id: 't-1', number: 2096, name: 'ROBACTIVE' },
    { entity: 'matches', id: MATCH, event_id: EVENT, match_type: 'qualification', number: 12 },
    {
      entity: 'match_teams',
      id: 'mt-1',
      match_id: MATCH,
      team_id: 't-1',
      alliance: 'red',
      station: 2,
      deleted_at: null,
    },
    { entity: 'users', id: 'u-1', full_name: 'Seed Scouter' },
  ]);
});

describe('parent-deleted (SPEC-FINAL 9.7)', () => {
  it('hard-deletes the local record and its outbox operation', async () => {
    await enqueue(op);
    await db.rows.put({ entity: 'scouting_entries', id: 'e-1', event_id: EVENT });
    await refused('parent-deleted');

    expect(await pending(10)).toHaveLength(0);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.rows.get(['scouting_entries', 'e-1'])).toBeUndefined();
    expect(await syncStateOf('e-1')).toBeUndefined();
  });

  it('writes what was discarded to the local log, naming team, match, kind, scouter and time', async () => {
    await enqueue(op);
    await refused('parent-deleted');
    const [entry] = await listDiscarded();
    expect(entry!.summary).toMatchObject({
      team: '2096 ROBACTIVE',
      match: 'Q12',
      station: 'R2',
      alliance: 'red',
      form_kind: 'match',
      robot_status: 'broke_down',
      scouter: 'Seed Scouter',
      client_updated_at: '2026-11-14T09:00:00.000Z',
    });
    expect(entry!.event_name).toBe('District #2 · Haifa');
    expect(entry!.row_id).toBe('e-1');
    expect(entry!.reason).toMatch(/an admin deleted the competition, season or form/i);
  });

  it('stores no entered value: no data, no breakdown time', async () => {
    await enqueue(op);
    await refused('parent-deleted');
    const [record] = await db.discarded.toArray();
    expect(Object.keys(record!).sort()).toEqual([
      'discarded_at',
      'dismissed_at',
      'event_id',
      'event_name',
      'id',
      'reason',
      'row_id',
      'summary',
    ]);
    expect(Object.keys(record!.summary).sort()).toEqual([
      'alliance',
      'client_updated_at',
      'form_kind',
      'match',
      'match_number',
      'match_type',
      'robot_status',
      'scouter',
      'scouter_id',
      'station',
      'team',
      'team_name',
      'team_number',
    ]);
    const values = JSON.stringify(Object.values(record!.summary));
    expect(values).not.toContain('ENTERED-');
    expect(Object.values(record!.summary)).not.toContain(7319);
  });

  it('keeps the log for the life of the install and never prunes it', async () => {
    await enqueue(op);
    await refused('parent-deleted');
    db.close();
    await db.open();
    expect(await listDiscarded()).toHaveLength(1);
  });

  it.each(['invalid', 'forbidden', 'edit-window-expired'] as const)(
    'does NOT discard on a %s rejection — it stays local for a human to look at',
    async (reason) => {
      await enqueue(op);
      await db.rows.put({ entity: 'scouting_entries', id: 'e-1', event_id: EVENT });
      await refused(reason);
      expect(await db.outbox.count()).toBe(1);
      expect((await syncStateOf('e-1'))?.rejection?.code).toBe(reason);
      expect(await db.rows.get(['scouting_entries', 'e-1'])).toBeDefined();
      expect(await listDiscarded()).toHaveLength(0);
    },
  );

  it('rebuilds a deleted MATCH instead of discarding (9.7 v1.18)', async () => {
    await enqueue(op);
    await ackResults([
      {
        op_id: 'o-1',
        status: 'rejected',
        reason: 'parent-deleted',
        detail: PARENT_DELETED_DETAIL.match,
      },
    ]);
    expect((await pending(10)).map((o) => o.entity)).toEqual(['match', 'scouting_entry']);
    expect(await listDiscarded()).toHaveLength(0);
  });

  it('writes the record before the data goes, in one transaction', async () => {
    await enqueue(op);
    await db.rows.put({ entity: 'scouting_entries', id: 'e-1', event_id: EVENT });
    const order: string[] = [];
    const onCreate = () => void order.push('log');
    const onOutbox = () => void order.push('outbox');
    const onRow = () => void order.push('row');
    db.discarded.hook('creating', onCreate);
    db.outbox.hook('deleting', onOutbox);
    db.rows.hook('deleting', onRow);
    try {
      await refused('parent-deleted');
    } finally {
      db.discarded.hook('creating').unsubscribe(onCreate);
      db.outbox.hook('deleting').unsubscribe(onOutbox);
      db.rows.hook('deleting').unsubscribe(onRow);
    }
    expect(order).toEqual(['log', 'outbox', 'row']);
  });

  it('keeps everything when the log cannot be written', async () => {
    await enqueue(op);
    await db.rows.put({ entity: 'scouting_entries', id: 'e-1', event_id: EVENT });
    const fail = () => {
      throw new Error('disk full');
    };
    db.discarded.hook('creating', fail);
    try {
      await expect(refused('parent-deleted')).rejects.toThrow('disk full');
    } finally {
      db.discarded.hook('creating').unsubscribe(fail);
    }
    expect(await db.outbox.count()).toBe(1);
    expect(await db.rows.get(['scouting_entries', 'e-1'])).toBeDefined();
    expect(await listDiscarded()).toHaveLength(0);
  });

  it('a bare match whose event is gone leaves without a log line, and its entry then goes', async () => {
    const bare: Operation = {
      ...op,
      op_id: 'o-m',
      entity: 'match',
      row_id: MATCH,
      payload: { event_id: EVENT, match_type: 'qualification', number: 12 },
      seq: 0,
    };
    await enqueue(bare);
    await enqueue(op);
    await ackResults([
      {
        op_id: 'o-m',
        status: 'rejected',
        reason: 'parent-deleted',
        detail: PARENT_DELETED_DETAIL.event,
      },
      {
        op_id: 'o-1',
        status: 'rejected',
        reason: 'parent-deleted',
        detail: PARENT_DELETED_DETAIL.match,
      },
    ]);
    expect(await db.outbox.count()).toBe(0);
    expect(await syncStateOf(MATCH)).toBeUndefined();
    const log = await listDiscarded();
    expect(log.map((r) => r.row_id)).toEqual(['e-1']);
  });

  it('a delete refused parent-deleted removes the entry without logging it', async () => {
    await db.rows.put({ entity: 'users', id: 'u-1', full_name: 'Lead', role: 'lead' });
    await db.rows.put({ entity: 'scouting_entries', id: 'e-1', event_id: EVENT, version: 2 });
    await enqueue({ ...op, action: 'delete', base_version: 2, payload: {} });
    await refused('parent-deleted');
    expect(await db.outbox.count()).toBe(0);
    expect(await db.rows.get(['scouting_entries', 'e-1'])).toBeUndefined();
    expect(await listDiscarded()).toHaveLength(0);
  });
});

describe('recordDiscarded falls back when the cache has lost a parent', () => {
  it('names an earlier competition and an unknown scouter, and a super entry has no match', async () => {
    await db.rows.where('[entity+id]').equals(['events', EVENT]).delete();
    const record = await recordDiscarded(
      {
        ...op,
        payload: {
          event_id: EVENT,
          match_id: null,
          team_id: 't-1',
          form_kind: 'super',
          scouter_id: 'u-2',
        },
      },
      undefined,
    );
    expect(record.event_name).toBe(UNKNOWN_EVENT);
    expect(record.summary.scouter).toBe(UNKNOWN_SCOUTER);
    expect(record.summary.match).toBeNull();
    expect(record.summary.station).toBeNull();
    expect(record.summary.form_kind).toBe('super');
  });

  it('fills what a payload lacks from the cached row', async () => {
    const record = await recordDiscarded(
      { ...op, payload: {} },
      {
        id: 'e-1',
        event_id: EVENT,
        match_id: MATCH,
        team_id: 't-1',
        form_kind: 'match',
        scouter_id: 'u-1',
      },
    );
    expect(record.summary).toMatchObject({
      match: 'Q12',
      team: '2096 ROBACTIVE',
      scouter: 'Seed Scouter',
    });
  });
});

describe('dismissal (task 1.43 places the notice)', () => {
  it('hides the records from the notice but not from the log', async () => {
    await enqueue(op);
    await refused('parent-deleted');
    expect(await undismissedDiscarded()).toHaveLength(1);
    await dismissDiscarded();
    expect(await undismissedDiscarded()).toHaveLength(0);
    expect(await listDiscarded()).toHaveLength(1);
  });

  it('dismisses only the records named', async () => {
    await recordDiscarded({ ...op, op_id: 'a' }, undefined, '2026-11-14T10:00:00.000Z');
    await recordDiscarded({ ...op, op_id: 'b' }, undefined, '2026-11-14T10:00:00.000Z');
    await dismissDiscarded(['a']);
    expect((await undismissedDiscarded()).map((r) => r.id)).toEqual(['b']);
  });
});

describe('the log order', () => {
  it('lists newest removal first and groups each removal with its competition', async () => {
    await recordDiscarded({ ...op, op_id: 'old' }, undefined, '2026-10-09T17:40:00.000Z');
    await recordDiscarded(
      { ...op, op_id: 'new-2', client_updated_at: '2026-10-10T14:22:00.000Z' },
      undefined,
      '2026-10-12T08:02:00.000Z',
    );
    await recordDiscarded(
      { ...op, op_id: 'new-1', client_updated_at: '2026-10-10T14:20:00.000Z' },
      undefined,
      '2026-10-12T08:02:00.000Z',
    );
    const groups = groupDiscarded(await listDiscarded());
    expect(groups.map((g) => g.discarded_at)).toEqual([
      '2026-10-12T08:02:00.000Z',
      '2026-10-09T17:40:00.000Z',
    ]);
    expect(groups[0]!.records.map((r) => r.id)).toEqual(['new-1', 'new-2']);
    expect(groups[0]!.event_name).toBe('District #2 · Haifa');
  });
});
