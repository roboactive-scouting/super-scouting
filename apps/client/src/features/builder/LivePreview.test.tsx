import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { fourTypeFields, goOnline, openBuilder, server } from '@/test/builderHarness';
import { field, FORM_ID } from '@/test/formFixtures';

const draftPath = `/admin/forms/${FORM_ID}?version=4`;
const canvas = () => screen.getByRole('region', { name: 'Form' });
const pane = () => screen.getByRole('region', { name: 'What this entry would save' });
const saved = () => JSON.parse(within(pane()).getByTestId('try-saved-data').textContent!);

afterEach(() => goOnline());

async function tryIt() {
  const u = userEvent.setup();
  await u.click(within(canvas()).getByRole('button', { name: 'Try it' }));
  return u;
}

describe('Try it: the live preview (task 1.31)', () => {
  it("renders inside the canvas's phone-width column (≤ 410 px), and the side pane shows the would-be-saved JSON", async () => {
    await openBuilder(draftPath, server().rpc);
    expect(screen.queryByRole('region', { name: 'What this entry would save' })).toBeNull();
    await tryIt();
    const list = within(canvas()).getByRole('list', { name: 'Try it' });
    // The canvas's own column: the 410 px one Edit draws in, not a frame of its own.
    const column = list.closest('.w-\\[410px\\]');
    expect(column).not.toBeNull();
    expect(within(canvas()).getByRole('button', { name: 'Try it' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // No grips, keys or selection in Try it.
    expect(within(canvas()).queryByRole('button', { name: /^Move / })).toBeNull();
    expect(within(canvas()).queryByText('auto_leave')).toBeNull();
    // The settings pane became "What this entry would save".
    expect(screen.queryByRole('region', { name: 'Field settings' })).toBeNull();
    expect(within(pane()).getByText('Nothing is saved or sent.')).toBeVisible();
    expect(saved()).toEqual({ auto_leave: false, tele_high: 0 });
    // The analysis gets the values, per field.
    const rows = within(pane()).getAllByRole('row');
    expect(rows.map((r) => r.textContent)).toEqual(['Left the start zoneNo', 'Teleop high0']);
  });

  it('uses the same FieldInput the scouter sees, so a counter is −/value/+ and never a text box', async () => {
    await openBuilder(draftPath, server().rpc);
    const u = await tryIt();
    await u.click(within(canvas()).getByRole('switch', { name: 'Left the start zone' }));
    const plus = within(canvas()).getByRole('button', { name: 'Pieces scored high plus one' });
    expect(
      within(canvas()).getByRole('button', { name: 'Pieces scored high minus one' }),
    ).toBeVisible();
    expect(within(canvas()).queryByRole('textbox')).toBeNull();
    expect(within(canvas()).queryByRole('spinbutton')).toBeNull();
    await u.click(plus);
    await u.click(plus);
    expect(saved()).toMatchObject({ auto_leave: true, auto_high: 2, post_total: 2 });
  });

  it('conditional fields appear and disappear as the preview is filled', async () => {
    await openBuilder(draftPath, server().rpc);
    const u = await tryIt();
    const counter = () =>
      within(canvas()).queryByRole('button', { name: /Pieces scored high plus/ });
    expect(counter()).toBeNull();
    await u.click(within(canvas()).getByRole('switch', { name: 'Left the start zone' }));
    expect(counter()).toBeVisible();
    await u.click(counter()!);
    expect(saved().auto_high).toBe(1);
    await u.click(within(canvas()).getByRole('switch', { name: 'Left the start zone' }));
    expect(counter()).toBeNull();
    // A hidden field records no value, so the computed total that needs it has none either.
    expect(saved()).toEqual({ auto_leave: false, tele_high: 0 });
  });

  it('nothing typed in the preview is ever submitted or drafted', async () => {
    const { rpc, calls } = server();
    await openBuilder(draftPath, rpc);
    const before = calls.length;
    const u = await tryIt();
    await u.click(within(canvas()).getByRole('switch', { name: 'Left the start zone' }));
    await u.click(within(canvas()).getByRole('button', { name: 'Pieces scored high plus one' }));
    await u.click(within(canvas()).getByRole('tab', { name: /Endgame/ }));
    await u.click(within(canvas()).getByRole('radio', { name: 'High bar' }));
    await u.click(within(canvas()).getByRole('tab', { name: /Notes/ }));
    await u.type(within(canvas()).getByRole('textbox', { name: 'Notes' }), 'Fast');
    expect(saved()).toMatchObject({ end_climb: 'high', post_notes: 'Fast', auto_high: 1 });
    expect(within(pane()).getByText('High bar')).toBeVisible();
    expect(within(pane()).getByText('“Fast”')).toBeVisible();

    // No call, no draft, no outbox row; the builder has nothing to save.
    expect(calls.slice(before)).toEqual([]);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.drafts.count()).toBe(0);
    expect(await db.practiceDrafts.count()).toBe(0);
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(document.querySelector('[data-save-state]')).not.toHaveTextContent('Unsaved changes');

    // Back to Edit: the settings pane returns; Try it kept what was filled.
    await u.click(within(canvas()).getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('region', { name: 'Field settings' })).toBeInTheDocument();
    await u.click(within(canvas()).getByRole('button', { name: 'Try it' }));
    expect(saved().post_notes).toBe('Fast');
    await u.click(within(pane()).getByRole('button', { name: 'Start over' }));
    expect(saved().post_notes).toBeUndefined();
    expect(calls.slice(before)).toEqual([]);
  });
});

describe('Try it: fix round 1 (task 1.31)', () => {
  it('Next incomplete leaves Try it for Edit, so the field it finds is shown selected', async () => {
    const fields = () => [
      ...fourTypeFields(),
      field({ key: 'tele_dropped', label: 'Dropped', description: null }),
    ];
    await openBuilder(draftPath, server({}, { fields }).rpc);
    const u = await tryIt();
    expect(screen.queryByRole('region', { name: 'Field settings' })).toBeNull();
    await u.click(screen.getByRole('button', { name: /Next incomplete/ }));
    expect(within(canvas()).getByRole('button', { name: 'Edit' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('region', { name: 'What this entry would save' })).toBeNull();
    const settings = screen.getByRole('region', { name: 'Field settings' });
    expect(within(settings).getByRole('heading', { name: 'Dropped' })).toBeVisible();
    expect(within(canvas()).getByRole('button', { name: 'Dropped, Counter' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it("drops a tried value once its field's type changes (here by Edit as JSON's Apply)", async () => {
    await openBuilder(draftPath, server().rpc);
    const u = await tryIt();
    await u.click(within(canvas()).getByRole('tab', { name: /Teleop/ }));
    const plus = within(canvas()).getByRole('button', { name: 'Teleop high plus one' });
    await u.click(plus);
    await u.click(plus);
    await u.click(within(canvas()).getByRole('tab', { name: /Notes/ }));
    await u.type(within(canvas()).getByRole('textbox', { name: 'Notes' }), 'Fast');
    expect(saved()).toMatchObject({ tele_high: 2, post_notes: 'Fast' });

    // Notes becomes a short text and Teleop high a number: neither keeps what Try it held.
    await u.click(screen.getByRole('button', { name: 'More' }));
    await u.click(screen.getByRole('menuitem', { name: /Edit as JSON/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit as JSON' });
    const editor = within(dialog).getByRole('textbox', { name: 'The form as JSON' });
    const parsed = JSON.parse((editor as HTMLTextAreaElement).value);
    for (const f of parsed.fields) {
      if (f.key === 'post_notes') f.type = 'short_text';
      if (f.key === 'tele_high') f.type = 'number';
    }
    fireEvent.change(editor, { target: { value: JSON.stringify(parsed, null, 2) } });
    await u.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(saved()).not.toHaveProperty('post_notes');
    expect(saved()).not.toHaveProperty('tele_high');
    expect(saved()).toEqual({ auto_leave: false });
  });
});
