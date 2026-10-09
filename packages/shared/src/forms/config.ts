import { z } from 'zod';
import { exprSchema } from './expression';

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

/** A list of options or event types: at least one, and no value twice (the value is the key). */
const optionList = z
  .array(option)
  .min(1)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((o, i) => {
      if (seen.has(o.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, 'value'],
          message: `the value '${o.value}' is listed twice; each value names one choice`,
        });
      }
      seen.add(o.value);
    });
  });

const mirrorAxis = z.enum(['none', 'horizontal', 'vertical', 'both']);
const numericRange = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
  })
  .strict()
  .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, {
    path: ['max'],
    message: 'max must not be below min',
  });

/**
 * SPEC-FINAL 5.3 (amended v1.20): an event log may ask where each tap happened. When it does
 * (`ask_position`), the map needs the alliance mirroring, so `mirror_axis` is then required.
 */
const eventLog = z
  .object({
    event_types: optionList,
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
  counter: numericRange,
  number: numericRange,
  toggle: z.object({}).strict(),
  single_select: z.object({ options: optionList, is_ordinal: z.boolean().optional() }).strict(),
  multi_select: z.object({ options: optionList, is_ordinal: z.boolean().optional() }).strict(),
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
    .object({ expression: exprSchema.nullable(), result_type: z.enum(['float', 'string']) })
    .strict(),
  section: z.object({}).strict(),
};

export type DefinitionIssue = { path: string; message: string };
