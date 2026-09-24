import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SAFE_ON_DEVICE, STATE_VARIANTS, StateMessage } from './StateMessage';

describe('StateMessage (SPEC-FINAL 17.8: one component, six variants, plus not-permitted)', () => {
  it.each(STATE_VARIANTS)('%s: one bold line, one muted line, exactly one action', (variant) => {
    const { container } = render(
      <MemoryRouter>
        <StateMessage variant={variant} action={{ label: 'Do the thing', to: '/' }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading').textContent).not.toBe('');
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('knows seven variants: the six of 17.8 and not-permitted', () => {
    expect([...STATE_VARIANTS].sort()).toEqual(
      [
        'conflicts-waiting',
        'failed',
        'form-not-published',
        'no-data',
        'no-results',
        'not-permitted',
        'offline-needs-server',
      ].sort(),
    );
  });

  it('the offline variant always says the data is safe on the device, even with its own why', () => {
    const { unmount } = render(
      <StateMessage
        variant="offline-needs-server"
        action={{ label: 'Try again', onClick: vi.fn() }}
      />,
    );
    expect(screen.getByText(SAFE_ON_DEVICE, { exact: false })).toBeInTheDocument();
    unmount();
    render(
      <StateMessage
        variant="offline-needs-server"
        detail="The user list lives on the server."
        action={{ label: 'Try again', onClick: vi.fn() }}
      />,
    );
    const line = screen.getByText('The user list lives on the server.', { exact: false });
    expect(line).toHaveTextContent(SAFE_ON_DEVICE);
  });

  it('a button action runs its handler', async () => {
    const onClick = vi.fn();
    render(<StateMessage variant="failed" action={{ label: 'Try again', onClick }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('takes a title and a detail in place of the defaults', () => {
    render(
      <MemoryRouter>
        <StateMessage
          variant="not-permitted"
          title="Only an admin can manage users"
          detail="Your account is a lead."
          action={{ label: 'Back to scouting', to: '/' }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading')).toHaveTextContent('Only an admin can manage users');
    expect(screen.getByText('Your account is a lead.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to scouting' })).toHaveAttribute('href', '/');
  });
});
