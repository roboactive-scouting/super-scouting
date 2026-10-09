import { useCallback, useMemo, useState } from 'react';
import {
  FIELD_TYPE_CONFIG,
  isStructuralChange,
  validateExpr,
  validateFieldDefinition,
  validateVisibilityCondition,
  type Expr,
  type FieldPhase,
  type FieldTypeName,
  type FormFieldDefinition,
  type FormFieldInput,
  type FormIssue,
  type TimerConfig,
} from '@frc/shared';
import { PHASE_ORDER } from '@/features/entry/phases';
import { defaultConfig, typeName } from './fieldTypes';

/**
 * What the builder edits: one version's fields as the server sent them, deprecated ones
 * included (getFormVersion). `is_locked` means "an edit here lands on a published version":
 * a structural change then starts a new draft (SPEC-FINAL 5.1; DEVIATIONS 1.27 decision E —
 * any published version forks, locked or not), so the builder passes `status === 'published'`.
 */
export type BuilderInitial = {
  form_id: string;
  version_id: string;
  is_locked: boolean;
  timer_config: TimerConfig;
  fields: FormFieldDefinition[];
};

/** The four meaning columns every data field needs before publishing (SPEC-FINAL 5.4). */
export const MEANING_PATHS: ReadonlySet<string> = new Set([
  'description',
  'unit',
  'phase',
  'direction',
]);

/** A field that holds Publish, with every problem it has. */
export type IncompleteField = { key: string; label: string; issues: FormIssue[] };

/** A patch never carries the id or the key: the key follows the label, then never changes. */
export type FieldPatch = Partial<Omit<FormFieldDefinition, 'id' | 'key'>>;

type State = {
  /** Every row as last loaded or saved, deprecated ones included: the "before" of a save. */
  baseline: FormFieldDefinition[];
  /** The live fields, in display order (1, 2, 3, …). */
  fields: FormFieldDefinition[];
  /** Ids the server knows: such a field's key is permanent. A new field's id is `new-n`. */
  saved: ReadonlySet<string>;
  /** The selected field's id (stable while a new field's key follows its label). */
  selected: string | null;
  next: number;
};

const KEY_MAX = 63;

/** The key's lead-in for a phase, as the design names its keys (`tele_high`, `end_climb`). */
const PHASE_PREFIX: Record<FieldPhase, string> = {
  auto: 'auto',
  teleop: 'tele',
  endgame: 'end',
  post_match: 'post',
};

/**
 * A new field's key, from its label (SPEC-FINAL 5.1, v1.20): lowercase words joined by `_`,
 * led by the phase (`tele_pieces_dropped`) unless the label already says it, starting with a
 * letter, at most 63 characters, and `_2`, `_3`… when another field (live or retired) has it.
 * A label with no Latin letters (Hebrew) gives the type's name.
 */
export function keyFromLabel(
  label: string,
  phase: FieldPhase | null,
  type: FieldTypeName,
  taken: ReadonlySet<string>,
): string {
  const slug = (text: string) =>
    text
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  let base = slug(label) || slug(type);
  const prefix = phase ? PHASE_PREFIX[phase] : '';
  if (prefix && !base.startsWith(prefix)) base = `${prefix}_${base}`;
  if (!/^[a-z]/.test(base)) base = `f_${base}`;
  base = base.slice(0, KEY_MAX - 4).replace(/_+$/, '');
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Which phase page a field sits on. A data field: its `phase` (none yet → Notes, as the entry
 * form does). A section heading holds no metadata (SPEC-FINAL 5.4), so it sits with the data
 * field after it, else the one before it.
 */
export function phaseAt(fields: readonly FormFieldDefinition[], index: number): FieldPhase {
  const own = fields[index];
  if (!own) return 'post_match';
  if (own.type !== 'section') return own.phase ?? 'post_match';
  for (let i = index + 1; i < fields.length; i++) {
    if (fields[i]!.type !== 'section') return fields[i]!.phase ?? 'post_match';
  }
  for (let i = index - 1; i >= 0; i--) {
    if (fields[i]!.type !== 'section') return fields[i]!.phase ?? 'post_match';
  }
  return 'post_match';
}

const rank = (phase: FieldPhase) => PHASE_ORDER.indexOf(phase);

/**
 * Where a field added to `phase` goes in the whole list: after that phase's last field, or
 * where its run would start (before the first field of a later phase). A section goes at the
 * start of the run, so it heads the phase it was dropped on.
 */
export function insertIndexFor(
  fields: readonly FormFieldDefinition[],
  phase: FieldPhase,
  type: FieldTypeName,
): number {
  const phases = fields.map((_, i) => phaseAt(fields, i));
  if (type === 'section') {
    const first = phases.findIndex((p) => rank(p) >= rank(phase));
    return first === -1 ? fields.length : first;
  }
  let at = 0;
  phases.forEach((p, i) => {
    if (rank(p) <= rank(phase)) at = i + 1;
  });
  return at;
}

/** An expression with every reference to field `from` naming `to` instead. */
function renameInExpr(expr: Expr, from: string, to: string): Expr {
  if (expr.kind === 'field') return expr.key === from ? { kind: 'field', key: to } : expr;
  if (expr.kind !== 'op') return expr;
  const left = renameInExpr(expr.left, from, to);
  const right = renameInExpr(expr.right, from, to);
  return left === expr.left && right === expr.right ? expr : { ...expr, left, right };
}

/**
 * A field whose condition or computed expression names key `from`, naming `to` instead: a
 * new field's key moves with its label or phase, and what refers to it moves with it (task
 * 1.30, fix round 1, I3). The same object when nothing refers to it.
 */
export function renameReferences(
  field: FormFieldDefinition,
  from: string,
  to: string,
): FormFieldDefinition {
  let next = field;
  const condition = field.visibility_condition;
  if (condition?.field_key === from) {
    next = { ...next, visibility_condition: { ...condition, field_key: to } };
  }
  const expression = field.type === 'computed' ? (field.config.expression as Expr | null) : null;
  if (expression) {
    const renamed = renameInExpr(expression, from, to);
    if (renamed !== expression) next = { ...next, config: { ...next.config, expression: renamed } };
  }
  return next;
}

const renumber = (fields: FormFieldDefinition[]) =>
  fields.map((f, i) => (f.display_order === i + 1 ? f : { ...f, display_order: i + 1 }));

/**
 * The save's view of a field, column by column: the server's input is strict, so nothing a
 * read added (`form_version_id`, `points`, `deprecated`) may ride along. `id` only on a saved
 * field — that id is how the server refuses a key change.
 */
function toInput(field: FormFieldDefinition, saved: ReadonlySet<string>): FormFieldInput {
  const input: FormFieldInput = {
    key: field.key,
    label: field.label,
    help_text: field.help_text,
    type: field.type,
    section: field.section,
    display_order: field.display_order,
    required: field.required,
    default_value: field.default_value,
    config: field.config,
    visibility_condition: field.visibility_condition,
    description: field.description,
    unit: field.unit,
    phase: field.phase,
    direction: field.direction,
    category: field.category,
    expected_range: field.expected_range,
    include_in_ai_context: field.include_in_ai_context,
    is_ordinal: field.is_ordinal,
  };
  return saved.has(field.id) ? { id: field.id, ...input } : input;
}

/** A row as the server sends it (FormFieldRow, ScoredFieldRow), as the builder holds it. */
export function definitionOf(row: FormFieldDefinition): FormFieldDefinition {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    help_text: row.help_text,
    type: row.type,
    section: row.section,
    display_order: row.display_order,
    required: row.required,
    default_value: row.default_value ?? null,
    config: row.config,
    visibility_condition: row.visibility_condition,
    deprecated: row.deprecated,
    description: row.description,
    unit: row.unit,
    phase: row.phase,
    direction: row.direction,
    category: row.category,
    expected_range: row.expected_range,
    include_in_ai_context: row.include_in_ai_context,
    is_ordinal: row.is_ordinal,
  };
}

function stateFrom(given: readonly FormFieldDefinition[], selectedKey: string | null): State {
  const rows = given.map(definitionOf);
  const fields = renumber(
    rows.filter((f) => !f.deprecated).sort((a, b) => a.display_order - b.display_order),
  );
  return {
    baseline: rows,
    fields,
    saved: new Set(rows.map((f) => f.id)),
    selected: fields.find((f) => f.key === selectedKey)?.id ?? null,
    next: 1,
  };
}

/** What holds Publish for one field: the server's checks (DEVIATIONS 1.27 decision D). */
function fieldIssues(field: FormFieldDefinition, live: FormFieldDefinition[]): FormIssue[] {
  const at = (issue: { path: string; message: string }): FormIssue => ({
    field_key: field.key,
    ...issue,
  });
  const issues = [
    ...validateFieldDefinition(field).map(at),
    ...validateVisibilityCondition(field, live).map(at),
  ];
  if (field.type === 'computed') {
    const parsed = FIELD_TYPE_CONFIG.computed.safeParse(field.config);
    if (parsed.success) {
      const config = parsed.data as { expression: Expr | null; result_type: 'float' | 'string' };
      if (config.expression === null) {
        issues.push(
          at({
            path: 'config.expression',
            message: 'a computed field needs its expression before the form can be published',
          }),
        );
      } else {
        for (const issue of validateExpr(config.expression, live, config.result_type)) {
          issues.push(at({ path: `config.${issue.path}`, message: issue.message }));
        }
      }
    }
  }
  return issues;
}

/**
 * The builder's local edit model (task 1.29). Fields are an array in display order; a new
 * field's key follows its label until the field is first saved, and a saved field's key never
 * changes (SPEC-FINAL 5.1). `willForkNewVersion` uses the server's own `isStructuralChange`.
 */
export function useBuilderState(initial: BuilderInitial) {
  const [state, setState] = useState<State>(() => stateFrom(initial.fields, null));
  const { baseline, fields, saved, selected } = state;

  /**
   * Keys a new field may not take: every other live key, and every key the version has saved,
   * live or retired — so a saved field removed in this session never lends its key to a new
   * field, perhaps of another type.
   */
  const takenBy = useCallback(
    (s: State, ownId: string | null) =>
      new Set([
        ...s.fields.filter((f) => f.id !== ownId).map((f) => f.key),
        ...s.baseline.map((f) => f.key),
      ]),
    [],
  );

  const addField = useCallback(
    (type: FieldTypeName, opts: { phase?: FieldPhase | null; index?: number } = {}) => {
      setState((s) => {
        const phase = type === 'section' ? null : (opts.phase ?? null);
        const label = typeName(type);
        const id = `new-${s.next}`;
        const field: FormFieldDefinition = {
          id,
          key: keyFromLabel(label, phase, type, takenBy(s, null)),
          label,
          help_text: null,
          type,
          section: null,
          display_order: 0,
          required: false,
          default_value: null,
          config: defaultConfig(type),
          visibility_condition: null,
          deprecated: false,
          description: null,
          unit: null,
          phase,
          direction: null,
          category: null,
          expected_range: null,
          include_in_ai_context: null,
          is_ordinal: null,
        };
        const at =
          opts.index ?? (opts.phase ? insertIndexFor(s.fields, opts.phase, type) : s.fields.length);
        // Added to a phase (a tab, the column, the palette), it goes after the phase's last
        // field and joins that field's section, so it is part of the group it is drawn in.
        const before = s.fields[at - 1];
        if (
          opts.index === undefined &&
          opts.phase &&
          type !== 'section' &&
          before &&
          before.type !== 'section' &&
          phaseAt(s.fields, at - 1) === opts.phase
        ) {
          field.section = before.section;
        }
        const next = [...s.fields];
        next.splice(Math.max(0, Math.min(at, next.length)), 0, field);
        return { ...s, fields: renumber(next), selected: id, next: s.next + 1 };
      });
    },
    [takenBy],
  );

  const selectField = useCallback((key: string | null) => {
    setState((s) => ({
      ...s,
      selected: key === null ? null : (s.fields.find((f) => f.key === key)?.id ?? s.selected),
    }));
  }, []);

  const updateField = useCallback(
    (key: string, patch: FieldPatch) => {
      setState((s) => {
        const index = s.fields.findIndex((f) => f.key === key);
        if (index === -1) return s;
        const {
          id: _id,
          key: _key,
          ...allowed
        } = patch as FieldPatch & {
          id?: unknown;
          key?: unknown;
        };
        const before = s.fields[index]!;
        let after: FormFieldDefinition = { ...before, ...allowed };
        if (!s.saved.has(before.id)) {
          after = {
            ...after,
            key: keyFromLabel(after.label, after.phase, after.type, takenBy(s, before.id)),
          };
        }
        // In the same update, what referred to the old key follows the new one.
        const next =
          after.key === before.key
            ? [...s.fields]
            : s.fields.map((f) => renameReferences(f, before.key, after.key));
        next[index] = after;
        return { ...s, fields: next };
      });
    },
    [takenBy],
  );

  const reorder = useCallback((from: number, to: number) => {
    setState((s) => {
      if (from === to || !s.fields[from] || to < 0 || to >= s.fields.length) return s;
      const next = [...s.fields];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return { ...s, fields: renumber(next) };
    });
  }, []);

  const removeField = useCallback((key: string) => {
    setState((s) => {
      const gone = s.fields.find((f) => f.key === key);
      if (!gone) return s;
      return {
        ...s,
        fields: renumber(s.fields.filter((f) => f !== gone)),
        selected: s.selected === gone.id ? null : s.selected,
      };
    });
  }, []);

  /**
   * The whole live set at once (Edit as JSON, task 1.31): in the order given, renumbered. The
   * baseline and the saved ids stay, so a saved field matched by its id keeps its permanent key
   * and the next save is the usual whole-set save. The selection follows its key.
   */
  const replaceFields = useCallback((next: readonly FormFieldDefinition[]) => {
    setState((s) => {
      const fields = renumber(next.map((f) => ({ ...f, deprecated: false })));
      const selectedKey = s.fields.find((f) => f.id === s.selected)?.key;
      return { ...s, fields, selected: fields.find((f) => f.key === selectedKey)?.id ?? null };
    });
  }, []);

  /** The server's answer to a save: the version's rows, deprecated ones included. */
  const markSaved = useCallback((rows: readonly FormFieldDefinition[]) => {
    setState((s) => stateFrom(rows, s.fields.find((f) => f.id === s.selected)?.key ?? null));
  }, []);

  /** The whole live set, as `saveDraftFields` takes it (with `id` on every saved field). */
  const toSaveInput = useCallback(
    () => state.fields.map((f) => toInput(f, state.saved)),
    [state.fields, state.saved],
  );

  /** Sends the whole live set through `write`; its rows (if any) become the new baseline. */
  const save = useCallback(
    async (write: (fields: FormFieldInput[]) => Promise<readonly FormFieldDefinition[] | null>) => {
      const rows = await write(toSaveInput());
      if (rows) markSaved(rows);
    },
    [toSaveInput, markSaved],
  );

  const baselineLive = useMemo(
    () => baseline.filter((f) => !f.deprecated).sort((a, b) => a.display_order - b.display_order),
    [baseline],
  );

  const dirty = useMemo(() => {
    const now = fields.map((f) => toInput(f, saved));
    const was = renumber(baselineLive).map((f) => toInput(f, saved));
    return JSON.stringify(now) !== JSON.stringify(was);
  }, [fields, baselineLive, saved]);

  const willForkNewVersion = useMemo(
    () =>
      initial.is_locked &&
      isStructuralChange(
        baseline,
        fields.map(({ id: _id, ...draft }) => draft),
      ),
    [initial.is_locked, baseline, fields],
  );

  const issues = useMemo(() => {
    const byKey = new Map<string, FormIssue[]>();
    for (const field of fields) byKey.set(field.key, fieldIssues(field, fields));
    return byKey;
  }, [fields]);

  const issuesFor = useCallback((key: string): FormIssue[] => issues.get(key) ?? [], [issues]);

  const incomplete = useMemo<IncompleteField[]>(
    () =>
      fields
        .filter((f) => (issues.get(f.key) ?? []).length > 0)
        .map((f) => ({ key: f.key, label: f.label, issues: issues.get(f.key)! })),
    [fields, issues],
  );

  /** A form with no data field cannot be published (DEVIATIONS 1.27 decision D). */
  const hasDataField = fields.some((f) => f.type !== 'section');

  const selectedField = fields.find((f) => f.id === selected) ?? null;

  return {
    fields,
    /** Every row of the version as loaded, deprecated ones included. */
    baseline,
    selectedKey: selectedField?.key ?? null,
    selectedField,
    isSaved: (field: FormFieldDefinition) => saved.has(field.id),
    addField,
    selectField,
    updateField,
    reorder,
    removeField,
    replaceFields,
    markSaved,
    toSaveInput,
    save,
    dirty,
    willForkNewVersion,
    issuesFor,
    incomplete,
    hasDataField,
  };
}

export type BuilderState = ReturnType<typeof useBuilderState>;
