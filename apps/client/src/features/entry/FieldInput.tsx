import type { FormFieldDefinition } from '@frc/shared';
import { selectOptions } from '@frc/shared';

type Props = {
  field: FormFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
};

/** Big touch targets, never a keyboard where a counter will do (SPEC-FINAL 8.6, 17.7). */
export function FieldInput({ field, value, onChange }: Props) {
  const label = (
    <span className="block text-sm font-medium" dir="auto">
      {field.label}
    </span>
  );

  switch (field.type) {
    case 'counter': {
      const current = typeof value === 'number' ? value : 0;
      const step = typeof field.config.step === 'number' ? field.config.step : 1;
      return (
        <div className="py-3">
          {label}
          <div className="tap-row mt-2 flex items-center">
            <button
              type="button"
              className="tap-target flex-1 rounded-lg border border-[var(--border)] text-2xl"
              aria-label={`${field.label} minus one`}
              onClick={() => onChange(Math.max(0, current - step))}
            >
              −
            </button>
            <output
              aria-label={`${field.label} value`}
              className="tap-target min-w-16 grow-0 basis-20 text-center text-2xl font-semibold leading-[48px]"
            >
              {current}
            </output>
            <button
              type="button"
              className="tap-target flex-1 rounded-lg border border-[var(--border)] text-2xl"
              aria-label={`${field.label} plus one`}
              onClick={() => onChange(current + step)}
            >
              +
            </button>
          </div>
        </div>
      );
    }
    case 'toggle':
      return (
        <label className="tap-target flex items-center justify-between py-3">
          {label}
          <input
            type="checkbox"
            className="h-8 w-14"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
        </label>
      );
    case 'single_select':
      return (
        <fieldset className="py-3">
          <legend className="text-sm font-medium" dir="auto">
            {field.label}
          </legend>
          <div className="tap-row mt-2 flex flex-wrap gap-2">
            {selectOptions(field).map((option) => (
              <label
                key={option.value}
                className="tap-target flex items-center gap-2 rounded-lg border border-[var(--border)] px-3"
              >
                <input
                  type="radio"
                  name={field.key}
                  value={option.value}
                  checked={value === option.value}
                  onChange={() => onChange(option.value)}
                />
                <span dir="auto">{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    case 'long_text':
      return (
        <label className="block py-3">
          {label}
          <textarea
            dir="auto"
            rows={3}
            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
  }
}
