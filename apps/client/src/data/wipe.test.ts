import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PULL_ENTITY_KEYS, type Operation, type PullResponse } from '@frc/shared';
import { session } from '@/auth/session';
import { practiceMode } from '@/features/entry/practice';
import { readPref, writePref } from '@/lib/devicePrefs';
import { onChanged, type ChangeKind } from './changes';
import { db, getMeta, setMeta, WIPED_AT_KEY, type DiscardedRecord } from './db';
import { ackResults, enqueue } from './outbox';
import { receiveOperations } from './qrReceive';
import { syncNow } from './sync';
import { isWipeCode, wipeDevice } from './wipe';

vi.mock('@/config', () => ({
  clientConfig: () => ({
    apiBaseUrl: 'https://api.test',
    deviceWipeCode: '2096',
    appVersion: 'v',
    builtAt: '',
  }),
}));

const op: Operation = {
  op_id: 'o-1',
  entity: 'scouting_entry',
  row_id: 'e-1',
  action: 'create',
  base_version: null,
  payload: {},
  author_user_id: 'u-1',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: 1,
};

const discardedRecord: DiscardedRecord = {
  id: 'd-1',
  discarded_at: 'now',
  reason: 'x',
  row_id: 'e-9',
  event_id: 'ev-1',
  event_name: 'Israel District #1',
  summary: {
    form_kind: 'match',
    match: 'Q12',
    match_type: 'qualification',
    match_number: 12,
    alliance: 'red',
    station: 'R2',
    team: '2096 ROBACTIVE',
    team_number: 2096,
    team_name: 'ROBACTIVE',
    robot_status: 'played',
    scouter: 'Noa Levi',
    scouter_id: 'u-1',
    client_updated_at: '2026-11-14T09:00:00.000Z',
  },
};

/** Everything a wipe would remove, so a refusal can be shown to remove none of it. */
async function seedDevice() {
  await db.rows.put({ entity: 'scouting_entries', id: 'e-1', event_id: 'ev-1' });
  await db.rows.put({ entity: 'events', id: 'ev-1', name: 'Israel District #1' });
  await db.syncState.put({ row_id: 'e-1', sync_state: 'acked', acked_at: 'now', origin: 'local' });
  await db.practiceDrafts.put({ key: 'p', row_id: '', payload: {}, updated_at: 'now' });
  await setMeta('sync.watermark', '2026-11-14T09:00:00.000Z');
  await setMeta('sync.hydrated_event_id', 'ev-1');
  await setMeta('scout.station', 'R2');
}

async function deviceCounts() {
  return {
    rows: await db.rows.count(),
    outbox: await db.outbox.count(),
    syncState: await db.syncState.count(),
    drafts: await db.drafts.count(),
    practiceDrafts: await db.practiceDrafts.count(),
    watermark: await getMeta<string | null>('sync.watermark', null),
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('wipeDevice (SPEC-FINAL 9.9)', () => {
  it('refuses a wrong code', async () => {
    await expect(wipeDevice('0000')).resolves.toMatchObject({ ok: false, reason: 'wrong-code' });
  });

  it('removes nothing on a wrong code', async () => {
    await seedDevice();
    const before = await deviceCounts();
    await expect(wipeDevice('2095')).resolves.toEqual({ ok: false, reason: 'wrong-code' });
    expect(await deviceCounts()).toEqual(before);
  });

  it('compares the code exactly, ignoring only surrounding spaces', () => {
    expect(isWipeCode('2096')).toBe(true);
    expect(isWipeCode(' 2096 ')).toBe(true);
    expect(isWipeCode('20 96')).toBe(false);
    expect(isWipeCode('')).toBe(false);
  });

  it('refuses while any record lacks a cloud ack, and says how many', async () => {
    await enqueue(op);
    await expect(wipeDevice('2096')).resolves.toMatchObject({
      ok: false,
      reason: 'unacked',
      unacked: 1,
    });
    expect(await db.outbox.count()).toBe(1);
  });

  it('removes nothing while a received QR copy waits for its ack', async () => {
    await seedDevice();
    await receiveOperations([{ ...op, op_id: 'o-qr', row_id: 'e-qr', author_user_id: 'u-2' }]);
    const before = await deviceCounts();
    await expect(wipeDevice('2096')).resolves.toEqual({
      ok: false,
      reason: 'unacked',
      unacked: 1,
    });
    expect(await deviceCounts()).toEqual(before);
    expect(await db.rows.get(['scouting_entries', 'e-qr'])).toBeDefined();
  });

  it('removes nothing while a refused (parked) record waits, and counts every unacked one', async () => {
    await seedDevice();
    await enqueue({ ...op, op_id: 'o-2', row_id: 'e-2' });
    await enqueue({ ...op, op_id: 'o-3', row_id: 'e-3' });
    await ackResults([{ op_id: 'o-2', status: 'rejected', reason: 'forbidden', detail: 'no' }]);
    expect((await db.syncState.get('e-2'))?.rejection).toBeTruthy();
    const before = await deviceCounts();
    await expect(wipeDevice('2096')).resolves.toEqual({
      ok: false,
      reason: 'unacked',
      unacked: 2,
    });
    expect(await deviceCounts()).toEqual(before);
  });

  it('removes nothing while an unfinished entry waits to be submitted (the row shows it held)', async () => {
    await seedDevice();
    await db.drafts.put({ key: 'v:m:t', row_id: '', payload: {}, updated_at: 'now' });
    const before = await deviceCounts();
    await expect(wipeDevice('2096')).resolves.toEqual({
      ok: false,
      reason: 'unacked',
      unacked: 1,
    });
    expect(await deviceCounts()).toEqual(before);
  });

  it('wipes the dataset, the drafts and the watermark when everything is acked', async () => {
    await db.rows.put({ entity: 'scouting_entries', id: 'e-1', event_id: 'ev-1' });
    await db.syncState.put({
      row_id: 'e-1',
      sync_state: 'acked',
      acked_at: 'now',
      origin: 'local',
    });
    await db.practiceDrafts.put({ key: 'k', row_id: '', payload: {}, updated_at: 'now' });
    await setMeta('sync.watermark', '2026-11-14T09:00:00.000Z');

    await expect(wipeDevice('2096')).resolves.toMatchObject({ ok: true });
    expect(await db.rows.count()).toBe(0);
    expect(await db.syncState.count()).toBe(0);
    expect(await db.drafts.count()).toBe(0);
    expect(await db.practiceDrafts.count()).toBe(0);
    expect(await db.meta.get('sync.watermark')).toBeUndefined();
  });

  it('keeps the discarded-records log, which is kept for the life of the install', async () => {
    await db.discarded.put(discardedRecord);
    await expect(wipeDevice('2096')).resolves.toEqual({ ok: true });
    expect(await db.discarded.count()).toBe(1);
  });

  it('keeps only the install’s identity in meta, signs out and resets this device’s settings', async () => {
    await seedDevice();
    await setMeta('device.id', 'dev-1');
    await setMeta('outbox.seq', 41);
    await session.signIn(
      {
        id: 'u-1',
        username: 'noa',
        full_name: 'Noa Levi',
        role: 'lead',
        must_change_password: false,
      },
      'token',
    );
    writePref('theme', 'outdoor');
    practiceMode.enter();
    const seen: ChangeKind[] = [];
    const off = onChanged((kind) => seen.push(kind));

    await expect(wipeDevice('2096')).resolves.toEqual({ ok: true });
    off();

    const left = await db.meta.toArray();
    expect(Object.fromEntries(left.map((m) => [m.key, m.value]))).toEqual({
      'device.id': 'dev-1',
      'outbox.seq': 41,
      [WIPED_AT_KEY]: expect.any(String),
      // signOut writes the empty session.
      'auth.session': null,
    });
    expect(await session.current()).toBeNull();
    expect(readPref('theme')).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(practiceMode.active()).toBe(false);
    // Every open screen re-reads: nothing keeps showing what the wipe removed.
    expect(seen).toEqual(expect.arrayContaining(['rows', 'outbox', 'meta']));
  });

  it('a record saved while the wipe runs is never lost', async () => {
    await seedDevice();
    const wipe = wipeDevice('2096');
    const save = enqueue(op);
    const [result] = await Promise.all([wipe, save]);
    // Either the check saw it and refused, or the save landed after the wipe: it is there.
    expect(await db.outbox.get('o-1')).toBeDefined();
    if (!result.ok) expect(result).toEqual({ ok: false, reason: 'unacked', unacked: 1 });
  });
});

describe('a sync running across a wipe (task 1.49)', () => {
  it('does not mark the emptied device as hydrated when its pull began before the wipe', async () => {
    const entities = Object.fromEntries(
      PULL_ENTITY_KEYS.map((k) => [k, []]),
    ) as unknown as PullResponse['entities'];
    let page = 0;
    const pull = vi.fn(async (): Promise<PullResponse> => {
      page += 1;
      // The lead wipes the device while the pull is between its pages.
      if (page === 1) await wipeDevice('2096');
      return {
        watermark: `2026-11-14T09:0${page}:00.000Z`,
        next_cursor: page === 1 ? 'c-2' : null,
        complete: page === 2,
        entities,
      };
    });
    const push = vi.fn(async () => ({ results: [] }));
    const outcome = await syncNow({ api: { push, pull }, eventId: 'ev-1', deviceId: 'd-1' });
    expect(outcome.status).toBe('ok');
    expect(pull).toHaveBeenCalledTimes(2);
    expect(await getMeta('sync.hydrated_event_id', null)).toBeNull();
    expect(await getMeta('sync.watermark', null)).toBeNull();
  });

  it('marks it hydrated as before when no wipe came between', async () => {
    const entities = Object.fromEntries(
      PULL_ENTITY_KEYS.map((k) => [k, []]),
    ) as unknown as PullResponse['entities'];
    await wipeDevice('2096');
    const pull = vi.fn(async (): Promise<PullResponse> => ({
      watermark: '2026-11-14T09:05:00.000Z',
      next_cursor: null,
      complete: true,
      entities,
    }));
    const push = vi.fn(async () => ({ results: [] }));
    await syncNow({ api: { push, pull }, eventId: 'ev-1', deviceId: 'd-1' });
    expect(await getMeta('sync.hydrated_event_id', null)).toBe('ev-1');
  });
});
