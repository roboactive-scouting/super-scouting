import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportSummary, FormDefinition, ScoredFieldRow } from '@frc/shared';
import {
  fourTypeFields,
  goOffline,
  goOnline,
  openBuilder,
  renderPages,
  server,
} from '@/test/builderHarness';
import { RpcError } from '@/data/rpc';
import { field, FORM_ID, V, VERSIONS } from '@/test/formFixtures';
import { deletedIn, exportFileName, importDiff, readDefinition } from './ImportExport';

const draftPath = `/admin/forms/${FORM_ID}?version=4`;
const noa = { id: '00000000-0000-4000-8000-0000000000b1', full_name: 'Noa Levi' };
const EXPORT_ID = '00000000-0000-4000-8000-0000000000e1';
const SUPER_EXPORT_ID = '00000000-0000-4000-8000-0000000000e2';

/** A field as a definition carries it: no id, version, flag or points. */
function draft(row: ScoredFieldRow) {
  const {
    id: _id,
    form_version_id: _v,
    deprecated: _d,
    points: _p,
    option_points: _o,
    ...rest
  } = row;
  return rest;
}

/** v3's definition, with what the import changes: +2 added, 1 type changed, 1 removed. */
function definition(): FormDefinition {
  const base = fourTypeFields().map(draft);
  const fields = base
    .filter((f) => f.key !== 'post_notes')
    .map((f) => (f.key === 'tele_high' ? { ...f, type: 'number' as const } : f));
  fields.push(
    { ...base[0]!, key: 'end_harmony', label: 'Harmony', phase: 'endgame', display_order: 20 },
    { ...base[2]!, key: 'tele_traps', label: 'Trap scores', display_order: 21 },
  );
  return {
    format: 1,
    kind: 'match',
    name: 'Match form',
    timer_config: {
      phases: [
        { phase: 'auto', seconds: 15 },
        { phase: 'teleop', seconds: 135 },
        { phase: 'endgame', seconds: 30 },
      ],
    },
    fields,
    scoring_rules: [{ field_key: 'auto_high', points: 6, option_points: null }],
  } as FormDefinition;
}

/** The draft with a Section heading in Teleop (fix round 1, I1: a section is a field with a key). */
function withSection() {
  const fields = fourTypeFields();
  fields.splice(
    2,
    0,
    field({
      key: 'tele_heading',
      label: 'Scoring',
      type: 'section',
      config: {},
      description: null,
      unit: null,
      phase: null,
      direction: null,
    }),
  );
  return fields;
}

/** The form's own export: every live field, its section included, as the definition. */
function ownExport(): FormDefinition {
  return { ...definition(), fields: withSection().map(draft) } as FormDefinition;
}

function summary(over: Partial<ExportSummary> = {}): ExportSummary {
  return {
    id: EXPORT_ID,
    form_id: FORM_ID,
    kind: 'match',
    label: 'Match form 2026 · v3',
    field_count: 7,
    created_by: noa,
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    expires_at: new Date(Date.now() + 22 * 3600_000).toISOString(),
    expires_in_seconds: 22 * 3600,
    ...over,
  };
}

const exportsServer = () => ({
  listFormExports: () => ({
    exports: [
      summary(),
      summary({
        id: SUPER_EXPORT_ID,
        kind: 'super',
        label: 'Super form 2025 · v2',
        field_count: 6,
      }),
    ],
  }),
  getFormExport: () => ({ ...summary(), definition: definition() }),
  importForm: (input: Record<string, unknown>) => ({
    form_id: (input.form_id as string | undefined) ?? '00000000-0000-4000-8000-0000000000f9',
    draft_version_id: V.v4,
    created: input.form_id === undefined,
  }),
});

async function more(item: RegExp) {
  const u = userEvent.setup();
  await u.click(screen.getByRole('button', { name: 'More' }));
  await u.click(screen.getByRole('menuitem', { name: item }));
  return u;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:form');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => goOnline());

describe('the More menu (task 1.31)', () => {
  it('holds More offline, and lists its four actions online', async () => {
    await openBuilder(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'More' }));
    const menu = screen.getByRole('menu', { name: 'More' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.querySelector('b')!.textContent),
    ).toEqual(['Edit as JSON', 'Export', 'Import', 'Delete form']);
    expect(within(menu).getByRole('separator')).toBeInTheDocument();
    goOffline();
    await waitFor(() => expect(screen.getByRole('button', { name: 'More' })).toBeDisabled());
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('holds Edit as JSON on a read-only older version, saying why', async () => {
    await openBuilder(`/admin/forms/${FORM_ID}?version=2`, server().rpc);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'More' }));
    const item = screen.getByRole('menuitem', { name: /Edit as JSON/ });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveTextContent('This version is read-only');
  });
});

describe('Export (task 1.31)', () => {
  it('starts on the draft, saves into Exports before any download is offered, then downloads a copy', async () => {
    const { rpc, calls } = server({
      saveFormExport: () => summary({ label: 'Match form 2026 · draft v4' }),
      exportForm: () => definition(),
    });
    await openBuilder(draftPath, rpc);
    const u = await more(/^Export/);
    const dialog = screen.getByRole('dialog', { name: 'Export the match form' });
    expect(within(dialog).getByRole('radio', { name: /Draft v4/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(dialog).getByRole('radio', { name: /v3 · active/ })).toBeInTheDocument();
    expect(within(dialog).getByText('Match form 2026 · draft v4')).toBeVisible();
    expect(within(dialog).getByText('entries (the scouted data)')).toBeVisible();
    // Never download-only: no download before the export is saved.
    expect(within(dialog).queryByRole('button', { name: /download/i })).toBeNull();

    await u.click(within(dialog).getByRole('radio', { name: /v3 · active/ }));
    await u.click(within(dialog).getByRole('radio', { name: /Draft v4/ }));
    await u.click(within(dialog).getByRole('button', { name: 'Save export' }));
    const download = await within(dialog).findByRole('button', { name: 'Also download a copy' });
    expect(
      within(dialog).getByText('Saved to Exports as “Match form 2026 · draft v4”'),
    ).toBeVisible();
    expect(calls.filter((c) => c.name === 'saveFormExport').map((c) => c.input)).toEqual([
      { form_id: FORM_ID, form_version_id: V.v4 },
    ]);
    expect(calls.some((c) => c.name === 'exportForm')).toBe(false);

    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await u.click(download);
    await waitFor(() => expect(clicked).toHaveBeenCalled());
    const names = calls.map((c) => c.name);
    expect(names.indexOf('saveFormExport')).toBeLessThan(names.indexOf('exportForm'));
    expect(calls.find((c) => c.name === 'exportForm')!.input).toEqual({
      form_id: FORM_ID,
      form_version_id: V.v4,
    });
    expect((clicked.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe(
      'form-match-2026-v4.json',
    );
    clicked.mockRestore();
  });

  it('says unsaved changes are not in the export (fix round 1)', async () => {
    await openBuilder(draftPath, server({ saveFormExport: () => summary() }).rpc);
    let u = await more(/^Export/);
    expect(
      within(screen.getByRole('dialog')).queryByText(/Unsaved changes are not in the export/),
    ).toBeNull();
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /^Add Toggle:/ }));
    await more(/^Export/);
    const dialog = screen.getByRole('dialog', { name: 'Export the match form' });
    expect(within(dialog).getByText('Unsaved changes are not in the export.')).toBeVisible();
    expect(dialog).toHaveTextContent('Save first to include them.');
  });

  it("opens from the Forms card's Export, held offline", async () => {
    renderPages('/admin/forms', server({ saveFormExport: () => summary() }).rpc);
    const card = await screen.findByRole('region', { name: 'Match form' });
    const u = userEvent.setup();
    await u.click(within(card).getByRole('button', { name: 'Export' }));
    const dialog = screen.getByRole('dialog', { name: 'Export the match form' });
    goOffline();
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Save export' })).toBeDisabled(),
    );
    expect(within(dialog).getByText(/saving waits for the connection/)).toBeVisible();
  });
});

describe('Import (task 1.31)', () => {
  it('into an existing form: the newest saved export of its kind, the diff counts and list, then the draft is replaced', async () => {
    const { rpc, calls } = server(exportsServer());
    await openBuilder(draftPath, rpc);
    const u = await more(/^Import/);
    const dialog = screen.getByRole('dialog', { name: 'Import a form' });
    await within(dialog).findByText('Match form 2026 · v3');
    expect(within(dialog).getByText('Choose another export')).toBeVisible();
    const tile = (label: string) => within(dialog).getByText(label).nextSibling;
    await waitFor(() => expect(tile('Adds')).toHaveTextContent('2'));
    expect(tile('Changes type')).toHaveTextContent('1');
    expect(tile('Removes')).toHaveTextContent('1');
    expect(tile('Unchanged')).toHaveTextContent('4');
    const list = within(dialog).getByRole('list', { name: 'What the import changes' });
    expect(within(list).getByText('tele_traps').parentElement).toHaveTextContent('Counter · new');
    expect(within(list).getByText('tele_high').parentElement).toHaveTextContent('Counter → Number');
    expect(within(list).getByText('post_notes').parentElement).toHaveTextContent(
      'Long text · removed',
    );
    // The unchanged fields fold into one row.
    expect(within(list).getByText('4 fields unchanged')).toBeVisible();
    expect(within(list).queryByText('auto_leave')).toBeNull();
    await u.click(within(list).getByRole('button', { name: 'Show' }));
    expect(within(list).getByText('auto_leave')).toBeVisible();
    expect(within(dialog).getByText(/match timer and scoring are not imported/)).toBeVisible();

    await u.click(within(dialog).getByRole('button', { name: 'Import as draft v4' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const sent = calls.find((c) => c.name === 'importForm')!.input;
    expect(sent).toMatchObject({ season_id: expect.any(String), form_id: FORM_ID });
    expect((sent.definition as FormDefinition).fields).toHaveLength(7);
    // The draft is read again.
    await waitFor(() =>
      expect(calls.filter((c) => c.name === 'getForm').length).toBeGreaterThan(1),
    );
  });

  it("re-importing the form's own export, sections included, reads as all unchanged (fix round 1)", async () => {
    const { rpc } = server(
      { ...exportsServer(), getFormExport: () => ({ ...summary(), definition: ownExport() }) },
      { fields: withSection },
    );
    await openBuilder(draftPath, rpc);
    await more(/^Import/);
    const dialog = screen.getByRole('dialog', { name: 'Import a form' });
    const tile = (label: string) => within(dialog).getByText(label).nextSibling;
    await waitFor(() => expect(tile('Unchanged')).toHaveTextContent('7'));
    expect(tile('Adds')).toHaveTextContent('0');
    expect(tile('Changes type')).toHaveTextContent('0');
    expect(tile('Removes')).toHaveTextContent('0');
    const list = within(dialog).getByRole('list', { name: 'What the import changes' });
    expect(within(list).getByText('7 fields unchanged')).toBeVisible();
    expect(within(list).queryByText(/removed|new/)).toBeNull();
  });

  it('a section the file drops is reported as removed (fix round 1)', async () => {
    const { rpc } = server(exportsServer(), { fields: withSection });
    await openBuilder(draftPath, rpc);
    await more(/^Import/);
    const dialog = screen.getByRole('dialog', { name: 'Import a form' });
    const list = await within(dialog).findByRole('list', { name: 'What the import changes' });
    expect(within(list).getByText('tele_heading').parentElement).toHaveTextContent(
      'Section · removed',
    );
    expect(within(dialog).getByText('Removes').nextSibling).toHaveTextContent('2');
  });

  it('from the active version with no draft, the import starts the next draft and opens it (fix round 1)', async () => {
    const versions = VERSIONS.filter((v) => v.status !== 'draft');
    const { rpc } = server(exportsServer(), { versions });
    const router = await openBuilder(`/admin/forms/${FORM_ID}?version=3`, rpc);
    const u = await more(/^Import/);
    const dialog = screen.getByRole('dialog', { name: 'Import a form' });
    await within(dialog).findByText('Choose another export');
    await waitFor(() =>
      expect(dialog).toHaveTextContent("It starts draft v4 from the file's fields"),
    );
    await u.click(within(dialog).getByRole('button', { name: 'Import as draft v4' }));
    await waitFor(() => expect(router.state.location.search).toBe('?version=4'));
    expect(router.state.location.pathname).toBe(`/admin/forms/${FORM_ID}`);
  });

  it('a file this computer cannot read says so instead of waiting (fix round 1)', async () => {
    const { rpc, calls } = server(exportsServer());
    await openBuilder(draftPath, rpc);
    const u = await more(/^Import/);
    const dialog = screen.getByRole('dialog', { name: 'Import a form' });
    await u.click(await within(dialog).findByRole('button', { name: 'Choose another export' }));
    const gone = new File(['{}'], 'form-match-2026-v3.json', { type: 'application/json' });
    Object.defineProperty(gone, 'text', { value: () => Promise.reject(new Error('gone')) });
    await u.upload(within(dialog).getByLabelText('A form file from your computer'), gone);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '“form-match-2026-v3.json” could not be read on this computer. Pick it again, or another file.',
    );
    expect(within(dialog).getByRole('button', { name: 'Import as draft v4' })).toBeDisabled();
    expect(calls.some((c) => c.name === 'importForm')).toBe(false);
  });

  it('a file with a malformed definition shows positioned problems and sends nothing', async () => {
    const { rpc, calls } = server(exportsServer());
    await openBuilder(draftPath, rpc);
    const u = await more(/^Import/);
    const dialog = screen.getByRole('dialog', { name: 'Import a form' });
    await within(dialog).findByText('Choose another export');
    await u.click(within(dialog).getByRole('button', { name: 'Choose another export' }));
    const bad = definition() as unknown as { fields: Record<string, unknown>[] };
    bad.fields[1] = { ...bad.fields[1], type: 'slider' };
    const file = new File([JSON.stringify(bad)], 'form-match-2026-v3.json', {
      type: 'application/json',
    });
    await u.upload(within(dialog).getByLabelText('A form file from your computer'), file);
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('This file is not a form export that can be imported.');
    expect(alert).toHaveTextContent('“auto_high” (field 2) · type:');
    expect(within(dialog).getByRole('button', { name: 'Import as draft v4' })).toBeDisabled();

    // Not JSON at all: the line and column.
    const broken = new File(['{\n  "format": 1\n  "kind": "match"\n}'], 'x.json');
    await u.click(within(dialog).getByRole('button', { name: 'Choose another' }));
    await u.upload(within(dialog).getByLabelText('A form file from your computer'), broken);
    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Line 3, column 3: a comma is missing at the end of line 2.',
      ),
    );
    expect(calls.some((c) => c.name === 'importForm')).toBe(false);
  });

  it('into an empty form from the Forms page: fields, meaning, scoring and timer, then draft v1 opens', async () => {
    const { rpc, calls } = server(exportsServer());
    const router = renderPages('/admin/forms', rpc);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: '2027 no forms yet' }));
    const card = screen.getByRole('region', { name: 'Match form (not created)' });
    expect(card).toHaveTextContent('export it from 2026, then pick it under Import.');
    await u.click(within(card).getByRole('button', { name: 'Import' }));
    const dialog = screen.getByRole('dialog', { name: 'Import the 2027 match form' });
    const picker = await within(dialog).findByRole('radiogroup');
    expect(within(picker).getAllByRole('radio')).toHaveLength(2);
    expect(within(picker).getByRole('radio', { name: /Match form 2026 · v3/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(picker).getByRole('radio', { name: /Match form 2026 · v3/ })).toHaveTextContent(
      'deleted in 22 h',
    );
    const tile = (label: string) => within(dialog).getByText(label).nextSibling;
    await waitFor(() => expect(tile('Fields')).toHaveTextContent('7'));
    expect(tile('With meaning')).toHaveTextContent('7');
    expect(tile('Scored')).toHaveTextContent('1');
    expect(tile('Match timer')).toHaveTextContent('3:00');

    // A super form's export does not go into the match form.
    await u.click(within(picker).getByRole('radio', { name: /Super form 2025/ }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'That export is a super form. It imports only into the super form.',
    );
    expect(within(dialog).getByRole('button', { name: 'Import as draft v1' })).toBeDisabled();
    await u.click(within(picker).getByRole('radio', { name: /Match form 2026 · v3/ }));
    await u.click(await within(dialog).findByRole('button', { name: 'Import as draft v1' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/admin/forms/00000000-0000-4000-8000-0000000000f9',
      ),
    );
    expect(router.state.location.search).toBe('?version=1');
    expect(calls.find((c) => c.name === 'importForm')!.input).not.toHaveProperty('form_id');
  });

  it('from the Forms page, an import into a form already there opens its draft (fix round 1)', async () => {
    const { rpc } = server({
      ...exportsServer(),
      importForm: () => ({ form_id: FORM_ID, draft_version_id: V.v4, created: false }),
    });
    const router = renderPages('/admin/forms', rpc);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: '2027 no forms yet' }));
    await u.click(
      within(screen.getByRole('region', { name: 'Match form (not created)' })).getByRole('button', {
        name: 'Import',
      }),
    );
    const dialog = screen.getByRole('dialog');
    await u.click(await within(dialog).findByRole('button', { name: 'Import as draft v1' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/admin/forms/${FORM_ID}`));
    expect(router.state.location.search).toBe('');
  });

  it('says a refusal in one sentence (form-exists)', async () => {
    const { rpc } = server({
      ...exportsServer(),
      importForm: () => {
        throw new RpcError('conflict', 'this season already has a match form', 409, true, {
          reason: 'form-exists',
          kind: 'match',
        });
      },
    });
    renderPages('/admin/forms', rpc);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: '2027 no forms yet' }));
    await u.click(
      within(screen.getByRole('region', { name: 'Match form (not created)' })).getByRole('button', {
        name: 'Import',
      }),
    );
    const dialog = screen.getByRole('dialog');
    await u.click(await within(dialog).findByRole('button', { name: 'Import as draft v1' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This season already has a match form. Reload the page to open it.',
    );
  });
});

describe('Delete form (task 1.31)', () => {
  it('names what goes with it, focuses Cancel, and stays disabled until the phrase matches exactly', async () => {
    const { rpc, calls } = server({
      deleteForm: (input) => ({ versions: 4, entries: 264, deleted: input.dry_run !== true }),
    });
    const router = await openBuilder(draftPath, rpc);
    const u = await more(/^Delete form/);
    const dialog = screen.getByRole('dialog', { name: 'Delete the match form?' });
    expect(within(dialog).getByText('Match form 2026')).toBeVisible();
    await within(dialog).findByText('264');
    expect(dialog).toHaveTextContent('4 versions (3 published, 1 draft)');
    expect(dialog).toHaveTextContent('264 entries from the 2026 events');
    expect(dialog).toHaveTextContent('removed from every device at the next sync');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    const confirm = within(dialog).getByRole('button', { name: 'Delete Match form 2026' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');

    const box = within(dialog).getByLabelText(/to confirm/);
    for (const nearMiss of [
      'delete match',
      'Delete match form',
      'delete match form ',
      'delete super form',
    ]) {
      await u.clear(box);
      await u.type(box, nearMiss);
      expect(confirm).toHaveAttribute('aria-disabled', 'true');
      await u.click(confirm);
    }
    expect(calls.filter((c) => c.name === 'deleteForm').map((c) => c.input)).toEqual([
      { form_id: FORM_ID, dry_run: true },
    ]);
    await u.clear(box);
    await u.type(box, 'delete match form');
    expect(confirm).not.toHaveAttribute('aria-disabled');
    await u.click(confirm);
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/forms'));
    expect(calls.filter((c) => c.name === 'deleteForm').at(-1)!.input).toEqual({
      form_id: FORM_ID,
    });
  });

  it('a count that failed is said, holds Delete, and Try again reads it (fix round 1)', async () => {
    let fail = true;
    const { rpc } = server({
      deleteForm: (input) => {
        if (fail) throw new RpcError('internal', 'boom', 500, true);
        return { versions: 4, entries: 264, deleted: input.dry_run !== true };
      },
    });
    await openBuilder(draftPath, rpc);
    const u = await more(/^Delete form/);
    const dialog = screen.getByRole('dialog', { name: 'Delete the match form?' });
    expect(await within(dialog).findByText(/What goes with it could not be counted/)).toBeVisible();
    expect(dialog).toHaveTextContent('its entries (not counted)');
    expect(dialog).not.toHaveTextContent('counting…');
    expect(dialog).toHaveTextContent('Deleting waits until what goes with it is counted.');
    const confirm = within(dialog).getByRole('button', { name: 'Delete Match form 2026' });
    await u.type(within(dialog).getByLabelText(/to confirm/), 'delete match form');
    expect(confirm).toHaveAttribute('aria-disabled', 'true');

    fail = false;
    await u.click(within(dialog).getByRole('button', { name: 'Try again' }));
    await within(dialog).findByText('264');
    expect(dialog).not.toHaveTextContent('could not be counted');
    expect(confirm).not.toHaveAttribute('aria-disabled');
  });

  it("Export it first opens Export; the card's ⋯ opens the same confirmation", async () => {
    renderPages(
      '/admin/forms',
      server({ deleteForm: () => ({ versions: 4, entries: 264, deleted: false }) }).rpc,
    );
    const card = await screen.findByRole('region', { name: 'Match form' });
    const u = userEvent.setup();
    await u.click(within(card).getByRole('button', { name: 'Form actions: Match form' }));
    await u.click(screen.getByRole('menuitem', { name: /Delete form/ }));
    const dialog = screen.getByRole('dialog', { name: 'Delete the match form?' });
    await u.click(within(dialog).getByRole('button', { name: 'Export it first' }));
    expect(screen.getByRole('dialog', { name: 'Export the match form' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Delete the match form?' })).toBeNull();
  });
});

describe('pure helpers', () => {
  it('importDiff matches by key and groups: added, type changed, removed, unchanged', () => {
    const f = (key: string, type: 'counter' | 'number' | 'toggle') => ({ key, label: key, type });
    const diff = importDiff(
      [f('a', 'counter'), f('b', 'counter'), f('c', 'toggle')],
      [f('a', 'counter'), f('b', 'number'), f('d', 'toggle')],
    );
    expect(diff.added.map((x) => x.key)).toEqual(['d']);
    expect(diff.typeChanged).toEqual([{ ...f('b', 'number'), from: 'counter' }]);
    expect(diff.removed.map((x) => x.key)).toEqual(['c']);
    expect(diff.unchanged.map((x) => x.key)).toEqual(['a']);
  });

  it('names the file and the time left', () => {
    expect(exportFileName('match', 2026, 4)).toBe('form-match-2026-v4.json');
    expect(exportFileName('super', null, 1)).toBe('form-super-v1.json');
    expect(deletedIn(22 * 3600 + 120)).toBe('deleted in 22 h');
    expect(deletedIn(40 * 60)).toBe('deleted in 40 min');
  });

  it('reads a valid file, and positions every problem of an invalid one', () => {
    expect(readDefinition(JSON.stringify(definition())).problems).toEqual([]);
    const { problems } = readDefinition(JSON.stringify({ ...definition(), kind: 'pit' }));
    expect(problems[0]).toMatch(/^kind: /);
  });
});
