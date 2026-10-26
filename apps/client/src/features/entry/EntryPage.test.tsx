import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedRow } from '@/data/db';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { EntryPage } from './EntryPage';
import { loadTimedParts } from './lazyParts';
import { matchClock } from './matchClock';
import { stopwatches } from './stopwatches';

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
  // A router for the phone header's back link.
  render(
    <MemoryRouter>
      <EntryPage {...props} />
    </MemoryRouter>,
  );
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

  it('draws a section in the phase of the field after it, and a computed field that follows the taps (1.33)', async () => {
    await db.rows.bulkPut([
      field({
        id: 'f0',
        key: 'auto_section',
        label: 'Scoring',
        type: 'section',
        display_order: 0,
        phase: null,
      }),
      field({
        id: 'f9',
        key: 'auto_points',
        label: 'Auto points',
        type: 'computed',
        display_order: 9,
        phase: 'auto',
        unit: 'points',
        direction: 'higher_is_better',
        config: {
          result_type: 'float',
          expression: {
            kind: 'op',
            op: '*',
            left: { kind: 'field', key: 'auto_notes' },
            right: { kind: 'literal', value: 5 },
          },
        },
      }),
    ]);
    await renderEntry();
    await userEvent.click(screen.getByRole('radio', { name: 'Played' }));
    const pane = screen.getByRole('tabpanel', { name: 'Autonomous' });
    expect(within(pane).getByRole('heading', { name: 'Scoring', level: 3 })).toBeInTheDocument();
    // The counter starts at 0 and holds it (seedValues, task 1.36): 0 × 5 is 0, as it saves.
    expect(within(pane).getByLabelText('Auto points')).toHaveTextContent(/^0$/);
    const plus = within(pane).getByRole('button', { name: 'Auto notes plus one' });
    await userEvent.click(plus);
    await userEvent.click(plus);
    expect(within(pane).getByLabelText('Auto points')).toHaveTextContent('10');
    // The section and the computed field are not fields to fill: Autonomous is 1 of 1.
    const summary = screen.getByRole('button', { name: /Autonomous/ });
    expect(summary).toHaveTextContent('1 of 1');
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

  it('writes one entry however fast the second tap on Submit comes', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const submit = await screen.findByRole('button', { name: /submit entry/i });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
    // Give a second, unguarded submit every chance to land before counting again.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await pending(10)).toHaveLength(1);
    expect(await db.rows.where('entity').equals('scouting_entries').count()).toBe(1);
  });

  it('marks a value outside its expected range as it is typed, and Review entry lists it instead of confirming', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    const plus = await screen.findByRole('button', { name: 'Auto notes plus one' });
    for (let i = 0; i < 10; i += 1) await user.click(plus);
    expect(screen.queryByText(/Most is 10/)).not.toBeInTheDocument();
    await user.click(plus);
    // As it is typed: the limit in words, and the value kept.
    expect(screen.getByText('Most is 10 — check this number')).toBeInTheDocument();
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('11');
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog', { name: '1 thing to fix first' });
    expect(within(dialog).getByRole('list', { name: 'Things to fix' })).toHaveTextContent(
      /Auto notes\s*Autonomous · 11 is over the most, 10/,
    );
    expect(screen.queryByRole('button', { name: /submit entry/i })).not.toBeInTheDocument();
    expect(await pending(10)).toHaveLength(0);
  });

  it('keeps the sheet and the values on a failed submit, with the reason focused beside Submit', async () => {
    // The self-edit window closed while the scout was on the screen (SPEC-FINAL 7.6).
    const entry = {
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
      client_created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      deleted_at: null,
    };
    const user = userEvent.setup();
    render(<EntryPage {...props} existing={entry} />);
    const plus = await screen.findByRole('button', { name: 'Auto notes plus one' });
    await user.click(plus);
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
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('4');
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

describe('breakdown time (UF.5, SPEC-FINAL 3.5)', () => {
  const box = () =>
    screen.getByLabelText('Breakdown time (seconds from match start)') as HTMLInputElement;
  const draft = async () =>
    (await db.drafts.get(`${props.formVersionId}:${props.matchId}:${props.teamId}`))?.payload;

  it('starts empty, clears to empty, and typing 20 gives 20', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: 'Broke down' }));
    expect(box().value).toBe('');
    await user.type(box(), '20');
    expect(box().value).toBe('20');
    await waitFor(async () => expect((await draft())?.breakdown_seconds).toBe(20));
    await user.clear(box());
    expect(box().value).toBe('');
    await waitFor(async () => expect((await draft())?.breakdown_seconds).toBeNull());
  });

  it('takes digits only: a "." or "-" is dropped as it is typed', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: 'Broke down' }));
    await user.type(box(), '-2.5');
    expect(box().value).toBe('25');
    await waitFor(async () => expect((await draft())?.breakdown_seconds).toBe(25));
    await user.clear(box());
    await user.type(box(), 'x');
    expect(box().value).toBe('');
    await waitFor(async () => expect((await draft())?.breakdown_seconds).toBeNull());
  });

  it('blocks a Broke down submit while the field is empty', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: 'Broke down' }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog', { name: '1 thing to fix first' });
    expect(dialog).toHaveTextContent(
      /Breakdown time\s*Robot status · Broke down needs the time it stopped/,
    );
    await user.click(within(dialog).getByRole('button', { name: 'Go to Breakdown time' }));
    await waitFor(() => expect(box()).toHaveFocus());
    expect(box()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Required — seconds from match start')).toBeInTheDocument();
    expect(await pending(10)).toHaveLength(0);
  });

  it('sends the time with Broke down, and none once the status changes', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: 'Broke down' }));
    await user.type(box(), '74');
    await user.click(screen.getByRole('radio', { name: 'Played' }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
    const [op] = await pending(10);
    expect(op?.payload).toMatchObject({ robot_status: 'played', breakdown_seconds: null });
  });
});

describe('phase swipe on a phone (UF.5)', () => {
  /** jsdom has no PointerEvent: a MouseEvent carrying the pointer fields the swipe reads. */
  class TestPointerEvent extends MouseEvent {
    pointerId = 1;
    pointerType: string;
    isPrimary = true;
    constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
      super(type, { bubbles: true, cancelable: true, ...init });
      this.pointerType = init.pointerType ?? 'touch';
    }
  }
  function pointer(el: Element, type: string, x: number, y: number, t = 0) {
    const e = new TestPointerEvent(type, { clientX: x, clientY: y });
    Object.defineProperty(e, 'timeStamp', { value: t });
    fireEvent(el, e);
  }
  /** A slow stroke on `el` through `points` ([x, y, ms]), released at the last one. */
  function stroke(el: Element, points: [number, number, number][]) {
    points.forEach(([x, y, t], i) => pointer(el, i === 0 ? 'pointerdown' : 'pointermove', x, y, t));
    const [x, y, t] = points[points.length - 1]!;
    pointer(el, 'pointerup', x, y, t);
  }
  const slowSideways = (by: number): [number, number, number][] => [
    [200, 300, 0],
    [200 + Math.sign(by) * 10, 300, 1000],
    [200 + by, 300, 2000],
  ];

  /** A phone (not desktop), with or without reduced motion; the pane 375 px wide. */
  const original = window.matchMedia;
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  function phone({ reduced = false } = {}) {
    window.matchMedia = ((query: string) => ({
      matches: reduced && query.includes('reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get: () => 375,
    });
  }
  afterEach(() => {
    window.matchMedia = original;
    if (width) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', width);
  });

  const selected = (name: string) => screen.getByRole('tab', { name, selected: true });
  /** A phase change animates out, then in: give a loaded CI runner more than the 1 s default. */
  const PHASE_WAIT = { timeout: 4000 };
  const panel = () => screen.getByRole('tabpanel');

  async function played() {
    await renderEntry();
    await userEvent.click(screen.getByRole('radio', { name: 'Played' }));
    expect(selected('Auto')).toBeInTheDocument();
  }

  it('a swipe left on the empty page below the form follows the finger, then goes to the next phase', async () => {
    phone();
    await played();
    const main = screen.getByRole('main');
    pointer(main, 'pointerdown', 200, 600);
    pointer(main, 'pointermove', 190, 600, 1000);
    pointer(main, 'pointermove', 70, 600, 2000);
    expect(panel().style.transform).toBe('translateX(-130px)');
    pointer(main, 'pointerup', 70, 600, 2000);
    await waitFor(() => expect(selected('Teleop')).toBeInTheDocument(), PHASE_WAIT);
    expect(panel().style.transform).toBe('');
    // and a swipe right comes back
    stroke(main, slowSideways(130));
    await waitFor(() => expect(selected('Auto')).toBeInTheDocument(), PHASE_WAIT);
  });

  it('springs back from a short drag, and gives only a rubber band before the first phase', async () => {
    phone();
    await played();
    const main = screen.getByRole('main');
    stroke(main, slowSideways(-80));
    expect(selected('Auto')).toBeInTheDocument();
    expect(panel().style.transform).toBe('');
    expect(panel().style.transition).toContain('transform');

    pointer(main, 'pointerdown', 200, 300);
    pointer(main, 'pointermove', 210, 300, 1000);
    pointer(main, 'pointermove', 600, 300, 2000);
    const band = parseFloat(panel().style.transform.replace('translateX(', ''));
    expect(band).toBeGreaterThan(0);
    expect(band).toBeLessThan(24);
    pointer(main, 'pointerup', 600, 300, 2000);
    expect(selected('Auto')).toBeInTheDocument();
  });

  it('goes on a fast flick, however short', async () => {
    phone();
    await played();
    stroke(screen.getByRole('main'), [
      [200, 300, 0],
      [180, 300, 20],
      [160, 300, 40],
    ]);
    await waitFor(() => expect(selected('Teleop')).toBeInTheDocument(), PHASE_WAIT);
  });

  it('leaves a mostly vertical gesture to scroll the page', async () => {
    phone();
    await played();
    stroke(screen.getByRole('main'), [
      [200, 300, 0],
      [205, 320, 1000],
      [80, 500, 2000],
    ]);
    expect(selected('Auto')).toBeInTheDocument();
    expect(panel().style.transform).toBe('');
  });

  it('a tap on a counter still counts; a swipe that starts on it changes phase and does not', async () => {
    phone();
    await played();
    const plus = screen.getByRole('button', { name: 'Auto notes plus one' });
    pointer(plus, 'pointerdown', 300, 300);
    pointer(plus, 'pointerup', 300, 300, 100);
    fireEvent.click(plus);
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('1');

    stroke(plus, slowSideways(-150));
    fireEvent.click(plus);
    await waitFor(() => expect(selected('Teleop')).toBeInTheDocument(), PHASE_WAIT);
    await userEvent.click(screen.getByRole('tab', { name: /Auto/ }));
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('1');
  });

  it('a tap on a counter counts straight after any swipe: a commit, a spring-back, a scroll', async () => {
    phone();
    await played();
    const main = screen.getByRole('main');
    const plus = () => screen.getByRole('button', { name: 'Auto notes plus one' });
    const tap = () => {
      pointer(plus(), 'pointerdown', 300, 300);
      pointer(plus(), 'pointerup', 300, 300, 50);
      fireEvent.click(plus());
    };
    // a phase there and back, then a tab tap, then a tap on + (the e2e's own order)
    stroke(main, slowSideways(-150));
    await waitFor(() => expect(selected('Teleop')).toBeInTheDocument(), PHASE_WAIT);
    stroke(main, slowSideways(150));
    await waitFor(() => expect(selected('Auto')).toBeInTheDocument(), PHASE_WAIT);
    tap();
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('1');
    // within the 400 ms window of a spring-back: the new press is its own gesture
    stroke(main, slowSideways(-60));
    tap();
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('2');
    // and after a vertical drag (a scroll)
    stroke(main, [
      [200, 300, 0],
      [200, 320, 1000],
      [210, 500, 2000],
    ]);
    tap();
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('3');
  });

  it('a wobbly tap on a counter (about 10 px sideways) still counts, even a fast one', async () => {
    phone();
    await played();
    const plus = screen.getByRole('button', { name: 'Auto notes plus one' });
    const value = () => screen.getByLabelText('Auto notes value');
    for (const [i, ms] of [1000, 5].entries()) {
      // slow, then fast enough to be a flick if it were a swipe
      pointer(plus, 'pointerdown', 300, 300, 0);
      pointer(plus, 'pointermove', 304, 300, ms);
      pointer(plus, 'pointermove', 293, 301, 2 * ms);
      pointer(plus, 'pointermove', 289, 300, 3 * ms);
      expect(panel().style.transform).toBe('translateX(-11px)');
      pointer(plus, 'pointerup', 289, 300, 3 * ms);
      fireEvent.click(plus);
      expect(value()).toHaveTextContent(String(i + 1));
      expect(selected('Auto')).toBeInTheDocument();
      expect(panel().style.transform).toBe('');
    }
  });

  it('a drag past the tap slop (over 16 px) that springs back is not a tap', async () => {
    phone();
    await played();
    const plus = screen.getByRole('button', { name: 'Auto notes plus one' });
    stroke(plus, [
      [300, 300, 0],
      [290, 300, 1000],
      [280, 300, 2000],
    ]);
    fireEvent.click(plus);
    expect(selected('Auto')).toBeInTheDocument();
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('0');
  });

  it('never starts from a focused text field', async () => {
    phone();
    await renderEntry();
    await userEvent.click(screen.getByRole('radio', { name: 'Broke down' }));
    const box = screen.getByLabelText('Breakdown time (seconds from match start)');
    box.focus();
    stroke(box, slowSideways(-150));
    expect(selected('Auto')).toBeInTheDocument();
  });

  it('the review sheet closes on a drag down (UF.4), back to the form', async () => {
    phone({ reduced: true });
    await played();
    await userEvent.click(screen.getByRole('button', { name: /review entry/i }));
    const title = await screen.findByRole('heading', { name: 'Confirm this entry' });
    stroke(title, [
      [200, 100, 0],
      [200, 110, 1000],
      [200, 300, 2000],
    ]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(selected('Auto')).toBeInTheDocument();
    expect(await pending(10)).toHaveLength(0);
  });

  it('under reduced motion nothing follows the finger and a qualifying swipe just changes phase', async () => {
    phone({ reduced: true });
    await played();
    const main = screen.getByRole('main');
    pointer(main, 'pointerdown', 200, 300);
    pointer(main, 'pointermove', 190, 300, 1000);
    pointer(main, 'pointermove', 50, 300, 2000);
    expect(panel().style.transform).toBe('');
    pointer(main, 'pointerup', 50, 300, 2000);
    expect(selected('Teleop')).toBeInTheDocument();
  });
});

/**
 * Task 1.36: the entry form's rules. The plan's Step-1 tests, written against the phase tabs
 * (SPEC-FINAL v1.23 §8.2 superseded the collapsible sections), the "Notes" tab (RB.8) and the
 * problems list Review entry opens instead of the confirmation (entry parts 14, v1.23).
 */
describe('the entry form rules (1.36)', () => {
  beforeEach(async () => {
    await db.rows.bulkPut([
      field({
        id: 'r3',
        key: 'teleop_notes',
        label: 'Teleop notes',
        type: 'counter',
        display_order: 3,
        phase: 'teleop',
        unit: 'count',
        direction: 'higher_is_better',
        config: { min: 0, step: 1 },
        expected_range: { min: 0, max: 40 },
      }),
      field({
        id: 'r4',
        key: 'climbed',
        label: 'Climbed',
        type: 'toggle',
        display_order: 4,
        phase: 'endgame',
        unit: 'boolean',
        direction: 'higher_is_better',
      }),
      field({
        id: 'r5',
        key: 'climb_time',
        label: 'Climb time',
        type: 'number',
        display_order: 5,
        phase: 'endgame',
        unit: 'seconds',
        direction: 'lower_is_better',
        visibility_condition: { field_key: 'climbed', op: '=', value: true },
      }),
      field({
        id: 'r6',
        key: 'total',
        label: 'Total points',
        type: 'computed',
        display_order: 6,
        phase: 'auto',
        unit: 'points',
        direction: 'higher_is_better',
        config: {
          result_type: 'float',
          expression: {
            kind: 'op',
            op: '*',
            left: { kind: 'field', key: 'auto_notes' },
            right: { kind: 'literal', value: 5 },
          },
        },
      }),
    ]);
  });

  /** A required single select in Endgame, for the tests of a missed answer. */
  const climbLevel = () =>
    db.rows.put(
      field({
        id: 'r7',
        key: 'climb_level',
        label: 'Climb level',
        type: 'single_select',
        display_order: 7,
        phase: 'endgame',
        unit: 'enum',
        direction: 'higher_is_better',
        required: true,
        config: {
          options: [
            { value: 'none', label: 'None' },
            { value: 'low', label: 'Low' },
          ],
        },
      }),
    );

  async function played(extra: Partial<Parameters<typeof EntryPage>[0]> = {}) {
    const user = userEvent.setup();
    render(<EntryPage {...props} {...extra} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await screen.findByText('Auto notes');
    return user;
  }

  it('orders the phase tabs Auto, Teleop, Endgame, Notes by the fields phase metadata', async () => {
    await played();
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs.join('|')).toMatch(/Auto[\s\S]*Teleop[\s\S]*Endgame[\s\S]*Notes/);
  });

  it('lets a phase be left and opened again at will, in either direction — not one-way paging', async () => {
    const user = await played();
    await user.click(screen.getByRole('tab', { name: 'Endgame' }));
    expect(screen.queryByText('Auto notes')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Auto' }));
    expect(await screen.findByText('Auto notes')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Notes' }));
    await user.click(screen.getByRole('tab', { name: 'Teleop' }));
    expect(screen.getByLabelText('Teleop notes value')).toBeInTheDocument();
  });

  it('recomputes a computed field as its operands change, without the scouter typing it', async () => {
    const user = await played();
    await user.click(screen.getByRole('button', { name: 'Auto notes plus one' }));
    expect(screen.getByLabelText('Total points')).toHaveTextContent('5');
  });

  it('shows a conditional field when its condition becomes true and hides it again', async () => {
    const user = await played();
    await user.click(screen.getByRole('tab', { name: 'Endgame' }));
    expect(screen.queryByText('Climb time')).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Climbed' }));
    expect(await screen.findByText('Climb time')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Climbed' }));
    expect(screen.queryByText('Climb time')).not.toBeInTheDocument();
  });

  it('records no value for a field that is hidden at submit time', async () => {
    const user = await played();
    await user.click(screen.getByRole('tab', { name: 'Endgame' }));
    await user.click(screen.getByRole('switch', { name: 'Climbed' }));
    await user.type(screen.getByLabelText('Climb time'), '9');
    await user.click(screen.getByRole('switch', { name: 'Climbed' }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    await waitFor(async () => {
      const [op] = await pending(10);
      expect(op!.payload.data).not.toHaveProperty('climb_time');
      expect(op!.payload.data).toMatchObject({ climbed: false });
    });
  });

  it('keeps a shown conditional value, and writes the computed value into the saved data (5.7)', async () => {
    const user = await played();
    await user.click(screen.getByRole('button', { name: 'Auto notes plus one' }));
    await user.click(screen.getByRole('button', { name: 'Auto notes plus one' }));
    await user.click(screen.getByRole('tab', { name: 'Endgame' }));
    await user.click(screen.getByRole('switch', { name: 'Climbed' }));
    await user.type(screen.getByLabelText('Climb time'), '9');
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm this entry' });
    const valueOf = (label: string) =>
      within(dialog).getByText(label, { selector: 'dt' }).nextElementSibling;
    // The confirm shows the worked-out value, not "—".
    expect(valueOf('Total points')).toHaveTextContent(/^10$/);
    await user.click(within(dialog).getByRole('button', { name: /submit entry/i }));
    await waitFor(async () => {
      const [op] = await pending(10);
      expect(op!.payload.data).toEqual({
        auto_notes: 2,
        teleop_notes: 0,
        climbed: true,
        climb_time: 9,
        total: 10,
      });
    });
  });

  it('keeps breakdown_seconds visible only for broke_down, and keeps all fields visible with it', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /broke down/i }));
    expect(screen.getByLabelText(/breakdown time/i)).toBeInTheDocument();
    expect(await screen.findByText('Auto notes')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /played/i }));
    expect(screen.queryByLabelText(/breakdown time/i)).not.toBeInTheDocument();
  });

  it('blocks submit and lists every out-of-range field, not just the first', async () => {
    const user = await played();
    for (let i = 0; i < 11; i += 1)
      await user.click(screen.getByRole('button', { name: 'Auto notes plus one' }));
    await user.click(screen.getByRole('tab', { name: 'Teleop' }));
    for (let i = 0; i < 41; i += 1)
      await user.click(screen.getByRole('button', { name: 'Teleop notes plus one' }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog', { name: '2 things to fix first' });
    const list = within(dialog).getByRole('list', { name: 'Things to fix' });
    expect(list).toHaveTextContent(/Auto notes/);
    expect(list).toHaveTextContent(/Teleop notes\s*Teleop · 41 is over the most, 40/);
    expect(within(list).getAllByRole('button', { name: /^Go to/ })).toHaveLength(2);
    // Review entry stays pressable, and no confirmation, no Submit, nothing queued.
    expect(screen.queryByRole('button', { name: /submit entry/i })).not.toBeInTheDocument();
    expect(await pending(10)).toHaveLength(0);
    // 52 taps: over the default 5 s on a loaded machine (DEVIATIONS 1.37).
  }, 15_000);

  it('marks each phase holding a problem on the desktop panel: "1 to fix"', async () => {
    const user = await played();
    await user.click(screen.getByRole('tab', { name: 'Teleop' }));
    for (let i = 0; i < 41; i += 1)
      await user.click(screen.getByRole('button', { name: 'Teleop notes plus one' }));
    const panel = screen.getByRole('complementary', { name: 'This entry' });
    expect(within(panel).getByRole('button', { name: /Teleop/ })).toHaveTextContent(/1 to fix/);
    expect(within(panel).getByRole('button', { name: /Autonomous/ })).not.toHaveTextContent(
      /to fix/,
    );
  }, 15_000);

  it('Go to opens the phase, focuses the field and says "Required — pick one"', async () => {
    await climbLevel();
    const user = await played();
    expect(screen.queryByText('Required — pick one')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog', { name: '1 thing to fix first' });
    expect(dialog).toHaveTextContent(/Climb level\s*Endgame · required, not answered/);
    await user.click(within(dialog).getByRole('button', { name: 'Go to Climb level' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Endgame' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Required — pick one')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('radio', { name: 'None' })).toHaveFocus());
    // Answering it clears the mark, and Review entry now confirms.
    await user.click(screen.getByRole('radio', { name: 'Low' }));
    expect(screen.queryByText('Required — pick one')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    expect(await screen.findByRole('dialog', { name: 'Confirm this entry' })).toBeInTheDocument();
  });

  it('Keep editing closes the problems and keeps every value', async () => {
    const user = await played();
    for (let i = 0; i < 11; i += 1)
      await user.click(screen.getByRole('button', { name: 'Auto notes plus one' }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('11');
  });

  it.each(['No show', 'Disabled'])(
    '%s skips every check and records no field data',
    async (status) => {
      await climbLevel();
      const user = await played();
      for (let i = 0; i < 11; i += 1)
        await user.click(screen.getByRole('button', { name: 'Auto notes plus one' }));
      await user.click(screen.getByRole('radio', { name: status }));
      await user.click(screen.getByRole('button', { name: /review entry/i }));
      await user.click(await screen.findByRole('button', { name: /submit entry/i }));
      await waitFor(async () => expect((await pending(10))[0]?.payload.data).toEqual({}));
    },
  );

  it('summarises every phase in the confirmation, including empty ones', async () => {
    const user = await played();
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog');
    for (const phase of ['Autonomous', 'Teleop', 'Endgame', 'Notes']) {
      expect(within(dialog).getByRole('heading', { name: phase })).toBeInTheDocument();
    }
  });

  it('returns to a fresh manual selection after a successful submit', async () => {
    const onSubmitted = vi.fn();
    const user = await played({ onSubmitted });
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
  });

  it('keeps writing the draft after a submit that failed (UF.23)', async () => {
    // submitEntry's backstop refuses: the device already holds an entry for this robot.
    await db.rows.put({
      entity: 'scouting_entries',
      id: 'e-other',
      event_id: 'ev-1',
      form_kind: 'match',
      match_id: 'm-1',
      team_id: 't-1',
      deleted_at: null,
    } as unknown as CachedRow);
    const user = await played();
    const key = `${props.formVersionId}:${props.matchId}:${props.teamId}`;
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already an entry/);
    await user.click(screen.getByRole('button', { name: /keep editing/i }));
    await user.click(screen.getByRole('button', { name: 'Auto notes plus one' }));
    await waitFor(async () =>
      expect((await db.drafts.get(key))?.payload.data).toEqual({ auto_notes: 1 }),
    );
  });

  it('writes no draft back after a submit, from a timer or a phase tab (UF.23)', async () => {
    const onSubmitted = vi.fn();
    const user = await played({ onSubmitted });
    const key = `${props.formVersionId}:${props.matchId}:${props.teamId}`;
    act(() => matchClock.start());
    await waitFor(async () => expect(await db.drafts.get(key)).toBeDefined());
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(await db.drafts.get(key)).toBeUndefined();

    // The page is still on screen for a moment: the route leaves in a transition.
    try {
      act(() => {
        matchClock.reset();
        stopwatches.start('climb_time', 1);
      });
      await user.click(screen.getByRole('tab', { name: 'Teleop' }));
      await new Promise((done) => setTimeout(done, 50));
      expect(await db.drafts.get(key)).toBeUndefined();
    } finally {
      matchClock.reset();
      stopwatches.resetAll();
    }
  });
});

describe('Timer fields at Review entry (1.36)', () => {
  beforeEach(async () => {
    await db.rows.put(
      field({
        id: 't1',
        key: 'hang_time',
        label: 'Hang time',
        type: 'timer',
        display_order: 3,
        phase: 'auto',
        unit: 'seconds',
        direction: 'lower_is_better',
        required: true,
        config: { allow_unsure: true },
      }),
    );
  });

  it('takes "Unsure — no time" as the answer to a required timer', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(await screen.findByRole('switch', { name: 'Unsure — no time' }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm this entry' });
    const value = within(dialog).getByText('Hang time', { selector: 'dt' }).nextElementSibling;
    expect(value).toHaveTextContent('Unsure');
    await user.click(within(dialog).getByRole('button', { name: /submit entry/i }));
    await waitFor(async () =>
      expect((await pending(10))[0]?.payload.data).toMatchObject({ hang_time: null }),
    );
  });

  it('lists a stopwatch still running as a problem: "still running — stop it"', async () => {
    const user = userEvent.setup();
    render(<EntryPage {...props} />);
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(await screen.findByRole('button', { name: 'Start Hang time' }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog', { name: '1 thing to fix first' });
    expect(dialog).toHaveTextContent(/Hang time\s*Autonomous · still running — stop it/);
    await user.click(within(dialog).getByRole('button', { name: 'Go to Hang time' }));
    expect(screen.getByText('Still running — stop it')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.queryByText('Still running — stop it')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    expect(await screen.findByRole('dialog', { name: 'Confirm this entry' })).toBeInTheDocument();
    expect(await pending(10)).toHaveLength(0);
  });
});

describe('map fields at Review entry (UF.24)', () => {
  const START = { x: 0.27, y: 0.3 };
  const SHOTS = [
    { type: 'high', t: 12, x: 0.26, y: 0.4 },
    { type: 'def', t: 65 },
  ];

  beforeEach(async () => {
    await loadTimedParts();
    await db.rows.bulkPut([
      field({
        id: 'm1',
        key: 'start',
        label: 'Start position',
        type: 'position',
        display_order: 3,
        phase: 'auto',
        unit: 'coordinate',
        direction: 'neutral',
        config: { mirror_axis: 'horizontal' },
      }),
      field({
        id: 'm2',
        key: 'shots',
        label: 'Shots',
        type: 'event_log',
        display_order: 4,
        phase: 'teleop',
        unit: 'count',
        direction: 'neutral',
        config: {
          ask_position: true,
          mirror_axis: 'horizontal',
          event_types: [
            { value: 'high', label: 'High goal' },
            { value: 'def', label: 'Defended' },
          ],
        },
      }),
    ]);
    await db.drafts.put({
      key: `${props.formVersionId}:${props.matchId}:${props.teamId}`,
      row_id: '',
      payload: { robot_status: 'played', data: { start: START, shots: SHOTS } },
      updated_at: new Date().toISOString(),
    });
  });

  it('opens a map field view only from the confirmation; Close keeps the sheet and Submit saves the values', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <EntryPage {...props} fieldImagePath="seasons/2026/field.webp" />
      </MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'Start position: 1 spot' });
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm this entry' });
    const row = within(dialog).getByRole('button', { name: 'Shots: 2 events · 1 on the map' });
    await user.click(row);
    const map = await screen.findByRole('dialog', { name: 'Shots' });
    expect(map).toHaveTextContent('Q12 · 2096 · Teleop');
    expect(within(map).getByText('View only')).toBeInTheDocument();
    expect(within(map).queryByRole('button', { name: /Undo|Skip|Save tap|Done/ })).toBeNull();
    await user.click(within(map).getByTestId('map-drawing'));
    await user.click(within(map).getAllByRole('button', { name: 'Close' }).at(-1)!);
    expect(screen.queryByRole('dialog', { name: 'Shots' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Confirm this entry' })).toBe(dialog);
    expect(row).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Start position: 1 spot' })).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: /submit entry/i }));
    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
    expect((await pending(10))[0]!.payload.data).toMatchObject({ start: START, shots: SHOTS });
  });
});

describe('no edit after 5 minutes (SPEC-FINAL 7.6 v1.45; Phase 1 H side task 5)', () => {
  const T0 = Date.parse('2026-11-14T09:00:00.000Z');
  const MIN = 60_000;
  const STAMP = '2026-11-14T09:05:00.000Z';
  const own = (over: Record<string, unknown> = {}) => ({
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
    data: { auto_notes: 9, driver: 'Ana', notes: 'quick' } as Record<string, unknown>,
    client_created_at: new Date(T0).toISOString(),
    client_updated_at: new Date(T0).toISOString(),
    deleted_at: null,
    ...over,
  });
  /**
   * Only the timers the window uses, from `ms` after the entry was created; fake-indexeddb keeps
   * its own (setImmediate) real. The clock also runs with real time, so the page can load.
   */
  const clockAt = (ms: number) =>
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
      shouldAdvanceTime: true,
      now: T0 + ms,
    });
  const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
  const timer = () => screen.queryByRole('timer');

  beforeEach(async () => {
    // The read-only view lives in the timed parts' chunk: in memory before any clock is faked.
    await loadTimedParts();
    // A required field on the first tab, to empty at the mark.
    await db.rows.put(
      field({
        id: 'f0',
        key: 'driver',
        label: 'Driver',
        type: 'short_text',
        display_order: 0,
        phase: 'auto',
        unit: 'text',
        direction: 'neutral',
        required: true,
      }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function open(
    entry: ReturnType<typeof own>,
    author: { id: string; role: 'scouter' | 'lead' | 'admin' } = props.author,
  ) {
    await db.rows.put({ ...entry, entity: 'scouting_entries', version: 1 } as CachedRow);
    render(
      <MemoryRouter>
        <EntryPage {...props} author={author} existing={entry} />
      </MemoryRouter>,
    );
    await screen.findByLabelText('Auto notes value');
    return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  }

  it('counts down in the last minute only: nothing at 3:59, "Editable for 1:00" at 4:00, then each second', async () => {
    clockAt(3 * MIN + 50_000);
    await open(own());
    expect(timer()).toBeNull();
    await advance(9_000); // 3:59
    expect(timer()).toBeNull();
    await advance(1_000); // 4:00
    // Above Review entry, in the panel that holds it (jsdom draws the desktop layout).
    const panel = screen.getByRole('complementary', { name: 'This entry' });
    expect(within(panel).getByRole('timer')).toHaveTextContent(/^Editable for 1:00$/);
    expect(timer()).toHaveClass('font-num', 'text-warn');
    await advance(15_000); // 4:15
    expect(timer()).toHaveTextContent(/^Editable for 0:45$/);
    await advance(1_000);
    expect(timer()).toHaveTextContent(/^Editable for 0:44$/);
    expect(await pending(10)).toHaveLength(0);
  });

  it('at 5:00 saves what is typed, stamped created + 5:00, and the form becomes the entry read only', async () => {
    clockAt(4 * MIN + 50_000);
    const user = await open(own());
    await user.click(screen.getByRole('button', { name: 'Auto notes minus one' }));
    await advance(10_500); // past 5:00
    expect(await screen.findByText('Saved — the 5 minutes are up.')).toBeInTheDocument();

    const [op, ...rest] = await pending(10);
    expect(rest).toHaveLength(0);
    expect(op).toMatchObject({ action: 'update', row_id: 'e-1', base_version: 1 });
    expect(op!.client_created_at).toBe(new Date(T0).toISOString());
    expect(Date.parse(op!.client_updated_at) - Date.parse(op!.client_created_at)).toBe(300_000);
    expect(op!.client_updated_at).toBe(STAMP);
    expect(op!.payload.data).toEqual({ auto_notes: 8, driver: 'Ana', notes: 'quick' });
    expect((await db.rows.get(['scouting_entries', 'e-1']))?.client_updated_at).toBe(STAMP);

    // The form is gone: no tabs, no controls, no Review entry, no lock error. Read only instead.
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('button', { name: /review entry/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /plus one|minus one/ })).toBeNull();
    expect(timer()).toBeNull();
    expect(screen.queryByText(/locked/)).toBeNull();
    expect(screen.getByText('Read only')).toBeInTheDocument();
    expect(screen.getByText('Only a lead or an admin can change it now.')).toBeInTheDocument();
    expect(screen.getByText('Auto notes').parentElement).toHaveTextContent('8');
    expect(screen.getByRole('status')).not.toHaveTextContent(/Not kept/);
  });

  it('keeps the saved value of an out-of-range change at the mark, names it, and keeps the rest', async () => {
    clockAt(4 * MIN + 40_000);
    const user = await open(own());
    await user.click(screen.getByRole('button', { name: 'Auto notes plus one' }));
    await user.click(screen.getByRole('button', { name: 'Auto notes plus one' }));
    expect(screen.getByLabelText('Auto notes value')).toHaveTextContent('11');
    await user.click(screen.getByRole('tab', { name: /Notes/ }));
    await user.type(screen.getByRole('textbox', { name: 'Notes' }), ' and steady');
    await advance(20_500);
    // The counter's value is a status too, until the form goes: wait for the banner itself.
    await screen.findByText('Saved — the 5 minutes are up.');
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Saved — the 5 minutes are up.');
    expect(
      within(banner)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Not kept: Auto notes 11 is over 10.']);
    const [op] = await pending(10);
    expect(op!.client_updated_at).toBe(STAMP);
    expect(op!.payload.data).toEqual({ auto_notes: 9, driver: 'Ana', notes: 'quick and steady' });
  });

  it('keeps the saved value of a required field emptied at the mark, and names it', async () => {
    clockAt(4 * MIN + 50_000);
    const user = await open(own());
    await user.clear(screen.getByRole('textbox', { name: /Driver/ }));
    await user.click(screen.getByRole('button', { name: 'Auto notes minus one' }));
    await advance(10_500);
    // The counter's value is a status too, until the form goes: wait for the banner itself.
    await screen.findByText('Saved — the 5 minutes are up.');
    const banner = screen.getByRole('status');
    expect(
      within(banner)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Not kept: Driver is required and was left empty.']);
    const [op] = await pending(10);
    expect(op!.payload.data).toEqual({ auto_notes: 8, driver: 'Ana', notes: 'quick' });
  });

  it('saves at the mark with the review sheet open, closing it', async () => {
    clockAt(4 * MIN + 50_000);
    const user = await open(own());
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    expect(await screen.findByRole('dialog', { name: 'Confirm this entry' })).toBeInTheDocument();
    await advance(10_500);
    expect(await screen.findByText('Saved — the 5 minutes are up.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await pending(10)).toHaveLength(1);
  });

  it("a lead's form never counts down and never locks", async () => {
    clockAt(4 * MIN + 30_000);
    await open(own(), { id: 'u-lead', role: 'lead' });
    await advance(60_000); // 5:30
    expect(timer()).toBeNull();
    expect(screen.queryByText('Saved — the 5 minutes are up.')).toBeNull();
    expect(screen.getByRole('button', { name: /review entry/i })).toBeInTheDocument();
    expect(await pending(10)).toHaveLength(0);
  });

  it('an entry opened after its window closed never counts down or saves by itself', async () => {
    clockAt(5 * MIN + 10_000);
    await open(own());
    await advance(60_000);
    expect(timer()).toBeNull();
    expect(screen.queryByText('Saved — the 5 minutes are up.')).toBeNull();
    expect(await pending(10)).toHaveLength(0);
  });
});
