import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { goOnline, openBuilder, server } from '@/test/builderHarness';
import { FORM_ID } from '@/test/formFixtures';
import { PAUSE_MS } from './useUndoHistory';

/*
 * UF.14: going back in the builder. Undo / Redo over every edit since the version was loaded or
 * last saved — fields and their points as one step — from the top bar's buttons and from
 * Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y; the "← Forms" link; every dialog closing with Esc and Cancel.
 */

const draftPath = `/admin/forms/${FORM_ID}?version=4`;
const canvas = () => screen.getByRole('region', { name: 'Form' });
const settings = () => screen.getByRole('region', { name: 'Field settings' });
const saveState = () => document.querySelector<HTMLElement>('[data-save-state]')!;
const undoButton = () => screen.getByRole('button', { name: 'Undo' });
const redoButton = () => screen.getByRole('button', { name: 'Redo' });
/** The settings pane's key line: the selected field's key. */
const paneKey = () => settings().querySelector('code')!.textContent;
/** The keys on the canvas's page, in order. */
const canvasKeys = () =>
  [...canvas().querySelectorAll<HTMLElement>('[data-field-key]')].map((el) => el.dataset.fieldKey);
/** dnd-kit's keyboard sensor listens for the next key only after a tick. */
const tick = () => act(() => new Promise((done) => setTimeout(done, 20)));

const undoKey = (u: ReturnType<typeof userEvent.setup>) => u.keyboard('{Control>}z{/Control}');
const redoShiftKey = (u: ReturnType<typeof userEvent.setup>) =>
  u.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
const redoYKey = (u: ReturnType<typeof userEvent.setup>) => u.keyboard('{Control>}y{/Control}');

/** saveDraftFields as the server answers it: every field back with an id. */
const savesFields = (input: Record<string, unknown>) => ({
  form_version_id: input.form_version_id,
  new_version_id: null,
  version_no: 4,
  updated_at: '2026-10-08T09:30:00.000Z',
  fields: (input.fields as Record<string, unknown>[]).map((f, i) => ({
    ...f,
    id: f.id ?? `00000000-0000-4000-8000-00000000d0${String(i).padStart(2, '0')}`,
    form_version_id: input.form_version_id,
    deprecated: false,
  })),
  incomplete: [],
});

afterEach(() => {
  vi.restoreAllMocks();
  goOnline();
});

/** A slow budget: under a full run these whole-builder flows outlast vitest's 5 s default. */
const SLOW = { timeout: 10_000 };

/**
 * Ctrl+Z pressed on an element, as the browser sends it: true when nothing prevented its
 * default, so the box's own undo would run.
 */
const pressUndo = (el: Element) => fireEvent.keyDown(el, { key: 'z', code: 'KeyZ', ctrlKey: true });

describe('Builder undo and redo (UF.14)', SLOW, () => {
  it('both are held on load; a field added from the palette is undone and redone', async () => {
    await openBuilder(draftPath, server().rpc);
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /^Add Counter:/ }));
    expect(canvasKeys()).toContain('auto_counter');
    expect(undoButton()).toBeEnabled();
    expect(redoButton()).toBeDisabled();

    await u.click(undoButton());
    expect(canvasKeys()).not.toContain('auto_counter');
    expect(saveState()).not.toHaveTextContent('Unsaved changes');
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeEnabled();

    await u.click(redoButton());
    expect(canvasKeys()).toContain('auto_counter');
    expect(saveState()).toHaveTextContent('● Unsaved changes');
    expect(redoButton()).toBeDisabled();
  });

  it('typing a label is one step per pause, and its following key goes back with it; Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    await openBuilder(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /^Add Counter:/ }));
    const label = () => within(settings()).getByLabelText('Label');
    await u.clear(label());
    await u.type(label(), 'Drops');
    expect(paneKey()).toBe('auto_drops');
    now += PAUSE_MS + 1;
    await u.type(label(), ' low');
    expect(paneKey()).toBe('auto_drops_low');

    // Focus is still in the label box: the builder's undo, not the box's own.
    await undoKey(u);
    expect(label()).toHaveValue('Drops');
    expect(paneKey()).toBe('auto_drops');
    await undoKey(u);
    expect(label()).toHaveValue('Counter');
    expect(paneKey()).toBe('auto_counter');
    await undoKey(u);
    expect(canvasKeys()).not.toContain('auto_counter');
    expect(undoButton()).toBeDisabled();

    await redoShiftKey(u);
    expect(canvasKeys()).toContain('auto_counter');
    await redoYKey(u);
    expect(label()).toHaveValue('Drops');
    expect(paneKey()).toBe('auto_drops');
    await redoYKey(u);
    expect(label()).toHaveValue('Drops low');
    expect(redoButton()).toBeDisabled();
  });

  it('a points edit is a step of its own, and an undo brings a field back with its points', async () => {
    await openBuilder(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /^Add Counter:/ }));
    const box = within(settings()).getByLabelText('Points per unit');
    await u.clear(box);
    await u.type(box, '5');
    expect(within(canvas()).getByText('5/ea pts')).toBeVisible();

    await undoKey(u);
    expect(within(canvas()).queryByText('5/ea pts')).toBeNull();
    expect(canvasKeys()).toContain('auto_counter');
    await undoKey(u);
    expect(canvasKeys()).not.toContain('auto_counter');
    expect(saveState()).not.toHaveTextContent('Unsaved changes');

    await u.click(redoButton());
    await u.click(redoButton());
    expect(canvasKeys()).toContain('auto_counter');
    expect(within(canvas()).getByText('5/ea pts')).toBeVisible();
    expect(within(settings()).getByLabelText('Points per unit')).toHaveValue('5');
  });

  it('a reorder by the grip is undone and redone', async () => {
    await openBuilder(draftPath, server().rpc);
    expect(canvasKeys()).toEqual(['auto_leave', 'auto_high']);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const item = this.closest<HTMLElement>('[data-field-key]');
      const all = [...document.querySelectorAll('[data-field-key]')];
      const top = item ? all.indexOf(item) * 100 : 0;
      return DOMRect.fromRect({ x: 0, y: top, width: 380, height: 90 });
    });
    const grip = within(canvas()).getByRole('button', { name: 'Move Left the start zone' });
    grip.focus();
    fireEvent.keyDown(grip, { code: 'Space', key: ' ' });
    await tick();
    fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
    await tick();
    fireEvent.keyDown(document, { code: 'Space', key: ' ' });
    await tick();
    await waitFor(() => expect(canvasKeys()).toEqual(['auto_high', 'auto_leave']));

    const u = userEvent.setup();
    await u.click(undoButton());
    expect(canvasKeys()).toEqual(['auto_leave', 'auto_high']);
    await u.click(redoButton());
    expect(canvasKeys()).toEqual(['auto_high', 'auto_leave']);
  });

  it('Edit as JSON’s Apply is one step: the fields and their points come back together', async () => {
    await openBuilder(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'More' }));
    await u.click(screen.getByRole('menuitem', { name: /Edit as JSON/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit as JSON' });
    const editor = within(dialog).getByRole('textbox', { name: 'The form as JSON' });
    const parsed = JSON.parse((editor as HTMLTextAreaElement).value);
    parsed.fields[2].label = 'Teleop pieces high';
    parsed.scoring_rules = parsed.scoring_rules.map((r: { field_key: string; points: number }) =>
      r.field_key === 'tele_high' ? { ...r, points: 5 } : r,
    );
    fireEvent.change(editor, { target: { value: JSON.stringify(parsed, null, 2) } });
    await u.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await u.click(within(canvas()).getByRole('tab', { name: /Teleop/ }));
    expect(within(canvas()).getByText('Teleop pieces high')).toBeVisible();
    expect(within(canvas()).getByText('5/ea pts')).toBeVisible();

    await undoKey(u);
    expect(within(canvas()).getByText('Teleop high')).toBeVisible();
    expect(within(canvas()).getByText('4/ea pts')).toBeVisible();
    expect(saveState()).not.toHaveTextContent('Unsaved changes');
    await redoYKey(u);
    expect(within(canvas()).getByText('Teleop pieces high')).toBeVisible();
    expect(within(canvas()).getByText('5/ea pts')).toBeVisible();
  });

  it('undoing Remove field on a field never saved brings it back with its points', async () => {
    await openBuilder(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /^Add Counter:/ }));
    const box = within(settings()).getByLabelText('Points per unit');
    await u.clear(box);
    await u.type(box, '5');
    await u.click(within(settings()).getByRole('button', { name: 'Field actions: Counter' }));
    await u.click(screen.getByRole('menuitem', { name: /Remove field/ }));
    expect(canvasKeys()).not.toContain('auto_counter');

    await u.click(undoButton());
    expect(canvasKeys()).toContain('auto_counter');
    expect(within(canvas()).getByText('5/ea pts')).toBeVisible();
    expect(within(settings()).getByLabelText('Points per unit')).toHaveValue('5');
    await u.click(redoButton());
    expect(canvasKeys()).not.toContain('auto_counter');
  });

  it('undoing a retype brings back the type, its settings and the points it dropped', async () => {
    await openBuilder(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(within(canvas()).getByRole('tab', { name: /Teleop/ }));
    await u.click(within(canvas()).getByRole('button', { name: 'Teleop high, Counter' }));
    expect(within(canvas()).getByText('4/ea pts')).toBeVisible();
    // Saved and complete, its Field group starts folded.
    await u.click(within(settings()).getByRole('button', { name: 'Field', expanded: false }));
    await u.selectOptions(within(settings()).getByLabelText('Type'), 'long_text');
    expect(within(canvas()).getByRole('button', { name: 'Teleop high, Long text' })).toBeVisible();
    expect(within(canvas()).queryByText('4/ea pts')).toBeNull();

    await u.click(undoButton());
    expect(within(canvas()).getByRole('button', { name: 'Teleop high, Counter' })).toBeVisible();
    expect(within(settings()).getByLabelText('Type')).toHaveValue('counter');
    expect(within(settings()).getByLabelText('Points per unit')).toHaveValue('4');
    expect(within(canvas()).getByText('4/ea pts')).toBeVisible();
    expect(saveState()).not.toHaveTextContent('Unsaved changes');
  });

  it('Ctrl+Z inside a dialog is the dialog’s own: the builder’s edits stay', async () => {
    await openBuilder(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /^Add Counter:/ }));
    await u.click(screen.getByRole('button', { name: 'More' }));
    await u.click(screen.getByRole('menuitem', { name: /Edit as JSON/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit as JSON' });
    within(dialog).getByRole('textbox', { name: 'The form as JSON' }).focus();
    await undoKey(u);
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(canvasKeys()).toContain('auto_counter');
    expect(undoButton()).toBeEnabled();
  });

  it('a save starts a new history, and an undo never changes a saved field’s key', async () => {
    const { rpc } = server({ saveDraftFields: savesFields });
    await openBuilder(draftPath, rpc);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /^Add Counter:/ }));
    const label = () => within(settings()).getByLabelText('Label');
    await u.clear(label());
    await u.type(label(), 'Drops');
    expect(paneKey()).toBe('auto_drops');
    await u.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(saveState()).toHaveTextContent('Saved'));
    await waitFor(() => expect(undoButton()).toBeDisabled());

    // Nothing to undo across the save: the field the server has given an id stays as saved.
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();
    await undoKey(u);
    expect(canvasKeys()).toContain('auto_drops');
    expect(paneKey()).toBe('auto_drops');

    // Its key is permanent now: a label edit and its undo both leave it as it is. (Saved and
    // complete, its Field group starts folded.)
    await u.click(within(settings()).getByRole('button', { name: 'Field', expanded: false }));
    await u.type(label(), ' low');
    expect(paneKey()).toBe('auto_drops');
    await u.click(undoButton());
    expect(label()).toHaveValue('Drops');
    expect(paneKey()).toBe('auto_drops');
    expect(saveState()).not.toHaveTextContent('Unsaved changes');
  });

  it('opening another version starts a new history', async () => {
    const router = await openBuilder(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /^Add Counter:/ }));
    await u.click(undoButton());
    expect(redoButton()).toBeEnabled();

    await act(() => router.navigate(`/admin/forms/${FORM_ID}?version=3`));
    await screen.findByRole('button', { name: 'Save changes' });
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();
    await act(() => router.navigate(draftPath));
    await screen.findByRole('button', { name: 'Save draft' });
    await waitFor(() => expect(redoButton()).toBeDisabled());
    expect(undoButton()).toBeDisabled();
  });
});

describe('Builder undo keys and the box being typed in (UF.14 review)', SLOW, () => {
  it('in Try it, Ctrl+Z is the test box’s own and Undo / Redo are held: the builder’s edits stay', async () => {
    await openBuilder(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /^Add Counter:/ }));
    expect(undoButton()).toBeEnabled();
    await u.click(within(canvas()).getByRole('button', { name: 'Try it' }));
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();
    await u.click(within(canvas()).getByRole('tab', { name: /Notes/ }));
    const notes = within(canvas()).getByRole('textbox', { name: 'Notes' });
    await u.type(notes, 'Fast');
    expect(pressUndo(notes)).toBe(true);
    expect(notes).toHaveValue('Fast');

    await u.click(within(canvas()).getByRole('button', { name: 'Edit' }));
    expect(undoButton()).toBeEnabled();
    expect(saveState()).toHaveTextContent('● Unsaved changes');
    await u.click(within(canvas()).getByRole('tab', { name: /^Auto/ }));
    expect(canvasKeys()).toContain('auto_counter');
  });

  it('Ctrl+Z in one end of a half-filled expected range is the box’s own: the draft and the label typed before it stay', async () => {
    await openBuilder(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /^Add Counter:/ }));
    const label = () => within(settings()).getByLabelText('Label');
    await u.clear(label());
    await u.type(label(), 'Drops');
    const lowest = () => within(settings()).getByLabelText('Expected range, lowest');
    await u.type(lowest(), '3');

    // Typing one end commits nothing: the step on top is the label's, so the box keeps Ctrl+Z.
    expect(pressUndo(lowest())).toBe(true);
    expect(lowest()).toHaveValue('3');
    expect(label()).toHaveValue('Drops');
    expect(paneKey()).toBe('auto_drops');

    // The label box commits every keystroke: there, Ctrl+Z is still the builder's.
    await u.click(label());
    expect(pressUndo(label())).toBe(false);
    expect(label()).toHaveValue('Counter');
    expect(paneKey()).toBe('auto_counter');
  });

  it('Ctrl+Z in a Show when value not yet given is the box’s own: the picked field and the earlier edit stay', async () => {
    await openBuilder(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /^Add Counter:/ }));
    await u.click(within(settings()).getByRole('button', { name: /Show this field only when/ }));
    await u.selectOptions(within(settings()).getByLabelText('When field'), 'auto_high');
    const value = within(settings()).getByLabelText('Value');
    await u.click(value);

    expect(pressUndo(value)).toBe(true);
    expect(within(settings()).getByLabelText('When field')).toHaveValue('auto_high');
    expect(canvasKeys()).toContain('auto_counter');

    // Outside a text box the builder's undo is unchanged.
    await u.click(within(settings()).getByLabelText('When field'));
    expect(pressUndo(within(settings()).getByLabelText('When field'))).toBe(false);
    expect(canvasKeys()).not.toContain('auto_counter');
  });
});

describe('Builder: the way back (UF.14)', SLOW, () => {
  it('“← Forms” goes to the forms list on the form’s season', async () => {
    const router = await openBuilder(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(screen.getByRole('link', { name: 'Back to Forms' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/forms'));
    expect(router.state.location.search).toBe('?season=2026');
  });

  it('“← Forms” with unsaved changes asks first, and Stay keeps them', async () => {
    const router = await openBuilder(draftPath, server().rpc);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /^Add Counter:/ }));
    await u.click(screen.getByRole('link', { name: 'Back to Forms' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' });
    await u.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe(`/admin/forms/${FORM_ID}`);
    expect(canvasKeys()).toContain('auto_counter');
  });

  it('every dialog closes with Esc and with Cancel', async () => {
    await openBuilder(draftPath, server().rpc);
    const u = userEvent.setup();
    const openers: [string, () => Promise<void>][] = [
      ['Match timer', () => u.click(screen.getByRole('button', { name: 'Match timer' }))],
      ...(
        [
          ['Edit as JSON', /Edit as JSON/],
          ['Export the match form', /^Export/],
          ['Import a form', /^Import/],
          ['Delete the match form?', /Delete form/],
        ] as const
      ).map(
        ([name, item]) =>
          [
            name,
            async () => {
              await u.click(screen.getByRole('button', { name: 'More' }));
              await u.click(screen.getByRole('menuitem', { name: item }));
            },
          ] as [string, () => Promise<void>],
      ),
    ];
    for (const [name, open] of openers) {
      await open();
      const byEsc = await screen.findByRole('dialog', { name });
      within(byEsc).getAllByRole('button')[0]!.focus();
      await u.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog', { name })).toBeNull());

      await open();
      const byCancel = await screen.findByRole('dialog', { name });
      await u.click(within(byCancel).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name })).toBeNull());
    }
  });
});
