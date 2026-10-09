import {
  AppError,
  FIELD_TYPE_CONFIG,
  FORM_DEFINITION_FORMAT,
  FORM_EXPORT_TTL_MS,
  assertCan,
  countDataFields,
  createFormInput,
  deleteFormInput,
  deleteFormVersionInput,
  exportFormInput,
  formDefinition,
  importFormInput,
  isStructuralChange,
  isUser,
  publishFormVersionInput,
  restoreFormVersionInput,
  saveDraftFieldsInput,
  saveFormExportInput,
  updateFormInput,
  validateExpr,
  validateFieldDefinition,
  validateScoringRules,
  validateVisibilityCondition,
  type Caller,
  type CreateFormInput,
  type CreateFormOutput,
  type DeleteFormInput,
  type DeleteFormOutput,
  type DeleteFormVersionInput,
  type DeleteFormVersionOutput,
  type ExportFormInput,
  type ExportSummary,
  type Expr,
  type FieldDraft,
  type FormDefinition,
  type FormFieldDefinition,
  type FormFieldDraft,
  type FormFieldRow,
  type FormIssue,
  type FormRowOutput,
  type ImportFormInput,
  type ImportFormOutput,
  type PublishFormVersionInput,
  type PublishFormVersionOutput,
  type RestoreFormVersionInput,
  type RestoreFormVersionOutput,
  type SaveDraftFieldsInput,
  type SaveDraftFieldsOutput,
  type SaveFormExportInput,
  type TimerConfig,
  type UpdateFormInput,
  type VisibilityCondition,
} from '@frc/shared';
import type { z } from 'zod';
import type {
  StoredForm,
  StoredFormExport,
  StoredFormVersion,
  UseCaseContext,
} from '../context.js';
import { pgCode, seasonOrNotFound } from '../seasonRows.js';
import { parseInput } from './users.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  createFormInput,
  deleteFormInput,
  deleteFormVersionInput,
  exportFormInput,
  formDefinition,
  importFormInput,
  publishFormVersionInput,
  restoreFormVersionInput,
  saveDraftFieldsInput,
  saveFormExportInput,
  updateFormInput,
} from '@frc/shared';

/*
 * Task 1.27: the form builder's server half (SPEC-FINAL 3.3, 5.1, 8.4). Every use case is
 * admin only (`manage_forms`, which also refuses a service caller) and online only.
 *
 * Versioning: a version is a draft until published. A structural change (isStructuralChange)
 * to a PUBLISHED version forks a new draft; anything else is written in place and creates no
 * version. A draft takes every edit in place. A saved field's key never changes.
 */

type RequestField = z.output<typeof saveDraftFieldsInput>['fields'][number];

/** The `form_fields` columns a definition carries: everything but id, version, timestamps. */
const DRAFT_COLUMNS = [
  'key',
  'label',
  'help_text',
  'type',
  'section',
  'display_order',
  'required',
  'default_value',
  'config',
  'visibility_condition',
  'description',
  'unit',
  'phase',
  'direction',
  'category',
  'expected_range',
  'include_in_ai_context',
  'is_ordinal',
] as const;

/**
 * The columns an in-place save rewrites on a published version (task 1.27, step 5). Never
 * `key`, `type` or `deprecated`: those are structural, and structure forks.
 */
const IN_PLACE_COLUMNS = [
  'label',
  'help_text',
  'config',
  'expected_range',
  'display_order',
  'section',
  'description',
  'unit',
  'phase',
  'direction',
  'category',
  'include_in_ai_context',
  'is_ordinal',
  'required',
  'default_value',
  'visibility_condition',
] as const;

/** Issues on these paths are "needs meaning": a draft saves with them, publish waits. */
const MEANING_PATHS: ReadonlySet<string> = new Set(['description', 'unit', 'phase', 'direction']);

function userIdOf(caller: Caller): string {
  // assertCan has already refused anything but an admin user; this narrows the type.
  if (!isUser(caller)) throw new AppError('forbidden', 'a service caller may not edit forms');
  return caller.userId;
}

// ---------------------------------------------------------------------------------------
// Rows and lookups.
// ---------------------------------------------------------------------------------------

export function toFormRow(row: StoredForm): FormRowOutput {
  return {
    id: row.id,
    season_id: row.season_id,
    kind: row.kind,
    name: row.name,
    active_version_id: row.active_version_id ?? null,
    timer_config: row.timer_config as TimerConfig,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Field by field, so a column added later does not leak by default. */
export function toFieldRow(field: FormFieldDefinition): FormFieldRow {
  const row = field as FormFieldDefinition & { form_version_id: string };
  return {
    id: row.id,
    form_version_id: row.form_version_id,
    key: row.key,
    label: row.label,
    help_text: row.help_text ?? null,
    type: row.type,
    section: row.section ?? null,
    display_order: row.display_order,
    required: row.required,
    default_value: row.default_value ?? null,
    config: row.config ?? {},
    visibility_condition: row.visibility_condition ?? null,
    deprecated: row.deprecated,
    description: row.description ?? null,
    unit: row.unit ?? null,
    phase: row.phase ?? null,
    direction: row.direction ?? null,
    category: row.category ?? null,
    expected_range: row.expected_range ?? null,
    include_in_ai_context: row.include_in_ai_context ?? null,
    is_ordinal: row.is_ordinal ?? null,
  };
}

/** The definition columns of a field, without its id, version or deprecated flag. */
function draftColumns(field: FieldDraft | FormFieldDefinition): FormFieldDraft {
  const out: Record<string, unknown> = {};
  for (const column of DRAFT_COLUMNS) out[column] = field[column] ?? null;
  out.config = field.config ?? {};
  out.required = field.required ?? false;
  return out as FormFieldDraft;
}

/** A field as the request names it, as a FieldDraft: live, with every column present. */
function toDraft(field: RequestField | FormFieldDraft): FieldDraft {
  return {
    key: field.key,
    label: field.label,
    help_text: field.help_text ?? null,
    type: field.type,
    section: field.section ?? null,
    display_order: field.display_order,
    required: field.required ?? false,
    default_value: field.default_value ?? null,
    config: field.config ?? {},
    visibility_condition: (field.visibility_condition ?? null) as VisibilityCondition | null,
    deprecated: false,
    description: field.description ?? null,
    unit: field.unit ?? null,
    phase: field.phase ?? null,
    direction: field.direction ?? null,
    category: field.category ?? null,
    expected_range: field.expected_range ?? null,
    include_in_ai_context: field.include_in_ai_context ?? null,
    is_ordinal: field.is_ordinal ?? null,
  };
}

export async function formOrNotFound(ctx: UseCaseContext, id: string): Promise<StoredForm> {
  const form = await ctx.store.getForm(id);
  if (!form) {
    throw new AppError('not-found', 'that form does not exist; it may have been deleted', {
      form_id: id,
    });
  }
  return form;
}

export async function versionOrNotFound(
  ctx: UseCaseContext,
  id: string,
): Promise<StoredFormVersion> {
  const version = await ctx.store.getFormVersion(id);
  if (!version) {
    throw new AppError('not-found', 'that form version does not exist; it may have been deleted', {
      form_version_id: id,
    });
  }
  return version;
}

const newestOf = (versions: StoredFormVersion[]): StoredFormVersion | undefined =>
  [...versions].sort((a, b) => b.version_no - a.version_no)[0];

const draftOf = (versions: StoredFormVersion[]): StoredFormVersion | undefined =>
  versions.find((v) => v.published_at === null);

/** Stamps who last saved the version; the table's trigger bumps its updated_at. */
async function stamp(ctx: UseCaseContext, versionId: string, userId: string): Promise<void> {
  await ctx.store.updateFormVersion(versionId, { updated_by: userId });
}

/**
 * Task 1.27, decision E: the effective lock is `is_locked || entries > 0`. Nothing else sets
 * is_locked yet, so a save that finds entries bound to the version stamps it.
 */
async function stampLockIfBound(ctx: UseCaseContext, version: StoredFormVersion): Promise<void> {
  if (version.is_locked) return;
  if ((await ctx.store.countEntriesByFormVersion(version.id)) > 0) {
    await ctx.store.updateFormVersion(version.id, { is_locked: true });
  }
}

// ---------------------------------------------------------------------------------------
// Definition checks (task 1.27, decision D).
// ---------------------------------------------------------------------------------------

type Checked = { definition: FormIssue[]; incomplete: FormIssue[] };

/**
 * Every rule of a live field set. `incomplete` is a blank description, unit, phase or
 * direction: "needs meaning". Everything else — the key pattern, the config's shape, a
 * section with metadata, is_ordinal off a select, a visibility condition, a computed
 * expression — is a `definition` issue.
 */
function checkFields(live: FieldDraft[]): Checked {
  const definition: FormIssue[] = [];
  const incomplete: FormIssue[] = [];
  const siblings = live.map((f, i) => ({ id: `field-${i}`, ...f })) as FormFieldDefinition[];
  for (const field of siblings) {
    for (const issue of validateFieldDefinition(field)) {
      (MEANING_PATHS.has(issue.path) ? incomplete : definition).push({
        field_key: field.key,
        ...issue,
      });
    }
    for (const issue of validateVisibilityCondition(field, siblings)) {
      definition.push({ field_key: field.key, ...issue });
    }
    if (field.type === 'computed') {
      const config = FIELD_TYPE_CONFIG.computed.safeParse(field.config);
      const parsed = config.success
        ? (config.data as { expression: Expr | null; result_type: 'float' | 'string' })
        : null;
      if (parsed?.expression) {
        for (const issue of validateExpr(parsed.expression, siblings, parsed.result_type)) {
          definition.push({
            field_key: field.key,
            path: `config.${issue.path}`,
            message: issue.message,
          });
        }
      }
    }
  }
  return { definition, incomplete };
}

/** What publishing adds: a computed field needs its expression, and a form needs data. */
function publishOnlyIssues(live: FieldDraft[]): FormIssue[] {
  const issues: FormIssue[] = [];
  for (const field of live) {
    if (field.type !== 'computed') continue;
    const config = FIELD_TYPE_CONFIG.computed.safeParse(field.config);
    if (config.success && (config.data as { expression: Expr | null }).expression === null) {
      issues.push({
        field_key: field.key,
        path: 'config.expression',
        message: 'a computed field needs its expression before the form can be published',
      });
    }
  }
  if (!live.some((f) => f.type !== 'section')) {
    issues.push({
      field_key: null,
      path: 'fields',
      message: 'a form needs at least one data field before it can be published',
    });
  }
  return issues;
}

function definitionError(issues: FormIssue[]): AppError {
  const first = issues[0]!;
  const one = `${first.field_key ?? 'the form'}: ${first.message}`;
  const summary =
    issues.length === 1 ? one : `${issues.length} problems in the form definition; first, ${one}`;
  return new AppError('invalid', summary, { reason: 'invalid-definition', issues });
}

// ---------------------------------------------------------------------------------------
// Field identity (task 1.27, decision C; SPEC-FINAL 5.1, v1.20).
// ---------------------------------------------------------------------------------------

type Incoming = { id?: string | undefined; draft: FieldDraft };

/**
 * Which saved field each incoming field is, by these rules in this order:
 * 1. one key twice in a request is refused;
 * 2. an `id` must name a field of the target version — live, or deprecated (a revive) — and
 *    its key must not change: THE server-side guarantee that a saved field's key is never
 *    accepted as changed;
 * 3. without an id, a key equal to a live field of the target is that field;
 * 4. a key not live in the target but used before in this form comes back only with the
 *    type it had MOST RECENTLY (`lastType`: the newest version holding it); another type is
 *    `key-retired`. A deprecated row of the target with that key is that field, revived.
 * Answers key → the existing row's id, for the fields that matched one.
 */
function resolveIdentity(
  incoming: Incoming[],
  target: FormFieldDefinition[],
  lastType: ReadonlyMap<string, string>,
): Map<string, string> {
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  for (const { id, draft } of incoming) {
    if (seenKeys.has(draft.key)) {
      throw new AppError(
        'invalid',
        `two fields have the key '${draft.key}'; a key names one field`,
        {
          reason: 'duplicate-key',
          key: draft.key,
        },
      );
    }
    seenKeys.add(draft.key);
    if (id !== undefined) {
      if (seenIds.has(id)) {
        throw new AppError('invalid', 'two fields name the same saved field', {
          reason: 'duplicate-field-id',
          field_id: id,
        });
      }
      seenIds.add(id);
    }
  }

  const byId = new Map(target.map((f) => [f.id, f]));
  const liveByKey = new Map(target.filter((f) => !f.deprecated).map((f) => [f.key, f]));
  const deprecatedByKey = new Map(target.filter((f) => f.deprecated).map((f) => [f.key, f]));
  const assertRevivable = (draft: FieldDraft): void => {
    const was = lastType.get(draft.key);
    if (was !== undefined && was !== draft.type) {
      throw new AppError(
        'invalid',
        `the key '${draft.key}' was last used by a removed ${was} field of this form; bring it back as a ${was}, or give the new field another key`,
        { reason: 'key-retired', key: draft.key, last_type: was },
      );
    }
  };
  const matched = new Map<string, string>();
  for (const { id, draft } of incoming) {
    if (id !== undefined) {
      const saved = byId.get(id);
      if (!saved) {
        throw new AppError('invalid', 'a field names a saved field this version does not have', {
          reason: 'unknown-field-id',
          field_id: id,
        });
      }
      if (saved.key !== draft.key) {
        throw new AppError('invalid', "a saved field's key never changes", {
          reason: 'key-change',
          field_id: id,
          key_was: saved.key,
          key_now: draft.key,
        });
      }
      if (saved.deprecated) assertRevivable(draft);
      matched.set(draft.key, saved.id);
      continue;
    }
    const live = liveByKey.get(draft.key);
    if (live) {
      matched.set(draft.key, live.id);
      continue;
    }
    assertRevivable(draft);
    const removed = deprecatedByKey.get(draft.key);
    if (removed) matched.set(draft.key, removed.id);
  }
  return matched;
}

/** Recursively key-sorted JSON, so a jsonb round trip's key order is not a change. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function changed(row: Record<string, unknown>, existing: FormFieldDefinition | undefined): boolean {
  if (!existing) return true;
  const before = existing as unknown as Record<string, unknown>;
  return Object.keys(row).some((column) => stable(row[column]) !== stable(before[column]));
}

/** What every version of the form holds: its rows per version, and every key ever used. */
async function formHistory(
  ctx: UseCaseContext,
  versions: StoredFormVersion[],
): Promise<Map<string, FormFieldDefinition[]>> {
  const out = new Map<string, FormFieldDefinition[]>();
  for (const version of versions) out.set(version.id, await ctx.store.getFormFields(version.id));
  return out;
}

/** Every key ever used in the form → its type in the newest version holding it. */
function lastTypes(
  versions: StoredFormVersion[],
  byVersion: Map<string, FormFieldDefinition[]>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const version of [...versions].sort((a, b) => b.version_no - a.version_no)) {
    for (const field of byVersion.get(version.id) ?? []) {
      if (!out.has(field.key)) out.set(field.key, field.type);
    }
  }
  return out;
}

type Written = { version: StoredFormVersion; forked: boolean; incomplete: FormIssue[] };

/**
 * Creates draft `max(version_no) + 1` with `drafts` live and every other field of
 * `carriedFrom` carried over deprecated (SPEC-FINAL 5.1: deleting a field marks it
 * deprecated in the new version). Several writes: if a later one fails, the version row
 * just inserted is deleted again (its fields cascade) before the error is rethrown.
 */
async function fork(
  ctx: UseCaseContext,
  userId: string,
  form: StoredForm,
  versions: StoredFormVersion[],
  carriedFrom: FormFieldDefinition[],
  drafts: FieldDraft[],
): Promise<StoredFormVersion> {
  const versionNo = Math.max(0, ...versions.map((v) => v.version_no)) + 1;
  let created: StoredFormVersion;
  try {
    created = await ctx.store.insertFormVersion({
      id: crypto.randomUUID(),
      form_id: form.id,
      version_no: versionNo,
      updated_by: userId,
    });
  } catch (e) {
    if (pgCode(e) === '23505') {
      throw new AppError(
        'conflict',
        'another save just created a version of this form; reload it',
        {
          reason: 'version-race',
          form_id: form.id,
        },
      );
    }
    throw e;
  }
  try {
    const live = new Set(drafts.map((d) => d.key));
    const rows = [
      ...drafts.map((d) => ({ id: crypto.randomUUID(), ...draftColumns(d), deprecated: false })),
      ...carriedFrom
        .filter((f) => !live.has(f.key))
        .map((f) => ({ id: crypto.randomUUID(), ...draftColumns(f), deprecated: true })),
    ];
    await ctx.store.writeFormFields(created.id, rows, []);
  } catch (e) {
    // Compensate. If this delete fails too, an empty-or-partial draft is left behind: the
    // admin sees it as the form's draft and can delete it (it has no entries).
    await ctx.store.deleteFormVersion(created.id).catch(() => undefined);
    throw e;
  }
  return created;
}

/** One field an in-place save rewrote on a published version: before, and the row written. */
type InPlaceEdit = { existing: FormFieldDefinition; row: Record<string, unknown> };

/** The config keys that hold a list of `{value, label}` choices. */
const CHOICE_LISTS: ReadonlySet<string> = new Set(['options', 'event_types']);

const choiceValues = (list: unknown): string[] =>
  Array.isArray(list) ? list.map((o) => String((o as { value?: unknown } | null)?.value)) : [];

const choiceLabels = (list: unknown): Map<string, unknown> =>
  new Map(
    (Array.isArray(list) ? list : []).map((o) => [
      String((o as { value?: unknown } | null)?.value),
      (o as { label?: unknown } | null)?.label,
    ]),
  );

/**
 * The config an in-place fix leaves on the draft's twin: per top-level config key the save
 * changed, the published version's new value. A choice list the draft has reshaped (other
 * values, or another order) takes only the relabels, by value, so a choice the draft added
 * or dropped is never undone.
 */
function carryConfig(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  twin: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...twin };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (stable(before[key]) === stable(after[key])) continue;
    const reshaped =
      CHOICE_LISTS.has(key) &&
      Array.isArray(out[key]) &&
      stable(choiceValues(out[key])) !== stable(choiceValues(before[key]));
    if (reshaped) {
      const was = choiceLabels(before[key]);
      const now = choiceLabels(after[key]);
      out[key] = (out[key] as Record<string, unknown>[]).map((choice) => {
        const value = String(choice.value);
        return now.has(value) && stable(now.get(value)) !== stable(was.get(value))
          ? { ...choice, label: now.get(value) }
          : choice;
      });
    } else if (after[key] === undefined) {
      delete out[key];
    } else {
      out[key] = after[key];
    }
  }
  return out;
}

/**
 * Review #4: an in-place fix to a published version, carried onto the form's open draft in
 * the same save, so publishing the draft does not silently undo it. Only the in-place
 * columns this save CHANGED, only onto the draft's live field with the same key AND type;
 * every other column of the draft — its own edits — is left alone. Stamps the draft.
 */
async function carryToDraft(
  ctx: UseCaseContext,
  userId: string,
  draft: StoredFormVersion,
  draftFields: FormFieldDefinition[],
  edits: InPlaceEdit[],
): Promise<void> {
  const twins = new Map(draftFields.filter((f) => !f.deprecated).map((f) => [f.key, f]));
  const writes: Record<string, unknown>[] = [];
  for (const { existing, row } of edits) {
    const twin = twins.get(existing.key);
    if (!twin || twin.type !== existing.type) continue;
    const before = draftColumns(existing) as Record<string, unknown>;
    const next: Record<string, unknown> = { id: twin.id, ...draftColumns(twin), deprecated: false };
    for (const column of IN_PLACE_COLUMNS) {
      if (stable(row[column]) === stable(before[column])) continue;
      next[column] =
        column === 'config'
          ? carryConfig(
              before.config as Record<string, unknown>,
              row.config as Record<string, unknown>,
              next.config as Record<string, unknown>,
            )
          : row[column];
    }
    if (changed(next, twin)) writes.push(next);
  }
  if (writes.length === 0) return;
  await ctx.store.writeFormFields(draft.id, writes, []);
  await stamp(ctx, draft.id, userId);
}

/**
 * The heart of saveDraftFields and of an import into an existing form: makes `incoming`
 * the live field set of `target` — in place, or by forking a new draft — or refuses it.
 * `target` null (a form with no version left) or `alwaysFork` (an import with no draft)
 * forks from `target`'s fields whatever the change.
 */
async function writeFieldSet(
  ctx: UseCaseContext,
  userId: string,
  form: StoredForm,
  target: StoredFormVersion | null,
  incoming: Incoming[],
  alwaysFork = false,
): Promise<Written> {
  const versions = await ctx.store.listFormVersions(form.id);
  const history = await formHistory(ctx, versions);
  const current = target ? (history.get(target.id) ?? []) : [];
  const matched = resolveIdentity(incoming, current, lastTypes(versions, history));
  const drafts = incoming.map((f) => f.draft);
  const { definition, incomplete } = checkFields(drafts);

  // An unpublished draft takes every edit in place.
  if (target && target.published_at === null && !alwaysFork) {
    if (definition.length > 0) throw definitionError(definition);
    await stampLockIfBound(ctx, target);
    const byKey = new Map(current.map((f) => [f.key, f]));
    // A revived key's row is matched to its deprecated id, so it comes back as itself.
    const rows: Record<string, unknown>[] = drafts.map((d) => ({
      id: matched.get(d.key) ?? crypto.randomUUID(),
      ...draftColumns(d),
      deprecated: false,
    }));
    const wanted = new Set(drafts.map((d) => d.key));
    for (const field of current) {
      if (field.deprecated || wanted.has(field.key)) continue;
      // Removed: deprecated, never deleted, whether born in this draft or carried. Devices
      // pull draft rows, and the delta pull cannot see a hard delete (review #3).
      rows.push({ id: field.id, ...draftColumns(field), deprecated: true });
    }
    const writes = rows.filter((row) => changed(row, byKey.get(String(row.key))));
    await ctx.store.writeFormFields(target.id, writes, []);
    await stamp(ctx, target.id, userId);
    return { version: target, forked: false, incomplete };
  }

  // A published version: structure forks, everything else is written in place.
  if (target && !alwaysFork && !isStructuralChange(current, drafts)) {
    const all = [...definition, ...incomplete];
    if (all.length > 0) throw definitionError(all);
    await stampLockIfBound(ctx, target);
    const byKey = new Map(current.filter((f) => !f.deprecated).map((f) => [f.key, f]));
    const writes: Record<string, unknown>[] = [];
    const edits: InPlaceEdit[] = [];
    for (const draft of drafts) {
      const existing = byKey.get(draft.key)!; // non-structural: every key is live already
      const row: Record<string, unknown> = {
        id: existing.id,
        ...draftColumns(existing),
        deprecated: false,
      };
      for (const column of IN_PLACE_COLUMNS) row[column] = draftColumns(draft)[column];
      if (changed(row, existing)) {
        writes.push(row);
        edits.push({ existing, row });
      }
    }
    await ctx.store.writeFormFields(target.id, writes, []);
    await stamp(ctx, target.id, userId);
    const open = draftOf(versions);
    if (open && edits.length > 0) {
      await carryToDraft(ctx, userId, open, history.get(open.id) ?? [], edits);
    }
    return { version: target, forked: false, incomplete };
  }

  if (definition.length > 0) throw definitionError(definition);
  const draft = draftOf(versions);
  if (draft) {
    throw new AppError('conflict', `draft v${draft.version_no} already exists; edit it`, {
      reason: 'draft-exists',
      draft_version_id: draft.id,
      version_no: draft.version_no,
    });
  }
  if (target) await stampLockIfBound(ctx, target);
  const created = await fork(ctx, userId, form, versions, current, drafts);
  return { version: created, forked: true, incomplete };
}

async function savedOutput(ctx: UseCaseContext, written: Written): Promise<SaveDraftFieldsOutput> {
  const fields = await ctx.store.getFormFields(written.version.id);
  // Read back: the save's stamp moved updated_at, and the builder's next base_updated_at is it.
  const after = await ctx.store.getFormVersion(written.version.id);
  return {
    form_version_id: written.version.id,
    new_version_id: written.forked ? written.version.id : null,
    version_no: written.version.version_no,
    updated_at: after?.updated_at ?? written.version.updated_at,
    fields: fields.map(toFieldRow),
    incomplete: written.incomplete,
  };
}

// ---------------------------------------------------------------------------------------
// The use cases.
// ---------------------------------------------------------------------------------------

/** SPEC-FINAL 3.3. Admin only. One form of each kind per season; it starts as empty draft v1. */
export async function createForm(
  caller: Caller,
  input: CreateFormInput,
  ctx: UseCaseContext,
): Promise<CreateFormOutput> {
  assertCan(caller, 'manage_forms');
  const userId = userIdOf(caller);
  const parsed = parseInput(createFormInput, input);
  await seasonOrNotFound(ctx, parsed.season_id);
  const taken = () =>
    new AppError('conflict', `this season already has a ${parsed.kind} form`, {
      reason: 'form-exists',
      kind: parsed.kind,
    });
  if (await ctx.store.getFormByKind(parsed.season_id, parsed.kind)) throw taken();

  let form: StoredForm;
  try {
    form = await ctx.store.insertForm({
      id: crypto.randomUUID(),
      season_id: parsed.season_id,
      kind: parsed.kind,
      name: parsed.name,
    });
  } catch (e) {
    if (pgCode(e) === '23505') throw taken();
    throw e;
  }
  try {
    const draft = await ctx.store.insertFormVersion({
      id: crypto.randomUUID(),
      form_id: form.id,
      version_no: 1,
      updated_by: userId,
    });
    return { id: form.id, draft_version_id: draft.id };
  } catch (e) {
    await ctx.store.deleteFormCascade(form.id).catch(() => undefined);
    throw e;
  }
}

/**
 * Form-level edits, in place, no new version: the name and the match timer (SPEC-FINAL
 * 8.4). Stamps `updated_by` on the form's draft if it has one, else its active version.
 */
export async function updateForm(
  caller: Caller,
  input: UpdateFormInput,
  ctx: UseCaseContext,
): Promise<FormRowOutput> {
  assertCan(caller, 'manage_forms');
  const userId = userIdOf(caller);
  const parsed = parseInput(updateFormInput, input);
  const form = await formOrNotFound(ctx, parsed.form_id);
  const patch: Record<string, unknown> = {};
  if (parsed.name !== undefined) patch.name = parsed.name;
  if (parsed.timer_config !== undefined) patch.timer_config = parsed.timer_config;
  const row = await ctx.store.updateForm(form.id, patch);
  const versions = await ctx.store.listFormVersions(form.id);
  const stamped = draftOf(versions) ?? versions.find((v) => v.id === form.active_version_id);
  if (stamped) await stamp(ctx, stamped.id, userId);
  return toFormRow(row);
}

/**
 * Makes `fields` the version's live field set (SPEC-FINAL 5.1). A draft is written in place
 * and saves with fields still missing their meaning (`incomplete`). A published version takes
 * in-place edits in place; a structural change to it forks a new draft (`new_version_id`),
 * refused while another draft exists. With `base_updated_at`, a save over a version someone
 * else has saved since is refused before any write (review #10).
 */
export async function saveDraftFields(
  caller: Caller,
  input: SaveDraftFieldsInput,
  ctx: UseCaseContext,
): Promise<SaveDraftFieldsOutput> {
  assertCan(caller, 'manage_forms');
  const userId = userIdOf(caller);
  const parsed = parseInput(saveDraftFieldsInput, input);
  const target = await versionOrNotFound(ctx, parsed.form_version_id);
  // Compared as instants, not strings: the same moment may come back in another notation.
  if (
    parsed.base_updated_at !== undefined &&
    Date.parse(parsed.base_updated_at) !== Date.parse(target.updated_at)
  ) {
    throw new AppError('conflict', 'someone else saved this version; reload it', {
      reason: 'stale-version',
      updated_at: target.updated_at,
    });
  }
  const form = await formOrNotFound(ctx, target.form_id);
  const incoming = parsed.fields.map((f) => ({ id: f.id, draft: toDraft(f) }));
  return savedOutput(ctx, await writeFieldSet(ctx, userId, form, target, incoming));
}

/**
 * Stamps `published_at` and, when the version is the form's newest, makes it the active
 * version. Refused while any live field misses its meaning or breaks a rule, a computed
 * field has no expression, or the version has no data field.
 */
export async function publishFormVersion(
  caller: Caller,
  input: PublishFormVersionInput,
  ctx: UseCaseContext,
): Promise<PublishFormVersionOutput> {
  assertCan(caller, 'manage_forms');
  const userId = userIdOf(caller);
  const parsed = parseInput(publishFormVersionInput, input);
  const version = await versionOrNotFound(ctx, parsed.form_version_id);
  const form = await formOrNotFound(ctx, version.form_id);
  if (version.published_at !== null) {
    throw new AppError('invalid', `v${version.version_no} is already published`, {
      reason: 'already-published',
    });
  }
  const live = (await ctx.store.getFormFields(version.id)).filter((f) => !f.deprecated);
  const { definition, incomplete } = checkFields(live);
  const issues = [...definition, ...incomplete, ...publishOnlyIssues(live)];
  if (issues.length > 0) throw definitionError(issues);

  const publishedAt = ctx.now().toISOString();
  await ctx.store.updateFormVersion(version.id, { published_at: publishedAt, updated_by: userId });
  let activeVersionId = form.active_version_id ?? null;
  const newest = newestOf(await ctx.store.listFormVersions(form.id));
  if (newest?.id === version.id) {
    await ctx.store.updateForm(form.id, { active_version_id: version.id });
    activeVersionId = version.id;
  }
  return {
    form_version_id: version.id,
    published_at: publishedAt,
    active_version_id: activeVersionId,
  };
}

/** Points the form at an older PUBLISHED version, creating no version. */
export async function restoreFormVersion(
  caller: Caller,
  input: RestoreFormVersionInput,
  ctx: UseCaseContext,
): Promise<RestoreFormVersionOutput> {
  assertCan(caller, 'manage_forms');
  const userId = userIdOf(caller);
  const parsed = parseInput(restoreFormVersionInput, input);
  const version = await versionOrNotFound(ctx, parsed.form_version_id);
  const form = await formOrNotFound(ctx, version.form_id);
  if (version.published_at === null) {
    throw new AppError('invalid', 'a draft cannot be restored; publish it instead', {
      reason: 'not-published',
    });
  }
  await ctx.store.updateForm(form.id, { active_version_id: version.id });
  await stamp(ctx, version.id, userId);
  return { active_version_id: version.id };
}

/**
 * Deletes one DRAFT. Blocked while any entry is bound to it, whatever the confirmation
 * (SPEC-FINAL 3.3). A published version is refused whatever the server's entry count: a
 * device may still hold queued entries for any published version it has (3.3; review #2),
 * so the whole form, through deleteForm, is the only way one goes. `active-version` is kept
 * as a backstop for a form row pointing at a draft, which no use case writes.
 */
export async function deleteFormVersion(
  caller: Caller,
  input: DeleteFormVersionInput,
  ctx: UseCaseContext,
): Promise<DeleteFormVersionOutput> {
  assertCan(caller, 'manage_forms');
  const parsed = parseInput(deleteFormVersionInput, input);
  const version = await versionOrNotFound(ctx, parsed.form_version_id);
  const form = await formOrNotFound(ctx, version.form_id);
  const entries = await ctx.store.countEntriesByFormVersion(version.id);
  if (entries > 0) {
    throw new AppError(
      'invalid',
      `this version has ${entries} ${entries === 1 ? 'entry' : 'entries'} bound to it and cannot be deleted; delete the form to remove them, or leave it`,
      { reason: 'has-entries', entries },
    );
  }
  if (version.published_at !== null) {
    throw new AppError(
      'invalid',
      `v${version.version_no} is published, and a device may still hold entries for it that have not reached the server; only a draft can be deleted on its own. Delete the whole form to remove it`,
      { reason: 'published' },
    );
  }
  if (form.active_version_id === version.id) {
    throw new AppError(
      'invalid',
      'this is the active version; deleting it would leave the form with nothing to scout. Restore another version first',
      { reason: 'active-version' },
    );
  }
  await ctx.store.deleteFormVersion(version.id);
  return { deleted: true };
}

/**
 * SPEC-FINAL 5.1 (v1.22): the whole form with its versions, fields, scoring and entries, in
 * one statement. `dry_run` answers the counts the warning names and deletes nothing.
 */
export async function deleteForm(
  caller: Caller,
  input: DeleteFormInput,
  ctx: UseCaseContext,
): Promise<DeleteFormOutput> {
  assertCan(caller, 'manage_forms');
  const parsed = parseInput(deleteFormInput, input);
  const form = await formOrNotFound(ctx, parsed.form_id);
  const versions = await ctx.store.listFormVersions(form.id);
  let entries = 0;
  for (const version of versions) entries += await ctx.store.countEntriesByFormVersion(version.id);
  if (parsed.dry_run) return { versions: versions.length, entries, deleted: false };
  await ctx.store.deleteFormCascade(form.id);
  return { versions: versions.length, entries, deleted: true };
}

/** The draft or the active version, the only two that export (SPEC-FINAL 5.1, v1.22). */
async function exportableVersion(
  ctx: UseCaseContext,
  form: StoredForm,
  versionId: string | undefined,
): Promise<StoredFormVersion> {
  const versions = await ctx.store.listFormVersions(form.id);
  if (versionId !== undefined) {
    const version = versions.find((v) => v.id === versionId);
    if (!version) {
      throw new AppError(
        'not-found',
        'that form version does not exist; it may have been deleted',
        {
          form_version_id: versionId,
        },
      );
    }
    if (version.published_at !== null && version.id !== form.active_version_id) {
      throw new AppError('invalid', 'only the draft or the active version can be exported', {
        reason: 'not-exportable',
      });
    }
    return version;
  }
  const chosen = draftOf(versions) ?? versions.find((v) => v.id === form.active_version_id);
  if (!chosen) {
    throw new AppError('invalid', 'this form has no draft and no active version to export', {
      reason: 'not-exportable',
    });
  }
  return chosen;
}

/** The portable definition: one version's live fields in order, and their scoring. */
async function definitionOf(
  ctx: UseCaseContext,
  form: StoredForm,
  version: StoredFormVersion,
): Promise<FormDefinition> {
  const live = (await ctx.store.getFormFields(version.id)).filter((f) => !f.deprecated);
  const keys = new Set(live.map((f) => f.key));
  const rules = (await ctx.store.getScoringRules(form.id))
    .filter((r) => keys.has(r.field_key))
    .sort((a, b) => (a.field_key < b.field_key ? -1 : a.field_key > b.field_key ? 1 : 0))
    .map((r) => ({
      field_key: r.field_key,
      points: Number(r.points),
      option_points: r.option_points ?? null,
    }));
  return {
    format: FORM_DEFINITION_FORMAT,
    kind: form.kind,
    name: form.name,
    timer_config: form.timer_config as TimerConfig,
    fields: live.map(draftColumns),
    scoring_rules: rules,
  };
}

/**
 * The portable JSON of one version: no ids, no season, so it imports anywhere. Default:
 * the draft if there is one, else the active version. Admin only — a read, but of the
 * builder's working copy.
 */
export async function exportForm(
  caller: Caller,
  input: ExportFormInput,
  ctx: UseCaseContext,
): Promise<FormDefinition> {
  assertCan(caller, 'manage_forms');
  const parsed = parseInput(exportFormInput, input);
  const form = await formOrNotFound(ctx, parsed.form_id);
  return definitionOf(ctx, form, await exportableVersion(ctx, form, parsed.form_version_id));
}

/** One saved export as the Exports picker lists it (task 1.28's list reuses this). */
export function toExportSummary(
  row: StoredFormExport,
  creator: { id: string; full_name: string },
  now: Date,
): ExportSummary {
  const definition = row.definition as Partial<FormDefinition> | null;
  const expiresAt = Date.parse(row.created_at) + FORM_EXPORT_TTL_MS;
  return {
    id: row.id,
    form_id: row.form_id ?? null,
    kind: definition?.kind === 'super' ? 'super' : 'match',
    label: row.label,
    // Live, non-section fields: the count every form surface shows (task 1.28).
    field_count: Array.isArray(definition?.fields) ? countDataFields(definition.fields) : 0,
    created_by: creator,
    created_at: row.created_at,
    expires_at: new Date(expiresAt).toISOString(),
    expires_in_seconds: Math.max(0, Math.floor((expiresAt - now.getTime()) / 1000)),
  };
}

/**
 * Saves one version's definition into Exports, kept FORM_EXPORT_TTL_MS (24 hours). Every
 * export older than that is deleted first (SPEC-FINAL 3.3, v1.22).
 */
export async function saveFormExport(
  caller: Caller,
  input: SaveFormExportInput,
  ctx: UseCaseContext,
): Promise<ExportSummary> {
  assertCan(caller, 'manage_forms');
  const userId = userIdOf(caller);
  const parsed = parseInput(saveFormExportInput, input);
  const form = await formOrNotFound(ctx, parsed.form_id);
  const version = await exportableVersion(ctx, form, parsed.form_version_id);
  const definition = await definitionOf(ctx, form, version);
  const now = ctx.now();
  await ctx.store.purgeFormExports(new Date(now.getTime() - FORM_EXPORT_TTL_MS));
  // The picker names the form, its season and its version (design 12, "Import"; task 1.31):
  // "Match form 2026 · draft v4". The season is read for its year only.
  const season = await ctx.store.getSeason(form.season_id);
  const name = season ? `${form.name} ${season.year}` : form.name;
  const label =
    version.published_at === null
      ? `${name} · draft v${version.version_no}`
      : `${name} · v${version.version_no}`;
  const row = await ctx.store.insertFormExport({
    id: crypto.randomUUID(),
    form_id: form.id,
    label,
    definition,
    created_by: userId,
  });
  const creator = await ctx.store.getFullUser(userId);
  return toExportSummary(row, { id: userId, full_name: creator?.full_name ?? '' }, now);
}

/** A strict parse of the definition, refused with every issue positioned (decision G). */
function parseDefinition(raw: unknown): FormDefinition {
  const parsed = formDefinition.safeParse(raw);
  if (parsed.success) return parsed.data;
  const fields = (raw as { fields?: unknown } | null)?.fields;
  const issues: FormIssue[] = parsed.error.issues.map((issue) => {
    const [head, index, ...rest] = issue.path;
    if (head === 'fields' && typeof index === 'number' && Array.isArray(fields)) {
      const key = (fields[index] as { key?: unknown } | undefined)?.key;
      return {
        field_key: typeof key === 'string' ? key : null,
        path: rest.length > 0 ? rest.join('.') : 'field',
        message: issue.message,
      };
    }
    return {
      field_key: null,
      path: issue.path.length > 0 ? issue.path.join('.') : 'definition',
      message: issue.message,
    };
  });
  throw definitionError(issues);
}

/**
 * Imported scoring, by the same rules as setScoringRules (task 1.28): each rule names a
 * scorable field of the definition, once, with non-negative points and real option values.
 */
function checkScoring(definition: FormDefinition): void {
  const issues = validateScoringRules(definition.scoring_rules, definition.fields, {
    prefix: 'scoring_rules',
    noun: 'definition',
  });
  if (issues.length > 0) throw definitionError(issues);
}

/**
 * SPEC-FINAL 5.1 (v1.22). Into the season's form of `definition.kind`: when there is none,
 * a new form as draft v1 with the definition's name, timer, fields and scoring. When there
 * is one, the fields become its draft — replacing the draft's, or forking a new draft from
 * the newest version — and its name, timer and scoring are left alone (they are form-level
 * and live). The key and draft rules of saveDraftFields apply.
 */
export async function importForm(
  caller: Caller,
  input: ImportFormInput,
  ctx: UseCaseContext,
): Promise<ImportFormOutput> {
  assertCan(caller, 'manage_forms');
  const userId = userIdOf(caller);
  const definition = parseDefinition((input as { definition?: unknown } | null)?.definition);
  const parsed = parseInput(importFormInput, input);
  await seasonOrNotFound(ctx, parsed.season_id);
  checkScoring(definition);
  const incoming = definition.fields.map((f) => ({ draft: toDraft(f) }));

  let existing: StoredForm | null;
  if (parsed.form_id !== undefined) {
    existing = await formOrNotFound(ctx, parsed.form_id);
    if (existing.season_id !== parsed.season_id || existing.kind !== definition.kind) {
      throw new AppError('invalid', `that form is not this season's ${definition.kind} form`, {
        reason: 'kind-mismatch',
      });
    }
  } else {
    existing = await ctx.store.getFormByKind(parsed.season_id, definition.kind);
  }

  if (existing) {
    const versions = await ctx.store.listFormVersions(existing.id);
    const draft = draftOf(versions);
    const written = draft
      ? await writeFieldSet(ctx, userId, existing, draft, incoming)
      : await writeFieldSet(ctx, userId, existing, newestOf(versions) ?? null, incoming, true);
    return { form_id: existing.id, draft_version_id: written.version.id, created: false };
  }

  // A new form: every check before the first write.
  resolveIdentity(incoming, [], new Map());
  const { definition: problems } = checkFields(incoming.map((f) => f.draft));
  if (problems.length > 0) throw definitionError(problems);

  let form: StoredForm;
  try {
    form = await ctx.store.insertForm({
      id: crypto.randomUUID(),
      season_id: parsed.season_id,
      kind: definition.kind,
      name: definition.name,
      timer_config: definition.timer_config,
    });
  } catch (e) {
    if (pgCode(e) === '23505') {
      throw new AppError('conflict', `this season already has a ${definition.kind} form`, {
        reason: 'form-exists',
        kind: definition.kind,
      });
    }
    throw e;
  }
  try {
    const version = await ctx.store.insertFormVersion({
      id: crypto.randomUUID(),
      form_id: form.id,
      version_no: 1,
      updated_by: userId,
    });
    await ctx.store.writeFormFields(
      version.id,
      incoming.map((f) => ({
        id: crypto.randomUUID(),
        ...draftColumns(f.draft),
        deprecated: false,
      })),
      [],
    );
    await ctx.store.replaceScoringRules(
      form.id,
      definition.scoring_rules.map((r) => ({
        id: crypto.randomUUID(),
        field_key: r.field_key,
        points: r.points,
        option_points: r.option_points,
      })),
    );
    return { form_id: form.id, draft_version_id: version.id, created: true };
  } catch (e) {
    // Compensate: the half-made form goes with everything that cascades from it.
    await ctx.store.deleteFormCascade(form.id).catch(() => undefined);
    throw e;
  }
}
