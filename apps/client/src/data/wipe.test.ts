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
import { heldCount, readWipeHold } from '@/features/settings/wipeHold';
import { WIPE_REASON } from './discarded';
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

describe('Wipe anyway (SPEC-FINAL 9.9 v1.39; Phase 1 H side task 2)', () => {
  /**
   * Three records without a cloud ack — an entry waiting to send, a refused (parked) one and a
   * copy received by QR — plus an unfinished entry: 4 records would be lost. And acked data.
   */
  async function seedStuck() {
    await seedDevice();
    await db.rows.bulkPut([
      { entity: 'teams', id: 't-1', number: 2096, name: 'ROBACTIVE' },
      { entity: 'users', id: 'u-1', full_name: 'Noa Levi' },
      {
        entity: 'matches',
        id: 'm-1',
        event_id: 'ev-1',
        match_type: 'qualification',
        number: 12,
      },
      {
        entity: 'match_teams',
        id: 'mt-1',
        match_id: 'm-1',
        team_id: 't-1',
        alliance: 'red',
        station: 2,
      },
    ]);
    const entry = {
      event_id: 'ev-1',
      match_id: 'm-1',
      team_id: 't-1',
      form_kind: 'match',
      alliance: 'red',
      robot_status: 'played',
      scouter_id: 'u-1',
      data: { secret_value: 42 },
    };
    await enqueue({ ...op, op_id: 'o-a', row_id: 'e-a', payload: entry });
    await enqueue({ ...op, op_id: 'o-b', row_id: 'e-b', payload: entry, seq: 2 });
    await ackResults([{ op_id: 'o-b', status: 'rejected', reason: 'forbidden', detail: 'no' }]);
    await receiveOperations([
      { ...op, op_id: 'o-qr', row_id: 'e-qr', author_user_id: 'u-2', payload: entry },
    ]);
    await db.drafts.put({
      key: 'fv-1:m-1:t-1',
      row_id: '',
      payload: { alliance: 'red', data: { secret_value: 7 } },
      updated_at: '2026-11-14T09:30:00.000Z',
    });
  }

  const everything = async () => ({
    ...(await deviceCounts()),
    discarded: await db.discarded.count(),
  });

  it('the normal wipe still refuses while held, and logs nothing', async () => {
    await seedStuck();
    const before = await everything();
    await expect(wipeDevice('2096')).resolves.toEqual({
      ok: false,
      reason: 'unacked',
      unacked: 4,
    });
    expect(await everything()).toEqual(before);
  });

  it('removes nothing with a wrong code, even with the right count', async () => {
    await seedStuck();
    const before = await everything();
    await expect(wipeDevice('2095', { force: true, expected: 4 })).resolves.toEqual({
      ok: false,
      reason: 'wrong-code',
    });
    expect(await everything()).toEqual(before);
  });

  it('removes nothing with a wrong count, and says the count now', async () => {
    await seedStuck();
    const before = await everything();
    for (const expected of [3, 5, 0]) {
      await expect(wipeDevice('2096', { force: true, expected })).resolves.toEqual({
        ok: false,
        reason: 'wrong-count',
        unacked: 4,
      });
    }
    expect(await everything()).toEqual(before);
  });

  it('removes nothing with a stale count: a record saved after the count was read', async () => {
    await seedStuck();
    const read = heldCount(await readWipeHold());
    expect(read).toBe(4);
    await enqueue({ ...op, op_id: 'o-late', row_id: 'e-late', seq: 9 });
    const before = await everything();
    await expect(wipeDevice('2096', { force: true, expected: read })).resolves.toEqual({
      ok: false,
      reason: 'wrong-count',
      unacked: 5,
    });
    expect(await everything()).toEqual(before);
    expect(await db.outbox.get('o-late')).toBeDefined();
  });

  it('a record saved while Wipe anyway runs is refused with it or kept, never lost', async () => {
    await seedStuck();
    const wipe = wipeDevice('2096', { force: true, expected: 4 });
    const save = enqueue({ ...op, op_id: 'o-race', row_id: 'e-race', seq: 9 });
    const [result] = await Promise.all([wipe, save]);
    expect(await db.outbox.get('o-race')).toBeDefined();
    if (!result.ok) expect(result).toEqual({ ok: false, reason: 'wrong-count', unacked: 5 });
  });

  it('with the right code and count: one log row per lost record, summary only, then the device is empty', async () => {
    await seedStuck();
    await db.discarded.put(discardedRecord);
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
    const seen: ChangeKind[] = [];
    const off = onChanged((kind) => seen.push(kind));

    await expect(wipeDevice('2096', { force: true, expected: 4 })).resolves.toEqual({ ok: true });
    off();

    expect(await deviceCounts()).toEqual({
      rows: 0,
      outbox: 0,
      syncState: 0,
      drafts: 0,
      practiceDrafts: 0,
      watermark: null,
    });
    expect(await session.current()).toBeNull();
    expect(seen).toEqual(expect.arrayContaining(['rows', 'outbox', 'meta', 'discarded']));

    const wiped = (await db.discarded.toArray()).filter((r) => r.reason === WIPE_REASON);
    expect(wiped).toHaveLength(4);
    expect(new Set(wiped.map((r) => r.discarded_at)).size).toBe(1);
    expect(wiped.every((r) => r.dismissed_at === r.discarded_at)).toBe(true);
    expect(wiped.map((r) => r.row_id).sort()).toEqual(['', 'e-a', 'e-b', 'e-qr']);
    expect(wiped.find((r) => r.row_id === 'e-a')).toMatchObject({
      event_name: 'Israel District #1',
      summary: {
        match: 'Q12',
        station: 'R2',
        team: '2096 ROBACTIVE',
        robot_status: 'played',
        scouter: 'Noa Levi',
        form_kind: 'match',
      },
    });
    expect(wiped.find((r) => r.row_id === '')?.summary).toMatchObject({
      what: 'Unfinished match entry',
      match: 'Q12',
      team: '2096 ROBACTIVE',
      scouter: 'Noa Levi',
      client_updated_at: '2026-11-14T09:30:00.000Z',
    });
    // Never an entered value.
    expect(JSON.stringify(wiped)).not.toContain('secret_value');
    // The earlier log row is kept.
    expect(await db.discarded.get('d-1')).toBeDefined();
  });

  it('logs a bare match and a pending row with no operation left, by what they were', async () => {
    await db.rows.bulkPut([
      { entity: 'events', id: 'ev-1', name: 'Israel District #1' },
      { entity: 'pick_lists', id: 'pl-1', event_id: 'ev-1' },
    ]);
    await enqueue({
      ...op,
      op_id: 'o-m',
      entity: 'match',
      row_id: 'm-9',
      payload: { event_id: 'ev-1', match_type: 'qualification', number: 40 },
    });
    await db.syncState.put({
      row_id: 'pl-1',
      sync_state: 'pending',
      acked_at: null,
      origin: 'local',
    });
    await expect(wipeDevice('2096', { force: true, expected: 2 })).resolves.toEqual({ ok: true });
    const rows = await db.discarded.toArray();
    expect(rows.map((r) => [r.row_id, r.summary.what, r.summary.match]).sort()).toEqual([
      ['m-9', 'Match', 'Q40'],
      ['pl-1', 'Pick list', null],
    ]);
    expect(rows.every((r) => r.event_name === 'Israel District #1')).toBe(true);
  });

  it('with nothing held, a matching count of 0 is the normal wipe and logs nothing', async () => {
    await seedDevice();
    await expect(wipeDevice('2096', { force: true, expected: 0 })).resolves.toEqual({ ok: true });
    expect(await db.discarded.count()).toBe(0);
    expect(await db.rows.count()).toBe(0);
  });
});
