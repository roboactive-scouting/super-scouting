import { useId } from 'react';
import type { FieldUnit, FormFieldDefinition } from '@frc/shared';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FieldLabel, FieldRow, ProblemLine, useFieldMark } from './FieldRow';

/** The unit at the input's right edge: only those that read as a word after a number. */
const UNIT_WORD: Partial<Record<FieldUnit, string>> = { seconds: 'seconds', points: 'points' };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * A free number (SPEC-FINAL 5.2, entry parts "Number"): the 48 px input in mono, its unit in
 * `--muted` at the right, and the expected range under it as a hint ("Between 3 and 60").
 * Emptied, it holds nothing (`undefined`), never a 0 the scout did not type. Out of range
 * (task 1.36) it is marked as it is typed: a 2 px `--warn` edge on `--warn-tint` and one
 * `--warn` line naming the limit in place of the hint. The value is kept. Never red.
 */
export function NumberInput({
  field,
  value,
  onChange,
}: {
  field: FormFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  const unitId = `${id}-unit`;
  const rangeId = `${id}-range`;
  const unit = field.unit ? UNIT_WORD[field.unit] : undefined;
  const range = field.expected_range;
  const mark = useFieldMark();
  const problem = mark?.problem ?? null;
  const described = [
    field.help_text && helpId,
    unit && unitId,
    problem ? mark?.id : range && rangeId,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <FieldRow label={<FieldLabel field={field} htmlFor={id} helpId={helpId} />} ownsProblem>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          mono
          min={num(field.config.min)}
          max={num(field.config.max)}
          step={num(field.config.step) ?? 'any'}
          autoComplete="off"
          aria-describedby={described || undefined}
          aria-invalid={problem ? true : undefined}
          className={cn(
            'text-lg font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
            unit && 'pe-20',
            // 2 px of --warn without moving the text (the border plus a 1 px inset), focused too.
            problem &&
              'border-warn bg-warn-tint shadow-[inset_0_0_0_1px_var(--warn)] focus-visible:border-warn focus-visible:shadow-[inset_0_0_0_1px_var(--warn)]',
          )}
          value={num(value) ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            const next = raw === '' ? undefined : Number(raw);
            onChange(next !== undefined && Number.isFinite(next) ? next : undefined);
          }}
        />
        {unit && (
          <span
            id={unitId}
            className={cn(
              'pointer-events-none absolute inset-y-0 end-3 flex items-center text-[0.8125rem]',
              problem ? 'text-ink-2' : 'text-muted',
            )}
          >
            {unit}
          </span>
        )}
      </div>
      {problem ? (
        <ProblemLine id={mark?.id}>{problem}</ProblemLine>
      ) : (
        range && (
          <p id={rangeId} className="mt-1.5 text-xs text-muted">
            Between {range.min} and {range.max}
          </p>
        )
      )}
    </FieldRow>
  );
}
