import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatTime } from '@frc/shared';
import { compactSync, failureLine, syncLine, SyncPill, type SyncStatus } from './SyncPill';

function status(over: Partial<SyncStatus>): SyncStatus {
  return {
    waiting: 0,
    byAuthor: {},
    lastSyncAt: null,
    lastFailure: null,
    online: true,
    syncing: false,
    ...over,
  };
}

/** SPEC-FINAL 9.10: three states in words — online, syncing, offline — plus the unsynced count. */
describe('compactSync (the phone pill)', () => {
  it('online: the waiting count, or "All sent"', () => {
    expect(compactSync(status({ waiting: 3 }))).toEqual({ tone: 'waiting', text: '3 waiting' });
    expect(compactSync(status({}))).toEqual({ tone: 'sent', text: 'All sent' });
  });

  it('syncing: says so, and keeps the count', () => {
    expect(compactSync(status({ syncing: true }))).toEqual({ tone: 'syncing', text: 'Syncing…' });
    expect(compactSync(status({ syncing: true, waiting: 2 }))).toEqual({
      tone: 'syncing',
      text: 'Syncing · 2',
    });
  });

  it('offline: says so first, and keeps the count', () => {
    expect(compactSync(status({ online: false }))).toEqual({ tone: 'offline', text: 'Offline' });
    expect(compactSync(status({ online: false, waiting: 4 }))).toEqual({
      tone: 'offline',
      text: 'Offline · 4',
    });
    // A sync that started just before the network dropped does not hide "Offline".
    expect(compactSync(status({ online: false, syncing: true, waiting: 4 })).text).toBe(
      'Offline · 4',
    );
  });
});

describe('syncLine (the menu)', () => {
  it('names each state with the count', () => {
    expect(syncLine(status({}))).toEqual({ tone: 'sent', text: 'All sent' });
    expect(syncLine(status({ waiting: 3 }))).toEqual({
      tone: 'waiting',
      text: '3 waiting to send',
    });
    expect(syncLine(status({ syncing: true }))).toEqual({ tone: 'syncing', text: 'Syncing…' });
    expect(syncLine(status({ syncing: true, waiting: 3 })).text).toBe(
      'Syncing · 3 waiting to send',
    );
    expect(syncLine(status({ online: false }))).toEqual({ tone: 'offline', text: 'Offline' });
    expect(syncLine(status({ online: false, waiting: 3 })).text).toBe(
      'Offline · 3 waiting to send',
    );
  });
});

describe('SyncPill', () => {
  it('desktop: the connection chip reads Online, Syncing… or Offline beside the waiting chip', () => {
    const { rerender } = render(<SyncPill status={status({ waiting: 3 })} />);
    expect(screen.getByRole('status')).toHaveTextContent('3 waiting to sendOnline');
    rerender(<SyncPill status={status({ waiting: 3, syncing: true })} />);
    expect(screen.getByRole('status')).toHaveTextContent('3 waiting to sendSyncing…');
    rerender(<SyncPill status={status({ waiting: 3, online: false })} />);
    expect(screen.getByRole('status')).toHaveTextContent('3 waiting to sendOffline');
  });

  it('phone: one pill, the syncing dot pulses only under motion-safe', () => {
    const { container, rerender } = render(<SyncPill status={status({ syncing: true })} compact />);
    expect(screen.getByRole('status')).toHaveTextContent('Syncing…');
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot?.className).toContain('motion-safe:animate-pulse');
    rerender(<SyncPill status={status({ online: false, waiting: 4 })} compact />);
    expect(screen.getByRole('status')).toHaveTextContent('Offline · 4');
    expect(container.querySelector('[aria-hidden="true"]')?.className).not.toContain('animate');
  });
});

describe('failureLine (UF.13)', () => {
  const lastFailure = {
    at: '2026-03-17T09:41:00.000Z',
    kind: 'offline' as const,
    text: 'No connection to the server',
  };
  const line = `Last try failed: No connection to the server · ${formatTime(lastFailure.at)}`;

  it('says why the last try failed, and when, only while something waits to send', () => {
    expect(failureLine(status({ waiting: 3, lastFailure }))).toBe(line);
    expect(failureLine(status({ waiting: 0, lastFailure }))).toBeNull();
    expect(failureLine(status({ waiting: 3 }))).toBeNull();
  });

  it('desktop: beside the chips, and as the waiting chip’s tooltip', () => {
    const { rerender } = render(<SyncPill status={status({ waiting: 3, lastFailure })} />);
    expect(screen.getByRole('status')).toHaveTextContent(`${line}3 waiting to sendOnline`);
    expect(screen.getByText('3 waiting to send')).toHaveAttribute('title', line);
    rerender(<SyncPill status={status({ waiting: 0, lastFailure })} />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Online$/);
  });
});
