import { useId, type ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';

/**
 * The frame shared by the sign-in and change-password screens. One job per screen
 * (SPEC-FINAL 17.9). On a phone: the mark, then the form. On a computer, the lockup sits on
 * its near-black plate beside the form (17.4) — brand, not a hero: no tagline, no copy.
 */
export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <div
        aria-hidden="true"
        className="brand-plate hidden flex-col items-center justify-center gap-4 border-e border-border lg:flex"
      >
        <Logo size="lg" />
      </div>
      <div className="flex flex-col items-center justify-center px-4 py-10">
        <div className="enter-rise w-full max-w-sm">
          {/* The mark alone: at this size the wordmark is unreadable (SPEC-FINAL 17.8). */}
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo variant="mark" />
          </div>
          <section aria-labelledby="auth-title">
            <h1 id="auth-title" className="text-2xl font-semibold tracking-tight">
              {title}
            </h1>
            {children}
          </section>
        </div>
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
    <div className="mt-5">
      <Label htmlFor={id}>{props.label}</Label>
      <Input
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
        className="mt-1.5"
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && (
        <p id={hintId} className="mt-1.5 text-sm text-text-muted">
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
    <Notice role="alert" tone="danger" className="mt-5">
      {message}
    </Notice>
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
    <Button type="submit" variant="primary" size="block" disabled={busy} className="mt-6">
      {busy ? busyLabel : label}
    </Button>
  );
}
