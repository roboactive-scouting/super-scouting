import { Loader2 } from 'lucide-react';
import { useId, type ReactNode, type Ref } from 'react';
import { clientConfig } from '@/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorLine } from '@/components/ui/notice';
import { PasswordInput } from '@/components/ui/password-input';
import { cn } from '@/lib/utils';

const LOGO = '/brand/logo.png';

/**
 * The frame shared by the sign-in and change-password screens (04-login / 10-password finals).
 * Desktop: a 44 % `--rail` plate with the full lockup (about 300 px) beside the form alone on
 * `--bg`, 380 px wide, with the version at the foot. Phone: a `--rail` band with the lockup
 * (120 px; 84 px when `compact`, i.e. a notice shows), then the form, the version at the foot.
 * Brand, not a hero: no tagline, no copy.
 */
export function AuthFrame({
  title,
  compact = false,
  children,
}: {
  title: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[44%_1fr]">
      <div aria-hidden="true" className="hidden place-items-center bg-rail lg:grid">
        <img src={LOGO} alt="" className="w-[300px]" />
      </div>
      <div
        className={cn(
          'grid place-items-center bg-rail lg:hidden',
          compact ? 'pb-4 pt-3.5' : 'pb-[26px] pt-[22px]',
        )}
      >
        <img src={LOGO} alt="ROBACTIVE 2096" className={compact ? 'w-[84px]' : 'w-[120px]'} />
      </div>
      <div
        className={cn(
          'relative flex flex-1 flex-col items-center bg-bg px-5 pb-5 lg:justify-center lg:py-10',
          compact ? 'pt-[18px]' : 'pt-6',
        )}
      >
        <div className="motion-safe:animate-rise-in w-full max-w-[380px]">
          <section aria-labelledby="auth-title">
            <h1
              id="auth-title"
              className="text-[1.75rem] font-[750] leading-tight tracking-[-0.02em]"
            >
              {title}
            </h1>
            {children}
          </section>
        </div>
        <p className="mt-auto pt-6 text-center text-xs text-muted lg:absolute lg:inset-x-0 lg:bottom-6 lg:mt-0 lg:pt-0">
          version <span className="num text-[0.71875rem]">{clientConfig().appVersion}</span>
        </p>
      </div>
    </main>
  );
}

/** A labelled input, 52 px tall. Password fields carry the show/hide eye. The hint sits outside the label. */
export function AuthField(props: {
  label: ReactNode;
  type: 'text' | 'password';
  value: string;
  autoComplete: string;
  onChange: (value: string) => void;
  hint?: string;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /** Sits under the field and its hint (the live checks). */
  children?: ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const common = {
    id,
    ref: props.inputRef,
    value: props.value,
    autoComplete: props.autoComplete,
    autoFocus: props.autoFocus,
    autoCapitalize: 'none',
    autoCorrect: 'off',
    spellCheck: false,
    dir: 'auto',
    'aria-describedby': props.hint ? hintId : undefined,
    className: 'min-h-[52px]',
    onChange: (e: { target: { value: string } }) => props.onChange(e.target.value),
  } as const;
  return (
    <div className="mt-[18px]">
      <Label htmlFor={id} className="mb-1.5 text-[0.84375rem] font-semibold text-ink">
        {props.label}
      </Label>
      {props.type === 'password' ? <PasswordInput {...common} /> : <Input {...common} />}
      {props.hint && (
        <p id={hintId} className="mt-1.5 text-[0.8125rem] text-muted">
          {props.hint}
        </p>
      )}
      {props.children}
    </div>
  );
}

/** The one error line: in view, announced, and never a raw code (SPEC-FINAL 17.8). */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return <ErrorLine className="mt-4">{message}</ErrorLine>;
}

export function AuthSubmit({
  busy,
  label,
  busyLabel,
  disabled = false,
}: {
  busy: boolean;
  label: string;
  busyLabel: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="submit"
      variant="primary"
      size="block"
      busy={busy}
      disabled={disabled}
      className="mt-[22px]"
    >
      {busy ? (
        <>
          <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
          {busyLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}
