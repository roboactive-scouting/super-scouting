import { useId, type ReactNode } from 'react';
import type { Role } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Notice } from '@/components/ui/notice';
import { generatePassword } from './password';

export const ROLE_LABEL: Record<Role, string> = {
  scouter: 'Scouter',
  lead: 'Lead',
  admin: 'Admin',
};

const ROLES: readonly Role[] = ['scouter', 'lead', 'admin'];

function Hint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-sm text-text-muted">
      {children}
    </p>
  );
}

/** A labelled field at the 48 px floor; `dir="auto"` because names may be Hebrew (17.1). */
export function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  invalid?: boolean;
  errorId?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = [props.hint ? hintId : null, props.invalid ? props.errorId : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="mt-4">
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        id={id}
        type="text"
        value={props.value}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        dir="auto"
        aria-invalid={props.invalid || undefined}
        aria-describedby={describedBy || undefined}
        className="mt-1.5"
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <Hint id={hintId}>{props.hint}</Hint>}
    </div>
  );
}

/**
 * A password the admin sets for someone else: shown in clear so it can be handed over,
 * with a Generate button. It lives in the caller's component state and nowhere else.
 */
export function PasswordField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
  invalid?: boolean;
  errorId?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = [hintId, props.invalid ? props.errorId : null].filter(Boolean).join(' ');
  return (
    <div className="mt-4">
      <Label htmlFor={id}>{props.label}</Label>
      <div className="tap-row mt-1.5 flex items-center">
        <Input
          id={id}
          type="text"
          value={props.value}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          dir="auto"
          aria-invalid={props.invalid || undefined}
          aria-describedby={describedBy}
          className="flex-1 font-mono"
          onChange={(e) => props.onChange(e.target.value)}
        />
        <Button onClick={() => props.onChange(generatePassword())}>Generate</Button>
      </div>
      <Hint id={hintId}>{props.hint}</Hint>
    </div>
  );
}

export function Checkbox(props: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="tap-target mt-2 flex cursor-pointer items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        className="size-5 shrink-0 cursor-pointer accent-[var(--text)] disabled:cursor-not-allowed"
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}

/**
 * A whole-number field (team numbers, match numbers, bulk counts — task 1.21), kept free
 * text (`type="number"`) so an in-progress "" or a leading zero is never coerced before the
 * caller validates it with the shared schema.
 */
export function NumberField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  invalid?: boolean;
  errorId?: string;
  /** A native `max` for the browser's own spinner; the real ceiling is the zod schema. */
  max?: number;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = [props.hint ? hintId : null, props.invalid ? props.errorId : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="mt-4">
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={props.max}
        value={props.value}
        aria-invalid={props.invalid || undefined}
        aria-describedby={describedBy || undefined}
        className="mt-1.5 tabular-nums"
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <Hint id={hintId}>{props.hint}</Hint>}
    </div>
  );
}

export function RoleSelect(props: {
  label: string;
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="mt-4">
      <Label htmlFor={id}>{props.label}</Label>
      <NativeSelect
        id={id}
        value={props.value}
        disabled={props.disabled}
        aria-describedby={props.hint ? hintId : undefined}
        wrapperClassName="mt-1.5"
        onChange={(e) => props.onChange(e.target.value as Role)}
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </NativeSelect>
      {props.hint && <Hint id={hintId}>{props.hint}</Hint>}
    </div>
  );
}

/** The one error line beside a form: announced, edged in danger, never a raw code (17.8). */
export function FormError({ id, message }: { id?: string; message: string | null }) {
  if (!message) return null;
  return (
    <Notice id={id} role="alert" tone="danger" className="mt-4">
      {message}
    </Notice>
  );
}
