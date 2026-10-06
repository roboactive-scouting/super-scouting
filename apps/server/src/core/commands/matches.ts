import {
  AppError,
  assertCan,
  createMatchInput,
  deleteMatchInput,
  ensureMatchInput,
  setMatchTeamsInput,
  updateMatchInput,
  type Caller,
  type CreateMatchInput,
  type CreateMatchOutput,
  type DeleteMatchInput,
  type DeleteMatchOutput,
  type EnsureMatchInput,
  type EnsureMatchOutput,
  type MatchRow,
  type MatchType,
  type SetMatchTeamsInput,
  type UpdateMatchInput,
} from '@frc/shared';
import type { StoredMatch, UseCaseContext } from '../context.js';
import {
  describeMatch,
  matchOrNotFound,
  matchTaken,
  noSuchMatch,
  toMatchRow,
  withSlots,
} from '../matchRows.js';
import { eventOrNotFound, noSuchEvent, pgCode } from '../seasonRows.js';
import { inWaves } from '../waves.js';
import { parseInput } from './users.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  createMatchInput,
  createMatchOutput,
  deleteMatchInput,
  deleteMatchOutput,
  ensureMatchInput,
  ensureMatchOutput,
  listMatchesInput,
  listMatchesOutput,
  matchRow,
  setMatchTeamsInput,
  updateMatchInput,
  type CreateMatchInput,
  type CreateMatchOutput,
  type DeleteMatchInput,
  type DeleteMatchOutput,
  type EnsureMatchInput,
  type EnsureMatchOutput,
  type ListMatchesInput,
  type ListMatchesOutput,
  type MatchRow,
  type SetMatchTeamsInput,
  type UpdateMatchInput,
} from '@frc/shared';

// A query, so it lives in core/queries/ (every commands/ use case rejects a service
// caller, SPEC-FINAL 16.5); re-exported so the match use cases import from one module.
export { listMatches } from '../queries/listMatches.js';

/**
 * Every admin write to `matches` goes through here. The pre-checks give the friendly
 * answers; the unique (event_id, match_type, number) constraint and the event foreign key
 * are the real guards against a race, and must read as `conflict` / `not-found`.
 */
async function writeMatch(
  key: { event_id: string; match_type: string; number: number },
  write: () => Promise<StoredMatch>,
): Promise<StoredMatch> {
  try {
    return await write();
  } catch (e) {
    const code = pgCode(e);
    if (code === '23505') throw matchTaken(key);
    if (code === '23503') throw noSuchEvent(key.event_id);
    throw e;
  }
}

/** The page size numbersOf reads the store in. */
const MATCHES_PAGE = 200;

/** The numbers an event already has for one match type, through the bounded listMatches. */
async function numbersOf(
  ctx: UseCaseContext,
  eventId: string,
  matchType: MatchType,
): Promise<Set<number>> {
  const numbers = new Set<number>();
  // Match numbers start at 1, so `number > 0` from this type is every match of it; the
  // list's order puts every match of this type before any match of the next.
  let after = { match_type: matchType, number: 0 };
  for (;;) {
    const page = await ctx.store.listMatches(eventId, MATCHES_PAGE, after);
    for (const row of page) {
      if (row.match_type !== matchType) return numbers;
      numbers.add(row.number);
    }
    const last = page[page.length - 1];
    if (page.length < MATCHES_PAGE || !last) return numbers;
    after = { match_type: matchType, number: last.number };
  }
}

/**
 * SPEC-FINAL 6.4: create an event's matches. Admin only. Either one match by `number` —
 * an existing one is a `conflict` — or, by `count`, matches 1..count, silently skipping
 * the numbers that exist, so the schedule can be laid down first and the teams filled in
 * as they become known. The output is always the matches THIS call created, by number.
 */
export async function createMatch(
  caller: Caller,
  input: CreateMatchInput,
  ctx: UseCaseContext,
): Promise<CreateMatchOutput> {
  assertCan(caller, 'manage_events');
  const parsed = parseInput(createMatchInput, input);
  const event = await eventOrNotFound(ctx, parsed.event_id);
  const matchType = parsed.match_type;
  const rowFor = (number: number) => ({
    id: crypto.randomUUID(),
    event_id: event.id,
    match_type: matchType,
    number,
  });

  if (parsed.number !== undefined) {
    const key = { event_id: event.id, match_type: matchType, number: parsed.number };
    if (await ctx.store.findMatch(event.id, matchType, parsed.number)) throw matchTaken(key);
    const stored = await writeMatch(key, () => ctx.store.insertMatch(rowFor(key.number)));
    return { created: 1, items: [toMatchRow(stored, [])] };
  }

  const existing = await numbersOf(ctx, event.id, matchType);
  const wanted = Array.from({ length: parsed.count ?? 0 }, (_, i) => i + 1).filter(
    (n) => !existing.has(n),
  );
  const created = await inWaves(wanted, async (number) => {
    try {
      return await ctx.store.insertMatch(rowFor(number));
    } catch (e) {
      // Created by someone else since the read above: bulk creation skips it silently.
      if (pgCode(e) === '23505') return null;
      if (pgCode(e) === '23503') throw noSuchEvent(event.id);
      throw e;
    }
  });
  const items = created
    .filter((row): row is StoredMatch => row !== null)
    .sort((a, b) => a.number - b.number)
    .map((row) => toMatchRow(row, []));
  return { created: items.length, items };
}

/**
 * SPEC-FINAL 6.4: correct a match's type and/or number. Admin only. It never moves a
 * match to another event and never touches its slots. The corrected key must be free.
 * This, not deleteMatch, is how a match that already has entries is fixed.
 */
export async function updateMatch(
  caller: Caller,
  input: UpdateMatchInput,
  ctx: UseCaseContext,
): Promise<MatchRow> {
  assertCan(caller, 'manage_events');
  const parsed = parseInput(updateMatchInput, input);
  const current = await matchOrNotFound(ctx, parsed.match_id);
  const key = {
    event_id: current.event_id,
    match_type: parsed.match_type ?? current.match_type,
    number: parsed.number ?? current.number,
  };
  const patch: Record<string, unknown> = {};
  if (key.match_type !== current.match_type) patch.match_type = key.match_type;
  if (key.number !== current.number) patch.number = key.number;
  if (Object.keys(patch).length === 0) return (await withSlots(ctx, [current]))[0] as MatchRow;

  const holder = await ctx.store.findMatch(key.event_id, key.match_type, key.number);
  if (holder && holder.id !== current.id) throw matchTaken(key);
  const stored = await writeMatch(key, () => ctx.store.updateMatch(current.id, patch));
  return (await withSlots(ctx, [stored]))[0] as MatchRow;
}

function hasEntries(match: StoredMatch, count: number): AppError {
  const entries = count === 1 ? '1 entry' : count > 1 ? `${count} entries` : 'entries';
  return new AppError(
    'conflict',
    `${describeMatch(match)} has ${entries}, so it cannot be deleted; correct the match number instead`,
    { match_id: match.id, entries: count },
  );
}

/**
 * SPEC-FINAL 6.4: delete a match. Admin only. Refused while any entry — soft-deleted ones
 * included — names it: `scouting_entries.match_id` is `on delete restrict`, and deleting a
 * scouted match would orphan the scouting. The pre-check gives the count; the foreign key
 * is the real guard against an entry arriving meanwhile. Its slots go with it.
 */
export async function deleteMatch(
  caller: Caller,
  input: DeleteMatchInput,
  ctx: UseCaseContext,
): Promise<DeleteMatchOutput> {
  assertCan(caller, 'manage_events');
  const parsed = parseInput(deleteMatchInput, input);
  const match = await matchOrNotFound(ctx, parsed.match_id);
  const entries = await ctx.store.countEntriesByMatch(match.id);
  if (entries > 0) throw hasEntries(match, entries);
  try {
    await ctx.store.deleteMatch(match.id);
  } catch (e) {
    if (pgCode(e) === '23503') {
      throw hasEntries(match, await ctx.store.countEntriesByMatch(match.id));
    }
    throw e;
  }
  return { id: match.id, deleted: true };
}

function notOnRoster(team: string): AppError {
  return new AppError(
    'invalid',
    `team ${team} is not on this event's roster; add it to the roster first`,
    { team },
  );
}

/**
 * SPEC-FINAL 6.4: fill a match's six alliance slots from the event roster. Admin only.
 * `slots` REPLACES the match's slots: given ones are written, omitted ones are cleared, so
 * a slot may be left empty. A team newly placed in a slot must be on the event's live
 * roster; a slot whose team did not change is kept even if that team has since been
 * removed from the roster, so fixing one slot never forces the others to be re-checked.
 */
export async function setMatchTeams(
  caller: Caller,
  input: SetMatchTeamsInput,
  ctx: UseCaseContext,
): Promise<MatchRow> {
  assertCan(caller, 'manage_events');
  const parsed = parseInput(setMatchTeamsInput, input);
  const match = await matchOrNotFound(ctx, parsed.match_id);
  const current = new Map(
    (await ctx.store.listMatchSlots([match.id])).map((s) => [
      `${s.alliance}:${s.station}`,
      s.team_id,
    ]),
  );
  const changed = parsed.slots.filter(
    (s) => current.get(`${s.alliance}:${s.station}`) !== s.team_id,
  );
  if (changed.length > 0) {
    const roster = new Set((await ctx.store.getRoster(match.event_id)).map((t) => t.id));
    const stranger = changed.find((s) => !roster.has(s.team_id));
    if (stranger) {
      const team = await ctx.store.getTeam(stranger.team_id);
      throw notOnRoster(team ? String(team.number) : stranger.team_id);
    }
  }

  try {
    await ctx.store.setMatchTeams(match.id, parsed.slots);
  } catch (e) {
    const code = pgCode(e);
    if (code === '23503') {
      if (!(await ctx.store.getMatch(match.id))) throw noSuchMatch(match.id);
      throw new AppError(
        'not-found',
        'one of those teams no longer exists; reload the roster and try again',
        { match_id: match.id },
      );
    }
    if (code === '23505') {
      throw new AppError(
        'conflict',
        "this match's teams changed while they were being saved; reload the match and try again",
        { match_id: match.id },
      );
    }
    throw e;
  }
  return toMatchRow(match, await ctx.store.listMatchSlots([match.id]));
}

/**
 * SPEC-FINAL 6.4: a system action, not an admin capability. Without it a scouter at a
 * venue with an incomplete schedule could not record a match at all. It rides the outbox
 * like any other create and works offline (syncPush's bare `match` operation calls this,
 * so there is exactly one implementation of the rule).
 *
 * Every role may call it (`ensure_match`); a service caller may not. It creates event +
 * type + number ONLY — never teams — and is a no-op if the match exists, returning the
 * existing match's id, which is the CANONICAL one: two offline devices can each create the
 * same match number under their own ids, and the second must learn the first's.
 */
export async function ensureMatch(
  caller: Caller,
  input: EnsureMatchInput,
  ctx: UseCaseContext,
): Promise<EnsureMatchOutput> {
  assertCan(caller, 'ensure_match');
  const parsed = parseInput(ensureMatchInput, input);
  const find = () => ctx.store.findMatch(parsed.event_id, parsed.match_type, parsed.number);
  // An unknown event is `not-found` here rather than a foreign-key 500 on the insert.
  if (!(await ctx.store.eventExists(parsed.event_id))) throw noSuchEvent(parsed.event_id);
  const existing = await find();
  if (existing) return { id: existing.id, created: false };
  try {
    await ctx.store.insertMatch({
      id: parsed.id,
      event_id: parsed.event_id,
      match_type: parsed.match_type,
      number: parsed.number,
    });
  } catch (e) {
    const code = pgCode(e);
    if (code === '23505') {
      // Lost a race for the same (event, type, number): the winner is canonical.
      const winner = await find();
      if (winner) return { id: winner.id, created: false };
      // Otherwise the id itself is taken, by a match with another key.
      const holder = await ctx.store.getMatch(parsed.id);
      if (holder) {
        throw new AppError(
          'conflict',
          `this match id already belongs to ${describeMatch(holder)}; it cannot name another match`,
          { id: parsed.id },
        );
      }
    }
    if (code === '23503') throw noSuchEvent(parsed.event_id);
    throw e;
  }
  return { id: parsed.id, created: true };
}
