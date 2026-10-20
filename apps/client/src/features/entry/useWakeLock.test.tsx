import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './useWakeLock';

type Sentinel = { released: boolean; release: ReturnType<typeof vi.fn> };

const nav = navigator as { wakeLock?: unknown };
let visibility: DocumentVisibilityState = 'visible';
Object.defineProperty(document, 'visibilityState', { get: () => visibility, configurable: true });

function installWakeLock(request: (type: string) => Promise<unknown>) {
  Object.defineProperty(navigator, 'wakeLock', {
    value: { request: vi.fn(request) },
    configurable: true,
    writable: true,
  });
  return (navigator as unknown as { wakeLock: { request: ReturnType<typeof vi.fn> } }).wakeLock
    .request;
}

function sentinel(): Sentinel {
  const s: Sentinel = {
    released: false,
    release: vi.fn(() => {
      s.released = true;
      return Promise.resolve();
    }),
  };
  return s;
}

/** Lets the hook's awaited request settle. */
const flush = () => act(async () => {});

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  delete nav.wakeLock;
  visibility = 'visible';
});

describe('useWakeLock (SPEC-FINAL 8.6: no dimming mid-match)', () => {
  it('asks for a screen lock on mount and releases it on unmount', async () => {
    const lock = sentinel();
    const request = installWakeLock(() => Promise.resolve(lock));
    const { unmount } = renderHook(() => useWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalledWith('screen');
    unmount();
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it('asks again when the page is visible again (the browser drops the lock when hidden)', async () => {
    const locks = [sentinel(), sentinel()];
    let n = 0;
    const request = installWakeLock(() => Promise.resolve(locks[n++]));
    const { unmount } = renderHook(() => useWakeLock(true));
    await flush();
    locks[0]!.released = true; // what the browser does on hide
    setVisibility('hidden');
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    unmount();
    expect(locks[1]!.release).toHaveBeenCalledTimes(1);
    // Hidden and shown again after unmount: nothing is asked for.
    setVisibility('hidden');
    setVisibility('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does nothing while turned off (Keep the screen on is off)', async () => {
    const request = installWakeLock(() => Promise.resolve(sentinel()));
    renderHook(() => useWakeLock(false));
    await flush();
    expect(request).not.toHaveBeenCalled();
  });

  it('releases the lock when turned off while the entry is open', async () => {
    const lock = sentinel();
    installWakeLock(() => Promise.resolve(lock));
    const { rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await flush();
    rerender({ on: false });
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it('survives a browser that refuses (Safari, low battery)', async () => {
    const request = installWakeLock(() => Promise.reject(new Error('NotAllowedError')));
    const { unmount } = renderHook(() => useWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalled();
    setVisibility('hidden');
    setVisibility('visible');
    await flush();
    expect(() => unmount()).not.toThrow();
  });

  it('survives a browser with no wake lock at all', async () => {
    delete nav.wakeLock;
    const { unmount } = renderHook(() => useWakeLock(true));
    await flush();
    expect(() => unmount()).not.toThrow();
  });

  it('releases a lock that arrives after the entry closed', async () => {
    const lock = sentinel();
    let grant: (s: Sentinel) => void = () => undefined;
    installWakeLock(() => new Promise((resolve) => (grant = resolve)));
    const { unmount } = renderHook(() => useWakeLock(true));
    unmount();
    await act(async () => grant(lock));
    expect(lock.release).toHaveBeenCalledTimes(1);
  });
});
