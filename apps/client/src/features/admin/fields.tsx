import { useId, type ReactNode } from 'react';
import type { Role } from '@frc/shared';
import { FIELD, SECONDARY_BUTTON } from '@/components/buttonStyles';
import { generatePassword } from './password';

export const ROLE_LABEL: Record<Role, string> = {
  scouter: 'Scouter',
  lead: 'Lead',
  admin: 'Admin',
};

const ROLES: readonly Role[] = ['scouter', 'lead', 'admin'];

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
      <label htmlFor={id} className="block text-sm font-medium">
        {props.label}
      </label>
      <input
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
        className={`${FIELD} mt-1`}
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
      <label htmlFor={id} className="block text-sm font-medium">
        {props.label}
      </label>
      <div className="tap-row mt-1 flex items-center">
        <input
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
          className={`${FIELD} min-w-0 flex-1 font-mono`}
          onChange={(e) => props.onChange(e.target.value)}
        />
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={() => props.onChange(generatePassword())}
        >
          Generate
        </button>
      </div>
      <p id={hintId} className="mt-1 text-sm text-[var(--text-muted)]">
        {props.hint}
      </p>
    </div>
  );
}

export function Checkbox(props: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="tap-target mt-2 flex items-center gap-3">
      <input
        type="checkbox"
        checked={props.checked}
        className="size-5 shrink-0 accent-[var(--text)]"
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>{props.label}</span>
    </label>
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
      <label htmlFor={id} className="block text-sm font-medium">
        {props.label}
      </label>
      <select
        id={id}
        value={props.value}
        disabled={props.disabled}
        aria-describedby={props.hint ? hintId : undefined}
        className={`${FIELD} mt-1`}
        onChange={(e) => props.onChange(e.target.value as Role)}
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </select>
      {props.hint && (
        <p id={hintId} className="mt-1 text-sm text-[var(--text-muted)]">
          {props.hint}
        </p>
      )}
    </div>
  );
}

/** The one error line beside a form: announced, bordered, never a raw code (17.8). */
export function FormError({ id, message }: { id?: string; message: string | null }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      dir="auto"
      className="mt-4 rounded-lg border-2 border-[var(--danger)] p-3 text-sm"
    >
      {message}
    </p>
  );
}
