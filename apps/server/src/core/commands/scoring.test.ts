import { beforeEach, describe, expect, it } from 'vitest';
import type { Caller, FormFieldDefinition } from '@frc/shared';
import { setScoringRules } from './scoring.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';

// Wire ids are uuids (the schemas are strict); the plan's 'f-1' / 'fv-1' become these.
const SEASON = '11111111-1111-4111-8111-111111111111';
const FORM = '33333333-3333-4333-8333-333333333333';
const ACTIVE = '44444444-4444-4444-8444-444444444441';
const DRAFT = '44444444-4444-4444-8444-444444444442';
const NOPE = '99999999-9999-4999-8999-999999999999';

const admin: Caller = { kind: 'user', userId: 'u-admin', role: 'admin' };
const lead: Caller = { kind: 'user', userId: 'u-lead', role: 'lead' };
const scouter: Caller = { kind: 'user', userId: 'u-scouter', role: 'scouter' };
const service: Caller = { kind: 'service', label: 'mcp' };

const AT = '2026-11-01T00:00:00.000Z';

let ctx: FakeContext;

function field(
  versionId: string,
  key: string,
  type: FormFieldDefinition['type'],
  over: Partial<FormFieldDefinition> = {},
): void {
  ctx.formFields.set(`${versionId}:${key}`, {
    id: crypto.randomUUID(),
    key,
    type,
    form_version_id: versionId,
    config: {},
    deprecated: false,
    display_order: 1,
    ...over,
  } as never);
}

function version(id: string, versionNo: number, publishedAt: string | null): void {
  ctx.formVersions.set(id, {
    id,
    version: 1,
    form_id: FORM,
    version_no: versionNo,
    published_at: publishedAt,
    is_locked: false,
    updated_by: null,
    created_at: AT,
    updated_at: AT,
  });
}

beforeEach(() => {
  ctx = makeFakeContext();
  ctx.seasons.set(SEASON, {
    id: SEASON,
    year: 2026,
    game_name: 'G',
    field_image_path: 'p',
    created_at: AT,
    updated_at: AT,
  });
  ctx.forms.set(FORM, {
    id: FORM,
    version: 1,
    season_id: SEASON,
    kind: 'match',
    name: 'Match',
    active_version_id: ACTIVE,
    timer_config: { phases: [] },
  });
  version(ACTIVE, 1, AT);
  field(ACTIVE, 'auto_notes', 'counter');
  field(ACTIVE, 'climb', 'single_select', {
    config: {
      options: [
        { value: 'none', label: 'None' },
        { value: 'high', label: 'High' },
      ],
    },
  });
  field(ACTIVE, 'notes', 'long_text');
});

describe('setScoringRules (SPEC-FINAL 4.1)', () => {
  it('stores points per unit for a counter', async () => {
    await setScoringRules(
      admin,
      { form_id: FORM, rules: [{ field_key: 'auto_notes', points: 5 }] },
      ctx,
    );
    expect(ctx.scoringRules.get(`${FORM}:auto_notes`)!.points).toBe(5);
  });

  it('stores option points for a select', async () => {
    await setScoringRules(
      admin,
      {
        form_id: FORM,
        rules: [{ field_key: 'climb', points: 0, option_points: { none: 0, high: 10 } }],
      },
      ctx,
    );
    expect(ctx.scoringRules.get(`${FORM}:climb`)!.option_points).toEqual({ none: 0, high: 10 });
  });

  it('refuses negative points anywhere', async () => {
    await expect(
      setScoringRules(
        admin,
        { form_id: FORM, rules: [{ field_key: 'auto_notes', points: -1 }] },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      setScoringRules(
        admin,
        { form_id: FORM, rules: [{ field_key: 'climb', points: 0, option_points: { high: -2 } }] },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('refuses a rule on an unscorable type', async () => {
    await expect(
      setScoringRules(admin, { form_id: FORM, rules: [{ field_key: 'notes', points: 1 }] }, ctx),
    ).rejects.toThrow(/long_text/);
  });

  it('refuses an option that is not in the field option list', async () => {
    await expect(
      setScoringRules(
        admin,
        { form_id: FORM, rules: [{ field_key: 'climb', points: 0, option_points: { moon: 5 } }] },
        ctx,
      ),
    ).rejects.toThrow(/moon/);
  });

  it('does not touch form_versions — a scoring change never creates a version', async () => {
    const before = ctx.formVersionWrites;
    await setScoringRules(
      admin,
      { form_id: FORM, rules: [{ field_key: 'auto_notes', points: 5 }] },
      ctx,
    );
    expect(ctx.formVersionWrites).toBe(before);
  });

  it('is keyed by (form_id, field_key), so it carries across versions', async () => {
    await setScoringRules(
      admin,
      { form_id: FORM, rules: [{ field_key: 'auto_notes', points: 5 }] },
      ctx,
    );
    expect([...ctx.scoringRules.keys()]).toEqual([`${FORM}:auto_notes`]);
  });

  it('refuses a lead', async () => {
    await expect(setScoringRules(lead, { form_id: FORM, rules: [] }, ctx)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('setScoringRules: replace semantics and positioned issues (task 1.28, decision A)', () => {
  it('replaces the whole rule set: a key not named loses its rule', async () => {
    await setScoringRules(
      admin,
      {
        form_id: FORM,
        rules: [
          { field_key: 'auto_notes', points: 5 },
          { field_key: 'climb', points: 0, option_points: { high: 10 } },
        ],
      },
      ctx,
    );
    const result = await setScoringRules(
      admin,
      { form_id: FORM, rules: [{ field_key: 'climb', points: 0, option_points: { high: 12 } }] },
      ctx,
    );
    expect(result).toEqual({
      rules: [{ field_key: 'climb', points: 0, option_points: { high: 12 } }],
    });
    expect([...ctx.scoringRules.keys()]).toEqual([`${FORM}:climb`]);
  });

  it('sends a kept rule with its existing id, so the upsert never re-keys it', async () => {
    await setScoringRules(
      admin,
      { form_id: FORM, rules: [{ field_key: 'auto_notes', points: 1 }] },
      ctx,
    );
    const id = ctx.scoringRules.get(`${FORM}:auto_notes`)!.id;
    const sent: Record<string, unknown>[][] = [];
    const replace = ctx.store.replaceScoringRules.bind(ctx.store);
    ctx.store.replaceScoringRules = async (formId, rules) => {
      sent.push(rules);
      return replace(formId, rules);
    };
    await setScoringRules(
      admin,
      {
        form_id: FORM,
        rules: [
          { field_key: 'auto_notes', points: 3 },
          { field_key: 'climb', points: 0, option_points: { high: 1 } },
        ],
      },
      ctx,
    );
    expect(sent[0]![0]).toMatchObject({ id, field_key: 'auto_notes', points: 3 });
    expect(sent[0]![1]!.id).not.toBe(id);
  });

  it('returns the rules sorted by key, with option_points null off the selects', async () => {
    const result = await setScoringRules(
      admin,
      {
        form_id: FORM,
        rules: [
          { field_key: 'climb', points: 0, option_points: { none: 0, high: 10 } },
          { field_key: 'auto_notes', points: 2.5, option_points: null },
        ],
      },
      ctx,
    );
    expect(result.rules).toEqual([
      { field_key: 'auto_notes', points: 2.5, option_points: null },
      { field_key: 'climb', points: 0, option_points: { none: 0, high: 10 } },
    ]);
  });

  it('an empty rule set clears the form’s scoring', async () => {
    await setScoringRules(
      admin,
      { form_id: FORM, rules: [{ field_key: 'auto_notes', points: 1 }] },
      ctx,
    );
    expect(await setScoringRules(admin, { form_id: FORM, rules: [] }, ctx)).toEqual({ rules: [] });
    expect(ctx.scoringRules.size).toBe(0);
  });

  it('accepts a live field of the draft as well as of the active version', async () => {
    version(DRAFT, 2, null);
    field(DRAFT, 'auto_notes', 'counter');
    field(DRAFT, 'teleop_notes', 'number');
    await setScoringRules(
      admin,
      {
        form_id: FORM,
        rules: [
          { field_key: 'teleop_notes', points: 2 },
          { field_key: 'climb', points: 0, option_points: { high: 3 } },
        ],
      },
      ctx,
    );
    expect([...ctx.scoringRules.keys()].sort()).toEqual([`${FORM}:climb`, `${FORM}:teleop_notes`]);
  });

  it('judges a key the draft retyped by the draft’s type', async () => {
    version(DRAFT, 2, null);
    field(DRAFT, 'auto_notes', 'short_text');
    await expect(
      setScoringRules(
        admin,
        { form_id: FORM, rules: [{ field_key: 'auto_notes', points: 1 }] },
        ctx,
      ),
    ).rejects.toThrow(/short_text/);
  });

  it('accepts option points for an option the draft dropped but the active version still has, and one the draft added (review #9)', async () => {
    version(DRAFT, 2, null);
    field(DRAFT, 'climb', 'single_select', {
      config: {
        options: [
          { value: 'none', label: 'None' },
          { value: 'mid', label: 'Mid' },
        ],
      },
    });
    await setScoringRules(
      admin,
      {
        form_id: FORM,
        rules: [{ field_key: 'climb', points: 0, option_points: { none: 0, mid: 4, high: 10 } }],
      },
      ctx,
    );
    expect(ctx.scoringRules.get(`${FORM}:climb`)!.option_points).toEqual({
      none: 0,
      mid: 4,
      high: 10,
    });
    // an option of neither is still refused
    await expect(
      setScoringRules(
        admin,
        { form_id: FORM, rules: [{ field_key: 'climb', points: 0, option_points: { moon: 1 } }] },
        ctx,
      ),
    ).rejects.toMatchObject({
      details: {
        reason: 'invalid-scoring',
        issues: [{ field_key: 'climb', path: 'rules.0.option_points.moon' }],
      },
    });
  });

  it("takes options from both when the draft made a single select multi, and the draft's type for scorability", async () => {
    version(DRAFT, 2, null);
    field(DRAFT, 'climb', 'multi_select', {
      config: { options: [{ value: 'deep', label: 'Deep' }] },
    });
    await setScoringRules(
      admin,
      {
        form_id: FORM,
        rules: [{ field_key: 'climb', points: 0, option_points: { high: 3, deep: 5 } }],
      },
      ctx,
    );
    expect(ctx.scoringRules.get(`${FORM}:climb`)!.option_points).toEqual({ high: 3, deep: 5 });
  });

  it('refuses a deprecated field, an unknown key and a duplicate, each positioned', async () => {
    field(ACTIVE, 'old', 'counter', { deprecated: true });
    await expect(
      setScoringRules(
        admin,
        {
          form_id: FORM,
          rules: [
            { field_key: 'old', points: 1 },
            { field_key: 'ghost', points: 1 },
            { field_key: 'auto_notes', points: 1 },
            { field_key: 'auto_notes', points: 2 },
          ],
        },
        ctx,
      ),
    ).rejects.toMatchObject({
      code: 'invalid',
      details: {
        reason: 'invalid-scoring',
        issues: [
          { field_key: 'old', path: 'rules.0.field_key', message: expect.any(String) },
          { field_key: 'ghost', path: 'rules.1.field_key', message: expect.any(String) },
          { field_key: 'auto_notes', path: 'rules.3.field_key', message: expect.any(String) },
        ],
      },
    });
    expect(ctx.scoringRules.size).toBe(0);
  });

  it('refuses option points off a select, and points on a select', async () => {
    await expect(
      setScoringRules(
        admin,
        {
          form_id: FORM,
          rules: [
            { field_key: 'auto_notes', points: 1, option_points: { a: 1 } },
            { field_key: 'climb', points: 4 },
          ],
        },
        ctx,
      ),
    ).rejects.toMatchObject({
      details: {
        reason: 'invalid-scoring',
        issues: [
          { field_key: 'auto_notes', path: 'rules.0.option_points' },
          { field_key: 'climb', path: 'rules.1.points' },
        ],
      },
    });
  });

  it('refuses an unknown form as not-found, and a malformed input as invalid', async () => {
    await expect(setScoringRules(admin, { form_id: NOPE, rules: [] }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(
      setScoringRules(admin, { form_id: FORM, rules: [], extra: 1 } as never, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('refuses a scouter and a service caller, writing nothing', async () => {
    for (const caller of [scouter, service]) {
      await expect(
        setScoringRules(
          caller,
          { form_id: FORM, rules: [{ field_key: 'auto_notes', points: 1 }] },
          ctx,
        ),
      ).rejects.toMatchObject({ code: 'forbidden' });
    }
    expect(ctx.scoringRules.size).toBe(0);
  });
});
