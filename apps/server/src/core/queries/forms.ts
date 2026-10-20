import {
  AppError,
  FORM_EXPORT_TTL_MS,
  assertCan,
  countDataFields,
  formDefinition,
  getFormDictionaryInput,
  getFormExportInput,
  getFormInput,
  getFormVersionInput,
  listFormExportsInput,
  listFormsInput,
  selectOptions,
  type Caller,
  type DictionaryField,
  type FormDefinition,
  type FormFieldDefinition,
  type GetFormDictionaryInput,
  type GetFormDictionaryOutput,
  type GetFormExportInput,
  type GetFormExportOutput,
  type GetFormInput,
  type GetFormOutput,
  type GetFormVersionInput,
  type GetFormVersionOutput,
  type ListFormExportsInput,
  type ListFormExportsOutput,
  type ListFormsInput,
  type ListFormsOutput,
  type ScoringRuleRow,
  type UserRef,
  type VersionSummary,
} from '@frc/shared';
import {
  formOrNotFound,
  toExportSummary,
  toFieldRow,
  toFormRow,
  versionOrNotFound,
} from '../commands/forms.js';
import { toScoringRuleRow } from '../commands/scoring.js';
import { parseInput } from '../commands/users.js';
import type { StoredForm, StoredFormVersion, UseCaseContext } from '../context.js';
import { seasonOrNotFound } from '../seasonRows.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  getFormDictionaryInput,
  getFormDictionaryOutput,
  getFormExportInput,
  getFormExportOutput,
  getFormInput,
  getFormOutput,
  getFormVersionInput,
  getFormVersionOutput,
  listFormExportsInput,
  listFormExportsOutput,
  listFormsInput,
  listFormsOutput,
} from '@frc/shared';

/*
 * Task 1.28: the form read queries. listForms, getForm, getFormVersion and getFormDictionary
 * are QUERIES in the Appendix C sense: any authenticated caller, a `service` caller
 * included, so none of them gates on `can()` (see packages/shared/src/auth/permissions.ts).
 * listFormExports and getFormExport read the admin's Exports and are admin only, like
 * 1.27's exportForm: they refuse a service caller through `assertCan`.
 */

// ---------------------------------------------------------------------------------------
// Version summaries: the forms list's timeline (design 13-forms).
// ---------------------------------------------------------------------------------------

/** The user refs of every `updated_by`, in ONE batched read. */
async function userRefs(
  ctx: UseCaseContext,
  ids: (string | null)[],
): Promise<Map<string, UserRef>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();
  const found = await ctx.store.listUserNames(wanted);
  return new Map(found.map((u) => [u.id, { id: u.id, full_name: u.full_name }]));
}

type Summarised = { summary: VersionSummary; fields: FormFieldDefinition[] };

/**
 * One summary per version, in the order given. One `getFormFields` per version, one batch
 * of live entry counts, one user read. The effective lock (task 1.27, decision E) is
 * `is_locked || any bound entry`, soft-deleted ones included, so a version with no live
 * entry and no stamp is asked once more for its total.
 */
async function summarise(
  ctx: UseCaseContext,
  form: StoredForm,
  versions: StoredFormVersion[],
): Promise<Summarised[]> {
  const live = await ctx.store.countLiveEntriesByFormVersions(versions.map((v) => v.id));
  const users = await userRefs(
    ctx,
    versions.map((v) => v.updated_by ?? null),
  );
  const out: Summarised[] = [];
  for (const version of versions) {
    const fields = await ctx.store.getFormFields(version.id);
    const entryCount = live.get(version.id) ?? 0;
    const locked =
      version.is_locked ||
      entryCount > 0 ||
      (await ctx.store.countEntriesByFormVersion(version.id)) > 0;
    const by = version.updated_by ?? null;
    out.push({
      fields,
      summary: {
        id: version.id,
        version_no: version.version_no,
        status: version.published_at === null ? 'draft' : 'published',
        published_at: version.published_at ?? null,
        is_active: version.id === form.active_version_id,
        is_locked: locked,
        field_count: countDataFields(fields),
        entry_count: entryCount,
        updated_at: version.updated_at,
        updated_by: by === null ? null : (users.get(by) ?? { id: by, full_name: '' }),
      },
    });
  }
  return out;
}

/** Every version of the form, newest first, summarised. */
async function versionsNewestFirst(
  ctx: UseCaseContext,
  form: StoredForm,
): Promise<VersionSummary[]> {
  const versions = (await ctx.store.listFormVersions(form.id)).sort(
    (a, b) => b.version_no - a.version_no,
  );
  return (await summarise(ctx, form, versions)).map((s) => s.summary);
}

/** The form's scoring rules by field key. */
async function rulesByKey(
  ctx: UseCaseContext,
  formId: string,
): Promise<Map<string, ScoringRuleRow>> {
  const rules = await ctx.store.getScoringRules(formId);
  return new Map(rules.map((r) => [r.field_key, toScoringRuleRow(r)]));
}

// ---------------------------------------------------------------------------------------
// The queries.
// ---------------------------------------------------------------------------------------

/**
 * The forms list (SPEC-FINAL 5.9, v1.21; design 13-forms): the season's match and super
 * forms, in that order, each with its versions newest first. A missing form is absent.
 */
export async function listForms(
  caller: Caller,
  input: ListFormsInput,
  ctx: UseCaseContext,
): Promise<ListFormsOutput> {
  void caller; // a query: every role, and a service caller, may read it
  const { season_id } = parseInput(listFormsInput, input);
  await seasonOrNotFound(ctx, season_id);
  const forms: ListFormsOutput['forms'] = [];
  for (const kind of ['match', 'super'] as const) {
    const form = await ctx.store.getFormByKind(season_id, kind);
    if (!form) continue;
    forms.push({
      id: form.id,
      kind: form.kind,
      name: form.name,
      active_version_id: form.active_version_id ?? null,
      updated_at: form.updated_at,
      versions: await versionsNewestFirst(ctx, form),
    });
  }
  return { season_id, forms };
}

/** One form's row and its versions, newest first. */
export async function getForm(
  caller: Caller,
  input: GetFormInput,
  ctx: UseCaseContext,
): Promise<GetFormOutput> {
  void caller; // a query: every role, and a service caller, may read it
  const { form_id } = parseInput(getFormInput, input);
  const form = await formOrNotFound(ctx, form_id);
  return { ...toFormRow(form), versions: await versionsNewestFirst(ctx, form) };
}

/**
 * One version for the builder: its summary, and every field in display order, deprecated
 * ones included and flagged, each with its points from the form's scoring rules.
 */
export async function getFormVersion(
  caller: Caller,
  input: GetFormVersionInput,
  ctx: UseCaseContext,
): Promise<GetFormVersionOutput> {
  void caller; // a query: every role, and a service caller, may read it
  const { form_version_id } = parseInput(getFormVersionInput, input);
  const version = await versionOrNotFound(ctx, form_version_id);
  const form = await formOrNotFound(ctx, version.form_id);
  const [{ summary, fields }] = (await summarise(ctx, form, [version])) as [Summarised];
  const rules = await rulesByKey(ctx, form.id);
  return {
    ...summary,
    form_id: form.id,
    fields: fields.map((field) => {
      const rule = rules.get(field.key);
      return {
        ...toFieldRow(field),
        points: rule?.points ?? null,
        option_points: rule?.option_points ?? null,
      };
    }),
  };
}

/**
 * The machine-readable field dictionary (SPEC-FINAL 16.8, obligation 1): the ACTIVE
 * version's live data fields in display order — no sections, no deprecated fields — with
 * their meaning, options and points. No active version → no fields.
 */
export async function getFormDictionary(
  caller: Caller,
  input: GetFormDictionaryInput,
  ctx: UseCaseContext,
): Promise<GetFormDictionaryOutput> {
  void caller; // a query: every role, and a service caller, may read it
  const { form_id } = parseInput(getFormDictionaryInput, input);
  const form = await formOrNotFound(ctx, form_id);
  const activeId = form.active_version_id ?? null;
  const active = activeId === null ? null : await ctx.store.getFormVersion(activeId);
  if (!active) return { form_id: form.id, version_no: null, fields: [] };
  const rules = await rulesByKey(ctx, form.id);
  const fields = (await ctx.store.getFormFields(active.id)).filter(
    (f) => !f.deprecated && f.type !== 'section',
  );
  return {
    form_id: form.id,
    version_no: active.version_no,
    fields: fields.map((field): DictionaryField => {
      const rule = rules.get(field.key);
      const isSelect = field.type === 'single_select' || field.type === 'multi_select';
      return {
        key: field.key,
        label: field.label,
        description: field.description ?? null,
        type: field.type,
        unit: field.unit ?? null,
        phase: field.phase ?? null,
        direction: field.direction ?? null,
        category: field.category ?? null,
        expected_range: field.expected_range ?? null,
        include_in_ai_context: field.include_in_ai_context ?? null,
        is_ordinal: field.is_ordinal ?? null,
        options: isSelect
          ? selectOptions(field).map((o) => ({ value: o.value, label: o.label }))
          : null,
        points: rule?.points ?? null,
        option_points: rule?.option_points ?? null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------
// Saved exports (SPEC-FINAL 5.1, v1.22). Admin only.
// ---------------------------------------------------------------------------------------

const expired = (createdAt: string, now: Date): boolean =>
  Date.parse(createdAt) + FORM_EXPORT_TTL_MS <= now.getTime();

/**
 * The Exports picker, newest first. Every export older than 24 hours is deleted first —
 * "whenever exports are listed or saved, no cron" (SPEC-FINAL 3.3).
 */
export async function listFormExports(
  caller: Caller,
  input: ListFormExportsInput,
  ctx: UseCaseContext,
): Promise<ListFormExportsOutput> {
  assertCan(caller, 'manage_forms');
  parseInput(listFormExportsInput, input);
  const now = ctx.now();
  await ctx.store.purgeFormExports(new Date(now.getTime() - FORM_EXPORT_TTL_MS));
  const rows = (await ctx.store.listFormExports()).filter((r) => !expired(r.created_at, now));
  const users = await userRefs(
    ctx,
    rows.map((r) => r.created_by),
  );
  return {
    exports: rows.map((row) =>
      toExportSummary(row, users.get(row.created_by) ?? { id: row.created_by, full_name: '' }, now),
    ),
  };
}

/** One saved export with its definition, for importForm. Older than 24 hours → not-found. */
export async function getFormExport(
  caller: Caller,
  input: GetFormExportInput,
  ctx: UseCaseContext,
): Promise<GetFormExportOutput> {
  assertCan(caller, 'manage_forms');
  const { export_id } = parseInput(getFormExportInput, input);
  const now = ctx.now();
  const row = await ctx.store.getFormExport(export_id);
  if (!row || expired(row.created_at, now)) {
    throw new AppError('not-found', 'that export does not exist; exports are kept 24 hours', {
      export_id,
    });
  }
  const users = await userRefs(ctx, [row.created_by]);
  return {
    ...toExportSummary(
      row,
      users.get(row.created_by) ?? { id: row.created_by, full_name: '' },
      now,
    ),
    definition: formDefinition.parse(row.definition) as FormDefinition,
  };
}
