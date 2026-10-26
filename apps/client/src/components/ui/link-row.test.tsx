import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LinkRow, LinkTableRow } from './link-row';
import { RankBadge } from './rank-badge';
import { Table, TableBody, TableCell } from './table';

describe('LinkRow (THEME "Link row (opens a page)", task 1.51)', () => {
  it('is one link over the whole row, named for where it goes, its › decorative', () => {
    render(
      <MemoryRouter>
        <LinkRow to="/teams/t-1" label="1690 Orbit, team page">
          <span>1690</span>
          <span>Orbit</span>
        </LinkRow>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: '1690 Orbit, team page' });
    expect(link).toHaveAttribute('href', '/teams/t-1');
    expect(link).toHaveTextContent('1690Orbit');
    expect(link.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
    expect(link.className).toMatch(/min-h-\[60px\]/);
    // Pressed, hovered and focused all light it: tint plus the 3 px accent edge.
    expect(link.className).toContain('active:bg-accent-tint');
    expect(link.className).toContain('focus-visible:shadow-[inset_3px_0_0_var(--accent)]');
  });

  it('draws a white › on a row that is tinted at rest (our team)', () => {
    render(
      <MemoryRouter>
        <LinkRow to="/teams/t-2" label="2096 RobActive, team page" tinted>
          2096
        </LinkRow>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link.className).toContain('bg-accent-tint');
    expect(link.querySelector('[aria-hidden="true"]')?.className).toContain('bg-surface');
  });

  it('in a table, stretches its link over the row and says "Team page" at the end', () => {
    render(
      <MemoryRouter>
        <Table>
          <TableBody>
            <LinkTableRow to="/teams/t-1" label="1690 Orbit, team page" endLabel="Team page">
              <TableCell>1690 Orbit</TableCell>
            </LinkTableRow>
          </TableBody>
        </Table>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: '1690 Orbit, team page' });
    expect(link.className).toContain('after:inset-0');
    expect(link.closest('tr')?.className).toContain('relative');
    expect(within(link).getByText('Team page')).toBeInTheDocument();
  });
});

describe('RankBadge (THEME "Rank badge (side)")', () => {
  it('names the place, with a medal on the top 3 only', () => {
    render(
      <>
        <RankBadge rank={1} none="not ranked yet" />
        <RankBadge rank={3} none="not ranked yet" />
        <RankBadge rank={4} none="not ranked yet" />
      </>,
    );
    expect(screen.getByRole('img', { name: 'Rank 1, medal' })).toHaveTextContent('#1');
    expect(screen.getByRole('img', { name: 'Rank 3, medal' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Rank 4' })).toHaveTextContent('#4');
    expect(screen.getAllByRole('img', { name: /medal/ })).toHaveLength(2);
  });

  it('says why there is no rank, in words, with no badge', () => {
    render(<RankBadge rank={null} none="not at this event" />);
    expect(screen.getByText('not at this event')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
