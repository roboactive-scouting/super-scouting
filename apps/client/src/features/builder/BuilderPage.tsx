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
import { CodeXml, Download, Lock, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  scoringUniverse,
  validateScoringRules,
  type FieldPhase,
  type FieldTypeName,
  type FormFieldDefinition,
  type FormRowOutput,
  type GetFormOutput,
  type GetFormVersionOutput,
  type SaveDraftFieldsOutput,
  type ScoredFieldRow,
  type ScoringField,
  type ScoringIssue,
  type ScoringRuleInput,
  type TimerConfig,
  type VersionSummary,
} from '@frc/shared';
import { Skeleton } from '@/components/Skeleton';
import { StateMessage } from '@/components/StateMessage';
import type { ActionItem } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import { DestructiveConfirm } from '@/components/ui/destructive-confirm';
import { ErrorLine, Note, WarningNotice } from '@/components/ui/notice';
import { adminRpc, RpcError, type Rpc } from '@/data/rpc';
import { AdminOnly } from '@/features/admin/AdminOnly';
import { FORMS_GATE } from '@/features/forms/formsGate';
import { previewData, seedValues } from '@/features/entry/entryValues';
import { PHASE_NAME, PHASE_ORDER } from '@/features/entry/phases';
import { usePageCrumb, usePageTitle } from '@/lib/pageTitle';
import { formBuilderPath, formsSeasonPath, PATHS } from '@/lib/paths';
import { plural } from '@/lib/plural';
import { useOnline } from '@/lib/useOnline';
import { cn } from '@/lib/utils';
import { BuilderCanvas, CANVAS_DROP, phasePages, type CanvasMode } from './BuilderCanvas';
import { BuilderLeaveGuard } from './BuilderLeaveGuard';
import { BuilderTopBar, heldLine, RESTORE_HELD } from './BuilderTopBar';
import { DeleteFormDialog } from './DeleteFormDialog';
import { FieldPalette, PaletteGhost, paletteTypeOf } from './FieldPalette';
import { formErrorLine, offersReload } from './formErrors';
import { typeName } from './fieldTypes';
import { ExportDialog, ImportDialog } from './ImportExport';
import { TryItPane } from './LivePreview';
import { RawJsonEditor } from './RawJsonEditor';
import {
  ruleLost,
  ruleOf,
  sameRules,
  useScoring,
  wholeRuleSet,
  type Rule,
  type ScoringSnapshot,
} from './scoringRules';
import { SettingsPane, type PanePatch } from './SettingsPane';
import { TimerConfigEditor } from './TimerConfigEditor';
import { useBuilderLoad, type BuilderData } from './useBuilderLoad';
import {
  changedPhase,
  phaseOfIndex,
  sameFieldList,
  sameRows,
  useBuilderState,
  type FieldsSnapshot,
} from './useBuilderState';
import { typingGroup, useUndoHistory } from './useUndoHistory';
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
  const { load, key, pending, reload } = useBuilderLoad(rpc, formId, versionNo);

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
  return (
    <BuilderEditor
      // Every read (another version, a publish, a restore, Reload): start from the server's.
      key={key}
      data={load.data}
      rpc={rpc}
      reload={reload}
      pending={pending}
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

/** Someone else's save landed on this version: the stale-version refusal's own sentence. */
const STALE_LINE = formErrorLine(
  new RpcError('conflict', 'someone else saved this version', 409, true, {
    reason: 'stale-version',
  }),
);

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

/**
 * The page's error line and what it offers: Reload (read the version again; asks first when
 * there are unsaved changes), or Check again (after the timer saved but its re-read failed:
 * read the version again and keep the edits, final review I2).
 */
type PageError = { line: string; action: 'reload' | 'check' | null };

/** One undo step: the fields and their points together, so an undo never splits them (UF.14). */
type Step = { fields: FieldsSnapshot; scoring: ScoringSnapshot };

/** Two steps the admin could not tell apart: the same fields and the same points. */
const sameStep = (a: Step, b: Step) =>
  sameFieldList(a.fields.fields, b.fields.fields) && sameRules(a.scoring.rules, b.scoring.rules);

/** Ctrl+Z undoes; Ctrl+Shift+Z and Ctrl+Y redo (⌘ on a Mac). Anything else: null. */
function historyKey(e: KeyboardEvent): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !e.shiftKey) return 'redo';
  return null;
}

function BuilderEditor({
  data,
  rpc,
  reload,
  pending,
}: {
  data: BuilderData;
  rpc: Rpc;
  reload: () => void;
  /** Another read is in flight (another version, a publish, a restore): stay held until then. */
  pending: boolean;
}) {
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
  const [error, setError] = useState<PageError | null>(() => {
    const notice = (location.state as ForkState)?.notice;
    return notice ? { line: notice, action: null } : null;
  });
  /** Reload was asked for while there are unsaved changes: the confirm is open. */
  const [askReload, setAskReload] = useState(false);
  /**
   * The version is locked: as loaded, or since an in-place save on a version with entries,
   * which the server stamps locked (final review, M5).
   */
  const [lockedNow, setLockedNow] = useState(version.is_locked);
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
  /** Edit, or Try it: the canvas filled as a scouter would, nothing saved (task 1.31). */
  const [mode, setMode] = useState<CanvasMode>('edit');
  /**
   * What Try it holds, with the type each value was filled as: in memory only, never drafted,
   * stored or sent. A value whose field has since changed type (in the settings pane, Edit as
   * JSON or an import) is dropped, so a control never gets a value of another type.
   */
  const [tried, setTried] = useState<Record<string, { type: FieldTypeName; value: unknown }>>({});
  /** The Match timer's or a More menu's dialog, if one is open. */
  const [dialog, setDialog] = useState<'timer' | 'json' | 'export' | 'import' | 'delete' | null>(
    null,
  );
  /** The form's match timer: form-level, saved in place (SPEC-FINAL 8.4), so kept beside it. */
  const [timer, setTimer] = useState<TimerConfig>(form.timer_config);
  /** Set before the builder moves on purpose, so the leave guard lets it. */
  const leaving = useRef(false);
  /** Moves on every undo and redo, so the pane's half-filled drafts start again (UF.14). */
  const [revision, setRevision] = useState(0);

  /**
   * Undo and redo (UF.14): every edit since this version was loaded or last saved — fields and
   * their points as one step. A save starts a new history (an undo past it would bring back
   * fields the server has already given ids), and so does a load: another version, a reload, a
   * publish or a fork is a new editor. The canvas turns to the phase the step changes.
   */
  const history = useUndoHistory<Step>({
    capture: () => ({ fields: state.snapshot(), scoring: scoring.snapshot() }),
    restore: (step) => {
      const where = changedPhase(state.fields, step.fields.fields);
      state.restore(step.fields);
      scoring.restore(step.scoring);
      setScoringIssues([]);
      setRevision((r) => r + 1);
      if (where) setPhase(where);
    },
    same: sameStep,
    watch: [state.fields, scoring.rules],
  });
  /**
   * The pane box the last Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y was pressed in, as its undo group: a
   * run of them in one box keeps walking the builder's history (an edit ends the run).
   */
  const keyedFrom = useRef<string | null>(null);
  /** Before every edit. */
  const record = (group?: string) => {
    keyedFrom.current = null;
    history.record(group);
  };
  /** A settings-pane box's undo group: the field and the box (a box redrawn for another field is another group). */
  const paneGroup = (fieldId: string, box: string) => `${fieldId}:${box}`;
  /** Before an edit from the settings pane: typing in one box is one step per pause. */
  const recordPane = (fieldId: string) => {
    const box = typingGroup();
    record(box === undefined ? undefined : paneGroup(fieldId, box));
  };

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
    setError({ line: formErrorLine(e, { labelOf }), action: offersReload(e) ? 'reload' : null });
  };

  /**
   * The form's whole rule set for `setScoringRules`, checked as the server will check it, or
   * the problems that hold it. Scoring is per form and replaces every rule, so it is built from
   * the server as it is now, not as it was at load (final review, I4): the form is read again
   * to find the other version (the active one for a draft, the draft for the active one — a
   * draft someone opened since counts), and this version's and that version's rows are read.
   * A rule this session changed is sent as edited; every other key's rule is the server's, so
   * another admin's points change is kept and the other version's keys keep theirs.
   */
  async function rulesToSend(): Promise<
    { rules: ScoringRuleInput[]; issues: ScoringIssue[]; byId: Map<string, Rule> } | 'failed'
  > {
    let own: ScoredFieldRow[];
    let partner: ScoredFieldRow[] = [];
    try {
      const fresh = (await rpc.call('getForm', { form_id: form.id })) as GetFormOutput;
      const partnerSummary =
        version.status === 'draft'
          ? fresh.versions.find((v) => v.is_active && v.id !== version.id)
          : fresh.versions.find((v) => v.status === 'draft');
      const read = (id: string) =>
        rpc.call('getFormVersion', { form_version_id: id }) as Promise<GetFormVersionOutput>;
      const [ownOut, partnerOut] = await Promise.all([
        read(version.id),
        partnerSummary ? read(partnerSummary.id) : Promise.resolve(null),
      ]);
      own = ownOut.fields;
      partner = partnerOut?.fields ?? [];
    } catch (e) {
      fail(e);
      return 'failed';
    }
    const serverRule = new Map(own.map((row) => [row.id, ruleOf(row)]));
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
    // This session's rule where it changed one (or the field is new); the server's otherwise.
    const byId = new Map<string, Rule>();
    for (const f of [...live, ...others]) {
      const rule =
        scoring.edited.has(f.id) || !serverRule.has(f.id)
          ? scoring.ruleFor(f.id)
          : serverRule.get(f.id)!;
      if (rule) byId.set(f.id, rule);
    }
    const rules = wholeRuleSet({ live, others, partner, rules: byId, universe });
    const issues = validateScoringRules(rules, universe, { prefix: 'rules', noun: 'form' });
    return { rules, issues, byId };
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
    let send: { rules: ScoringRuleInput[]; byId: Map<string, Rule> } | null = null;
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
          action: null,
        });
        setBusy(null);
        return false;
      }
      send = checked;
    }

    let out: SaveDraftFieldsOutput | null = null;
    // A new field's `new-n` id → the id the server gave it.
    const ids = new Map<string, string>();
    const sentFields = state.fields;
    // Ids the version's rows had before this save: a rule on any other id that is not a live
    // field belonged to a field removed unsaved, and goes once the set is sent.
    const known = new Set(state.baseline.map((f) => f.id));
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
        // The server stamps a published version with entries locked on an in-place save.
        if (published && version.entry_count > 0) setLockedNow(true);
        // A new field's points follow it to the id the server gave it.
        for (const row of saved.fields) {
          const was = before.get(row.key);
          if (was && was !== row.id) ids.set(was, row.id);
        }
        scoring.rekey(ids);
        history.clear();
      }
    }
    const saved = out as SaveDraftFieldsOutput | null;
    const forkedTo = saved?.new_version_id ? saved.version_no : null;

    let notice: string | null = null;
    if (send) {
      try {
        await rpc.call('setScoringRules', { form_id: form.id, rules: send.rules });
        scoring.markSent(
          new Map(sentFields.map((f) => [ids.get(f.id) ?? f.id, f.type])),
          known,
          new Map([...send.byId].map(([id, rule]) => [ids.get(id) ?? id, rule])),
        );
        history.clear();
      } catch (e) {
        const why = formErrorLine(e, { labelOf });
        notice = fieldsDirty ? `The fields were saved; the points were not. ${why}` : why;
        if (forkedTo === null) {
          setError({ line: notice, action: offersReload(e) ? 'reload' : null });
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
    recordPane(field.id);
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
      // Held until the form is read again and this editor is replaced (final review, M1).
      reload();
    } catch (e) {
      fail(e);
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
    setPhase(phaseOfIndex(state.fields, index));
    // A selection is shown in Edit: Try it draws no selection and no settings pane.
    setMode('edit');
  }

  function add(type: FieldTypeName, to: FieldPhase, index?: number) {
    record();
    state.addField(type, index === undefined ? { phase: to } : { phase: to, index });
    setPhase(to);
    // A new field is arranged in Edit.
    setMode('edit');
  }

  /**
   * The Match timer's Save: `updateForm`, in place, no version. The server stamps the form's
   * draft (else its active version), which moves that version's `updated_at` — the base every
   * field save is checked against. So after the send the version is read once: if its fields
   * are still the ones this builder last loaded or saved, only the stamp moved, and its
   * `updated_at` becomes the base (the next field save is not refused as stale; unsaved edits
   * stay). If they differ, someone else saved: their save is never adopted unseen, so the
   * stale-version line offers Reload. A send that timed out may still have landed, so it is
   * checked the same way before its failure is shown (DEVIATIONS 1.32, fix round 1).
   */
  async function saveTimer(config: TimerConfig) {
    let row: FormRowOutput | null = null;
    let timedOut: RpcError | null = null;
    try {
      row = (await rpc.call('updateForm', {
        form_id: form.id,
        timer_config: config,
      })) as FormRowOutput;
    } catch (e) {
      if (!(e instanceof RpcError && e.code === 'timeout')) throw e;
      timedOut = e;
    }
    if (row) setTimer(row.timer_config);
    await checkBase(row ? 'The match timer was saved. ' : '', row !== null);
    if (timedOut) throw timedOut;
  }

  /**
   * Reads the version once and compares its fields with the saved baseline: the same → only
   * the timer's stamp moved, so its `updated_at` becomes the base; different → someone else
   * saved, and Reload is offered. A failed read after a save that landed (`saved`) says so and
   * offers Check again, which runs this again and keeps the edits (final review, I2).
   */
  async function checkBase(lead: string, saved: boolean) {
    try {
      const fresh = (await rpc.call('getFormVersion', {
        form_version_id: version.id,
      })) as GetFormVersionOutput;
      if (sameRows(fresh.fields as FormFieldDefinition[], state.baseline)) {
        setBase(fresh.updated_at);
        setError(null);
      } else {
        setError({ line: `${lead}${STALE_LINE}`, action: 'reload' });
      }
    } catch (e) {
      // Saved; only the re-read failed. The next field save would be refused as stale: say so.
      // (After a timeout the dialog says it did not answer; a stale base then shows on Save.)
      if (saved) setError({ line: `${lead}${formErrorLine(e, { labelOf })}`, action: 'check' });
    }
  }

  /** The error line's Reload: drops unsaved changes, so it asks first when there are some. */
  function reloadVersion() {
    if (dirty) {
      setAskReload(true);
      return;
    }
    setError(null);
    reload();
  }

  /** Edit as JSON's Apply: the local fields and their points, unsaved until Save. */
  function applyJson(fields: FormFieldDefinition[], rules: Map<string, Rule>) {
    record();
    // A field never saved that the text left out goes with its points (final review, I1).
    const kept = new Set(fields.map((f) => f.id));
    for (const field of state.fields) {
      if (!state.isSaved(field) && !kept.has(field.id)) scoring.setRule(field.id, null);
    }
    state.replaceFields(fields);
    // Try it's values of a field that is gone, or now another type, go with it.
    const now = new Map(fields.map((f) => [f.key, f.type]));
    setTried((was) =>
      Object.fromEntries(
        Object.entries(was).filter(([key, filled]) => now.get(key) === filled.type),
      ),
    );
    for (const field of fields) scoring.setRule(field.id, rules.get(field.key) ?? null);
    setScoringIssues([]);
    setDialog(null);
  }

  // Try it: each control as it starts, then what was filled; the data as it would sync.
  const typeOf = new Map(state.fields.map((f) => [f.key, f.type]));
  const tryValues = { ...seedValues(state.fields) };
  for (const [key, filled] of Object.entries(tried)) {
    if (typeOf.get(key) === filled.type) tryValues[key] = filled.value;
  }
  const tryData = previewData(state.fields, tryValues);

  const formRef = { id: form.id, name: form.name, kind: form.kind, versions: form.versions };
  const more: ActionItem[] = [
    {
      key: 'json',
      icon: CodeXml,
      title: 'Edit as JSON',
      detail: 'Advanced: the whole form as text. Refuses anything invalid and names the line.',
      held: editable ? null : 'This version is read-only: open the draft to edit it.',
      onSelect: () => setDialog('json'),
    },
    {
      key: 'export',
      icon: Download,
      title: 'Export',
      detail: 'Save this form in Exports for 24 hours, e.g. to start next season from it.',
      onSelect: () => setDialog('export'),
    },
    {
      key: 'import',
      icon: Upload,
      title: 'Import',
      detail: 'Load a saved export or a .json file. Shows what it adds and removes first.',
      held: dirty ? RESTORE_HELD : null,
      onSelect: () => setDialog('import'),
    },
    {
      key: 'delete',
      icon: Trash2,
      title: 'Delete form',
      detail: 'Removes every version and its entries. Asks first.',
      separated: true,
      onSelect: () => setDialog('delete'),
    },
  ];

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
    if (from !== -1 && to !== -1 && from !== to) {
      record();
      state.reorder(from, to);
    }
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

  // Until another read replaces this editor (Open vN, a publish, a restore), it stays held.
  const paused = !online || busy !== null || pending;
  const entries = version.entry_count;
  /**
   * Undo and redo hold while editing is paused, a dialog is open, a drag is running or Try it
   * is showing (its test values are not edits; its boxes keep their own undo).
   */
  const historyHeld =
    paused || !editable || dialog !== null || askReload || dragging || mode === 'try';

  /**
   * Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y on the builder. Never inside a dialog (Edit as JSON's editor
   * keeps its own text undo) and never in Try it. In a text box, the builder's step only when
   * that box's typing is the step it would take (typing then Ctrl+Z takes back the whole
   * burst), or the last such key was pressed there: otherwise the box's own undo, so a
   * half-filled draft (one end of the expected range, a Show when value) is not thrown away
   * by undoing an unrelated step.
   */
  function onHistoryKey(e: KeyboardEvent) {
    const which = historyKey(e);
    if (!which || historyHeld) return;
    if ((e.target as Element | null)?.closest?.('[role="dialog"], [role="alertdialog"]')) return;
    const box = typingGroup();
    const group = box === undefined ? null : paneGroup(state.selectedField?.id ?? '', box);
    if (group !== null && history.groupOf(which) !== group && keyedFrom.current !== group) return;
    e.preventDefault();
    if (which === 'undo') history.undo();
    else history.redo();
    keyedFrom.current = group;
  }
  // Bound once; the listener calls this render's handler.
  const historyKeyRef = useRef(onHistoryKey);
  historyKeyRef.current = onHistoryKey;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => historyKeyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main className={PAGE}>
      <BuilderTopBar
        form={form}
        version={lockedNow === version.is_locked ? version : { ...version, is_locked: lockedNow }}
        year={year}
        editable={editable}
        online={online}
        busy={busy ?? (pending ? 'loading' : null)}
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
        onTimer={() => setDialog('timer')}
        more={more}
        backTo={year !== null ? formsSeasonPath(year) : PATHS.forms}
        history={
          editable
            ? {
                canUndo: history.canUndo && !historyHeld,
                canRedo: history.canRedo && !historyHeld,
                onUndo: history.undo,
                onRedo: history.redo,
              }
            : undefined
        }
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
          {error.action === 'reload' && (
            <Button size="sm" className="ms-3 align-middle" onClick={reloadVersion}>
              Reload
            </Button>
          )}
          {error.action === 'check' && (
            <Button
              size="sm"
              className="ms-3 align-middle"
              disabled={!online}
              onClick={() => void checkBase('The match timer was saved. ', true)}
            >
              Check again
            </Button>
          )}
        </ErrorLine>
      )}
      <DestructiveConfirm
        open={askReload}
        title="Reload and lose your unsaved changes?"
        objectName={`${title} · ${versionLabel(version).split(' · ')[0]!.toLowerCase()}`}
        body="Reloading reads this version from the server again. Your changes on this screen that are not saved go."
        confirmLabel="Reload and lose changes"
        cancelLabel="Keep my changes"
        icon={RotateCcw}
        onCancel={() => setAskReload(false)}
        onConfirm={() => {
          setAskReload(false);
          setError(null);
          reload();
        }}
      />
      {published && editable && (
        <Note icon={Lock} className="mx-6 mt-3 flex-none rounded-s-none py-2.5">
          <b className="font-bold text-ink">
            {lockedNow
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
          aria-busy={busy !== null || pending || undefined}
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
            mode={mode}
            onMode={setMode}
            tryIt={{
              values: tryValues,
              data: tryData,
              onChange: (key, value) => {
                const type = typeOf.get(key);
                if (type) setTried((was) => ({ ...was, [key]: { type, value } }));
              },
            }}
          />
          {mode === 'try' ? (
            <TryItPane fields={state.fields} data={tryData} onClear={() => setTried({})} />
          ) : (
            <SettingsPane
              field={selected}
              allFields={state.fields}
              onChange={onPaneChange}
              seasonImagePath={fieldImage}
              editable={editable}
              saved={selected ? state.isSaved(selected) : true}
              keyFollows={selected ? state.keyFollows(selected) : false}
              published={published}
              forkNote={structuralNote}
              savedOptionValues={savedOptionValues}
              issues={selected ? state.issuesFor(selected.key) : []}
              scoringIssues={scoringIssues
                .filter((i) => i.field_key === selected?.key)
                .map((i) => i.message)}
              revision={revision}
              onRemove={() => {
                if (!selected) return;
                record();
                // A field never saved goes with its points (final review, I1).
                if (!state.isSaved(selected)) scoring.setRule(selected.id, null);
                state.removeField(selected.key);
              }}
            />
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragType ? <PaletteGhost type={dragType} /> : null}
        </DragOverlay>
      </DndContext>
      {dialog === 'timer' && (
        <TimerConfigEditor
          config={timer}
          online={online}
          readOnly={
            editable
              ? null
              : `v${version.version_no} is an older version, so the timer is shown read-only. The timer belongs to the form: change it from ${draft ? `draft v${draft.version_no}` : 'the active version'}.`
          }
          onSave={saveTimer}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'json' && (
        <RawJsonEditor
          versionName={
            version.status === 'draft'
              ? `Draft v${version.version_no}`
              : `v${version.version_no}${version.is_active ? ' · active' : ''}`
          }
          fields={state.fields}
          baseline={state.baseline}
          isSaved={state.isSaved}
          ruleFor={scoring.ruleFor}
          online={online}
          onApply={applyJson}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'export' && (
        <ExportDialog
          form={formRef}
          year={year}
          rpc={rpc}
          online={online}
          unsaved={dirty}
          versionId={version.id}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'import' && (
        <ImportDialog
          target={{ kind: form.kind, seasonId: form.season_id, year, form: formRef }}
          rpc={rpc}
          online={online}
          onClose={() => setDialog(null)}
          onImported={(_out, draftNo) => {
            setDialog(null);
            // The draft it wrote, read again from the server.
            if (version.status === 'draft' && version.version_no === draftNo) reload();
            else navigate(formBuilderPath(form.id, draftNo));
          }}
        />
      )}
      {dialog === 'delete' && (
        <DeleteFormDialog
          form={formRef}
          year={year}
          rpc={rpc}
          online={online}
          onClose={() => setDialog(null)}
          onExportFirst={() => setDialog('export')}
          onDeleted={() => {
            leaving.current = true;
            // Back to the list on the deleted form's season (final review, D3).
            navigate(year !== null ? formsSeasonPath(year) : PATHS.forms);
          }}
        />
      )}
      <BuilderLeaveGuard
        holding={dirty}
        name={`${title} · ${versionLabel(version).split(' · ')[0]!.toLowerCase()}`}
        skip={leaving}
      />
    </main>
  );
}
