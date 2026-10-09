import type { FormFieldDefinition } from '@frc/shared';
import { FieldInput } from '@/features/entry/FieldInput';

/**
 * The types the entry form's `FieldInput` draws today. The rest arrive with tasks 1.33–1.35;
 * until then the builder draws a neutral placeholder for them (DEVIATIONS 1.29).
 */
export const DRAWN_TYPES: ReadonlySet<string> = new Set([
  'counter',
  'toggle',
  'single_select',
  'long_text',
]);

const noop = () => undefined;

/**
 * One field as the scouter's phone shows it: the real entry control (`FieldInput`) where it
 * exists, a section's heading, or — for a type the phone cannot draw yet — a neutral card with
 * the label and the line saying when it will.
 */
export function FieldPreview({ field }: { field: FormFieldDefinition }) {
  if (field.type === 'section') {
    return (
      <p className="text-base font-[750] text-ink" dir="auto">
        {field.label}
      </p>
    );
  }
  if (DRAWN_TYPES.has(field.type)) {
    return <FieldInput field={field} value={field.default_value ?? undefined} onChange={noop} />;
  }
  return (
    <div className="rounded-control border border-dashed border-control-border bg-bg px-3 py-2.5">
      <p className="text-[0.90625rem] font-semibold text-ink" dir="auto">
        {field.label}
      </p>
      {field.help_text && (
        <p className="mt-0.5 text-[0.78125rem] text-muted" dir="auto">
          {field.help_text}
        </p>
      )}
      <p className="mt-1 text-[0.78125rem] text-muted">
        Shown on the phone once tasks 1.33–1.35 land
      </p>
    </div>
  );
}
