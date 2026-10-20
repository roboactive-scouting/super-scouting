import type { FormFieldDefinition } from '@frc/shared';

/**
 * A section (SPEC-FINAL 5.2: layout only, it holds no data), entry parts "Section": a 12 px
 * uppercase `--muted` heading followed by a 1 px `--line` rule. The field after it has no rule of
 * its own, as in the design.
 */
export function SectionHeading({ field }: { field: FormFieldDefinition }) {
  return (
    <div className="flex items-center gap-2.5 pt-4 pb-1 [&+*]:border-t-0">
      <h3
        className="text-xs font-[750] tracking-[0.06em] text-muted uppercase [overflow-wrap:anywhere]"
        dir="auto"
      >
        {field.label}
      </h3>
      <span aria-hidden="true" className="h-px min-w-6 flex-1 bg-line" />
    </div>
  );
}
