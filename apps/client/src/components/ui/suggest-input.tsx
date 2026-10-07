import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A typed field with a list of suggestions under it (THEME "Suggestion list": white, a line
 * border, a 10 px radius and a soft shadow; rows of mono number + name, the highlighted row
 * on accent-tint, a "+ New …" row in accent-ink). WAI-ARIA combobox with a listbox: ↑ ↓ move
 * the highlight, Enter picks it, Escape closes the list (and nothing else). With nothing
 * highlighted, Enter is left alone so a surrounding form can still submit.
 *
 * The page owns the value and the suggestions; this owns only the highlight and whether the
 * list is open.
 */
export function SuggestInput<T>({
  label,
  hideLabel = false,
  value,
  onChange,
  suggestions,
  render,
  onPick,
  createRow,
  inputMode = 'text',
  placeholder,
}: {
  label: string;
  /** Keep the label for assistive tech only (a grid cell already has a visible header). */
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  suggestions: readonly T[];
  render: (item: T) => ReactNode;
  onPick: (item: T) => void;
  createRow?: { label: string; onPick: () => void };
  inputMode?: 'numeric' | 'text';
  placeholder?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rows = suggestions.length + (createRow ? 1 : 0);
  const shown = open && rows > 0;

  function pick(index: number) {
    if (index < suggestions.length) {
      const item = suggestions[index];
      if (item !== undefined) onPick(item);
    } else {
      createRow?.onPick();
    }
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (rows === 0) return;
      e.preventDefault();
      if (!open) {
        // Reopening: the highlight starts on the first row (ArrowUp: the last).
        setOpen(true);
        setActive(e.key === 'ArrowDown' ? 0 : rows - 1);
        return;
      }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a === -1 ? (step === 1 ? 0 : rows - 1) : (a + step + rows) % rows));
    } else if (e.key === 'Enter' && shown && active >= 0) {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape' && shown) {
      // The list closes; an enclosing dialog stays open.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  }

  const row = 'flex min-h-12 w-full cursor-pointer items-center gap-2 px-3 text-start text-sm';
  return (
    <div className="relative">
      <label
        htmlFor={`${id}-input`}
        className={cn('text-sm font-semibold', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <input
        id={`${id}-input`}
        type="text"
        role="combobox"
        aria-expanded={shown}
        aria-controls={shown ? `${id}-list` : undefined}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? `${id}-row-${active}` : undefined}
        autoComplete="off"
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        dir="auto"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          'min-h-12 w-full rounded-control border border-control-border bg-surface px-3 text-ink focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-tint)]',
          inputMode === 'numeric' && 'num',
          !hideLabel && 'mt-1.5',
        )}
      />
      {shown && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 z-30 mt-1 overflow-hidden rounded-[10px] border border-line bg-surface shadow-[0_12px_30px_-12px_rgb(20_24_32/0.35)]"
        >
          {suggestions.map((item, i) => (
            <li
              key={i}
              id={`${id}-row-${i}`}
              role="option"
              aria-selected={active === i}
              // Keep focus on the input (its blur would close the list before the click
              // lands); the pick itself is the click, so a tap, a mouse and a screen
              // reader's activation all take one path and nothing fires twice.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
              className={cn(row, 'text-ink', active === i && 'bg-accent-tint')}
            >
              {render(item)}
            </li>
          ))}
          {createRow && (
            <li
              id={`${id}-row-${suggestions.length}`}
              role="option"
              aria-selected={active === suggestions.length}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(suggestions.length)}
              className={cn(
                row,
                'font-semibold text-accent-ink',
                active === suggestions.length && 'bg-accent-tint',
              )}
            >
              {createRow.label}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
