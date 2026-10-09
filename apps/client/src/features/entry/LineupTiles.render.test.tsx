import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Station } from '@/data/station';
import { LineupTiles, type Tile } from './LineupTiles';

const tile = (station: Station, n: number, done: Tile['done'] = null): Tile => ({
  station,
  teamId: `t-${n}`,
  number: n,
  name: `Team ${n}`,
  done,
});

function renderTiles(selected: Station, mine: Station | null, tiles: Tile[]) {
  render(
    <LineupTiles
      tiles={tiles}
      mine={mine}
      selected={selected}
      onPick={() => undefined}
      shortMatch="Q39"
      longMatch="Qualification 39"
      onNotHere={() => undefined}
    />,
  );
}

const ALL = [tile('R1', 1690), tile('R2', 3075), tile('B1', 2231), tile('B2', 5654)];

describe('the picked station tile (THEME "Station tile", amended 2026-10-08)', () => {
  it('is filled with the red strong colour, in white, never the accent', () => {
    renderTiles('R1', null, ALL);
    const picked = screen.getByRole('radio', { name: /RED 1/ });
    expect(picked).toBeChecked();
    expect(picked).toHaveClass('bg-alliance-red-strong', 'text-on-accent');
    expect(picked.className).not.toMatch(/accent-tint|accent-ink|var\(--accent\)|bg-accent/);
    expect(picked).not.toHaveClass('bg-alliance-red-tint');
    // The sub-line is white too: it carries no colour of its own.
    expect(screen.getByText('Team 1690')).not.toHaveClass('text-ink-2');
  });

  it('is filled with the blue strong colour on a blue station', () => {
    renderTiles('B1', null, ALL);
    const picked = screen.getByRole('radio', { name: /BLUE 1/ });
    expect(picked).toHaveClass('bg-alliance-blue-strong', 'text-on-accent');
    expect(picked.className).not.toMatch(/accent-tint|accent-ink|var\(--accent\)|bg-accent/);
  });

  it('leaves the other tiles on their tint', () => {
    renderTiles('R1', null, ALL);
    expect(screen.getByRole('radio', { name: /RED 2/ })).toHaveClass(
      'bg-alliance-red-tint',
      'text-alliance-red',
    );
    expect(screen.getByRole('radio', { name: /BLUE 2/ })).toHaveClass('bg-alliance-blue-tint');
    expect(screen.getByRole('radio', { name: /BLUE 2/ })).not.toHaveClass(
      'bg-alliance-blue-strong',
    );
  });

  it('carries a white YOUR STATION tag with the strong colour as its text', () => {
    renderTiles('B2', 'B2', ALL);
    const picked = screen.getByRole('radio', { name: /YOUR STATION/ });
    const tag = screen.getByText('YOUR STATION');
    expect(tag).toHaveClass('bg-on-accent', 'text-alliance-blue-strong');
    expect(tag.className).not.toMatch(/bg-accent|text-on-accent/);
    // The tag already marks the picked own-station tile, as in the design: no dashes on it.
    expect(picked.className).not.toMatch(/outline/);
  });

  it('keeps the alliance-coloured tag and dashed outline when your station is not the picked one', () => {
    renderTiles('R1', 'B2', ALL);
    const tag = screen.getByText('YOUR STATION');
    expect(tag).toHaveClass('bg-alliance-blue', 'text-on-accent');
    expect(screen.getByRole('radio', { name: /YOUR STATION/ })).toHaveClass(
      'outline-dashed',
      'outline-alliance-blue',
    );
  });

  it('shows a picked scouted tile in white on the fill (a lead may pick it)', () => {
    renderTiles('R2', null, [
      tile('R1', 1690),
      tile('R2', 3075, { locked: false, until: '11:52' }),
    ]);
    const picked = screen.getByRole('radio', { name: /RED 2/ });
    expect(picked).toHaveClass('bg-alliance-red-strong', 'text-on-accent');
    expect(picked).not.toHaveClass('bg-line-2', 'text-muted');
    expect(screen.getByText('✓')).toHaveClass('text-on-accent');
    expect(screen.getByText('✓')).not.toHaveClass('text-accent');
  });
});
