export type PwaAdapter = {
  /** Registers, and calls back if and when an update becomes available. */
  register: (onNeedRefresh: () => void) => Promise<void>;
  reload: () => void;
};

/**
 * SPEC-FINAL 9.1: a new version is never applied by auto-reload. A service worker
 * that reloads the tab mid-match would destroy a scouter's screen at the one moment
 * it matters. We surface a discreet hint; the update activates on the next cold start.
 */
export async function registerServiceWorker(
  onUpdateReady: () => void,
  adapter: PwaAdapter,
): Promise<void> {
  await adapter.register(onUpdateReady);
}

export function browserAdapter(): PwaAdapter {
  return {
    register: async (onNeedRefresh) => {
      if (!('serviceWorker' in navigator)) return;
      const { registerSW } = await import('virtual:pwa-register');
      registerSW({ immediate: true, onNeedRefresh });
    },
    reload: () => window.location.reload(),
  };
}
