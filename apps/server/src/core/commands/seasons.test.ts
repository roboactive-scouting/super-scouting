import { beforeEach, describe, expect, it } from 'vitest';
import { seasonRow, type Caller } from '@frc/shared';
import { issueToken } from '../../auth/token.js';
import { loadServerConfig } from '../../config.js';
import { rpcRoutes } from '../../routes/rpc.js';
import { createSeason, listSeasons, setActiveSeason, updateSeason } from './seasons.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';

// Wire ids are uuids (the schemas are strict), so the plan's 'se-1' fixtures are these.
const SE_1 = '11111111-1111-4111-8111-111111111111';
const SE_2 = '22222222-2222-4222-8222-222222222222';
const EV_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EV_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EV_OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOPE = '99999999-9999-4999-8999-999999999999';

const admin: Caller = { kind: 'user', userId: 'u-a', role: 'admin' };
const lead: Caller = { kind: 'user', userId: 'u-l', role: 'lead' };
const scouter: Caller = { kind: 'user', userId: 'u-s', role: 'scouter' };
const service: Caller = { kind: 'service', label: 'mcp' };

const image = 'seasons/2026/field.webp'; // present in SEASON_IMAGE_MANIFEST (task 1.18)
const AT = '2026-11-01T00:00:00.000Z';

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
});

function seedSeason(id: string, year: number, fieldImagePath = image) {
  ctx.seasons.set(id, {
    id,
    year,
    game_name: 'X',
    field_image_path: fieldImagePath,
    created_at: AT,
    updated_at: AT,
  });
}

function seedEvent(id: string, seasonId: string, sortOrder: number) {
  ctx.events.set(id, {
    id,
    season_id: seasonId,
    name: `Event ${sortOrder}`,
    code: null,
    sort_order: sortOrder,
    created_at: AT,
    updated_at: AT,
  });
}

describe('seasons (SPEC-FINAL 6.4)', () => {
  it('creates a season with a year, a game name and a resolving image path', async () => {
    const season = await createSeason(
      admin,
      { year: 2026, game_name: 'CRESCENDO', field_image_path: image },
      ctx,
    );
    expect(ctx.seasons.get(season.id)).toMatchObject({
      year: 2026,
      game_name: 'CRESCENDO',
      field_image_path: image,
    });
  });

  it('refuses a duplicate year', async () => {
    await createSeason(admin, { year: 2026, game_name: 'A', field_image_path: image }, ctx);
    await expect(
      createSeason(admin, { year: 2026, game_name: 'B', field_image_path: image }, ctx),
    ).rejects.toMatchObject({ code: 'conflict', message: 'a season for 2026 already exists' });
  });

  it('refuses an image path that does not resolve, naming the file to commit', async () => {
    await expect(
      createSeason(
        admin,
        { year: 2028, game_name: 'C', field_image_path: 'seasons/2028/field.webp' },
        ctx,
      ),
    ).rejects.toThrow(/apps\/client\/public\/seasons\/2028\/field\.webp/);
    await expect(
      createSeason(
        admin,
        { year: 2028, game_name: 'C', field_image_path: 'seasons/2028/field.webp' },
        ctx,
      ),
    ).rejects.toMatchObject({
      code: 'invalid',
      message:
        'there is no committed game image at seasons/2028/field.webp; commit apps/client/public/seasons/2028/field.webp and redeploy the client first',
    });
    expect(ctx.seasons.size).toBe(0);
  });

  it('refuses every one of these to a lead', async () => {
    await expect(
      createSeason(lead, { year: 2027, game_name: 'D', field_image_path: image }, ctx),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      updateSeason(lead, { season_id: SE_1, game_name: 'E' }, ctx),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(setActiveSeason(lead, { season_id: SE_1 }, ctx)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('sets the active season and leaves active_event_id null when the season has no events', async () => {
    const season = await createSeason(
      admin,
      { year: 2026, game_name: 'F', field_image_path: image },
      ctx,
    );
    const context = await setActiveSeason(admin, { season_id: season.id }, ctx);
    expect(context).toEqual({ active_season_id: season.id, active_event_id: null });
  });

  it('rejects a service caller', async () => {
    await expect(
      createSeason(service, { year: 2029, game_name: 'G', field_image_path: image }, ctx),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      updateSeason(service, { season_id: SE_1, game_name: 'G' }, ctx),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(setActiveSeason(service, { season_id: SE_1 }, ctx)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('refuses a malformed input as invalid, never a raw ZodError', async () => {
    await expect(
      createSeason(admin, { year: 2026, game_name: '', field_image_path: image }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      updateSeason(admin, { season_id: 'se-1', game_name: 'E' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('updateSeason (SPEC-FINAL 6.4, 16.7)', () => {
  beforeEach(() => seedSeason(SE_1, 2026));

  it('refuses to swap a season image once entries exist, naming the alternative', async () => {
    ctx.entryCountsBySeason.set(SE_1, 40);
    await expect(
      updateSeason(admin, { season_id: SE_1, field_image_path: 'seasons/2027/field.webp' }, ctx),
    ).rejects.toThrow(/new form version/i);
    await expect(
      updateSeason(admin, { season_id: SE_1, field_image_path: 'seasons/2027/field.webp' }, ctx),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: expect.stringContaining(
        'a new image means a new filename and a new form version — create the new form version, do not swap the image.',
      ),
    });
    expect(ctx.seasons.get(SE_1)?.field_image_path).toBe(image);
  });

  it('still allows the game name to be corrected on a season with entries', async () => {
    ctx.entryCountsBySeason.set(SE_1, 40);
    await expect(
      updateSeason(admin, { season_id: SE_1, game_name: 'CRESCENDO' }, ctx),
    ).resolves.toBeTruthy();
    expect(ctx.seasons.get(SE_1)?.game_name).toBe('CRESCENDO');
  });

  it('treats restating the current image as no change, even on a season with entries', async () => {
    ctx.entryCountsBySeason.set(SE_1, 40);
    await expect(
      updateSeason(admin, { season_id: SE_1, field_image_path: image, game_name: 'Y' }, ctx),
    ).resolves.toMatchObject({ field_image_path: image, game_name: 'Y' });
  });

  it('changes the image of a season with no entries, but only to a committed one', async () => {
    seedSeason(SE_2, 2027, 'seasons/1999/field.webp');
    await expect(
      updateSeason(admin, { season_id: SE_2, field_image_path: 'seasons/2027/field.webp' }, ctx),
    ).rejects.toThrow(/commit apps\/client\/public\/seasons\/2027\/field\.webp and redeploy/);
    const updated = await updateSeason(admin, { season_id: SE_2, field_image_path: image }, ctx);
    expect(updated.field_image_path).toBe(image);
  });

  it('never needs the current image to be in this build to correct another field', async () => {
    // The dev seed's season points at seasons/1999/field.webp, which is not committed.
    seedSeason(SE_2, 1999, 'seasons/1999/field.webp');
    ctx.entryCountsBySeason.set(SE_2, 3);
    await expect(
      updateSeason(admin, { season_id: SE_2, game_name: 'SEED' }, ctx),
    ).resolves.toMatchObject({ game_name: 'SEED', field_image_path: 'seasons/1999/field.webp' });
  });

  it('changes the year, and refuses a year another season holds', async () => {
    seedSeason(SE_2, 2027);
    await expect(updateSeason(admin, { season_id: SE_2, year: 2026 }, ctx)).rejects.toMatchObject({
      code: 'conflict',
      message: 'a season for 2026 already exists',
    });
    await expect(updateSeason(admin, { season_id: SE_2, year: 2028 }, ctx)).resolves.toMatchObject({
      year: 2028,
    });
    // restating its own year is not a conflict
    await expect(updateSeason(admin, { season_id: SE_1, year: 2026 }, ctx)).resolves.toMatchObject({
      year: 2026,
    });
  });

  it('turns a unique violation that raced past the pre-check into conflict, not a 500', async () => {
    seedSeason(SE_2, 2027);
    ctx.store.getSeasonByYear = async () => null; // another admin took the year in between
    await expect(updateSeason(admin, { season_id: SE_2, year: 2026 }, ctx)).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('reports not-found for a season that does not exist', async () => {
    await expect(
      updateSeason(admin, { season_id: NOPE, game_name: 'Z' }, ctx),
    ).rejects.toMatchObject({
      code: 'not-found',
      message: 'that season does not exist; it may have been deleted',
    });
  });
});

describe('setActiveSeason (SPEC-FINAL 6.3)', () => {
  beforeEach(() => {
    seedSeason(SE_1, 2026);
    seedSeason(SE_2, 2027);
  });

  it("picks the season's first event by sort_order", async () => {
    seedEvent(EV_B, SE_1, 2);
    seedEvent(EV_A, SE_1, 1);
    expect(await setActiveSeason(admin, { season_id: SE_1 }, ctx)).toEqual({
      active_season_id: SE_1,
      active_event_id: EV_A,
    });
    expect(await ctx.store.getActiveContext()).toEqual({
      active_season_id: SE_1,
      active_event_id: EV_A,
    });
  });

  it('keeps the active event when it already belongs to that season', async () => {
    seedEvent(EV_A, SE_1, 1);
    seedEvent(EV_B, SE_1, 2);
    ctx.setActiveContext(SE_1, EV_B);
    expect(await setActiveSeason(admin, { season_id: SE_1 }, ctx)).toEqual({
      active_season_id: SE_1,
      active_event_id: EV_B,
    });
  });

  it('never keeps an event from another season: the pair can never disagree', async () => {
    seedEvent(EV_OTHER, SE_2, 1);
    seedEvent(EV_A, SE_1, 1);
    ctx.setActiveContext(SE_2, EV_OTHER);
    expect(await setActiveSeason(admin, { season_id: SE_1 }, ctx)).toEqual({
      active_season_id: SE_1,
      active_event_id: EV_A,
    });
  });

  it('reports not-found for a season that does not exist, and changes nothing', async () => {
    ctx.setActiveContext(SE_1, null);
    await expect(setActiveSeason(admin, { season_id: NOPE }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
    expect(await ctx.store.getActiveContext()).toEqual({
      active_season_id: SE_1,
      active_event_id: null,
    });
  });
});

describe('listSeasons (a query: every role and a service caller)', () => {
  it('lists newest year first, to every role and a service caller', async () => {
    seedSeason(SE_1, 2026);
    seedSeason(SE_2, 2027);
    for (const caller of [scouter, lead, admin, service]) {
      const listed = await listSeasons(caller, {}, ctx);
      expect(
        listed.items.map((s) => s.year),
        caller.kind,
      ).toEqual([2027, 2026]);
      expect(listed.next_cursor).toBeNull();
    }
  });

  it('pages with an opaque cursor, with no gap and no repeat', async () => {
    for (const [i, year] of [2020, 2021, 2022, 2023, 2024].entries()) {
      seedSeason(`${i}0000000-0000-4000-8000-000000000000`, year);
    }
    const first = await listSeasons(scouter, { limit: 2 }, ctx);
    expect(first.items.map((s) => s.year)).toEqual([2024, 2023]);
    const second = await listSeasons(scouter, { limit: 2, cursor: first.next_cursor! }, ctx);
    expect(second.items.map((s) => s.year)).toEqual([2022, 2021]);
    const third = await listSeasons(scouter, { limit: 2, cursor: second.next_cursor! }, ctx);
    expect(third.items.map((s) => s.year)).toEqual([2020]);
    expect(third.next_cursor).toBeNull();
  });

  it('refuses a cursor it did not write', async () => {
    await expect(listSeasons(scouter, { cursor: 'not-a-cursor' }, ctx)).rejects.toMatchObject({
      code: 'invalid',
      message: 'cursor is not readable; list again without one',
    });
  });
});

describe('the fake refuses a column seasons does not have', () => {
  it('fails on a phantom `version` the way PostgREST would', async () => {
    await expect(
      ctx.store.insertSeason({
        id: SE_1,
        year: 2026,
        game_name: 'A',
        field_image_path: image,
        version: 1,
      }),
    ).rejects.toThrow("Could not find the 'version' column of 'seasons' in the schema cache");
  });
});

describe('POST /api/createSeason and /api/listEvents (the real registry and bearer check)', () => {
  const config = loadServerConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'k',
    AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
    ALLOWED_ORIGIN: 'https://client.example.com',
  });
  const post = (name: string, token: string, body: unknown) =>
    rpcRoutes(ctx, config).request(`/api/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  const tokenFor = (role: 'scouter' | 'admin') =>
    issueToken({ id: `u-${role}`, username: role, role }, config);

  it('creates a season for an admin, and the row passes the output schema', async () => {
    const res = await post('createSeason', await tokenFor('admin'), {
      year: 2026,
      game_name: 'REEFSCAPE',
      field_image_path: image,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ year: 2026, game_name: 'REEFSCAPE', field_image_path: image });
    expect(seasonRow.safeParse(body).success).toBe(true);
  });

  it('answers 403 to a scouter, and 400 naming the file for an image not in the build', async () => {
    const forbidden = await post('createSeason', await tokenFor('scouter'), {
      year: 2026,
      game_name: 'A',
      field_image_path: image,
    });
    expect(forbidden.status).toBe(403);
    const missing = await post('createSeason', await tokenFor('admin'), {
      year: 2030,
      game_name: 'A',
      field_image_path: 'seasons/2030/field.webp',
    });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({
      error: {
        code: 'invalid',
        message: expect.stringContaining('commit apps/client/public/seasons/2030/field.webp'),
      },
    });
  });

  it('lists events to a scouter, through the output schema', async () => {
    seedSeason(SE_1, 2026);
    seedEvent(EV_A, SE_1, 1);
    const res = await post('listEvents', await tokenFor('scouter'), { season_id: SE_1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      items: [{ id: EV_A, season_id: SE_1, sort_order: 1, code: null }],
      next_cursor: null,
    });
  });
});
