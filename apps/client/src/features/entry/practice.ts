import { useSyncExternalStore } from 'react';
import { db } from '@/data/db';

let on = false;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (on === next) return;
  on = next;
  for (const listener of listeners) listener();
}

/**
 * Practice mode (SPEC-FINAL 8.5; task 1.37): the real form, and nothing saved. A session flag in
 * memory only, so a reload or a fresh start always comes back out of practice. While it is on,
 * `useDraft` writes to `practiceDrafts` (never `drafts`), `submitEntry` writes nothing (no
 * `scouting_entries` row, no outbox operation) and `ensureMatchLocally` refuses to create a match.
 * Its store is emptied on exit and on app start (`clearOnStart`, from `main.tsx`), whatever
 * happened last time.
 */
export const practiceMode = {
  active(): boolean {
    return on;
  },
  enter(): void {
    set(true);
  },
  /** Leaves practice and empties the practice store. */
  async exit(): Promise<void> {
    set(false);
    await db.practiceDrafts.clear();
  },
  /** App start: out of practice, and no practice draft left from a crash or a closed tab. */
  async clearOnStart(): Promise<void> {
    set(false);
    await db.practiceDrafts.clear();
  },
  /** Calls `listener` whenever practice is entered or left; returns the unsubscribe. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** True while practice mode is on; re-renders when it is entered or left. */
export function usePracticeMode(): boolean {
  return useSyncExternalStore(practiceMode.subscribe, practiceMode.active, practiceMode.active);
}
