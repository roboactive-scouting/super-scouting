import { Undo2 } from 'lucide-react';
import { useId, useMemo } from 'react';
import { selectOptions, type FormFieldDefinition } from '@frc/shared';
import { MultiOptionButtons, type MultiChoice } from '@/components/ui/multi-option-buttons';
import { useUndoable } from '../useUndoable';
import { FieldLabel, FieldRow } from './FieldRow';

/**
 * Several choices (SPEC-FINAL 5.2, entry parts "Multi select"): the multi option buttons,
 * "Pick any that apply" under them, and **Undo “Far”**, which takes back the last option
 * toggled and nothing else (8.2: a multi-select's undo pops the last toggle, never a clear-all).
 * The value is the chosen option values, in the form's option order.
 */
export function MultiSelectInput({
  field,
  value,
  onChange,
}: {
  field: FormFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const helpId = `${id}-help`;
  const options = selectOptions(field);
  const held = useMemo(
    () => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []),
    [value],
  );
  const history = useUndoable<string[], string>(held, onChange);
  const chosen = history.value;

  function toggle(option: MultiChoice<string>) {
    const next = new Set(chosen);
    if (next.has(option.value)) next.delete(option.value);
    else next.add(option.value);
    // The form's order, whatever order the scout tapped in.
    history.set(
      options.map((o) => o.value).filter((v) => next.has(v)),
      option.label,
    );
  }

  return (
    <FieldRow label={<FieldLabel field={field} id={labelId} helpId={helpId} />}>
      <MultiOptionButtons
        labelledBy={labelId}
        value={chosen}
        options={options}
        onToggle={toggle}
        foot={
          <div className="mt-2 flex min-h-12 items-center justify-between gap-3 text-xs text-muted">
            <span>Pick any that apply</span>
            {history.canUndo && (
              <button
                type="button"
                onClick={history.undo}
                className="tap-target hover-veil -me-2 inline-flex min-w-0 items-center justify-center gap-1 rounded-control px-2 font-[650] text-accent-ink"
              >
                <Undo2 aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="min-w-0 truncate" dir="auto">
                  Undo “{history.note}”
                </span>
              </button>
            )}
          </div>
        }
      />
    </FieldRow>
  );
}
