import {
  averagePoints,
  NO_VALUE,
  scoreBreakdown,
  type FieldPhase,
  type FieldType,
  type FormFieldDefinition,
  type GetEntryOutput,
  type RobotStatus,
} from '@frc/shared';
import { cachedLiveSlots, cachedRows } from '@/data/cache';
import { db } from '@/data/db';
import type { Station } from '@/data/station';
import { stationOf, type LineupSlot } from '@/lib/derive/entries';
import { entryData, robotStatusOf, scoringForVersion, toEngineEntry } from '@/lib/derive/scoring';
import { matchLabel } from '@/lib/matchLabel';
import { mapCount, opensMap } from '@/features/entry/map/mapField';
import { displayValue } from '@/features/entry/phases';

/*
 * The entry preview's data (SPEC-FINAL 13.4, task 1.52), from the device first — the venue is
 * offline, and the 5-minute mark lands here offline — and from the server's `getEntry` only when
 * the device does not hold the entry. Both are turned into one `EntryPreview`. The phases, their
 * subtotals, the total and the team's average come from @frc/shared (`scoreBreakdown`,
 * `averagePoints`), scored with the form's ACTIVE version and its rules exactly as `getEntry`
 * scores them: never a second scoring implementation here.
 */

/** One answer row as the preview draws it. */
export type PreviewRow = {
  key: string;
  label: string;
  type: FieldType;
  /** What the row shows: an option's label, "Yes", "4", the text; "—" when not answered. */
  text: string;
  /** Points when a rule scores the field ("+8", or a faint "0"); null: no points cell. */
  points: number | null;
  /** A long text answer: it sits under its label, wrapping. */
  long: boolean;
  /** A map field the device can draw: its words ("6 spots") and its field, for the map view. */
  map: { words: string; field: FormFieldDefinition } | null;
};

export type PreviewPhase = { phase: FieldPhase; subtotal: number | null; rows: PreviewRow[] };

export type EntryPreview = {
  id: string;
  kind: 'match' | 'super';
  eventId: string;
  matchId: string | null;
  teamId: string;
  alliance: 'red' | 'blue' | null;
  /** The driver station from the line-up; null when the team is not in it (or a super entry). */
  station: Station | null;
  /** "Q37"; null for a super entry ("Whole event"). */
  matchLabel: string | null;
  teamNumber: number | null;
  teamName: string;
  /** Null for a super entry. */
  status: RobotStatus | null;
  scouterId: string;
  scouterName: string | null;
  clientCreatedAt: string;
  /** The entry's own form version number (form v3); null when the device does not hold it. */
  formVersion: number | null;
  /** The scouted points: null for a no-show, a disabled robot and a super entry. */
  total: number | null;
  phases: PreviewPhase[];
  /** The team's average scouted points at the event (match entries only). */
  teamAverage: number | null;
  /** The entry's answers as stored, for the map view. */
  data: Record<string, unknown>;
  /** The season's game image, for the map view. */
  fieldImagePath: string | null;
};

/** What the device found for an id: the entry, a deleted (or other event's) one, or nothing. */
export type DeviceLookup = { state: 'held'; entry: EntryPreview } | { state: 'gone' | 'absent' };

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** A short text answer longer than this sits under its label, like a long one (22 final). */
const LONG = 24;

function isLong(type: FieldType, text: string): boolean {
  if (text === NO_VALUE) return false;
  return type === 'long_text' || (type === 'short_text' && text.length > LONG);
}

const MAP_TYPES: readonly FieldType[] = ['position', 'cycle_path', 'event_log'];

/** A breakdown row with the field it came from: the device's view. */
function deviceRow(
  row: { key: string; label: string; type: FieldType; points: number | null },
  field: FormFieldDefinition | undefined,
  data: Record<string, unknown>,
  held: boolean,
): PreviewRow {
  const value = held ? data[row.key] : undefined;
  if (field && MAP_TYPES.includes(row.type)) {
    const words = mapCount(field, value);
    const text = words ?? NO_VALUE;
    return {
      ...row,
      text,
      long: false,
      map: words && opensMap(field) ? { words, field } : null,
    };
  }
  const text = field ? displayValue(field, value) : held ? String(value) : NO_VALUE;
  return { ...row, text, long: isLong(row.type, text), map: null };
}

/**
 * The entry `entryId` as this device holds it, scored on the device. `gone` when it is
 * soft-deleted or another event's (neither is ever shown); `absent` when the device does not
 * hold it, or not the form it was scouted on.
 */
export async function loadDevicePreview(entryId: string, eventId: string): Promise<DeviceLookup> {
  const row = (await db.rows.get(['scouting_entries', entryId])) as Row | undefined;
  if (!row) return { state: 'absent' };
  if (row.deleted_at != null || row.event_id !== eventId) return { state: 'gone' };

  const [entries, matches, teams, users, events, seasons, forms, versions, fields, rules, slots] =
    await Promise.all([
      cachedRows<Row>('scouting_entries'),
      cachedRows<Row>('matches'),
      cachedRows<Row>('teams'),
      cachedRows<Row>('users'),
      cachedRows<Row>('events'),
      cachedRows<Row>('seasons'),
      cachedRows<Row>('forms'),
      cachedRows<Row>('form_versions'),
      cachedRows<Row>('form_fields'),
      cachedRows<Row>('scoring_rules'),
      cachedLiveSlots<LineupSlot>(),
    ]);
  const versionId = String(row.form_version_id);
  const scoring = scoringForVersion(versionId, { forms, versions, fields, rules });
  if (!scoring) return { state: 'absent' };

  const kind = row.form_kind === 'super' ? 'super' : 'match';
  const status = kind === 'super' ? null : robotStatusOf(row.robot_status);
  const data = entryData(row);
  const breakdown = scoreBreakdown(
    { form_kind: kind, robot_status: status, data },
    scoring.fields,
    scoring.rules,
  );
  const byKey = new Map(scoring.fields.map((f) => [f.key, f]));

  const matchId = str(row.match_id);
  const teamId = String(row.team_id);
  const match = matchId ? matches.find((m) => m.id === matchId) : undefined;
  const team = teams.find((t) => t.id === teamId);
  const event = events.find((e) => e.id === eventId);
  const season = seasons.find((s) => s.id === event?.season_id);
  const sortOrder = typeof event?.sort_order === 'number' ? event.sort_order : 0;

  let teamAverage: number | null = null;
  if (kind === 'match') {
    const byId = new Map(matches.map((m) => [String(m.id), m]));
    const teamRows = entries.filter(
      (e) =>
        e.event_id === eventId &&
        e.team_id === teamId &&
        e.form_kind !== 'super' &&
        e.deleted_at == null,
    );
    teamAverage = averagePoints(
      teamRows.map((e) => toEngineEntry(e, byId, sortOrder)),
      scoring.fields,
      scoring.rules,
    ).avg;
  }

  return {
    state: 'held',
    entry: {
      id: entryId,
      kind,
      eventId,
      matchId,
      teamId,
      alliance: row.alliance === 'red' || row.alliance === 'blue' ? row.alliance : null,
      station: kind === 'match' && matchId ? stationOf(slots, matchId, teamId) : null,
      matchLabel:
        kind === 'match' && match
          ? matchLabel({ match_type: String(match.match_type), number: Number(match.number) })
          : null,
      teamNumber: team ? Number(team.number) : null,
      teamName: str(team?.name) ?? '',
      status,
      scouterId: String(row.scouter_id),
      scouterName: str(users.find((u) => u.id === row.scouter_id)?.full_name),
      clientCreatedAt: str(row.client_created_at) ?? str(row.client_updated_at) ?? '',
      formVersion: (() => {
        const v = versions.find((x) => x.id === versionId)?.version_no;
        return typeof v === 'number' ? v : null;
      })(),
      total: breakdown.total,
      phases: breakdown.phases.map((p) => ({
        phase: p.phase,
        subtotal: p.subtotal,
        rows: p.fields.map((f) => deviceRow(f, byKey.get(f.key), data, 'value' in f)),
      })),
      teamAverage,
      data,
      fieldImagePath: str(season?.field_image_path),
    },
  };
}

/** A wire row's text: the server already gives a select's option label. */
function wireText(f: GetEntryOutput['phases'][number]['fields'][number]): string {
  const pseudo = { key: f.key, label: f.label, type: f.type, config: {} } as FormFieldDefinition;
  if (!('value' in f)) return displayValue(pseudo, undefined);
  if (f.type === 'single_select') return String(f.value);
  if (f.type === 'multi_select' && Array.isArray(f.value)) return f.value.map(String).join(', ');
  if (MAP_TYPES.includes(f.type)) return mapCount(pseudo, f.value) ?? NO_VALUE;
  return displayValue(pseudo, f.value);
}

/**
 * The server's `getEntry` as the preview draws it, for an entry this device does not hold. The
 * device holds no form for it, so a map field reads its words but does not open (no map, no
 * image), and the station is the alliance alone.
 */
export function fromWire(out: GetEntryOutput): EntryPreview {
  return {
    id: out.id,
    kind: out.form_kind,
    eventId: out.event_id,
    matchId: out.match_id,
    teamId: out.team_id,
    alliance: out.alliance,
    station: null,
    matchLabel: out.form_kind === 'super' ? null : out.match_label,
    teamNumber: out.team_number,
    teamName: out.team_name,
    status: out.form_kind === 'super' ? null : out.robot_status,
    scouterId: out.scouter_id,
    scouterName: out.scouter_name,
    clientCreatedAt: out.client_created_at,
    formVersion: out.form_version,
    total: out.scouted_points,
    phases: out.phases.map((p) => ({
      phase: p.phase,
      subtotal: p.subtotal,
      rows: p.fields.map((f) => {
        const text = wireText(f);
        return {
          key: f.key,
          label: f.label,
          type: f.type,
          text,
          points: f.points,
          long: isLong(f.type, text),
          map: null,
        };
      }),
    })),
    teamAverage: out.team_average,
    data: {},
    fieldImagePath: null,
  };
}
