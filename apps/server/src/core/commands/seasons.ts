import {
  AppError,
  SEASON_IMAGE_MANIFEST,
  assertCan,
  createSeasonInput,
  setActiveSeasonInput,
  updateSeasonInput,
  type ActiveContext,
  type Caller,
  type CreateSeasonInput,
  type SeasonRow,
  type SetActiveSeasonInput,
  type UpdateSeasonInput,
} from '@frc/shared';
import type { StoredSeason, UseCaseContext } from '../context.js';
import { pgCode, seasonOrNotFound, toSeason } from '../seasonRows.js';
import { parseInput } from './users.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  createSeasonInput,
  seasonRow,
  setActiveSeasonInput,
  updateSeasonInput,
  type CreateSeasonInput,
  type SeasonRow,
  type SetActiveSeasonInput,
  type UpdateSeasonInput,
} from '@frc/shared';

// A query, so it lives in core/queries/ (every commands/ use case rejects a service
// caller, SPEC-FINAL 16.5); re-exported so the season use cases import from one module.
export { listSeasons } from '../queries/listSeasons.js';

const COMMITTED_IMAGES: ReadonlySet<string> = new Set(SEASON_IMAGE_MANIFEST);

/**
 * SPEC-FINAL 6.4: "a season cannot be created without a game image path that resolves".
 * The server has no filesystem to look at, and 16.7 forbids uploading the image, so what
 * resolves is what `pnpm season:images` found committed under apps/client/public/.
 */
export function assertImageResolves(path: string): void {
  if (!COMMITTED_IMAGES.has(path)) {
    throw new AppError(
      'invalid',
      `there is no committed game image at ${path}; commit apps/client/public/${path} and redeploy the client first`,
      { field_image_path: path },
    );
  }
}

function yearTaken(year: number | undefined): AppError {
  return new AppError(
    'conflict',
    year === undefined
      ? 'a season for that year already exists'
      : `a season for ${year} already exists`,
    year === undefined ? undefined : { year },
  );
}

/**
 * Every write to `seasons` goes through here. The pre-check gives the friendly answer;
 * the unique constraint on `year` is the real guard against two admins racing, and its
 * violation must read as `conflict`, not a 500.
 */
async function writeSeason(
  year: number | undefined,
  write: () => Promise<StoredSeason>,
): Promise<StoredSeason> {
  try {
    return await write();
  } catch (e) {
    if (pgCode(e) === '23505') throw yearTaken(year);
    throw e;
  }
}

/** SPEC-FINAL 6.4. Admin only. The year is unique; the image must be committed. */
export async function createSeason(
  caller: Caller,
  input: CreateSeasonInput,
  ctx: UseCaseContext,
): Promise<SeasonRow> {
  assertCan(caller, 'manage_events');
  const parsed = parseInput(createSeasonInput, input);
  assertImageResolves(parsed.field_image_path);
  if (await ctx.store.getSeasonByYear(parsed.year)) throw yearTaken(parsed.year);
  const stored = await writeSeason(parsed.year, () =>
    ctx.store.insertSeason({
      id: crypto.randomUUID(),
      year: parsed.year,
      game_name: parsed.game_name,
      field_image_path: parsed.field_image_path,
    }),
  );
  return toSeason(stored);
}

/**
 * SPEC-FINAL 6.4: edit a season's year, game name or game image. Admin only.
 *
 * The image is immutable once the season has entries (SPEC-FINAL 16.7): every stored
 * {x, y} is normalized against that exact image, so swapping it would silently re-frame
 * all historical spatial data. That refusal is checked BEFORE whether the new path is
 * committed: a swap is refused whatever the new path is, and telling the admin to commit
 * a file they still could not use would send them the wrong way.
 *
 * Setting a field to the value it already has is not a change: it never trips the image
 * rule, and it never needs the image to be in this build (the dev seed's image is not).
 */
export async function updateSeason(
  caller: Caller,
  input: UpdateSeasonInput,
  ctx: UseCaseContext,
): Promise<SeasonRow> {
  assertCan(caller, 'manage_events');
  const parsed = parseInput(updateSeasonInput, input);
  const current = await seasonOrNotFound(ctx, parsed.season_id);
  const patch: Record<string, unknown> = {};

  if (parsed.game_name !== undefined && parsed.game_name !== current.game_name) {
    patch.game_name = parsed.game_name;
  }
  if (parsed.year !== undefined && parsed.year !== current.year) {
    const holder = await ctx.store.getSeasonByYear(parsed.year);
    if (holder && holder.id !== current.id) throw yearTaken(parsed.year);
    patch.year = parsed.year;
  }
  if (
    parsed.field_image_path !== undefined &&
    parsed.field_image_path !== current.field_image_path
  ) {
    if ((await ctx.store.countEntriesBySeason(current.id)) > 0) {
      throw new AppError(
        'conflict',
        'this season already has scouting entries, and every position in them is measured against its current game image: a new image means a new filename and a new form version — create the new form version, do not swap the image.',
        { season_id: current.id },
      );
    }
    assertImageResolves(parsed.field_image_path);
    patch.field_image_path = parsed.field_image_path;
  }

  if (Object.keys(patch).length === 0) return toSeason(current);
  const stored = await writeSeason(parsed.year, () => ctx.store.updateSeason(current.id, patch));
  return toSeason(stored);
}

/**
 * SPEC-FINAL 6.3: the admin sets the default season. The active event follows it: kept
 * if it already belongs to this season, otherwise the season's first event by
 * sort_order, or null while a brand-new season has no events. Both ids are written in
 * one update, so the singleton never holds an event from another season.
 */
export async function setActiveSeason(
  caller: Caller,
  input: SetActiveSeasonInput,
  ctx: UseCaseContext,
): Promise<ActiveContext> {
  assertCan(caller, 'manage_events');
  const parsed = parseInput(setActiveSeasonInput, input);
  const season = await seasonOrNotFound(ctx, parsed.season_id);

  let eventId: string | null = null;
  const current = await ctx.store.getActiveContext();
  if (current.active_event_id !== null) {
    const active = await ctx.store.getEvent(current.active_event_id);
    if (active && active.season_id === season.id) eventId = active.id;
  }
  if (eventId === null) {
    const [first] = await ctx.store.listEvents(season.id, 1);
    eventId = first?.id ?? null;
  }
  return ctx.store.setActiveContext({ active_season_id: season.id, active_event_id: eventId });
}
