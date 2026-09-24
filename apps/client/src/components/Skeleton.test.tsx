import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './Skeleton';
import source from './Skeleton.tsx?raw';

const bars = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[data-skeleton-bar]')];

describe('Skeleton (SPEC-FINAL 17.8: skeletons, not spinners)', () => {
  it('is a busy status region with the requested number of bars', () => {
    render(<Skeleton rows={4} label="Loading the users" />);
    const status = screen.getByRole('status', { name: 'Loading the users' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(bars(status)).toHaveLength(4);
  });

  it('draws each bar at the height of the row it is about to fill', () => {
    render(<Skeleton rows={2} rowHeight="3rem" />);
    const all = bars(screen.getByRole('status'));
    expect(all).toHaveLength(2);
    for (const bar of all) expect(bar.style.blockSize).toBe('3rem');
  });

  it('never spins: no animate-spin in the markup or anywhere in the component source', () => {
    const { container } = render(<Skeleton rows={3} shimmer />);
    expect(container.innerHTML).not.toMatch(/animate-spin/);
    expect(source).not.toMatch(/animate-spin/);
  });

  it('has no shimmer by default: motion here would be decoration (SPEC-FINAL 17.9)', () => {
    const { container } = render(<Skeleton rows={3} />);
    expect(container.innerHTML).not.toMatch(/animate-/);
  });

  it('drops an opted-in shimmer under prefers-reduced-motion, and keeps the layout', () => {
    render(<Skeleton rows={2} shimmer />);
    const all = bars(screen.getByRole('status'));
    expect(all).toHaveLength(2);
    for (const bar of all) {
      // Only the motion-safe variant animates, so reduced motion gets still bars.
      expect(bar.className).toMatch(/(^|\s)motion-safe:animate-pulse(\s|$)/);
      expect(bar.className).not.toMatch(/(^|\s)animate-pulse(\s|$)/);
      expect(bar.style.blockSize).not.toBe('');
    }
  });
});
