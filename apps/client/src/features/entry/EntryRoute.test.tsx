import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { EntryPreviewPage } from '@/features/entries/EntryPreviewPage';
import { EntryRoute } from './EntryRoute';
import { loadTimedParts } from './lazyParts';
import { SelectRobotPage } from './SelectRobotPage';

const entry = (createdMsAgo: number) => ({
  entity: 'scouting_entries' as const,
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
  data: {},
  client_created_at: new Date(Date.now() - createdMsAgo).toISOString(),
  deleted_at: null,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    { entity: 'matches', id: 'm-1', event_id: 'ev-1', match_type: 'qualification', number: 21 },
    { entity: 'teams', id: 't-1', number: 118, name: 'Robonauts' },
    { entity: 'event_teams', id: 'et-1', event_id: 'ev-1', team_id: 't-1', deleted_at: null },
    {
      entity: 'forms',
      id: 'f-1',
      kind: 'match',
      season_id: 'se-1',
      active_version_id: 'fv-1',
    },
    { entity: 'app_settings', id: 'singleton', active_season_id: 'se-1' },
  ]);
});

const scouter = { id: 'u-1', role: 'scouter' as const };

/** The entry preview (task 1.52), as the route tree mounts it under /entries/:id. */
function Preview({ viewer }: { viewer: { id: string; role: 'scouter' | 'lead' | 'admin' } }) {
  const id = useParams().id ?? '';
  return <EntryPreviewPage entryId={id} eventId="ev-1" viewer={viewer} />;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/scout" element={<SelectRobotPage eventId="ev-1" author={scouter} />} />
        <Route
          path="/entry/:matchId/:teamId"
          element={<EntryRoute eventId="ev-1" author={scouter} />}
        />
        <Route path="/entries/:id" element={<Preview viewer={scouter} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EntryRoute on submit (SPEC-FINAL 8.1)', () => {
  it('returns to a fresh scout page that names what was saved on this device', async () => {
    const user = userEvent.setup();
    renderAt('/entry/m-1/t-1?alliance=red');
    await user.click(await screen.findByRole('radio', { name: /no show/i }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));

    const notice = await screen.findByRole('status', { name: /entry saved/i });
    expect(notice).toHaveTextContent('Entry saved on this device');
    expect(notice).toHaveTextContent('Q21 · 118 Robonauts');
    // v1.17: a new entry offers the next match of the same type.
    expect(screen.getByLabelText(/match number/i)).toHaveValue(22);
    expect(screen.getByLabelText(/match type/i)).toHaveValue('qualification');
    // The scout page's device read has finished once it asks for a station (none is set).
    expect(await screen.findByRole('dialog', { name: 'Choose your station' })).toBeInTheDocument();
    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
  });
});

describe('EntryRoute and an entry already on this device (SPEC-FINAL 8.1, 7.6)', () => {
  it('after an edit, returns to the scout page with no match number filled in (v1.17)', async () => {
    await db.rows.put(entry(60 * 1000));
    const user = userEvent.setup();
    renderAt('/entry/m-1/t-1?alliance=red');
    await user.click(await screen.findByRole('radio', { name: /no show/i }));
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));

    const notice = await screen.findByRole('status', { name: /entry saved/i });
    expect(notice).toHaveTextContent('Changes saved on this device');
    expect(screen.getByLabelText(/match number/i)).toHaveValue(null);
  });

  // Phase 1 H side task 5 (SPEC-FINAL 7.6 v1.45): Home's Open and Sync's Open entry both link
  // here, so this is what a scouter meets opening their own entry after the window.
  it('opens a scouter’s own entry past its window as the entry preview: no form, no lock error, no Edit', async () => {
    await db.rows.put({ ...entry(6 * 60 * 1000), data: { auto_notes: 3 } });
    await db.rows.put({
      entity: 'form_fields',
      id: 'ff-1',
      form_version_id: 'fv-1',
      key: 'auto_notes',
      label: 'Auto notes',
      type: 'counter',
      display_order: 1,
      phase: 'auto',
      unit: 'count',
      direction: 'higher_is_better',
      required: false,
      deprecated: false,
      config: { min: 0, max: 10, step: 1 },
    });
    renderAt('/entry/m-1/t-1?alliance=red');
    expect(await screen.findByText('Auto notes')).toBeInTheDocument();
    expect(screen.getByText('Read only')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Q21118Robonauts');
    expect(screen.getByText('Played')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Team page' })).toHaveAttribute('href', '/teams/t-1');
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review entry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/locked/)).not.toBeInTheDocument();
  });

  it('lands the 5:00 mark on the entry preview with the banner, and keeps it when the route renders again', async () => {
    await loadTimedParts();
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
      shouldAdvanceTime: true,
    });
    try {
      await db.rows.put({ ...entry(4 * 60_000 + 55_000), version: 1 });
      const tree = (author: { id: string; role: 'scouter' }) => (
        <MemoryRouter initialEntries={['/entry/m-1/t-1?alliance=red']}>
          <Routes>
            <Route
              path="/entry/:matchId/:teamId"
              element={<EntryRoute eventId="ev-1" author={author} />}
            />
            <Route path="/entries/:id" element={<Preview viewer={author} />} />
          </Routes>
        </MemoryRouter>
      );
      const { rerender } = render(tree(scouter));
      expect(await screen.findByRole('button', { name: /review entry/i })).toBeInTheDocument();
      await act(async () => void (await vi.advanceTimersByTimeAsync(6_000)));
      expect(await screen.findByText('Saved — the 5 minutes are up.')).toBeInTheDocument();
      // The preview, not the form: its header and its Read only chip, and no Edit past 5:00.
      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Q21118Robonauts');
      expect(screen.getByText('Read only')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /review entry/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
      // The banner has focus: what replaced the form is said first.
      expect(screen.getByRole('status').parentElement).toHaveFocus();
      // The shell hands the route a new author object on a later render: the banner stays.
      rerender(tree({ ...scouter }));
      expect(screen.getByText('Saved — the 5 minutes are up.')).toBeInTheDocument();
      expect(await pending(10)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens another scouter’s match entry as the preview too, says whose it is, and offers no Edit', async () => {
    await db.rows.bulkPut([
      { ...entry(60 * 1000), scouter_id: 'u-2' },
      { entity: 'users', id: 'u-2', full_name: 'Dana Mor', username: 'dana' },
    ]);
    renderAt('/entry/m-1/t-1?alliance=red');
    expect(await screen.findByText('Dana Mor')).toBeInTheDocument();
    expect(screen.getByText(/Scouted by/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Team page' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review entry/i })).not.toBeInTheDocument();
  });

  it('gives a lead the form for the same entry, past the window, with no countdown', async () => {
    await db.rows.put(entry(6 * 60 * 1000));
    render(
      <MemoryRouter initialEntries={['/entry/m-1/t-1?alliance=red']}>
        <Routes>
          <Route
            path="/entry/:matchId/:teamId"
            element={<EntryRoute eventId="ev-1" author={{ id: 'u-lead', role: 'lead' }} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: /review entry/i })).toBeInTheDocument();
    expect(screen.queryByText('Read only')).not.toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('opens the entry form for it while the window is open', async () => {
    await db.rows.put(entry(60 * 1000));
    renderAt('/entry/m-1/t-1?alliance=red');
    expect(await screen.findByRole('button', { name: /review entry/i })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('EntryRoute when the resolve effect finds nothing to resolve (branch review, phase 1C follow-up)', () => {
  it('shows a clear state, never stuck on "Loading…", when the match or team is not on this device', async () => {
    renderAt('/entry/missing-match/t-1?alliance=red');
    expect(
      await screen.findByRole('heading', { name: /this match or team is not on this device/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/go back and pick the robot again/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to scouting/i })).toHaveAttribute(
      'href',
      '/scout',
    );
    expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument();
  });

  it('shows a clear state, never stuck on "Loading…", when the season has no published match form', async () => {
    await db.rows.put({
      entity: 'forms',
      id: 'f-1',
      kind: 'match',
      season_id: 'se-1',
      active_version_id: null,
    });
    renderAt('/entry/m-1/t-1?alliance=red');
    expect(
      await screen.findByRole('heading', {
        name: /no scouting form is published for this season yet/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/an admin publishes one in the form builder/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to scouting/i })).toHaveAttribute(
      'href',
      '/scout',
    );
    expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument();
  });
});

describe('EntryRoute for a match of another event (SPEC-FINAL 6.3, task 1.22)', () => {
  // The shell works on ev-1 (Week 3, season se-1). m-9 belongs to ev-0 (Week 1, season
  // se-0): the default moved while an entry for it was open, and the tablet restarted.
  beforeEach(async () => {
    await db.rows.bulkPut([
      { entity: 'events', id: 'ev-0', season_id: 'se-0', name: 'Week 1', sort_order: 1 },
      { entity: 'events', id: 'ev-1', season_id: 'se-1', name: 'Week 3', sort_order: 2 },
      { entity: 'matches', id: 'm-9', event_id: 'ev-0', match_type: 'qualification', number: 9 },
      { entity: 'forms', id: 'f-0', kind: 'match', season_id: 'se-0', active_version_id: 'fv-0' },
    ]);
  });

  it('finishes an entry with a draft against the event it started in, and its season form', async () => {
    await db.drafts.put({
      key: 'fv-0:m-9:t-1',
      row_id: '',
      payload: { robot_status: 'no_show', breakdown_seconds: 0, data: {} },
      updated_at: new Date().toISOString(),
    });
    const user = userEvent.setup();
    renderAt('/entry/m-9/t-1?alliance=red');

    expect(await screen.findByRole('status')).toHaveTextContent(
      'This entry belongs to Week 1, which is no longer the default competition. It is saved there when you submit.',
    );
    await waitFor(() => expect(screen.getByRole('radio', { name: /no show/i })).toBeChecked());
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));

    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
    const [op] = await pending(10);
    expect(op!.payload).toMatchObject({
      event_id: 'ev-0',
      form_version_id: 'fv-0',
      match_id: 'm-9',
    });
  });

  it('edits an entry this device already holds for that event against that event', async () => {
    await db.rows.put({
      ...entry(60 * 1000),
      id: 'e-9',
      event_id: 'ev-0',
      match_id: 'm-9',
      form_version_id: 'fv-0',
    });
    renderAt('/entry/m-9/t-1?alliance=red');
    expect(await screen.findByRole('button', { name: /review entry/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('This entry belongs to Week 1');
  });

  it('refuses to start a new entry for a match outside the default competition', async () => {
    renderAt('/entry/m-9/t-1?alliance=red');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This match belongs to Week 1, which is not the default competition. New entries can only be made in Week 3.',
    );
    expect(screen.queryByRole('button', { name: /review entry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /no show/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to scouting/i })).toBeInTheDocument();
  });

  it('takes the season from the match event row, not from app_settings, for the default too', async () => {
    // app_settings already names the next season; the shell still holds ev-0 (a held move).
    await db.rows.put({ entity: 'app_settings', id: 'singleton', active_season_id: 'se-1' });
    render(
      <MemoryRouter initialEntries={['/entry/m-9/t-1?alliance=red']}>
        <Routes>
          <Route
            path="/entry/:matchId/:teamId"
            element={<EntryRoute eventId="ev-0" author={scouter} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /no show/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /review entry/i }));
    await user.click(await screen.findByRole('button', { name: /submit entry/i }));
    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
    expect((await pending(10))[0]!.payload).toMatchObject({
      event_id: 'ev-0',
      form_version_id: 'fv-0',
    });
  });
});
