import { useEffect, useState } from 'react';
import { db } from '@/data/db';

export type DraftPayload = Record<string, unknown>;

/**
 * SPEC-FINAL 8.3: every interaction writes a local draft immediately. `savedAt` is the
 * draft's `updated_at` (ISO), for the "Draft saved on this device · hh:mm" line; null while
 * there is no draft.
 */
export function useDraft(key: string): {
  draft: DraftPayload | null;
  loaded: boolean;
  savedAt: string | null;
  save: (payload: DraftPayload) => void;
} {
  const [draft, setDraft] = useState<DraftPayload | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void db.drafts.get(key).then((record) => {
      if (cancelled) return;
      setDraft(record?.payload ?? null);
      setSavedAt(record?.updated_at ?? null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return {
    draft,
    loaded,
    savedAt,
    save: (payload) => {
      const updated_at = new Date().toISOString();
      setDraft(payload);
      setSavedAt(updated_at);
      void db.drafts.put({ key, row_id: '', payload, updated_at });
    },
  };
}
