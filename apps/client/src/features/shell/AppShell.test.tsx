import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/data/db';
import type { HydrationState } from '@/data/sync';
import { AppShell } from './AppShell';

const hydrate = vi.fn();
const syncNow = vi.fn();
vi.mock('@/data/sync', () => ({
  hydrate: (deps: unknown) => hydrate(deps),
  syncNow: (deps: unknown) => syncNow(deps),
}));
vi.mock('@/data/api', () => ({ apiClient: () => ({ push: vi.fn(), pull: vi.fn() }) }));
vi.mock('@/config', () => ({
  clientConfig: () => ({
    apiBaseUrl: 'https://api.test',
    deviceWipeCode: 'wipe-me',
    appVersion: 'test',
  }),
}));

/** A first pull the test itself decides when to finish, so 'loading' can be observed. */
function deferred<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

const CHILD = 'the robot list';

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AppShell eventId="ev-1" />}>
          <Route index element={<p>{CHILD}</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  hydrate.mockReset();
  syncNow.mockReset();
  await db.delete();
  await db.open();
});

describe('AppShell first load (SPEC-FINAL 9.3)', () => {
  it('holds child routes back while the first pull is still running', async () => {
    const first = deferred<HydrationState>();
    hydrate.mockReturnValue(first.promise);
    renderShell();

    expect(await screen.findByText(/loading the competition/i)).toBeInTheDocument();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();

    first.settle('fresh');

    expect(await screen.findByText(CHILD)).toBeInTheDocument();
    expect(screen.queryByText(/loading the competition/i)).not.toBeInTheDocument();
  });

  it('renders children under the cached-data notice when the first pull could not reach the server', async () => {
    hydrate.mockResolvedValue('cached');
    renderShell();

    expect(await screen.findByText(CHILD)).toBeInTheDocument();
    expect(screen.getByText(/data already on this device/i)).toBeInTheDocument();
  });

  it('renders neither the shell nor children when this device has never loaded the event', async () => {
    hydrate.mockResolvedValue('blocked');
    renderShell();

    expect(await screen.findByText(/has not loaded the competition yet/i)).toBeInTheDocument();
    expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
  });
});
