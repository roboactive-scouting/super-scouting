import {
  AppError,
  assertCan,
  createTeamInput,
  setEventRosterInput,
  updateTeamInput,
  type Caller,
  type CreateTeamInput,
  type EventRosterOutput,
  type SetEventRosterInput,
  type TeamRow,
  type UpdateTeamInput,
} from '@frc/shared';
import type { UseCaseContext } from '../context.js';
import { eventOrNotFound, noSuchEvent, pgCode } from '../seasonRows.js';
import { noSuchTeam, teamOrNotFound, toRosterRow, toTeam } from '../teamRows.js';
import { inWaves } from '../waves.js';
import { parseInput } from './users.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  createTeamInput,
  eventRosterOutput,
  listEventRosterInput,
  listTeamsInput,
  listTeamsOutput,
  rosterRow,
  setEventRosterInput,
  teamRow,
  updateTeamInput,
  type CreateTeamInput,
  type EventRosterOutput,
  type ListEventRosterInput,
  type ListTeamsInput,
  type ListTeamsOutput,
  type RosterRow,
  type SetEventRosterInput,
  type TeamRow,
  type UpdateTeamInput,
} from '@frc/shared';

// Queries, so they live in core/queries/ (every commands/ use case rejects a service
// caller, SPEC-FINAL 16.5); re-exported so the team use cases import from one module.
export { listTeams } from '../queries/listTeams.js';
export { listEventRoster } from '../queries/roster.js';

function numberTaken(number: number): AppError {
  return new AppError('conflict', `team ${number} already exists`, { number });
}

/**
 * SPEC-FINAL 6.4: add a team to the global registry. Admin only. The number is global
 * and permanent; the pre-check gives the friendly answer and the unique constraint on
 * `number` is the real guard against two admins racing.
 */
export async function createTeam(
  caller: Caller,
  input: CreateTeamInput,
  ctx: UseCaseContext,
): Promise<TeamRow> {
  assertCan(caller, 'manage_events');
  const parsed = parseInput(createTeamInput, input);
  if (await ctx.store.getTeamByNumber(parsed.number)) throw numberTaken(parsed.number);
  try {
    const stored = await ctx.store.insertTeam({
      id: crypto.randomUUID(),
      number: parsed.number,
      name: parsed.name,
    });
    return toTeam(stored);
  } catch (e) {
    if (pgCode(e) === '23505') throw numberTaken(parsed.number);
    throw e;
  }
}

/**
 * SPEC-FINAL 6.4: rename a team. Admin only. The number is not an input — a team number
 * is permanent — and the strict schema refuses one rather than dropping it.
 */
export async function updateTeam(
  caller: Caller,
  input: UpdateTeamInput,
  ctx: UseCaseContext,
): Promise<TeamRow> {
  assertCan(caller, 'manage_events');
  const parsed = parseInput(updateTeamInput, input);
  const current = await teamOrNotFound(ctx, parsed.team_id);
  if (parsed.name === current.name) return toTeam(current);
  return toTeam(await ctx.store.updateTeam(current.id, { name: parsed.name }));
}

/**
 * SPEC-FINAL 3.1, 6.4: make `team_ids` the event's live roster. Admin only.
 *
 * A removal is a SOFT delete (`deleted_at` = the server clock), so the tombstone reaches
 * every device through the delta pull; a team added back revives its old row; a row that
 * does not change is not written. Only the teams being ADDED are checked to exist — the
 * live ones are known to — so a normal edit costs one lookup per new team.
 *
 * Removing a team that still sits in a match slot is allowed and leaves the slot alone:
 * the schedule is the admin's to correct (setMatchTeams), and refusing would make a
 * mistaken roster entry impossible to undo once the schedule named it.
 */
export async function setEventRoster(
  caller: Caller,
  input: SetEventRosterInput,
  ctx: UseCaseContext,
): Promise<EventRosterOutput> {
  assertCan(caller, 'manage_events');
  const parsed = parseInput(setEventRosterInput, input);
  const event = await eventOrNotFound(ctx, parsed.event_id);
  const live = new Set((await ctx.store.getRoster(event.id)).map((t) => t.id));
  const added = parsed.team_ids.filter((id) => !live.has(id));
  const found = await inWaves(added, (id) => ctx.store.getTeam(id));
  const missing = added.find((_, i) => !found[i]);
  if (missing !== undefined) throw noSuchTeam(missing);

  try {
    await ctx.store.setRoster(event.id, parsed.team_ids, ctx.now().toISOString());
  } catch (e) {
    const code = pgCode(e);
    // A team or the event deleted between the checks above and the write.
    if (code === '23503') {
      if (!(await ctx.store.getEvent(event.id))) throw noSuchEvent(event.id);
      throw new AppError(
        'not-found',
        'one of those teams no longer exists; reload the teams and try again',
        { event_id: event.id },
      );
    }
    // Two admins adding the same team at once: the live (event, team) index refused one.
    if (code === '23505') {
      throw new AppError(
        'conflict',
        "this event's roster changed while it was being saved; reload it and try again",
        { event_id: event.id },
      );
    }
    throw e;
  }
  return { items: (await ctx.store.getRoster(event.id)).map(toRosterRow) };
}
