import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { SelectRobotPage } from './SelectRobotPage';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

const props = { eventId: 'ev-1', authorUserId: 'u-1' };

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
  it('lists the roster once an alliance is chosen', async () => {
    const user = userEvent.setup();
    render(<SelectRobotPage {...props} />);
    await user.type(screen.getByLabelText(/match number/i), '5');
    const beforeAlliance = await screen.findByRole('button', { name: /118/ });
    expect(beforeAlliance).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'red' }));
    expect(screen.getByRole('button', { name: /118/ })).toBeEnabled();
  });

  it('navigates and enqueues nothing for a known match number', async () => {
    const user = userEvent.setup();
    render(<SelectRobotPage {...props} />);
    await user.type(screen.getByLabelText(/match number/i), '5');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'red' }));
    await user.click(await screen.findByRole('button', { name: /118/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/entry/m-known/t-1?alliance=red'));
    expect(await pending(10)).toHaveLength(0);
  });

  it('shows a notice for an unknown match number and creates it on choosing a robot', async () => {
    const user = userEvent.setup();
    render(<SelectRobotPage {...props} />);
    await user.type(screen.getByLabelText(/match number/i), '9');
    expect(await screen.findByRole('status')).toHaveTextContent(/not on this device yet/i);

    await user.click(screen.getByRole('radio', { name: 'blue' }));
    await user.click(await screen.findByRole('button', { name: /118/ }));

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
    await user.click(await screen.findByRole('button', { name: /118/ }));
    // Wait for the component's own render to reflect the match as known — not just for
    // the write to land — since a click fires the closure captured by the LAST render.
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    await user.click(await screen.findByRole('button', { name: /254/ }));
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

    expect(await screen.findByRole('button', { name: /118/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /254/ })).not.toBeInTheDocument();
  });

  it('falls back to the whole roster when the match has no match_teams slots for that alliance', async () => {
    const user = userEvent.setup();
    render(<SelectRobotPage {...props} />);
    await user.type(screen.getByLabelText(/match number/i), '5');
    await user.click(screen.getByRole('radio', { name: 'blue' }));

    expect(await screen.findByRole('button', { name: /118/ })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /254/ })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /971/ })).toBeInTheDocument();
  });

  it('works the whole bare-match-creation flow with navigator.onLine false', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const user = userEvent.setup();
    render(<SelectRobotPage {...props} />);
    await user.type(screen.getByLabelText(/match number/i), '9');
    await user.click(screen.getByRole('radio', { name: 'red' }));
    await user.click(await screen.findByRole('button', { name: /118/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(await pending(10)).toHaveLength(1);
  });
});
