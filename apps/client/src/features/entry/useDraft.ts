import { useEffect, useRef, useState } from 'react';
import { cachedRows } from '@/data/cache';
import { db } from '@/data/db';
import { usePracticeMode } from './practice';

export type DraftPayload = Record<string, unknown>;

/**
 * SPEC-FINAL 8.3: every interaction writes a local draft immediately. `savedAt` is the
 * draft's `updated_at` (ISO), for the "Draft saved on this device · hh:mm" line; null while
 * there is no draft. In practice (8.5) the draft goes to the separate `practiceDrafts` store,
 * never to `drafts`, so draft recovery never offers it and leaving practice clears it.
 *
 * `close(true)` as a submit starts: from then on `save` writes nothing, so no listener (the match
 * clock, a stopwatch, a phase tab) puts the draft back after the submit has cleared it while the
 * page is still on screen (UF.23). A failed submit calls `close(false)`.
 */
export function useDraft(key: string): {
  draft: DraftPayload | null;
  loaded: boolean;
  savedAt: string | null;
  save: (payload: DraftPayload) => void;
  close: (closed: boolean) => void;
} {
  const practice = usePracticeMode();
  const store = practice ? db.practiceDrafts : db.drafts;
  const [draft, setDraft] = useState<DraftPayload | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const closed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void store.get(key).then((record) => {
      if (cancelled) return;
      setDraft(record?.payload ?? null);
      setSavedAt(record?.updated_at ?? null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [key, store]);

  return {
    draft,
    loaded,
    savedAt,
    save: (payload) => {
      if (closed.current) return;
      const updated_at = new Date().toISOString();
      setDraft(payload);
      setSavedAt(updated_at);
      void store.put({ key, row_id: '', payload, updated_at });
    },
    close: (value) => {
      closed.current = value;
    },
  };
}

/**
 * The form version of the newest draft for `<match id | super>` and the team whose fields this
 * device holds, else undefined (UF.23). A draft begun before the form moved on is resumed on its
 * own version (SPEC-FINAL 3.3: a device may submit against any published version it holds), so
 * Resume brings its values back and its submit clears it.
 */
export async function draftedVersion(middle: string, teamId: string): Promise<string | undefined> {
  const suffix = `:${middle}:${teamId}`;
  const [drafts, fields] = await Promise.all([
    db.drafts.filter((d) => d.key.endsWith(suffix)).toArray(),
    cachedRows<{ form_version_id: string }>('form_fields'),
  ]);
  const held = new Set(fields.map((f) => f.form_version_id));
  return drafts
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((d) => d.key.slice(0, -suffix.length))
    .find((version) => held.has(version));
}
