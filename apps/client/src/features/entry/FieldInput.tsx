import { useId, useMemo } from 'react';
import type { FormFieldDefinition } from '@frc/shared';
import { selectOptions } from '@frc/shared';
import { Counter } from '@/components/ui/counter';
import { OptionButtons } from '@/components/ui/option-buttons';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ComputedValue } from './inputs/ComputedValue';
import { CyclePathInput, EventLogInput, PositionInput, TimerInput } from './lazyParts';
import {
  FieldLabel,
  FieldMarkContext,
  FieldRow,
  ProblemLine,
  ROW,
  type FieldMark,
} from './inputs/FieldRow';
import { MultiSelectInput } from './inputs/MultiSelectInput';
import { NumberInput } from './inputs/NumberInput';
import { RatingInput } from './inputs/RatingInput';
import { SectionHeading } from './inputs/SectionHeading';
import { ShortTextInput } from './inputs/ShortTextInput';

type Props = {
  field: FormFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  /**
   * The entry's current values, by field key: what a computed field is worked out from
   * (SPEC-FINAL 5.7), so it follows the scout's taps. Other types ignore it.
   */
  siblingValues?: Record<string, unknown>;
  /**
   * What the entry form says under this field (task 1.36): a value out of range as it is typed
   * ("Most is 60 seconds — check this number"), or, once Review entry has been pressed, a missed
   * required field ("Required — pick one") or a stopwatch left running. Amber, never red.
   */
  problem?: string | null;
};

const NO_VALUES: Record<string, unknown> = {};

/**
 * One field of the entry form, by type (SPEC-FINAL 5.2; entry parts, task 1.33). Big touch
 * targets, never a keyboard where a counter will do (8.6, 17.7). On a phone (and in the
 * builder's 410 px canvas and Try it) a field's name sits above its control; once the row's own
 * box is wide (the desktop Entry card) it is one row, name left and control in a 440 px column
 * right — a container query, never the window's width (UF.18). The timer and the event log came
 * with task 1.34, the position picker and the cycle path with 1.35: a map field is one map
 * button here, and its map (like the event log's "where?") is a pop-up, never drawn inline.
 */
export function FieldInput(props: Props) {
  const markId = useId();
  const { key } = props.field;
  const problem = props.problem ?? null;
  const mark = useMemo<FieldMark>(() => ({ key, problem, id: markId }), [key, problem, markId]);
  // Each input's FieldRow reads the mark: the row's data-field (Go to finds it) and the line.
  return (
    <FieldMarkContext value={mark}>
      <FieldControl {...props} mark={mark} />
    </FieldMarkContext>
  );
}

function FieldControl({
  field,
  value,
  onChange,
  siblingValues = NO_VALUES,
  mark,
}: Props & { mark: FieldMark }) {
  const id = useId();
  switch (field.type) {
    case 'counter': {
      const current = typeof value === 'number' ? value : 0;
      const step = typeof field.config.step === 'number' ? field.config.step : 1;
      // Entry README: label and hint on the left, a compact − / value / + on the right, at the
      // right edge on a computer too (entry parts, "Counters stay at the right edge").
      return (
        <div className={ROW} data-field={mark.key}>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel field={field} />
            <Counter label={field.label} value={current} step={step} onChange={onChange} />
          </div>
          {mark.problem && <ProblemLine id={mark.id}>{mark.problem}</ProblemLine>}
        </div>
      );
    }
    case 'toggle':
      return (
        <div className={ROW} data-field={mark.key}>
          <Switch label={field.label} checked={value === true} onChange={onChange} />
        </div>
      );
    case 'single_select': {
      const options = selectOptions(field);
      return (
        <FieldRow label={<FieldLabel field={field} />}>
          <OptionButtons
            legend={field.label}
            showLegend={false}
            name={field.key}
            value={typeof value === 'string' ? value : null}
            options={options.map((o) => ({ value: o.value, label: o.label }))}
            columns={options.length > 2 ? 4 : 2}
            onChange={onChange}
          />
        </FieldRow>
      );
    }
    case 'multi_select':
      return <MultiSelectInput field={field} value={value} onChange={onChange} />;
    case 'number':
      return <NumberInput field={field} value={value} onChange={onChange} />;
    case 'rating':
      return <RatingInput field={field} value={value} onChange={onChange} />;
    case 'short_text':
      return <ShortTextInput field={field} value={value} onChange={onChange} />;
    case 'long_text':
      return (
        <FieldRow label={<FieldLabel field={field} htmlFor={id} helpId={`${id}-help`} />}>
          <Textarea
            id={id}
            dir="auto"
            rows={3}
            aria-describedby={field.help_text ? `${id}-help` : undefined}
            className="min-h-[5.25rem] rounded-control border-control-border bg-surface text-ink focus-visible:border-accent"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </FieldRow>
      );
    case 'computed':
      return <ComputedValue field={field} siblingValues={siblingValues} />;
    case 'section':
      return <SectionHeading field={field} />;
    case 'timer':
      return <TimerInput field={field} value={value} onChange={onChange} />;
    case 'event_log':
      return <EventLogInput field={field} value={value} onChange={onChange} />;
    case 'position':
      return <PositionInput field={field} value={value} onChange={onChange} />;
    case 'cycle_path':
      return <CyclePathInput field={field} value={value} onChange={onChange} />;
    default:
      return null;
  }
}
