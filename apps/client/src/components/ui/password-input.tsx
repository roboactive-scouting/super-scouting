import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';

/**
 * The text input with an eye button at the end (THEME "Password field"): a 40 px button (48 px hit
 * area, through an invisible ::after) in `--muted`, and `--accent-ink` while the text is showing. `autoComplete` is the caller's;
 * the field never capitalises or spell-checks.
 */
export function PasswordInput({
  className,
  disabled,
  ...props
}: Omit<ComponentProps<'input'>, 'type' | 'size'>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input
        autoCapitalize="none"
        spellCheck={false}
        className={cn('pe-12', className)}
        disabled={disabled}
        {...props}
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
  );
}
