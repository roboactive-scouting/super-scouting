import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { usePageCrumb, usePageTitle } from '@/lib/pageTitle';
import { CrumbBar } from './CrumbBar';
import type { SyncStatus } from './SyncPill';

const status = { online: true, waiting: 0 } as unknown as SyncStatus;

function Page({ crumb }: { crumb: string[] | null }) {
  usePageCrumb(crumb);
  usePageTitle('Home');
  return <p>the page</p>;
}

function Harness({ crumb }: { crumb: string[] | null }) {
  const [shown, setShown] = useState(true);
  return (
    <>
      <CrumbBar status={status} />
      {shown && <Page crumb={crumb} />}
      <button type="button" onClick={() => setShown(false)}>
        Leave
      </button>
    </>
  );
}

function renderAt(crumb: string[] | null) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: <Harness crumb={crumb} />,
        handle: { title: 'Scout', crumb: ['Route'] },
      },
    ],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
}

describe('usePageCrumb', () => {
  it('sets the desktop crumb: parts muted, the last in bold ink', () => {
    renderAt(['2026', 'District #3 · Tel Aviv']);
    const header = screen.getByRole('banner');
    expect(header).toHaveTextContent('2026 / District #3 · Tel Aviv');
    expect(screen.getByText('District #3 · Tel Aviv').tagName).toBe('B');
    expect(screen.queryByText('Route')).not.toBeInTheDocument();
  });

  it('leaves the route crumb alone when the page passes null', () => {
    renderAt(null);
    expect(screen.getByRole('banner')).toHaveTextContent('Route / Home');
  });

  it('restores the route crumb when the page unmounts', async () => {
    renderAt(['2026', 'District #3 · Tel Aviv']);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('Route')).toBeInTheDocument();
    expect(screen.getByRole('banner')).not.toHaveTextContent('Tel Aviv');
  });
});
