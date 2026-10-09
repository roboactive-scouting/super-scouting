import { useCallback, useEffect, useState } from 'react';
import {
  LIST_SEASONS_MAX_LIMIT,
  type ActiveContext,
  type FormListItem,
  type ListFormsOutput,
  type SeasonRow,
} from '@frc/shared';
import type { Rpc } from '@/data/rpc';
import { formErrorLine, formUnreachable } from '@/features/builder/formErrors';

export type FormsLoad =
  | { status: 'loading' }
  | { status: 'unreachable' }
  | { status: 'failed'; line: string }
  | {
      status: 'ready';
      /** Newest year first. */
      seasons: SeasonRow[];
      activeSeasonId: string | null;
      /** Every season's forms (match, then super; a missing form is absent). */
      forms: ReadonlyMap<string, FormListItem[]>;
    };

/**
 * The forms list's data, from the server every visit (form editing is online only, SPEC-FINAL
 * 5.1): the seasons, the active season, and every season's forms through `listForms` — every
 * season, so each chip can say "no forms yet". A handful of seasons, one call each, in parallel.
 */
export function useFormsList(rpc: Rpc) {
  const [load, setLoad] = useState<FormsLoad>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      const [seasonsOut, context] = await Promise.all([
        rpc.call('listSeasons', { limit: LIST_SEASONS_MAX_LIMIT }) as Promise<{
          items: SeasonRow[];
        }>,
        rpc.call('getActiveContext', {}) as Promise<ActiveContext>,
      ]);
      const seasons = [...seasonsOut.items].sort((a, b) => b.year - a.year);
      const lists = await Promise.all(
        seasons.map((s) => rpc.call('listForms', { season_id: s.id }) as Promise<ListFormsOutput>),
      );
      return {
        seasons,
        activeSeasonId: context.active_season_id,
        forms: new Map(lists.map((l) => [l.season_id, l.forms])),
      };
    })().then(
      (data) => {
        if (live) setLoad({ status: 'ready', ...data });
      },
      (e: unknown) => {
        if (!live) return;
        setLoad(
          formUnreachable(e)
            ? { status: 'unreachable' }
            : { status: 'failed', line: formErrorLine(e) },
        );
      },
    );
    return () => {
      live = false;
    };
  }, [rpc, attempt]);

  /** Read everything again (after a restore), keeping the page on screen meanwhile. */
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  /** One season's forms again, in place: after a restore. */
  const refreshSeason = useCallback(
    async (seasonId: string) => {
      const out = (await rpc.call('listForms', { season_id: seasonId })) as ListFormsOutput;
      setLoad((prev) =>
        prev.status === 'ready'
          ? { ...prev, forms: new Map(prev.forms).set(seasonId, out.forms) }
          : prev,
      );
    },
    [rpc],
  );

  return { load, reload, refreshSeason };
}
