import type {
  EngineEntry,
  FormFieldDefinition,
  MatchType,
  RobotStatus,
  ScoringRule,
} from '@frc/shared';

/*
 * What the shared engine reads, put together from the device's cached rows (task 1.52; moved out
 * of team search, task 1.51). The scoring itself is @frc/shared's — `scoutedPoints`,
 * `scoreBreakdown`, `averagePoints`, `rankByAveragePoints` — never a second copy here.
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const live = (r: Row) => r.deleted_at == null;
const ROBOT_STATUSES: readonly string[] = ['played', 'no_show', 'disabled', 'broke_down'];

/** A cached robot status as the engine types it; anything else is null. */
export function robotStatusOf(value: unknown): RobotStatus | null {
  const status = str(value);
  return status && ROBOT_STATUSES.includes(status) ? (status as RobotStatus) : null;
}

/** A cached entry's `data`, or `{}` when it holds none. */
export function entryData(row: Row): Record<string, unknown> {
  return typeof row.data === 'object' && row.data !== null && !Array.isArray(row.data)
    ? (row.data as Record<string, unknown>)
    : {};
}

/** A cached entry as the shared engine reads it, with its match and event joined. */
export function toEngineEntry(
  row: Row,
  matches: Map<string, Row>,
  eventSortOrder: number,
): EngineEntry {
  const matchId = str(row.match_id);
  const match = matchId ? matches.get(matchId) : undefined;
  return {
    id: String(row.id),
    form_version_id: String(row.form_version_id),
    form_kind: row.form_kind === 'super' ? 'super' : 'match',
    event_id: String(row.event_id),
    match_id: matchId,
    team_id: String(row.team_id),
    alliance: row.alliance === 'red' || row.alliance === 'blue' ? row.alliance : null,
    scouter_id: String(row.scouter_id),
    robot_status: robotStatusOf(row.robot_status),
    breakdown_seconds: typeof row.breakdown_seconds === 'number' ? row.breakdown_seconds : null,
    data: entryData(row),
    client_created_at: String(row.client_created_at),
    client_updated_at: String(row.client_updated_at ?? row.client_created_at),
    deleted_at: str(row.deleted_at),
    match_type: (str(match?.match_type) as MatchType | null) ?? null,
    match_number: typeof match?.number === 'number' ? match.number : null,
    event_sort_order: eventSortOrder,
  };
}

/** The cached form rows a score is read from. */
export type ScoringRows = {
  forms: Row[];
  versions: Row[];
  fields: Row[];
  rules: Row[];
};

/** How a form scores: its ACTIVE version's fields, in form order, and the form's rules. */
export type FormScoring = { fields: FormFieldDefinition[]; rules: ScoringRule[] };

/**
 * A form's scoring (SPEC-FINAL 5.1): the active version's live fields in display order and the
 * form's live rules — `fallbackVersionId`'s fields when the form has no active version.
 */
export function formScoring(
  formId: string,
  rows: ScoringRows,
  fallbackVersionId?: string,
): FormScoring | null {
  const form = rows.forms.find((f) => f.id === formId && live(f));
  const versionId = str(form?.active_version_id) ?? fallbackVersionId ?? null;
  if (!versionId) return null;
  return {
    fields: rows.fields
      .filter((f) => f.form_version_id === versionId && live(f))
      .sort((a, b) => Number(a.display_order) - Number(b.display_order))
      .map((f) => f as unknown as FormFieldDefinition),
    rules: rows.rules
      .filter((r) => r.form_id === formId && live(r))
      .map((r) => ({
        field_key: String(r.field_key),
        points: Number(r.points),
        option_points: (r.option_points ?? null) as ScoringRule['option_points'],
      })),
  };
}

/**
 * How an entry recorded on `versionId` is scored, as the server's entry search and entry read
 * decide it (task 1.50's `scoringLoader`): the version's form, scored with that form's ACTIVE
 * version and its rules. Null when the device holds neither the version nor a form whose active
 * version it is.
 */
export function scoringForVersion(versionId: string, rows: ScoringRows): FormScoring | null {
  const version = rows.versions.find((v) => v.id === versionId);
  const formId =
    str(version?.form_id) ??
    str(rows.forms.find((f) => f.active_version_id === versionId)?.id) ??
    null;
  return formId ? formScoring(formId, rows, versionId) : null;
}

/** Scoring by version id, worked out once per version for a list of entries. */
export function scoringCache(rows: ScoringRows): (versionId: string) => FormScoring | null {
  const memo = new Map<string, FormScoring | null>();
  return (versionId) => {
    if (!memo.has(versionId)) memo.set(versionId, scoringForVersion(versionId, rows));
    return memo.get(versionId) ?? null;
  };
}
