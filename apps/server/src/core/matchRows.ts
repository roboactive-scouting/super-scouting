import { AppError, MATCH_TYPES, type MatchRow, type MatchSlot } from '@frc/shared';
import type { StoredMatch, StoredMatchSlot, UseCaseContext } from './context.js';

/**
 * What the match use cases (task 1.19) share. Its own module, like seasonRows.ts, so
 * listMatches never imports a command module that re-exports it.
 */

/** "qualification match 12": how every match message names a match. */
export function describeMatch(match: { match_type: string; number: number }): string {
  return `${match.match_type} match ${match.number}`;
}

export function noSuchMatch(matchId: string): AppError {
  return new AppError('not-found', 'that match does not exist; it may have been deleted', {
    match_id: matchId,
  });
}

export function matchTaken(match: { match_type: string; number: number }): AppError {
  return new AppError('conflict', `${describeMatch(match)} already exists at this event`, {
    match_type: match.match_type,
    number: match.number,
  });
}

export async function matchOrNotFound(ctx: UseCaseContext, id: string): Promise<StoredMatch> {
  const match = await ctx.store.getMatch(id);
  if (!match) throw noSuchMatch(id);
  return match;
}

const slotRank = (slot: MatchSlot): number => (slot.alliance === 'red' ? 0 : 3) + slot.station;

/** Red 1..3, then blue 1..3; field by field, so `match_id` and row ids never leave. */
export function toSlots(slots: MatchSlot[]): MatchSlot[] {
  return [...slots]
    .sort((a, b) => slotRank(a) - slotRank(b))
    .map((s) => ({ alliance: s.alliance, station: s.station, team_id: s.team_id }));
}

/** Field by field, like toSeason: the official-result columns never leave in v1. */
export function toMatchRow(row: StoredMatch, slots: MatchSlot[]): MatchRow {
  return {
    id: row.id,
    event_id: row.event_id,
    match_type: row.match_type,
    number: row.number,
    created_at: row.created_at,
    updated_at: row.updated_at,
    slots: toSlots(slots),
  };
}

/** The matches with their slots, read in one store call for the whole set. */
export async function withSlots(ctx: UseCaseContext, rows: StoredMatch[]): Promise<MatchRow[]> {
  if (rows.length === 0) return [];
  const slots = await ctx.store.listMatchSlots(rows.map((r) => r.id));
  const byMatch = new Map<string, StoredMatchSlot[]>();
  for (const slot of slots) {
    const list = byMatch.get(slot.match_id) ?? [];
    list.push(slot);
    byMatch.set(slot.match_id, list);
  }
  return rows.map((row) => toMatchRow(row, byMatch.get(row.id) ?? []));
}

/** The index of a match type in the order every list renders them. */
export function matchTypeRank(matchType: string): number {
  return (MATCH_TYPES as readonly string[]).indexOf(matchType);
}
