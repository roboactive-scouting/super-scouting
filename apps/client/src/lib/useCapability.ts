import { isAvailableOffline, type Capability } from '@/data/offlineCapability';
import { useOnline } from './useOnline';

/**
 * Whether `capability` can be used right now (SPEC-FINAL 9.6, task 1.45): always for a row the
 * matrix marks as working offline, and only while the device is online for the rest. The online
 * signal is the app's one (`useOnline`, the `navigator.onLine` that data/connection.ts also
 * reads). Kept apart from `<OfflineGate>` so a screen in the first chunk (Home's switch sheet)
 * can read the matrix without loading the gate's state.
 */
export function useCapability(capability: Capability): boolean {
  const online = useOnline();
  return online || isAvailableOffline(capability);
}
