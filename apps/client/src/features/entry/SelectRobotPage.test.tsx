import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { SelectRobotPage } from './SelectRobotPage';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

const props = { eventId: 'ev-1', authorUserId: 'u-1' };

const robotSelect = () => screen.getByRole('combobox', { name: /robot/i });
/** The option text for a robot, found by team number. */
const option = (team: RegExp) => screen.findByRole('option', { name: team });

async function startWith(user: ReturnType<typeof userEvent.setup>, team: RegExp) {
  await user.selectOptions(robotSelect(), await option(team));
  await user.click(screen.getByRole('button', { name: /start entry/i }));
}

beforeEach(async () => {
  navigate.mockClear();
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    { entity: 'teams', id: 't-1', number: 118, name: 'Robonauts' },
    { entity: 'teams', id: 't-2', number: 254, name: 'The Cheesy Poofs' },
    { entity: 'teams', id: 't-3', number: 971, name: 'Spartan Robotics' },
    { entity: 'event_teams', id: 'et-1', event_id: 'ev-1', team_id: 't-1', deleted_at: null },
    { entity: 'event_teams', id: 'et-2', event_id: 'ev-1', team_id: 't-2', deleted_at: null },
    { entity: 'event_teams', id: 'et-3', event_id: 'ev-1', team_id: 't-3', deleted_at: null },
    { entity: 'matches', id: 'm-known', event_id: 'ev-1', match_type: 'qualification', number: 5 },
    { entity: 'match_teams', id: 'mt-1', match_id: 'm-known', alliance: 'red', team_id: 't-1' },
  ]);
});

describe('SelectRobotPage (SPEC-FINAL 8.1, 6.4)', () => {
  it('offers the robots as a native select, enabled once an alliance is chosen', async () => {
    const user = userEvent.setup();
    render(<SelectRobotPage {...props} />);
    await user.type(screen.getByLabelText(/match number/i), '5');
    expect(robotSelect().tagName).toBe('SELECT');
    expect(robotSelect()).toBeDisabled();
    expect(screen.getByRole('button', { name: /start entry/i })).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'red' }));
    expect(robotSelect()).toBeEnabled();
    await user.selectOptions(robotSelect(), await option(/118/));
    expect(screen.getByRole('button', { name: /start entry/i })).toBeEnabled();
  });

  it('navigates and enqueues nothing for a known match number', async () => {
    const user = userEvent.setup();
    render(<SelectRobotPage {...props} />);
    await user.type(screen.getByLabelText(/match number/i), '5');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'red' }));
    await startWith(user, /118/);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/entry/m-known/t-1?alliance=red'));
    expect(await pending(10)).toHaveLength(0);
  });

  it('shows a notice for an unknown match number and creates it on choosing a robot', async () => {
    const user = userEvent.setup();
    render(<SelectRobotPage {...props} />);
    await user.type(screen.getByLabelText(/match number/i), '9');
    expect(await screen.findByRole('status')).toHaveTextContent(/not on this device yet/i);

    await user.click(screen.getByRole('radio', { name: 'blue' }));
    await startWith(user, /118/);

    await waitFor(async () => expect(await pending(10)).toHaveLength(1));
    const [op] = await pending(10);
    if (!op) throw new Error('expected one pending operation');
    expect(op.entity).toBe('match');
    expect(op.action).toBe('create');
    expect(Object.keys(op.payload).sort()).toEqual(['event_id', 'match_type', 'number']);
    expect(op.payload).toEqual({ event_id: 'ev-1', match_type: 'qualification', number: 9 });

    const localMatches = (await db.rows.where('entity').equals('matches').toArray()).filter(
      (m) => m.number === 9,
    );
    expect(localMatches).toHaveLength(1);
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  });

  it('creates only one match when the same unknown number is chosen twice', async () => {
    const user = userEvent.setup();
    render(<SelectRobotPage {...props} />);
    await user.type(screen.getByLabelText(/match number/i), '9');
    await user.click(screen.getByRole('radio', { name: 'blue' }));
    await startWith(user, /118/);
    // Wait for the component's own render to reflect the match as known — not just for
    // the write to land — since a click fires the closure captured by the LAST render.
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    await startWith(user, /254/);
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));

    expect(await pending(10)).toHaveLength(1);
    const createdMatches = (await db.rows.where('entity').equals('matches').toArray()).filter(
      (m) => m.number === 9,
    );
    expect(createdMatches).toHaveLength(1);
  });

  it('narrows the team list to the match_teams slots for the chosen alliance when they exist', async () => {
    const user = userEvent.setup();
    render(<SelectRobotPage {...props} />);
    await user.type(screen.getByLabelText(/match number/i), '5');
    await user.click(screen.getByRole('radio', { name: 'red' }));

    expect(await option(/118/)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /254/ })).not.toBeInTheDocument();
  });

  it('falls back to the whole roster when the match has no match_teams slots for that alliance', async () => {
    const user = userEvent.setup();
    render(<SelectRobotPage {...props} />);
    await user.type(screen.getByLabelText(/match number/i), '5');
    await user.click(screen.getByRole('radio', { name: 'blue' }));

    expect(await option(/118/)).toBeInTheDocument();
    expect(await option(/254/)).toBeInTheDocument();
    expect(await option(/971/)).toBeInTheDocument();
  });

  it('works the whole bare-match-creation flow with navigator.onLine false', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const user = userEvent.setup();
    render(<SelectRobotPage {...props} />);
    await user.type(screen.getByLabelText(/match number/i), '9');
    await user.click(screen.getByRole('radio', { name: 'red' }));
    await startWith(user, /118/);

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(await pending(10)).toHaveLength(1);
  });

  describe('a robot this device already scouted in the match (SPEC-FINAL 8.1, 7.6)', () => {
    const entry = (over: Record<string, unknown> = {}) => ({
      entity: 'scouting_entries' as const,
      id: 'e-1',
      event_id: 'ev-1',
      form_kind: 'match',
      form_version_id: 'fv-1',
      match_id: 'm-known',
      team_id: 't-1',
      alliance: 'blue',
      scouter_id: 'u-1',
      robot_status: 'played',
      breakdown_seconds: null,
      data: {},
      client_created_at: new Date().toISOString(),
      deleted_at: null,
      ...over,
    });

    async function chooseMatch5(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText(/match number/i), '5');
      await user.click(screen.getByRole('radio', { name: 'red' }));
    }

    it('opens the existing entry inside the edit window instead of starting a second', async () => {
      await db.rows.put(entry());
      const user = userEvent.setup();
      render(<SelectRobotPage {...props} />);
      await chooseMatch5(user);
      const scouted = await option(/118.*already scouted, editable until/);
      expect(scouted).toBeEnabled();

      await user.selectOptions(robotSelect(), scouted);
      expect(screen.queryByRole('button', { name: /start entry/i })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /edit the existing entry/i }));
      // The entry's own alliance, not the one on the picker.
      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith('/entry/m-known/t-1?alliance=blue'),
      );
      expect(await pending(10)).toHaveLength(0);
    });

    it('shows it as scouted and locked, and not choosable, once the window has passed', async () => {
      await db.rows.put(
        entry({ client_created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString() }),
      );
      const user = userEvent.setup();
      render(<SelectRobotPage {...props} />);
      await chooseMatch5(user);
      const locked = await option(/118.*already scouted, locked/);
      expect(locked).toBeDisabled();
      expect(screen.getByRole('button', { name: /start entry/i })).toBeDisabled();
    });

    it("treats another scout's cached entry as locked (no roles on the device in 1A)", async () => {
      await db.rows.put(entry({ scouter_id: 'u-other' }));
      const user = userEvent.setup();
      render(<SelectRobotPage {...props} />);
      await chooseMatch5(user);
      expect(await option(/118.*locked/)).toBeDisabled();
    });

    it('only marks the match that entry belongs to', async () => {
      await db.rows.bulkPut([
        { entity: 'matches', id: 'm-6', event_id: 'ev-1', match_type: 'qualification', number: 6 },
        entry({ match_id: 'm-6' }),
      ]);
      const user = userEvent.setup();
      render(<SelectRobotPage {...props} />);
      await chooseMatch5(user);
      const plain = await option(/118/);
      expect(plain).toBeEnabled();
      expect(plain).not.toHaveTextContent(/already scouted/);
    });

    it('ignores a soft-deleted entry', async () => {
      await db.rows.put(entry({ deleted_at: new Date().toISOString() }));
      const user = userEvent.setup();
      render(<SelectRobotPage {...props} />);
      await chooseMatch5(user);
      expect(await option(/118/)).not.toHaveTextContent(/already scouted/);
    });
  });
});
