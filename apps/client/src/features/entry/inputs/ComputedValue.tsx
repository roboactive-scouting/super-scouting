import { Calculator } from 'lucide-react';
import { useId } from 'react';
import {
  evaluateExpr,
  formatCount,
  formatMetric,
  NO_VALUE,
  type Expr,
  type ExprValue,
  type FormFieldDefinition,
} from '@frc/shared';
import { NAME_TEXT, ROW, ROW_GRID } from './FieldRow';

const OP_WORD = { '+': '+', '-': '−', '*': '×', '/': '÷', concat: 'then' } as const;

/** The formula in words: `auto high + tele high`. A nested operation keeps its brackets. */
export function formulaWords(expr: Expr): string {
  if (expr.kind === 'field') return expr.key.replaceAll('_', ' ');
  if (expr.kind === 'literal') return String(expr.value);
  const side = (e: Expr) =>
    e.kind === 'op' && e.op !== expr.op ? `(${formulaWords(e)})` : formulaWords(e);
  return `${side(expr.left)} ${OP_WORD[expr.op]} ${side(expr.right)}`;
}

/** SPEC-FINAL 17.8: a computed number to 2 places, a whole one with none; nothing yet is a dash. */
export function computedText(value: ExprValue): string {
  if (value === null) return NO_VALUE;
  if (typeof value === 'string') return value === '' ? NO_VALUE : value;
  return Number.isInteger(value) ? formatCount(value) : formatMetric(value);
}

/**
 * A computed field (SPEC-FINAL 5.7, entry parts "Computed"): read-only, worked out from the
 * other fields' current values (`siblingValues`) on every render, so it follows the scout's
 * taps. A grey `--line-2` row: a calculator, the name over the formula in words (the help text
 * where the form gives one), and the value in mono at the right. On a computer the name moves
 * to the row's left column and the grey row says "Worked out" (entry parts desktop).
 */
export function ComputedValue({
  field,
  siblingValues,
}: {
  field: FormFieldDefinition;
  siblingValues: Record<string, unknown>;
}) {
  const nameId = useId();
  const expression = field.config.expression as Expr | null | undefined;
  const value = expression ? evaluateExpr(expression, siblingValues) : null;
  const shown =
    typeof value === 'number' && !Number.isFinite(value) ? NO_VALUE : computedText(value);
  const formula = field.help_text ?? (expression ? formulaWords(expression) : 'No formula yet');
  return (
    <div className={`${ROW} @container`}>
      <div className={ROW_GRID}>
        {/* The row's left column on a computer; the name is read from the grey row's own copy. */}
        <span aria-hidden="true" className={`hidden ${NAME_TEXT} @min-[44rem]:block`} dir="auto">
          {field.label}
        </span>
        <div className="flex min-w-0 items-center gap-2.5 rounded-control bg-line-2 px-3 py-2.5">
          <Calculator aria-hidden="true" className="size-4 shrink-0 text-muted" />
          <span className="min-w-0">
            <span id={nameId} className={`block ${NAME_TEXT} @min-[44rem]:hidden`} dir="auto">
              {field.label}
            </span>
            <span aria-hidden="true" className={`hidden ${NAME_TEXT} @min-[44rem]:block`}>
              Worked out
            </span>
            <span className="block text-xs text-muted" dir="auto">
              <span className="@min-[44rem]:hidden">Worked out: </span>
              {formula}
            </span>
          </span>
          <output
            aria-labelledby={nameId}
            aria-live="polite"
            className="ms-auto shrink-0 font-num text-[1.375rem] font-semibold text-ink-2"
          >
            {shown}
          </output>
        </div>
      </div>
    </div>
  );
}
