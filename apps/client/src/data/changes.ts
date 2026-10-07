export type ChangeKind = 'rows' | 'outbox' | 'meta';
const listeners = new Set<(kind: ChangeKind) => void>();
/**
 * Something on the device changed: re-read what depends on it. Sync, the outbox and meta
 * writers call this. A throwing listener neither stops the others nor rejects the writer.
 */
export function notifyChanged(kind: ChangeKind): void {
  for (const l of [...listeners]) {
    try {
      l(kind);
    } catch {
      // one bad subscriber must not break the writer or its peers
    }
  }
}
export function onChanged(listener: (kind: ChangeKind) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
