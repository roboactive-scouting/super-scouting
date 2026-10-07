import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProblemBar } from './ProblemBar';
import {
  Q10_PARTIAL,
  Q7_ONE_EMPTY,
  Q8_WITH_7845,
  Q9_FULL,
  REGISTRY,
  ROSTER_IDS,
  T7845,
} from './matchFixtures';

const TEAMS = new Map(REGISTRY.map((t) => [t.id, t]));

describe('ProblemBar', () => {
  it('names matches missing robots and offers to add an off-roster team', async () => {
    const onAddToRoster = vi.fn();
    render(
      <ProblemBar
        matches={[Q7_ONE_EMPTY, Q8_WITH_7845, Q10_PARTIAL]}
        rosterIds={ROSTER_IDS}
        teams={TEAMS}
        onAddToRoster={onAddToRoster}
      />,
    );
    expect(screen.getByText('Q7 and Q10 are missing robots')).toBeInTheDocument();
    expect(screen.getByText("7845 is not on this event's roster")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add 7845 to the roster' }));
    expect(onAddToRoster).toHaveBeenCalledWith(T7845);
  });

  it('still names an off-roster team whose number is not loaded, by its match, without a link', () => {
    render(
      <ProblemBar
        matches={[Q9_FULL, Q8_WITH_7845]}
        rosterIds={ROSTER_IDS}
        teams={new Map()}
        onAddToRoster={vi.fn()}
      />,
    );
    expect(screen.getByText("A team in Q8 is not on this event's roster")).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows only the key when nothing is wrong', () => {
    render(
      <ProblemBar
        matches={[Q9_FULL]}
        rosterIds={ROSTER_IDS}
        teams={TEAMS}
        onAddToRoster={vi.fn()}
      />,
    );
    expect(screen.getByText('Type a number · Tab moves on · saved per cell')).toBeInTheDocument();
    expect(screen.queryByText(/missing robots/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
