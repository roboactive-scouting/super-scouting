import { useCallback, useEffect, useState } from 'react';
import {
  LIST_SEASONS_MAX_LIMIT,
  type GetFormOutput,
  type GetFormVersionOutput,
  type SeasonRow,
  type VersionSummary,
} from '@frc/shared';
import type { Rpc } from '@/data/rpc';
import { formErrorLine, formUnreachable } from './formErrors';

export type BuilderData = {
  form: GetFormOutput;
  /** The version open in the builder, with its fields (deprecated ones included). */
  version: GetFormVersionOutput;
  /** The season's year, for the title ("Match form 2026"); null when the seasons did not load. */
  year: number | null;
  /** The season's game image path, for the mirroring preview; null when the seasons did not load. */
  fieldImage: string | null;
  /**
   * A draft's predecessor, for "made from v3": only when it is unambiguous — the active version
   * is the newest published one. After a restore the draft may come from either, so: null.
   */
  previous: GetFormVersionOutput | null;
};

export type BuilderLoad =
  | { status: 'loading' }
  | { status: 'unreachable' }
  | { status: 'missing'; versionNo: number }
  | { status: 'failed'; line: string }
  | { status: 'ready'; data: BuilderData };

/**
 * Which version the builder opens (13-forms README, "What each button opens"): the one named
 * by `?version=n`; without it, the draft if there is one, else the active version, else the
 * newest. `undefined` when the named version does not exist.
 */
export function chooseVersion(
  versions: readonly VersionSummary[],
  versionNo: number | null,
): VersionSummary | undefined {
  if (versionNo !== null) return versions.find((v) => v.version_no === versionNo);
  return (
    versions.find((v) => v.status === 'draft') ??
    versions.find((v) => v.is_active) ??
    [...versions].sort((a, b) => b.version_no - a.version_no)[0]
  );
}

/**
 * The builder's data, from the server (form editing is online only, SPEC-FINAL 5.1): the form
 * and its versions, the chosen version's fields, the season's year and — for a draft — the
 * version it was made from. `reload` reads it all again (after a save that forked, a publish,
 * a restore, or a refused stale save).
 */
export function useBuilderLoad(rpc: Rpc, formId: string, versionNo: number | null) {
  const [load, setLoad] = useState<BuilderLoad>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    (async (): Promise<BuilderLoad> => {
      const form = (await rpc.call('getForm', { form_id: formId })) as GetFormOutput;
      const chosen = chooseVersion(form.versions, versionNo);
      if (!chosen) return { status: 'missing', versionNo: versionNo ?? 0 };
      const newestPublished = form.versions
        .filter((v) => v.status === 'published' && v.version_no < chosen.version_no)
        .sort((a, b) => b.version_no - a.version_no)[0];
      // Never a guess: a draft names its source only while that is the active, newest version.
      const previousSummary =
        chosen.status === 'draft' && newestPublished?.is_active ? newestPublished : undefined;
      const [version, seasons, previous] = await Promise.all([
        rpc.call('getFormVersion', { form_version_id: chosen.id }) as Promise<GetFormVersionOutput>,
        // The year is decoration: a failure here never stops the builder.
        (
          rpc.call('listSeasons', { limit: LIST_SEASONS_MAX_LIMIT }) as Promise<{
            items: SeasonRow[];
          }>
        ).catch(() => null),
        previousSummary
          ? (
              rpc.call('getFormVersion', {
                form_version_id: previousSummary.id,
              }) as Promise<GetFormVersionOutput>
            ).catch(() => null)
          : Promise.resolve(null),
      ]);
      const season = seasons?.items.find((s) => s.id === form.season_id);
      const year = season?.year ?? null;
      const fieldImage = season?.field_image_path ?? null;
      return { status: 'ready', data: { form, version, year, fieldImage, previous } };
    })().then(
      (next) => {
        if (live) setLoad(next);
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
  }, [rpc, formId, versionNo, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { load, reload, attempt };
}
