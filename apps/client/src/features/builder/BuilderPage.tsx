import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Lock } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type {
  FieldPhase,
  FieldTypeName,
  FormFieldDefinition,
  SaveDraftFieldsOutput,
  ScoredFieldRow,
  VersionSummary,
} from '@frc/shared';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import { buttonVariants } from '@/components/ui/button';
import { ErrorLine, Note, WarningNotice } from '@/components/ui/notice';
import { adminRpc, type Rpc } from '@/data/rpc';
import { AdminOnly } from '@/features/admin/AdminOnly';
import { FORMS_GATE } from '@/features/forms/formsGate';
import { PHASE_NAME, PHASE_ORDER } from '@/features/entry/phases';
import { usePageCrumb, usePageTitle } from '@/lib/pageTitle';
import { formBuilderPath, PATHS } from '@/lib/paths';
import { useOnline } from '@/lib/useOnline';
import { cn } from '@/lib/utils';
import { BuilderCanvas, CANVAS_DROP, phasePages } from './BuilderCanvas';
import { BuilderLeaveGuard } from './BuilderLeaveGuard';
import { BuilderTopBar, heldLine } from './BuilderTopBar';
import { FieldPalette, PaletteGhost, paletteTypeOf } from './FieldPalette';
import { formErrorLine, offersReload } from './formErrors';
import { typeName } from './fieldTypes';
import { SettingsPane } from './SettingsPane';
import { useBuilderLoad, type BuilderData } from './useBuilderLoad';
import { phaseAt, useBuilderState } from './useBuilderState';
import { versionLabel } from './VersionMenu';

/**
 * `/admin/forms/:formId?version=n` (design 12-form-builder, variant D "Live canvas"; SPEC-FINAL
 * 5.9): the top bar, the locked banner, then three panes — the Fields palette, the form canvas
 * drawn with the scouter's real controls one phase at a time, and the settings pane. Admin
 * only, desktop only (the route's DesktopOnly), online only: offline pauses editing.
 */
export function BuilderPage({ rpc = adminRpc }: { rpc?: Rpc }) {
  return (
    <AdminOnly gate={FORMS_GATE}>
      <BuilderScreen rpc={rpc} />
    </AdminOnly>
  );
}

/** The builder fills the window under the 60 px top bar; its panes scroll on their own. */
const PAGE = 'flex h-[calc(100dvh-3.75rem)] min-h-[40rem] w-full flex-col';

function BuilderScreen({ rpc }: { rpc: Rpc }) {
  const { formId = '' } = useParams();
  const [params] = useSearchParams();
  const raw = params.get('version');
  const versionNo = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
  const { load, reload } = useBuilderLoad(rpc, formId, versionNo);

  if (load.status === 'loading') {
    return (
      <main className="w-full px-6 pt-4">
        <Skeleton rows={5} rowHeight="4rem" label="Loading the form" />
      </main>
    );
  }
  if (load.status === 'unreachable') {
    return (
      <StateMessage
        variant="offline-needs-server"
        headingLevel={1}
        detail="The form lives on the server, and this device cannot reach it right now."
        action={{ label: 'Try again', onClick: reload }}
      />
    );
  }
  if (load.status === 'missing') {
    return (
      <StateMessage
        variant="failed"
        headingLevel={1}
        title={`This form has no v${load.versionNo}`}
        detail="The version may have been deleted. Open the form from Forms to see its versions."
        action={{ label: 'Back to Forms', to: PATHS.forms }}
      />
    );
  }
  if (load.status === 'failed') {
    return (
      <StateMessage
        variant="failed"
        headingLevel={1}
        title="The form did not load"
        detail={load.line}
        action={{ label: 'Try again', onClick: reload }}
      />
    );
  }
  const { version } = load.data;
  return (
    <BuilderEditor
      // A new version, a publish, a restore or someone else's save: start from the server's.
      key={`${version.id}:${version.updated_at}:${version.status}:${version.is_active}`}
      data={load.data}
      rpc={rpc}
      reload={reload}
    />
  );
}

/** The points tag at a canvas item's top right, where the form scores the field. */
export function pointsTag(row: ScoredFieldRow): string | null {
  if (row.option_points) {
    const values = Object.values(row.option_points);
    const max = Math.max(...values);
    if (values.length === 0 || max <= 0) return null;
    const min = Math.min(...values);
    return min === max ? `${max} pts` : `${min}–${max} pts`;
  }
  if (row.points === null || row.points <= 0) return null;
  return row.type === 'counter' || row.type === 'number'
    ? `${row.points}/ea pts`
    : `${row.points} pts`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Keyboard reordering: only fields are places to go, never a tab or the column. */
const collide: CollisionDetection = (args) => {
  if (paletteTypeOf(args.active.id)) {
    const hits = pointerWithin(args);
    const inner = hits.filter((h) => h.id !== CANVAS_DROP);
    if (inner.length > 0) return inner;
    if (hits.length > 0) return hits;
    return [];
  }
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (c) => c.id !== CANVAS_DROP && !String(c.id).startsWith('tab:'),
    ),
  });
};

function BuilderEditor({ data, rpc, reload }: { data: BuilderData; rpc: Rpc; reload: () => void }) {
  const { form, version, year, previous } = data;
  const navigate = useNavigate();
  const online = useOnline();
  const published = version.status === 'published';
  // A draft takes anything; the active version takes edits in place (a structural one forks);
  // an older published version is read-only, with Restore (13-forms README).
  const editable = version.status === 'draft' || version.is_active;
  const state = useBuilderState({
    form_id: form.id,
    version_id: version.id,
    is_locked: published,
    timer_config: form.timer_config,
    fields: version.fields as FormFieldDefinition[],
  });
  const [phase, setPhase] = useState<FieldPhase>(() => {
    const pages = phasePages(state.fields);
    return PHASE_ORDER.find((p) => pages[p].length > 0) ?? 'auto';
  });
  const [busy, setBusy] = useState<'save' | 'publish' | 'restore' | null>(null);
  const [error, setError] = useState<{ line: string; reload: boolean } | null>(null);
  const [base, setBase] = useState(version.updated_at);
  const [dragType, setDragType] = useState<FieldTypeName | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Set before the builder moves on purpose, so the leave guard lets it. */
  const leaving = useRef(false);

  const title = `${form.name}${year !== null ? ` ${year}` : ''}`;
  usePageTitle(title);
  usePageCrumb(['Admin', 'Forms', title]);

  const points = useMemo(
    () =>
      new Map(
        version.fields.flatMap((row) => {
          const tag = pointsTag(row);
          return tag ? [[row.key, tag] as const] : [];
        }),
      ),
    [version.fields],
  );

  const newest = Math.max(...form.versions.map((v) => v.version_no));
  const draft = form.versions.find((v) => v.status === 'draft');

  // "made from v3 · 2 fields added": against the version the draft was made from.
  let changeLine: string | null = null;
  if (version.status === 'draft' && previous) {
    const was = new Set(previous.fields.filter((f) => !f.deprecated).map((f) => f.key));
    const now = new Set(state.fields.map((f) => f.key));
    const added = [...now].filter((k) => !was.has(k)).length;
    const removed = [...was].filter((k) => !now.has(k)).length;
    changeLine = [
      `made from v${previous.version_no}`,
      added > 0 ? `${plural(added, 'field')} added` : '',
      removed > 0 ? `${removed} removed` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }
  // The active version while a draft exists: structural edits belong in that draft (the server
  // refuses them here with `draft-exists`), so the palette is held, and so is a save that would
  // fork (a removed field, a changed type).
  const draftHolds = published && editable && draft !== undefined;
  const forkLine =
    published && state.willForkNewVersion && !draft ? `saving starts draft v${newest + 1}` : null;
  const belongsIn = draftHolds && state.willForkNewVersion && draft ? draft.version_no : null;
  const held =
    version.status === 'draft'
      ? heldLine(state.incomplete, state.hasDataField, version.version_no)
      : null;

  // The selected field in view: after an add, a drop or "Next incomplete".
  const selectedId = state.selectedField?.id ?? null;
  useEffect(() => {
    if (!selectedId) return;
    const key = state.fields.find((f) => f.id === selectedId)?.key;
    if (!key) return;
    document.querySelector(`[data-field-key="${key}"]`)?.scrollIntoView?.({ block: 'nearest' });
    // Only when the selection or the page changes, not on every edit of the field.
  }, [selectedId, phase]);

  const labelOf = (key: string) => state.fields.find((f) => f.key === key)?.label;
  const fail = (e: unknown) => {
    setError({ line: formErrorLine(e, { labelOf }), reload: offersReload(e) });
  };

  /** Saves the whole live set. False when it did not save here (refused, or it forked). */
  async function save(): Promise<boolean> {
    setBusy('save');
    setError(null);
    let out: SaveDraftFieldsOutput | null = null;
    try {
      await state.save(async (fields) => {
        out = (await rpc.call('saveDraftFields', {
          form_version_id: version.id,
          base_updated_at: base,
          fields,
        })) as SaveDraftFieldsOutput;
        // A structural edit to a published version started a new draft: that is another page.
        return out.new_version_id ? null : (out.fields as FormFieldDefinition[]);
      });
    } catch (e) {
      fail(e);
      setBusy(null);
      return false;
    }
    const saved = out as SaveDraftFieldsOutput | null;
    if (saved?.new_version_id) {
      // The editor stays busy (Save and Publish held, panes inert) until the new draft is read
      // and this editor is replaced by its own.
      leaving.current = true;
      navigate(formBuilderPath(form.id, saved.version_no));
      return false;
    }
    setBusy(null);
    if (!saved) return false;
    setBase(saved.updated_at);
    return true;
  }

  async function publish() {
    if (state.dirty && !(await save())) return;
    setBusy('publish');
    setError(null);
    try {
      await rpc.call('publishFormVersion', { form_version_id: version.id });
      reload();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function restore(target: VersionSummary) {
    setBusy('restore');
    setError(null);
    try {
      await rpc.call('restoreFormVersion', { form_version_id: target.id });
      reload();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  function nextIncomplete() {
    const list = state.incomplete;
    if (list.length === 0) return;
    const at = list.findIndex((f) => f.key === state.selectedKey);
    const target = list[(at + 1) % list.length]!;
    state.selectField(target.key);
    const index = state.fields.findIndex((f) => f.key === target.key);
    setPhase(phaseAt(state.fields, index));
  }

  function add(type: FieldTypeName, to: FieldPhase, index?: number) {
    state.addField(type, index === undefined ? { phase: to } : { phase: to, index });
    setPhase(to);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(e: DragStartEvent) {
    setDragging(true);
    setDragType(paletteTypeOf(e.active.id));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(false);
    setDragType(null);
    if (!over) return;
    const overId = String(over.id);
    const type = paletteTypeOf(active.id);
    if (type) {
      if (overId.startsWith('tab:')) return add(type, overId.slice(4) as FieldPhase);
      if (overId === CANVAS_DROP) return add(type, phase);
      const index = state.fields.findIndex((f) => f.id === overId);
      return add(type, phase, index === -1 ? undefined : index);
    }
    const from = state.fields.findIndex((f) => f.id === active.id);
    const to = state.fields.findIndex((f) => f.id === overId);
    if (from !== -1 && to !== -1) state.reorder(from, to);
  }

  /** What a screen reader hears during a drag: names, never ids. */
  const nameOf = (id: string | number): string => {
    const type = paletteTypeOf(id);
    if (type) return `a new ${typeName(type).toLowerCase()} field`;
    const text = String(id);
    if (text === CANVAS_DROP) return `the ${PHASE_NAME[phase]} page`;
    if (text.startsWith('tab:')) return `the ${PHASE_NAME[text.slice(4) as FieldPhase]} tab`;
    return state.fields.find((f) => f.id === text)?.label ?? 'a field';
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} is over ${nameOf(over.id)}.`
        : `${nameOf(active.id)} is over nothing.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} was dropped on ${nameOf(over.id)}.`
        : `${nameOf(active.id)} was put back.`,
    onDragCancel: ({ active }) => `${nameOf(active.id)} was put back.`,
  };

  const paused = !online || busy !== null;
  const entries = version.entry_count;

  return (
    <main className={PAGE}>
      <BuilderTopBar
        form={form}
        version={version}
        year={year}
        editable={editable}
        online={online}
        busy={busy}
        dirty={state.dirty}
        changeLine={changeLine}
        forkLine={forkLine}
        belongsIn={belongsIn}
        savedAt={editable ? base : null}
        held={held}
        onSave={() => void save()}
        onPublish={() => void publish()}
        onRestore={(v) => void restore(v)}
        onOpenVersion={(n) => navigate(formBuilderPath(form.id, n))}
        onNextIncomplete={nextIncomplete}
      />
      {!online && (
        <WarningNotice className="mx-6 mt-3 flex-none rounded-control" lead="You're offline.">
          Form changes need a connection, so editing is paused. You can look around; unsaved changes
          stay on this screen until you're back online.
        </WarningNotice>
      )}
      {error && (
        <ErrorLine className="mx-6 mt-3 flex-none">
          <span>{error.line}</span>
          {error.reload && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                reload();
              }}
              className={cn(buttonVariants({ size: 'sm' }), 'ms-3 align-middle')}
            >
              Reload
            </button>
          )}
        </ErrorLine>
      )}
      {published && editable && (
        <Note icon={Lock} className="mx-6 mt-3 flex-none rounded-s-none py-2.5">
          <b className="font-bold text-ink">
            {version.is_locked
              ? entries > 0
                ? `v${version.version_no} is locked: ${plural(entries, 'entry', 'entries')} ${entries === 1 ? 'was' : 'were'} scouted with it.`
                : `v${version.version_no} is locked: entries were scouted with it.`
              : `v${version.version_no} is published.`}
          </b>{' '}
          Labels, help, ranges, meaning and scoring change in place. Adding or removing a field, or
          changing a type,{' '}
          {draft ? `is done in draft v${draft.version_no}.` : `starts draft v${newest + 1}.`}
        </Note>
      )}
      {!editable && (
        <Note icon={Lock} className="mx-6 mt-3 flex-none rounded-s-none py-2.5">
          <b className="font-bold text-ink">
            v{version.version_no} is an older version, so it opens read-only.
          </b>{' '}
          Restore makes it the active version again, with no new version.{' '}
          {draft && (
            <Link
              to={formBuilderPath(form.id, draft.version_no)}
              className="font-[650] text-accent-ink underline"
            >
              Open draft v{draft.version_no}
            </Link>
          )}
        </Note>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={collide}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragging(false);
          setDragType(null);
        }}
        accessibility={{ announcements }}
      >
        <div
          inert={paused}
          aria-busy={busy !== null || undefined}
          className={cn(
            'grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_410px] gap-3.5 px-6 pt-3 pb-4',
            !online && 'opacity-55 grayscale-[0.2]',
          )}
        >
          <FieldPalette
            editable={editable && !draftHolds}
            held={draftHolds && draft ? `New fields go in draft v${draft.version_no}` : null}
            onAdd={(type) => add(type, phase)}
          />
          <BuilderCanvas
            state={state}
            phase={phase}
            onPhase={setPhase}
            editable={editable}
            points={points}
            dragging={dragging}
          />
          <SettingsPane state={state} editable={editable} />
        </div>
        <DragOverlay dropAnimation={null}>
          {dragType ? <PaletteGhost type={dragType} /> : null}
        </DragOverlay>
      </DndContext>
      <BuilderLeaveGuard
        holding={state.dirty}
        name={`${title} · ${versionLabel(version).split(' · ')[0]!.toLowerCase()}`}
        skip={leaving}
      />
    </main>
  );
}
