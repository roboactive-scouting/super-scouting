import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TimerConfig } from '@frc/shared';
import { RpcError } from '@/data/rpc';
import { fourTypeFields, goOffline, goOnline, openBuilder, server } from '@/test/builderHarness';
import { FORM_ID, formOut, V, VERSIONS, versionOut } from '@/test/formFixtures';
import { STANDARD_TIMER, timerProblem } from './TimerConfigEditor';

const draftPath = `/admin/forms/${FORM_ID}?version=4`;
const STAMPED = '2026-10-09T10:00:00.000Z';

/**
 * The builder's server with a form whose timer is `timer`. `updateForm` answers with the timer
 * it was sent and, as the real one does, stamps the draft: its `updated_at` moves on.
 */
function timerServer(timer: TimerConfig = STANDARD_TIMER, over = {}) {
  let stamped = false;
  const rows = fourTypeFields();
  return server({
    getForm: () => ({ ...formOut(), timer_config: timer }),
    getFormVersion: (input) => {
      const row = VERSIONS.find((v) => v.id === input.form_version_id)!;
      const at = stamped && row.id === V.v4 ? { ...row, updated_at: STAMPED } : row;
      return versionOut(at, rows);
    },
    updateForm: (input) => {
      stamped = true;
      const { versions: _versions, ...row } = formOut();
      return { ...row, timer_config: input.timer_config };
    },
    ...over,
  });
}

async function openTimer(path = draftPath, s = timerServer()) {
  const u = userEvent.setup();
  await openBuilder(path, s.rpc);
  await u.click(screen.getByRole('button', { name: 'Match timer' }));
  const dialog = await screen.findByRole('dialog', { name: 'Match timer' });
  return { u, dialog, calls: s.calls };
}

const lengthBox = (dialog: HTMLElement, phase: string) =>
  within(dialog).getByRole('textbox', { name: `${phase} length in seconds` });

/** jsdom lays nothing out: give each row a place, so the keyboard sensor can move between them. */
function layOutRows() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const row = this.closest<HTMLElement>('[data-phase-row]');
    const top = row ? Number(row.dataset.phaseRow) * 56 : 0;
    return DOMRect.fromRect({ x: 0, y: top, width: 600, height: 56 });
  });
}

/**
 * dnd-kit's keyboard sensor: Space picks up, an arrow moves one place, Space drops. It listens
 * for the next key only after a tick.
 */
const tick = () => act(() => new Promise((done) => setTimeout(done, 20)));

/** The device asks for reduced motion, or not; every other query (the desktop width) matches. */
function reducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('reduced-motion') ? reduce : true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

/** The version's `updated_at` as the builder first reads it (draft v4). */
const LOADED_AT = VERSIONS.find((v) => v.id === V.v4)!.updated_at;

afterEach(() => {
  goOnline();
  vi.restoreAllMocks();
  // jsdom has no matchMedia (read as reduced motion).
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('Match timer (task 1.32, SPEC-FINAL 8.4)', () => {
  it('sits in the top bar left of More, and lists one row per phase with its m:ss', async () => {
    const s = timerServer();
    await openBuilder(draftPath, s.rpc);
    const timer = screen.getByRole('button', { name: 'Match timer' });
    const more = screen.getByRole('button', { name: 'More' });
    expect(timer.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.setup().click(timer);
    const dialog = await screen.findByRole('dialog', { name: 'Match timer' });
    expect(within(dialog).getByText(/The phases run in this order/)).toBeVisible();
    const rows = within(within(dialog).getByRole('list', { name: 'Phases' })).getAllByRole(
      'listitem',
    );
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByRole('combobox', { name: 'Phase 1' })).toHaveValue('auto');
    expect(within(rows[1]!).getByRole('combobox', { name: 'Phase 2' })).toHaveValue('teleop');
    expect(within(rows[2]!).getByRole('combobox', { name: 'Phase 3' })).toHaveValue('endgame');
    expect(lengthBox(dialog, 'Teleop')).toHaveValue('135');
    expect(rows[1]).toHaveTextContent('s · 2:15');
    expect(within(rows[0]!).getByRole('button', { name: 'Move Auto' })).toBeVisible();
    expect(within(rows[2]!).getByRole('button', { name: 'Remove Endgame' })).toBeVisible();
    expect(within(dialog).getByText(/Match ends at/)).toHaveTextContent(
      'Match ends at 180 s (3:00)',
    );
    expect(
      within(dialog).getByRole('img', {
        name: 'The match: Auto 0:15, then Teleop 2:15, then Endgame 0:30',
      }),
    ).toBeVisible();
    expect(within(dialog).getByText('Changing these is an in-place edit.')).toBeVisible();
    expect(within(dialog).getByText(/It never creates a new form version/)).toBeVisible();
    // Nothing changed yet: nothing to save.
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('updates the total live as a length changes', async () => {
    const { u, dialog } = await openTimer();
    await u.clear(lengthBox(dialog, 'Teleop'));
    await u.type(lengthBox(dialog, 'Teleop'), '120');
    expect(within(dialog).getByText(/Match ends at/)).toHaveTextContent(
      'Match ends at 165 s (2:45)',
    );
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('adds only a phase not yet used, and holds Add once all four are used', async () => {
    const { u, dialog } = await openTimer();
    await u.click(within(dialog).getByRole('button', { name: 'Add a phase' }));
    expect(within(dialog).getByRole('combobox', { name: 'Phase 4' })).toHaveValue('post_match');
    expect(lengthBox(dialog, 'After match')).toHaveValue('30');
    expect(within(dialog).getByText(/Match ends at/)).toHaveTextContent(
      'Match ends at 210 s (3:30)',
    );
    expect(within(dialog).getByRole('button', { name: 'Add a phase' })).toBeDisabled();

    await u.click(within(dialog).getByRole('button', { name: 'Remove Auto' }));
    expect(within(dialog).getAllByRole('combobox')).toHaveLength(3);
    expect(within(dialog).getByRole('combobox', { name: 'Phase 1' })).toHaveValue('teleop');
    // Auto is free again, so Add offers it.
    await u.click(within(dialog).getByRole('button', { name: 'Add a phase' }));
    expect(within(dialog).getByRole('combobox', { name: 'Phase 4' })).toHaveValue('auto');
  });

  it('reorders by its grip from the keyboard', async () => {
    layOutRows();
    const { dialog } = await openTimer();
    const grip = within(dialog).getByRole('button', { name: 'Move Auto' });
    grip.focus();
    fireEvent.keyDown(grip, { code: 'Space', key: ' ' });
    await tick();
    fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
    await tick();
    fireEvent.keyDown(document, { code: 'Space', key: ' ' });
    await tick();
    await waitFor(() =>
      expect(within(dialog).getByRole('combobox', { name: 'Phase 1' })).toHaveValue('teleop'),
    );
    expect(within(dialog).getByRole('combobox', { name: 'Phase 2' })).toHaveValue('auto');
    expect(
      within(dialog).getByRole('img', {
        name: 'The match: Teleop 2:15, then Auto 0:15, then Endgame 0:30',
      }),
    ).toBeVisible();
  });

  it.each([
    { reduce: false, slides: true },
    { reduce: true, slides: false },
  ])(
    'while a row is moved, the others slide only when motion is allowed (reduce: $reduce)',
    async ({ reduce, slides }) => {
      reducedMotion(reduce);
      layOutRows();
      const { dialog } = await openTimer();
      const grip = within(dialog).getByRole('button', { name: 'Move Auto' });
      grip.focus();
      fireEvent.keyDown(grip, { code: 'Space', key: ' ' });
      await tick();
      fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
      await tick();
      // Mid-move: a row that slides has a timed transition; one that jumps has none.
      const timed = within(within(dialog).getByRole('list', { name: 'Phases' }))
        .getAllByRole('listitem')
        .filter((li) => /[1-9]\d*ms/.test(li.style.transition));
      expect(timed.length > 0).toBe(slides);
      fireEvent.keyDown(document, { code: 'Space', key: ' ' });
      await tick();
    },
  );

  it('Remove the timer empties the list; the empty state offers Add and the standard three', async () => {
    const { u, dialog, calls } = await openTimer();
    await u.click(within(dialog).getByRole('button', { name: 'Remove the timer' }));
    expect(within(dialog).queryByRole('list', { name: 'Phases' })).toBeNull();
    expect(within(dialog).getByText('This form has no match timer.')).toBeVisible();
    expect(within(dialog).getByText(/The sticky timer is not shown/)).toBeVisible();
    expect(within(dialog).queryByText(/Match ends at/)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Remove the timer' })).toBeNull();
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.find((c) => c.name === 'updateForm')?.input).toEqual({
      form_id: FORM_ID,
      timer_config: { phases: [] },
    });
  });

  it('with no timer: Start from the standard three, then Save sends it in place', async () => {
    const s = timerServer({ phases: [] });
    const { u, dialog, calls } = await openTimer(draftPath, s);
    expect(within(dialog).getByText('This form has no match timer.')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    await u.click(
      within(dialog).getByRole('button', {
        name: 'Start from Auto 0:15 · Teleop 2:15 · Endgame 0:30',
      }),
    );
    expect(within(dialog).getAllByRole('combobox')).toHaveLength(3);
    expect(within(dialog).getByText(/Match ends at/)).toHaveTextContent(
      'Match ends at 180 s (3:00)',
    );
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const sent = calls.filter((c) => c.name === 'updateForm');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.input).toEqual({ form_id: FORM_ID, timer_config: STANDARD_TIMER });
    // In place: no version call, and the builder stays on draft v4.
    expect(calls.some((c) => /saveDraftFields|publishFormVersion/.test(c.name))).toBe(false);
    // Opened again, it shows what was saved.
    await u.click(screen.getByRole('button', { name: 'Match timer' }));
    const again = await screen.findByRole('dialog', { name: 'Match timer' });
    expect(within(again).getAllByRole('combobox')).toHaveLength(3);
  });

  it('after a timer save, unsaved field edits stay and the next field save uses the new base', async () => {
    const s = timerServer(STANDARD_TIMER, {
      saveDraftFields: () => {
        throw new RpcError('invalid', 'stop here', 400, true);
      },
    });
    const u = userEvent.setup();
    await openBuilder(draftPath, s.rpc);
    await u.click(screen.getByRole('button', { name: /^Add Toggle:/ }));
    expect(screen.getByText('● Unsaved changes')).toBeVisible();
    await u.click(screen.getByRole('button', { name: 'Match timer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Match timer' });
    await u.clear(lengthBox(dialog, 'Endgame'));
    await u.type(lengthBox(dialog, 'Endgame'), '20');
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('● Unsaved changes')).toBeVisible();
    await u.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(s.calls.some((c) => c.name === 'saveDraftFields')).toBe(true));
    const save = s.calls.find((c) => c.name === 'saveDraftFields')!;
    expect(save.input.base_updated_at).toBe(STAMPED);
    // Only the stamp moved: nothing to reload.
    expect(screen.queryByText(/Someone else saved this version/)).toBeNull();
  });

  it('does not adopt the new base when someone else saved fields since it was read', async () => {
    // One set of rows, as the server keeps its field ids.
    const rows = fourTypeFields();
    let sent = false;
    const s = timerServer(STANDARD_TIMER, {
      getFormVersion: (input: Record<string, unknown>) => {
        const row = VERSIONS.find((v) => v.id === input.form_version_id)!;
        if (!sent || row.id !== V.v4) return versionOut(row, rows);
        // Another admin's field save landed (and the timer's stamp): the fields differ.
        const theirs = rows.map((f, i) => (i === 0 ? { ...f, label: `${f.label} (theirs)` } : f));
        return versionOut({ ...row, updated_at: STAMPED }, theirs);
      },
      updateForm: (input: Record<string, unknown>) => {
        sent = true;
        const { versions: _versions, ...row } = formOut();
        return { ...row, timer_config: input.timer_config };
      },
      saveDraftFields: () => {
        throw new RpcError('invalid', 'stop here', 400, true);
      },
    });
    const u = userEvent.setup();
    await openBuilder(draftPath, s.rpc);
    await u.click(screen.getByRole('button', { name: /^Add Toggle:/ }));
    await u.click(screen.getByRole('button', { name: 'Match timer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Match timer' });
    await u.clear(lengthBox(dialog, 'Auto'));
    await u.type(lengthBox(dialog, 'Auto'), '20');
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      screen.getByText(/^The match timer was saved\. Someone else saved this version/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
    // Their save is not adopted: unsaved edits stay, and a field save is still checked against
    // the version as it was read, so the server refuses it as stale.
    expect(screen.getByText('● Unsaved changes')).toBeVisible();
    await u.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(s.calls.some((c) => c.name === 'saveDraftFields')).toBe(true));
    const save = s.calls.find((c) => c.name === 'saveDraftFields')!;
    expect(save.input.base_updated_at).toBe(LOADED_AT);
  });

  it('a send that timed out but landed: the dialog says so, and the base still moves', async () => {
    // One set of rows, as the server keeps its field ids.
    const rows = fourTypeFields();
    let stamped = false;
    const s = timerServer(STANDARD_TIMER, {
      getFormVersion: (input: Record<string, unknown>) => {
        const row = VERSIONS.find((v) => v.id === input.form_version_id)!;
        const at = stamped && row.id === V.v4 ? { ...row, updated_at: STAMPED } : row;
        return versionOut(at, rows);
      },
      updateForm: () => {
        // Applied on the server; the answer never arrived.
        stamped = true;
        throw new RpcError('timeout', 'the server did not answer in time', 0);
      },
      saveDraftFields: () => {
        throw new RpcError('invalid', 'stop here', 400, true);
      },
    });
    const u = userEvent.setup();
    await openBuilder(draftPath, s.rpc);
    await u.click(screen.getByRole('button', { name: /^Add Toggle:/ }));
    await u.click(screen.getByRole('button', { name: 'Match timer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Match timer' });
    await u.clear(lengthBox(dialog, 'Auto'));
    await u.type(lengthBox(dialog, 'Auto'), '20');
    const reads = s.calls.filter((c) => c.name === 'getFormVersion').length;
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(/Could not reach the server/)).toBeVisible();
    // The version was read again after the timeout, and its fields were unchanged.
    const after = s.calls.filter((c) => c.name === 'getFormVersion');
    expect(after).toHaveLength(reads + 1);
    expect(after.at(-1)!.input).toEqual({ form_version_id: V.v4 });
    expect(screen.queryByText(/Someone else saved this version/)).toBeNull();
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await u.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(s.calls.some((c) => c.name === 'saveDraftFields')).toBe(true));
    const save = s.calls.find((c) => c.name === 'saveDraftFields')!;
    expect(save.input.base_updated_at).toBe(STAMPED);
  });

  it('saved, but the re-read failed: the page says the timer was saved and offers Reload', async () => {
    // One set of rows, as the server keeps its field ids.
    const rows = fourTypeFields();
    let sent = false;
    const s = timerServer(STANDARD_TIMER, {
      getFormVersion: (input: Record<string, unknown>) => {
        if (sent) throw new RpcError('timeout', 'the server did not answer in time', 0);
        const row = VERSIONS.find((v) => v.id === input.form_version_id)!;
        return versionOut(row, rows);
      },
      updateForm: (input: Record<string, unknown>) => {
        sent = true;
        const { versions: _versions, ...row } = formOut();
        return { ...row, timer_config: input.timer_config };
      },
    });
    const { u, dialog } = await openTimer(draftPath, s);
    await u.clear(lengthBox(dialog, 'Auto'));
    await u.type(lengthBox(dialog, 'Auto'), '20');
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      screen.getByText(/^The match timer was saved\. Could not reach the server/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
  });

  it('refuses a phase named twice, and holds Save', async () => {
    const { u, dialog } = await openTimer();
    const second = within(dialog).getByRole('combobox', { name: 'Phase 2' });
    await u.selectOptions(second, 'auto');
    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent('Auto is in the list twice.');
    expect(second).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(within(dialog).queryByText(/Match ends at/)).toBeNull();
  });

  it('refuses a length that is not whole seconds from 1 to 3600', async () => {
    const { u, dialog } = await openTimer();
    const auto = lengthBox(dialog, 'Auto');
    for (const bad of ['0', '3601', '1.5', '']) {
      await u.clear(auto);
      if (bad) await u.type(auto, bad);
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Auto: the length is a whole number of seconds, from 1 to 3600.',
      );
      expect(auto).toHaveAttribute('aria-invalid', 'true');
      expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    }
    await u.clear(auto);
    await u.type(auto, '3600');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(auto.parentElement).toHaveTextContent('s · 60:00');
  });

  it('says a refusal from the server in one sentence and keeps the dialog', async () => {
    const s = timerServer(STANDARD_TIMER, {
      updateForm: () => {
        throw new RpcError('forbidden', 'no', 403, true);
      },
    });
    const { u, dialog } = await openTimer(draftPath, s);
    await u.click(within(dialog).getByRole('button', { name: 'Remove the timer' }));
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText(/Only an admin can edit forms/, { exact: false }),
    ).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Match timer' })).toBeVisible();
  });

  it('offline holds the Match timer button, and an open dialog holds Save with the reason', async () => {
    const { u, dialog } = await openTimer();
    await u.clear(lengthBox(dialog, 'Auto'));
    await u.type(lengthBox(dialog, 'Auto'), '20');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled();
    act(() => goOffline());
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(
      within(dialog).getByText("You're offline: Save waits for the connection."),
    ).toBeVisible();
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Match timer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'More' })).toBeDisabled();
  });

  it('on an older version the timer is shown read-only', async () => {
    const { dialog } = await openTimer(`/admin/forms/${FORM_ID}?version=2`);
    expect(
      within(dialog).getByText(/v2 is an older version, so the timer is shown read-only/),
    ).toBeVisible();
    expect(within(dialog).getByRole('combobox', { name: 'Phase 1' })).toBeDisabled();
    expect(lengthBox(dialog, 'Auto')).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Save' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Add a phase' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Move Auto' })).toBeNull();
    expect(within(dialog).getAllByRole('button', { name: 'Close' })).toHaveLength(2);
  });

  it('timerProblem names the first problem and its control', () => {
    const row = (phase: 'auto' | 'teleop', seconds: string) => ({ id: phase, phase, seconds });
    expect(timerProblem([row('auto', '15'), row('teleop', '135')])).toBeNull();
    expect(timerProblem([row('auto', '15'), row('auto', '135')])).toMatchObject({
      row: 1,
      part: 'phase',
    });
    expect(timerProblem([row('auto', 'x')])).toMatchObject({ row: 0, part: 'seconds' });
  });
});
