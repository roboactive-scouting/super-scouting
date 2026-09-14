/**
 * `virtual:pwa-register` is a virtual module created by the VitePWA plugin, which
 * runs only in vite.config.ts. vitest.config.ts is a separate config with no such
 * plugin, so the dynamic import in src/pwa.ts cannot resolve under test and Vite's
 * import analysis fails the whole module — even though browserAdapter() is never
 * called in a test. vitest.config.ts aliases the virtual module to this stub.
 */
export function registerSW(_options?: {
  immediate?: boolean;
  onNeedRefresh?: () => void;
}): (reloadPage?: boolean) => Promise<void> {
  return () => Promise.resolve();
}
