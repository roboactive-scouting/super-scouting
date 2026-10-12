import {
  conflictResolution,
  latestWins,
  LIST_CONFLICTS_DEFAULT_LIMIT,
  LIST_CONFLICTS_MAX_LIMIT,
  listConflictsInput,
  SETTLED_CONFLICTS_MAX,
  SETTLED_DEFAULT_WINDOW_MS,
  type Caller,
  type ConflictItem,
  type ConflictResolution,
  type ListConflictsInput,
  type ListConflictsOutput,
  type SettledConflict,
} from '@frc/shared';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { parseInput } from '../commands/users.js';
import type {
  StoredConflict,
  StoredMatch,
  StoredRow,
  StoredTeam,
  UseCaseContext,
} from '../context.js';
import { decodeCursor, encodeCursor } from '../cursor.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  listConflictsInput,
  listConflictsOutput,
  type ListConflictsInput,
  type ListConflictsOutput,
} from '@frc/shared';

/**
 * The keyset: created_at is not unique, so the id breaks ties. The instant is kept exactly
 * as the database returned it (microseconds included) — a rounded one would repeat a row.
 */
const conflictCursor = z
  .object({
    c: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/),
    i: z.string().uuid(),
  })
  .strict();

/** The two non-`data` columns the diff compares as fields, first, in this order. */
const STATUS_FIELDS = ['robot_status', 'breakdown_seconds'] as const;

type Lookups = {
  entries: Map<string, StoredRow>;
  names: Map<string, string>;
  teams: Map<string, StoredTeam>;
  matches: Map<string, StoredMatch>;
};

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);
const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
/** JSON has no undefined: a key one copy lacks reads as null on the wire. */
const orNull = (value: unknown): unknown => (value === undefined ? null : value);

/**
 * The field-by-field diff (SPEC-FINAL 9.5): robot_status and breakdown_seconds, then the
 * union of both copies' `data` keys in key order. Equal fields are included with
 * `differs: false`. Deep equality: a `data` value can be an array or object (an event log).
 * The client orders the data fields by the form version's display_order.
 */
function diffOf(
  x: Record<string, unknown>,
  y: Record<string, unknown>,
): { field_key: string; x: unknown; y: unknown; differs: boolean }[] {
  const xData = record(x.data);
  const yData = record(y.data);
  const dataKeys = [...new Set([...Object.keys(xData), ...Object.keys(yData)])].sort();
  const pairs: [string, unknown, unknown][] = [
    ...STATUS_FIELDS.map((key): [string, unknown, unknown] => [key, x[key], y[key]]),
    ...dataKeys.map((key): [string, unknown, unknown] => [key, xData[key], yData[key]]),
  ];
  return pairs.map(([field_key, a, b]) => ({
    field_key,
    x: orNull(a),
    y: orNull(b),
    differs: !isDeepStrictEqual(orNull(a), orNull(b)),
  }));
}

function teamOf(row: StoredRow | undefined, look: Lookups) {
  const team = row ? look.teams.get(String(row.team_id)) : undefined;
  return team ? { id: team.id, number: team.number, name: team.name } : null;
}

function matchOf(row: StoredRow | undefined, look: Lookups) {
  const matchId = row ? str(row.match_id) : null;
  const match = matchId ? look.matches.get(matchId) : undefined;
  return match ? { id: match.id, match_type: match.match_type, number: match.number } : null;
}

const formKindOf = (row: StoredRow): 'match' | 'super' =>
  row.form_kind === 'super' ? 'super' : 'match';

const allianceOf = (row: StoredRow): 'red' | 'blue' | null =>
  row.alliance === 'red' || row.alliance === 'blue' ? row.alliance : null;

/**
 * A stored entry as one side of a card. Its author is the row's `scouter_id`: the schema
 * records no last editor, so a lead's edit of a scouter's entry still names the scouter.
 */
function copyOf(row: StoredRow, look: Lookups) {
  const scouterId = String(row.scouter_id);
  return {
    row_id: row.id,
    version: row.version,
    form_version_id: str(row.form_version_id),
    author: { id: scouterId, full_name: look.names.get(scouterId) ?? null },
    client_updated_at: String(row.client_updated_at),
    robot_status: str(row.robot_status),
    breakdown_seconds: num(row.breakdown_seconds),
    data: record(row.data),
    deleted_at: str(row.deleted_at),
  };
}

/** An open conflict as a card, or null when a row it names no longer exists. */
function toItem(conflict: StoredConflict, look: Lookups): ConflictItem | null {
  if (conflict.kind === 'divergence') {
    const live = look.entries.get(conflict.row_id);
    if (!live) return null;
    const payload = conflict.superseded_payload ?? {};
    const authorId = conflict.superseded_author_id;
    const superseded = {
      form_version_id: str(payload.form_version_id),
      author: { id: authorId, full_name: authorId ? (look.names.get(authorId) ?? null) : null },
      client_updated_at: conflict.superseded_client_updated_at,
      base_version: conflict.base_version,
      robot_status: str(payload.robot_status),
      breakdown_seconds: num(payload.breakdown_seconds),
      data: record(payload.data),
    };
    const liveCopy = copyOf(live, look);
    return {
      id: conflict.id,
      kind: 'divergence',
      created_at: conflict.created_at,
      form_kind: formKindOf(live),
      team: teamOf(live, look),
      match: matchOf(live, look),
      alliance: allianceOf(live),
      live: liveCopy,
      superseded,
      counted: 'live',
      diff: diffOf(liveCopy, superseded).map(({ field_key, x, y, differs }) => ({
        field_key,
        live: x,
        superseded: y,
        differs,
      })),
    };
  }

  const a = look.entries.get(conflict.row_id);
  const b = conflict.duplicate_row_id ? look.entries.get(conflict.duplicate_row_id) : undefined;
  if (!a || !b) return null;
  // What the statistics use now (SPEC-FINAL 9.5): a soft-deleted row never counts; between
  // two live rows, the greater client_updated_at (a tie keeps `a`, as latestWins does).
  const aLive = a.deleted_at == null;
  const bLive = b.deleted_at == null;
  const stamped = (row: StoredRow) => ({
    ...row,
    client_updated_at: String(row.client_updated_at),
  });
  const counted =
    aLive !== bLive
      ? aLive
        ? 'a'
        : 'b'
      : latestWins(stamped(a), stamped(b)).id === a.id
        ? 'a'
        : 'b';
  const aCopy = copyOf(a, look);
  const bCopy = copyOf(b, look);
  return {
    id: conflict.id,
    kind: 'duplicate',
    created_at: conflict.created_at,
    form_kind: formKindOf(a),
    team: teamOf(a, look),
    match: matchOf(a, look),
    alliance: allianceOf(a),
    a: aCopy,
    b: bCopy,
    counted,
    diff: diffOf(aCopy, bCopy).map(({ field_key, x, y, differs }) => ({
      field_key,
      a: x,
      b: y,
      differs,
    })),
  };
}

/** One "Settled today" line: what was kept, when and by whom. Rows may be gone since. */
function toSettled(conflict: StoredConflict, look: Lookups): SettledConflict {
  const parsed = conflictResolution.safeParse(conflict.resolution);
  const resolution: ConflictResolution | null = parsed.success ? parsed.data : null;
  const rowA = look.entries.get(conflict.row_id);
  const rowB = conflict.duplicate_row_id ? look.entries.get(conflict.duplicate_row_id) : undefined;
  const nameOf = (id: string | null | undefined) => (id ? (look.names.get(id) ?? null) : null);

  let kept: SettledConflict['kept'] = null;
  if (resolution && 'keep' in resolution) {
    kept = {
      row_id: conflict.row_id,
      author_full_name:
        resolution.keep === 'superseded'
          ? nameOf(conflict.superseded_author_id)
          : nameOf(rowA ? String(rowA.scouter_id) : null),
    };
  } else if (resolution) {
    const keptRow = look.entries.get(resolution.keep_row_id);
    kept = {
      row_id: resolution.keep_row_id,
      author_full_name: nameOf(keptRow ? String(keptRow.scouter_id) : null),
    };
  }
  const keptRow = kept ? look.entries.get(kept.row_id) : undefined;
  const any = keptRow ?? rowA ?? rowB;
  const resolverId = conflict.resolved_by;
  return {
    id: conflict.id,
    kind: conflict.kind,
    form_kind: any ? formKindOf(any) : null,
    team: teamOf(any, look),
    match: matchOf(any, look),
    resolution,
    resolved_at: String(conflict.resolved_at),
    resolved_by: resolverId ? { id: resolverId, full_name: nameOf(resolverId) } : null,
    kept,
  };
}

const unique = (values: (string | null | undefined)[]): string[] => [
  ...new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0)),
];

/**
 * The conflict review queue (SPEC-FINAL 9.5, task 1.41). A QUERY: every role and a
 * `service` caller may read it — resolving is what is gated (resolveConflict).
 *
 * `items` are the event's OPEN scouting-entry conflicts, oldest first, keyset-paginated;
 * `limit` defaults to 20 and a request above 50 is CLAMPED to 50. Pick-list and alliance
 * conflicts arrive with phase 1G and are not listed yet. A conflict naming an entry that no
 * longer exists (`row_id` is not a foreign key; a form or version delete cascades to its
 * entries) is left out, so a page can hold fewer than `limit` items: page while
 * `next_cursor` is set. `settled` is the event's conflicts resolved at or after
 * `settled_since` (default: the last 24 hours), newest first, at most 100.
 *
 * Bounded reads (SPEC-FINAL 16.4): the two conflict lists, then one batched read each of
 * entries, then users, teams and matches together.
 */
export async function listConflicts(
  caller: Caller,
  input: ListConflictsInput,
  ctx: UseCaseContext,
): Promise<ListConflictsOutput> {
  void caller; // every role, and a service caller, may read the queue
  const parsed = parseInput(listConflictsInput, input);
  const limit = Math.min(parsed.limit ?? LIST_CONFLICTS_DEFAULT_LIMIT, LIST_CONFLICTS_MAX_LIMIT);
  const cursor = parsed.cursor ? decodeCursor(conflictCursor, parsed.cursor) : undefined;
  const since = parsed.settled_since
    ? new Date(parsed.settled_since).toISOString()
    : new Date(ctx.now().getTime() - SETTLED_DEFAULT_WINDOW_MS).toISOString();

  const [open, settledRows] = await Promise.all([
    ctx.store.listOpenConflicts(
      parsed.event_id,
      'scouting_entry',
      limit + 1,
      cursor ? { created_at: cursor.c, id: cursor.i } : undefined,
    ),
    ctx.store.listSettledConflicts(parsed.event_id, 'scouting_entry', since, SETTLED_CONFLICTS_MAX),
  ]);
  const page = open.slice(0, limit);
  const conflicts = [...page, ...settledRows];

  const entryRows = await ctx.store.getEntriesByIds(
    unique(conflicts.flatMap((c) => [c.row_id, c.duplicate_row_id])),
  );
  const entries = new Map(entryRows.map((row) => [row.id, row]));
  const [users, teams, matches] = await Promise.all([
    ctx.store.listUserNames(
      unique([
        ...entryRows.map((row) => str(row.scouter_id)),
        ...conflicts.flatMap((c) => [c.superseded_author_id, c.resolved_by]),
      ]),
    ),
    ctx.store.getTeamsByIds(unique(entryRows.map((row) => str(row.team_id)))),
    ctx.store.getMatchesByIds(unique(entryRows.map((row) => str(row.match_id)))),
  ]);
  const look: Lookups = {
    entries,
    names: new Map(users.map((u) => [u.id, u.full_name])),
    teams: new Map(teams.map((t) => [t.id, t])),
    matches: new Map(matches.map((m) => [m.id, m])),
  };

  const last = page[page.length - 1];
  return {
    items: page.map((c) => toItem(c, look)).filter((item): item is ConflictItem => item !== null),
    next_cursor:
      open.length > limit && last ? encodeCursor({ c: last.created_at, i: last.id }) : null,
    settled: settledRows.map((c) => toSettled(c, look)),
  };
}
