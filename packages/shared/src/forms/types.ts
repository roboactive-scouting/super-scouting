import type { FieldTypeName } from './config';

/** The field-type catalogue of SPEC-FINAL 5.2. The list itself lives in `config.ts`. */
export type FieldType = FieldTypeName;

export type FieldUnit = 'count' | 'seconds' | 'points' | 'boolean' | 'enum' | 'text' | 'coordinate';
export type FieldPhase = 'auto' | 'teleop' | 'endgame' | 'post_match';
export type FieldDirection = 'higher_is_better' | 'lower_is_better' | 'neutral';
export type RobotStatus = 'played' | 'no_show' | 'disabled' | 'broke_down';

export type SelectOption = { value: string; label: string };

export type VisibilityCondition = {
  field_key: string;
  op: '=' | '!=' | '>' | '<' | '>=' | '<=';
  value: unknown;
};

export type FormFieldDefinition = {
  id: string;
  key: string;
  label: string;
  help_text: string | null;
  type: FieldType;
  section: string | null;
  display_order: number;
  required: boolean;
  default_value: unknown;
  config: Record<string, unknown>;
  visibility_condition: VisibilityCondition | null;
  deprecated: boolean;
  description: string | null;
  unit: FieldUnit | null;
  phase: FieldPhase | null;
  direction: FieldDirection | null;
  category: string | null;
  expected_range: { min: number; max: number } | null;
  include_in_ai_context: boolean | null;
  is_ordinal: boolean | null;
};

export type FormVersionDefinition = {
  id: string;
  form_id: string;
  version_no: number;
  published_at: string | null;
  is_locked: boolean;
  fields: FormFieldDefinition[];
};

export function selectOptions(field: Pick<FormFieldDefinition, 'config'>): SelectOption[] {
  const raw = field.config.options;
  return Array.isArray(raw) ? (raw as SelectOption[]) : [];
}

/**
 * One event-log tap (SPEC-FINAL 5.2, 5.6). `x` and `y` come together or not at all: they
 * are present only when the scouter placed the tap on the map, alliance-normalised in 0..1.
 */
export type EventLogTap = { type: string; t: number; x?: number; y?: number };
export type Point = { x: number; y: number };
export type CyclePath = Point[];
