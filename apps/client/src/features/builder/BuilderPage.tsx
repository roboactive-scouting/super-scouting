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
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  scoringUniverse,
  validateScoringRules,
  type FieldPhase,
  type FieldTypeName,
  type FormFieldDefinition,
  type GetFormVersionOutput,
  type SaveDraftFieldsOutput,
  type ScoredFieldRow,
  type ScoringField,
  type ScoringIssue,
  type ScoringRuleInput,
  type VersionSummary,
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
import { ruleLost, useScoring, wholeRuleSet } from './scoringRules';
import { SettingsPane, type PanePatch } from './SettingsPane';
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
export function pointsTag(
  row: Pick<ScoredFieldRow, 'type' | 'points' | 'option_points'>,
): string | null {
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

/**
 * What a save that forked hands the new draft's page, as router navigation state: the line
 * saying the points were not sent, if they were not (fix round 1, I4).
 */
type ForkState = { notice: string | null } | null;

function BuilderEditor({ data, rpc, reload }: { data: BuilderData; rpc: Rpc; reload: () => void }) {
  const { form, version, year, fieldImage, previous } = data;
  const navigate = useNavigate();
  const location = useLocation();
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
  const scoring = useScoring(version.fields, state.fields);
  const [scoringIssues, setScoringIssues] = useState<ScoringIssue[]>([]);
  const [busy, setBusy] = useState<'save' | 'publish' | 'restore' | null>(null);
  // A save that forked and then failed to send the points says so on the new draft's page.
  const [error, setError] = useState<{ line: string; reload: boolean } | null>(() => {
    const notice = (location.state as ForkState)?.notice;
    return notice ? { line: notice, reload: false } : null;
  });
  useEffect(() => {
    // Said once: a reload of this page does not say it again.
    if ((location.state as ForkState)?.notice) {
      navigate({ pathname: location.pathname, search: location.search }, { replace: true });
    }
    // Only on arrival.
  }, []);
  const [base, setBase] = useState(version.updated_at);
  const [dragType, setDragType] = useState<FieldTypeName | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Set before the builder moves on purpose, so the leave guard lets it. */
  const leaving = useRef(false);

  const title = `${form.name}${year !== null ? ` ${year}` : ''}`;
  usePageTitle(title);
  usePageCrumb(['Admin', 'Forms', title]);

  // The canvas's points tags follow the scoring being edited, not only the scoring last saved.
  const points = useMemo(
    () =>
      new Map(
        state.fields.flatMap((field) => {
          const rule = scoring.rules.get(field.id);
          // A rule the type can no longer carry is not shown: saving drops it.
          const tag =
            rule && !ruleLost(field.type, rule) ? pointsTag({ type: field.type, ...rule }) : null;
          return tag ? [[field.key, tag] as const] : [];
        }),
      ),
    [state.fields, scoring.rules],
  );
  const dirty = state.dirty || scoring.dirty;

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
  /** On a published version, where a structural change from the settings pane goes. */
  const structuralNote = !published
    ? null
    : draft
      ? `belongs in draft v${draft.version_no}`
      : `starts draft v${newest + 1}`;
  // The selected field as the pane shows it, with the points being edited.
  const selected = state.selectedField
    ? { ...state.selectedField, ...(scoring.ruleFor(state.selectedField.id) ?? {}) }
    : null;
  // A saved field's option and button values are permanent; a new one's follow their labels.
  const savedOptionValues = useMemo(() => {
    const row = state.baseline.find((f) => f.id === state.selectedField?.id);
    const list = (row?.config.options ?? row?.config.event_types ?? []) as { value: string }[];
    return list.map((o) => o.value);
  }, [state.baseline, state.selectedField?.id]);
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

  /**
   * The form's whole rule set for `setScoringRules`, checked as the server will check it, or
   * the problems that hold it. Scoring is per form and replaces every rule, so the other
   * version's rows (the active one for a draft, the draft for the active one) are read to keep
   * the rules of keys this version does not have (DEVIATIONS 1.30).
   */
  async function rulesToSend(): Promise<
    { rules: ScoringRuleInput[]; issues: ScoringIssue[] } | 'failed'
  > {
    const partnerSummary =
      version.status === 'draft'
        ? form.versions.find((v) => v.is_active && v.id !== version.id)
        : form.versions.find((v) => v.status === 'draft');
    let partner: ScoredFieldRow[] = [];
    if (partnerSummary) {
      try {
        partner = (
          (await rpc.call('getFormVersion', {
            form_version_id: partnerSummary.id,
          })) as GetFormVersionOutput
        ).fields;
      } catch (e) {
        fail(e);
        return 'failed';
      }
    }
    const live = state.fields;
    const liveIds = new Set(live.map((f) => f.id));
    const others = state.baseline.filter((f) => !liveIds.has(f.id));
    const baselineLive = state.baseline.filter((f) => !f.deprecated);
    // Which fields the server will judge as the draft's and which as the active version's.
    type Side = readonly (ScoringField & { deprecated?: boolean })[];
    const [active, draftSide]: [Side, Side] =
      version.status === 'draft'
        ? [partner, live]
        : state.willForkNewVersion
          ? [baselineLive, live]
          : [live, partner];
    const universe = scoringUniverse(active, draftSide);
    const rules = wholeRuleSet({ live, others, partner, rules: scoring.rules, universe });
    const issues = validateScoringRules(rules, universe, { prefix: 'rules', noun: 'form' });
    return { rules, issues };
  }

  /**
   * Saves what changed: the whole live field set (`saveDraftFields`), then the form's whole
   * rule set (`setScoringRules`) — fields first, because a rule may name a field that does not
   * exist until this save. False when it did not save here (refused, failed, or it forked).
   */
  async function save(): Promise<boolean> {
    setBusy('save');
    setError(null);
    setScoringIssues([]);
    const fieldsDirty = state.dirty;
    let send: ScoringRuleInput[] | null = null;
    if (scoring.dirty) {
      const checked = await rulesToSend();
      if (checked === 'failed') {
        setBusy(null);
        return false;
      }
      if (checked.issues.length > 0) {
        const first = checked.issues[0]!;
        setScoringIssues(checked.issues);
        setError({
          line: `Nothing was saved: the points for “${labelOf(first.field_key) ?? first.field_key}” are not valid (${first.message}).`,
          reload: false,
        });
        setBusy(null);
        return false;
      }
      send = checked.rules;
    }

    let out: SaveDraftFieldsOutput | null = null;
    // A new field's `new-n` id → the id the server gave it.
    const ids = new Map<string, string>();
    const sentFields = state.fields;
    if (fieldsDirty) {
      const before = new Map(state.fields.map((f) => [f.key, f.id]));
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
      if (saved && !saved.new_version_id) {
        setBase(saved.updated_at);
        // A new field's points follow it to the id the server gave it.
        for (const row of saved.fields) {
          const was = before.get(row.key);
          if (was && was !== row.id) ids.set(was, row.id);
        }
        scoring.rekey(ids);
      }
    }
    const saved = out as SaveDraftFieldsOutput | null;
    const forkedTo = saved?.new_version_id ? saved.version_no : null;

    let notice: string | null = null;
    if (send) {
      try {
        await rpc.call('setScoringRules', { form_id: form.id, rules: send });
        scoring.markSent(new Map(sentFields.map((f) => [ids.get(f.id) ?? f.id, f.type])));
      } catch (e) {
        const why = formErrorLine(e, { labelOf });
        notice = fieldsDirty ? `The fields were saved; the points were not. ${why}` : why;
        if (forkedTo === null) {
          setError({ line: notice, reload: offersReload(e) });
          setBusy(null);
          return false;
        }
      }
    }
    if (forkedTo !== null) {
      // The editor stays busy (Save and Publish held, panes inert) until the new draft is read
      // and this editor is replaced by its own.
      leaving.current = true;
      navigate(formBuilderPath(form.id, forkedTo), {
        state: { notice } satisfies ForkState,
      });
      return false;
    }
    setBusy(null);
    return !fieldsDirty || saved !== null;
  }

  /** One change from the settings pane: the field's columns, and its points. */
  function onPaneChange(patch: PanePatch) {
    const field = state.selectedField;
    if (!field) return;
    const { points: p, option_points: op, ...columns } = patch;
    if (p !== undefined || op !== undefined) {
      // A patch may carry one of the two (an option renamed carries only its points).
      const was = scoring.ruleFor(field.id);
      scoring.setRule(field.id, {
        points: p ?? was?.points ?? 0,
        option_points: op === undefined ? (was?.option_points ?? null) : op,
      });
      setScoringIssues([]);
    }
    if (Object.keys(columns).length > 0) {
      state.updateField(field.key, columns);
      if (columns.phase && field.type !== 'section') setPhase(columns.phase);
    }
  }

  async function publish() {
    if (dirty && !(await save())) return;
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
        dirty={dirty}
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
          <SettingsPane
            field={selected}
            allFields={state.fields}
            onChange={onPaneChange}
            seasonImagePath={fieldImage}
            editable={editable}
            saved={selected ? state.isSaved(selected) : true}
            published={published}
            forkNote={structuralNote}
            savedOptionValues={savedOptionValues}
            issues={selected ? state.issuesFor(selected.key) : []}
            scoringIssues={scoringIssues
              .filter((i) => i.field_key === selected?.key)
              .map((i) => i.message)}
            onRemove={() => selected && state.removeField(selected.key)}
          />
        </div>
        <DragOverlay dropAnimation={null}>
          {dragType ? <PaletteGhost type={dragType} /> : null}
        </DragOverlay>
      </DndContext>
      <BuilderLeaveGuard
        holding={dirty}
        name={`${title} · ${versionLabel(version).split(' · ')[0]!.toLowerCase()}`}
        skip={leaving}
      />
    </main>
  );
}
