import {
  conflictResolution,
  formatCount,
  formatDate,
  formatMetric,
  formatTime,
  latestWins,
  NO_VALUE,
  SETTLED_CONFLICTS_MAX,
  type ConflictItem,
  type ConflictResolution,
  type FormFieldDefinition,
  type SettledConflict,
} from '@frc/shared';
import { cachedLiveSlots, cachedRows } from '@/data/cache';
import type { Station } from '@/data/station';
import { displayValue } from '@/features/entry/phases';
import { matchLabel } from '@/lib/matchLabel';

/*
 * The conflict review worklist's view-model (SPEC-FINAL 9.5, 9.6; 18-conflicts final). ONE card
 * shape, from two sources: the server's `listConflicts` items when online, and the same items
 * rebuilt from this device's cache (the pulled `sync_conflicts`, `scouting_entries`, `users`,
 * `teams`, `matches`) when offline — `cachedConflicts` mirrors the server's mapping and its diff
 * rule, so both go through the one pure `cardOf`.
 */

type Raw = Record<string, unknown>;

const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const record = (v: unknown): Raw =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : {};
/** JSON has no undefined: a key one copy lacks reads as null (the server's rule). */
const orNull = (v: unknown): unknown => (v === undefined ? null : v);
const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : Number.NaN);

/** Deep equality over JSON values: a `data` value can be an array or an object (an event log). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  const ka = Object.keys(a as Raw).filter((k) => (a as Raw)[k] !== undefined);
  const kb = Object.keys(b as Raw).filter((k) => (b as Raw)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => sameValue((a as Raw)[k], (b as Raw)[k]));
}

/** The two non-`data` columns compared as fields, first, in this order (the server's rule). */
const STATUS_FIELDS = ['robot_status', 'breakdown_seconds'] as const;

/**
 * The field-by-field diff, exactly as the server computes it: robot_status and
 * breakdown_seconds, then the union of both copies' `data` keys in key order; equal fields
 * included with `differs: false`; deep equality; a missing key reads null.
 */
export function diffOf(
  x: Raw,
  y: Raw,
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
    differs: !sameValue(orNull(a), orNull(b)),
  }));
}

// ---------------------------------------------------------------------------------------
// The cache, rebuilt into the server's shapes

/** What the cache holds to rebuild a card: by id. */
export type CacheLookups = {
  entries: Map<string, Raw>;
  names: Map<string, string>;
  teams: Map<string, { id: string; number: number; name: string }>;
  matches: Map<string, { id: string; match_type: string; number: number }>;
};

/** A cached `sync_conflicts` row (SPEC-FINAL 3.6), as the pull delivers it. */
export type CachedConflict = Raw & { id: string; event_id?: string; kind?: string };

function teamOf(row: Raw | undefined, look: CacheLookups) {
  const id = row ? text(row.team_id) : null;
  return (id && look.teams.get(id)) || null;
}

function matchOf(row: Raw | undefined, look: CacheLookups) {
  const id = row ? text(row.match_id) : null;
  const match = id ? look.matches.get(id) : undefined;
  return match
    ? {
        id: match.id,
        match_type: match.match_type as 'qualification' | 'practice' | 'playoff',
        number: match.number,
      }
    : null;
}

const formKindOf = (row: Raw): 'match' | 'super' => (row.form_kind === 'super' ? 'super' : 'match');
const allianceOf = (row: Raw): 'red' | 'blue' | null =>
  row.alliance === 'red' || row.alliance === 'blue' ? row.alliance : null;

function copyOf(row: Raw, look: CacheLookups) {
  const scouterId = String(row.scouter_id ?? '');
  return {
    row_id: String(row.id),
    version: num(row.version) ?? 0,
    form_version_id: text(row.form_version_id),
    author: { id: scouterId, full_name: look.names.get(scouterId) ?? null },
    client_updated_at: String(row.client_updated_at ?? ''),
    robot_status: text(row.robot_status),
    breakdown_seconds: num(row.breakdown_seconds),
    data: record(row.data),
    deleted_at: text(row.deleted_at),
  };
}

/**
 * One cached open conflict as the server's `ConflictItem` (apps/server core/queries/conflicts.ts
 * `toItem`), or null when an entry it names is not on this device — as the server leaves out a
 * conflict whose entry is gone.
 */
export function itemFromCache(conflict: CachedConflict, look: CacheLookups): ConflictItem | null {
  const rowId = text(conflict.row_id);
  const createdAt = String(conflict.created_at ?? '');
  if (conflict.kind === 'divergence') {
    const live = rowId ? look.entries.get(rowId) : undefined;
    if (!live) return null;
    const payload = record(conflict.superseded_payload);
    const authorId = text(conflict.superseded_author_id);
    const superseded = {
      form_version_id: text(payload.form_version_id),
      author: { id: authorId, full_name: authorId ? (look.names.get(authorId) ?? null) : null },
      client_updated_at: text(conflict.superseded_client_updated_at),
      base_version: num(conflict.base_version),
      robot_status: text(payload.robot_status),
      breakdown_seconds: num(payload.breakdown_seconds),
      data: record(payload.data),
    };
    const liveCopy = copyOf(live, look);
    return {
      id: conflict.id,
      kind: 'divergence',
      created_at: createdAt,
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
  const dupId = text(conflict.duplicate_row_id);
  const a = rowId ? look.entries.get(rowId) : undefined;
  const b = dupId ? look.entries.get(dupId) : undefined;
  if (!a || !b) return null;
  const aLive = a.deleted_at == null;
  const bLive = b.deleted_at == null;
  const stamped = (row: Raw): Raw & { client_updated_at: string } => ({
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
    created_at: createdAt,
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

/** One cached resolved conflict as the server's "Settled today" row (`toSettled`). */
export function settledFromCache(conflict: CachedConflict, look: CacheLookups): SettledConflict {
  const parsed = conflictResolution.safeParse(conflict.resolution);
  const resolution: ConflictResolution | null = parsed.success ? parsed.data : null;
  const rowId = String(conflict.row_id ?? '');
  const rowA = look.entries.get(rowId);
  const dupId = text(conflict.duplicate_row_id);
  const rowB = dupId ? look.entries.get(dupId) : undefined;
  const nameOf = (id: string | null | undefined) => (id ? (look.names.get(id) ?? null) : null);
  let kept: SettledConflict['kept'] = null;
  if (resolution && 'keep' in resolution) {
    kept = {
      row_id: rowId,
      author_full_name:
        resolution.keep === 'superseded'
          ? nameOf(text(conflict.superseded_author_id))
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
  const resolverId = text(conflict.resolved_by);
  return {
    id: conflict.id,
    kind: conflict.kind === 'duplicate' ? 'duplicate' : 'divergence',
    form_kind: any ? formKindOf(any) : null,
    team: teamOf(any, look),
    match: matchOf(any, look),
    resolution,
    resolved_at: String(conflict.resolved_at),
    resolved_by: resolverId ? { id: resolverId, full_name: nameOf(resolverId) } : null,
    kept,
  };
}

/** The device's local midnight as an ISO instant with its offset: the start of "today". */
export function localMidnight(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** The cached rows a card or a log line is rebuilt from, by id, and every cached conflict. */
export async function readCacheLookups(): Promise<{
  look: CacheLookups;
  conflicts: CachedConflict[];
}> {
  const [conflicts, entries, users, teams, matches] = await Promise.all([
    cachedRows<CachedConflict>('sync_conflicts'),
    cachedRows<Raw & { id: string }>('scouting_entries'),
    cachedRows<{ id: string; full_name?: unknown }>('users'),
    cachedRows<{ id: string; number?: unknown; name?: unknown }>('teams'),
    cachedRows<{ id: string; match_type?: unknown; number?: unknown }>('matches'),
  ]);
  const look: CacheLookups = {
    entries: new Map(entries.map((e) => [e.id, e])),
    names: new Map(
      users.flatMap((u) => {
        const name = text(u.full_name);
        return name ? [[u.id, name] as const] : [];
      }),
    ),
    teams: new Map(
      teams.map((t) => [t.id, { id: t.id, number: Number(t.number), name: String(t.name ?? '') }]),
    ),
    matches: new Map(
      matches.map((m) => [
        m.id,
        { id: m.id, match_type: String(m.match_type), number: Number(m.number) },
      ]),
    ),
  };
  return { look, conflicts };
}

/** The event's conflicts on this device: what the cards and Settled today read offline. */
export async function readCachedConflicts(
  eventId: string,
  since: string = localMidnight(),
  cache?: { look: CacheLookups; conflicts: CachedConflict[] },
): Promise<{ items: ConflictItem[]; settled: SettledConflict[] }> {
  const { look, conflicts } = cache ?? (await readCacheLookups());
  // The queue lists scouting-entry conflicts only (pick-list ones arrive with phase 1G). The
  // cache keeps a row under its table name in `entity`, so the row's own `entity` column is not
  // on the device: a conflict counts as an entry's when an entry it names is cached.
  const mine = conflicts.filter((c) => c.event_id === eventId);
  const names = (c: CachedConflict) =>
    look.entries.has(String(c.row_id)) || look.entries.has(String(c.duplicate_row_id));
  const byCreated = (a: CachedConflict, b: CachedConflict) =>
    ms(text(a.created_at)) - ms(text(b.created_at)) || a.id.localeCompare(b.id);
  const items = mine
    .filter((c) => c.resolved_at == null)
    .sort(byCreated)
    .map((c) => itemFromCache(c, look))
    .filter((i): i is ConflictItem => i !== null);
  const from = ms(since);
  const settled = mine
    .filter((c) => c.resolved_at != null && ms(text(c.resolved_at)) >= from && names(c))
    .sort((a, b) => ms(text(b.resolved_at)) - ms(text(a.resolved_at)))
    .slice(0, SETTLED_CONFLICTS_MAX)
    .map((c) => settledFromCache(c, look));
  return { items, settled };
}

// ---------------------------------------------------------------------------------------
// The card

/** A copy's column: whose it is, when it was saved, and whether the statistics use it now. */
export type CardCopy = {
  author: string | null;
  /** The column head's first name ("Dana"), or "Unknown". */
  first: string;
  /** The client time as the page shows it: "09:09" today, "14/11/2026 09:09" another day. */
  time: string;
  counted: boolean;
};

export type DiffRow = { key: string; label: string; values: [string, string]; differs: boolean };

/** One button: what it sends, and the line the card folds to. */
export type CardAction = {
  label: string;
  primary: boolean;
  resolution: ConflictResolution;
  /** "Kept Dana’s copy", "Restored Noa’s copy". */
  done: string;
  /** For Settled today, until the server's own line arrives: "kept Dana’s". */
  logged: string;
};

export type ConflictCard = {
  id: string;
  kind: 'divergence' | 'duplicate';
  form_kind: 'match' | 'super';
  /** "Q12", or null for a super entry. */
  match: string | null;
  team: { number: number; name: string } | null;
  station: Station | null;
  alliance: 'red' | 'blue' | null;
  /** "Q12 2096" or "Super 4338": the folded line and the notices name the card by it. */
  short: string;
  copies: [CardCopy, CardCopy];
  rows: DiffRow[];
  differing: number;
  actions: [CardAction, CardAction];
  /** What happened, and which copy is counted now (computer, or a card opened in full). */
  why: string;
};

/** Labels and display order, from the cached `form_fields`, by form version. */
export type FieldIndex = Map<string, Map<string, FormFieldDefinition>>;

export type CardContext = {
  fields: FieldIndex;
  /** `${match_id}|${team_id}` → the station the cached line-up puts the team at. */
  stations: Map<string, Station>;
  now?: Date;
};

const ROBOT_STATUS: Record<string, string> = {
  played: 'Played',
  broke_down: 'Broke down',
  disabled: 'Disabled',
  no_show: 'No show',
};

/** A value with no form field to read it by: the project's number formats, words for the rest. */
export function plainValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return NO_VALUE;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return Number.isInteger(v) ? formatCount(v) : formatMetric(v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== 'object' || x === null)) {
      return v.length === 0 ? NO_VALUE : v.map(plainValue).join(', ');
    }
    return `${formatCount(v.length)} ${v.length === 1 ? 'item' : 'items'}`;
  }
  return JSON.stringify(v);
}

function valueOf(key: string, v: unknown, field: FormFieldDefinition | undefined): string {
  if (key === 'robot_status') return typeof v === 'string' ? (ROBOT_STATUS[v] ?? v) : NO_VALUE;
  if (key === 'breakdown_seconds') return typeof v === 'number' ? `${formatCount(v)} s` : NO_VALUE;
  if (field && (typeof v !== 'object' || v === null || field.type === 'multi_select')) {
    return displayValue(field, v);
  }
  return plainValue(v);
}

const LABEL: Record<string, string> = {
  robot_status: 'Robot status',
  breakdown_seconds: 'Breakdown time',
};

/** "09:09" today, "14/11/2026 09:09" on any other day (SPEC-FINAL 17.8). */
export function clientTime(iso: string | null, now: Date = new Date()): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return NO_VALUE;
  return formatDate(iso) === formatDate(now.toISOString())
    ? formatTime(iso)
    : `${formatDate(iso)} ${formatTime(iso)}`;
}

const firstName = (full: string | null): string | null =>
  full ? (full.trim().split(/\s+/)[0] ?? null) : null;
const initialed = (full: string | null): string | null => {
  const parts = full?.trim().split(/\s+/) ?? [];
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]!.charAt(0)}.` : null;
};

/** "Noa L.": who settled it, in the log (17-sync's style for a person in a mono line). */
export function shortName(full: string | null): string | null {
  return initialed(full) ?? firstName(full);
}

/**
 * Whose each copy is, for the buttons and lines: "Dana’s". Two copies whose authors share a
 * first name read "Dana L.’s" / "Dana C.’s"; when that still does not tell them apart, or a name
 * is unknown, they are named by time ("the earlier copy"), or by which is counted.
 */
function owners(
  names: [string | null, string | null],
  at: [number, number],
  counted: [boolean, boolean],
): [string, string] {
  const [f0, f1] = [firstName(names[0]), firstName(names[1])];
  if (f0 && f1 && f0 !== f1) return [`${f0}’s`, `${f1}’s`];
  const [i0, i1] = [initialed(names[0]), initialed(names[1])];
  if (i0 && i1 && i0 !== i1) return [`${i0}’s`, `${i1}’s`];
  if (!Number.isNaN(at[0]) && !Number.isNaN(at[1]) && at[0] !== at[1]) {
    return at[0] < at[1]
      ? ['the earlier copy', 'the later copy']
      : ['the later copy', 'the earlier copy'];
  }
  return counted[0]
    ? ['the counted copy', 'the other copy']
    : ['the other copy', 'the counted copy'];
}

const named = (owner: string) => owner.endsWith('’s');
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "Dana’s copy" / "the earlier copy". */
const copyWord = (owner: string) => (named(owner) ? `${owner} copy` : owner);

function orderedKeys(
  rows: { field_key: string }[],
  fields: Map<string, FormFieldDefinition> | undefined,
): string[] {
  const data = rows.map((r) => r.field_key).filter((k) => !STATUS_FIELDS.includes(k as never));
  const order = (k: string) => fields?.get(k)?.display_order ?? Number.POSITIVE_INFINITY;
  return [...STATUS_FIELDS, ...data.sort((a, b) => order(a) - order(b) || a.localeCompare(b))];
}

/**
 * The card for one conflict, from either source. Column order: a divergence shows the live copy
 * then the superseded one (the design); a duplicate shows the earlier-saved row first.
 */
export function cardOf(item: ConflictItem, ctx: CardContext): ConflictCard {
  const now = ctx.now ?? new Date();
  type Side = {
    author: string | null;
    at: string | null;
    counted: boolean;
    form_version_id: string | null;
    pick: (row: ConflictItem['diff'][number]) => unknown;
    resolution: ConflictResolution;
  };
  let sides: [Side, Side];
  if (item.kind === 'divergence') {
    sides = [
      {
        author: item.live.author.full_name,
        at: item.live.client_updated_at,
        counted: true,
        form_version_id: item.live.form_version_id,
        pick: (r) => (r as { live: unknown }).live,
        resolution: { keep: 'live' },
      },
      {
        author: item.superseded.author.full_name,
        at: item.superseded.client_updated_at,
        counted: false,
        form_version_id: item.superseded.form_version_id,
        pick: (r) => (r as { superseded: unknown }).superseded,
        resolution: { keep: 'superseded' },
      },
    ];
  } else {
    const a: Side = {
      author: item.a.author.full_name,
      at: item.a.client_updated_at,
      counted: item.counted === 'a',
      form_version_id: item.a.form_version_id,
      pick: (r) => (r as { a: unknown }).a,
      resolution: { keep_row_id: item.a.row_id },
    };
    const b: Side = {
      author: item.b.author.full_name,
      at: item.b.client_updated_at,
      counted: item.counted === 'b',
      form_version_id: item.b.form_version_id,
      pick: (r) => (r as { b: unknown }).b,
      resolution: { keep_row_id: item.b.row_id },
    };
    sides = ms(b.at) < ms(a.at) ? [b, a] : [a, b];
  }

  const fields = ctx.fields.get(sides[0].form_version_id ?? sides[1].form_version_id ?? '');
  const byKey = new Map(item.diff.map((r) => [r.field_key, r]));
  const rows: DiffRow[] = [];
  for (const key of orderedKeys(item.diff, fields)) {
    const r = byKey.get(key);
    if (!r) continue;
    const v0 = sides[0].pick(r);
    const v1 = sides[1].pick(r);
    // Robot status and breakdown time mean nothing on a form that has neither (a super entry,
    // a robot that never broke down): a row only when either copy holds a value.
    if (STATUS_FIELDS.includes(key as never) && v0 == null && v1 == null) continue;
    const field = fields?.get(key);
    rows.push({
      key,
      label: LABEL[key] ?? field?.label ?? key,
      values: [valueOf(key, v0, field), valueOf(key, v1, field)],
      differs: r.differs,
    });
  }

  const names: [string | null, string | null] = [sides[0].author, sides[1].author];
  const at: [number, number] = [ms(sides[0].at), ms(sides[1].at)];
  const [o0, o1] = owners(names, at, [sides[0].counted, sides[1].counted]);
  const ownerOf = [o0, o1];

  const team = item.team ? { number: item.team.number, name: item.team.name } : null;
  const match = item.form_kind === 'super' || !item.match ? null : matchLabel(item.match);
  const short = [match ?? (item.form_kind === 'super' ? 'Super' : null), team?.number]
    .filter((p) => p !== null && p !== undefined)
    .join(' ');
  const slot =
    item.match && item.team ? ctx.stations.get(`${item.match.id}|${item.team.id}`) : undefined;

  let actions: [CardAction, CardAction];
  let why: string;
  if (item.kind === 'divergence') {
    actions = [
      {
        label: `Keep ${o0}`,
        primary: true,
        resolution: sides[0].resolution,
        done: `Kept ${copyWord(o0)}`,
        logged: `kept ${o0}`,
      },
      {
        label: `Restore ${o1}`,
        primary: false,
        resolution: sides[1].resolution,
        done: `Restored ${copyWord(o1)}`,
        logged: `restored ${o1}`,
      },
    ];
    why =
      'Two edits started from the same copy on different phones. ' +
      (named(o0)
        ? `${o0} later edit is counted now; ${o1} is kept aside.`
        : `${capital(o0)} is counted now; ${o1} is kept aside.`);
  } else {
    actions = [0, 1].map((i) => ({
      label: `Keep ${ownerOf[i]}`,
      primary: false,
      resolution: sides[i]!.resolution,
      done: `Kept ${copyWord(ownerOf[i]!)}`,
      logged: `kept ${ownerOf[i]}, removed ${ownerOf[1 - i]}`,
    })) as [CardAction, CardAction];
    const countedOwner = sides[0].counted ? o0 : o1;
    const later = sides[0].counted ? at[0] > at[1] : at[1] > at[0];
    why =
      (item.form_kind === 'super'
        ? 'Two people wrote a super entry for this robot. '
        : 'Two people scouted this robot in this match. ') +
      (named(countedOwner) && later
        ? `${countedOwner}, entered later, is counted now; both are kept until you pick.`
        : `${capital(countedOwner)} is counted now; both are kept until you pick.`);
  }

  return {
    id: item.id,
    kind: item.kind,
    form_kind: item.form_kind,
    match,
    team,
    station: slot ?? null,
    alliance: item.alliance,
    short,
    copies: [0, 1].map((i) => ({
      author: names[i] ?? null,
      first: firstName(names[i] ?? null) ?? 'Unknown',
      time: clientTime(sides[i]!.at, now),
      counted: sides[i]!.counted,
    })) as [CardCopy, CardCopy],
    rows,
    differing: rows.filter((r) => r.differs).length,
    actions,
    why,
  };
}

/** One line of Settled today: "✓ Q14 · 1690 kept Omer’s, removed Yael’s · 10:17 · Noa L.". */
export type SettledLine = {
  id: string;
  title: string;
  what: string;
  time: string;
  by: string | null;
  at: number;
};

/**
 * A settled conflict as its log line. The server names only whose copy stayed; a duplicate's
 * removed copy is named from the cache when the device holds its row (`look`).
 */
export function settledLineOf(
  s: SettledConflict,
  look?: CacheLookups,
  conflict?: Raw,
): SettledLine {
  const match = s.form_kind === 'super' || !s.match ? null : matchLabel(s.match);
  const head = match ?? (s.form_kind === 'super' ? 'Super' : null);
  const title = [head, s.team ? formatCount(s.team.number) : null].filter(Boolean).join(' · ');
  const kept = firstName(s.kept?.author_full_name ?? null);
  let what: string;
  if (!s.resolution) what = 'settled';
  else if ('keep' in s.resolution) {
    const verb = s.resolution.keep === 'superseded' ? 'restored' : 'kept';
    what = kept
      ? `${verb} ${kept}’s`
      : `${verb} ${verb === 'kept' ? 'the live copy' : 'the other copy'}`;
  } else {
    const keptId = s.resolution.keep_row_id;
    const otherId =
      conflict && String(conflict.row_id) === keptId
        ? text(conflict.duplicate_row_id)
        : conflict
          ? text(conflict.row_id)
          : null;
    const other = otherId ? look?.entries.get(otherId) : undefined;
    const removed = firstName(other ? (look?.names.get(String(other.scouter_id)) ?? null) : null);
    what = `kept ${kept ? `${kept}’s` : 'one copy'}${removed && removed !== kept ? `, removed ${removed}’s` : ''}`;
  }
  return {
    id: s.id,
    title: title || 'Entry',
    what,
    time: formatTime(s.resolved_at),
    by: shortName(s.resolved_by?.full_name ?? null),
    at: Date.parse(s.resolved_at),
  };
}

/** The cached labels and line-up the cards read (both sources). */
export async function readCardContext(): Promise<CardContext> {
  const [fields, slots] = await Promise.all([
    cachedRows<FormFieldDefinition & { form_version_id: string }>('form_fields'),
    cachedLiveSlots<{
      match_id?: unknown;
      team_id?: unknown;
      alliance?: unknown;
      station?: unknown;
    }>(),
  ]);
  const index: FieldIndex = new Map();
  for (const f of fields) {
    let byKey = index.get(f.form_version_id);
    if (!byKey) index.set(f.form_version_id, (byKey = new Map()));
    // A deprecated field still names its old values.
    if (!byKey.has(f.key) || byKey.get(f.key)!.deprecated) byKey.set(f.key, f);
  }
  const stations = new Map<string, Station>();
  for (const s of slots) {
    const st = `${s.alliance === 'blue' ? 'B' : 'R'}${String(s.station)}`;
    if (/^[RB][123]$/.test(st) && typeof s.match_id === 'string' && typeof s.team_id === 'string') {
      stations.set(`${s.match_id}|${s.team_id}`, st as Station);
    }
  }
  return { fields: index, stations };
}
