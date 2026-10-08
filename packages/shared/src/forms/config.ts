import { z } from 'zod';
import type { FormFieldDefinition } from './types';

export const FIELD_TYPES = [
  'counter',
  'number',
  'toggle',
  'single_select',
  'multi_select',
  'rating',
  'short_text',
  'long_text',
  'timer',
  'event_log',
  'position',
  'cycle_path',
  'computed',
  'section',
] as const;

export type FieldTypeName = (typeof FIELD_TYPES)[number];

const option = z.object({ value: z.string().min(1), label: z.string().min(1) });
const mirrorAxis = z.enum(['none', 'horizontal', 'vertical', 'both']);
const numericRange = {
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
};

/**
 * SPEC-FINAL 5.3 (amended v1.20): an event log may ask where each tap happened. When it does
 * (`ask_position`), the map needs the alliance mirroring, so `mirror_axis` is then required.
 */
const eventLog = z
  .object({
    event_types: z.array(option).min(1),
    ask_position: z.boolean().default(false),
    mirror_axis: mirrorAxis.optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (config.ask_position && config.mirror_axis === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mirror_axis'],
        message: 'mirror_axis is required when ask_position is on',
      });
    }
  });

/** SPEC-FINAL 5.3, one schema per type. */
export const FIELD_TYPE_CONFIG: Record<FieldTypeName, z.ZodType> = {
  counter: z.object(numericRange).strict(),
  number: z.object(numericRange).strict(),
  toggle: z.object({}).strict(),
  single_select: z
    .object({ options: z.array(option).min(1), is_ordinal: z.boolean().optional() })
    .strict(),
  multi_select: z
    .object({ options: z.array(option).min(1), is_ordinal: z.boolean().optional() })
    .strict(),
  rating: z
    .object({ max: z.number().int().positive().default(5), style: z.enum(['stars', 'slider']) })
    .strict(),
  short_text: z.object({ max_length: z.number().int().positive().optional() }).strict(),
  long_text: z.object({ max_length: z.number().int().positive().optional() }).strict(),
  // SPEC-FINAL 5.3: allow_unsure is "always true in v1", so it defaults to true and
  // cannot be set to false — but a field that omits it entirely is still valid.
  timer: z.object({ allow_unsure: z.literal(true).default(true) }).strict(),
  event_log: eventLog,
  position: z.object({ multi_point: z.boolean(), mirror_axis: mirrorAxis }).strict(),
  cycle_path: z
    .object({
      max_points_per_cycle: z.number().int().positive().default(6),
      mirror_axis: mirrorAxis,
    })
    .strict(),
  computed: z
    .object({ expression: z.unknown(), result_type: z.enum(['float', 'string']) })
    .strict(),
  section: z.object({}).strict(),
};

export type DefinitionIssue = { path: string; message: string };

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;
const SEMANTIC_COLUMNS = [
  'description',
  'unit',
  'phase',
  'direction',
  'category',
  'expected_range',
  'include_in_ai_context',
] as const;

const blank = (value: unknown): boolean =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

/**
 * The three constraints SPEC-FINAL 3.3 leaves to the use-case layer, because they
 * depend on the field's type. Both the server and the builder call this, so a rule
 * cannot drift between them.
 */
export function validateFieldDefinition(field: FormFieldDefinition): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];

  if (!KEY_PATTERN.test(field.key)) {
    issues.push({
      path: 'key',
      message:
        'a key is permanent: lowercase letters, digits and underscores, starting with a letter',
    });
  }

  if (field.type === 'section') {
    for (const column of SEMANTIC_COLUMNS) {
      if (field[column] !== null && field[column] !== undefined) {
        issues.push({
          path: column,
          message: 'a section holds no data and carries no semantic metadata',
        });
      }
    }
  } else {
    for (const required of ['description', 'unit', 'phase', 'direction'] as const) {
      if (blank(field[required])) {
        issues.push({
          path: required,
          message: `${required} is required on every data field and cannot be backfilled later`,
        });
      }
    }
  }

  const ordinalAllowed = field.type === 'single_select' || field.type === 'multi_select';
  if (!ordinalAllowed && field.is_ordinal !== null && field.is_ordinal !== undefined) {
    issues.push({
      path: 'is_ordinal',
      message: 'is_ordinal applies only to single and multi select',
    });
  }

  const schema = FIELD_TYPE_CONFIG[field.type as FieldTypeName];
  if (!schema) {
    issues.push({ path: 'type', message: `unknown field type '${field.type}'` });
  } else {
    const parsed = schema.safeParse(field.config);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          path: issue.path.length > 0 ? `config.${issue.path.join('.')}` : 'config',
          message: issue.message,
        });
      }
    }
  }

  return issues;
}
