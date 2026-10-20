import { Filter, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import {
  selectOptions,
  type FormFieldDefinition,
  type FormIssue,
  type VisibilityCondition,
} from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { IssueLines } from './ConfigFields';
import { NumberInput, PANE_PAIR, PaneGroup, PaneRow } from './paneParts';
import type { PanePatch } from './SettingsPane';

/*
 * Show when (SPEC-FINAL 5.8; design "Show when"): one condition, never a list —
 * `<field> <op> <value>`, the operators in ASCII. Until a field and a value are chosen nothing
 * is written: the condition stays null and the field always shows.
 */

type Op = VisibilityCondition['op'];
const ALL_OPS: readonly Op[] = ['=', '!=', '>', '<', '>=', '<='];
const EQUALITY: readonly Op[] = ['=', '!='];

const NUMERIC = new Set(['counter', 'number', 'rating', 'timer']);
/** What a condition can compare: one value, so never a list-valued field. */
const TARGETS = new Set([
  'counter',
  'number',
  'rating',
  'timer',
  'toggle',
  'single_select',
  'short_text',
  'long_text',
  'computed',
]);

const isNumeric = (f: FormFieldDefinition | undefined) =>
  !!f && (NUMERIC.has(f.type) || (f.type === 'computed' && f.config.result_type === 'float'));

type Draft = { key: string | null; op: Op; value: unknown };

export function ShowWhenFields({
  field,
  allFields,
  onChange,
  editable,
  issues,
}: {
  field: FormFieldDefinition;
  allFields: readonly FormFieldDefinition[];
  onChange: (patch: PanePatch) => void;
  editable: boolean;
  issues: readonly FormIssue[];
}) {
  const id = useId();
  const condition = field.visibility_condition;
  const [draft, setDraft] = useState<Draft | null>(() =>
    condition ? { key: condition.field_key, op: condition.op, value: condition.value } : null,
  );
  const targets = allFields.filter(
    (f) => f.key !== field.key && !f.deprecated && TARGETS.has(f.type),
  );
  const target = targets.find((f) => f.key === draft?.key);
  const ops = isNumeric(target) ? ALL_OPS : EQUALITY;

  const write = (next: Draft | null) => {
    setDraft(next);
    const complete =
      next !== null &&
      next.key !== null &&
      next.value !== null &&
      next.value !== undefined &&
      next.value !== '';
    onChange({
      visibility_condition: complete
        ? { field_key: next.key!, op: next.op, value: next.value }
        : null,
    });
  };

  const pick = (key: string) => {
    const f = targets.find((t) => t.key === key);
    if (!f) return write({ key: null, op: '=', value: null });
    // A yes / no or a choice starts on its first answer; a number or text waits to be typed.
    const value =
      f.type === 'toggle'
        ? true
        : f.type === 'single_select'
          ? (selectOptions(f)[0]?.value ?? null)
          : null;
    const op = isNumeric(f) || EQUALITY.includes(draft?.op ?? '=') ? (draft?.op ?? '=') : '=';
    write({ key, op, value });
  };

  let valueControl: ReactNode = null;
  if (draft && target) {
    if (target.type === 'toggle') {
      valueControl = (
        <Select
          id={`${id}-value`}
          value={draft.value === false ? 'no' : 'yes'}
          onChange={(e) => write({ ...draft, value: e.target.value === 'yes' })}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      );
    } else if (target.type === 'single_select') {
      valueControl = (
        <Select
          id={`${id}-value`}
          value={typeof draft.value === 'string' ? draft.value : ''}
          onChange={(e) => write({ ...draft, value: e.target.value })}
        >
          {selectOptions(target).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    } else if (isNumeric(target)) {
      valueControl = (
        <NumberInput
          id={`${id}-value`}
          value={typeof draft.value === 'number' ? draft.value : null}
          onValue={(n) => write({ ...draft, value: n })}
        />
      );
    } else {
      valueControl = (
        <Input
          id={`${id}-value`}
          dir="auto"
          value={typeof draft.value === 'string' ? draft.value : ''}
          onChange={(e) => write({ ...draft, value: e.target.value })}
        />
      );
    }
  }

  return (
    <PaneGroup title="Show when" sub="one condition" disabled={!editable}>
      {draft === null ? (
        <Button
          onClick={() => setDraft({ key: null, op: '=', value: null })}
          className="min-h-12 justify-start border-dashed px-3 text-[0.8125rem] text-ink-2 [&_svg]:size-[15px] [&_svg]:text-muted"
        >
          <Filter aria-hidden="true" />
          Show this field only when…
        </Button>
      ) : (
        <>
          <div className={`${PANE_PAIR} grid-cols-[1fr_5.5rem]`}>
            <PaneRow label="When field" htmlFor={`${id}-field`}>
              <Select
                id={`${id}-field`}
                value={draft.key ?? ''}
                onChange={(e) => pick(e.target.value)}
              >
                <option value="">—</option>
                {targets.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label} ({f.key})
                  </option>
                ))}
              </Select>
            </PaneRow>
            <PaneRow label="Is" htmlFor={`${id}-op`}>
              <Select
                id={`${id}-op`}
                className="font-num"
                value={draft.op}
                onChange={(e) => write({ ...draft, op: e.target.value as Op })}
              >
                {ops.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </Select>
            </PaneRow>
          </div>
          {valueControl && (
            <PaneRow label="Value" htmlFor={`${id}-value`}>
              {valueControl}
            </PaneRow>
          )}
          <div className="flex items-center gap-2">
            <p className="flex-1 text-xs leading-snug text-muted">
              {condition
                ? 'A hidden field records no value.'
                : 'Until a field and a value are chosen, this field always shows.'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => write(null)}
              className="gap-1 px-1.5 text-[0.8125rem] font-[650] [&_svg]:size-4"
            >
              <X aria-hidden="true" />
              Remove the condition
            </Button>
          </div>
        </>
      )}
      <IssueLines issues={issues.filter((i) => i.path === 'visibility_condition')} />
    </PaneGroup>
  );
}
