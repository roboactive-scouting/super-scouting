import { useId, type ReactNode } from 'react';
import { Logo } from '@/components/Logo';

/**
 * The frame shared by the sign-in and change-password screens: the mark on its plate
 * (SPEC-FINAL 17.4), then one centred card. One job per screen (17.9), no motion.
 */
export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* The mark alone: at this size the wordmark is unreadable (SPEC-FINAL 17.8). */}
        <div className="mb-6 flex justify-center">
          <Logo variant="mark" />
        </div>
        <section
          aria-labelledby="auth-title"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        >
          <h1 id="auth-title" className="text-xl font-semibold">
            {title}
          </h1>
          {children}
        </section>
      </div>
    </main>
  );
}

/** A labelled input at the 48 px floor (SPEC-FINAL 17.7). The hint sits outside the label. */
export function AuthField(props: {
  label: ReactNode;
  type: 'text' | 'password';
  value: string;
  autoComplete: string;
  onChange: (value: string) => void;
  hint?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="mt-4">
      <label htmlFor={id} className="block text-sm font-medium">
        {props.label}
      </label>
      <input
        id={id}
        type={props.type}
        value={props.value}
        autoComplete={props.autoComplete}
        autoFocus={props.autoFocus}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        dir="auto"
        aria-describedby={props.hint ? hintId : undefined}
        className="tap-target mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3"
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && (
        <p id={hintId} className="mt-1 text-sm text-[var(--text-muted)]">
          {props.hint}
        </p>
      )}
    </div>
  );
}

/** The one error line: in view, announced, and never a raw code (SPEC-FINAL 17.8). */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" dir="auto" className="mt-4 rounded-lg border-2 border-[var(--danger)] p-3">
      {message}
    </p>
  );
}

export function AuthSubmit({
  busy,
  label,
  busyLabel,
}: {
  busy: boolean;
  label: string;
  busyLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="tap-target mt-6 w-full rounded-lg bg-[var(--brand-plate)] font-semibold text-[var(--brand)] disabled:opacity-50"
    >
      {busy ? busyLabel : label}
    </button>
  );
}
