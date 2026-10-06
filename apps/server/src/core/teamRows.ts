import { AppError, type RosterRow, type TeamRow } from '@frc/shared';
import type { StoredTeam, UseCaseContext } from './context.js';

/**
 * What the team and roster use cases (task 1.19) share. Its own module, like
 * seasonRows.ts, so the queries never import a command module that re-exports them.
 */

/** Field by field, like toSeason: a column added later does not leak by default. */
export function toTeam(row: StoredTeam): TeamRow {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toRosterRow(row: StoredTeam): RosterRow {
  return { team_id: row.id, number: row.number, name: row.name };
}

export function noSuchTeam(teamId: string): AppError {
  return new AppError('not-found', 'that team does not exist; it may have been deleted', {
    team_id: teamId,
  });
}

export async function teamOrNotFound(ctx: UseCaseContext, id: string): Promise<StoredTeam> {
  const team = await ctx.store.getTeam(id);
  if (!team) throw noSuchTeam(id);
  return team;
}
