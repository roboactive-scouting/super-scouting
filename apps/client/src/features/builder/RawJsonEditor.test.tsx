import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { fourTypeFields, goOnline, openBuilder, server } from '@/test/builderHarness';
import { FORM_ID, V } from '@/test/formFixtures';
import { jsonProblem, problemLine } from './jsonPosition';

const draftPath = `/admin/forms/${FORM_ID}?version=4`;
const canvas = () => screen.getByRole('region', { name: 'Form' });
const dialog = () => screen.getByRole('dialog', { name: 'Edit as JSON' });
const editor = () => within(dialog()).getByRole('textbox', { name: 'The form as JSON' });
const apply = () => within(dialog()).getByRole('button', { name: 'Apply' });
const saveState = () => document.querySelector<HTMLElement>('[data-save-state]')!;

afterEach(() => goOnline());

/** Opens Edit as JSON through the More menu. */
async function openJson() {
  const u = userEvent.setup();
  await u.click(screen.getByRole('button', { name: 'More' }));
  await u.click(screen.getByRole('menuitem', { name: /Edit as JSON/ }));
  return u;
}

/** Replaces the editor's text in one change (typing 300 lines would take seconds). */
function setText(text: string) {
  fireEvent.change(editor(), { target: { value: text } });
}

describe('Edit as JSON: the raw-JSON editor (task 1.31)', () => {
  it('opens closed, behind the advanced item in the More menu', async () => {
    await openBuilder(draftPath, server().rpc);
    expect(screen.queryByRole('dialog')).toBeNull();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'More' }));
    const item = screen.getByRole('menuitem', { name: /Edit as JSON/ });
    expect(item).toHaveTextContent('Advanced: the whole form as text.');
    expect(screen.queryByRole('dialog')).toBeNull();
    await u.click(item);
    const text = (editor() as HTMLTextAreaElement).value;
    const parsed = JSON.parse(text);
    expect(Object.keys(parsed)).toEqual(['fields', 'scoring_rules']);
    expect(parsed.fields.map((f: { key: string }) => f.key)).toEqual([
      'auto_leave',
      'auto_high',
      'tele_high',
      'end_climb',
      'post_total',
      'post_notes',
    ]);
    // The export's shapes: no ids, and the points by key.
    expect(parsed.fields[0]).not.toHaveProperty('id');
    expect(parsed.scoring_rules).toContainEqual({
      field_key: 'auto_high',
      points: 6,
      option_points: null,
    });
    expect(apply()).toBeEnabled();
  });

  it('editing valid JSON updates the builder state, and Save sends the fields, then the whole rule set', async () => {
    const { rpc, calls } = server({
      saveDraftFields: (input) => ({
        form_version_id: V.v4,
        new_version_id: null,
        version_no: 4,
        updated_at: '2026-10-08T09:30:00.000Z',
        fields: (input.fields as Record<string, unknown>[]).map((f, i) => ({
          id:
            (f.id as string | undefined) ??
            `00000000-0000-4000-8000-0000000009${String(i).padStart(2, '0')}`,
          form_version_id: V.v4,
          deprecated: false,
          ...f,
        })),
        incomplete: [],
      }),
      setScoringRules: (input) => ({ rules: input.rules }),
    });
    await openBuilder(draftPath, rpc);
    const u = await openJson();
    const parsed = JSON.parse((editor() as HTMLTextAreaElement).value);
    parsed.fields[2].label = 'Teleop pieces high';
    parsed.scoring_rules = parsed.scoring_rules.map((r: { field_key: string; points: number }) =>
      r.field_key === 'tele_high' ? { ...r, points: 5 } : r,
    );
    setText(JSON.stringify(parsed, null, 2));
    expect(within(dialog()).queryByRole('alert')).toBeNull();
    await u.click(apply());
    expect(screen.queryByRole('dialog')).toBeNull();
    // The builder holds it, unsaved.
    expect(saveState()).toHaveTextContent('Unsaved changes');
    await u.click(within(canvas()).getByRole('tab', { name: /Teleop/ }));
    expect(within(canvas()).getByText('Teleop pieces high')).toBeVisible();
    expect(within(canvas()).getByText('5/ea pts')).toBeVisible();

    await u.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(saveState()).toHaveTextContent('Saved'));
    const writes = calls.filter(
      (c) => c.name === 'saveDraftFields' || c.name === 'setScoringRules',
    );
    expect(writes.map((c) => c.name)).toEqual(['saveDraftFields', 'setScoringRules']);
    const sentFields = writes[0]!.input.fields as { key: string; label: string; id?: string }[];
    expect(sentFields.find((f) => f.key === 'tele_high')).toMatchObject({
      label: 'Teleop pieces high',
      id: expect.any(String),
    });
    expect(writes[1]!.input.rules).toContainEqual({ field_key: 'tele_high', points: 5 });
  });

  it('invalid JSON shows one message naming the position, marks the line, and leaves the state untouched', async () => {
    await openBuilder(draftPath, server().rpc);
    const u = await openJson();
    const good = (editor() as HTMLTextAreaElement).value;
    const lines = good.split('\n');
    // Drop the comma after the first field's object ("},") so the next "{" has none before it.
    const at = lines.findIndex((l, i) => i > 2 && l === '    },');
    lines[at] = '    }';
    setText(lines.join('\n'));
    const alerts = within(dialog()).getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(
      `Line ${at + 2}, column 5: a comma is missing at the end of line ${at + 1}. Nothing was changed.`,
    );
    expect(dialog().querySelector('[data-bad-line]')).toHaveTextContent(String(at + 2));
    expect(editor()).toHaveAttribute('aria-invalid', 'true');
    expect(apply()).toBeDisabled();
    await u.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(saveState()).not.toHaveTextContent('Unsaved changes');
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  });

  it('a definition that fails validateFieldDefinition is refused with the field key named', async () => {
    await openBuilder(draftPath, server().rpc);
    await openJson();
    const parsed = JSON.parse((editor() as HTMLTextAreaElement).value);
    parsed.fields[2].config = { min: 10, max: 2 };
    setText(JSON.stringify(parsed, null, 2));
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(
      'The field “tele_high” is refused: config.max: max must not be below min.',
    );
    expect(apply()).toBeDisabled();
  });

  it('a renamed key of a saved field is refused the same way; missing meaning alone is not', async () => {
    await openBuilder(draftPath, server().rpc);
    await openJson();
    const parsed = JSON.parse((editor() as HTMLTextAreaElement).value);
    parsed.fields[2].key = 'tele_high_goal';
    setText(JSON.stringify(parsed, null, 2));
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(
      "The field “Teleop high” has the key “tele_high”, and a saved field's key never changes.",
    );
    expect(apply()).toBeDisabled();

    // A new field without its meaning saves as a draft does (Publish waits for it).
    parsed.fields[2].key = 'tele_high';
    parsed.fields.push({
      key: 'tele_dropped',
      label: 'Dropped',
      type: 'counter',
      display_order: 9,
    });
    setText(JSON.stringify(parsed, null, 2));
    expect(within(dialog()).queryByRole('alert')).toBeNull();
    expect(apply()).toBeEnabled();
  });

  it('a removed saved field plus a new one sharing its label in another phase is no rename (fix round 1)', async () => {
    // The design's form: Auto and Teleop both have "Pieces scored high".
    const fields = () =>
      fourTypeFields().map((f) =>
        f.key === 'tele_high' ? { ...f, label: 'Pieces scored high' } : f,
      );
    await openBuilder(draftPath, server({}, { fields }).rpc);
    await openJson();
    const parsed = JSON.parse((editor() as HTMLTextAreaElement).value);
    const teleHigh = parsed.fields.find((f: { key: string }) => f.key === 'tele_high');
    parsed.fields = parsed.fields.filter((f: { key: string }) => f.key !== 'tele_high');
    parsed.scoring_rules = parsed.scoring_rules.filter(
      (r: { field_key: string }) => r.field_key !== 'tele_high',
    );
    /** The text with `extra` added, and the computed total counting it in place of tele_high. */
    const withField = (extra: Record<string, unknown>) =>
      JSON.stringify(
        {
          ...parsed,
          fields: [
            ...parsed.fields.map((f: { key: string; config: Record<string, unknown> }) =>
              f.key === 'post_total'
                ? {
                    ...f,
                    config: {
                      ...f.config,
                      expression: {
                        kind: 'op',
                        op: '+',
                        left: { kind: 'field', key: 'auto_high' },
                        right: { kind: 'field', key: extra.key },
                      },
                    },
                  }
                : f,
            ),
            extra,
          ],
        },
        null,
        2,
      );
    // An Endgame counter with the same label and type: a removal and an addition.
    setText(withField({ ...teleHigh, key: 'end_high', phase: 'endgame' }));
    expect(within(dialog()).queryByRole('alert')).toBeNull();
    expect(apply()).toBeEnabled();

    // The same type, label, phase and section under a new key is the field renamed: refused.
    setText(withField({ ...teleHigh, key: 'tele_high_goal' }));
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(
      "The field “Pieces scored high” has the key “tele_high”, and a saved field's key never changes.",
    );
    expect(apply()).toBeDisabled();

    // …and under another section heading it is a new field again.
    setText(withField({ ...teleHigh, key: 'tele_high_goal', section: 'Defence' }));
    expect(within(dialog()).queryByRole('alert')).toBeNull();
  });

  it('refuses the form-level columns: kind, name and timer belong elsewhere', async () => {
    await openBuilder(draftPath, server().rpc);
    await openJson();
    const parsed = JSON.parse((editor() as HTMLTextAreaElement).value);
    setText(JSON.stringify({ ...parsed, name: 'Other' }, null, 2));
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('“name” cannot be edited here');
  });

  it('Apply is held offline, with the reason', async () => {
    await openBuilder(draftPath, server().rpc);
    await openJson();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
    await waitFor(() => expect(apply()).toBeDisabled());
    expect(within(dialog()).getByText(/Apply waits for the connection/)).toBeVisible();
  });
});

describe('jsonProblem', () => {
  it("names the design's case: line 46, column 11, the comma missing at the end of line 45", () => {
    const lines = Array.from({ length: 44 }, () => '');
    lines[0] = '[';
    for (let i = 1; i < 44; i++) lines[i] = '  0,';
    lines.push('          { "value": "high", "label": "High goal" }');
    lines.push('          { "value": "low", "label": "Low goal" }');
    lines.push(']');
    const problem = jsonProblem(lines.join('\n'))!;
    expect(problemLine(problem)).toBe(
      'Line 46, column 11: a comma is missing at the end of line 45.',
    );
  });

  it('says so for a trailing comma, a single-quoted string, an unclosed text and the end', () => {
    expect(jsonProblem('{"a": 1,}')!.message).toBe('a comma before } has nothing after it');
    expect(jsonProblem("{'a': 1}")!.message).toBe('a name here must be in double quotes');
    expect(jsonProblem('{"a": "b}')!.message).toBe('this text is not closed: a " is missing');
    expect(jsonProblem('{"a": [1, 2')!).toMatchObject({ line: 1, column: 12 });
    expect(jsonProblem('{"a": 1} x')!.message).toBe('there is more text after the end');
    expect(jsonProblem('{"a": [1, 2]}')).toBeNull();
  });
});

describe('Edit as JSON: final review fixes', () => {
  const settings = () => screen.getByRole('region', { name: 'Field settings' });

  it('Apply that leaves out a field never saved drops its points too: nothing is left unsaved (I1)', async () => {
    await openBuilder(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /^Add Counter:/ }));
    const box = within(settings()).getByLabelText('Points per unit');
    await u.clear(box);
    await u.type(box, '5');
    expect(saveState()).toHaveTextContent('● Unsaved changes');
    await openJson();
    const parsed = JSON.parse((editor() as HTMLTextAreaElement).value) as {
      fields: { key: string }[];
      scoring_rules: { field_key: string }[];
    };
    // The text as it was before the counter was added.
    setText(
      JSON.stringify({
        fields: parsed.fields.filter((f) => f.key !== 'auto_counter'),
        scoring_rules: parsed.scoring_rules.filter((r) => r.field_key !== 'auto_counter'),
      }),
    );
    await u.click(apply());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(canvas()).queryByText('auto_counter')).toBeNull();
    expect(saveState()).not.toHaveTextContent('Unsaved');
  });

  it('a key given in the text stays when the field is edited in the settings pane (I3)', async () => {
    await openBuilder(draftPath, server().rpc);
    const u = await openJson();
    const parsed = JSON.parse((editor() as HTMLTextAreaElement).value) as {
      fields: Record<string, unknown>[];
      scoring_rules: unknown[];
    };
    const leave = parsed.fields[0]!;
    setText(
      JSON.stringify({
        fields: [
          leave,
          { ...leave, key: 'auto_parked', label: 'Parked', display_order: 2 },
          ...parsed.fields.slice(1),
        ],
        scoring_rules: parsed.scoring_rules,
      }),
    );
    await u.click(apply());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await u.click(within(canvas()).getByRole('button', { name: 'Parked, Toggle' }));
    expect(
      within(settings()).getByText('set in Edit as JSON · permanent from the first save'),
    ).toBeVisible();
    await u.type(within(settings()).getByLabelText('Label'), ' fully');
    expect(within(settings()).getByText('auto_parked')).toBeVisible();
    expect(within(canvas()).getByText('auto_parked')).toBeVisible();
  });
});
