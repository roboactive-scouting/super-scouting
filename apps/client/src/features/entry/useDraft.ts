import { useEffect, useState } from 'react';
import { db } from '@/data/db';

export type DraftPayload = Record<string, unknown>;

/** SPEC-FINAL 8.3: every interaction writes a local draft immediately. */
export function useDraft(key: string): {
  draft: DraftPayload | null;
  loaded: boolean;
  save: (payload: DraftPayload) => void;
} {
  const [draft, setDraft] = useState<DraftPayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void db.drafts.get(key).then((record) => {
      if (cancelled) return;
      setDraft(record?.payload ?? null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return {
    draft,
    loaded,
    save: (payload) => {
      setDraft(payload);
      void db.drafts.put({ key, row_id: '', payload, updated_at: new Date().toISOString() });
    },
  };
}
