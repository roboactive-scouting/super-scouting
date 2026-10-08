import { z } from 'zod';
import { FIELD_TYPES } from '../forms/config';

/**
 * The wire schemas of the form-builder use cases (SPEC-FINAL 3.3, 5.1, 8.4; task 1.27).
 * Every one is admin only (`manage_forms`) and online only: form editing needs a
 * connection (SPEC-FINAL 5.1). Browser-safe: zod only.
 *
 * Every input is strict, so a field a use case does not take is REFUSED, not dropped.
 */

/** Wire ids are uuids: every primary key is one (SPEC-FINAL 3). */
const uuid = z.string().uuid();

export const FORM_KINDS = ['match', 'super'] as const;
export type FormKind = (typeof FORM_KINDS)[number];
export const formKind = z.enum(FORM_KINDS);

export const FORM_NAME_MAX_LENGTH = 80;
export const FIELD_LABEL_MAX_LENGTH = 200;
/** More than any real form; a bound on one request, not a design limit. */
export const FORM_FIELDS_MAX = 500;
export const TIMER_PHASES_MAX = 8;
/** One phase may not run longer than an hour. */
export const TIMER_PHASE_SECONDS_MAX = 3600;
/** SPEC-FINAL 5.1 (v1.22): a saved export is kept 24 hours, then deleted. */
export const FORM_EXPORT_TTL_MS = 24 * 60 * 60 * 1000;
/** The version of the portable definition's own shape. */
export const FORM_DEFINITION_FORMAT = 1;

const formName = z.string().trim().min(1).max(FORM_NAME_MAX_LENGTH);

/** The phase vocabulary of field metadata (SPEC-FINAL 5.4), shared by the match timer (8.4). */
export const FIELD_PHASES = ['auto', 'teleop', 'endgame', 'post_match'] as const;
export const FIELD_UNITS = [
  'count',
  'seconds',
  'points',
  'boolean',
  'enum',
  'text',
  'coordinate',
] as const;
export const FIELD_DIRECTIONS = ['higher_is_better', 'lower_is_better', 'neutral'] as const;
export const VISIBILITY_OPS = ['=', '!=', '>', '<', '>=', '<='] as const;

/**
 * SPEC-FINAL 8.4: `{"phases": [{"phase": "auto", "seconds": 15}, …]}`. Phases run in list
 * order; each names a phase once and runs a whole, positive number of seconds. An empty
 * list means the form has no timer.
 */
export const timerConfig = z
  .object({
    phases: z
      .array(
        z
          .object({
            phase: z.enum(FIELD_PHASES),
            seconds: z.number().int().positive().max(TIMER_PHASE_SECONDS_MAX),
          })
          .strict(),
      )
      .max(TIMER_PHASES_MAX),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.phases.forEach((p, i) => {
      if (seen.has(p.phase)) {
        ctx.addIssue({
          code: 'custom',
          path: ['phases', i, 'phase'],
          message: `the timer names ${p.phase} twice`,
        });
      }
      seen.add(p.phase);
    });
  });
export type TimerConfig = z.infer<typeof timerConfig>;

/**
 * One field as a save or a definition names it, without its server id. The semantic
 * metadata (`description`, `unit`, `phase`, `direction`) may be blank here: a draft saves
 * while a field still "needs meaning", and only publishing demands it (design 12, closed
 * 2026-10-08). The type-dependent rules are `validateFieldDefinition`'s, on the server.
 */
const fieldShape = {
  key: z.string().min(1).max(63),
  label: z.string().trim().min(1).max(FIELD_LABEL_MAX_LENGTH),
  help_text: z.string().nullable().default(null),
  type: z.enum(FIELD_TYPES),
  section: z.string().nullable().default(null),
  display_order: z.number().int(),
  required: z.boolean().default(false),
  default_value: z.unknown().default(null),
  config: z.record(z.unknown()).default({}),
  visibility_condition: z
    .object({ field_key: z.string().min(1), op: z.enum(VISIBILITY_OPS), value: z.unknown() })
    .strict()
    .nullable()
    .default(null),
  description: z.string().nullable().default(null),
  unit: z.enum(FIELD_UNITS).nullable().default(null),
  phase: z.enum(FIELD_PHASES).nullable().default(null),
  direction: z.enum(FIELD_DIRECTIONS).nullable().default(null),
  category: z.string().nullable().default(null),
  expected_range: z
    .object({ min: z.number(), max: z.number() })
    .strict()
    .refine((r) => r.min <= r.max, { message: 'expected_range min must not exceed max' })
    .nullable()
    .default(null),
  include_in_ai_context: z.boolean().nullable().default(null),
  is_ordinal: z.boolean().nullable().default(null),
};

/** A field of a portable definition: never an id, a version or a timestamp. */
export const formFieldDraft = z.object(fieldShape).strict();
export type FormFieldDraft = z.output<typeof formFieldDraft>;

/**
 * A field in a save. `id` is the server id of a field already saved in the target version;
 * omitted for a new field. A saved field's key never changes (SPEC-FINAL 5.1, v1.20): the
 * server refuses an `id` whose key differs.
 */
export const formFieldInput = z.object({ id: uuid.optional(), ...fieldShape }).strict();
export type FormFieldInput = z.input<typeof formFieldInput>;

/** A saved field as it leaves the server. */
export const formFieldRow = z.object({
  id: uuid,
  form_version_id: uuid,
  key: z.string(),
  label: z.string(),
  help_text: z.string().nullable(),
  type: z.enum(FIELD_TYPES),
  section: z.string().nullable(),
  display_order: z.number().int(),
  required: z.boolean(),
  default_value: z.unknown(),
  config: z.record(z.unknown()),
  visibility_condition: z
    .object({ field_key: z.string(), op: z.string(), value: z.unknown() })
    .nullable(),
  deprecated: z.boolean(),
  description: z.string().nullable(),
  unit: z.enum(FIELD_UNITS).nullable(),
  phase: z.enum(FIELD_PHASES).nullable(),
  direction: z.enum(FIELD_DIRECTIONS).nullable(),
  category: z.string().nullable(),
  expected_range: z.object({ min: z.number(), max: z.number() }).nullable(),
  include_in_ai_context: z.boolean().nullable(),
  is_ordinal: z.boolean().nullable(),
});
export type FormFieldRow = z.infer<typeof formFieldRow>;

/**
 * One problem with a field definition. `field_key` + `path` is the position the builder
 * jumps to ("Next incomplete →"); `field_key` is null for a form-level problem.
 */
export const formIssue = z.object({
  field_key: z.string().nullable(),
  path: z.string(),
  message: z.string(),
});
export type FormIssue = z.infer<typeof formIssue>;

/** A form as it leaves the server. */
export const formRow = z.object({
  id: uuid,
  season_id: uuid,
  kind: formKind,
  name: z.string(),
  active_version_id: uuid.nullable(),
  timer_config: timerConfig,
  created_at: z.string(),
  updated_at: z.string(),
});
export type FormRowOutput = z.infer<typeof formRow>;

// ---------------------------------------------------------------------------------------
// Forms and versions.
// ---------------------------------------------------------------------------------------

/** One match form and one super form per season; a second of a kind is a conflict. */
export const createFormInput = z
  .object({ season_id: uuid, kind: formKind, name: formName })
  .strict();
export type CreateFormInput = z.input<typeof createFormInput>;

/** The new form and its empty draft version 1. */
export const createFormOutput = z.object({ id: uuid, draft_version_id: uuid });
export type CreateFormOutput = z.infer<typeof createFormOutput>;

/** Form-level, in place, no new version: the name and the match timer (SPEC-FINAL 8.4). */
export const updateFormInput = z
  .object({ form_id: uuid, name: formName.optional(), timer_config: timerConfig.optional() })
  .strict()
  .refine((value) => value.name !== undefined || value.timer_config !== undefined, {
    message: 'give a new name or match timer',
  });
export type UpdateFormInput = z.input<typeof updateFormInput>;

/**
 * The version's whole set of LIVE fields, in any order (`display_order` orders them). A
 * field the version has that is absent here is removed: deleted from a draft it was born
 * in, otherwise kept and marked deprecated.
 */
export const saveDraftFieldsInput = z
  .object({ form_version_id: uuid, fields: z.array(formFieldInput).max(FORM_FIELDS_MAX) })
  .strict();
export type SaveDraftFieldsInput = z.input<typeof saveDraftFieldsInput>;

/**
 * `form_version_id` is the version written: the target, or the draft a structural change
 * on a published version forked (`new_version_id`, otherwise null). `fields` are that
 * version's fields after the save, deprecated ones included, with their ids. `incomplete`
 * lists the fields still missing their meaning; a draft saves with them, publish waits.
 */
export const saveDraftFieldsOutput = z.object({
  form_version_id: uuid,
  new_version_id: uuid.nullable(),
  version_no: z.number().int(),
  fields: z.array(formFieldRow),
  incomplete: z.array(formIssue),
});
export type SaveDraftFieldsOutput = z.infer<typeof saveDraftFieldsOutput>;

export const publishFormVersionInput = z.object({ form_version_id: uuid }).strict();
export type PublishFormVersionInput = z.input<typeof publishFormVersionInput>;

/** `active_version_id` is the form's after the publish: this version when it is the newest. */
export const publishFormVersionOutput = z.object({
  form_version_id: uuid,
  published_at: z.string(),
  active_version_id: uuid.nullable(),
});
export type PublishFormVersionOutput = z.infer<typeof publishFormVersionOutput>;

export const restoreFormVersionInput = z.object({ form_version_id: uuid }).strict();
export type RestoreFormVersionInput = z.input<typeof restoreFormVersionInput>;

export const restoreFormVersionOutput = z.object({ active_version_id: uuid });
export type RestoreFormVersionOutput = z.infer<typeof restoreFormVersionOutput>;

export const deleteFormVersionInput = z.object({ form_version_id: uuid }).strict();
export type DeleteFormVersionInput = z.input<typeof deleteFormVersionInput>;

export const deleteFormVersionOutput = z.object({ deleted: z.literal(true) });
export type DeleteFormVersionOutput = z.infer<typeof deleteFormVersionOutput>;

/**
 * SPEC-FINAL 5.1 (v1.22): a cascade, behind a warning naming the versions and the entries
 * it removes. `dry_run: true` answers those counts and deletes nothing. The typed
 * confirmation ("delete match form") is the client's.
 */
export const deleteFormInput = z
  .object({ form_id: uuid, dry_run: z.boolean().default(false) })
  .strict();
export type DeleteFormInput = z.input<typeof deleteFormInput>;

/** `entries` counts every entry bound to any of the form's versions, soft-deleted ones too. */
export const deleteFormOutput = z.object({
  versions: z.number().int(),
  entries: z.number().int(),
  deleted: z.boolean(),
});
export type DeleteFormOutput = z.infer<typeof deleteFormOutput>;

// ---------------------------------------------------------------------------------------
// Export and import (SPEC-FINAL 5.1, v1.22).
// ---------------------------------------------------------------------------------------

/** A scoring rule of a portable definition, keyed by field key (SPEC-FINAL 3.4). */
export const definitionScoringRule = z
  .object({
    field_key: z.string().min(1),
    points: z.number().min(0),
    option_points: z.record(z.number().min(0)).nullable().default(null),
  })
  .strict();
export type DefinitionScoringRule = z.output<typeof definitionScoringRule>;

/**
 * The portable definition `exportForm` returns and `importForm` takes: no ids, no season,
 * no entries, no other versions, no users or events. `fields` are one version's LIVE
 * fields in display order.
 */
export const formDefinition = z
  .object({
    format: z.literal(FORM_DEFINITION_FORMAT),
    kind: formKind,
    name: formName,
    timer_config: timerConfig,
    fields: z.array(formFieldDraft).max(FORM_FIELDS_MAX),
    scoring_rules: z.array(definitionScoringRule).max(FORM_FIELDS_MAX),
  })
  .strict();
export type FormDefinition = z.output<typeof formDefinition>;

/** Default version: the draft if there is one, else the active one. Nothing else exports. */
export const exportFormInput = z
  .object({ form_id: uuid, form_version_id: uuid.optional() })
  .strict();
export type ExportFormInput = z.input<typeof exportFormInput>;

/** Saves one version's definition into Exports for FORM_EXPORT_TTL_MS. */
export const saveFormExportInput = z.object({ form_id: uuid, form_version_id: uuid }).strict();
export type SaveFormExportInput = z.input<typeof saveFormExportInput>;

/**
 * One saved export, as the Exports picker lists it. `form_id` is null once its form is
 * deleted. `expires_in_seconds` is measured against the server's clock at answer time.
 */
export const exportSummary = z.object({
  id: uuid,
  form_id: uuid.nullable(),
  kind: formKind,
  label: z.string(),
  field_count: z.number().int(),
  created_by: z.object({ id: uuid, full_name: z.string() }),
  created_at: z.string(),
  expires_at: z.string(),
  expires_in_seconds: z.number().int(),
});
export type ExportSummary = z.infer<typeof exportSummary>;

/**
 * Into the season's form of `definition.kind`: a new form (draft v1, with the definition's
 * name, timer and scoring) when there is none, else the form's draft — replaced, or forked
 * from the newest version — leaving its name, timer and scoring untouched. `form_id`, when
 * given, must be that form.
 */
export const importFormInput = z
  .object({ season_id: uuid, definition: formDefinition, form_id: uuid.optional() })
  .strict();
export type ImportFormInput = z.input<typeof importFormInput>;

export const importFormOutput = z.object({
  form_id: uuid,
  draft_version_id: uuid,
  created: z.boolean(),
});
export type ImportFormOutput = z.infer<typeof importFormOutput>;
