import type { FormKind } from '../api/forms';
import type { Alliance, MatchType } from '../api/matches';
import type { FormFieldDefinition, RobotStatus } from '../forms/types';

/**
 * One `scoring_rules` row as the engine reads it (SPEC-FINAL 3.4, 4.1). A server's
 * `StoredScoringRule` and a pulled row both satisfy it. Only toggle, counter, number,
 * single_select and multi_select fields ever hold one.
 */
export type ScoringRule = {
  field_key: string;
  points: number;
  option_points: Record<string, number> | null;
};

/** One scouting entry, joined to the skeleton columns the engine needs. */
export type EngineEntry = {
  id: string;
  form_version_id: string;
  form_kind: FormKind;
  event_id: string;
  match_id: string | null;
  team_id: string;
  alliance: Alliance | null;
  scouter_id: string;
  robot_status: RobotStatus | null;
  breakdown_seconds?: number | null;
  data: Record<string, unknown>;
  client_created_at: string;
  client_updated_at: string;
  deleted_at: string | null;
  /** joined from matches / events */
  match_type: MatchType | null;
  match_number: number | null;
  event_sort_order: number;
};

export type EngineForm = {
  fields: FormFieldDefinition[];
  rules: ScoringRule[];
};
