import { beforeEach, describe, expect, it } from 'vitest';
import { FORM_EXPORT_TTL_MS, type Caller, type FormFieldInput } from '@frc/shared';
import {
  createForm,
  exportForm,
  publishFormVersion,
  saveDraftFields,
  saveFormExport,
} from '../commands/forms.js';
import { setScoringRules } from '../commands/scoring.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';
import {
  getForm,
  getFormDictionary,
  getFormExport,
  getFormVersion,
  listFormExports,
  listForms,
} from './forms.js';

const SEASON = '11111111-1111-4111-8111-111111111111';
const EMPTY_SEASON = '22222222-2222-4222-8222-222222222222';
const NOPE = '99999999-9999-4999-8999-999999999999';

const ADMIN: Caller = { kind: 'user', userId: 'u-admin', role: 'admin' };
const ADMIN_2: Caller = { kind: 'user', userId: 'u-admin-2', role: 'admin' };
const LEAD: Caller = { kind: 'user', userId: 'u-lead', role: 'lead' };
const SCOUTER: Caller = { kind: 'user', userId: 'u-scouter', role: 'scouter' };
const SERVICE: Caller = { kind: 'service', label: 'mcp' };

const AT = '2026-11-01T00:00:00.000Z';

const counter = (key: string, over: Partial<FormFieldInput> = {}): FormFieldInput => ({
  key,
  label: key,
  type: 'counter',
  display_order: 1,
  required: false,
  config: { min: 0, max: 10, step: 1 },
  description: `what ${key} means`,
  unit: 'count',
  phase: 'auto',
  direction: 'higher_is_better',
  ...over,
});

const climb = (over: Partial<FormFieldInput> = {}): FormFieldInput =>
  counter('climb', {
    type: 'single_select',
    unit: 'enum',
    phase: 'endgame',
    is_ordinal: true,
    display_order: 3,
    config: {
      options: [
        { value: 'none', label: 'None' },
        { value: 'high', label: 'High' },
      ],
    },
    ...over,
  });

const section = (key: string, display_order: number): FormFieldInput => ({
  key,
  label: key,
  type: 'section',
  display_order,
  config: {},
});

let ctx: FakeContext;
let formId: string;
let v1: string;
let v2: string;

/** A scouting_entries row bound to a version; `deleted` makes it a tombstone. */
let entrySeq = 0;
function entry(versionId: string, deleted = false): void {
  entrySeq += 1;
  const id = `00000000-0000-4000-8000-${String(entrySeq).padStart(12, '0')}`;
  ctx.rows.scouting_entries.set(id, {
    id,
    version: 1,
    form_version_id: versionId,
    deleted_at: deleted ? AT : null,
  });
}

beforeEach(async () => {
  ctx = makeFakeContext();
  for (const [id, year] of [
    [SEASON, 2026],
    [EMPTY_SEASON, 2027],
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
  // v1: published, active. Fields saved out of display order on purpose.
  const created = await createForm(ADMIN, { season_id: SEASON, kind: 'match', name: 'Match' }, ctx);
  formId = created.id;
  v1 = created.draft_version_id;
  await saveDraftFields(
    ADMIN,
    {
      form_version_id: v1,
      fields: [
        climb(),
        counter('teleop_notes', { display_order: 2, phase: 'teleop' }),
        counter('auto_notes', { display_order: 1 }),
        section('endgame_section', 0),
        counter('notes_long', {
          type: 'long_text',
          unit: 'text',
          direction: 'neutral',
          display_order: 4,
          config: {},
        }),
      ],
    },
    ctx,
  );
  await publishFormVersion(ADMIN, { form_version_id: v1 }, ctx);
  await setScoringRules(
    ADMIN,
    {
      form_id: formId,
      rules: [
        { field_key: 'auto_notes', points: 4 },
        { field_key: 'climb', points: 0, option_points: { none: 0, high: 10 } },
      ],
    },
    ctx,
  );
  // v2: a draft that removed teleop_notes (deprecated in v2), saved by the second admin.
  const forked = await saveDraftFields(
    ADMIN_2,
    {
      form_version_id: v1,
      fields: [
        counter('auto_notes', { display_order: 1 }),
        climb(),
        section('endgame_section', 0),
        counter('notes_long', {
          type: 'long_text',
          unit: 'text',
          direction: 'neutral',
          display_order: 4,
          config: {},
        }),
      ],
    },
    ctx,
  );
  v2 = forked.new_version_id!;
});

describe('getFormVersion (task 1.28)', () => {
  it('returns the fields in display_order with their scoring attached', async () => {
    const result = await getFormVersion(ADMIN, { form_version_id: v1 }, ctx);
    expect(result.fields.map((f) => f.key)).toEqual([
      'endgame_section',
      'auto_notes',
      'teleop_notes',
      'climb',
      'notes_long',
    ]);
    const byKey = new Map(result.fields.map((f) => [f.key, f]));
    expect(byKey.get('auto_notes')).toMatchObject({ points: 4, option_points: null });
    expect(byKey.get('climb')).toMatchObject({
      points: 0,
      option_points: { none: 0, high: 10 },
    });
    expect(byKey.get('teleop_notes')).toMatchObject({ points: null, option_points: null });
    expect(byKey.get('notes_long')).toMatchObject({ points: null, option_points: null });
    expect(byKey.get('auto_notes')!.id).toEqual(expect.any(String));
  });

  it('includes deprecated fields, flagged, and summarises the version', async () => {
    entry(v2);
    entry(v2, true);
    const result = await getFormVersion(ADMIN, { form_version_id: v2 }, ctx);
    expect(result.fields.find((f) => f.key === 'teleop_notes')).toMatchObject({ deprecated: true });
    expect(result).toMatchObject({
      id: v2,
      form_id: formId,
      version_no: 2,
      status: 'draft',
      published_at: null,
      is_active: false,
      is_locked: true,
      field_count: 3,
      entry_count: 1,
      updated_by: { id: 'u-admin-2', full_name: 'Second Admin' },
    });
  });

  it('refuses an unknown version as not-found', async () => {
    await expect(getFormVersion(ADMIN, { form_version_id: NOPE }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('getFormDictionary (SPEC-FINAL 16.8)', () => {
  it('returns one row per live data field of the active version, with meaning, options and points', async () => {
    const result = await getFormDictionary(ADMIN, { form_id: formId }, ctx);
    expect(result.form_id).toBe(formId);
    expect(result.version_no).toBe(1);
    expect(result.fields.map((f) => f.key)).toEqual([
      'auto_notes',
      'teleop_notes',
      'climb',
      'notes_long',
    ]);
    expect(result.fields[0]).toEqual({
      key: 'auto_notes',
      label: 'auto_notes',
      description: 'what auto_notes means',
      type: 'counter',
      unit: 'count',
      phase: 'auto',
      direction: 'higher_is_better',
      category: null,
      expected_range: null,
      include_in_ai_context: null,
      is_ordinal: null,
      options: null,
      points: 4,
      option_points: null,
    });
    expect(result.fields[2]).toMatchObject({
      key: 'climb',
      is_ordinal: true,
      options: [
        { value: 'none', label: 'None' },
        { value: 'high', label: 'High' },
      ],
      points: 0,
      option_points: { none: 0, high: 10 },
    });
  });

  it('excludes deprecated fields', async () => {
    await publishFormVersion(ADMIN, { form_version_id: v2 }, ctx);
    const result = await getFormDictionary(ADMIN, { form_id: formId }, ctx);
    expect(result.version_no).toBe(2);
    expect(result.fields.map((f) => f.key)).toEqual(['auto_notes', 'climb', 'notes_long']);
  });

  it('answers no fields for a form with no active version', async () => {
    const other = await createForm(ADMIN, { season_id: SEASON, kind: 'super', name: 'Super' }, ctx);
    expect(await getFormDictionary(ADMIN, { form_id: other.id }, ctx)).toEqual({
      form_id: other.id,
      version_no: null,
      fields: [],
    });
  });
});

describe('getForm', () => {
  it('returns the form row with its versions newest first', async () => {
    const result = await getForm(ADMIN, { form_id: formId }, ctx);
    expect(result).toMatchObject({
      id: formId,
      season_id: SEASON,
      kind: 'match',
      name: 'Match',
      active_version_id: v1,
      timer_config: { phases: [] },
    });
    expect(result.versions.map((v) => [v.version_no, v.status, v.is_active])).toEqual([
      [2, 'draft', false],
      [1, 'published', true],
    ]);
  });

  it('refuses an unknown form as not-found', async () => {
    await expect(getForm(ADMIN, { form_id: NOPE }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('listForms (SPEC-FINAL 5.9, design 13-forms)', () => {
  it('lists the season’s forms, match then super, each with its versions newest first', async () => {
    await createForm(ADMIN, { season_id: SEASON, kind: 'super', name: 'Super' }, ctx);
    const result = await listForms(ADMIN, { season_id: SEASON }, ctx);
    expect(result.season_id).toBe(SEASON);
    expect(result.forms.map((f) => f.kind)).toEqual(['match', 'super']);
    const match = result.forms[0]!;
    expect(match).toMatchObject({ id: formId, name: 'Match', active_version_id: v1 });
    expect(match.versions.map((v) => v.version_no)).toEqual([2, 1]);
  });

  it('counts live entries per version only: a soft-deleted entry is not counted', async () => {
    entry(v1);
    entry(v1);
    entry(v1, true);
    const [match] = (await listForms(ADMIN, { season_id: SEASON }, ctx)).forms;
    const byNo = new Map(match!.versions.map((v) => [v.version_no, v]));
    expect(byNo.get(1)!.entry_count).toBe(2);
    expect(byNo.get(2)!.entry_count).toBe(0);
  });

  it('resolves updated_by to a name, and counts live non-section fields', async () => {
    const [match] = (await listForms(ADMIN, { season_id: SEASON }, ctx)).forms;
    const [draft, published] = match!.versions;
    expect(draft).toMatchObject({
      status: 'draft',
      published_at: null,
      field_count: 3,
      updated_by: { id: 'u-admin-2', full_name: 'Second Admin' },
      updated_at: expect.any(String),
    });
    expect(published).toMatchObject({
      status: 'published',
      published_at: expect.any(String),
      field_count: 4,
      updated_by: { id: 'u-admin', full_name: 'Fixture admin' },
    });
  });

  it('marks the active version, and gives the effective lock', async () => {
    entry(v2, true); // a soft-deleted entry still binds the draft
    const [match] = (await listForms(ADMIN, { season_id: SEASON }, ctx)).forms;
    const [draft, published] = match!.versions;
    expect(published).toMatchObject({ is_active: true, is_locked: false });
    expect(draft).toMatchObject({ is_active: false, is_locked: true, entry_count: 0 });

    (ctx.formVersions.get(v1) as Record<string, unknown>).is_locked = true;
    const [again] = (await listForms(ADMIN, { season_id: SEASON }, ctx)).forms;
    expect(again!.versions[1]).toMatchObject({ is_locked: true });
  });

  it('gives a null updated_by for a version nobody stamped', async () => {
    (ctx.formVersions.get(v1) as Record<string, unknown>).updated_by = null;
    const [match] = (await listForms(ADMIN, { season_id: SEASON }, ctx)).forms;
    expect(match!.versions[1]!.updated_by).toBeNull();
  });

  it('answers no forms for a season with none, and not-found for an unknown season', async () => {
    expect(await listForms(ADMIN, { season_id: EMPTY_SEASON }, ctx)).toEqual({
      season_id: EMPTY_SEASON,
      forms: [],
    });
    await expect(listForms(ADMIN, { season_id: NOPE }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('the read queries: any authenticated caller, a service caller included', () => {
  it('lets a scouter, a lead and a service caller call all four', async () => {
    for (const caller of [SCOUTER, LEAD, SERVICE]) {
      await expect(getForm(caller, { form_id: formId }, ctx)).resolves.toMatchObject({
        id: formId,
      });
      await expect(getFormVersion(caller, { form_version_id: v1 }, ctx)).resolves.toMatchObject({
        id: v1,
      });
      await expect(getFormDictionary(caller, { form_id: formId }, ctx)).resolves.toMatchObject({
        form_id: formId,
      });
      await expect(listForms(caller, { season_id: SEASON }, ctx)).resolves.toMatchObject({
        season_id: SEASON,
      });
    }
  });

  it('refuses a malformed input as invalid', async () => {
    await expect(getForm(SERVICE, { form_id: 'f-1' }, ctx)).rejects.toMatchObject({
      code: 'invalid',
    });
  });
});

describe('saved exports (SPEC-FINAL 5.1, v1.22)', () => {
  const stored = (id: string, ageMs: number) =>
    ctx.formExports.set(id, {
      id,
      form_id: formId,
      label: id,
      definition: { kind: 'match', fields: [{ type: 'counter' }, { type: 'section' }] },
      created_by: 'u-admin-2',
      created_at: new Date(ctx.nowValue.getTime() - ageMs).toISOString(),
    });

  it('lists exports newest first with their author, after deleting those older than 24 h', async () => {
    const old = '55555555-5555-4555-8555-555555555551';
    const a = '55555555-5555-4555-8555-555555555552';
    const b = '55555555-5555-4555-8555-555555555553';
    stored(old, FORM_EXPORT_TTL_MS + 1000);
    stored(a, 60_000);
    stored(b, 1000);

    const result = await listFormExports(ADMIN, {}, ctx);

    expect(ctx.formExports.has(old)).toBe(false);
    expect(result.exports.map((e) => e.id)).toEqual([b, a]);
    expect(result.exports[0]).toMatchObject({
      form_id: formId,
      kind: 'match',
      field_count: 1,
      created_by: { id: 'u-admin-2', full_name: 'Second Admin' },
      expires_in_seconds: FORM_EXPORT_TTL_MS / 1000 - 1,
    });
  });

  it('an export older than 24 h is gone after the next listFormExports (fake clock)', async () => {
    const saved = await saveFormExport(ADMIN, { form_id: formId, form_version_id: v2 }, ctx);
    expect((await listFormExports(ADMIN, {}, ctx)).exports.map((e) => e.id)).toEqual([saved.id]);
    ctx.nowValue = new Date(ctx.nowValue.getTime() + FORM_EXPORT_TTL_MS + 1);
    expect((await listFormExports(ADMIN, {}, ctx)).exports).toEqual([]);
    expect(ctx.formExports.has(saved.id)).toBe(false);
  });

  it('getFormExport returns the summary and the definition it holds', async () => {
    const saved = await saveFormExport(ADMIN_2, { form_id: formId, form_version_id: v2 }, ctx);
    const result = await getFormExport(ADMIN, { export_id: saved.id }, ctx);
    expect(result).toEqual({
      ...saved,
      definition: await exportForm(ADMIN, { form_id: formId, form_version_id: v2 }, ctx),
    });
  });

  it('getFormExport of an expired-but-present row is not-found', async () => {
    const expired = '55555555-5555-4555-8555-555555555554';
    stored(expired, FORM_EXPORT_TTL_MS + 1);
    await expect(getFormExport(ADMIN, { export_id: expired }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
    expect(ctx.formExports.has(expired)).toBe(true); // a get does not purge
    await expect(getFormExport(ADMIN, { export_id: NOPE }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('refuses a non-admin (lead, scouter, service) saveFormExport, listFormExports and getFormExport', async () => {
    const saved = await saveFormExport(ADMIN, { form_id: formId, form_version_id: v2 }, ctx);
    for (const caller of [LEAD, SCOUTER, SERVICE]) {
      await expect(
        saveFormExport(caller, { form_id: formId, form_version_id: v2 }, ctx),
      ).rejects.toMatchObject({ code: 'forbidden' });
      await expect(listFormExports(caller, {}, ctx)).rejects.toMatchObject({ code: 'forbidden' });
      await expect(getFormExport(caller, { export_id: saved.id }, ctx)).rejects.toMatchObject({
        code: 'forbidden',
      });
    }
    expect(ctx.formExports.size).toBe(1);
  });
});
