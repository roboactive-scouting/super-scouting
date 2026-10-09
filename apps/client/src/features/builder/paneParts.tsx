import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useState, type ComponentProps, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/utils';

/*
 * The settings pane's small parts (design 12-form-builder, "Settings pane"; builder.css
 * `.fb-grp`, `.fb-f`): a group with its heading, a labelled control with "required" and
 * "Needed to publish", and a number box that keeps what is being typed.
 */

/** A group's heading row: 13.5 px / 750, a muted note beside it, something at the end. */
export function PaneGroup({
  title,
  sub,
  aside,
  fold,
  disabled = false,
  children,
}: {
  title: string;
  sub?: ReactNode;
  aside?: ReactNode;
  /** A group that folds to one line once it is complete (Field, Meaning). */
  fold?: { open: boolean; onToggle: () => void; summary: string };
  /** Read-only: every control in the group is held (a disabled fieldset). */
  disabled?: boolean;
  children?: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-none flex-col gap-2.5 pt-3 not-first:mt-3 not-first:border-t not-first:border-line-2"
    >
      <div className="flex min-h-6 items-center gap-2">
        <h3 id={headingId} className="text-[0.84375rem] font-[750]">
          {fold ? (
            <button
              type="button"
              aria-expanded={fold.open}
              onClick={fold.onToggle}
              className="-ms-1 inline-flex min-h-6 items-center gap-1.5 rounded-sm"
            >
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  'size-3.5 text-muted motion-safe:transition-transform',
                  !fold.open && '-rotate-90',
                )}
              />
              {title}
            </button>
          ) : (
            title
          )}
        </h3>
        {sub && <span className="text-xs text-muted">{sub}</span>}
        {aside && <span className="ms-auto flex items-center gap-2">{aside}</span>}
      </div>
      {fold && !fold.open ? (
        <p className="text-[0.78125rem] text-muted" dir="auto">
          {fold.summary}
        </p>
      ) : (
        <fieldset disabled={disabled} className="contents">
          {children}
        </fieldset>
      )}
    </section>
  );
}

/** "✓ Complete", in `--accent-ink`, at the end of a group's heading row. */
export function CompleteMark() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-[650] text-accent-ink">
      <Check aria-hidden="true" className="size-3.5" />
      Complete
    </span>
  );
}

/**
 * One control with its label (12 px / 650), a muted "required" beside it, and — when a required
 * control is blank — "Needed to publish" in `--warn` at the end of the line, linked to the
 * control by `needId`. A control that names itself (a radiogroup) passes no `htmlFor`.
 */
export function PaneRow({
  label,
  htmlFor,
  required = false,
  needId,
  hint,
  hintId,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  /** Set when the required control is blank: the id of the "Needed to publish" line. */
  needId?: string;
  hint?: ReactNode;
  hintId?: string;
  className?: string;
  children: ReactNode;
}) {
  const Tag = htmlFor ? 'label' : 'span';
  return (
    <div className={cn('flex min-w-0 flex-col gap-[5px]', className)}>
      <div className="flex items-baseline gap-1.5 text-xs font-[650] text-ink-2">
        <Tag htmlFor={htmlFor}>{label}</Tag>
        {required && <span className="text-[0.71875rem] font-semibold text-muted">required</span>}
        {needId && (
          <span id={needId} className="ms-auto text-[0.71875rem] font-bold text-warn">
            Needed to publish
          </span>
        )}
      </div>
      {children}
      {hint && (
        <p id={hintId} className="text-xs leading-snug text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * A segmented control in the pane: dimmed in a held group (the fieldset disables its segments),
 * and with the 2 px `--warn` ring of a blank required control (`.fb-seg.need`).
 */
export function PaneSegmented<K extends string>({
  need = false,
  ...props
}: ComponentProps<typeof Segmented<K>> & { need?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-control has-[:disabled]:opacity-50',
        need && 'shadow-[0_0_0_2px_var(--warn)]',
      )}
    >
      <Segmented<K> {...props} />
    </div>
  );
}

/** The 2 px `--warn` edge of a blank required control (`.fb-in.need`). */
export const NEED_EDGE = 'border-warn shadow-[inset_0_0_0_1px_var(--warn)]';

const format = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : String(value);
const parse = (text: string): number | null | 'bad' => {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : 'bad';
};

/**
 * A number box that keeps what is being typed ("1.", "-") and reports a number only when the
 * text is one: blank reports null. `min` refuses anything below it (points are never
 * negative), `positive` refuses 0 and below (a step), `integer` a fraction; each is shown as
 * invalid until fixed. An outside change to `value` replaces the text.
 */
export function NumberInput({
  value,
  onValue,
  min,
  positive = false,
  integer = false,
  className,
  selectOnFocus = false,
  ...rest
}: {
  value: number | null | undefined;
  onValue: (value: number | null) => void;
  min?: number;
  positive?: boolean;
  integer?: boolean;
  className?: string;
  selectOnFocus?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => format(value));
  useEffect(() => {
    setText((t) => (parse(t) === (value ?? null) ? t : format(value)));
  }, [value]);
  const refused = (n: number) =>
    (min !== undefined && n < min) || (positive && n <= 0) || (integer && !Number.isInteger(n));
  const parsed = parse(text);
  const bad = parsed === 'bad' || (parsed !== null && refused(parsed));
  return (
    <Input
      {...rest}
      mono
      inputMode={integer ? 'numeric' : 'decimal'}
      autoComplete="off"
      value={text}
      aria-invalid={bad || undefined}
      className={className}
      onFocus={selectOnFocus ? (e) => e.currentTarget.select() : undefined}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        const n = parse(next);
        if (n === 'bad' || (n !== null && refused(n))) return;
        onValue(n);
      }}
    />
  );
}
