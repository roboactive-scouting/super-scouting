import type { FormFieldDefinition } from '@frc/shared';
import { FieldInput } from '@/features/entry/FieldInput';

const noop = () => undefined;

/**
 * One field as the scouter's phone shows it: the real entry control (`FieldInput`), which draws
 * every type since task 1.35 (a map field is its map button), or a section's heading, which the
 * canvas draws itself rather than `FieldInput`.
 */
export function FieldPreview({ field }: { field: FormFieldDefinition }) {
  if (field.type === 'section') {
    return (
      <p className="text-base font-[750] text-ink" dir="auto">
        {field.label}
      </p>
    );
  }
  return <FieldInput field={field} value={field.default_value ?? undefined} onChange={noop} />;
}
