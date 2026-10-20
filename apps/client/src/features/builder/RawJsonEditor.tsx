import { Check, Copy } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import {
  definitionScoringRule,
  FIELD_TYPE_CONFIG,
  FORM_FIELDS_MAX,
  formFieldDraft,
  validateExpr,
  validateFieldDefinition,
  validateScoringRules,
  validateVisibilityCondition,
  type DefinitionScoringRule,
  type Expr,
  type FormFieldDefinition,
} from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Notice } from '@/components/ui/notice';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { typeName } from './fieldTypes';
import { jsonProblem, lineColumn, problemLine } from './jsonPosition';
import { isZeroRule, ruleLost, type Rule } from './scoringRules';
import { MEANING_PATHS } from './useBuilderState';

/*
 * Edit as JSON (design 12-form-builder, "The remaining screens"; task 1.31): this version's
 * fields and their scoring as text, in the export's own shapes (`formFieldDraft`,
 * `definitionScoringRule`). The form's kind, name and match timer are not in it: the Forms page
 * and Match timer own them. Apply replaces the builder's LOCAL fields and points (unsaved);
 * Save draft then saves them through the usual whole-set paths.
 */

/** A field's columns in the export's order: never an id, a version or a timestamp. */
const DRAFT_COLUMNS = [
  'key',
  'label',
  'help_text',
  'type',
  'section',
  'display_order',
  'required',
  'default_value',
  'config',
  'visibility_condition',
  'description',
  'unit',
  'phase',
  'direction',
  'category',
  'expected_range',
  'include_in_ai_context',
  'is_ordinal',
] as const;

function draftOf(field: FormFieldDefinition): Record<string, unknown> {
  return Object.fromEntries(DRAFT_COLUMNS.map((c) => [c, field[c] ?? null]));
}

/** This version's rules by key, as the export writes them: only what scores, sorted by key. */
function rulesOf(
  fields: readonly FormFieldDefinition[],
  ruleFor: (id: string) => Rule | null,
): DefinitionScoringRule[] {
  return fields
    .flatMap((f) => {
      const rule = ruleFor(f.id);
      if (!rule || isZeroRule(rule) || ruleLost(f.type, rule)) return [];
      return [{ field_key: f.key, points: rule.points, option_points: rule.option_points }];
    })
    .sort((a, b) => (a.field_key < b.field_key ? -1 : a.field_key > b.field_key ? 1 : 0));
}

function definitionText(
  fields: readonly FormFieldDefinition[],
  ruleFor: (id: string) => Rule | null,
): string {
  return JSON.stringify(
    { fields: fields.map(draftOf), scoring_rules: rulesOf(fields, ruleFor) },
    null,
    2,
  );
}

const editable = z
  .object({
    fields: z.array(formFieldDraft).max(FORM_FIELDS_MAX),
    scoring_rules: z.array(definitionScoringRule).max(FORM_FIELDS_MAX),
  })
  .strict();

type JsonCheck =
  | { ok: true; fields: FormFieldDefinition[]; rules: Map<string, Rule> }
  /** `line` is one sentence; `at` the 1-based line to mark, when there is one. */
  | { ok: false; line: string; at: number | null };

type JsonContext = {
  /** The builder's live fields now. */
  live: readonly FormFieldDefinition[];
  /** Every row of the version as loaded, deprecated ones included. */
  baseline: readonly FormFieldDefinition[];
  isSaved: (field: FormFieldDefinition) => boolean;
};

let made = 0;

/** The line holding `"key": "<key>"`, so a problem with a field marks where it is. */
function lineOfKey(text: string, key: unknown): number | null {
  if (typeof key !== 'string') return null;
  const escaped = JSON.stringify(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`"key"\\s*:\\s*${escaped}`).exec(text);
  return match ? lineColumn(text, match.index).line : null;
}

/**
 * Checks the text as the server would check a save, so Apply never hands the builder something
 * the server refuses: valid JSON (the line and column named), the export's shapes, each field
 * by `validateFieldDefinition` and its condition and expression, no saved field's key renamed,
 * no retired key with another type, and the scoring by `validateScoringRules`. A field missing
 * only its meaning passes: a draft saves with it, and Publish waits (SPEC-FINAL 5.4).
 */
function checkDefinitionText(text: string, ctx: JsonContext): JsonCheck {
  const problem = jsonProblem(text);
  if (problem) return { ok: false, line: problemLine(problem), at: problem.line };
  const raw = JSON.parse(text) as unknown;
  const parsed = editable.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    const [head, index, ...rest] = issue.path;
    if (issue.code === 'unrecognized_keys' && issue.path.length === 0) {
      const names = issue.keys.map((k) => `“${k}”`).join(', ');
      return {
        ok: false,
        line: `${names} cannot be edited here: the text holds “fields” and “scoring_rules” only. The form's name belongs to the Forms page and its timer to Match timer.`,
        at: null,
      };
    }
    if (head === 'fields' && typeof index === 'number') {
      const key = (raw as { fields: { key?: unknown }[] }).fields[index]?.key;
      const who = typeof key === 'string' ? `The field “${key}”` : `Field ${index + 1}`;
      return {
        ok: false,
        line: `${who} is not valid: ${rest.join('.') || 'the field'}: ${issue.message}.`,
        at: lineOfKey(text, key),
      };
    }
    return {
      ok: false,
      line: `${issue.path.join('.') || 'The text'}: ${issue.message}.`,
      at: null,
    };
  }

  const liveByKey = new Map(ctx.live.map((f) => [f.key, f]));
  const baseByKey = new Map(ctx.baseline.map((f) => [f.key, f]));
  const seen = new Set<string>();
  const fields: FormFieldDefinition[] = [];
  for (const draft of parsed.data.fields) {
    if (seen.has(draft.key)) {
      return {
        ok: false,
        line: `Two fields have the key “${draft.key}”. A key names one field.`,
        at: lineOfKey(text, draft.key),
      };
    }
    seen.add(draft.key);
    const was = baseByKey.get(draft.key);
    if (was?.deprecated && was.type !== draft.type) {
      return {
        ok: false,
        line: `The key “${draft.key}” belonged to a removed ${typeName(was.type).toLowerCase()} field of this form. Bring it back as a ${typeName(was.type).toLowerCase()}, or give the field another key.`,
        at: lineOfKey(text, draft.key),
      };
    }
    const id = liveByKey.get(draft.key)?.id ?? was?.id ?? `json-${++made}`;
    fields.push({ id, ...draft, deprecated: false } as FormFieldDefinition);
  }

  // A saved field's key never changes (SPEC-FINAL 5.1). Fields are matched by key, so a saved
  // key that is gone is a removed field — unless a field with a key this version never had
  // matches it in type, label, phase AND section: that is the same field renamed, and refused.
  // Anything less is a removal and an addition (two phases share "Pieces scored high").
  for (const saved of ctx.live.filter((f) => ctx.isSaved(f) && !seen.has(f.key))) {
    const renamed = fields.find(
      (f) =>
        f.type === saved.type &&
        f.label === saved.label &&
        (f.phase ?? null) === (saved.phase ?? null) &&
        (f.section ?? null) === (saved.section ?? null) &&
        !baseByKey.has(f.key) &&
        !liveByKey.has(f.key),
    );
    if (renamed) {
      return {
        ok: false,
        line: `The field “${saved.label}” has the key “${saved.key}”, and a saved field's key never changes. Put “${saved.key}” back as its key.`,
        at: lineOfKey(text, renamed.key),
      };
    }
  }

  for (const field of fields) {
    const issues = [
      ...validateFieldDefinition(field).filter((i) => !MEANING_PATHS.has(i.path)),
      ...validateVisibilityCondition(field, fields),
    ];
    if (field.type === 'computed') {
      const config = FIELD_TYPE_CONFIG.computed.safeParse(field.config);
      const data = config.success
        ? (config.data as { expression: Expr | null; result_type: 'float' | 'string' })
        : null;
      if (data?.expression) {
        for (const i of validateExpr(data.expression, fields, data.result_type)) {
          issues.push({ path: `config.${i.path}`, message: i.message });
        }
      }
    }
    const first = issues[0];
    if (first) {
      return {
        ok: false,
        line: `The field “${field.key}” is refused: ${first.path}: ${first.message}.`,
        at: lineOfKey(text, field.key),
      };
    }
  }

  const scoring = validateScoringRules(parsed.data.scoring_rules, fields, {
    prefix: 'scoring_rules',
    noun: 'form',
  });
  if (scoring[0]) {
    return {
      ok: false,
      line: `The scoring of “${scoring[0].field_key}” is refused: ${scoring[0].message}.`,
      at: null,
    };
  }
  const rules = new Map<string, Rule>(
    parsed.data.scoring_rules.map((r) => [
      r.field_key,
      { points: r.points, option_points: r.option_points },
    ]),
  );
  return { ok: true, fields, rules };
}

/** The editor's line height and top padding in px: the marked line's band is placed by them. */
const LINE = 20;
const PAD = 10;

/**
 * The Edit as JSON dialog: a line-numbered mono editor, the problem named by line and column
 * with that line marked by a `--warn` edge, Copy all, and Apply — disabled until the text is a
 * valid form. Nothing changes until Apply.
 */
export function RawJsonEditor({
  versionName,
  fields,
  baseline,
  isSaved,
  ruleFor,
  online,
  onApply,
  onClose,
}: {
  /** "Draft v4", "v3 · active". */
  versionName: string;
  fields: readonly FormFieldDefinition[];
  baseline: readonly FormFieldDefinition[];
  isSaved: (field: FormFieldDefinition) => boolean;
  ruleFor: (id: string) => Rule | null;
  online: boolean;
  onApply: (fields: FormFieldDefinition[], rules: Map<string, Rule>) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(() => definitionText(fields, ruleFor));
  const [scrollTop, setScrollTop] = useState(0);
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const describe = useId();
  const errorId = useId();
  const check = useMemo(
    () => checkDefinitionText(text, { live: fields, baseline, isSaved }),
    // The builder's fields do not change while the dialog is open.
    [text],
  );
  const lines = text.split('\n').length;
  const dataFields = fields.filter((f) => f.type !== 'section').length;
  const bad = check.ok ? null : check.at;

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard here: select it all, so Ctrl+C copies it.
      area.current?.select();
    }
  }

  return (
    <Dialog
      open
      title="Edit as JSON"
      onClose={onClose}
      width={1000}
      describedBy={describe}
      initialFocus={area}
      footer={
        <>
          <Button className="me-auto" onClick={() => void copyAll()}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy all'}
          </Button>
          {!online && (
            <span className="self-center text-[0.8125rem] text-muted">
              You're offline: Apply waits for the connection.
            </span>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!check.ok || !online}
            onClick={() => {
              if (check.ok) onApply(check.fields, check.rules);
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <p id={describe} className="-mt-2 text-[0.84375rem] text-muted">
        The whole form as text, for bulk edits. Nothing changes until you apply, and text that isn't
        a valid form is refused.
      </p>
      <div className="flex flex-wrap items-baseline gap-x-3 text-[0.8125rem] text-muted">
        <b className="font-bold text-ink">{versionName}</b>
        <span>
          {dataFields} {dataFields === 1 ? 'field' : 'fields'} · {lines} lines
        </span>
        <span className="ms-auto">
          Keys can't change here either: a renamed key is refused. The list's order is the form's
          order.
        </span>
      </div>
      <div className="relative flex h-[min(52vh,560px)] overflow-hidden rounded-control border border-control-border bg-surface focus-within:border-accent">
        <div
          aria-hidden="true"
          className="w-12 flex-none overflow-hidden border-e border-line-2 bg-bg font-num text-[0.75rem] leading-5 text-muted select-none"
        >
          <div style={{ transform: `translateY(${PAD - scrollTop}px)` }}>
            {Array.from({ length: lines }, (_, i) => (
              <div
                key={i}
                data-bad-line={bad === i + 1 ? '' : undefined}
                className={cn('pe-2.5 text-end', bad === i + 1 && 'font-bold text-warn')}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>
        <div className="relative min-w-0 flex-1">
          {bad !== null && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 border-s-[3px] border-warn bg-warn-tint"
              style={{ top: PAD + (bad - 1) * LINE - scrollTop, height: LINE }}
            />
          )}
          <Textarea
            ref={area}
            aria-label="The form as JSON"
            aria-invalid={!check.ok || undefined}
            aria-describedby={check.ok ? undefined : errorId}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            dir="ltr"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            className="relative h-full min-h-0 resize-none overflow-auto rounded-none border-0 bg-transparent px-3 py-2.5 font-num text-[0.78125rem] leading-5 whitespace-pre focus-visible:shadow-none"
          />
        </div>
      </div>
      {!check.ok && (
        <Notice tone="danger" role="alert" id={errorId} still>
          <b className="font-bold">{check.line}</b> Nothing was changed. Fix it, then apply again.
        </Notice>
      )}
    </Dialog>
  );
}
