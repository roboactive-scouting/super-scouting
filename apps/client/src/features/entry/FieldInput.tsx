import { useId } from 'react';
import type { FormFieldDefinition } from '@frc/shared';
import { selectOptions } from '@frc/shared';
import { Counter } from '@/components/ui/counter';
import { OptionButtons } from '@/components/ui/option-buttons';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  field: FormFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
};

/** One field row of a phase pane: 12 px above and below, a `--line-2` rule between rows. */
const ROW = 'border-t border-line-2 py-3 first:border-t-0';

/** Big touch targets, never a keyboard where a counter will do (SPEC-FINAL 8.6, 17.7). */
export function FieldInput({ field, value, onChange }: Props) {
  const id = useId();
  switch (field.type) {
    case 'counter': {
      const current = typeof value === 'number' ? value : 0;
      const step = typeof field.config.step === 'number' ? field.config.step : 1;
      // Entry README: label and hint on the left, a compact − / value / + on the right.
      return (
        <div className={`${ROW} flex items-center justify-between gap-3`}>
          <div className="min-w-0">
            <span className="block text-[0.90625rem] font-semibold text-ink" dir="auto">
              {field.label}
            </span>
            {field.help_text && (
              <span className="mt-0.5 block text-[0.78125rem] text-muted" dir="auto">
                {field.help_text}
              </span>
            )}
          </div>
          <Counter label={field.label} value={current} step={step} onChange={onChange} />
        </div>
      );
    }
    case 'toggle':
      return (
        <div className={ROW}>
          <Switch label={field.label} checked={value === true} onChange={onChange} />
        </div>
      );
    case 'single_select': {
      const options = selectOptions(field);
      return (
        <div className={ROW}>
          <OptionButtons
            legend={field.label}
            name={field.key}
            value={typeof value === 'string' ? value : null}
            options={options.map((o) => ({ value: o.value, label: o.label }))}
            columns={options.length > 2 ? 4 : 2}
            onChange={onChange}
          />
        </div>
      );
    }
    case 'long_text':
      return (
        <div className={ROW}>
          <label htmlFor={id} className="block text-[0.90625rem] font-semibold text-ink" dir="auto">
            {field.label}
          </label>
          <Textarea
            id={id}
            dir="auto"
            rows={3}
            className="mt-2 min-h-[5.25rem] rounded-control border-control-border bg-surface text-ink focus-visible:border-accent"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
  }
}
