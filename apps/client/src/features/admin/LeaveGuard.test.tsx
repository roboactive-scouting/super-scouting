import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatchRow } from '@frc/shared';
import { LeaveGuard } from './LeaveGuard';
import { qual } from './matchFixtures';
import { UnsavedConfirm } from './UnsavedConfirm';

const Q1 = qual(1, []);

function renderGuard(unsaved: ReadonlySet<string>) {
  const router = (held: ReadonlySet<string>) =>
    createMemoryRouter([{ path: '/', element: <LeaveGuard matches={[Q1]} unsaved={held} /> }]);
  const view = render(<RouterProvider router={router(unsaved)} />);
  return {
    rerender: (held: ReadonlySet<string>) =>
      view.rerender(<RouterProvider router={router(held)} />),
  };
}

function reloadPrevented() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LeaveGuard and a reload or closed tab', () => {
  it('holds a beforeunload listener only while a line-up is unsaved or on its way', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = renderGuard(new Set());
    expect(add.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(0);
    expect(reloadPrevented()).toBe(false);

    view.rerender(new Set([Q1.id]));
    expect(add.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1);
    expect(reloadPrevented()).toBe(true);

    view.rerender(new Set());
    expect(remove.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1);
    expect(reloadPrevented()).toBe(false);
  });
});

describe('UnsavedConfirm', () => {
  const props = { open: true, action: 'leave' as const, onStay: () => {}, onGo: () => {} };

  it('names the matches in bold', () => {
    render(<UnsavedConfirm {...props} matches={[Q1]} unsaved={new Set([Q1.id])} />);
    expect(screen.getByText('Q1')).toHaveClass('font-bold');
  });

  it('falls back to a count when none of the ids is in the list', () => {
    const matches: MatchRow[] = [];
    render(<UnsavedConfirm {...props} matches={matches} unsaved={new Set(['a', 'b'])} />);
    expect(screen.getByText('2 matches')).toHaveClass('font-bold');
  });

  it('has no Ban icon on its confirm button', () => {
    render(<UnsavedConfirm {...props} matches={[Q1]} unsaved={new Set([Q1.id])} />);
    expect(screen.getByRole('button', { name: 'Leave anyway' }).querySelector('svg')).toBeNull();
  });
});
