import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CoverageCard } from './CoverageCard';
import type { CoverageCell } from './homeData';

/** Q10–Q13: Q12 has four of its six robots scouted. */
const CELLS: CoverageCell[] = [
  { matchId: 'm10', label: 'Q10', state: 'full', scouted: 6 },
  { matchId: 'm11', label: 'Q11', state: 'gap', scouted: 5 },
  { matchId: 'm12', label: 'Q12', state: 'gap', scouted: 4 },
  { matchId: 'm13', label: 'Q13', state: 'none', scouted: 0 },
];

function renderCard() {
  render(
    <>
      <CoverageCard cells={CELLS} desktop={false} />
      <p>Elsewhere</p>
    </>,
  );
  return userEvent.setup();
}

const tip = () => screen.queryByText(/ · \d+ scouted$/);

describe('CoverageCard: a square names its match (UF.21)', () => {
  it('keeps a summary for screen readers and names every square', () => {
    renderCard();
    expect(
      screen.getByRole('group', { name: '1 All 6, 2 Missing a robot, 1 Not played' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Q12 · 4 scouted' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Q13 · 0 scouted' })).toBeInTheDocument();
    expect(tip()).toBeNull();
  });

  it('a tap shows "Q12 · 4 scouted"; a tap on another square moves it', async () => {
    const user = renderCard();
    await user.click(screen.getByRole('button', { name: 'Q12 · 4 scouted' }));
    expect(tip()).toHaveTextContent('Q12 · 4 scouted');
    expect(screen.getAllByText(/ · \d+ scouted$/)).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Q10 · 6 scouted' }));
    expect(tip()).toHaveTextContent('Q10 · 6 scouted');
    expect(screen.getAllByText(/ · \d+ scouted$/)).toHaveLength(1);
  });

  it('a tap elsewhere closes it, and so does Escape', async () => {
    const user = renderCard();
    await user.click(screen.getByRole('button', { name: 'Q12 · 4 scouted' }));
    expect(tip()).not.toBeNull();
    await user.click(screen.getByText('Elsewhere'));
    expect(tip()).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Q11 · 5 scouted' }));
    await user.keyboard('{Escape}');
    expect(tip()).toBeNull();
  });

  it('keyboard focus shows it; the squares are one tab stop and the arrows move', async () => {
    const user = renderCard();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Q10 · 6 scouted' })).toHaveFocus();
    expect(tip()).toHaveTextContent('Q10 · 6 scouted');
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Q12 · 4 scouted' })).toHaveFocus();
    expect(tip()).toHaveTextContent('Q12 · 4 scouted');
    await user.tab();
    expect(tip()).toBeNull();
  });

  it('a hover shows it on a computer', async () => {
    const user = renderCard();
    await user.hover(screen.getByRole('button', { name: 'Q11 · 5 scouted' }));
    expect(tip()).toHaveTextContent('Q11 · 5 scouted');
    await user.unhover(screen.getByRole('button', { name: 'Q11 · 5 scouted' }));
    expect(tip()).toBeNull();
  });
});
