import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';

/** The quiet line under a sign-in field that holds a Hebrew letter (Phase 1 H side task 1). */
export const HEBREW_KEYBOARD_LINE = 'Your keyboard is typing Hebrew.';

/** Any Hebrew letter, final forms included (U+05D0–U+05EA, and the presentation forms). */
const HEBREW_LETTER = /[א-תיִ-ﭏ]/;

export function hasHebrew(value: string): boolean {
  return HEBREW_LETTER.test(value);
}

/**
 * Usernames and passwords are Latin credentials: their fields are always left-to-right with
 * left-aligned text, even when the keyboard types Hebrew (Phase 1 H side task 1). Spread these
 * onto a plain `Input`; `PasswordInput` applies them itself.
 */
export const CREDENTIAL_DIR = 'ltr' as const;
export const credentialClass = 'text-left';

/**
 * "Your keyboard is typing Hebrew." in `--muted` while `value` holds a Hebrew letter, else
 * nothing. A hint, never an error: it does not touch the value, the field's validity or any alert.
 * Give the field `aria-describedby={id}` while it shows (see `keyboardHintId`).
 */
export function KeyboardHint({
  value,
  id,
  className,
}: {
  value: string;
  id?: string;
  className?: string;
}) {
  if (!hasHebrew(value)) return null;
  return (
    <p id={id} className={cn('mt-1.5 text-[0.8125rem] text-muted', className)}>
      {HEBREW_KEYBOARD_LINE}
    </p>
  );
}

/** `describedBy` with the hint's id added while the hint shows; `undefined` when empty. */
export function withKeyboardHint(
  value: string,
  hintId: string,
  describedBy?: string,
): string | undefined {
  const ids = [describedBy, hasHebrew(value) ? hintId : undefined].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

/**
 * The text input with an eye button at the end (THEME "Password field"): a 40 px button (48 px hit
 * area, through an invisible ::after) in `--muted`, and `--accent-ink` while the text is showing. `autoComplete` is the caller's;
 * the field never capitalises or spell-checks. Always left-to-right (a caller's `dir` is ignored),
 * with the keyboard hint under it while the value holds a Hebrew letter.
 */
export function PasswordInput({
  className,
  disabled,
  value,
  onChange,
  'aria-describedby': describedBy,
  dir: _dir,
  ...props
}: Omit<ComponentProps<'input'>, 'type' | 'size'>) {
  const [shown, setShown] = useState(false);
  // An uncontrolled field (`defaultValue`) still needs its text to decide on the hint.
  const [typed, setTyped] = useState(
    typeof props.defaultValue === 'string' ? props.defaultValue : '',
  );
  const hintId = `${useId()}-keyboard`;
  const text = typeof value === 'string' ? value : typed;
  return (
    <div>
      <div className="relative" dir={CREDENTIAL_DIR}>
        <Input
          autoCapitalize="none"
          spellCheck={false}
          className={cn('pe-12', credentialClass, className)}
          disabled={disabled}
          {...props}
          value={value}
          onChange={(e) => {
            setTyped(e.target.value);
            onChange?.(e);
          }}
          aria-describedby={withKeyboardHint(text, hintId, describedBy)}
          dir={CREDENTIAL_DIR}
          type={shown ? 'text' : 'password'}
        />
        <button
          type="button"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          disabled={disabled}
          onClick={() => setShown((s) => !s)}
          className={cn(
            "absolute end-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-control after:absolute after:-inset-1 after:content-[''] disabled:opacity-50",
            shown ? 'text-accent-ink' : 'text-muted',
          )}
        >
          {shown ? (
            <EyeOff aria-hidden="true" className="size-[18px]" />
          ) : (
            <Eye aria-hidden="true" className="size-[18px]" />
          )}
        </button>
      </div>
      <KeyboardHint value={text} id={hintId} />
    </div>
  );
}
