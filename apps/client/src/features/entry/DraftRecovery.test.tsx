import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatTime } from '@frc/shared';
import { db, type CachedRow } from '@/data/db';
import { pending } from '@/data/outbox';
import { ensureMatchLocally } from './bareMatch';
import { DraftRecovery } from './DraftRecovery';
import { EntryRoute } from './EntryRoute';
import { matchClock } from './matchClock';
import { practiceMode } from './practice';
import { stopwatches, type StopwatchRun } from './stopwatches';

const field = (over: Record<string, unknown>) =>
  ({
    entity: 'form_fields' as const,
    form_version_id: 'fv-1',
    required: false,
    deprecated: false,
    config: {},
    unit: 'count',
    direction: 'higher_is_better',
    ...over,
  }) as unknown as CachedRow;

const T = (hh: number, mm: number) => {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  await practiceMode.exit();
  await db.rows.bulkPut([
    { entity: 'matches', id: 'm-39', event_id: 'ev-1', match_type: 'qualification', number: 39 },
    { entity: 'matches', id: 'm-40', event_id: 'ev-1', match_type: 'qualification', number: 40 },
    { entity: 'teams', id: 't-1690', number: 1690, name: 'Orbit' },
    { entity: 'teams', id: 't-118', number: 118, name: 'Robonauts' },
    { entity: 'event_teams', id: 'et-1', event_id: 'ev-1', team_id: 't-1690', deleted_at: null },
    {
      entity: 'match_teams',
      id: 'mt-1',
      match_id: 'm-39',
      team_id: 't-1690',
      alliance: 'red',
      station: 1,
    },
    {
      entity: 'match_teams',
      id: 'mt-2',
      match_id: 'm-40',
      team_id: 't-118',
      alliance: 'blue',
      station: 2,
    },
    { entity: 'forms', id: 'f-1', kind: 'match', season_id: 'se-1', active_version_id: 'fv-1' },
    { entity: 'app_settings', id: 'singleton', active_season_id: 'se-1' },
    field({
      id: 'f1',
      key: 'auto_high',
      label: 'Pieces scored high',
      type: 'counter',
      display_order: 1,
      phase: 'auto',
      config: { min: 0, step: 1 },
    }),
    field({
      id: 'f2',
      key: 'tele_high',
      label: 'Teleop high',
      type: 'counter',
      display_order: 2,
      phase: 'teleop',
      config: { min: 0, step: 1 },
    }),
  ]);
});

afterEach(async () => {
  await practiceMode.exit();
  matchClock.reset();
});

const scouter = { id: 'u-1', role: 'scouter' as const };

/** Scout (with the offer on top) and the entry route, as the app mounts them. */
function renderApp(path = '/scout') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/scout" element={<DraftRecovery />} />
        <Route
          path="/entry/:matchId/:teamId"
          element={<EntryRoute eventId="ev-1" author={scouter} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const q39Draft = {
  key: 'fv-1:m-39:t-1690',
  row_id: '',
  payload: {
    robot_status: 'played',
    data: { auto_high: 2, tele_high: 4 },
    breakdown_seconds: null,
    alliance: 'red',
    phase: 'teleop',
    clock: { at: Date.now() - 48_000, timed: true },
    stopwatches: {},
  },
  updated_at: T(11, 42),
};

describe('draft recovery (SPEC-FINAL 8.3)', () => {
  it('offers a saved draft by match and team, with its station and when it last changed', async () => {
    await db.drafts.put(q39Draft);
    renderApp();
    const offer = await screen.findByRole('region', { name: 'Unfinished entry' });
    expect(offer).toHaveTextContent(
      `You have an unfinished entry: Q39 · 1690 Orbit, Red 1 — last change ${formatTime(T(11, 42))}, on this device.`,
    );
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('offers the most recent draft when there are several', async () => {
    await db.drafts.bulkPut([
      q39Draft,
      { ...q39Draft, key: 'fv-1:m-40:t-118', payload: { data: {} }, updated_at: T(11, 50) },
    ]);
    renderApp();
    expect(await screen.findByRole('region', { name: 'Unfinished entry' })).toHaveTextContent(
      'Q40 · 118 Robonauts, Blue 2',
    );
  });

  it('words a super draft as a super entry, with no match', async () => {
    await db.drafts.put({
      key: 'fv-9:super:t-1690',
      row_id: '',
      payload: { form_kind: 'super', team_id: 't-1690', data: {} },
      updated_at: T(10, 5),
    });
    renderApp();
    expect(await screen.findByRole('region', { name: 'Unfinished entry' })).toHaveTextContent(
      `You have an unfinished super entry: 1690 Orbit — last change ${formatTime(T(10, 5))}, on this device.`,
    );
  });

  it('Resume reopens the entry where it was: values, phase and the running match clock', async () => {
    await db.drafts.put(q39Draft);
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'Resume' }));
    // The phase it was on (Teleop), with the value the scout had set there.
    expect(await screen.findByLabelText('Teleop high value')).toHaveTextContent('4');
    expect(screen.getByRole('radio', { name: /played/i })).toBeChecked();
    // The match clock is running again from the same Start match, not from zero.
    await waitFor(() => expect(matchClock.isRunning()).toBe(true));
    expect(matchClock.elapsed()).toBeGreaterThanOrEqual(48);
    // Opening it is not a change: the draft keeps its last-change time.
    expect((await db.drafts.get(q39Draft.key))?.updated_at).toBe(q39Draft.updated_at);
  });

  it('keeps the match clock and a running stopwatch in the draft, so a reload brings them back', async () => {
    const user = userEvent.setup();
    const first = renderApp('/entry/m-39/t-1690?alliance=red');
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    act(() => matchClock.start());
    act(() => stopwatches.start('climb_time', 3));
    await waitFor(async () => {
      const saved = (await db.drafts.get(q39Draft.key))?.payload;
      expect(saved?.clock).toMatchObject({ timed: true });
      expect((saved?.stopwatches as Record<string, StopwatchRun>).climb_time).toMatchObject({
        base: 3,
      });
    });
    // The page closes (a crash, a reload): the clock and the stopwatches are cleared with it.
    first.unmount();
    expect(matchClock.isRunning()).toBe(false);
    expect(stopwatches.running('climb_time')).toBe(false);

    renderApp('/entry/m-39/t-1690?alliance=red');
    await waitFor(() => expect(stopwatches.running('climb_time')).toBe(true));
    expect(matchClock.isRunning()).toBe(true);
    expect(stopwatches.seconds('climb_time')).toBeGreaterThanOrEqual(3);
  });

  it('Discard deletes that draft only, and Undo puts the very record back', async () => {
    const older = { ...q39Draft, key: 'fv-1:m-40:t-118', updated_at: T(9, 0) };
    await db.drafts.bulkPut([q39Draft, older]);
    const user = userEvent.setup();
    renderApp();
    expect(await screen.findByRole('region', { name: 'Unfinished entry' })).toHaveTextContent(
      'Q39',
    );
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(async () => expect(await db.drafts.get(q39Draft.key)).toBeUndefined());
    expect(await db.drafts.get(older.key)).toEqual(older);
    expect(screen.getByRole('status')).toHaveTextContent('Draft discarded');
    // The next draft is offered in its place.
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Unfinished entry' })).toHaveTextContent('Q40'),
    );

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect(await db.drafts.get(q39Draft.key)).toEqual(q39Draft));
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Unfinished entry' })).toHaveTextContent('Q39'),
    );
  });

  it('offers nothing when there is no draft', async () => {
    renderApp();
    // The scout page renders; give the device read time to finish.
    await waitFor(async () => expect(await db.drafts.count()).toBe(0));
    await new Promise((done) => setTimeout(done, 50));
    expect(screen.queryByRole('region', { name: 'Unfinished entry' })).not.toBeInTheDocument();
  });

  it('never offers a practice draft (SPEC-FINAL 8.5)', async () => {
    await db.practiceDrafts.put(q39Draft);
    renderApp();
    await new Promise((done) => setTimeout(done, 50));
    expect(screen.queryByRole('region', { name: 'Unfinished entry' })).not.toBeInTheDocument();
  });

  it('offers nothing while practice is on', async () => {
    await db.drafts.put(q39Draft);
    practiceMode.enter();
    renderApp();
    await new Promise((done) => setTimeout(done, 50));
    expect(screen.queryByRole('region', { name: 'Unfinished entry' })).not.toBeInTheDocument();
  });
});

describe('practice on the real form (SPEC-FINAL 8.5)', () => {
  /** Opens Q39 · 1690 in practice, marks Played and scores one. */
  async function practise() {
    practiceMode.enter();
    const user = userEvent.setup();
    renderApp('/entry/m-39/t-1690?alliance=red');
    await user.click(await screen.findByRole('radio', { name: /played/i }));
    await user.click(await screen.findByRole('button', { name: 'Pieces scored high plus one' }));
    return user;
  }

  it('never creates a match: a match the device lacks cannot be practised on', async () => {
    practiceMode.enter();
    await expect(
      ensureMatchLocally(undefined, {
        eventId: 'ev-1',
        matchType: 'qualification',
        number: 77,
        author: scouter,
      }),
    ).rejects.toThrow(/practice/);
    expect(await pending(10)).toHaveLength(0);
    expect(await db.rows.where('entity').equals('matches').count()).toBe(2);
  });

  it('says it is not saved, and Finish practice ends in a sheet that sends nothing', async () => {
    const user = await practise();
    expect(screen.getByText('Practice · not saved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review entry/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finish practice' }));

    const sheet = await screen.findByRole('dialog', { name: 'Practice finished' });
    expect(sheet).toHaveTextContent('Nothing was saved or sent.');
    expect(await pending(10)).toHaveLength(0);
    expect(await db.rows.where('entity').equals('scouting_entries').count()).toBe(0);
    // Its draft went to the practice store, never to the real one.
    expect(await db.drafts.count()).toBe(0);
    expect(await db.practiceDrafts.count()).toBe(1);
  });

  it('Exit practice leaves practice, empties the practice store and returns to Scout', async () => {
    const user = await practise();
    await user.click(screen.getByRole('button', { name: 'Finish practice' }));
    await screen.findByRole('dialog', { name: 'Practice finished' });
    await user.click(screen.getByRole('button', { name: 'Exit practice' }));

    await waitFor(async () => expect(await db.practiceDrafts.count()).toBe(0));
    expect(practiceMode.active()).toBe(false);
    expect(await pending(10)).toHaveLength(0);
    // Back on Scout, with no unfinished entry to offer: the practice left none.
    expect(screen.queryByRole('button', { name: 'Finish practice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Unfinished entry' })).not.toBeInTheDocument();
  });
});
