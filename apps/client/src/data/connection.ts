export type ConnectionState = 'online' | 'syncing' | 'offline';

let syncing = 0;

export function beginSync(): void {
  syncing += 1;
}

export function endSync(): void {
  syncing = Math.max(0, syncing - 1);
}

/** SPEC-FINAL 9.10: three states, named in words, never a silent icon. */
export function connectionState(): ConnectionState {
  if (syncing > 0) return 'syncing';
  return navigator.onLine ? 'online' : 'offline';
}
