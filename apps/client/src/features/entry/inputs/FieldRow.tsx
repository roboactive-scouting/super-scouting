import type { ReactNode } from 'react';
import type { FormFieldDefinition } from '@frc/shared';
import { cn } from '@/lib/utils';

/** One field row of a phase pane: 12 px above and below, a `--line-2` rule between rows. */
export const ROW = 'border-t border-line-2 py-3 first:border-t-0';

/** A field's name: 14.5 px / 600 (Entry final, .flbl). */
export const NAME_TEXT = 'text-[0.90625rem] font-semibold text-ink';

/**
 * One row from 44 rem of the row's own width (UF.18): the desktop Entry card is wider, the phone
 * and the builder's 410 px canvas and Try it narrower, so they stack. Name left, control right.
 */
export const ROW_GRID =
  '@min-[44rem]:grid @min-[44rem]:grid-cols-[minmax(0,1fr)_27.5rem] @min-[44rem]:items-center @min-[44rem]:gap-6';

/**
 * A field's name: the label (a `<label>` when `htmlFor` names its control, else a span with `id`
 * for an `aria-labelledby`), the quiet "Required" beside it (entry parts README), and the help
 * text under it (`helpId`, for an `aria-describedby`).
 */
export function FieldLabel({
  field,
  htmlFor,
  id,
  helpId,
}: {
  field: FormFieldDefinition;
  htmlFor?: string;
  id?: string;
  helpId?: string;
}) {
  const Name = htmlFor ? 'label' : 'span';
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <Name htmlFor={htmlFor} id={id} className={NAME_TEXT} dir="auto">
          {field.label}
        </Name>
        {field.required && (
          <span className="text-[0.71875rem] font-[650] text-muted">Required</span>
        )}
      </div>
      {field.help_text && (
        <p id={helpId} className="mt-0.5 text-[0.78125rem] text-muted" dir="auto">
          {field.help_text}
        </p>
      )}
    </div>
  );
}

/**
 * A field with its name above its control on a phone, and as one row on a computer: the name and
 * hint on the left, the control in a 440 px column on the right (entry parts, "Desktop layout of
 * fields"), so stars and option buttons never stretch across the whole card.
 */
export function FieldRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className={cn(ROW, '@container')}>
      <div className={cn('flex flex-col gap-2', ROW_GRID)}>
        {label}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
