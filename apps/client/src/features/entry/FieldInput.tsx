import { useId } from 'react';
import type { FormFieldDefinition } from '@frc/shared';
import { selectOptions } from '@frc/shared';
import { ChoiceGroup } from '@/components/entry/ChoiceGroup';
import { CounterControl } from '@/components/entry/CounterControl';
import { ToggleField } from '@/components/entry/ToggleField';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  field: FormFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
};

/** Big touch targets, never a keyboard where a counter will do (SPEC-FINAL 8.6, 17.7). */
export function FieldInput({ field, value, onChange }: Props) {
  const id = useId();
  switch (field.type) {
    case 'counter': {
      const current = typeof value === 'number' ? value : 0;
      const step = typeof field.config.step === 'number' ? field.config.step : 1;
      return (
        <div className="py-4">
          <span className="block text-sm font-medium" dir="auto">
            {field.label}
          </span>
          <div className="mt-2">
            <CounterControl label={field.label} value={current} step={step} onChange={onChange} />
          </div>
        </div>
      );
    }
    case 'toggle':
      return (
        <div className="py-2">
          <ToggleField label={field.label} checked={value === true} onChange={onChange} />
        </div>
      );
    case 'single_select':
      return (
        <div className="py-4">
          <ChoiceGroup
            legend={field.label}
            name={field.key}
            value={typeof value === 'string' ? value : null}
            options={selectOptions(field).map((o) => ({ value: o.value, label: o.label }))}
            onChange={onChange}
          />
        </div>
      );
    case 'long_text':
      return (
        <div className="py-4">
          <label htmlFor={id} className="block text-sm font-medium" dir="auto">
            {field.label}
          </label>
          <Textarea
            id={id}
            dir="auto"
            rows={3}
            className="mt-2"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
  }
}
