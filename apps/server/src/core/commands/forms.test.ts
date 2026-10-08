import { beforeEach, describe, expect, it } from 'vitest';
import {
  FORM_EXPORT_TTL_MS,
  type Caller,
  type FormFieldInput,
  type ImportFormInput,
} from '@frc/shared';
import {
  createForm,
  deleteForm,
  deleteFormVersion,
  exportForm,
  importForm,
  publishFormVersion,
  restoreFormVersion,
  saveDraftFields,
  saveFormExport,
  updateForm,
} from './forms.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';

// Wire ids are uuids (the schemas are strict).
const SEASON = '11111111-1111-4111-8111-111111111111';
const SEASON_2 = '22222222-2222-4222-8222-222222222222';
const NOPE = '99999999-9999-4999-8999-999999999999';

const ADMIN: Caller = { kind: 'user', userId: 'u-admin', role: 'admin' };
const ADMIN_2: Caller = { kind: 'user', userId: 'u-admin-2', role: 'admin' };
const LEAD: Caller = { kind: 'user', userId: 'u-lead', role: 'lead' };
const SERVICE: Caller = { kind: 'service', label: 'mcp' };

const AT = '2026-11-01T00:00:00.000Z';

const counter = (key: string, over: Partial<FormFieldInput> = {}): FormFieldInput => ({
  key,
  label: key,
  type: 'counter',
  display_order: 1,
  required: false,
  config: { min: 0, max: 10, step: 1 },
  description: 'x',
  unit: 'count',
  phase: 'auto',
  direction: 'higher_is_better',
  ...over,
});

const select = (
  key: string,
  values: string[],
  labels: string[] = values,
  over: Partial<FormFieldInput> = {},
): FormFieldInput =>
  counter(key, {
    type: 'single_select',
    unit: 'enum',
    is_ordinal: true,
    config: { options: values.map((value, i) => ({ value, label: labels[i] ?? value })) },
    ...over,
  });

let ctx: FakeContext;
let formId: string;
let draftId: string;

/** Every field row of a version, by key. */
const fieldsOf = (versionId: string) =>
  new Map(
    [...ctx.formFields.entries()]
      .filter(([k]) => k.startsWith(`${versionId}:`))
      .map(([, f]) => [f.key, f]),
  );

const version = (id: string) => ctx.formVersions.get(id)! as Record<string, unknown>;
const form = (id: string) => ctx.forms.get(id)! as Record<string, unknown>;

/** Saves `fields` into the draft and publishes it; the draft becomes v1, published. */
async function publishWith(fields: FormFieldInput[]): Promise<void> {
  await saveDraftFields(ADMIN, { form_version_id: draftId, fields }, ctx);
  await publishFormVersion(ADMIN, { form_version_id: draftId }, ctx);
}

beforeEach(async () => {
  ctx = makeFakeContext();
  for (const [id, year] of [
    [SEASON, 2026],
    [SEASON_2, 2027],
  ] as const) {
    ctx.seasons.set(id, {
      id,
      year,
      game_name: 'G',
      field_image_path: 'p',
      created_at: AT,
      updated_at: AT,
    });
  }
  ctx.usersById.set('u-admin-2', {
    id: 'u-admin-2',
    username: 'admin2',
    full_name: 'Second Admin',
    role: 'admin',
    password_hash: 'x',
    must_change_password: false,
    disabled_at: null,
    created_at: AT,
  });
  const created = await createForm(ADMIN, { season_id: SEASON, kind: 'match', name: 'Match' }, ctx);
  formId = created.id;
  draftId = created.draft_version_id;
});

describe('createForm', () => {
  it('creates a form with an empty draft version 1 and no active version yet', () => {
    expect(form(formId).active_version_id).toBeNull();
    expect(version(draftId).published_at).toBeNull();
    expect(version(draftId).version_no).toBe(1);
    expect(fieldsOf(draftId).size).toBe(0);
  });

  it('refuses a second form of the same kind in a season', async () => {
    await expect(
      createForm(ADMIN, { season_id: SEASON, kind: 'match', name: 'Again' }, ctx),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(
      createForm(ADMIN, { season_id: SEASON, kind: 'super', name: 'Super' }, ctx),
    ).resolves.toMatchObject({ id: expect.any(String) });
  });

  it('refuses an unknown season as not-found', async () => {
    await expect(
      createForm(ADMIN, { season_id: NOPE, kind: 'match', name: 'M' }, ctx),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('saveDraftFields: field identity and permanent keys (SPEC-FINAL 5.1, v1.20)', () => {
  it('writes a draft in place and returns the saved fields with their ids', async () => {
    const result = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('auto_notes')] },
      ctx,
    );
    expect(result).toMatchObject({ form_version_id: draftId, new_version_id: null, version_no: 1 });
    expect(result.fields).toHaveLength(1);
    expect(result.fields[0]).toMatchObject({ key: 'auto_notes', id: expect.any(String) });
    expect(result.incomplete).toEqual([]);
  });

  it('keeps a field id across saves', async () => {
    const first = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a')] },
      ctx,
    );
    const id = first.fields[0]!.id;
    const second = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a', { id, label: 'A!' }), counter('b')] },
      ctx,
    );
    expect(second.fields.find((f) => f.key === 'a')).toMatchObject({ id, label: 'A!' });
    // without the id, the key alone matches the live field
    const third = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a'), counter('b')] },
      ctx,
    );
    expect(third.fields.find((f) => f.key === 'a')!.id).toBe(id);
  });

  it("a saved field's key change (same id, different key) is refused with reason key-change", async () => {
    const first = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('auto_notes')] },
      ctx,
    );
    const id = first.fields[0]!.id;
    await expect(
      saveDraftFields(
        ADMIN,
        { form_version_id: draftId, fields: [counter('auto_pieces', { id })] },
        ctx,
      ),
    ).rejects.toMatchObject({
      code: 'invalid',
      details: {
        reason: 'key-change',
        field_id: id,
        key_was: 'auto_notes',
        key_now: 'auto_pieces',
      },
    });
    expect(fieldsOf(draftId).has('auto_notes')).toBe(true);
    expect(fieldsOf(draftId).has('auto_pieces')).toBe(false);
  });

  it('never renames a key — a malformed one is an error, not a silent new field', async () => {
    await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('auto_notes')] },
      ctx,
    );
    await expect(
      saveDraftFields(ADMIN, { form_version_id: draftId, fields: [counter('AUTO NOTES')] }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('refuses an id that names no live field of the target version', async () => {
    await expect(
      saveDraftFields(
        ADMIN,
        { form_version_id: draftId, fields: [counter('a', { id: NOPE })] },
        ctx,
      ),
    ).rejects.toMatchObject({
      code: 'invalid',
      details: { reason: 'unknown-field-id', field_id: NOPE },
    });
  });

  it('refuses two fields with one key', async () => {
    await expect(
      saveDraftFields(
        ADMIN,
        { form_version_id: draftId, fields: [counter('a'), counter('a', { display_order: 2 })] },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'invalid', details: { reason: 'duplicate-key', key: 'a' } });
  });

  it('refuses a key retired in an earlier version of this form', async () => {
    await publishWith([counter('a'), counter('b', { display_order: 2 })]);
    const forked = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a')] },
      ctx,
    );
    const v2 = forked.new_version_id!;
    await expect(
      saveDraftFields(
        ADMIN,
        { form_version_id: v2, fields: [counter('a'), counter('b', { display_order: 2 })] },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'invalid', details: { reason: 'key-retired', key: 'b' } });
  });

  it('deletes a field removed from the draft it was born in, and deprecates a carried one', async () => {
    await publishWith([counter('a'), counter('b', { display_order: 2 })]);
    const forked = await saveDraftFields(
      ADMIN,
      {
        form_version_id: draftId,
        fields: [counter('a'), counter('b'), counter('c', { display_order: 3 })],
      },
      ctx,
    );
    const v2 = forked.new_version_id!;
    await saveDraftFields(ADMIN, { form_version_id: v2, fields: [counter('c')] }, ctx);
    const fields = fieldsOf(v2);
    expect(fields.get('a')!.deprecated).toBe(true);
    expect(fields.get('b')!.deprecated).toBe(true);
    expect(fields.get('c')!.deprecated).toBe(false);
    await saveDraftFields(ADMIN, { form_version_id: v2, fields: [] }, ctx);
    expect(fieldsOf(v2).has('c')).toBe(false); // born in v2, so deleted, and its key is free
    await expect(
      saveDraftFields(ADMIN, { form_version_id: v2, fields: [counter('c')] }, ctx),
    ).resolves.toMatchObject({ new_version_id: null });
  });

  it('refuses an unknown version as not-found', async () => {
    await expect(
      saveDraftFields(ADMIN, { form_version_id: NOPE, fields: [] }, ctx),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('saveDraftFields and publish: definition vs incomplete meaning', () => {
  it('draft save with blank meaning succeeds with incomplete; publish of it is refused', async () => {
    const result = await saveDraftFields(
      ADMIN,
      {
        form_version_id: draftId,
        fields: [counter('ok'), counter('bad', { description: '', unit: null, display_order: 2 })],
      },
      ctx,
    );
    expect(result.incomplete).toEqual([
      { field_key: 'bad', path: 'description', message: expect.any(String) },
      { field_key: 'bad', path: 'unit', message: expect.any(String) },
    ]);
    await expect(
      publishFormVersion(ADMIN, { form_version_id: draftId }, ctx),
    ).rejects.toMatchObject({
      code: 'invalid',
      details: {
        reason: 'invalid-definition',
        issues: [
          { field_key: 'bad', path: 'description', message: expect.any(String) },
          { field_key: 'bad', path: 'unit', message: expect.any(String) },
        ],
      },
    });
    expect(version(draftId).published_at).toBeNull();
  });

  it('refuses a definition issue on a draft save, naming the field and path', async () => {
    await expect(
      saveDraftFields(
        ADMIN,
        { form_version_id: draftId, fields: [counter('ok', { config: { min: 0, nope: 1 } })] },
        ctx,
      ),
    ).rejects.toMatchObject({
      code: 'invalid',
      details: { reason: 'invalid-definition', issues: [{ field_key: 'ok', path: 'config' }] },
    });
    expect(fieldsOf(draftId).size).toBe(0);
  });

  it('refuses a visibility condition that names no live field', async () => {
    await expect(
      saveDraftFields(
        ADMIN,
        {
          form_version_id: draftId,
          fields: [
            counter('a', { visibility_condition: { field_key: 'ghost', op: '=', value: 1 } }),
          ],
        },
        ctx,
      ),
    ).rejects.toMatchObject({
      details: {
        reason: 'invalid-definition',
        issues: [{ field_key: 'a', path: 'visibility_condition' }],
      },
    });
  });

  it('refuses a computed expression whose type does not match, and publishes none that is null', async () => {
    const computed = (expression: unknown): FormFieldInput =>
      counter('total', {
        type: 'computed',
        unit: 'points',
        display_order: 2,
        config: { expression, result_type: 'float' },
      });
    await expect(
      saveDraftFields(
        ADMIN,
        {
          form_version_id: draftId,
          fields: [counter('a'), computed({ kind: 'literal', value: 'text' })],
        },
        ctx,
      ),
    ).rejects.toMatchObject({
      details: {
        reason: 'invalid-definition',
        issues: [{ field_key: 'total', path: 'config.expression' }],
      },
    });
    // a null expression is a draft in progress, not an error...
    await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a'), computed(null)] },
      ctx,
    );
    // ...but it cannot be published
    await expect(
      publishFormVersion(ADMIN, { form_version_id: draftId }, ctx),
    ).rejects.toMatchObject({
      details: {
        reason: 'invalid-definition',
        issues: [{ field_key: 'total', path: 'config.expression' }],
      },
    });
  });

  it('refuses blank meaning on an in-place save to a published version', async () => {
    await publishWith([counter('a')]);
    await expect(
      saveDraftFields(
        ADMIN,
        { form_version_id: draftId, fields: [counter('a', { direction: null })] },
        ctx,
      ),
    ).rejects.toMatchObject({
      code: 'invalid',
      details: { reason: 'invalid-definition', issues: [{ field_key: 'a', path: 'direction' }] },
    });
  });

  it('refuses to publish a version with no live data field', async () => {
    await saveDraftFields(
      ADMIN,
      {
        form_version_id: draftId,
        fields: [
          {
            key: 'heading',
            label: 'Auto',
            type: 'section',
            display_order: 1,
          },
        ],
      },
      ctx,
    );
    await expect(
      publishFormVersion(ADMIN, { form_version_id: draftId }, ctx),
    ).rejects.toMatchObject({
      details: { reason: 'invalid-definition', issues: [{ field_key: null, path: 'fields' }] },
    });
  });
});

describe('versioning (SPEC-FINAL 5.1)', () => {
  it('publishes a draft and points the form at it', async () => {
    await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('auto_notes')] },
      ctx,
    );
    const result = await publishFormVersion(ADMIN, { form_version_id: draftId }, ctx);
    expect(version(draftId).published_at).not.toBeNull();
    expect(form(formId).active_version_id).toBe(draftId);
    expect(result).toEqual({
      form_version_id: draftId,
      published_at: ctx.nowValue.toISOString(),
      active_version_id: draftId,
    });
  });

  it('refuses to publish a version twice', async () => {
    await publishWith([counter('a')]);
    await expect(
      publishFormVersion(ADMIN, { form_version_id: draftId }, ctx),
    ).rejects.toMatchObject({ code: 'invalid', details: { reason: 'already-published' } });
  });

  it('accepts an in-place label, help-text, range and metadata edit on a LOCKED version with no new version', async () => {
    await publishWith([counter('auto_notes')]);
    version(draftId).is_locked = true;
    const idBefore = fieldsOf(draftId).get('auto_notes')!.id;

    const result = await saveDraftFields(
      ADMIN,
      {
        form_version_id: draftId,
        fields: [
          counter('auto_notes', {
            label: 'הערות אוטונומי',
            help_text: 'תספור',
            config: { min: 0, max: 20, step: 1 },
            expected_range: { min: 0, max: 20 },
            display_order: 3,
            section: 'Auto',
            category: 'scoring',
          }),
        ],
      },
      ctx,
    );

    expect(result.new_version_id).toBeNull();
    expect(ctx.formFields.get(`${draftId}:auto_notes`)!.label).toBe('הערות אוטונומי');
    expect(ctx.formFields.get(`${draftId}:auto_notes`)!.id).toBe(idBefore);
    expect(ctx.formVersions.size).toBe(1);
  });

  it('forks a new draft version when a field is ADDED to a locked version', async () => {
    await publishWith([counter('auto_notes')]);
    version(draftId).is_locked = true;

    const result = await saveDraftFields(
      ADMIN,
      {
        form_version_id: draftId,
        fields: [
          counter('auto_notes'),
          counter('teleop_notes', { phase: 'teleop', display_order: 2 }),
        ],
      },
      ctx,
    );

    expect(result.new_version_id).not.toBeNull();
    expect(result.form_version_id).toBe(result.new_version_id);
    expect(version(result.new_version_id!).published_at).toBeNull();
    expect(version(result.new_version_id!).version_no).toBe(2);
    expect(result.version_no).toBe(2);
    // the locked version is untouched
    expect([...fieldsOf(draftId).keys()]).toEqual(['auto_notes']);
    expect([...fieldsOf(result.new_version_id!).keys()].sort()).toEqual([
      'auto_notes',
      'teleop_notes',
    ]);
  });

  it('forks a new draft version when a field TYPE changes on a locked version', async () => {
    await publishWith([counter('auto_notes')]);
    version(draftId).is_locked = true;
    const result = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('auto_notes', { type: 'number' })] },
      ctx,
    );
    expect(result.new_version_id).not.toBeNull();
    expect(fieldsOf(draftId).get('auto_notes')!.type).toBe('counter');
  });

  it('marks a removed field deprecated in the new version instead of dropping it', async () => {
    await publishWith([counter('a'), counter('b', { display_order: 2 })]);
    version(draftId).is_locked = true;
    const result = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a')] },
      ctx,
    );
    const carried = ctx.formFields.get(`${result.new_version_id}:b`)!;
    expect(carried.deprecated).toBe(true);
    expect(result.fields.find((f) => f.key === 'b')!.deprecated).toBe(true);
  });

  it('reordering two options of a single_select on a LOCKED version forks a new draft version', async () => {
    await publishWith([select('climb', ['low', 'high'])]);
    version(draftId).is_locked = true;
    const result = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [select('climb', ['high', 'low'])] },
      ctx,
    );
    expect(result.new_version_id).not.toBeNull();
    expect(ctx.formVersions.size).toBe(2);
    const options = (fieldsOf(draftId).get('climb')!.config as { options: { value: string }[] })
      .options;
    expect(options.map((o) => o.value)).toEqual(['low', 'high']);
  });

  it("renaming an option's label on a LOCKED version writes in place, no new version", async () => {
    await publishWith([select('climb', ['low', 'high'], ['Low', 'High'])]);
    version(draftId).is_locked = true;
    const result = await saveDraftFields(
      ADMIN,
      {
        form_version_id: draftId,
        fields: [select('climb', ['low', 'high'], ['Ground', 'Top bar'])],
      },
      ctx,
    );
    expect(result.new_version_id).toBeNull();
    expect(ctx.formVersions.size).toBe(1);
    const options = (fieldsOf(draftId).get('climb')!.config as { options: { label: string }[] })
      .options;
    expect(options.map((o) => o.label)).toEqual(['Ground', 'Top bar']);
  });

  it('forks on a structural change to a published version even before it is locked', async () => {
    await publishWith([counter('a')]);
    const result = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a'), counter('b')] },
      ctx,
    );
    expect(result.new_version_id).not.toBeNull();
  });

  it('takes a structural edit to an unpublished draft in place', async () => {
    await saveDraftFields(ADMIN, { form_version_id: draftId, fields: [counter('a')] }, ctx);
    const result = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a', { type: 'number' }), counter('b')] },
      ctx,
    );
    expect(result.new_version_id).toBeNull();
    expect(ctx.formVersions.size).toBe(1);
  });

  it('refuses a structural change to a published version while a draft exists', async () => {
    await publishWith([counter('a')]);
    const forked = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a'), counter('b')] },
      ctx,
    );
    await expect(
      saveDraftFields(
        ADMIN,
        { form_version_id: draftId, fields: [counter('a'), counter('c')] },
        ctx,
      ),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'draft-exists', draft_version_id: forked.new_version_id, version_no: 2 },
    });
  });

  it('stamps is_locked when a save finds entries bound to the version', async () => {
    await publishWith([counter('a')]);
    ctx.entryCountsByVersion.set(draftId, 3);
    expect(version(draftId).is_locked).toBe(false);
    await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a', { label: 'A' })] },
      ctx,
    );
    expect(version(draftId).is_locked).toBe(true);
  });

  it('deletes the forked version again when writing its fields fails', async () => {
    await publishWith([counter('a')]);
    const original = ctx.store.writeFormFields;
    ctx.store.writeFormFields = async () => {
      throw new Error('connection reset');
    };
    await expect(
      saveDraftFields(
        ADMIN,
        { form_version_id: draftId, fields: [counter('a'), counter('b')] },
        ctx,
      ),
    ).rejects.toThrow('connection reset');
    ctx.store.writeFormFields = original;
    expect(ctx.formVersions.size).toBe(1);
  });

  it('restores an older published version without creating a new one', async () => {
    await publishWith([counter('a')]);
    version(draftId).is_locked = true;
    const forked = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a'), counter('b', { display_order: 2 })] },
      ctx,
    );
    await publishFormVersion(ADMIN, { form_version_id: forked.new_version_id! }, ctx);
    expect(form(formId).active_version_id).toBe(forked.new_version_id);

    const before = ctx.formVersions.size;
    const result = await restoreFormVersion(ADMIN, { form_version_id: draftId }, ctx);
    expect(result).toEqual({ active_version_id: draftId });
    expect(form(formId).active_version_id).toBe(draftId);
    expect(ctx.formVersions.size).toBe(before);
  });

  it('refuses to restore a draft', async () => {
    await expect(
      restoreFormVersion(ADMIN, { form_version_id: draftId }, ctx),
    ).rejects.toMatchObject({ code: 'invalid', details: { reason: 'not-published' } });
  });
});

describe('deleteFormVersion and deleteForm', () => {
  it('blocks deleting a version that has entries bound to it, and says why', async () => {
    ctx.entryCountsByVersion.set(draftId, 4);
    await expect(deleteFormVersion(ADMIN, { form_version_id: draftId }, ctx)).rejects.toMatchObject(
      {
        code: 'invalid',
        details: { reason: 'has-entries', entries: 4 },
      },
    );
    await expect(deleteFormVersion(ADMIN, { form_version_id: draftId }, ctx)).rejects.toThrow(
      /4 entries/,
    );
  });

  it("refuses the form's active version", async () => {
    await publishWith([counter('a')]);
    await expect(deleteFormVersion(ADMIN, { form_version_id: draftId }, ctx)).rejects.toMatchObject(
      { code: 'invalid', details: { reason: 'active-version' } },
    );
  });

  it('deletes a draft with no entries, and its fields with it', async () => {
    await publishWith([counter('a')]);
    const forked = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a'), counter('b')] },
      ctx,
    );
    const v2 = forked.new_version_id!;
    await expect(deleteFormVersion(ADMIN, { form_version_id: v2 }, ctx)).resolves.toEqual({
      deleted: true,
    });
    expect(ctx.formVersions.has(v2)).toBe(false);
    expect(fieldsOf(v2).size).toBe(0);
  });

  it('deleteForm dry_run names the versions and entries and deletes nothing', async () => {
    await publishWith([counter('a')]);
    await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a'), counter('b')] },
      ctx,
    );
    ctx.entryCountsByVersion.set(draftId, 7);
    await expect(deleteForm(ADMIN, { form_id: formId, dry_run: true }, ctx)).resolves.toEqual({
      versions: 2,
      entries: 7,
      deleted: false,
    });
    expect(ctx.forms.has(formId)).toBe(true);
  });

  it('deleteForm cascades to versions, fields, scoring and entries, and unlinks saved exports', async () => {
    await publishWith([counter('a')]);
    ctx.scoringRules.set(`${formId}:a`, {
      id: 'r-1',
      version: 1,
      form_id: formId,
      field_key: 'a',
      points: 2,
    });
    ctx.rows.scouting_entries.set('x-1', { id: 'x-1', version: 1, form_version_id: draftId });
    const saved = await saveFormExport(ADMIN, { form_id: formId, form_version_id: draftId }, ctx);

    await expect(deleteForm(ADMIN, { form_id: formId }, ctx)).resolves.toEqual({
      versions: 1,
      entries: 1,
      deleted: true,
    });
    expect(ctx.forms.has(formId)).toBe(false);
    expect(ctx.formVersions.size).toBe(0);
    expect(ctx.formFields.size).toBe(0);
    expect(ctx.scoringRules.size).toBe(0);
    expect(ctx.rows.scouting_entries.size).toBe(0);
    expect(ctx.formExports.get(saved.id)!.form_id).toBeNull();
  });
});

describe('updateForm (in place, no version)', () => {
  it('edits timer_config in place, creating no version', async () => {
    await updateForm(
      ADMIN,
      {
        form_id: formId,
        timer_config: {
          phases: [
            { phase: 'auto', seconds: 15 },
            { phase: 'teleop', seconds: 135 },
          ],
        },
      },
      ctx,
    );
    expect((form(formId).timer_config as { phases: unknown[] }).phases).toHaveLength(2);
    expect(ctx.formVersions.size).toBe(1);
  });

  it('refuses a phase with no positive seconds', async () => {
    await expect(
      updateForm(
        ADMIN,
        { form_id: formId, timer_config: { phases: [{ phase: 'auto', seconds: 0 }] } },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('renames the form and returns the row', async () => {
    const row = await updateForm(ADMIN, { form_id: formId, name: 'Match form 2026' }, ctx);
    expect(row).toMatchObject({ id: formId, name: 'Match form 2026', season_id: SEASON });
  });
});

describe('updated_by (SPEC-FINAL 3.3, v1.21)', () => {
  it('createForm stamps draft v1', () => {
    expect(version(draftId).updated_by).toBe('u-admin');
  });

  it('saveDraftFields stamps the target, or the forked version', async () => {
    await saveDraftFields(ADMIN_2, { form_version_id: draftId, fields: [counter('a')] }, ctx);
    expect(version(draftId).updated_by).toBe('u-admin-2');
    await publishFormVersion(ADMIN, { form_version_id: draftId }, ctx);
    const forked = await saveDraftFields(
      ADMIN_2,
      { form_version_id: draftId, fields: [counter('a'), counter('b')] },
      ctx,
    );
    expect(version(forked.new_version_id!).updated_by).toBe('u-admin-2');
    expect(version(draftId).updated_by).toBe('u-admin');
  });

  it('publishFormVersion stamps that version', async () => {
    await saveDraftFields(ADMIN, { form_version_id: draftId, fields: [counter('a')] }, ctx);
    await publishFormVersion(ADMIN_2, { form_version_id: draftId }, ctx);
    expect(version(draftId).updated_by).toBe('u-admin-2');
  });

  it('restoreFormVersion stamps the restored version', async () => {
    await publishWith([counter('a')]);
    const forked = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a'), counter('b')] },
      ctx,
    );
    await publishFormVersion(ADMIN, { form_version_id: forked.new_version_id! }, ctx);
    await restoreFormVersion(ADMIN_2, { form_version_id: draftId }, ctx);
    expect(version(draftId).updated_by).toBe('u-admin-2');
  });

  it('importForm stamps the draft it writes', async () => {
    await publishWith([counter('a')]);
    const definition = await exportForm(ADMIN, { form_id: formId }, ctx);
    const created = await importForm(ADMIN_2, { season_id: SEASON_2, definition }, ctx);
    expect(version(created.draft_version_id).updated_by).toBe('u-admin-2');
    const into = await importForm(ADMIN_2, { season_id: SEASON, definition }, ctx);
    expect(version(into.draft_version_id).updated_by).toBe('u-admin-2');
  });

  it("updateForm stamps the form's draft, else its active version, else nothing", async () => {
    await updateForm(ADMIN_2, { form_id: formId, name: 'M1' }, ctx);
    expect(version(draftId).updated_by).toBe('u-admin-2');
    await publishWith([counter('a')]);
    await updateForm(ADMIN_2, { form_id: formId, name: 'M2' }, ctx);
    expect(version(draftId).updated_by).toBe('u-admin-2');
    // a form with neither: its only version deleted
    const empty = await createForm(ADMIN, { season_id: SEASON_2, kind: 'super', name: 'S' }, ctx);
    await deleteFormVersion(ADMIN, { form_version_id: empty.draft_version_id }, ctx);
    await expect(
      updateForm(ADMIN_2, { form_id: empty.id, name: 'S2' }, ctx),
    ).resolves.toMatchObject({
      name: 'S2',
    });
  });
});

describe('export and import (SPEC-FINAL 5.1, v1.22)', () => {
  it('round-trips a form definition through export and import as JSON', async () => {
    await updateForm(
      ADMIN,
      { form_id: formId, timer_config: { phases: [{ phase: 'auto', seconds: 15 }] } },
      ctx,
    );
    await publishWith([
      counter('auto_notes'),
      select('climb', ['low', 'high'], ['Low', 'High'], { display_order: 2 }),
    ]);
    ctx.scoringRules.set(`${formId}:auto_notes`, {
      id: 'r-1',
      version: 1,
      form_id: formId,
      field_key: 'auto_notes',
      points: 4,
      option_points: null,
    });
    const json = await exportForm(ADMIN, { form_id: formId }, ctx);
    expect(json).toMatchObject({ format: 1, kind: 'match', name: 'Match' });
    expect(json.fields.map((f) => f.key)).toEqual(['auto_notes', 'climb']);
    expect(json.fields[0]).not.toHaveProperty('id');
    expect(json.scoring_rules).toEqual([
      { field_key: 'auto_notes', points: 4, option_points: null },
    ]);

    const imported = await importForm(
      ADMIN,
      {
        season_id: SEASON_2,
        definition: JSON.parse(JSON.stringify(json)) as ImportFormInput['definition'],
      },
      ctx,
    );
    expect(imported.created).toBe(true);
    const exportedAgain = await exportForm(ADMIN, { form_id: imported.form_id }, ctx);
    expect(exportedAgain.fields).toEqual(json.fields);
    expect(exportedAgain.timer_config).toEqual(json.timer_config);
    expect(exportedAgain.scoring_rules).toEqual(json.scoring_rules);
  });

  it('exports the draft by default, else the active version, and refuses an older one', async () => {
    await publishWith([counter('a')]);
    expect((await exportForm(ADMIN, { form_id: formId }, ctx)).fields.map((f) => f.key)).toEqual([
      'a',
    ]);
    const forked = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a'), counter('b')] },
      ctx,
    );
    expect((await exportForm(ADMIN, { form_id: formId }, ctx)).fields.map((f) => f.key)).toEqual([
      'a',
      'b',
    ]);
    await publishFormVersion(ADMIN, { form_version_id: forked.new_version_id! }, ctx);
    await expect(
      exportForm(ADMIN, { form_id: formId, form_version_id: draftId }, ctx),
    ).rejects.toMatchObject({ code: 'invalid', details: { reason: 'not-exportable' } });
  });

  it("imports into an existing form's draft, deprecating carried fields, leaving timer and scoring alone", async () => {
    await publishWith([counter('a'), counter('b')]);
    const forked = await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a'), counter('b'), counter('c')] },
      ctx,
    );
    ctx.scoringRules.set(`${formId}:a`, {
      id: 'r-1',
      version: 1,
      form_id: formId,
      field_key: 'a',
      points: 1,
    });
    const timerBefore = form(formId).timer_config;
    const definition: ImportFormInput['definition'] = {
      format: 1,
      kind: 'match',
      name: 'Other name',
      timer_config: { phases: [{ phase: 'auto', seconds: 20 }] },
      fields: [counter('a', { label: 'A2' }), counter('d')],
      scoring_rules: [{ field_key: 'd', points: 9, option_points: null }],
    };
    const result = await importForm(ADMIN, { season_id: SEASON, definition }, ctx);
    expect(result).toEqual({
      form_id: formId,
      draft_version_id: forked.new_version_id,
      created: false,
    });
    const fields = fieldsOf(forked.new_version_id!);
    expect(fields.get('a')!.label).toBe('A2');
    expect(fields.get('b')!.deprecated).toBe(true);
    expect(fields.has('c')).toBe(false); // born in the draft, so deleted
    expect(fields.get('d')!.deprecated).toBe(false);
    expect(form(formId).name).toBe('Match');
    expect(form(formId).timer_config).toEqual(timerBefore);
    expect([...ctx.scoringRules.keys()]).toEqual([`${formId}:a`]);
  });

  it('forks a new draft from the newest version when the form has none', async () => {
    await publishWith([counter('a')]);
    const definition = await exportForm(ADMIN, { form_id: formId }, ctx);
    const result = await importForm(
      ADMIN,
      { season_id: SEASON, definition: { ...definition, fields: [] } },
      ctx,
    );
    expect(result.created).toBe(false);
    expect(version(result.draft_version_id)).toMatchObject({ version_no: 2, published_at: null });
    expect(fieldsOf(result.draft_version_id).get('a')!.deprecated).toBe(true);
  });

  it('refuses a malformed definition with its issues', async () => {
    await expect(
      importForm(
        ADMIN,
        {
          season_id: SEASON_2,
          definition: { format: 1, kind: 'match', name: 'X', bogus: 1 } as never,
        },
        ctx,
      ),
    ).rejects.toMatchObject({
      code: 'invalid',
      details: {
        reason: 'invalid-definition',
        issues: expect.arrayContaining([expect.anything()]),
      },
    });
  });

  it('refuses a scoring rule for a key the definition does not have', async () => {
    const definition: ImportFormInput['definition'] = {
      format: 1,
      kind: 'super',
      name: 'S',
      timer_config: { phases: [] },
      fields: [counter('a')],
      scoring_rules: [{ field_key: 'ghost', points: 1, option_points: null }],
    };
    await expect(importForm(ADMIN, { season_id: SEASON, definition }, ctx)).rejects.toMatchObject({
      code: 'invalid',
      details: {
        reason: 'invalid-definition',
        issues: [{ field_key: 'ghost', path: 'scoring_rules.0.field_key' }],
      },
    });
    expect([...ctx.forms.values()].filter((f) => f.kind === 'super')).toHaveLength(0);
  });

  it('imports incomplete meaning as a draft and reports nothing structural', async () => {
    const definition: ImportFormInput['definition'] = {
      format: 1,
      kind: 'super',
      name: 'S',
      timer_config: { phases: [] },
      fields: [counter('a', { description: null })],
      scoring_rules: [],
    };
    const result = await importForm(ADMIN, { season_id: SEASON, definition }, ctx);
    expect(result.created).toBe(true);
    expect(fieldsOf(result.draft_version_id).get('a')!.description).toBeNull();
  });
});

describe('saveFormExport (24-hour Exports)', () => {
  it('deletes a row older than 24 h and stores a new one with the right label and created_by', async () => {
    ctx.formExports.set('old', {
      id: 'old',
      form_id: formId,
      label: 'old',
      definition: {},
      created_by: 'u-admin',
      created_at: new Date(ctx.nowValue.getTime() - FORM_EXPORT_TTL_MS - 1000).toISOString(),
    });
    ctx.formExports.set('fresh', {
      id: 'fresh',
      form_id: formId,
      label: 'fresh',
      definition: {},
      created_by: 'u-admin',
      created_at: new Date(ctx.nowValue.getTime() - 1000).toISOString(),
    });
    await saveDraftFields(
      ADMIN,
      { form_version_id: draftId, fields: [counter('a'), counter('b')] },
      ctx,
    );

    const summary = await saveFormExport(
      ADMIN_2,
      { form_id: formId, form_version_id: draftId },
      ctx,
    );

    expect(ctx.formExports.has('old')).toBe(false);
    expect(ctx.formExports.has('fresh')).toBe(true);
    expect(summary).toEqual({
      id: expect.any(String),
      form_id: formId,
      kind: 'match',
      label: 'Match · draft v1',
      field_count: 2,
      created_by: { id: 'u-admin-2', full_name: 'Second Admin' },
      created_at: ctx.nowValue.toISOString(),
      expires_at: new Date(ctx.nowValue.getTime() + FORM_EXPORT_TTL_MS).toISOString(),
      expires_in_seconds: FORM_EXPORT_TTL_MS / 1000,
    });
    const row = ctx.formExports.get(summary.id)!;
    expect(row.created_by).toBe('u-admin-2');
    expect(row.definition).toEqual(await exportForm(ADMIN, { form_id: formId }, ctx));
  });

  it('labels a published version without "draft"', async () => {
    await publishWith([counter('a')]);
    const summary = await saveFormExport(ADMIN, { form_id: formId, form_version_id: draftId }, ctx);
    expect(summary.label).toBe('Match · v1');
  });
});

describe('authorization: admin only, never a service caller', () => {
  const calls = (caller: Caller) => [
    () => createForm(caller, { season_id: SEASON, kind: 'super', name: 'S' }, ctx),
    () => updateForm(caller, { form_id: formId, name: 'N' }, ctx),
    () => saveDraftFields(caller, { form_version_id: draftId, fields: [] }, ctx),
    () => publishFormVersion(caller, { form_version_id: draftId }, ctx),
    () => restoreFormVersion(caller, { form_version_id: draftId }, ctx),
    () => deleteFormVersion(caller, { form_version_id: draftId }, ctx),
    () => deleteForm(caller, { form_id: formId, dry_run: true }, ctx),
    () => exportForm(caller, { form_id: formId }, ctx),
    () => saveFormExport(caller, { form_id: formId, form_version_id: draftId }, ctx),
    () =>
      importForm(
        caller,
        {
          season_id: SEASON_2,
          definition: {
            format: 1,
            kind: 'match',
            name: 'M',
            timer_config: { phases: [] },
            fields: [],
            scoring_rules: [],
          },
        },
        ctx,
      ),
  ];

  it('refuses a lead (and a scouter) every use case here', async () => {
    for (const caller of [LEAD, { kind: 'user', userId: 'u-scouter', role: 'scouter' } as Caller]) {
      for (const call of calls(caller)) {
        await expect(call()).rejects.toMatchObject({ code: 'forbidden' });
      }
    }
    expect(ctx.forms.size).toBe(1);
  });

  it('refuses a service caller every use case here', async () => {
    for (const call of calls(SERVICE)) {
      await expect(call()).rejects.toMatchObject({ code: 'forbidden' });
    }
  });
});
