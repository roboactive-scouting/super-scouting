import { describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from './pwa';

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
