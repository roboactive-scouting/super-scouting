import { describe, expect, it, vi } from 'vitest';
import { registerServiceWorker, updateReady } from './pwa';

describe('service worker registration (SPEC-FINAL 9.1)', () => {
  it('never reloads the tab; it only reports that an update is ready', async () => {
    const onUpdateReady = vi.fn();
    const reload = vi.fn();
    await registerServiceWorker(onUpdateReady, {
      register: (onNeedRefresh) => {
        onNeedRefresh();
        return Promise.resolve();
      },
      reload,
    });
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('stays silent when no update is waiting', async () => {
    const onUpdateReady = vi.fn();
    await registerServiceWorker(onUpdateReady, {
      register: () => Promise.resolve(),
      reload: vi.fn(),
    });
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it('reports an update that arrives later, not only one present at registration', async () => {
    const onUpdateReady = vi.fn();
    let notify = (): void => undefined;
    await registerServiceWorker(onUpdateReady, {
      register: (onNeedRefresh) => {
        notify = onNeedRefresh;
        return Promise.resolve();
      },
      reload: vi.fn(),
    });
    expect(onUpdateReady).not.toHaveBeenCalled();
    notify();
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });
});

describe('the update-ready store (SPEC-FINAL 9.1, task 1.22)', () => {
  it('tells every subscriber once, and stays set', () => {
    updateReady.reset();
    const listener = vi.fn();
    const unsubscribe = updateReady.subscribe(listener);
    expect(updateReady.get()).toBe(false);
    updateReady.set();
    updateReady.set();
    expect(updateReady.get()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    updateReady.reset();
  });
});
