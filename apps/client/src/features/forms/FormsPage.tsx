import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FORM_KINDS,
  type CreateFormOutput,
  type FormKind,
  type FormListItem,
  type VersionSummary,
} from '@frc/shared';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { WarningNotice } from '@/components/ui/notice';
import { SeasonChips } from '@/components/ui/season-chips';
import { adminRpc, type Rpc } from '@/data/rpc';
import { AdminOnly } from '@/features/admin/AdminOnly';
import { FORMS_GATE } from '@/features/forms/formsGate';
import { DeleteFormDialog } from '@/features/builder/DeleteFormDialog';
import { formErrorLine } from '@/features/builder/formErrors';
import { ExportDialog, ImportDialog } from '@/features/builder/ImportExport';
import { formBuilderPath, PATHS } from '@/lib/paths';
import { useOnline } from '@/lib/useOnline';
import { FormCard, MissingFormCard } from './FormCard';
import { KIND_NAME, needsMatchForm } from './formsView';
import { useFormsList, type FormsLoad } from './useFormsList';

/**
 * `/admin/forms` (design 13-forms, variant A with C's version timeline; SPEC-FINAL 5.9, v1.21):
 * season chips (the season named by `?season=<year>`, else the active one, preselected), a warning while the season has no published
 * match form, then a card per form — match and super — with its versions. Every button opens
 * the builder on a version. Admin only; desktop only (the route's DesktopOnly); online only.
 */
export function FormsPage({ rpc = adminRpc }: { rpc?: Rpc }) {
  return (
    <AdminOnly gate={FORMS_GATE}>
      <FormsScreen rpc={rpc} />
    </AdminOnly>
  );
}

function FormsScreen({ rpc }: { rpc: Rpc }) {
  const { load, reload, refreshSeason } = useFormsList(rpc);

  if (load.status === 'unreachable') {
    return (
      <StateMessage
        variant="offline-needs-server"
        headingLevel={1}
        detail="The forms live on the server, and this device cannot reach it right now."
        action={{ label: 'Try again', onClick: reload }}
      />
    );
  }
  if (load.status === 'failed') {
    return (
      <StateMessage
        variant="failed"
        headingLevel={1}
        title="The forms did not load"
        detail={load.line}
        action={{ label: 'Try again', onClick: reload }}
      />
    );
  }
  return (
    <main className="w-full px-8 pt-6 pb-8">
      <h1 className="text-[1.625rem] font-[750] tracking-[-0.02em]">Forms</h1>
      <p className="mt-1 text-[0.84375rem] text-muted">
        The scouting forms for each season. Open one to edit it in the form builder.
      </p>
      {load.status === 'loading' ? (
        <div className="mt-4">
          <Skeleton rows={4} rowHeight="4rem" label="Loading the forms" />
        </div>
      ) : (
        <Seasons load={load} rpc={rpc} refreshSeason={refreshSeason} />
      )}
    </main>
  );
}

type Ready = Extract<FormsLoad, { status: 'ready' }>;

function Seasons({
  load,
  rpc,
  refreshSeason,
}: {
  load: Ready;
  rpc: Rpc;
  refreshSeason: (seasonId: string) => Promise<void>;
}) {
  const online = useOnline();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // `?season=2026` (after Delete form in the builder, final review D3), else the active season.
  const [chosen, setChosen] = useState<string | null>(
    () =>
      load.seasons.find((s) => String(s.year) === params.get('season'))?.id ??
      load.activeSeasonId ??
      load.seasons[0]?.id ??
      null,
  );
  const [restoring, setRestoring] = useState<string | null>(null);
  const [creating, setCreating] = useState<FormKind | null>(null);
  /** One error line per card, by form kind. */
  const [errors, setErrors] = useState<Partial<Record<FormKind, string>>>({});
  /** A card whose restore went through but whose list did not read again: offer Try again. */
  const [stale, setStale] = useState<FormKind | null>(null);
  /** A card's dialog (task 1.31): Export or Delete form on a form, Import on a missing one. */
  const [dialog, setDialog] = useState<{
    what: 'export' | 'delete' | 'import';
    kind: FormKind;
  } | null>(null);

  const season = load.seasons.find((s) => s.id === chosen) ?? null;
  if (!season) {
    return (
      <div className="mt-4">
        <StateMessage
          variant="no-data"
          title="There is no season yet"
          detail="A form belongs to a season. Create the season on Manage first."
          action={{ label: 'Open Manage', to: PATHS.manage }}
        />
      </div>
    );
  }
  const seasonId = season.id;
  const forms: FormListItem[] = load.forms.get(seasonId) ?? [];
  // The newest earlier season with a match form: what an import would come from (D2).
  const previousMatchYear =
    load.seasons.find(
      (s) => s.year < season.year && (load.forms.get(s.id) ?? []).some((f) => f.kind === 'match'),
    )?.year ?? null;

  /** Reads the season's forms again; a failure says the list may be out of date. */
  async function refresh(kind: FormKind, lead: string) {
    try {
      await refreshSeason(seasonId);
      setStale(null);
      setErrors((e) => ({ ...e, [kind]: undefined }));
    } catch (e) {
      setStale(kind);
      setErrors((prev) => ({
        ...prev,
        [kind]: `${lead}The list did not read again, so it may be out of date. ${formErrorLine(e)}`,
      }));
    }
  }

  async function restore(form: FormListItem, version: VersionSummary) {
    setRestoring(version.id);
    setStale(null);
    setErrors((e) => ({ ...e, [form.kind]: undefined }));
    try {
      await rpc.call('restoreFormVersion', { form_version_id: version.id });
    } catch (e) {
      setErrors((prev) => ({ ...prev, [form.kind]: formErrorLine(e) }));
      setRestoring(null);
      return;
    }
    // The restore went through: a failed re-read is the list's problem, not the restore's.
    await refresh(form.kind, `v${version.version_no} is restored. `);
    setRestoring(null);
  }

  async function create(kind: FormKind) {
    setCreating(kind);
    setErrors((e) => ({ ...e, [kind]: undefined }));
    try {
      const out = (await rpc.call('createForm', {
        season_id: seasonId,
        kind,
        name: KIND_NAME[kind],
      })) as CreateFormOutput;
      navigate(formBuilderPath(out.id, 1));
    } catch (e) {
      setErrors((prev) => ({ ...prev, [kind]: formErrorLine(e) }));
      setCreating(null);
    }
  }

  return (
    <>
      <div className="mt-4">
        <SeasonChips
          seasons={load.seasons.map((s) => {
            const active = s.id === load.activeSeasonId;
            const none = (load.forms.get(s.id) ?? []).length === 0;
            return {
              id: s.id,
              year: s.year,
              active,
              note: active ? 'active' : none ? 'no forms yet' : undefined,
            };
          })}
          value={season.id}
          onChange={(id) => {
            setChosen(id);
            // A season named in the address no longer applies once another is picked.
            if (params.has('season')) setParams({}, { replace: true });
            setErrors({});
            setStale(null);
          }}
        />
      </div>
      {needsMatchForm(forms) && (
        <WarningNotice
          className="mt-3.5 rounded-control"
          lead={`No match form is published for ${season.year}.`}
        >
          Scouts can't open an entry until one is.
        </WarningNotice>
      )}
      <div className="mt-3.5 grid grid-cols-2 items-start gap-4">
        {FORM_KINDS.map((kind) => {
          const form = forms.find((f) => f.kind === kind);
          return form ? (
            <FormCard
              key={kind}
              form={form}
              restoring={restoring}
              online={online}
              error={errors[kind] ?? null}
              onRetry={stale === kind ? () => void refresh(kind, '') : undefined}
              onRestore={(version) => void restore(form, version)}
              onExport={() => setDialog({ what: 'export', kind })}
              onDelete={() => setDialog({ what: 'delete', kind })}
            />
          ) : (
            <MissingFormCard
              key={kind}
              kind={kind}
              year={season.year}
              previousYear={kind === 'match' ? previousMatchYear : null}
              online={online}
              creating={creating === kind}
              error={errors[kind] ?? null}
              onCreate={() => void create(kind)}
              onImport={() => setDialog({ what: 'import', kind })}
            />
          );
        })}
      </div>
      {cardDialog()}
    </>
  );

  /** The open dialog, called (never mounted as a component) so its state survives renders. */
  function cardDialog() {
    if (!dialog) return null;
    const close = () => setDialog(null);
    const form = forms.find((f) => f.kind === dialog.kind);
    if (dialog.what === 'import') {
      return (
        <ImportDialog
          target={{ kind: dialog.kind, seasonId, year: season!.year, form: null }}
          rpc={rpc}
          online={online}
          onClose={close}
          // A new form opens on its v1; an import into a form already there opens its draft.
          onImported={(out) => navigate(formBuilderPath(out.form_id, out.created ? 1 : undefined))}
        />
      );
    }
    if (!form) return null;
    if (dialog.what === 'export') {
      return (
        <ExportDialog form={form} year={season!.year} rpc={rpc} online={online} onClose={close} />
      );
    }
    return (
      <DeleteFormDialog
        form={form}
        year={season!.year}
        rpc={rpc}
        online={online}
        onClose={close}
        onExportFirst={() => setDialog({ what: 'export', kind: form.kind })}
        onDeleted={() => {
          close();
          void refresh(form.kind, `${KIND_NAME[form.kind]} ${season!.year} is deleted. `);
        }}
      />
    );
  }
}
