import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { EntryRoute } from './EntryRoute';
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

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<SelectRobotPage eventId="ev-1" authorUserId="u-1" />} />
        <Route
          path="/entry/:matchId/:teamId"
          element={<EntryRoute eventId="ev-1" authorUserId="u-1" />}
        />
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
    expect(screen.getByLabelText(/match number/i)).toHaveValue(null);
    // The scout page's cache read has finished once the roster is on the select.
    expect(await screen.findByRole('option', { name: /118/ })).toBeInTheDocument();
    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
  });
});

describe('EntryRoute and an entry already on this device (SPEC-FINAL 8.1, 7.6)', () => {
  it('says plainly that the robot is scouted and locked once the window has passed', async () => {
    await db.rows.put(entry(6 * 60 * 1000));
    renderAt('/entry/m-1/t-1?alliance=red');
    expect(await screen.findByRole('alert')).toHaveTextContent(/already scouted.*locked/);
    expect(screen.queryByRole('button', { name: /review entry/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to scouting/i })).toBeInTheDocument();
  });

  it('opens the entry form for it while the window is open', async () => {
    await db.rows.put(entry(60 * 1000));
    renderAt('/entry/m-1/t-1?alliance=red');
    expect(await screen.findByRole('button', { name: /review entry/i })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
