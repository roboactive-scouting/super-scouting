import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceClient, uuid } from './client';

// Task 1.41, SPEC-FINAL §3.6 v1.28: migration 20261012092000_sync_conflicts_resolution.sql.
// `resolution` is null while a conflict is open and takes the resolve command's choice as
// jsonb. Also proves, against Postgres itself, the guard resolveConflictRow relies on: the
// update `where id = $1 and resolved_at is null` matches once and only once, and moves
// updated_at so the delta pull carries the resolution.
const db = serviceClient();
const ids = { season: uuid(), event: uuid(), user: uuid(), conflict: uuid(), row: uuid() };

async function must(result: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await result;
  expect(error, error?.message).toBeNull();
}

async function conflict() {
  const { data, error } = await db
    .from('sync_conflicts')
    .select('resolution, resolved_at, resolved_by, updated_at')
    .eq('id', ids.conflict)
    .single();
  expect(error, error?.message).toBeNull();
  return data as {
    resolution: unknown;
    resolved_at: string | null;
    resolved_by: string | null;
    updated_at: string;
  };
}

beforeAll(async () => {
  await must(
    db
      .from('seasons')
      .insert({ id: ids.season, year: 1910, game_name: 'T', field_image_path: 'p' }),
  );
  await must(
    db.from('events').insert({ id: ids.event, season_id: ids.season, name: 'E', sort_order: 1 }),
  );
  await must(
    db.from('users').insert({
      id: ids.user,
      username: 'itest_conflicts',
      full_name: 'C',
      password_hash: 'x',
      role: 'lead',
    }),
  );
  await must(
    db.from('sync_conflicts').insert({
      id: ids.conflict,
      event_id: ids.event,
      entity: 'scouting_entry',
      row_id: ids.row,
      kind: 'divergence',
      superseded_payload: { data: { auto_notes: 4 } },
      superseded_client_updated_at: '2026-11-14T09:07:00.000Z',
      base_version: 1,
    }),
  );
});

afterAll(async () => {
  // The season cascades to the event and the event to its conflicts.
  await db.from('seasons').delete().eq('id', ids.season);
  await db.from('users').delete().eq('id', ids.user);
});

describe('sync_conflicts.resolution (task 1.41)', () => {
  it('is null on a new, open conflict', async () => {
    expect(await conflict()).toMatchObject({ resolution: null, resolved_at: null });
  });

  it('the conditional resolve takes once, stores the choice as jsonb and moves updated_at', async () => {
    const before = await conflict();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const at = new Date().toISOString();
    const first = await db
      .from('sync_conflicts')
      .update({ resolved_at: at, resolved_by: ids.user, resolution: { keep: 'superseded' } })
      .eq('id', ids.conflict)
      .is('resolved_at', null)
      .select('id');
    expect(first.error, first.error?.message).toBeNull();
    expect(first.data).toHaveLength(1);

    const after = await conflict();
    expect(after.resolution).toEqual({ keep: 'superseded' });
    expect(after.resolved_by).toBe(ids.user);
    expect(Date.parse(after.updated_at)).toBeGreaterThan(Date.parse(before.updated_at));

    // A second resolve matches nothing and changes nothing.
    const second = await db
      .from('sync_conflicts')
      .update({ resolved_at: new Date().toISOString(), resolution: { keep: 'live' } })
      .eq('id', ids.conflict)
      .is('resolved_at', null)
      .select('id');
    expect(second.error, second.error?.message).toBeNull();
    expect(second.data).toEqual([]);
    expect((await conflict()).resolution).toEqual({ keep: 'superseded' });
  });

  it('reopening matches only the resolution it names by its instant', async () => {
    const { resolved_at: resolvedAt } = await conflict();
    const wrong = await db
      .from('sync_conflicts')
      .update({ resolved_at: null, resolved_by: null, resolution: null })
      .eq('id', ids.conflict)
      .eq('resolved_at', '2000-01-01T00:00:00.000Z')
      .select('id');
    expect(wrong.data).toEqual([]);
    const right = await db
      .from('sync_conflicts')
      .update({ resolved_at: null, resolved_by: null, resolution: null })
      .eq('id', ids.conflict)
      .eq('resolved_at', resolvedAt as string)
      .select('id');
    expect(right.data).toHaveLength(1);
    expect(await conflict()).toMatchObject({ resolution: null, resolved_at: null });
  });

  it('the queue’s quoted (created_at, id) keyset pages past a row by its exact instant', async () => {
    const second = uuid();
    await must(
      db.from('sync_conflicts').insert({
        id: second,
        event_id: ids.event,
        entity: 'scouting_entry',
        row_id: ids.row,
        kind: 'duplicate',
        duplicate_row_id: uuid(),
      }),
    );
    const { data: rows, error } = await db
      .from('sync_conflicts')
      .select('id, created_at')
      .eq('event_id', ids.event)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    expect(error, error?.message).toBeNull();
    const [first] = rows as { id: string; created_at: string }[];
    // The string PostgREST returned, microseconds and offset included, as the cursor keeps it.
    const after = await db
      .from('sync_conflicts')
      .select('id')
      .eq('event_id', ids.event)
      .or(
        `created_at.gt."${first!.created_at}",and(created_at.eq."${first!.created_at}",id.gt.${first!.id})`,
      )
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    expect(after.error, after.error?.message).toBeNull();
    expect((after.data ?? []).map((r) => r.id)).toEqual(
      (rows as { id: string }[]).slice(1).map((r) => r.id),
    );
  });

  it('takes a duplicate’s choice too', async () => {
    const keep = uuid();
    await must(
      db
        .from('sync_conflicts')
        .update({ resolution: { keep_row_id: keep } })
        .eq('id', ids.conflict),
    );
    expect((await conflict()).resolution).toEqual({ keep_row_id: keep });
  });
});
