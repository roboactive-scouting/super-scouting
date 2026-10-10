import { useId } from 'react';
import type { FormFieldDefinition } from '@frc/shared';
import { Input } from '@/components/ui/input';
import { FieldLabel, FieldRow } from './FieldRow';

/** Free text on one line (SPEC-FINAL 5.2, entry parts "Short text"): the 48 px text input. */
export function ShortTextInput({
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
  const max = field.config.max_length;
  return (
    <FieldRow label={<FieldLabel field={field} htmlFor={id} helpId={helpId} />}>
      <Input
        id={id}
        type="text"
        dir="auto"
        autoComplete="off"
        maxLength={typeof max === 'number' ? max : undefined}
        aria-describedby={field.help_text ? helpId : undefined}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldRow>
  );
}
