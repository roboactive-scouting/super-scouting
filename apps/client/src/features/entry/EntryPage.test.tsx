import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/needs its breakdown time/);
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
