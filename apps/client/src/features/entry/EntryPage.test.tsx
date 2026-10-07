import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CachedRow } from '@/data/db';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { EntryPage } from './EntryPage';

const field = (over: Record<string, unknown>) =>
  ({
    entity: 'form_fields' as const,
    form_version_id: 'fv-1',
    required: false,
    deprecated: false,
    config: {},
    ...over,
  }) as unknown as CachedRow;

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    field({
      id: 'f1',
      key: 'auto_notes',
      label: 'Auto notes',
      type: 'counter',
      display_order: 1,
      phase: 'auto',
      unit: 'count',
      direction: 'higher_is_better',
      config: { min: 0, max: 10, step: 1 },
      expected_range: { min: 0, max: 10 },
    }),
    field({
      id: 'f2',
      key: 'notes',
      label: 'Notes',
      type: 'long_text',
      display_order: 2,
      phase: 'post_match',
      unit: 'text',
      direction: 'neutral',
    }),
  ]);
});

const props = {
  eventId: 'ev-1',
  formVersionId: 'fv-1',
  matchId: 'm-1',
  teamId: 't-1',
  alliance: 'red' as const,
  author: { id: 'u-1', role: 'scouter' as const },
  teamLabel: '2096 ROBACTIVE',
  matchLabel: 'Q12',
};

/**
 * A published form with a field in each of the four phases (auto and post_match come from
 * beforeEach), mounted like the route mounts it. `draftSavedAt` leaves an unsent draft
 * saved at that time.
 */
async function renderEntry(opts: { draftSavedAt?: string } = {}) {
  await db.rows.bulkPut([
    field({
      id: 'f3',
      key: 'teleop_notes',
      label: 'Teleop notes',
      type: 'counter',
      display_order: 3,
      phase: 'teleop',
      unit: 'count',
      direction: 'higher_is_better',
      config: { min: 0, max: 40, step: 1 },
    }),
    field({
      id: 'f4',
      key: 'parked',
      label: 'Parked',
      type: 'toggle',
      display_order: 4,
      phase: 'endgame',
      unit: 'boolean',
      direction: 'higher_is_better',
    }),
  ]);
  if (opts.draftSavedAt) {
    await db.drafts.put({
      key: `${props.formVersionId}:${props.matchId}:${props.teamId}`,
      row_id: '',
      payload: { robot_status: null, data: {}, breakdown_seconds: 0 },
      updated_at: opts.draftSavedAt,
    });
  }
  render(<EntryPage {...props} />);
  await screen.findByRole('group', { name: /robot status/i });
}

describe('EntryPage', () => {
  it('shows phases as tabs and marks a phase done once a field in it is set', async () => {
    await renderEntry();
    await userEvent.click(screen.getByRole('radio', { name: 'Played' }));
    const tab = () => screen.getByRole('tab', { name: /Auto/ });
    expect(tab()).toHaveAttribute('aria-selected', 'true');
    // The Tabs primitive draws the ✓ as an icon and reads it as the tab's description.
    expect(tab()).not.toHaveAccessibleDescription('Done');
    await userEvent.click(screen.getAllByRole('button', { name: /plus one/ })[0]!);
    expect(tab()).toHaveAccessibleDescription('Done');
    expect(tab().querySelector('[data-done-mark]')).not.toBeNull();
    // The summary panel's count; anchored, so "Phase 1 of 4" in the pane header is not it.
    expect(screen.getByText(/^1 of \d+$/)).toBeInTheDocument();
  });

  it('a no-show hides every field and never records zeros', async () => {
    await renderEntry();
    await userEvent.click(screen.getByRole('radio', { name: 'No show' }));
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByText(/never/i)).toBeInTheDocument();
    // no field of any kind: no counter button, no number box, no switch
    expect(screen.queryByRole('button', { name: /plus one|minus one/ })).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('says when the draft was saved', async () => {
    await renderEntry({ draftSavedAt: '2026-10-06T08:41:00Z' });
    expect(await screen.findByText(/Draft saved on this device · \d\d:\d\d/)).toBeInTheDocument();
  });

  it('opens a phase from its tab and from the summary panel', async () => {
    await renderEntry();
    await userEvent.click(screen.getByRole('radio', { name: 'Played' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Teleop' }));
    expect(screen.getByRole('heading', { name: 'Teleop' })).toBeInTheDocument();
    expect(screen.getByText('Phase 2 of 4')).toBeInTheDocument();
    expect(screen.getByLabelText('Teleop notes value')).toBeInTheDocument();
    expect(screen.queryByText('Auto notes')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Endgame/ }));
    expect(screen.getByRole('tab', { name: 'Endgame' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('switch', { name: 'Parked' })).toBeInTheDocument();
  });

  it('lists every field by phase on the confirm, with the edit window', async () => {
    await renderEntry();
    await userEvent.click(screen.getByRole('radio', { name: 'Played' }));
    await userEvent.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm this entry' });
    expect(dialog).toHaveTextContent('You can still edit it for 5 minutes after submitting.');
    for (const heading of ['Autonomous', 'Teleop', 'Endgame', 'Notes'])
      expect(within(dialog).getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep editing/i })).toHaveFocus();
  });

  it('prints an untouched counter as 0 and an untouched switch as No, like the controls', async () => {
    await renderEntry();
    await userEvent.click(screen.getByRole('radio', { name: 'Played' }));
    await userEvent.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm this entry' });
    const valueOf = (label: string) =>
      within(dialog).getByText(label, { selector: 'dt' }).nextElementSibling;
    expect(valueOf('Auto notes')).toHaveTextContent(/^0$/);
    expect(valueOf('Parked')).toHaveTextContent(/^No$/);
    expect(valueOf('Notes')).toHaveTextContent(/^—$/);
  });

  it('names the robot and its alliance on the confirm', async () => {
    await renderEntry();
    await userEvent.click(screen.getByRole('radio', { name: 'Played' }));
    await userEvent.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm this entry' });
    expect(dialog).toHaveTextContent('Q12 · 2096 ROBACTIVE');
    expect(within(dialog).getByText(/Red alliance|Red \d/)).toBeInTheDocument();
  });

  describe('the edit-window line on the confirm', () => {
    const LINE = /You can still edit it for 5 minutes/;
    async function openConfirm(extra: Partial<Parameters<typeof EntryPage>[0]> = {}) {
      const user = userEvent.setup();
      render(<EntryPage {...props} {...extra} />);
      await user.click(await screen.findByRole('radio', { name: /played/i }));
      await user.click(screen.getByRole('button', { name: /review entry/i }));
      return screen.findByRole('dialog', { name: 'Confirm this entry' });
    }

    it("is shown for a scouter's new entry", async () => {
      expect(await openConfirm()).toHaveTextContent(LINE);
    });

    it.each(['lead', 'admin'] as const)(
      'is hidden for a %s, who edit at any time',
      async (role) => {
        const dialog = await openConfirm({ author: { id: 'u-2', role } });
        expect(dialog).not.toHaveTextContent(LINE);
      },
    );

    it('is hidden when re-editing an existing entry: its window runs from the first save', async () => {
      const dialog = await openConfirm({
        existing: {
          id: 'e-1',
          event_id: 'ev-1',
          form_kind: 'match',
          form_version_id: 'fv-1',
          match_id: 'm-1',
          team_id: 't-1',
          alliance: 'red',
          scouter_id: 'u-1',
          robot_status: 'played',
          breakdown_seconds: null,
          data: { auto_notes: 3 },
          client_created_at: new Date(Date.now() - 60_000).toISOString(),
          deleted_at: null,
        },
      });
      expect(dialog).not.toHaveTextContent(LINE);
    });
  });

  it('asks for robot status before it shows any scoring field', async () => {
    render(<EntryPage {...props} />);
    expect(await screen.findByRole('group', { name: /robot status/i })).toBeInTheDocument();
    expect(screen.queryByText('Auto notes')).not.toBeInTheDocument();
  });

  it('shows the fields once the robot is marked as played', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    expect(await screen.findByText('Auto notes')).toBeInTheDocument();
  });

  it('hides every field for a no-show, and records no values', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /no show/i }));
    expect(screen.queryByText('Auto notes')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    await waitFor(async () => expect((await pending(10))[0]?.payload.data).toEqual({}));
  });

  it('increments a counter by tapping plus, and never renders a text input for it', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    const plus = await screen.findByRole('button', { name: 'Auto notes plus one' });
    await user.click(plus);
    await user.click(plus);
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('2');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('undoes the last counter tap', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(await screen.findByRole('button', { name: 'Auto notes plus one' }));
    await user.click(screen.getByRole('button', { name: 'Auto notes minus one' }));
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('0');
  });

  it('writes a draft on every interaction and recovers it on remount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(await screen.findByRole('button', { name: 'Auto notes plus one' }));
    await waitFor(async () => expect(await db.drafts.count()).toBe(1));
    unmount();

    render(<EntryPage {...props} />);
    expect(await screen.findByLabelText('Auto notes value')).toHaveTextContent('1');
  });

  it('shows a confirmation summary of the whole entry before it commits', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(await screen.findByRole('button', { name: 'Auto notes plus one' }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('2096 ROBACTIVE');
    expect(dialog).toHaveTextContent('Auto notes');
    expect(await pending(10)).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /submit entry/i }));
    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
  });

  it('blocks submission and names the field when a value is outside its expected range', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    const plus = await screen.findByRole('button', { name: 'Auto notes plus one' });
    for (let i = 0; i < 11; i += 1) await user.click(plus);
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Auto notes/);
    expect(await pending(10)).toHaveLength(0);
  });

  it('keeps the sheet and the values on a failed submit, with the reason focused beside Submit', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    const plus = await screen.findByRole('button', { name: 'Auto notes plus one' });
    for (let i = 0; i < 11; i += 1) await user.click(plus);
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const submit = await screen.findByRole('button', { name: /submit entry/i });
    await user.click(submit);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/^Not saved\./);
    await waitFor(() => expect(alert).toHaveFocus());
    // Same sticky footer as the button, so it is on screen however long the sheet is.
    expect(alert.parentElement).toBe(submit.closest('.sticky'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /keep editing/i }));
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('11');
  });

  describe("editing this device's existing entry (SPEC-FINAL 7.6)", () => {
    const existing = (createdMsAgo: number) => ({
      id: 'e-1',
      event_id: 'ev-1',
      form_kind: 'match' as const,
      form_version_id: 'fv-1',
      match_id: 'm-1',
      team_id: 't-1',
      alliance: 'red' as const,
      scouter_id: 'u-1',
      robot_status: 'played',
      breakdown_seconds: null,
      data: { auto_notes: 3 },
      client_created_at: new Date(Date.now() - createdMsAgo).toISOString(),
      deleted_at: null,
    });

    it('opens with the saved values and submits an update to the same row', async () => {
      const entry = existing(60 * 1000);
      await db.rows.put({ ...entry, entity: 'scouting_entries', version: 1 });
      const user = userEvent.setup();
      render(<EntryPage {...props} existing={entry} />);
      expect(await screen.findByLabelText('Auto notes value')).toHaveTextContent('3');
      await user.click(screen.getByRole('button', { name: 'Auto notes plus one' }));
      await user.click(screen.getByRole('button', { name: /review entry/i }));
      await user.click(await screen.findByRole('button', { name: /submit entry/i }));

      await waitFor(async () => expect(await pending(10)).toHaveLength(1));
      const [op] = await pending(10);
      expect(op).toMatchObject({ action: 'update', row_id: 'e-1', base_version: 1 });
      expect(op?.payload.data).toEqual({ auto_notes: 4 });
    });

    it('refuses to submit once the five-minute window has closed', async () => {
      const entry = existing(6 * 60 * 1000);
      const user = userEvent.setup();
      render(<EntryPage {...props} existing={entry} />);
      await screen.findByLabelText('Auto notes value');
      await user.click(screen.getByRole('button', { name: /review entry/i }));
      await user.click(await screen.findByRole('button', { name: /submit entry/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/locked — ask a lead/);
      expect(await pending(10)).toHaveLength(0);
    });
  });
});
